import AbstractAdapter, { SearchOptions, SearchReturn, AdapterOptions } from './abstract';
import { trim } from '../lib/utils';

import axios, { AxiosRequestConfig } from 'axios';
import ProxyAgent from 'proxy-agent';
import { JSDOM } from 'jsdom';

export default class KkboxAdapter extends AbstractAdapter {
    constructor(options: AdapterOptions = {}) {
        super(options);
    }
    
    private async fetch({ url }: AxiosRequestConfig) {
        return await axios({
            method: 'get',
            url,
            baseURL: 'https://www.kkbox.com',
            responseType: 'document',
            httpsAgent: new ProxyAgent(this.proxy),
            timeout: 10000,
        });
    }

    public async search(options: SearchOptions) {
        const response = await this.fetch({ url: `/tw/en/search.php?word=${encodeURIComponent(options.songName + ' ' + options.artistName)}` });

        const dom = new JSDOM(response.data);

        const songDataList = dom.window.document.querySelectorAll('td.song-data');

        return [].map.call<any, any, SearchReturn[]>(songDataList, (node: ParentNode) => {
            const songName = node.querySelector('a.song-title')!.textContent;
            const aa = node.querySelector('div.song-artist-album')!.children;
            const url = `https://www.kkbox.com${node.querySelector('a.song-title')!.getAttribute('href')}`;
            const artistName = (aa[0] as any).title;
            const albumName = (aa[1] as any).title;

            return {
                name: trim(songName!, { pattern: ' \n' }),
                artists: [
                    {
                        name: artistName,
                    },
                ],
                album: {
                    name: albumName,
                },
                url,
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        const a = new KkboxAdapter({
            proxy: 'socks://127.0.0.1:7778',
        });
        const r = await a.search({ songName: '假装', artistName: '蔡依林' });
        console.dir(r, {
            depth: null,
        });
    }()
}
