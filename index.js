const puppeteer = require("puppeteer");

const fs = require("fs");
const diskdb = require("diskdb");
const stringHash = require("string-hash");

class FsLayer {
    constructor(dirName) {
        this.dirName = dirName;
        if (!fs.existsSync(this.dirName))
            fs.mkdirSync(this.dirName);
    }
    readContent(file) {
        const filePath = `${this.dirName}/${file}`;
        if (fs.existsSync(filePath))
            return fs.readFileSync(filePath, { encoding: 'utf8'});
        return false;
    }

    writeContent(subDir, id, content) {
        const dirPath = `${this.dirName}/${subDir}`;
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath, { recursive: true });

        const filePath = `${dirPath}/${id}`;
        fs.writeFileSync(filePath, content, { encoding: 'utf8' })
    }
}

class SiteScraper {
    _configHandler = {};

    _getter(name, preferStale=true) {
        let staleValue = this._staleConfig[name];
        if (preferStale && staleValue)
            return staleValue;

        const newValue = this._configHandler[stale].apply();
        if (typeof newValue !== "undefined") {
            return newValue;
        }
    }

    _getMetaFile() {
        return `./${this.siteConfig.siteId}.json`;
    }

    constructor(page, siteConfig) {
        this.page = page;
        this.siteConfig = siteConfig;

        this.fragmentFs = new FsLayer(`_${siteConfig.siteId}_fragment`);

        // this.metaData = JSON.parse(fs.readFileSync(this._getMetaFile()));
    }

    async scrape(type, ...parameters) {
        const entity = this.siteConfig.entities[type];
        if (!entity) throw `${type} is not a valid entity`;
        const itemUrl = entity.url.call(null, this.siteConfig.baseUrl, ...parameters);

        const res = await this.page.goto(itemUrl);
        console.log(`${itemUrl} cached ${res.fromCache()}`)

        const ret = await this.page.evaluate((entity) => {
            var ret = {};
            if (entity.parseRules) {
                for (const k in entity.parseRules) {
                    const [selector, ...processors] = entity.parseRules[k];
                    const nodeList = document.querySelectorAll(selector);
                    let value = nodeList;
                    processors.forEach((processor) => {
                        if (!value) return;
                        switch (processor) {
                            case 'single':
                                value = value[0];
                                break;
                            case 'text':
                                value = value.innerText;
                                break;
                            case "trim":
                                value = value.trim();
                                break;
                        }
                    });
                    ret[k] = value;
                }
            }

            if (entity.customParse) {
                entity.customParse(ret);
            }
            return ret;
        }, entity);
        console.log(ret);
        return ret;
    }

    destructor() {
        fs.writeFileSync(dataFile, JSON.stringify(this._getMetaFile()));
    }
}

const dcrConfig = (() => {
    return {
        siteId: 'dcr20',
        baseUrl: 'https://www.20dcr.com',
        entities: {
            book: {
                url: (baseUrl, id) => {
                    return `${baseUrl}/book/${id}/`
                },
                customParse: (ret) => {
                },

                parseRules: {
                    "title": [".media-body > h1.book-name > a", "single", "text"],
                    "description": [".row .book-detail", "single", "text", "trim"],

                },
            }
        },
    }
})();

const main = async () => {
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
    const newPage = await browser.newPage();

    const scraper = new SiteScraper(newPage, dcrConfig);
    const bookId = "tuilijingjichang";
    const bookInfo = await scraper.scrape("book", bookId);



    // const db = diskdb.connect("./db");
    // db.loadCollections(['dcr20']);

    // c.upsert(bookId, c);
    
    // i.chapters.forEach((cI) => {
    //     const f = c.scrapeFragment(cI.url));
    //     fragments[f.id] = cI.url;
    //     c.saveFragmentContent(f.id, f.textContent);

    // });
    // c.upsert(bookId, {
    //     fragments
    // });

    // for
    // readIndex
    
    // */

    // //c.destructor();

    await browser.close();
};

main();
