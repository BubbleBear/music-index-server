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

let client;

let db;

async function getDB() {
    if (!db) {
        client = await mongo.connect('mongodb://localhost', {
            keepAlive: 5 * 60 * 1000,
            useNewUrlParser: true,
        });

        db = client.db('qq_music_crawler');
        await db.createCollection('company');
        await db.createCollection('album');

        const company = db.collection('company');
        (await company.indexExists('company_id')) || (await db.createIndex('company', 'company_id'));

        const album = db.collection('album');
        (await album.indexExists('album_id')) || (await db.createIndex('album', 'album_id'));
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

async function bulkUpsertAlbum(albums) {
    const albumExtras = [];

    const albumScheduler = new Scheduler({
        newTask(albumId, albumMid, errorCount = 0) {
            return {
                albumId,
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
                desc: 'error',
                url: `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${task.albumMid}`,
                albumId: task.albumId,
                error: {
                    message: err.message,
                    stack: err.stack,
                },
                errorCount: task.errorCount,
            });

            if (task.errorCount < 10) {
                albumScheduler.push(task.albumId, task.albumMid, task.errorCount + 1);
            }
        },
    });

    albums.forEach(album => {
        albumScheduler.push(album.album_id, album.album_mid);
    });

    await albumScheduler.dispatch();

    if (albumExtras.length !== albums.length) {
        const diff = [];

        const extraIdMap = albumExtras.reduce((acc, album) => {
            acc[album.id] = album;
            return acc;
        }, {});

        const albumIdMap = albums.reduce((acc, album) => {
            acc[album.album_id] = album;
            return acc;
        }, {});

        Object.keys(albumIdMap).forEach(v => {
            !extraIdMap[v] && diff.push(v);
        });

        console.log(diff);
    }

    const upserts = albumExtras.length && await db.collection('album').bulkWrite(
        albumExtras.map((album) => {
            album.album_id = album.id;
            delete album['id'];

            return album ? { updateOne: {
                filter: { album_id: album.album_id },
                update: {
                    $set: album,
                },
                upsert: true,
            } } : null;
        }).filter(v => v),
    ) || [];

    return upserts;
}

async function getCompanyDetail(companyId) {
    const companyUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&type=company&companyId=${companyId}&is_show=1`;

    const result = await axios.get(companyUrl);

    const detail = result.data.data.company;

    return detail;
}

async function getCompanyAlbumListCU({ page, pageSize, companyId }) {
    const url = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=201851078&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&type=album&companyId=${companyId}&pageNum=${page}&pageSize=${pageSize}&is_show=1`;

    logger.info({
        time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
        desc: 'request',
        url,
        pendingLength: scheduler.pendingTasks.length,
        runningLength: scheduler.runningTasks.length,
    });

    const previous = await db.collection('company').findOne({ company_id: companyId });
    const companyDetail = previous || await getCompanyDetail(companyId);

    const result = await axios.get(url);
    let newAlbumList;

    if (result.data && result.data.data) {
        const album = result.data.data.album;

        newAlbumList = album && album.albumList && album.albumList.map(a => ({
            album_id: a.Falbum_id, 
            album_mid: a.Falbum_mid,
            album_name: a.Falbum_name,
        })) || [];

        let albumList = companyDetail.albumList || [];

        const albumMap = albumList.reduce((acc, album) => {
            acc[album.album_id] = album;
            return acc;
        }, {});

        newAlbumList.forEach(album => {
            albumMap[album.album_id] = album;
        });

        albumList = Object.keys(albumMap).reduce((acc, key) => {
            acc.push(albumMap[key]);
            return acc;
        }, []);

        companyDetail.company_id = companyId;
        companyDetail.albumList = albumList;
    } else {
        logger.warn({
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
            desc: 'illegal response',
            url,
            response: result.data,
        });
    }

    await db.collection('company').updateOne(
        { company_id: companyId },
        {
            $set: companyDetail,
        },
        {
            upsert: true,
        },
    );

    if (newAlbumList) {
        await bulkUpsertAlbum(newAlbumList);

        console.log(`company: ${companyId} page done page: ${page}, size: ${pageSize}, actual: ${newAlbumList.length}`);

        return newAlbumList.length !== pageSize;
    } else {
        return true;
    }
}

const parallelSize = process.argv[2] || 5;
const companyQuant = process.argv[3] || 1e5 + 10;

const scheduler = new Scheduler({
    parallelSize,
    newTask(companyId, page = 1, errorCount = 0, pageSize = 40) {
        const task = {
            companyId,
            page,
            pageSize,
            do: () => getCompanyAlbumListCU({page, companyId, pageSize}),
            status: TaskStatus.pending,
            errorCount,
        };
    
        companyPageTable[companyId] = page;
    
        return task;
    },
    async onDone(noMorePages, task) {
        console.log(scheduler.pendingTasks.length, scheduler.runningTasks.length)
    
        if (!noMorePages) {
            scheduler.push(task.companyId, task.page + 1);
        } else {
            await redis.sadd(REDIS_QMC_COMPANY_KEY, task.companyId);
        }
    },
    async onError(err, task) {
        console.log(err.message, err.stack)
        logger.error({
            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
            desc: 'error',
            url: `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=201851078&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&type=album&companyId=${task.companyId}&pageNum=${task.page}&pageSize=${task.pageSize}&is_show=1`,
            companyId: task.companyId,
            error: {
                message: err.message,
                stack: err.stack,
            },
            errorCount: task.errorCount,
        });
    
        if (task.errorCount < 10) {
            if (task.errorCount < 1) {
                if (task.page == companyPageTable[task.companyId]) {
                    scheduler.push(task.companyId, task.page + 1);
                }
            }
    
            task.errorCount++;
            scheduler.push(task.companyId, task.page, task.errorCount + 1);
        }
    },
});

const companyPageTable = Array(companyQuant).fill(0);

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

    const test = await db.collection('company').find({}).project({_id: 0, company_id: 1, albumTotal: 1, albumList: 1}).toArray();
    // console.log(test.map(v => v.company_id).sort((a, b) => a - b))
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

    const r = await db.collection('album').find({}).project({_id: 0, album_id: 1}).toArray();
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
