import axios, { AxiosRequestConfig } from 'axios';
import ProxyAgent from 'proxy-agent';

import AbstractAdapter, { SearchOptions, AdapterOptions } from './abstract';

export default class YoutubeAdapter extends AbstractAdapter {
    constructor(options: AdapterOptions = {}) {
        super(options);
    }

    private async fetch({ url }: AxiosRequestConfig) {
        return await axios({
            method: 'get',
            url,
            responseType: 'json',
            baseURL: 'https://www.youtube.com',
            headers: {
                'x-youtube-client-name': '1',
                'x-youtube-client-version': '2.20190514',
                connection: 'keep-alive',
            },
            httpsAgent: new ProxyAgent(this.proxy),
            timeout: 30000,
        });
    }

    public async search(options: SearchOptions) {
        const response = await this.fetch({ url: `/results?search_query=${encodeURIComponent(options.songName + ' ' + options.artistName)}&sp=CAM%253D&pbj=1` });

        const data = response.data;

        const contents = data[1].response.contents;

        const result = contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer
            .contents[0].itemSectionRenderer.contents;

        return result.filter((v: any) => v.videoRenderer).map((v: any) => {
            v = v.videoRenderer;
            const viewsMatches = v.viewCountText.simpleText.match(/\D*([\d,]*)\D*/);
            const viewsString = viewsMatches ? viewsMatches[1] : null;
            const views = viewsString ? viewsString.replace(/,/g, '') : null;
            let tmp = v.shortBylineText;
            const artists = tmp.simpleText ? tmp.simpleText
                : tmp.runs.map((v: any) => {
                    return {
                        name: v.text,
                    };
                });

            return {
                name: v.title.simpleText,
                artists,
                album: {},
                views,
                url: `https://www.youtube.com/watch?v=${v.videoId}`,
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        const a = new YoutubeAdapter({
            proxy: 'socks://127.0.0.1:7780',
        });
        const r = await a.search({ songName: '我的掌纹是你', artistName: 'shelly佳' });
        console.dir(r, {
            depth: 4,
        })
    }()
}
