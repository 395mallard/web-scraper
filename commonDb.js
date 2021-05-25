const diskdb = require("diskdb");

class CommonDb {
    constructor() {
        this.db = diskdb.connect("./db/common");
        this.db.loadCollections(["blacklistUrl"]);
    }

    /**
     * mark a url to not download again
     */
     blacklistUrl(url) {
        if (!this.db.blacklistUrl.findOne({ url }))
            this.db.blacklistUrl.save({ url });
    }

    isBlackListedUrl(url) {
        return this.db.blacklistUrl.findOne({ url }) !== undefined;
    }
}

module.exports = CommonDb;