import * as emitter from 'events';

import moment from 'moment';
import axios from 'axios';
import Redis from 'ioredis';
import AsyncLock from 'async-lock';
import puppeteer from 'puppeteer';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';
import { SearchOptions, SearchReturn } from './adapters/abstract';
import { info, warn, error } from './logger';
import ProxyPool from './proxy_pool';
import BrowserPool from './browser_pool';
import { Config } from '../../../config';

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

const REDIS_FOREIGN_PROXY_LOCK = 'gatherer:foreign.proxy:lock';

let domesticBrowserPool: BrowserPool;

let foreignBrowserPool: BrowserPool;

export class Gatherer {
    private config!: Config;

    private domestics: { [prop: string]: any } & { netease: boolean, qq: boolean }
            = { netease: true, qq: true };

    private foreign: { [prop: string]: any } & { itunes: boolean, kkbox: boolean, spotify: boolean, youtube: boolean }
             = { itunes: true, kkbox: true, spotify: true, youtube: true };

    private refreshLock = false;

    private refreshPublisher = new emitter.EventEmitter().setMaxListeners(30);

    private chanSpeStrategy:
    { [prop: string]: (page: puppeteer.Page) => Promise<boolean> } = {
        youtube: async (page: puppeteer.Page) => {
            const res = await page.waitForSelector('yt-formatted-string');

            return !!res;
        },
        spotify: async (page: puppeteer.Page) => {
            const res = await page.waitForSelector('.cover-art-image.cover-art-image-loaded[style]');

            return !!res;
        }
    };

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

                await gatherer.init();

                let proxy;

                try {
                    const url = (await gatherer.config.get('domestics'))[0];
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
                const interval = 10000;
                const availableKey = 'proxy#foreignProxyPool#unavailable';

                await gatherer.init();
                const proxies = await gatherer.config.get('foreign');

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

    private async init() {
        if (!this.config) {
            this.config = new Config();
        }

        const browserConfig = await this.config.get('browserPool');

        if (!domesticBrowserPool) {
            domesticBrowserPool = new BrowserPool({
                chromePath: browserConfig.chromePath,
                headless: true,
            });

            await domesticBrowserPool.sync();
        }

        if (!foreignBrowserPool) {
            foreignBrowserPool = new BrowserPool({
                chromePath: browserConfig.chromePath,
                proxies: (await this.config.get('foreign')).slice(0, browserConfig.browserCap),
                headless: true,
            });

            await foreignBrowserPool.sync();
        }
    }

    public async retry(channel: keyof typeof Adapters, searchOptions: SearchOptions, initProxy?: string, times: number = 3) {
        let proxy = initProxy || (this.domestics[channel] ? await this.domesticProxyPool.get() : 
            this.foreign[channel] ? await this.foreignProxyPool.get() : undefined);

        const errors = [];

        while (times--) {
            try {
                const adapter = new Adapters[channel]({
                    proxy,
                });

                return await adapter.search(searchOptions);
            } catch (e) {
                errors.push(e);

                warn({
                    module: 'music-info-gatherer',
                    function: 'retry',
                    channel,
                    proxy,
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                });

                this.domestics[channel] && (proxy = await this.domesticProxyPool.get(true));
                this.foreign[channel] && (proxy = await this.foreignProxyPool.get());
            }
        }

        if (times === 0) {
            error({
                module: 'music-info-gatherer',
                function: 'retry',
                channel,
                proxy,
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

        await this.init();

        while (retry--) {
            try {
                if (this.domestics[channel]) {
                    page = await domesticBrowserPool.random.newPage();
                } else {
                    page = await foreignBrowserPool.random.newPage();
                }

                page.on('error', (e) => {
                    console.log(e);
                });

                await page.setCacheEnabled(true);

                await page.goto(url, {
                    timeout: 60000,
                    waitUntil: 'load',
                });

                console.log('loaded: ', url, '*********', path, '*********', channel);

                if (this.chanSpeStrategy[channel]) {
                    await this.chanSpeStrategy[channel](page);
                }

                console.log('fully loaded: ', url, '*********', path, '*********', channel);

                await page.screenshot({
                    path,
                });

                break;
            } catch (e) {
                errors.push(e);

                if (page) {
                    try {
                        await page.close();
                    } catch (err) {
                        warn({
                            module: 'music-info-gatherer',
                            function: 'screenshot#close',
                            url,
                            path,
                            channel,
                            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                            error: {
                                message: err.message,
                                stack: err.stack,
                            },
                        });
                    }
                }

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
                warn({
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

        // await gatherer.screenshot('https://open.spotify.com/track/2vehaGr6bpERquj9fPgQk0', './y.png', 'spotify');
        await gatherer.screenshot('https://www.youtube.com/watch?v=rnavVgXmqdU', './y.png', 'youtube');

        await gatherer.redis.disconnect();
        await gatherer.domesticProxyPool.destroy();
        await gatherer.foreignProxyPool.destroy();
    }()
}
