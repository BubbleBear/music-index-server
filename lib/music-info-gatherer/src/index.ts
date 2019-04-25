import * as fs from 'fs';
import * as path from 'path';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter, SearchOptions } from './adapters/abstract';
import { info, warn, error } from './logger';
import ProxyPool from './proxy_pool';

import moment from 'moment';
import axios from 'axios';
import Redis from 'ioredis';
import AsyncLock from 'async-lock';

global.info = info;
global.warn = warn;
global.error = error;

const lock = new AsyncLock();

const Adapters = {
    // itunes: ItunesAdapter,
    kkbox: KkboxAdapter,
    // netease: NeteaseMusicAdapter,
    // qq: QQMusicAdapter,
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
    private domestics: { [prop: string]: any } & { itunes: boolean, netease: boolean, qq: boolean }
            = { itunes: true, netease: true, qq: true };

    private foreign: { [prop: string]: any } & { kkbox: boolean, spotify: boolean, youtube: boolean }
             = { kkbox: true, spotify: true, youtube: true };

    public domesticProxyPool: ProxyPool;

    public foreignProxyPool: ProxyPool;

    private redis: Redis.Redis;

    constructor(options: GathererOptions) {
        this.redis = new Redis({
            host: 'localhost',
            port: 6379,
            dropBufferSupport: true,
        });

        this.domesticProxyPool = new ProxyPool({
            name: 'domesticProxyPool',
            timeout: 3 * 60,
            strategy: 'manual',
            async get() {
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
            },
        });

        const gather = this;

        this.foreignProxyPool = new ProxyPool({
            name: 'foreignProxyPool',
            strategy: 'rotate',
            async get() {
                const interval = 10000;
                const availableKey = 'proxy#foreignProxyPool#unavailable';

                const proxies = [
                    'socks://127.0.0.1:7777',
                    'socks://127.0.0.1:7778',
                    'socks://127.0.0.1:7779',
                    'socks://127.0.0.1:7780',
                    // 'socks://127.0.0.1:7781',
                    // 'socks://127.0.0.1:7782',
                    // 'socks://127.0.0.1:7783',
                ];

                const size = proxies.length;

                let next = Number(await gather.redis.get('proxy#foreignProxyPool#next')) % size;
                await gather.redis.setex('proxy#foreignProxyPool#next', 300, (next + 1) % size);

                await new Promise((resolve, reject) => {
                    lock.acquire('', async (cb) => {
                        let available = await gather.redis.get(`${availableKey}#${next}`);

                        while (available !== null) {
                            next = (next + 1) % size;
                            available = await gather.redis.get(`${availableKey}#${next}`);

                            await new Promise((resolve, reject) => {
                                setTimeout(() => {
                                    resolve();
                                }, interval / size);
                            });
                        }

                        await gather.redis.set(`${availableKey}#${next}`, '');
                        await gather.redis.pexpire(`${availableKey}#${next}`, interval);

                        cb();
                    }, (err, ret) => {
                        resolve(ret);
                    });
                });

                console.log(proxies[next], moment().format('YYYY-MM-DD HH:mm:ss SSS'))
                
                return proxies[next];
            },
        });
    }

    public async retry(tag: keyof typeof Adapters, searchOptions: SearchOptions, initProxy?: string, times: number = 3) {
        let proxy = initProxy || (this.domestics[tag] ? await this.domesticProxyPool.get() : 
            this.foreign[tag] ? await this.foreignProxyPool.get() : undefined);

        while (times--) {
            try {
                const adapter = new Adapters[tag]({
                    proxy,
                });

                return await adapter.search(searchOptions);
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

                this.domestics[tag] && (proxy = await this.domesticProxyPool.get(true));
                this.foreign[tag] && (proxy = await this.foreignProxyPool.get());
            }
        }
    
        return [];
    }

    public async search(songName: string, artistName: string) {
        const options = { songName, artistName };
    
        const results: any = {};

        const foreignProxy = await this.foreignProxyPool.get();

        await Promise.all(Object.keys(Adapters).map(async k => {
            const tk: keyof typeof Adapters = k as keyof typeof Adapters;
            
            results[tk] = await this.retry(
                tk,
                options,
                this.foreign[tk] ? foreignProxy : undefined,
                3,
            );
        }));
    
        return results;
    }

}

if (require.main === module) {
    !async function() {
        const gatherer = new Gatherer({
            proxies: {
                // itunes: proxy,
                // netease: proxy,
                // qq: proxy,
                // kkbox: proxy,
            },
        });

        const r = await gatherer.search('大碗宽面', '吴亦凡');
        const ws = fs.createWriteStream(path.join(__dirname, '../../../x.json')); 
        ws.write(JSON.stringify(r));
        ws.end();

        await gatherer.domesticProxyPool.destroy();
        await gatherer.foreignProxyPool.destroy();
    }()
}
