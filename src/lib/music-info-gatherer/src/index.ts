import * as fs from 'fs';
import * as path from 'path';
import * as emitter from 'events';

import moment from 'moment';
import axios from 'axios';
import Redis from 'ioredis';
import AsyncLock from 'async-lock';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { Adapter, SearchOptions, SearchReturn } from './adapters/abstract';
import { info, warn, error } from './logger';
import ProxyPool from './proxy_pool';
import BrowserPool from './browser_pool';

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

const domesticBrowserPool = new BrowserPool({}, false);

const foreignBrowserPool = new BrowserPool({
    proxies: proxyConfig.foreign,
});

export class Gatherer {
    private domestics: { [prop: string]: any } & { netease: boolean, qq: boolean }
            = { netease: true, qq: true };

    private foreign: { [prop: string]: any } & { itunes: boolean, kkbox: boolean, spotify: boolean, youtube: boolean }
             = { itunes: true, kkbox: true, spotify: true, youtube: true };

    private refreshLock = false;

    private refreshPublisher = new emitter.EventEmitter().setMaxListeners(30);

    public domesticProxyPool: ProxyPool;

    public foreignProxyPool: ProxyPool;

    public redis: Redis.Redis;

    constructor() {
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
                    proxy = response.data.domain && response.data.port
                        ? `http://${response.data.domain}:${response.data.port}`
                        : undefined;

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

        const errors = [];

        while (times--) {
            try {
                const adapter = new Adapters[tag]({
                    proxy,
                });

                return await adapter.search(searchOptions);
            } catch (e) {
                errors.push(e);

                warn({
                    module: 'music-info-gatherer',
                    function: 'retry',
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

        if (times === 0) {
            error({
                module: 'music-info-gatherer',
                function: 'retry',
                adapter: tag,
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                errors,
            });
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

    public async screenshot(url: string, path: string, channel: string) {
        let page;

        let retry = 3;

        const errors = [];

        while (retry--) {
            try {
                if (this.domestics[channel]) {
                    await domesticBrowserPool.sync();
                    page = await domesticBrowserPool.random.newPage();
                } else {
                    await foreignBrowserPool.sync();
                    page = await foreignBrowserPool.random.newPage();
                }

                page.on('error', (e) => {
                    console.log(e);
                });

                await page.goto(url, {
                    timeout: 10000,
                    waitUntil: 'load',
                });

                console.log('loaded: ', url, '*********', path, '*********', channel);

                await page.screenshot({
                    path,
                });

                break;
            } catch (e) {
                errors.push(e);

                warn({
                    module: 'music-info-gatherer',
                    function: 'screenshot',
                    url,
                    path,
                    channel,
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                });
            }
        }

        if (retry === 0) {
            error({
                module: 'music-info-gatherer',
                function: 'screenshot',
                url,
                path,
                channel,
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                errors,
            });
        }

        if (page) {
            try {
                await page.close();
            } catch (e) {
                error({
                    module: 'music-info-gatherer',
                    function: 'screenshot#close',
                    url,
                    path,
                    channel,
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                });
            }
        }
    }
}

if (require.main === module) {
    !async function() {
        const gatherer = new Gatherer();

        // const r = await gatherer.search('好心分手', '卢巧音');
        // const ws = fs.createWriteStream(path.join(__dirname, '../../../../x.json')); 
        // ws.write(JSON.stringify(r));
        // ws.end();

        await gatherer.screenshot('https://y.qq.com/n/yqq/song/002Iaday3kk555.html', './y.png', 'qq');

        await gatherer.redis.disconnect();
        await gatherer.domesticProxyPool.destroy();
        await gatherer.foreignProxyPool.destroy();
    }()
}
