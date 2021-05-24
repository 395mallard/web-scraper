const diskdb = require("diskdb");
const FsLayer = require("./fs");
const DownloadQueue = require("./downloadQueue");

class SiteScraper {
    constructor(page, siteConfig) {
        this.page = page;
        this.siteConfig = siteConfig;

        this.fsHelper = new FsLayer(`_${siteConfig.siteId}_fragment`);

        this.db = diskdb.connect(`./db/${siteConfig.siteId}`);
        this.db.loadCollections([...(Object.keys(siteConfig.entities)), "_url"]);
        this.downloadQueue = new DownloadQueue(page);
    }

    generateFileAggregation(dir, aggregator, sorter) {
        const filePath = this.fsHelper.ls(dir);
        const groups = {};
        filePath.forEach((fileName) => {
            const chapterName = aggregator.call(null, fileName);
            if (!groups[chapterName])
                groups[chapterName] = [];
            groups[chapterName].push(fileName);
        })


        for (let chapterName in groups) {
            groups[chapterName].sort(sorter);
            groups[chapterName] = groups[chapterName].map(v => `${dir}/${v}`);
        }
        return groups;
    }

    combineFile(fileList, outputDir, outFile, converter) {
        const content = [];
        fileList.forEach((fileItem) => {
            let filePath = fileItem;
            if (typeof fileItem !== "string") {
                filePath = fileItem[0];
                const fileName = fileItem[1];
                if (fileName) {
                    content.push(`${fileName}`);
                }
            }
            let fileContent = this.fsHelper.readFile(filePath);
            if (converter)
                fileContent = converter.call(null, fileContent);

            content.push(fileContent);
        })
        this.fsHelper.writeContent(outputDir, outFile, content.join("\n"));
        return `${outputDir}/${outFile}`;
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

    async run(command, ...parameters) {
        if (!this.siteConfig.runs[command])
            throw new Error(`${command} not valid`);
        await this.siteConfig.runs[command].call(null, this, ...parameters);
    }

    log(message) {
        console.log(message);
    }

    async selectElsOnUrl(url, selector, attrs) {
        const res = await this.downloadQueue.goto(url);
        if (!res)
            return [];

        return await this.page.evaluate((selector, attrs) => {
            const nodeList = Array.from(document.querySelectorAll(selector));
            return nodeList.map((node) => {
                const ret = {};
                attrs.forEach((attr) => {
                    ret[attr] = node[attr];
                });
                return ret;
            });
        }, selector, attrs);
    }

    addItemUrls(urls) {
        urls.forEach((url) => {
            this._dbUpsert("_url", url, {
                id: url,
                type: 'item',
            });
        })
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