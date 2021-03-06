import axios, { AxiosRequestConfig } from 'axios';
import ProxyAgent from 'proxy-agent';

import AbstractAdapter, { SearchOptions, AdapterOptions } from './abstract';
import { parseSetCookie } from '../lib/utils';

export default class SpotifyAdapter extends AbstractAdapter {
    constructor(options: AdapterOptions = {}) {
        super(options);
    }
    
    private async fetch({ url, method = 'get', headers }: AxiosRequestConfig) {
        return await axios({
            method,
            url,
            headers,
            httpsAgent: new ProxyAgent(this.proxy),
            timeout: 30000,
        });
    }

    public async search(options: SearchOptions) {
        const authResponse = await this.fetch({
            url: 'https://open.spotify.com/search/results/Authorization',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
            },
        });

        const setCookie = authResponse.headers['set-cookie'];

        const accessToken = parseSetCookie(setCookie)['wp_access_token'];

        const response = await this.fetch({
            url: `https://api.spotify.com/v1/search?type=album%2Cartist%2Cplaylist%2Ctrack%2Cshow_audio%2Cepisode_audio&q=${encodeURIComponent(options.songName + ' ' + options.artistName)}&decorate_restrictions=false&best_match=true&include_external=audio&limit=10&userless=true&market=US`,
            headers: {
                connection: 'keep-alive',
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
            },
        });

        return response.data.tracks.items.map((v: any) => {
            return {
                name: v.name,
                artists: v.artists.map((u: any) => {
                    return {
                        name: u.name,
                    };
                }),
                album: {
                    name: v.album.name,
                },
                url: v.external_urls.spotify,
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        const a = new SpotifyAdapter({
            proxy: 'socks://127.0.0.1:7780',
        });
        const r = await a.search({ songName: 'fa~!#!@sd4231', artistName: '王1234宇4123鹏' });

        console.dir(r, {
            depth: null,
        })
    }()
}
