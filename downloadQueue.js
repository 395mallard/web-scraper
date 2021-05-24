const diskdb = require("diskdb");

/**
 * puppeteer goto wrapper to throttle calls to remote site
 */
class DownloadQueue {
    constructor(page) {
        this.page = page;
        this.lastFetchTs = undefined;

        this.db = diskdb.connect("./db/common");
        this.db.loadCollections(["blacklistUrl"]);
    }

    /**
     * if the most recent uncached fetch took place less than xx sec ago, add a delay
     */
    async goto(url) {
        if (this.db.blacklistUrl.findOne({ url }))
            return undefined;

        if (this.lastFetchTs && this.lastFetchTs + 5000 > Date.now()) {
            await new Promise(resolve => {
                setTimeout(resolve, 6000);
            });
        }
        const res = await this.page.goto(url);
        if (!res.fromCache()) {
            this.lastFetchTs = Date.now();
            console.log(`${new Date().toLocaleString()}: ${url}`)
        }

        return res;
    }

    /**
     * mark a url to not download again
     */
    blacklistUrl(url) {
        if (!this.db.blacklistUrl.findOne({ url }))
            this.db.blacklistUrl.save({ url });
    }
}

module.exports = DownloadQueue;