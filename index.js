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
    constructor(page, siteConfig) {
        this.page = page;
        this.siteConfig = siteConfig;

        this.fragmentFs = new FsLayer(`_${siteConfig.siteId}_fragment`);

        this.db = diskdb.connect(`./db/${siteConfig.siteId}`);
        this.db.loadCollections(Object.keys(siteConfig.entities));

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
                    const nodeList = Array.from(document.querySelectorAll(selector));
                    let value = nodeList;
                    processors.forEach((processor) => {
                        if (!value) return;
                        switch (processor) {
                            case 'single':
                                value = value[0];
                                break;
                            case 'text':
                                value = value.map(v => v.innerText);
                                break;
                            case "trim":
                                value = value.map(v => v.trim());
                                break;
                            case "ahref":
                                value = value.map(v => [
                                    v.innerText.trim(), v.href
                                ]);
                                break;
                        }
                    });
                    ret[k] = value;
                }
            }
            return ret;
        }, entity);

        if (entity.postParse) {
            entity.postParse.call(this, ret, ...parameters);
        }

        this._dbUpsert(type, ret.id, ret);
        return ret;
    }

    _dbUpsert(type, id, data) {
        const query = {
            id
        }
        this.db[type].update(query, data, {
            multi: false,
            upsert: true
        });
    }

    _dbRead(type, id) {
        return this.db[type].findOne({
            id
        })
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

                postParse: (info, bookId) => {
                    info.id = bookId;
                    // normalize chapter name
                    const f = info.fragments;
                    for (let i=0; i<f.length; i++) {
                        const [text, href] = f[i];
                        //if (i == 0 && text.length > 5)
                        f[i][0] = `${i}_1`;
                    }
                },

                parseRules: {
                    "title": [".media-body > h1.book-name > a", "text", 'single'],
                    "description": [".row .book-detail", "text", "trim", 'single'],
                    "author": [".book-info .book-name ~ .row .col-md-4:nth-child(1)", "text", "trim", "single"],
                    "genre": [".book-info .book-name ~ .row .col-md-4:nth-child(3)", "text", "trim", "single"],
                    "fragments": ["#all-chapter .panel-body .item > a", "ahref"],
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

    console.log("BOOKINFO", bookInfo);


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
