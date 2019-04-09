const axios = require('axios');
const mongo = require('mongodb');
const Redis = require('ioredis');

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

        db = client.db('qq_music_spider');
        await db.createCollection('company');
        await db.createCollection('album');

        const company = db.collection('company');
        (await company.indexExists('company_id')) || (await db.createIndex('company', 'company_id'));

        const album = db.collection('album');
        (await album.indexExists('album_id')) || (await db.createIndex('album', 'album_id'));
    }

    return db;
}

async function bulkInsertAlbum(albums) {
    const albumExtras = await Promise.all(albums.map(album => getAlbumInfo(album.album_mid)));

    const upserts = await db.collection('album').bulkWrite(
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
    );

    return upserts;
}

async function getCompanyDetail(companyId) {
    const companyUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&type=company&companyId=${companyId}&is_show=1`;

    const result = await axios.get(companyUrl);

    const detail = result.data.data.company;

    return detail;
}

async function getCompanyAlbumListCU({ page, pageSize, companyId }) {
    const albumUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=201851078&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&type=album&companyId=${companyId}&pageNum=${page}&pageSize=${pageSize}&is_show=1`;

    logger.info({
        desc: 'request',
        albumUrl,
        pendingLength: scheduler.pendingTasks.length,
        runningLength: scheduler.runningTasks.length,
    });

    const result = await axios.get(albumUrl);

    if (!result.data || !result.data.data || !result.data.data.album) {
        // to do add logger here
        logger.warn({
            desc: 'illegal response',
            albumUrl,
            response: result.data,
        });
        return true;
    }

    const companyDetail = await getCompanyDetail(companyId);

    const albumList = result.data.data.album.albumList.map(a => ({
        album_id: a.Falbum_id,
        album_mid: a.Falbum_mid,
        album_name: a.Falbum_name,
    }));

    companyDetail.company_id = companyId;
    companyDetail.albumList = albumList;

    await db.collection('company').updateOne(
        { company_id: companyId },
        {
            $set: companyDetail,
        },
        {
            upsert: true,
        },
    );

    await bulkInsertAlbum(albumList);

    console.log(`company: ${companyId} page done page: ${page}, size: ${pageSize}, actual: ${albumList.length}`);

    return albumList.length !== pageSize;
}

async function getAlbumInfo(albumMid) {
    try {
        const result = await axios.get(`https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${albumMid}`);

        return result.data.data;
    } catch (e) {
        return null;
    }
}

const parallelSize = process.argv[2] || 100;
const companyQuant = process.argv[3] || 1e5 + 10;

const scheduler = new Scheduler({
    parallelSize,
    newTask,
    onDone,
    onError,
});

// each value stands for current page of the company identified by index
const companyPageTable = Array(companyQuant).fill(0);

function newTask(companyId, page = 1, errorCount = 0, pageSize = 40) {
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
}

async function onDone(noMorePages, task) {
    console.log(scheduler.pendingTasks.length, scheduler.runningTasks.length)

    if (!noMorePages) {
        scheduler.push(task.companyId, task.page + 1);
        // if (task.page == companyPageTable[task.companyId]) {
        //     scheduler.push(task.companyId, task.page + 1);
        // } else {
        //     console.log('######################', task.companyId, task.page, companyPageTable[task.companyId])
        // }
    } else {
        await redis.sadd(REDIS_QMC_COMPANY_KEY, task.companyId);

        // let companyId = task.companyId;

        // while (companyId < companyQuant && await redis.sismember(REDIS_QMC_COMPANY_KEY, companyId) == 1) {
        //     companyId += parallelSize;
        // }

        // companyId < companyQuant && scheduler.push(companyId);
    }
}

async function onError(err, task) {
    logger.error({
        desc: 'error',
        url: `https://c.y.qq.com/v8/fcg-bin/fcg_company_detail.fcg?g_tk=201851078&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&type=album&companyId=${task.companyId}&pageNum=${task.page}&pageSize=${task.pageSize}&is_show=1`,
        error: err,
    });

    if (task.errorCount < 5) {
        if (task.errorCount < 1) {
            if (task.page == companyPageTable[task.companyId]) {
                scheduler.push(task.companyId, task.page + 1);
            }
        }

        task.errorCount++;
        scheduler.pendingTasks.push(task);
    }
}

// another implementation for `start`
async function run() {
    const visited = await redis.smembers(REDIS_QMC_COMPANY_KEY);

    for (let i = 1; i < companyQuant; i++) {
        if (visited.includes(i.toString()) === false) {
            scheduler.push(i);
        }
    }

    await scheduler.dispatch();

    client.close()
    redis.disconnect();

    return;
}

if (require.main === module) {
    !async function() {
        await getDB();
        await run();
    }()
}
