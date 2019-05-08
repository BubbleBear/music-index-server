import puppeteer from 'puppeteer';

export interface BrowserPoolOptions {
    proxies: string[];
}

export default class BrowserPool {
    private browserPromises: Promise<puppeteer.Browser>[];

    constructor(options: BrowserPoolOptions) {
        const proxies = options.proxies;

        this.browserPromises = proxies.map(proxy => {
            return puppeteer.launch({
                args: [
                    `--proxy-server=${proxy}`,
                ],
            });
        });
    }
}
