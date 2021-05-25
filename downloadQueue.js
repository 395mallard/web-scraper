/**
 * puppeteer goto wrapper to throttle calls to remote site
 */
class DownloadQueue {
    constructor(page, commonDb) {
        this.page = page;
        this.lastFetchTs = undefined;
        this.commonDb = commonDb;
    }

    /**
     * if the most recent uncached fetch took place less than xx sec ago, add a delay
     */
    async goto(url) {
        if (this.commonDb.isBlackListedUrl(url))
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
}

module.exports = DownloadQueue;