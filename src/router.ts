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
        const songs = album.list.map((song: any) => ({
            companyName: company.name || '未知唱片公司',
            companyId: params.companyId,
            albumName: album.name || '未知专辑',
            albumId: album.album_id,
            singerName: song.singer.map((singer: any) => singer.name).join(', ') || '群星',
            songName: song.songname,
            songId: song.songid,
            publishedAt: album.aDate,
        }));

        acc = acc.concat(songs);

        return acc;
    }, []);

    const csv = utils.list2csv(formatted, {
        companyName: '唱片公司',
        companyId: '唱片公司ID',
        albumName: '专辑名',
        albumId: '专辑ID',
        singerName: '歌手名',
        songName: '歌曲名',
        songId: '歌曲ID',
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
            $gt: Number(query.start_date),
            $lte: Number(query.end_date),
        },
    };

    const result = await service.findCompanyStatistics(utils.filterUndefinedAndEmpty(conditions));

    const csv = utils.list2csv(
        result.map(v => {
            v.createdAt = moment.unix(v.createdAt).format('YYYY-MM-DD');
            return v;
        }), {
            company_id: '唱片公司ID',
            company_name: '唱片公司',
            album_count: '专辑数',
            song_count: '歌曲数',
            createdAt: '分析日期',
        }
    );

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

    const crawler = service.crawl(query.parallel_size, query.company_quant);

    app.childProcessMap.crawler = crawler;

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
    const result = await service.createCompanyStatistics();

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
