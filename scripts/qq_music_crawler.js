const axios = require('axios');
const mongo = require('mongodb');
const Redis = require('ioredis');
const moment = require('moment');

const Scheduler = require('./scheduler').default;
const TaskStatus = require('./scheduler').TaskStatus;
const logger = require('./logger');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

axios.default.timeout = 5000;

const REDIS_QMC_COMPANY_KEY = 'qq.music.crawler.company';

const MONGO_COMPANY_COLLECTION = 'company';

const MONGO_ALBUM_COLLECTION = 'album';

let client;

let db;

async function getDB() {
    if (!db) {
        client = await mongo.connect('mongodb://localhost', {
            keepAlive: 5 * 60 * 1000,
            useNewUrlParser: true,
        });

        db = client.db('qq_music_crawler');
        await db.createCollection(MONGO_COMPANY_COLLECTION);
        await db.createCollection(MONGO_ALBUM_COLLECTION);

        const company = db.collection(MONGO_COMPANY_COLLECTION);
        (await company.indexExists('company_id')) || (await db.createIndex(MONGO_COMPANY_COLLECTION, 'company_id'));

        const album = db.collection(MONGO_ALBUM_COLLECTION);
        (await album.indexExists('album_id')) || (await db.createIndex(MONGO_ALBUM_COLLECTION, 'album_id'));
    }

    return db;
}

async function getAlbumInfo(albumMid) {
    const result = await axios.get(`https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${albumMid}`);

    if (result.data.data == null) {
        throw new Error('empty data');
    }

    return result.data.data;
}

async function bulkUpsertAlbum(albumList) {
    const albumExtras = [];

    const albumScheduler = new Scheduler({
        newTask(albumMid, errorCount = 0) {
            return {
                albumMid,
                do: () => getAlbumInfo(albumMid),
                status: TaskStatus.pending,
                errorCount,
            };
        },
        async onDone(album, task) {
            albumExtras.push(album);
        },
        async onError(err, task) {
            console.log(task.errorCount, err.message, err.stack);
            logger.error({
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                desc: 'album error',
                url: `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${task.albumMid}`,
                albumMid: task.albumMid,
                error: {
                    message: err.message,
                    stack: err.stack,
                },
                errorCount: task.errorCount,
            });

            if (task.errorCount < 5) {
                albumScheduler.push(task.albumMid, task.errorCount + 1);
            }
        },
    });

    albumList.forEach(album => {
        albumScheduler.push(album.album_mid);
    });

    await albumScheduler.dispatch();

    const upserts = albumExtras.length && await db.collection(MONGO_ALBUM_COLLECTION).bulkWrite(
        albumExtras.map((album) => {
            album.album_id = album.id;
            delete album['id'];

            return { updateOne: {
                filter: { album_id: album.album_id },
                update: {
                    $set: album,
                },
                upsert: true,
            } };
        }).filter(v => v),
    ) || [];

    return upserts;
}

async function getCompanyInGeneral(companyId) {
    const companyUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&type=company&companyId=${companyId}&is_show=1`;

    const result = await axios.get(companyUrl);

    const company = result.data.data.company;

    await db.collection(MONGO_COMPANY_COLLECTION).updateOne(
        { company_id: companyId },
        {
            $set: company,
        },
        {
            upsert: true,
        },
    );
}

async function getCompany(companyId) {
    await getCompanyInGeneral(companyId);

    const albumLists = [];

    const companyScheduler = new Scheduler({
        newTask(sort, page = 1, pageSize = 40, errorCount = 0) {
            return {
                page,
                pageSize,
                sort,
                do: () => getCompanyAlbumList({ companyId, sort, page, pageSize }),
                status: TaskStatus.pending,
                errorCount,
            }
        },
        async onDone(albumList, task) {
            if (albumList) {
                albumLists.push(albumList);
                
                if (albumList.length == task.pageSize) {
                    companyScheduler.push(task.sort, task.page + 1);
                }
            }
        },
        async onError(err, task) {
            console.log(err)
            logger.error({
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                desc: 'page error',
                page: task.page,
                sort: task.sort,
                error: {
                    message: err.message,
                    stack: err.stack,
                },
                errorCount: task.errorCount,
            });

            if (task.errorCount < 5) {
                companyScheduler.push(task.sort, task.page);
            }
        },
    });

    companyScheduler.push(0);
    companyScheduler.push(1);

    await companyScheduler.dispatch();

    const albumMap = albumLists.reduce((acc, cur) => {
        acc = acc.concat(cur);
        return acc;
    }, []).reduce((acc, cur) => {
        if (cur && cur.album_id) {
            acc[cur.album_id] || (acc[cur.album_id] = cur);
        }

        return acc;
    }, {});

    const albumList = Object.keys(albumMap).map(v => albumMap[v]);

    // console.log(albumList)
    await bulkUpsertAlbum(albumList);

    const previous = await db.collection(MONGO_COMPANY_COLLECTION)
        .findOne({ company_id: companyId });

    const previousAlbumList = previous.albumList || [];

    const unionAlbumMap = previousAlbumList.concat(albumList).reduce((acc, cur) => {
        if (cur && cur.album_id) {
            acc[cur.album_id] || (acc[cur.album_id] = cur);
        }

        return acc;
    }, {});

    const unionAlbumList = Object.keys(unionAlbumMap).map(v => unionAlbumMap[v]);

    await db.collection(MONGO_COMPANY_COLLECTION).updateOne(
        { company_id: companyId },
        {
            $set: {
                albumList: unionAlbumList,
            },
        },
        {
            upsert: true,
        },
    );
}

async function getCompanyAlbumList({ page, pageSize, companyId, sort }) {
    const url = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=201851078&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&type=album&companyId=${companyId}&pageNum=${page}&pageSize=${pageSize}&is_show=1&sort=${sort}`;

    logger.info({
        time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
        desc: 'request',
        url,
    });

    const result = await axios.get(url);

    if (result.data && result.data.data && result.data.data.album && result.data.data.album.albumList) {
        return result.data.data.album.albumList.map(a => ({
            album_id: a.Falbum_id, 
            album_mid: a.Falbum_mid,
            album_name: a.Falbum_name,
        }));
    } else {
        logger.warn({
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
            desc: 'illegal response',
            url,
            response: result.data,
        });

        return null;
    }
}

const parallelSize = process.argv[2] || 5;
const companyQuant = process.argv[3] || 1e5 + 10;

const scheduler = new Scheduler({
    parallelSize,
    newTask(companyId, errorCount = 0) {
        const task = {
            companyId,
            do: () => getCompany(companyId),
            status: TaskStatus.pending,
            errorCount,
        };
    
        return task;
    },
    async onDone(_, task) {
        // console.log(scheduler.pendingTasks.length, scheduler.runningTasks.length)
        console.log(`company: ${task.companyId} done.`);
    
        await redis.sadd(REDIS_QMC_COMPANY_KEY, task.companyId);
    },
    async onError(err, task) {
        console.log(err.message, err.stack)
        logger.error({
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
            desc: 'company error',
            companyId: task.companyId,
            error: {
                message: err.message,
                stack: err.stack,
            },
            errorCount: task.errorCount,
        });
    
        if (task.errorCount < 5) {
            scheduler.push(task.companyId, task.errorCount + 1);
        }
    },
});

async function run() {
    await getDB();

    const visited = await redis.smembers(REDIS_QMC_COMPANY_KEY);

    const visitedMap = visited.reduce((acc, cur) => {
        acc[cur] = true;
        return acc;
    }, {});

    for (let i = 1; i <= companyQuant; i++) {
        if (!visitedMap[i]) {
            scheduler.push(i);
        }
    }

    await scheduler.dispatch();

    client.close()
    redis.disconnect();

    return;
}

async function inspect() {
    await getDB();

    const test = await db.collection(MONGO_COMPANY_COLLECTION).find({}).project({_id: 0, company_id: 1, albumTotal: 1, albumList: 1}).toArray();
    console.log('company counts: ', test.length);
    console.log('theoretical album counts: ', test.reduce((acc, cur) => {
        return acc + cur.albumTotal;
    }, 0));

    const albums = test.reduce((acc, cur) => {
        if (cur.albumList) {
            cur.albumList.forEach(album => {
                if (!album) {
                    console.log(cur.company_id);
                }
            });
    
            acc = acc.concat(cur.albumList);
        } else {
            console.log(cur.company_id);
        }

        return acc;
    }, []);

    const r = await db.collection(MONGO_ALBUM_COLLECTION).find({}).project({_id: 0, album_id: 1}).toArray();
    const rt = r.reduce((acc, cur) => {
        acc.push(cur.album_id);
        return acc;
    }, []);

    console.log('actual album counts: ', rt.length)

    const cp = [];
    albums.forEach(v => {
        if (v) {
            const id = Number(v.album_id);
            rt.includes(id) || cp.push(id);
        }
    })

    console.log('diff: ', cp);

    client.close()
    redis.disconnect();
}

if (require.main === module) {
    !async function() {
        await run();
    }()
}

module.exports = {
    run,
    inspect,
};
