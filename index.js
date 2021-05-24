const puppeteer = require("puppeteer");
const SiteScraper = require("./siteScraper");
const dcr20Config = require("./siteConfig/dcr20");

// set up for puppetter to emulate real browser
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
    return [await browser.newPage(), browser];
}

const main = async () => {
    const [newPage, browser] = await createPuppeteerPage();
    const scraper = new SiteScraper(newPage, dcr20Config);

    //// to execute various `run` command
    /**
     * e.g.
     * addBooks: to scrape listing page
     * scrapeBook (w/ bookId): to download book info and storing content fragment
     * buildBook (w/ bookid): to build varoius usable format
     */
    await scraper.run("addBooks", (() => {
        const ret = [];
        for (let i=1; i<=47; i++)
            ret.push(`https://www.20dcr.com/xuanyi${i}.html`);
        return ret;
    })());
/*
    const bookId = "shouwuzuosuizhiwu";
    await scraper.run("scrapeBook", bookId);
    await scraper.run("buildBook", bookId);
*/

    ///// DON'T EDIT BELOW
    await browser.close();
}

main();