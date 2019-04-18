import AbstractAdapter, { SearchOptions } from '../abstract';
import { parseSetCookie } from '../../lib/utils';

import axios from 'axios';

export default class XiamiAdapter extends AbstractAdapter {
    private readonly codeMap: any = {
        SG_TOKEN_EMPTY: true,
        SG_TOKEN_EXPIRED: true,
    };

    private async fetch(url: string, params: any, cookie?: string): Promise<any> {
        console.log(params)
        return await axios.request({
            method: 'get',
            url,
            baseURL: 'https://www.xiami.com',
            params,
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36',
                cookie,
            },
        });
    }

    private sign(args: any, cookie: string) {
        const n = cookie.match(/(?:^|;\s*)xm_sg_tk=([^;]*)/)![1];
        const a = n.split('_')[0];

        const raw = a + "_xmMain_" + '/api/search/searchSongs' + '_'
            + '{"key":"安妮的仙境","pagingVO":{"page":1,"pageSize":60}}'

        const md5 = require('js-md5');

        const _s = md5(raw)

        return _s;
    }

    public async search(options: SearchOptions) {
        const args = {
            key: '安妮的仙境',
            pagingVO: {
                page: 1,
                pageSize: 60,
            },
        };

        let query = `_q=${JSON.stringify(args)}&_s=`;

        let cookie = 'xm_sg_tk=57792cbf71d0afb37f887208e4213286_1554802175303; xm_sg_tk.sig=-1giv0DRLV7-iTcHM1qUoONq2vtPKRKGrsbtBAZ1yMo;';

        try {
            let result = await this.fetch('/api/search/searchSongs', query + this.sign(args, cookie), cookie);

            console.log(result)

            if (this.codeMap[result.data.code]) {
                const headers = result.headers;
                const setCookie = headers['set-cookie'];
                cookie = parseSetCookie(setCookie);
                const e = this.sign(args, cookie);
                result = await this.fetch('/api/search/searchSongs', query + e, cookie);

                console.log(result)
            } else {
                console.log(result.data.code);
            }

            return [];
        } catch (e) {
            console.log(e);
            return [];
        }
    }
}

if (require.main === module) {
    !async function () {
        const a = new XiamiAdapter();
        const r = await a.search({ songName: '安妮的仙境', artistName: '班得瑞' });
        console.dir(r, {
            // depth: 4,
        })
    }()
}
