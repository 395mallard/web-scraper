const diskdb = require("diskdb");
const FsLayer = require("./fs");
const DownloadQueue = require("./downloadQueue");
const CommonDb = require("./commonDb");

/**
 * site scraping framework facade
 */
class SiteScraper {
    constructor(page, siteConfig) {
        this.page = page;
        this.siteConfig = siteConfig;

        // file system abstraction
        this.fsHelper = new FsLayer(`_stash/${siteConfig.siteId}`);

        // each site owns a different set of tables
        this.db = diskdb.connect(`./db/${siteConfig.siteId}`);
        this.db.loadCollections([...(Object.keys(siteConfig.entities)), "_url"]);

        // a separate db handle to track common stuff
        this.commonDb = new CommonDb();

        // download queue, network interceptor
        this.downloadQueue = new DownloadQueue(page, this.commonDb);
    }

    /**
     * public interface for command runner
     * e.g. scraper.run('doThing', param1, param2)
     * execute the matching callback in siteConfig.runs.doThing
     *  */
    async run(command, ...parameters) {
        if (!this.siteConfig.runs[command])
            throw new Error(`${command} not valid`);

        // passing scraper as the first parameter to callback
        await this.siteConfig.runs[command].call(null, this, ...parameters);
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

    /**
     * 
     */
    saveFragmentContentToFs(itemId, fragmentId, content) {
        const dirPath = `${itemId}/_fragment`;
        this.fsHelper.writeContent(dirPath, fragmentId, content);
    }

    /**
     * scrape defined `entity` per siteConfig
     * e.g. scraper.scrape('book', 13453)
     * return a map of scraped data
     */
    async scrape(type, ...parameters) {
        const entity = this.siteConfig.entities[type];
        if (!entity) throw `${type} is not a valid entity`;

        // find out the matching url for this entity to scrape
        const itemUrl = entity.url.call(null, this.siteConfig.baseUrl, ...parameters);

        const res = await this.downloadQueue.goto(itemUrl);
        // if this page is encountering error, either by network or custom definition 
        // per isValidPage()
        if (!res || entity.isValidPage && !entity.isValidPage.call(this, this.page, res)) {
            this.commonDb.blacklistUrl(itemUrl);
            return undefined;
        }

        /**
         * run dom querying on this page; we need to return primitive data
         * (no function, no node) so each parseRule has a set of processor to 
         * transform the selected nodeList into primitve data
         */
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
                            // needs to be the last procssor to run
                            case 'single':
                                value = value[0];
                                break;

                            // return node text
                            case 'op:text':
                                value = value.map(v => v.innerText);
                                break;

                            case "op:trim":
                                value = value.map(v => v.trim());
                                break;

                            // extract vital info from anchor link element
                            case "el:a":
                                value = value.map(v => {
                                    return {
                                        text: v.innerText.trim(),
                                        href: v.href
                                    }
                                });
                                break;

                            case "el:img":
                                value = value.map(v => {
                                    return {
                                        src: v.src,
                                        title: v.title,
                                    }
                                });
                                break;
                        }
                    });
                    ret[k] = value;
                }
            }
            return ret;
        }, entity);

        if (entity.postParse) {
            entity.postParse.call(this, this, ret, ...parameters);
        }

        this._dbUpsert(type, ret.id, ret);
        return ret;
    }

    /**
     * helper method to log
     */
    log(message) {
        console.log(message);
    }

    /**
     * shortcut method to dom selection on a url
     * selector: "#header > a"
     * attrs: ["href", "innerText"]
     */
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

    /**
     * add potential item urls for scraping
     */
    addItemUrlsToScrape(urls) {
        urls.forEach((url) => {
            if (!this.db._url.findOne({ id: url }))
                this._dbUpsert("_url", url, {
                    id: url,
                    type: 'item',
                    status: "new"
                });
        })
    }

    // private helper method to upsert one instance of an entity to db
    // e.g. _dbUpsert('fragment', '1_3', { ... })
    _dbUpsert(type, id, data) {
        const query = {
            id
        }
        this.db[type].update(query, data, {
            multi: false,
            upsert: true
        });
    }

    // private helper method to single select one instance of an entity 
    _dbSelect(type, query) {
        this.db[type].findOne(query);
    }
}

module.exports = SiteScraper;