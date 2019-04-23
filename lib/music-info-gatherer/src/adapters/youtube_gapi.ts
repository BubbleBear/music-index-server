import AbstractAdapter, { SearchOptions, AdapterOptions } from './abstract';

import axios, { AxiosRequestConfig } from 'axios';
import ProxyAgent from 'proxy-agent';
import { tify } from 'chinese-conv';
import { google } from 'googleapis';

/**
 * The YouTube Data API uses a quota to ensure that developers use the 
 * service as intended and do not create applications that unfairly reduce 
 * service quality or limit access for others. All API requests, including 
 * invalid requests, incur at least a one-point quota cost. You can find the 
 * quota available to your application in the API Console.
 * 
 * Projects that enable the YouTube Data API have a default quota allocation 
 * of 10 thousand units per day, an amount sufficient for the overwhelming majority 
 * of our API users. Default quota, which is subject to change, helps us optimize 
 * quota allocations and scale our infrastructure in a way that is more meaningful 
 * to our API users. You can see your quota usage on the Usage tab for the API in 
 * the Google Developer's Console.
 * 
 * search:list => 100
 * 
 * video:list => 2
 * 
 * approximately 100 queries per day through this api
 */

google.options({
    agent: new ProxyAgent('socks://127.0.0.1:1086') as any,
});

export default class YoutubeAdapter extends AbstractAdapter {
    constructor(options: AdapterOptions = {}) {
        super(options);
    }

    public async search(options: SearchOptions) {
        const youtube = google.youtube({
            version: 'v3',
            auth: 'AIzaSyATZ0PYTQsjgzXGUN1iDgjNnhMAMSBru4s',
        });

        const response = await youtube.search.list({
            part: 'snippet',
            q: `${options.songName} ${options.artistName}`,
        });

        return response.data.items!.map(item => {
            const snippet = item.snippet!;

            return {
                name: tify(snippet.title!),
                artists: [
                    {
                        name: snippet.channelTitle!,
                    },
                ],
                album: {},
                views: 0,
                url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
            };
        });
    }
}

if (require.main === module) {
    !async function() {
        // const a = new YoutubeAdapter({
        //     proxy: 'socks://127.0.0.1:1086',
        // });
        // const r = await a.search({ songName: '好心分手', artistName: 'shawnyhc' });
        // console.dir(r, {
        //     depth: 4,
        // })

        const youtube = google.youtube({
            version: 'v3',
            auth: 'AIzaSyATZ0PYTQsjgzXGUN1iDgjNnhMAMSBru4s',
        });

        const response = await youtube.search.list({
            part: 'statistics',
        });
    }()
}
