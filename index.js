const puppeteer = require("puppeteer");
const fs = require("fs");
const diskdb = require("diskdb");

// class SiteScraper {
//     _configHandler = {};

//     _getter(name, preferStale=true) {
//         let staleValue = this._staleConfig[name];
//         if (preferStale && staleValue)
//             return staleValue;

//         const newValue = this._configHandler[stale].apply();
//         if (typeof newValue !== "undefined") {
//             return newValue;
//         }
//     }

//     _getMetaFile() {
//         return `./${this.siteConfig.siteId}.json`;
//     }

//     constructor(browser, siteConfig) {
//         this.browser = browser;
//         this.page = await browser.newPage;
//         this.siteConfig = siteConfig;

//         this.metaData = JSON.parse(fs.readFileSync(this._getMetaFile()));

//         await this.page.goto(url);
//     }

//     destructor() {
//         fs.writeFileSync(dataFile, JSON.stringify(this._getMetaFile()));
//     }
// }

const cool18Config = (() => {
    const CollPageUrl = `https://www.cool18.com/bbs4/index.php?app=forum&act=gold&p=`;
    return {
        siteId: 'cool18',
        url: 'https://www.cool18.com/bbs4/index.php',
        configHandler: {
            "numColPage": async () => {
                return 18;
            }
        },
        pages: {
            getStoryListOnColPage: (ctx, pageId) => {
                ctx.page.goTo(CollPageUrl + pageId);
                
            },
            
        }
    }
})();

const dcrConfig = (() => {
    const CollPageUrl = `https://www.cool18.com/bbs4/index.php?app=forum&act=gold&p=`;
    return {
        siteId: 'dcr20',
        url: 'https://www.cool18.com/bbs4/index.php',
        url: {

            book: (name) => {
                return `https://www.20dcr.com/book/${name}/`
            },

        },
        method: {
            getStoryListOnColPage: (ctx, pageId) => {
                ctx.page.goTo(CollPageUrl + pageId);
                
            },
            
        }
    }
})();

const bookPath = "./book";

const main = async () => {
    // const browser = await puppeteer.connect({
    //     browserWSEndpoint: 'wss://chrome.browserless.io?--user-data-dir=/tmp/session-123',
    // });
    const browser = await puppeteer.launch();

    const db = diskdb.connect("./db");
    db.loadCollections(['dcr20']);

    // const c = new SiteScraper(browser, cool18Config);

    /*
    readIndex
    
    */

    //c.destructor();

    await browser.close();
};

main();