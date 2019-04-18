import AbstractAdapter, { SearchOptions, SearchReturn } from './abstract';

import axios, { AxiosRequestConfig } from 'axios';

export default class QQMusicAdapter extends AbstractAdapter {
    private async fetch({ url, method = 'get' }: AxiosRequestConfig) {
        return await axios({
            method,
            url,
            baseURL: 'https://c.y.qq.com/',
        });
    }

    public async search(options: SearchOptions) {
        const response = await this.fetch({
            url: `/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=68272903274457102&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=20&w=${encodeURIComponent(options.songName + ' ' + options.artistName)}&g_tk=688287957&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
        });

        const results = response.data.data.song.list.map(async (v: any) => {
            return {
                name: v.title,
                artists: v.singer.map((u: any) => {
                    return {
                        name: u.title,
                        id: u.id,
                        mid: u.mid,
                    };
                }),
                album: {
                    name: v.name,
                    id: v.id,
                    mid: v.mid,
                },
                id: v.id,
                url: `https://y.qq.com/n/yqq/song/${v.mid}.html`,
                comments: await this.commentCount(v.id),
            };
        });

        return await Promise.all<SearchReturn>(results);
    }

    public async commentCount(songId: number | string) {
        const response = await this.fetch({
            url: `/base/fcgi-bin/fcg_global_comment_h5.fcg?g_tk=688287957&hostUin=0&format=json&inCharset=utf8&outCharset=utf8&notice=0&platform=yqq.json&needNewCode=0&cid=205360772&reqtype=1&biztype=1&topid=${songId}&cmd=4&needmusiccrit=0&pagenum=0&pagesize=0&lasthotcommentid=&domain=qq.com`,
        });

        return response.data.commenttotal;
    }
}

if (require.main === module) {
    !async function() {
        const a = new QQMusicAdapter();
        const r = await a.search({ songName: '好心分手', artistName: '卢巧音' });

        console.dir(r, {
            depth: null,
        })
    }()
}
