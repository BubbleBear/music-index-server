import * as fs from 'fs';
import * as path from 'path';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter } from './adapters/abstract';
import { info, warn, error } from './logger';

import moment from 'moment';
import axios from 'axios';

global.info = info;
global.warn = warn;
global.error = error;

const Adapters = {
    itunes: ItunesAdapter,
    kkbox: KkboxAdapter,
    netease: NeteaseMusicAdapter,
    qq: QQMusicAdapter,
    spotify: SpotifyAdapter,
    youtube: YoutubeAdapter,
};

export interface GathererOptions {
    proxies: {
        itunes?: string,
        kkbox?: string,
        netease?: string,
        qq?: string,
        spotify?: string,
        youtube?: string,
    };
}

export class Gatherer {
    // private adapters: { [prop in keyof typeof Adapters]: Adapter } = {} as any;

    constructor(options: GathererOptions) {
        Object.keys(Adapters).forEach((v) => {
            // const tv: keyof typeof Adapters = v as keyof typeof Adapters;
            // this.adapters[tv] = new Adapters[tv]({ proxy: options.proxies[tv] });
        });
    }

    public async retry(tag: string, fn: Function, times: number = 5) {
        while (times--) {
            try {
                return await fn();
            } catch (e) {
                global.error({
                    module: 'music-info-gatherer',
                    adapter: tag,
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                });
            }
        }
    
        return [];
    }

    public async search(songName: string, artistName: string) {
        const p = { songName, artistName };
    
        const results: any = {};
    
        // await Promise.all(Object.keys(this.adapters).map(v => {
        //     const tv: keyof typeof Adapters = v as keyof typeof Adapters;
        //     return this.retry(tv, async () => results[tv] = await this.adapters[tv].search(p), 5);
        // }))

        // const proxy = await this.getProxy();
        const proxy = undefined;

        await Promise.all(Object.keys(Adapters).map(k => {
            const tk: keyof typeof Adapters = k as keyof typeof Adapters;
            return this.retry(
                tk,
                async () => results[tk] = await (new Adapters[tk]({ proxy })).search(p),
                5
            );
        }));
    
        return results;
    }

     async getProxy() {
        try {
            const response = await axios('http://183.129.244.16:88/open?user_name=VesselVatelap2&timestamp=1555670956&md5=B8FF018E0E42DDC6F2D67915A9CB943C&pattern=json&number=1');
            const proxy = `http://${response.data.domain}:${response.data.port}`;

            return proxy;
        } catch (e) {
            global.error({
                module: 'music-info-gatherer',
                desc: 'getting proxy error',
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                error: {
                    message: e.message,
                    stack: e.stack,
                },
            });

            return undefined;
        }
    }
}

if (require.main === module) {
    let proxy = undefined;
    proxy = 'http://' + '183.129.244.16' + ':' + '15971';

    !async function() {
        const gather = new Gatherer({
            proxies: {
                itunes: proxy,
                netease: proxy,
                qq: proxy,
                kkbox: proxy,
            },
        });

        const r = await gather.search('大碗宽面', '吴亦凡');
        const ws = fs.createWriteStream(path.join(__dirname, '../../../x.json')); 
        ws.write(JSON.stringify(r));
        ws.end();
    }()
}
