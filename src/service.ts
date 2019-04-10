import * as cp from 'child_process';
import * as path from 'path';

import mongo, { MongoClient, Db } from "mongodb";
import Redis from 'ioredis';
import moment from 'moment';

const REDIS_QQ_CRALWER_KEY = 'qq.music.crawler.company';

const REDIS_QQ_STATISTICS_KEY = 'qq.music.statistics.date';

export default class Service {
    client!: MongoClient;

    redis: Redis.Redis;

    private promise: Promise<MongoClient>;

    private db!: Db;

    constructor(options?: any) {
        this.promise = mongo.connect('mongodb://localhost:27017', Object.assign({
            useNewUrlParser: true,
        }, options));

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

        this.client = await this.promise;
        this.db = this.client.db('qq_music_crawler');
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
                album_count: company.albumTotal,
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
}

if (require.main === module) {
    !async function() {
        const service = new Service();

        await service.createCompanyStatistics();

        await service.client.close();
        service.redis.disconnect();
    }();
}
