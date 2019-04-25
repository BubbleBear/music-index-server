import * as stream from 'stream';
import * as path from 'path';

import { list2csv, filterUndefinedAndEmpty } from './utils';

import Router from 'koa-router';
import moment from 'moment';
import plimit from 'p-limit';

const router = new Router();

const limit = plimit(10);

router.get('/company/:companyId/detail', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await ctx.service.findEmbededAlbums(companyIds);

    ctx.body = {
        success: true,
        data: embeded[0] || {},
    };

    return await next();
});

router.post('/cleanse_crawler_cache', async (ctx, next) => {
    ctx.body = {
        success: await ctx.service.cleanseCrawlerCache(),
    };

    return await next();
});

router.get('/csv/music_index_detail/:companyId', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await ctx.service.findEmbededAlbums(companyIds);

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

    const csv = list2csv(formatted, {
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

    const result = await ctx.service.findCompanyStatistics(filterUndefinedAndEmpty(conditions));

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

    const csv = list2csv(statistics, headerMap);

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

    // const crawler = ctx.service.crawl(query.parallel_size, query.company_quant);

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
        success: ctx.service.kill(crawler),
    };

    return await next();
});

router.post('/company_statistics', async (ctx, next) => {
    const body = ctx.request.body;

    const result = await ctx.service.createCompanyStatistics(body.date);

    ctx.body = {
        success: Boolean(result),
    };

    return await next();
});

router.get('/company_statistics/dates', async (ctx, next) => {
    const dates = await ctx.service.getStatisticsDates();

    ctx.body = {
        success: true,
        dates,
    };

    return await next();
});

router.get('/get_track', async (ctx, next) => {
    const query = ctx.query;

    const bestMatches = await ctx.service.searchTrack(query.song_name, query.artist_name)

    // Promise.all(Object.keys(bestMatches).map(async (matchKey: any) => {
    //     if (bestMatches[matchKey]) {
    //         await ctx.service.screenShot(
    //             bestMatches[matchKey].url,
    //             path.join(__dirname, '../runtime', `${query.song_name}_${query.artist_name}_${matchKey}.png`),
    //         );
    //     }
    // }));

    ctx.body = {
        success: true,
        data: bestMatches,
    };

    return await next();
});

router.get('/get_tracks', async (ctx, next) => {
    const query = ctx.query;

    const companyIds = [ query.company_id ];

    const cached = await ctx.service.cached(query.company_id);

    if (cached) {
        ctx.body = {
            success: true,
            message: '已下载',
        };
    
        return await next();
    }

    await ctx.service.markDownloading(query.company_id);

    const embeded = await ctx.service.findEmbededAlbums(companyIds);

    const tracks = embeded.reduce((tacc, company) => {
        const albums = company.albumList.reduce((aacc: any, album: any) => {
            const tr = album.list.map((track: any) => {
                const s = track.singer[0];

                return {
                    songName: track.songname,
                    artistName: s ? s.name : '',
                };
            });

            return aacc.concat(tr);
        }, []);

        return tacc.concat(albums);
    }, []);

    Promise.all<any>(
        tracks.map(
            (track: any) => {
                return limit(async () => {
                    return {
                        name: track.songName,
                        data: await ctx.service.searchTrack(track.songName, track.artistName),
                    };
                });
            }
        )
    )
    .then(async (result) => {
        if (!result || !Array.isArray(result) || result.length === 0) {
            const csv = '公司不存在或公司没有歌曲';
            await ctx.service.cacheFile(csv, path.join(__dirname, '../runtime', query.company_id + '.csv'), query.company_id);

            return;
        }

        const orderedHeaderMap = result.reduce((acc: Map<string, any>, cur: any) => {
            acc.set(cur.name, cur.name);
            return acc;
        }, new Map([[' ', ' ']]));
        
        const tunnels = Object.keys(result[0].data);
        
        const template = tunnels.reduce((acc: any, cur: any) => {
            acc[cur] = {};
        
            return acc;
        }, {});

        const map = result.reduce((acc, cur) => {
            const d = cur.data;
            Object.keys(d).forEach(k => {
                switch (k) {
                    case 'itunes': d[k] && (acc[k][d[k].name] = '存在'); break;
                    case 'qq': d[k] && (acc[k][d[k].name] = d[k].comments); break;
                    case 'netease': d[k] && (acc[k][d[k].name] = d[k].comments); break;
                    case 'kkbox': d[k] && (acc[k][d[k].name] = '存在'); break;
                    case 'spotify': d[k] && (acc[k][d[k].name] = '存在'); break;
                    case 'youtube': d[k] && (acc[k][d[k].name] = d[k].views); break;
                }
            });
        
            return acc;
        }, template);
        
        const list = Object.keys(map).reduce((acc: any, cur: any) => {
            const entry = map[cur];
            entry[' '] = cur;
            acc.push(entry);
        
            return acc;
        }, []);
        
        const csv = list2csv(list, orderedHeaderMap).replace(/"undefined"/g, '"未找到"');

        await ctx.service.cacheFile(csv, path.join(__dirname, '../runtime', query.company_id + '.csv'), query.company_id);
    });

    ctx.body = {
        success: true,
    };

    return await next();
});

router.get('/list_files', async (ctx, next) => {
    ctx.body = {
        success: true,
        data: await ctx.service.listCachedFiles(),
    };

    return await next();
});

router.get('/list_downloading', async (ctx, next) => {
    ctx.body = {
        success: true,
        data: await ctx.service.listDownloadingFiles(),
    };

    return await next();
});

router.get('/cancel_downloading', async (ctx, next) => {
    const query = ctx.query;

    await ctx.service.unmarkDownloading(query.company_id)

    ctx.body = {
        success: true,
    };

    return await next();
});

router.get('/delete_cached_file', async (ctx, next) => {
    const query = ctx.query;

    await ctx.service.deleteCachedFile(query.filename);

    ctx.body = {
        success: true,
    };

    return await next();
})

router.get('/download', async (ctx, next) => {
    const query = ctx.query;

    const rs = await ctx.service.openFileStream(query.filename);

    ctx.set({
        'Content-Type': 'application/octet-stream;charset=utf8',
        'Content-Disposition': `attachment;filename*=UTF-8''${encodeURI(query.filename)}.csv`,
    });

    ctx.body = rs;

    return await next();
});

export default router;

if (require.main === module) {
    console.log(moment.unix(undefined!).format())
}
