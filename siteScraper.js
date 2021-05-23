const fs = require("fs");

class SiteScraper {
    constructor(page, siteConfig) {
        this.page = page;
        this.siteConfig = siteConfig;

        this.fsHelper = new FsLayer(`_${siteConfig.siteId}_fragment`);

        this.db = diskdb.connect(`./db/${siteConfig.siteId}`);
        this.db.loadCollections(Object.keys(siteConfig.entities));
        this.downloadQueue = new DownloadQueue(page);
    }

    async scrape(type, ...parameters) {
        const entity = this.siteConfig.entities[type];
        if (!entity) throw `${type} is not a valid entity`;
        const itemUrl = entity.url.call(null, this.siteConfig.baseUrl, ...parameters);

        const res = await this.downloadQueue.goto(itemUrl);
        if (!res || entity.isValidPage && !entity.isValidPage.call(this, this.page, res)) {
            this.downloadQueue.blacklistUrl(itemUrl);
            return undefined;
        }
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
            entity.postParse.call(this, ret, ...parameters, this.fsHelper);
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

module.exports = SiteScraper;