import * as fs from 'fs';
import * as stream from 'stream';
import * as path from 'path';
import * as util from 'util';

import Router from 'koa-router';
import moment from 'moment';
import list2csv from 'list2csv';

import { filterUndefinedAndEmpty } from './utils';

const router = new Router();

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

    await ctx.service.crawl(query.parallel_size, query.company_quant);

    ctx.body = {
        success: true,
    };

    return await next();
});

router.post('/cancel_crawling', async (ctx, next) => {
    const app: any = ctx.app;

    ctx.body = {
        success: await ctx.service.cancelCrawling(),
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

    const bestMatches = await ctx.service.searchTrack({
        songName: query.song_name,
        artistName: query.artist_name,
        albumName: query.album_name,
    });

    ctx.body = {
        success: true,
        data: bestMatches,
    };

    return await next();
});

router.get('/get_tracks', async (ctx, next) => {
    const query = ctx.query;

    const companyIds = [ query.company_id ];

    const downloading = await ctx.service.getDownloadingStatus(query.company_id);

    if (downloading) {
        ctx.body = {
            success: true,
            message: '正在下载',
        };
    
        return await next();
    }

    await ctx.service.deleteCachedFile(query.company_id);

    await ctx.service.markDownloading(query.company_id);

    const company = await ctx.service.findCompanies(companyIds);

    if (company.length === 0) {
        await ctx.service.updateCompany(query.company_id);
    }

    const embeded = await ctx.service.findEmbededAlbums(companyIds);

    const tracks = embeded.reduce((tacc, company) => {
        const albums = company.albumList.reduce((aacc: any, album: any) => {
            const tr = album.list.map((track: any) => {
                const s = track.singer[0];

                return {
                    songName: track.songname,
                    artistName: s ? s.name : '',
                    albumName: album.name || undefined,
                    taskGroup: company.company_id,
                };
            });

            return aacc.concat(tr);
        }, []);

        return tacc.concat(albums);
    }, []);

    ctx.service.batchSearchTrack(tracks)
    .then(async (result) => {
        const downloading = await ctx.service.getDownloadingStatus(query.company_id);

        if (!downloading) {
            return;
        }

        const folder = path.join(__dirname, '../runtime', query.company_id);

        await util.promisify(fs.mkdir)(folder, {
            recursive: true,
        });

        let csv;

        if (!result || !Array.isArray(result) || result.length === 0) {
            csv = '公司不存在或公司没有歌曲';
        } else {
            const tunnels = Object.keys(result[0].data);

            const orderedHeaderMap = tunnels.reduce((acc, cur) => {
                acc.set(cur, cur);
                return acc;
            }, new Map([['歌曲', '歌曲'], ['歌手', '歌手']]));

            const map = result.reduce((acc, cur) => {
                const d = cur.data;
                (Object.keys(d) as Array<keyof typeof d>).forEach(k => {
                    if (acc[cur.name] == undefined) {
                        acc[cur.name] = {};
                    }

                    acc[cur.name]['歌手'] = cur.artist;

                    if (d[k]) {
                        if (d[k]!.name) {
                            switch (k as string) {
                                case 'itunes': acc[cur.name][k] = '存在'; break;
                                case 'qq': acc[cur.name][k] = d[k]!.comments; break;
                                case 'netease': acc[cur.name][k] = d[k]!.comments; break;
                                case 'kkbox': acc[cur.name][k] = '存在'; break;
                                case 'spotify': acc[cur.name][k] = '存在'; break;
                                case 'youtube': acc[cur.name][k] = d[k]!.views; break;
                            }
                        }
                    } else {
                        acc[cur.name][k] = '查询失败';
                    }
                });

                return acc;
            }, {} as any);

            const list = Object.keys(map).reduce((acc, cur) => {
                const entry = map[cur];
                entry['歌曲'] = cur;
                acc.push(entry);

                return acc;
            }, [] as any[]);

            csv = list2csv(list, orderedHeaderMap).replace(/"undefined"/g, '"未找到"');
        }

        await ctx.service.cacheCSV(csv, path.join(folder, 'collection.csv'), query.company_id);

        await ctx.service.cacheFile(query.company_id, folder);

        await ctx.service.unmarkDownloading(query.company_id);
    });

    ctx.body = {
        success: true,
    };

    return await next();
});

router.post('/screenshots', async (ctx, next) => {
    const files = ctx.request.files;
    const query = ctx.query;

    try {
        const key = Object.keys(files!)[0];
        const file = files![key];
        const filename = query.filename || file.name.split('.').slice(0, -1).join('.');
        const folder = path.join(__dirname, '../runtime', filename);
        const contentStr = await util.promisify(fs.readFile)(file.path, {
            encoding: 'utf8',
        });

        await ctx.service.markDownloading(filename);

        await util.promisify(fs.mkdir)(folder, {
            recursive: true,
        });

        const list: any[] = contentStr.split(/[\r\n]+/).slice(1);

        list.forEach((src, i) => {
            const values = src.split(',');
            const dist = {
                albumName: values[0],
                artistName: values[1],
                songName: values[2],
                taskGroup: filename,
            };
            list[i] = dist;
        });

        ctx.service.batchSearchTrack(list).then(async (result) => {
            const batchScreenshotOptions = result.reduce<Parameters<typeof ctx.service.batchScreenshot>[0]>((acc, cur) => {
                const d = cur.data;
                
                const part = (Object.keys(d) as Array<keyof typeof d>).map(k => {
                    if (d[k] && d[k]!.url) {
                        const url = d[k]!.url!;
                        const filename = path.join(folder, `${cur.name}_${k}.png`);
    
                        return {
                            url,
                            path: filename,
                            channel: k,
                            taskGroup: query.company_id,
                        };
                    }
                }).filter((v): v is {
                    url: string,
                    path: string,
                    channel: keyof typeof d,
                    taskGroup: number | string,
                } => !!v);
    
                acc = acc.concat(part);
    
                return acc;
            }, []);
    
            await ctx.service.batchScreenshot(batchScreenshotOptions);

            await ctx.service.cacheFile(filename, folder);

            await ctx.service.unmarkDownloading(filename);
        })

        ctx.body = {
            success: true,
        }
    } catch (e) {
        ctx.body = {
            success: false,
            message: e.message,
        };
    }

    return await next();
});

router.get('/list_files', async (ctx, next) => {
    const companyIds = await ctx.service.listCachedFiles();
    const companies = await ctx.service.findCompanies(companyIds.map(v => Number(v)), { _id: 0, company_id: 1, name: 1 });

    ctx.body = {
        success: true,
        data: companies,
    };

    return await next();
});

router.get('/list_downloading', async (ctx, next) => {
    const companyIds = await ctx.service.listDownloadingFiles();
    const companies = await ctx.service.findCompanies(companyIds.map(v => Number(v)), { _id: 0, company_id: 1, name: 1 });

    ctx.body = {
        success: true,
        data: companies,
    };

    return await next();
});

router.get('/cancel_downloading', async (ctx, next) => {
    const query = ctx.query;

    await ctx.service.unmarkDownloading(query.filename);

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

    const filepath = await ctx.service.getFilePath(query.filename);

    if (filepath) {
        const rs = await ctx.service.openFileStream(filepath!);

        ctx.set({
            'Content-Type': 'application/octet-stream;charset=utf8',
            'Content-Disposition': `attachment;filename*=UTF-8''${encodeURI(query.filename)}${path.extname(filepath!)}`,
        });

        ctx.body = rs;
    } else {
        await ctx.service.deleteCachedFile(query.filename);

        ctx.body = {
            success: false,
            message: 'file not exists or corrupted',
        };
    }

    return await next();
});

router.get('/config', async (ctx, next) => {
    const config = await ctx.service.config.dump();

    ctx.body = {
        success: true,
        config,
    };

    return await next();
});

router.post('/config/:key', async (ctx, next) => {
    const files = ctx.request.files;
    const params = ctx.params;

    try {
        const key = Object.keys(files!)[0];
        const file = files![key];
        const contentStr = await util.promisify(fs.readFile)(file.path, {
            encoding: 'utf8',
        });
        const content = JSON.parse(contentStr);

        await ctx.service.updateConfig(params.key, content);

        ctx.body = {
            success: true,
        };
    } catch (e) {
        ctx.body = {
            success: false,
            message: e.message,
        };
    }

    return await next();
});

router.post('/config/:key/json', async (ctx, next) => {
    const body = ctx.request.body;
    const params = ctx.params;

    const content = body;

    try {
        await ctx.service.updateConfig(params.key, content);

        ctx.body = {
            success: true,
        };
    } catch (e) {
        ctx.body = {
            success: false,
            message: e.message,
        };
    }

    return await next();
});

router.post('/configs', async (ctx, next) => {
    const files = ctx.request.files;

    try {
        const key = Object.keys(files!)[0];
        const file = files![key];
        const contentStr = await util.promisify(fs.readFile)(file.path, {
            encoding: 'utf8',
        });
        const content = JSON.parse(contentStr);

        for (const key in content) {
            await ctx.service.updateConfig(key as any, content[key]);
        }

        ctx.body = {
            success: true,
        };
    } catch (e) {
        ctx.body = {
            success: false,
            message: e.message,
        };
    }

    return await next();
});

export default router;

if (require.main === module) {
    console.log(moment.unix(undefined!).format())
}
