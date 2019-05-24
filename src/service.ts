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
import plimit from 'p-limit';

// const searchLimit = limitWrapper(10, 'search');

// const screenshotLimit = limitWrapper(10, 'screenshot');

const searchLimit = plimit(5);

const screenshotLimit = plimit(5);

// this is also referred in crawler script
const REDIS_QQ_CRALWER_STATUS = 'qq.music:crawler:status';

const REDIS_QQ_CRALWER_SET = 'qq.music:crawler:company';

const REDIS_QQ_STATISTICS_SET = 'qq.music:statistics.date';

const REDIS_DOWNLOADING_STATUS_SET = 'file:downloading';

const REDIS_CACHED_FILE_MAP = 'file:cached';

const REDIS_FILE_TYPE_MAP = 'file:type';

enum FileType {
    'companyTracks',
    'customScreenshots',
};

const deprecated: boolean = true;

type ThenInfer<T> = T extends Promise<infer U> ? U : T;

type IndexiableObject<T> = { [prop: string]: T };

export default class Service {
    config: Config;

    private db!: ReturnType<ThenInfer<typeof mongo>['db']>;

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

    bulkBuilder(documents: IndexiableObject<any>[], queryFields: IndexiableObject<string>, updateFields: IndexiableObject<string>, action: string) {
        const bulk = documents.map((document) => {
            const query = Object.keys(queryFields).reduce((acc, cur) => {
                acc[queryFields[cur]] = document[cur];

                return acc;
            }, {} as any);

            const update = Object.keys(updateFields).reduce((acc, cur) => {
                acc[updateFields[cur]] = document[cur];

                return acc;
            }, {} as any);

            return {
                [action]: {
                    filter: query,
                    update: {
                        $set: update,
                    },
                },
            };
        });

        return bulk;
    }

    async batchUpdate(collectionName: string, documents: IndexiableObject<any>[], queryFields: IndexiableObject<string>, updateFields: IndexiableObject<string>, action: string) {
        await this.sync();

        const collection = this.db.collection(collectionName);
        const bulk = this.bulkBuilder(documents, queryFields, updateFields, action);

        await collection.bulkWrite(bulk);
    }

    async fetchCompany(companyId: number) {
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
                    module: 'service',
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
                geo_mark: company.geo_mark,
                createdAt: moment(assignedDate).unix(),
            });
        }

        await collection.bulkWrite(
            bulk.map((doc: any) => ({
                insertOne: doc,
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

    public async batchSearchTrack(options: {
        songName: string,
        artistName: string,
        channel?: string,
        albumName?: number | string,
        taskGroup: number | string,
    }[]) {
        return await Promise.all(
            options.map((option) => {
                return searchLimit(async () => {
                    const status = 
                        option.taskGroup
                        ? await this.getDownloadingStatus(option.taskGroup.toString())
                        : false;

                    return {
                        name: option.songName,
                        artist: option.artistName,
                        data: status ? await this.searchTrack(option) : {},
                    };
                });
            })
        );
    }

    public async searchTrack({ songName, artistName, albumName, companyId }: {
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

                    // return normalizeString(v.name).includes(normalizeString(songName))
                    //     && (
                    //         normalizeString(v.name).includes(normalizeString(artistName))
                    //         || v.artists.reduce((acc: boolean, cur) => {

                    //             return acc || normalizeString(cur.name).includes(normalizeString(artistName));
                    //         }, false)
                    //         || albumName && v.album.name && normalizeString(v.album.name).includes(normalizeString(`${albumName}`))
                    //     );
                    return normalizeString(v.name) == normalizeString(songName)
                        && (
                            v.artists.reduce((acc: boolean, cur) => {

                                return acc || normalizeString(cur.name) == normalizeString(artistName);
                            }, false)
                            || albumName && v.album.name && normalizeString(v.album.name) == normalizeString(`${albumName}`)
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

        global.info({
            module: 'main',
            method: 'searchTrack',
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
            songName,
            artistName,
            albumName,
            companyId,
        })
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

    public async setFileType(redisKey: string, type: keyof typeof FileType) {
        await redis.hset(REDIS_FILE_TYPE_MAP, redisKey, FileType[type]);
    }

    public async unsetFileType(redisKey: string) {
        await redis.hdel(REDIS_FILE_TYPE_MAP, redisKey);
    }

    public async batchGetFileType(redisKeys: string[]) {
        if (redisKeys.length === 0) {
            return {};
        }

        const types = await redis.hmget(REDIS_FILE_TYPE_MAP, ...redisKeys);
        const typeMap = redisKeys.reduce((map, key, i) => {
            map[key] = types[i];

            return map;
        }, {} as { [prop: string]: string });

        return typeMap;
    }

    public async cacheCSV(content: string, filepath: string, redisKey: string, expire: number = 76800) {
        const ws = fs.createWriteStream(filepath);
        ws.write('\ufeff');
        ws.write(content);
        ws.end();
    }

    public async listDownloadingFiles() {
        const companyIds: string[] = await redis.smembers(REDIS_DOWNLOADING_STATUS_SET);

        return companyIds;
    }

    public async cacheFile(redisKey: string, filepath: string) {
        const archivePath = path.join(filepath, '../', `${redisKey}.zip`);

        const ws = fs.createWriteStream(archivePath);

        const archive = archiver('zip').on('error', (e) => {
            global.error({
                module: 'service',
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
        const companyIds: string[] = await redis.hkeys(REDIS_CACHED_FILE_MAP);

        return companyIds;
    }

    public async deleteCachedFile(redisKey: string) {
        try {
            const filepath = await this.getFilePath(redisKey);
            filepath && await del(filepath);
        } catch (e) {
            global.error({
                module: 'service',
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

    public async getFilePath(redisKey: string) {
        const filepath = await redis.hget(REDIS_CACHED_FILE_MAP, redisKey);

        return filepath;
    }

    public async openFileStream(filepath: string) {
        return fs.createReadStream(filepath);
    }

    public async screenshot({ url, path, channel }: {
        url: string,
        path: string,
        channel: string,
    }) {
        await this.gatherer.screenshot(url, path, channel);

        global.info({
            module: 'main',
            desc: 'screenshot',
            url,
            path,
            channel,
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
        });
        console.log('screenshot: ', path, '#########', channel);
    }

    public async batchScreenshot(options: {
        url: string, path: string, channel: string, taskGroup: number | string
    }[]) {
        await Promise.all(
            options.map((option) => {
                return screenshotLimit(async () => {
                    const status = 
                        option.taskGroup
                        ? await this.getDownloadingStatus(option.taskGroup.toString())
                        : false;

                    return status && await this.screenshot(option);
                });
            })
        );
    }

    public async updateConfig(key: Parameters<Config['set']>[0], value: any) {
        try {
            await this.config.set(key, value);
        } catch (e) {
            global.error({
                module: 'service',
                method: 'updateConfig',
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                error: {
                    message: e.message,
                    stack: e.stack,
                },
            });
        }
    }
}

if (require.main === module) {
    !async function() {
        const service = new Service();
        await service.sync();

        console.log('done');
    }();
}
