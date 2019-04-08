import * as stream from 'stream';

import Router from 'koa-router';

import Service from './service';
import * as utils from './utils';

const router = new Router();
const service = new Service();

router.get('/company/:companyId/detail', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    ctx.body = embeded[0] || {};

    next();
});

router.post('/cleanse_crawler_cache', async (ctx, next) => {
    ctx.body = await service.cleanseCrawlerCache();

    next();
});

router.get('/csv/music_index_detail/:companyId', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    const formatted = embeded[0].albumList.reduce((acc: any[], album: any) => {
        const songs = album.list.map((song: any) => ({
            companyName: embeded[0].name || '未知唱片公司',
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

    rs.push(csv);
    rs.push(null);

    ctx.body = rs;

    next();
});

router.get('/crawl', async (ctx, next) => {
    const query = ctx.query;

    const app: any = ctx.app;

    const crawler = service.crawl(query.parallel_size, query.company_quant);

    app.childProcessMap.crawler = crawler;

    ctx.body = {
        success: true,
    };

    next();
});

router.get('/terminate_crawling', async (ctx, next) => {
    const app: any = ctx.app;

    const crawler = app.childProcessMap.crawler;

    ctx.body = {
        success: service.kill(crawler),
    };

    next();
});

export default router;
