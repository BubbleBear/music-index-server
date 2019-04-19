import * as fs from 'fs';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter } from './adapters/abstract';

const Adapters = {
    itunes: ItunesAdapter,
    kkbox: KkboxAdapter,
    netease: NeteaseMusicAdapter,
    qq: QQMusicAdapter,
    spotify: SpotifyAdapter,
    youtube: YoutubeAdapter,
};

export interface GatherOptions {
    proxies: {
        itunes?: string,
        kkbox?: string,
        netease?: string,
        qq?: string,
        spotify?: string,
        youtube?: string,
    };
}

export class Gather {
    private adapters: { [prop in keyof typeof Adapters]: Adapter } = {} as any;

    constructor(options: GatherOptions) {
        Object.keys(Adapters).forEach((v) => {
            const tv: keyof typeof Adapters = v as keyof typeof Adapters;
            this.adapters[tv] = new Adapters[tv]({ proxy: options.proxies[tv] });
        });
    }

    public async retry(tag: string, fn: Function, times: number = 5) {
        const errorBuffer = [];
    
        while (times--) {
            try {
                return await fn();
            } catch (e) {
                errorBuffer.push(e);
            }
        }
    
        console.log(tag, errorBuffer.map(e => e.message));
        return [];
    }

    public async search(songName: string, artistName: string) {
        const p = { songName, artistName };
    
        const results: any = {};
    
        await Promise.all([
            this.retry('itunes', async () => results.itunes = await this.adapters.itunes.search(p), 5),
            this.retry('kkbox', async () => results.kkbox = await this.adapters.kkbox.search(p), 5),
            this.retry('netease', async () => results.netease = await this.adapters.netease.search(p), 5),
            this.retry('qq', async () => results.qq = await this.adapters.qq.search(p), 5),
            this.retry('spotify', async () => results.spotify = await this.adapters.spotify.search(p), 5),
            this.retry('youtube', async () => results.youtube = await this.adapters.youtube.search(p), 5),
        ]);
    
        return results;
    }
}

if (require.main === module) {
    !async function() {
        const gather = new Gather({ proxies: {} });
        const r = await gather.search('好心分手', '卢巧音');
        const ws = fs.createWriteStream('x.json'); 
        ws.write(JSON.stringify(r));
        ws.end();
    }()
}
