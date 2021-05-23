
class DownloadQueue {
    constructor(page) {
        this.page = page;
        this.lastFetchTs = undefined;

        this.db = diskdb.connect("./db/common");
        this.db.loadCollections(["blacklistUrl"]);
    }
    async goto(url) {
        if (this.db.blacklistUrl.findOne({ url }))
            return undefined;

        if (this.lastFetchTs && this.lastFetchTs + 5000 > Date.now()) {
            await new Promise(resolve => {
                setTimeout(resolve, 8000);
            });
        }
        const res = await this.page.goto(url);
        if (!res.fromCache()) {
            this.lastFetchTs = Date.now();
            console.log(`${new Date().toLocaleString()}: ${url}`)
        }

        return res;
    }
    blacklistUrl(url) {
        if (!this.db.blacklistUrl.findOne({ url }))
            this.db.blacklistUrl.save({ url });
    }
}

module.exports = DownloadQueue;