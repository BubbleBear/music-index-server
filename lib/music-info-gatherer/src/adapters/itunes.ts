import AbstractAdapter, { SearchOptions } from './abstract';

import axios, { AxiosRequestConfig } from 'axios';

export default class ItunesAdapter extends AbstractAdapter {
    private async fetch({ url, method = 'get' }: AxiosRequestConfig) {
        return await axios({
            method,
            url,
            baseURL: 'https://itunes.apple.com',
        });
    }

    public async search(options: SearchOptions) {
        const response = await this.fetch({ url: `/search?term=${encodeURIComponent(options.songName)}&contry=CN&media=music&attribute=songTerm&limit=10` });

        return response.data.results.map((v: any) => {
            return {
                name: v.trackName,
                artists: [
                    {
                        name: v.artistName,
                    },
                ],
                album: {
                    name: v.collectionName,
                },
                url: v.trackViewUrl.replace(/\/us\//g, '/cn/'),
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        const a = new ItunesAdapter();
        const r = await a.search({ songName: '好心分手', artistName: 'Candy Lo' });

        console.dir(r, {
            depth: null,
        })
    }()
}
