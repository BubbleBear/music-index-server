import puppeteer from 'puppeteer';

process.setMaxListeners(20);

process.on('SIGINT', async () => {
    console.log('releasing browser resources');
    await Promise.all(instances.map(async instance => {
        await instance.sync();
        await instance.destroy();
    }));
    console.log('browser resources released');
    process.exit(0);
});

const instances: BrowserPool[] = [];

export interface BrowserPoolOptions {
    chromePath: string;
    proxies?: (string | undefined)[];
    headless: boolean;
}

export default class BrowserPool {
    private _browsers: Promise<puppeteer.Browser>[];

    private browsers!: puppeteer.Browser[];

    constructor(options: BrowserPoolOptions) {
        const proxies = options && options.proxies || [ undefined ];

        this._browsers = proxies.map(proxy => {
            return puppeteer.launch({
                executablePath: options.chromePath,
                args: proxy ? [
                    `--proxy-server=${proxy}`,
                ] : undefined,
                ignoreHTTPSErrors: true,
                headless: options.headless,
            });
        });

        instances.push(this);
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
        const bp = new BrowserPool({
            chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false,
        });

        await bp.sync();

        const b = bp.random;

        console.log(b.newPage)

        await bp.destroy();
    }()
}
