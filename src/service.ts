import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import { Gatherer } from '../lib/music-info-gatherer/src';

import axios from 'axios';
import mongo, { MongoClient, Db } from "mongodb";
import Redis from 'ioredis';
import moment from 'moment';
// import puppeteer from 'puppeteer';

const REDIS_QQ_CRALWER_KEY = 'qq.music.crawler.company';

const REDIS_QQ_STATISTICS_KEY = 'qq.music.statistics.date';

const REDIS_DOWNLOADING_FILE_SET_KEY = 'downloading.file';

const REDIS_CACHED_FILE_MAP_KEY = 'cached.file';

export default class Service {
    client!: MongoClient;

    redis: Redis.Redis;

    // browser!: puppeteer.Browser;

    private _client: Promise<MongoClient>;

    private db!: Db;

    // private _browser: Promise<puppeteer.Browser>;

    constructor() {
        this._client = mongo.connect('mongodb://localhost:27017', {
            useNewUrlParser: true,
        });

        // this._browser = puppeteer.launch({
        //     args: [
        //         '--proxy-server=127.0.0.1:6666',
        //     ]
        // });

        this.redis = new Redis({
            host: 'localhost',
            port: 6379,
            dropBufferSupport: true,
        });
    }

    async sync() {
        if (this.db) {
            return;
        }

        this.client = await this._client;
        this.db = this.client.db('qq_music_crawler');

        // this.browser = await this._browser;
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
        return await this.redis.del(REDIS_QQ_CRALWER_KEY);
    }

    async createCompanyStatistics(assignedDate?: number | string) {
        await this.sync();

        await this.db.createCollection('company_statistics');

        const collection = this.db.collection('company_statistics');

        (await collection.indexExists('createdAt')) || (await this.db.createIndex('company_statistics', 'createdAt'));
        (await collection.indexExists([ 'company_id', 'createdAt' ])) || (await this.db.createIndex('company_statistics', [ 'company_id', 'createdAt' ]));

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

        await this.redis.sadd(REDIS_QQ_STATISTICS_KEY, date1, date2);

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

        const dates = await this.redis.smembers(REDIS_QQ_STATISTICS_KEY);

        return dates;
    }

    crawl(parallelSize: number = 5, companyQuant: number = 10) {
        const crawler = cp.spawn(
            'node',
            [ `${path.join(__dirname, '../scripts/qq_music_crawler.js')}`, parallelSize.toString(), companyQuant.toString() ],
        );
    
        crawler.stdout.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        })
    
        crawler.stderr.on('data', (chunk) => {
            chunk && console.log(chunk.toString());
        })
    
        crawler.on('close', async (code) => {
            if (code == 0) {
                await this.createCompanyStatistics();
            }
        });

        return crawler;
    }

    kill(process: cp.ChildProcess) {
        try {
            const result = process.kill('SIGKILL');

            return result;
        } catch (e) {
            return false;
        }
    }

    private async initGather() {
        // const proxy = await this.getProxy();
        const proxy = undefined;

        return new Gatherer({
            proxies: {
                itunes: proxy,
                netease: proxy,
                qq: proxy,
                kkbox: proxy,
            },
        });
    }

    public async searchTrack(songName: string, artistName: string, platforms?: string[]) {
        const gather = await this.initGather();
        const results = await gather.search(songName, artistName);

        // console.log(songName.toLowerCase(), artistName.toLowerCase())

        const bestMatches = Object.keys(results).reduce((acc, cur) => {
            // console.log('--', cur)
            acc[cur] = (results as any)[cur].filter((v: any) => {
                    // console.log('----', songName
                        // ,v.name.toLowerCase().includes(songName.toLowerCase())
                        // , v.artists.reduce((acc: boolean, cur: any) => {
                        //     return acc || cur.name.toLowerCase().includes(artistName.toLowerCase());
                        // }, false))

                    return v.name.toLowerCase().includes(songName.toLowerCase()) && v.artists.reduce((acc: boolean, cur: any) => {
                        // console.log('------', cur.name.toLowerCase(), cur.name.toLowerCase().includes(artistName.toLowerCase()))
                        return acc || cur.name.toLowerCase().includes(artistName.toLowerCase());
                    }, false);
                })[0] || null;

            return acc;
        }, {} as any);

        console.log(songName, '#########', artistName);

        return bestMatches;
    }

    // public async screenShot(url: string, filepath: string) {
    //     await this.sync();
        
    //     try {
    //         const page = await this.browser.newPage();
    //         await page.setCacheEnabled(true);
    //         await page.goto(url, {
    //             timeout: 100000,
    //         });
    //         await page.screenshot({ path: filepath });
    //     } catch (e) {
    //         console.log(e.message)
    //     }
    // }

    public async cacheFile(content: string, filepath: string, redisKey: string, expire: number = 76800) {
        const cached = await this.redis.sismember(REDIS_DOWNLOADING_FILE_SET_KEY, redisKey);

        if (cached) {
            return;
        }

        await this.redis.sadd(REDIS_DOWNLOADING_FILE_SET_KEY, redisKey);

        const ws = fs.createWriteStream(filepath);
        ws.write('\ufeff');
        ws.write(content);
        ws.end();

        await this.redis.srem(REDIS_DOWNLOADING_FILE_SET_KEY, redisKey);

        await this.redis.hset(REDIS_CACHED_FILE_MAP_KEY, redisKey, filepath);
    }

    public async listDownloadingFiles() {
        return await this.redis.smembers(REDIS_DOWNLOADING_FILE_SET_KEY);
    }

    public async listCachedFiles() {
        return await this.redis.hkeys(REDIS_CACHED_FILE_MAP_KEY);
    }

    public async openFileStream(redisKey: string) {
        const filepath = await this.redis.hget(REDIS_CACHED_FILE_MAP_KEY, redisKey);

        return fs.createReadStream(filepath!);
    }

    private async getProxy() {
        try {
            const response = await axios('http://183.129.244.16:88/open?user_name=VesselVatelap1&timestamp=1555659736&md5=26AE4B66A2D9CAA07E3F68FD06C6E32F&pattern=json&number=1');
            console.log(response.data)
            const proxy = `http://${response.data.domain}:${response.data.port[0]}`;

            return proxy;
        } catch (e) {
            return undefined;
        }
    }

}

if (require.main === module) {
    !async function() {
        const service = new Service();

        await service.createCompanyStatistics();

        await service.client.close();
        service.redis.disconnect();
    }();
}
