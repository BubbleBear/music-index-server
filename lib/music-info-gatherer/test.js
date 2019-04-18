const puppeteer = require('puppeteer');

!async function() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://itunes.apple.com/cn/music-video/%E5%A5%BD%E5%BF%83%E5%88%86%E6%89%8B-%E4%BA%A2%E5%A5%AE%E7%89%88/294069146?uo=4');
    await page.screenshot({
        path: 'x.png'
    })

    browser.close();
}()
