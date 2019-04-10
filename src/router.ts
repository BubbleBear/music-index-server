import * as stream from 'stream';

import Router from 'koa-router';
import moment from 'moment';

import Service from './service';
import * as utils from './utils';

const router = new Router();
const service = new Service();

router.get('/company/:companyId/detail', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    ctx.body = {
        success: true,
        data: embeded[0] || {},
    };

    return await next();
});

router.post('/cleanse_crawler_cache', async (ctx, next) => {
    ctx.body = {
        success: await service.cleanseCrawlerCache(),
    };

    return await next();
});

router.get('/csv/music_index_detail/:companyId', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    const company = embeded[0] || { albumList: [] };

    const formatted = company.albumList.reduce((acc: any[], album: any) => {
        const list = album && album.list || [];

        const songs = list.map((song: any) => ({
            companyName: company.name || '未知唱片公司',
            companyId: params.companyId,
            albumName: album.name || '未知专辑',
            albumMid: album.mid,
            singerName: song.singer.map((singer: any) => singer.name).join(', ') || '群星',
            songName: song.songname,
            songMid: song.songmid,
            publishedAt: album.aDate,
        }));

        acc = acc.concat(songs);

        return acc;
    }, []);

    const csv = utils.list2csv(formatted, {
        companyName: '唱片公司',
        companyId: '唱片公司ID',
        albumName: '专辑名',
        albumMid: '专辑ID',
        singerName: '歌手名',
        songName: '歌曲名',
        songMid: '歌曲媒体ID',
        publishedAt: '发行时间',
    });

    const rs = new stream.Readable({
        read() {},
    });

    rs.push('\ufeff');
    rs.push(csv);
    rs.push(null);

    const appendix = moment().format('YYYY-MM-DD');

    ctx.set({
        'Content-Type': 'application/octet-stream;charset=utf8',
        'Content-Disposition': `attachment;filename*=UTF-8''${encodeURI('曲库详细查询_' + company.name)}_${appendix}.csv`,
    });

    ctx.body = rs;

    return await next();
});

router.get('/csv/company_statistics', async (ctx, next) => {
    const query = ctx.query;

    const conditions = {
        createdAt: {
            $gte: Number(query.start_date),
            $lte: Number(query.end_date),
        },
    };

    const result = await service.findCompanyStatistics(utils.filterUndefinedAndEmpty(conditions));

    const dates = new Set();

    const statisticsMap = result.reduce((acc, cur) => {
        const createdAt = moment.unix(cur.createdAt).format('YYYY-MM-DD');
        dates.has(createdAt) || dates.add(createdAt);
        acc[cur.company_id] || (acc[cur.company_id] = cur);
        acc[cur.company_id][createdAt] = cur.song_count;
        return acc;
    }, {});

    const statistics = Object.keys(statisticsMap).map(k => statisticsMap[k]);

    const headerMap: any = {
        company_id: '唱片公司ID',
        company_name: '唱片公司',
    };

    [...dates].sort((a, b) => {
        return moment(a).unix() - moment(b).unix();
    }).forEach(date => {
        headerMap[date] = date;
    });

    const csv = utils.list2csv(statistics, headerMap);

    const rs = new stream.Readable({
        read() {},
    });

    rs.push('\ufeff');
    rs.push(csv);
    rs.push(null);

    const appendix = query.start_date
        ? moment.unix(query.start_date).format('YYYY-MM-DD')
        : moment().format('YYYY-MM-DD');

    ctx.set({
        'Content-Type': 'application/octet-stream;charset=utf8',
        'Content-Disposition': `attachment;filename*=UTF-8''${encodeURI('曲库量统计')}_${appendix}.csv`,
    });

    ctx.body = rs;

    return await next();
});

router.post('/crawl', async (ctx, next) => {
    const query = ctx.query;

    const app: any = ctx.app;

    // const crawler = service.crawl(query.parallel_size, query.company_quant);

    // app.childProcessMap.crawler = crawler;

    ctx.body = {
        success: true,
    };

    return await next();
});

router.post('/terminate_crawling', async (ctx, next) => {
    const app: any = ctx.app;

    const crawler = app.childProcessMap.crawler;

    ctx.body = {
        success: service.kill(crawler),
    };

    return await next();
});

router.post('/company_statistics', async (ctx, next) => {
    const body = ctx.request.body;

    const result = await service.createCompanyStatistics(body.date);

    ctx.body = {
        success: Boolean(result),
    };

    return await next();
});

router.get('/company_statistics/dates', async (ctx, next) => {
    const dates = await service.getStatisticsDates();

    ctx.body = {
        success: true,
        dates,
    };

    return await next();
});

export default router;

if (require.main === module) {
    console.log(moment.unix(undefined!).format())
}
