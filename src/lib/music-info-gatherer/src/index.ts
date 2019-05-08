import * as fs from 'fs';
import * as path from 'path';
import * as emitter from 'events';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter, SearchOptions, SearchReturn } from './adapters/abstract';
import { info, warn, error } from './logger';
import ProxyPool from './proxy_pool';

import moment from 'moment';
import axios from 'axios';
import Redis from 'ioredis';
import AsyncLock from 'async-lock';
import puppeteer from 'puppeteer';

const proxyConfig = require('../../../../config/proxy.json');

const lock = new AsyncLock();

const Adapters = {
    itunes: ItunesAdapter,
    kkbox: KkboxAdapter,
    netease: NeteaseMusicAdapter,
    qq: QQMusicAdapter,
    spotify: SpotifyAdapter,
    youtube: YoutubeAdapter,
};

export type adapters = typeof Adapters;

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

    private refreshLock = false;

    private refreshPublisher = new emitter.EventEmitter();

    public domesticProxyPool: ProxyPool;

    public foreignProxyPool: ProxyPool;

    public redis: Redis.Redis;

    constructor(options: GathererOptions) {
        const gatherer = this;

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
                if (gatherer.refreshLock) {
                    return await new Promise((resolve, reject) => {
                        gatherer.refreshPublisher.on('refreshed', (result) => {
                            resolve(result);
                        });
                    });
                }

                gatherer.refreshLock = true;

                let proxy;

                try {
                    const url = proxyConfig.domestics[0];
                    const response = await axios(url);
                    proxy = `http://${response.data.domain}:${response.data.port}`;

                    info({
                        module: 'music-info-gatherer',
                        desc: 'got domestic proxy',
                        proxy,
                        url,
                        time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    });
                } catch (e) {
                    error({
                        module: 'music-info-gatherer',
                        desc: 'getting proxy error',
                        time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                        error: {
                            message: e.message,
                            stack: e.stack,
                        },
                    });
                }

                gatherer.refreshPublisher.emit('refreshed', proxy);

                gatherer.refreshLock = false;

                return proxy;
            },
        });

        this.foreignProxyPool = new ProxyPool({
            name: 'foreignProxyPool',
            strategy: 'rotate',
            async get() {
                const interval = 5000;
                const availableKey = 'proxy#foreignProxyPool#unavailable';

                const proxies = proxyConfig.foreign;

                const size = proxies.length;

                let next = Number(await gatherer.redis.get('proxy#foreignProxyPool#next')) % size;
                await gatherer.redis.setex('proxy#foreignProxyPool#next', 300, (next + 1) % size);

                await new Promise((resolve, reject) => {
                    lock.acquire('foreign', async (cb) => {
                        let available = await gatherer.redis.get(`${availableKey}#${next}`);

                        while (available !== null) {
                            next = (next + 1) % size;
                            available = await gatherer.redis.get(`${availableKey}#${next}`);

                            await new Promise((resolve, reject) => {
                                setTimeout(() => {
                                    resolve();
                                }, interval / size);
                            });
                        }

                        await gatherer.redis.set(`${availableKey}#${next}`, '');
                        await gatherer.redis.pexpire(`${availableKey}#${next}`, interval);

                        cb();
                    }, (err, ret) => {
                        err && error({
                            module: 'music-info-gatherer',
                            desc: 'getting proxy error',
                            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                            error: {
                                message: err.message,
                                stack: err.stack,
                            },
                        });

                        resolve(ret);
                    });
                });

                info({
                    module: 'music-info-gatherer',
                    desc: 'got foreign proxy',
                    proxy: proxies[next],
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                });

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
                error({
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
    
        return null;
    }

    public async search(songName: string, artistName: string) {
        const options = { songName, artistName };
    
        const results: { [prop in keyof typeof Adapters]?: SearchReturn[] | null } = {};

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

    public async screenShot(url: string, path: string, channel: string) {
        ;
    }
}

if (require.main === module) {
    !async function() {
        const gatherer = new Gatherer({
            proxies: {
            },
        });

        const r = await gatherer.search('东西', '林俊呈');
        const ws = fs.createWriteStream(path.join(__dirname, '../../../../x.json')); 
        ws.write(JSON.stringify(r));
        ws.end();

        await gatherer.redis.disconnect();
        await gatherer.domesticProxyPool.destroy();
        await gatherer.foreignProxyPool.destroy();
    }()
}
