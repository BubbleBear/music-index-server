import puppeteer from 'puppeteer';
import lazyAwait, { LazyPromise } from 'lazy-await';

process.setMaxListeners(20);

export interface BrowserPoolOptions {
    proxies?: string[];
}

export default class BrowserPool {
    private browsers: LazyPromise<puppeteer.Browser>[];

    constructor(options?: BrowserPoolOptions) {
        const proxies = options && options.proxies || [ '' ];

        this.browsers = proxies.map(proxy => {
            return lazyAwait(puppeteer).launch({
                args: [
                    proxy.length ? `--proxy-server=${proxy}` : '',
                ],
            });
        });
    }

    get all() {
        return Array.from(this.browsers);
    }

    get random() {
        const index = parseInt((this.browsers.length * Math.random()).toString());

        return this.browsers[index];
    }

    public async destroy() {
        await Promise.all(this.browsers.map(browser => {
            return browser.close();
        }));
    }
}

if (require.main === module) {
    !async function() {
        const bp = new BrowserPool();

        const b = bp.random;

        console.log(b.newPage)

        await bp.destroy();
    }()
}
