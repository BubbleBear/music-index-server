import AbstractAdapter, { SearchOptions, SearchReturn } from './abstract';
import { trim } from '../lib/utils';

import axios, { AxiosRequestConfig } from 'axios';
import { JSDOM } from 'jsdom';
import { tify } from 'chinese-conv';

export default class KkboxAdapter extends AbstractAdapter {
    private async fetch({ url }: AxiosRequestConfig) {
        return await axios({
            method: 'get',
            url,
            baseURL: 'https://www.kkbox.com',
            responseType: 'document',
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
                name: tify(trim(songName!, { pattern: ' \n' })),
                artists: [
                    {
                        name: tify(artistName),
                    },
                ],
                album: {
                    name: tify(albumName),
                },
                url,
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        const a = new KkboxAdapter();
        const r = await a.search({ songName: '好心分手', artistName: '卢巧音' });
        console.log(r)
    }()
}