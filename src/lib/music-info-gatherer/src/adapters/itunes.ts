import axios, { AxiosRequestConfig } from 'axios';
import ProxyAgent from 'proxy-agent';

import AbstractAdapter, { SearchOptions, AdapterOptions } from './abstract';

export default class ItunesAdapter extends AbstractAdapter {
    constructor(options: AdapterOptions = {}) {
        super(options);
    }

    private async fetch({ url, method = 'get' }: AxiosRequestConfig) {
        return await axios({
            method,
            url,
            baseURL: 'https://search.itunes.apple.com',
            httpsAgent: new ProxyAgent(this.proxy),
            headers: {
                'x-apple-store-front': '143465-19,32 t:music31',
            },
            timeout: 30000,
        });
    }

    public async search(options: SearchOptions) {
        const response = await this.fetch({ url: `/WebObjects/MZStore.woa/wa/search?os=12.0&term=${encodeURIComponent(options.songName + ' ' + options.artistName)}&lyrics=` });

        const resultObject = response.data.storePlatformData.lockup
            && response.data.storePlatformData.lockup.results
            || {};

        const result = Object.keys(resultObject).map(key => {
            const v = resultObject[key];

            return {
                name: v.name,
                artists: [
                    {
                        name: v.artistName,
                    }
                ],
                album: {
                    name: v.collectionName,
                },
                url: v.url,
            };
        });

        return result;
    }
}

if (require.main === module) {
    !async function() {
        const a = new ItunesAdapter({
            proxy: 'socks://127.0.0.1:7777',
        });
        const r = await a.search({ songName: 'fa~!#!@sd4231', artistName: '王1234宇4123鹏' });

        console.dir(r, {
            depth: null,
        })
    }()
}
