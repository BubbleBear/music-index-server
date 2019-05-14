import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import moment from 'moment';
import archiver from 'archiver';
import del from 'del';

import { Gatherer, adapters } from './lib/music-info-gatherer/src';
import { SearchReturn } from './lib/music-info-gatherer/src/adapters/abstract';
import { normalizeString } from './utils';
import { Config } from './config';
import redis from './connection/redis';
import mongo from './connection/mongo';
import limitWrapper from './dist-con-limit';

const searchLimit = limitWrapper(10, 'search');

const screenshotLimit = limitWrapper(10, 'screenshot');

// this is also referred in crawler script
const REDIS_QQ_CRALWER_STATUS = 'qq.music.crawler.status';

const REDIS_QQ_CRALWER_SET = 'qq.music.crawler.company';

const REDIS_QQ_STATISTICS_SET = 'qq.music.statistics.date';

const REDIS_DOWNLOADING_STATUS_SET = 'downloading.file';

const REDIS_CACHED_FILE_MAP = 'cached.file';

const deprecated: boolean = true;

type ThenInfer<T> = T extends Promise<infer U> ? U : T;

export default class Service {
    config: Config;

    private db!: ReturnType<ThenInfer<typeof mongo>['db']>;

    // private get gatherer() {
    //     return new Gatherer();
    // }
    private gatherer = new Gatherer();

    constructor() {
        this.config = new Config();
    }

    async sync() {
        if (this.db) {
            return;
        }

        const client = await mongo;
        this.db = client.db('qq_music_crawler');
    }

    async updateCompany(companyId: number) {
        await this.sync();

        const retryCount = 5;
        let retry = retryCount;

        while (retry--) {
            try {
                const crawler = require('../scripts/qq_music_crawler');
                await crawler.getDB(await mongo);
                await crawler.getCompany(companyId);

                break;
            } catch (err) {
                global.error({
                    module: 'scripts/qq_music_crawler',
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    desc: 'company error',
                    companyId: companyId,
                    error: {
                        message: err.message,
                        stack: err.stack,
                    },
                    errorCount: retryCount - retry,
                });
            }
        }
    }

    async findCompanies(companyIds: number[], projection: any = { _id: 0 }) {
        await this.sync();

        const collection = this.db.collection('company');

        const companies = await collection.find({
            company_id: {
                $in: companyIds.map(v => Number(v)),
            },
        })
        .project(projection)
        .toArray();

        return companies;        
    }

    async findAlbums(albumIds: number[], projection: any = { _id: 0 }) {
        await this.sync();

        const collection = this.db.collection('album');

        const albums = await collection.find({
            album_id: {
                $in: albumIds.map(v => Number(v)),
            },
        })
        .project(projection)
        .toArray();

        return albums;
    }

    async findEmbededAlbums(companyIds: number[]) {
        await this.sync();

        const companies = await this.findCompanies(companyIds);

        const albumIds = companies.reduce((acc: number[], company) => {
            acc = acc.concat(
                company.albumList.map(
                    (album: any) => parseInt(album.album_id),
                ),
            );

            return acc;
        }, []);

        const albums = await this.findAlbums(albumIds);

        const albumMap = albums.reduce((acc, album) => {
            acc[album.album_id] = album;
            return acc;
        }, {});

        companies.forEach(company => {
            company.albumList = company.albumList.map((album: any) => albumMap[album.album_id]);
        });

        return companies;
    }

    async cleanseCrawlerCache() {
        return await redis.del(REDIS_QQ_CRALWER_SET);
    }

    async createCompanyStatistics(assignedDate?: number | string) {
        await this.sync();

        const collection = await this.prepareCollection('company_statistics');

        const analysed = await collection.findOne({ createdAt: moment(assignedDate).unix() });

        if (analysed !== null) {
            return true;
        }

        const companyCollection = this.db.collection('company');

        const companyCursor = companyCollection.find({});

        const bulk = [];

        const date1 = moment(assignedDate).format('YYYY-MM-DD');

        while (await companyCursor.hasNext()) {
            const company = await companyCursor.next();
            const albumList = company.albumList || [];

            const albums = await this.findAlbums(
                albumList.map((album: any) => album.album_id),
                { _id: 0, total: 1, company: 1 },
            );

            bulk.push({
                company_id: company.company_id,
                company_name: company.name,
                album_count: albums.length,
                song_count: albums.reduce((acc, cur) => {
                    acc += cur.total;
                    return acc;
                }, 0),
                createdAt: moment(assignedDate).unix(),
            });
        }

        await collection.bulkWrite(
            bulk.map((op: any) => ({
                insertOne: op,
            })),
        );

        const date2 = moment(assignedDate).format('YYYY-MM-DD');

        await redis.sadd(REDIS_QQ_STATISTICS_SET, date1, date2);

        return true;
    }

    async findCompanyStatistics(conditions: any = {}, projection: any = { _id: 0 }) {
        await this.sync();

        const collection = this.db.collection('company_statistics');

        const statistics = await collection
            .find(conditions)
            .project(projection)
            .toArray();

        return statistics;
    }

    async getStatisticsDates() {
        await this.sync();

        const dates = await redis.smembers(REDIS_QQ_STATISTICS_SET);

        return dates;
    }

    async crawl(parallelSize: number = 5, companyQuant: number = 10) {
        const crawler = cp.spawn(
            'node',
            [ `${path.join(__dirname, '../scripts/qq_music_crawler.js')}`, parallelSize.toString(), companyQuant.toString() ],
        );
    
        crawler.stdout.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        });
    
        crawler.stderr.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        });
    
        crawler.on('close', async (code) => {
            if (code == 0) {
                await this.createCompanyStatistics();
            }
        });

        return;
    }

    async cancelCrawling() {
        try {
            await redis.del(REDIS_QQ_CRALWER_STATUS);

            return true;
        } catch (e) {
            return false;
        }
    }

    public async searchTracks(options: {
        songName: string,
        artistName: string,
        platform?: string,
        albumName?: number | string,
        companyId: number | string,
    }[]) {
        return await Promise.all(
            options.map((option) => {
                return searchLimit(async () => {
                    const status = 
                        option.companyId
                        ? await redis.sismember(REDIS_DOWNLOADING_STATUS_SET, option.companyId.toString())
                        : 0;

                    return {
                        name: option.songName,
                        artist: option.artistName,
                        data: status ? await this.searchTrack(option) : {},
                    };
                });
            })
        );
    }

    public async searchTrack({ songName, artistName, platform, albumName, companyId }: {
            songName: string,
            artistName: string,
            platform?: string,
            albumName?: number | string,
            companyId?: number | string,
        }) {
        await this.sync();

        if (deprecated === false) {
            const cachedTrack = await this.findCachedTracks(songName, artistName);
        }

        const results = await this.gatherer.search(songName, artistName);

        const bestMatches = (Object.keys(results) as Array<keyof typeof results>).reduce((acc, cur) => {
            if (results[cur] !== null) {
                acc[cur] = results[cur]!.filter((v) => {

                    return normalizeString(v.name).includes(normalizeString(songName))
                        && (
                            normalizeString(v.name).includes(normalizeString(artistName))
                            || v.artists.reduce((acc: boolean, cur) => {

                                return acc || normalizeString(cur.name).includes(normalizeString(artistName));
                            }, false)
                            || albumName && v.album.name && normalizeString(v.album.name).includes(normalizeString(`${albumName}`))
                        );
                })[0] || {};
            } else {
                acc[cur] = null;
            }

            return acc;
        }, {} as { [prop in keyof adapters]?: SearchReturn | null });

        if (deprecated === false) {
            await Promise.all(
                (Object.keys(bestMatches) as Array<keyof adapters>)
                    .map(async (k) => {
                        if (bestMatches[k]) {
                            await this.cacheTrack(songName, artistName, k, bestMatches[k]!);
                        }
                    }
                )
            );
        }

        console.log(songName, '#########', artistName, '#########', albumName);

        return bestMatches;
    }

    public async findCachedTracks(songName: string, artistName: string) {
        const collection = await this.prepareCollection('track');

        const cached = await collection.find({
            alias: songName,
            'artists.name': artistName,
        }).toArray();

        return cached;
    }

    public async cacheTrack(alias: string, artistName: string, channel: string, track: SearchReturn) {
        const collection = await this.prepareCollection('track');

        const result = await collection.findOneAndUpdate(
            {
                alias,
                'artists.name': artistName,
                channel,
            },
            {
                $set: Object.assign({
                    channel,
                    createdAt: Date.now(),
                }, track),
                $setOnInsert: {
                    alias: [],
                },
            },
            {
                upsert: true,
                returnOriginal: false,
            }
        );

        await collection.updateOne(
            {
                _id: result.value._id,
            },
            {
                $addToSet: {
                    alias,
                },
            }
        );

        return result;
    }

    protected async prepareCollection(collectionName: string) {
        await this.sync();

        try {
            await this.db.createCollection(collectionName);
        } catch (e) {}

        const collection = this.db.collection(collectionName);

        const indexMap: { [prop: string]: Array<any> } = {
            'track': [
                'channel',
                'artists.name',
                [ 'name', 'artists.name' ],
            ],
            'company_statistics': [
                'createdAt',
                [ 'company_id', 'createdAt' ],
            ],
        };

        await Promise.all(
            indexMap[collectionName].map(
                async (index) => {
                    (await collection.indexExists('channel')) || (await this.db.createIndex('track', 'channel'));
                }
            )
        );

        return collection;
    }

    public async getDownloadingStatus(redisKey: string) {
        const downloading = await redis.sismember(REDIS_DOWNLOADING_STATUS_SET, redisKey);

        return Boolean(downloading);
    }

    public async markDownloading(redisKey: string) {
        await redis.sadd(REDIS_DOWNLOADING_STATUS_SET, redisKey);
    }

    public async unmarkDownloading(redisKey: string) {
        await redis.srem(REDIS_DOWNLOADING_STATUS_SET, redisKey);
    }

    public async cacheCSV(content: string, filepath: string, redisKey: string, expire: number = 76800) {
        const ws = fs.createWriteStream(filepath);
        ws.write('\ufeff');
        ws.write(content);
        ws.end();
    }

    public async listDownloadingFiles() {
        return await redis.smembers(REDIS_DOWNLOADING_STATUS_SET);
    }

    public async cacheFile(redisKey: string, filepath: string) {
        const archivePath = path.join(filepath, '../', `${redisKey}.zip`);

        const ws = fs.createWriteStream(archivePath);

        const archive = archiver('zip').on('error', (e) => {
            global.error({
                module: 'main',
                method: 'getTracks#archiving',
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                error: {
                    message: e.message,
                    stack: e.stack,
                },
            });
        });

        archive.pipe(ws);

        archive.directory(filepath, false);

        archive.finalize();

        await new Promise((resolve, reject) => {
            ws.on('close', () => {
                resolve();
            });
        });

        await redis.hset(REDIS_CACHED_FILE_MAP, redisKey, archivePath);

        await del(filepath);
    }

    public async listCachedFiles() {
        return await redis.hkeys(REDIS_CACHED_FILE_MAP);
    }

    public async deleteCachedFile(redisKey: string) {
        try {
            const filepath = await redis.hget(REDIS_CACHED_FILE_MAP, redisKey);
            filepath && await del(filepath);
        } catch (e) {
            global.error({
                module: 'main',
                method: 'deleteCachedFile',
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                error: {
                    message: e.message,
                    stack: e.stack,
                },
            });
        }

        await redis.hdel(REDIS_CACHED_FILE_MAP, redisKey);
    }

    public async openFileStream(redisKey: string) {
        const filepath = await redis.hget(REDIS_CACHED_FILE_MAP, redisKey);

        return fs.createReadStream(filepath!);
    }

    public async screenshot(url: string, path: string, channel: string) {
        await this.gatherer.screenshot(url, path, channel);

        console.log('screenshot: ', path, '#########', channel);
    }

    public async batchScreenshot(options: {
        url: string, path: string, channel: string
    }[]) {
        await Promise.all(
            options.map((option) => {
                return screenshotLimit(async () => {
                    return await this.screenshot(option.url, option.path, option.channel);
                });
            })
        );
    }

    public async restartSSClients(attachTo: any) {
        console.log(attachTo.SSClients);

        if (attachTo.SSClients) {
            (attachTo as cp.ChildProcess).kill('SIGTERM');

            await new Promise((resolve) => {
                attachTo.SSClients.on('close', () => {
                    console.log('termed')
                    resolve();
                });
            });
        }

        const ssp = cp.spawn(
            'node',
            [ `${path.join(__dirname, '../scripts/start_ss_clients.js')}` ],
        );
    
        ssp.stdout.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        });
    
        ssp.stderr.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        });

        attachTo.SSClients = ssp;

        return;
    }
}

if (require.main === module) {
    !async function() {
        const service = new Service();
        await service.sync();

        // const a: any = {};

        // const x = await service.restartSSClients(a);

        // await new Promise((resolve) => {
        //     setTimeout(async () => {
        //         await service.restartSSClients(a);
        //     }, 10000);
        // });

        // console.log(x);

        await service.batchScreenshot([
            {
                url: 'https://y.qq.com/n/yqq/song/002Iaday3kk555.html',
                path: './y.png',
                channel: 'qq',
            }
        ]);
    }();
}
