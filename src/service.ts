import * as cp from 'child_process';
import * as path from 'path';

import mongo, { MongoClient, Db } from "mongodb";
import Redis from 'ioredis';

const REDIS_QQ_CRALWER_KEY = 'qq.music.crawler.company';

export default class Service {
    private promise: Promise<MongoClient>;
    
    client!: MongoClient;

    private db!: Db;

    private redis: Redis.Redis;

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
        this.db = this.client.db('qq_music_spider');
    }

    async findCompanies(companyIds: number[]) {
        await this.sync();

        const companyCollection = this.db.collection('company');

        const companies = await companyCollection.find({
            company_id: {
                $in: companyIds.map(v => Number(v)),
            },
        })
        .project({
            _id: 0,
        })
        .toArray();

        return companies;        
    }

    async findAlbums(albumIds: number[]) {
        await this.sync();

        const albumCollection = this.db.collection('album');

        const albums = await albumCollection.find({
            album_id: {
                $in: albumIds.map(v => Number(v)),
            },
        })
        .project({
            _id: 0,
        })
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
            company.name = company.albumList[0].company;
        });

        return companies;
    }

    async cleanseCrawlerCache() {
        return await this.redis.del(REDIS_QQ_CRALWER_KEY);
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
                const collection = this.db.collection('album_statistics');

                // await collection.insert({

                // });
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

        const r = await service.findEmbededAlbums([64, 30])

        console.dir(JSON.stringify(r), {
            depth: null,
        });

        await service.client.close();
    }();
}
