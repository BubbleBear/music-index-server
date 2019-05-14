import puppeteer from 'puppeteer';

process.setMaxListeners(20);

export interface BrowserPoolOptions {
    proxies?: string[];
}

export default class BrowserPool {
    private _browsers: Promise<puppeteer.Browser>[];

    private browsers!: puppeteer.Browser[];

    constructor(options?: BrowserPoolOptions) {
        const proxies = options && options.proxies || [ '' ];

        this._browsers = proxies.map(proxy => {
            return puppeteer.launch({
                args: [
                    proxy.length ? `--proxy-server=${proxy}` : '',
                ],
                ignoreHTTPSErrors: true,
                headless: false,
            });
        });
    }

    async sync() {
        this.browsers = await Promise.all(this._browsers);
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

        await bp.sync();

        const b = bp.random;

        console.log(b.newPage)

        await bp.destroy();
    }()
}
