const puppeteer = require("puppeteer");
const diskdb = require("diskdb");
const FsLayer = require("./fs");
const DownloadQueue = require("./downloadQueue");
const SiteScraper = require("./siteScraper");
const dcr20Config = require("./siteConfig/dcr20");

const createPuppeteerPage = async () => {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
    ];
    const browser = await puppeteer.launch({
        args,
        userDataDir: '/tmp/puppeteerCache',
        ignoreHTTPSErrors: true,
        headless: true,
    });
    return await browser.newPage();
}

const main = async () => {
    const newPage = await createPuppeteerPage();
    const scraper = new SiteScraper(newPage, dcr20Config);

    const bookId = "tuilijingjichang";
    const bookInfo = await scraper.scrape("book", bookId);

    console.log("BOOKINFO", bookInfo);
    
    for (let i=0; i<bookInfo.fragments.length; i++) {
        const f = bookInfo.fragments[i];
        await scraper.scrape("fragment", bookId, ...f);
    };

    await browser.close();
}