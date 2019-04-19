import * as fs from 'fs';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter } from './adapters/abstract';
import { info, warn, error } from './logger';

import moment from 'moment';

global.info = info;
global.warn = warn;
global.error = error;

const Adapters = {
    itunes: ItunesAdapter,
    kkbox: KkboxAdapter,
    netease: NeteaseMusicAdapter,
    qq: QQMusicAdapter,
    // spotify: SpotifyAdapter,
    // youtube: YoutubeAdapter,
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
    private adapters: { [prop in keyof typeof Adapters]: Adapter } = {} as any;

    constructor(options: GathererOptions) {
        Object.keys(Adapters).forEach((v) => {
            const tv: keyof typeof Adapters = v as keyof typeof Adapters;
            this.adapters[tv] = new Adapters[tv]({ proxy: options.proxies[tv] });
        });
    }

    public async retry(tag: string, fn: Function, times: number = 5) {
        while (times--) {
            try {
                return await fn();
            } catch (e) {
                error({
                    module: 'music-info-gatherer',
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    desc: 'album error',
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                    adapter: tag,
                });
            }
        }
    
        return [];
    }

    public async search(songName: string, artistName: string) {
        const p = { songName, artistName };
    
        const results: any = {};
    
        await Promise.all(Object.keys(this.adapters).map(v => {
            const tv: keyof typeof Adapters = v as keyof typeof Adapters;
            return this.retry(tv, async () => results[tv] = await this.adapters[tv].search(p), 5);
        }))
    
        return results;
    }
}

if (require.main === module) {
    !async function() {
        const gather = new Gatherer({ proxies: {} });
        const r = await gather.search('好心分手', '卢巧音');
        const ws = fs.createWriteStream('x.json'); 
        ws.write(JSON.stringify(r));
        ws.end();
    }()
}
