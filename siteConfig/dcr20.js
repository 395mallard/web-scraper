const SiteScraper = require("../siteScraper");

/**
 * site specific config how to scrape
 */

module.exports = (() => {
    return {
        // internal identifier for this site
        siteId: 'dcr20',

        // domain url to prepend
        baseUrl: 'https://www.20dcr.com',

        // the set of commands it supports
        runs: {
            /**
             * scrape the array of listing pages provided for potential book page links
             */
            addBooks: async (scraper, urls) => {
                if (typeof urls === 'string')
                    urls = [urls];
                for (let i=0; i<urls.length; i++) {
                    const url = urls[i];
                    // to return all anchor and return their href attributes
                    const hrefEls = await scraper.selectElsOnUrl(url, "a", ["href"]);

                    scraper.addItemUrls(hrefEls
                        .map(el => el.href)
                        .filter(href => href.match(/\/book\/(\w+)\//)));
                };
            },

            /**
             * scrape the main book url, then scrape each of its content fragments
             * fragments should be saved in fs `fragments` folder
             */
            scrapeBook: async (scraper, bookId) => {
                const bookInfo = await scraper.scrape("book", bookId);
                scraper.log(`scraping: ${bookInfo['title']}`);
                
                for (let i=0; i<bookInfo.fragments.length; i++) {
                    const f = bookInfo.fragments[i];
                    await scraper.scrape("fragment", bookId, ...f);
                }
            },

            /**
             * based on `fragments`:
             * - sort and combine to to _txtpart/`chap[01-xx]: ${name}.txt`
             * - convert each chap.txt to chap.html (with html header and template)
             * - combine chap.txt in right sequence to build one html
             * - convert the one html file to mobi
             */
            buildFile: async (scraper, bookId) => {
                const bookInfo = scraper._dbRead('book', bookId);
                const aggregation = scraper.generateFileAggregation(bookId,
                    // if two files generate the same chapter one, they will combine
                    (fileName) => {
                        let [ch] = fileName.split("_");
                        if (ch.length === 1)
                            ch = `0${ch}`;
                        return `Chapter ${ch}`;
                    }
                );

                // _txtpart
                const chapterTextList = [];
                const chapterHtmlList = [];
                for (const chapterName in aggregation) {
                    const fileList = aggregation[chapterName];
                    const chapterFile = scraper.combineFile(
                        fileList,
                        `${bookId}/_txtpart`,
                        `${chapterName}.txt`,
                    );

                    const chapterHtmlFile = scraper.combineFile(
                        fileList,
                        `${bookId}/_htmlpart`,
                        `${chapterName}.html`,
                        (txtContent) => {
                            return txtContent.replace(/\n/gm, "<br />\n");
                        }
                    );

                    chapterTextList.push([`${chapterFile}`, `\n==============  ${chapterName}  ============\n`]);
                    chapterHtmlList.push([`${chapterHtmlFile}`, `<h2>${chapterName}</h2>`]);
                }

                // .txt
                chapterTextList.sort();
                scraper.combineFile(chapterTextList, `${bookId}/_full`, `${bookInfo.title}.txt`)

                // .html
                chapterHtmlList.sort();
                scraper.combineFile(chapterHtmlList, `${bookId}/_full`, `${bookInfo.title}.html`)
            }
        },
        /**
         * entities are level of scraping; generally there are book and fragment level,
         * but there can be more complex levelling
         * 
         * each entity define the url, the dom selector, and post parsing logic for scraping
         * engine to retrieve info about this item
         */
        entities: {
            book: {
                url: (baseUrl, id) => `${baseUrl}/book/${id}/`,

                /**
                 * extract data from book page dom and add to key
                 * [domSelector, transformer1, transformer2 ...]
                 * if it ends with `single`, return a scalar rather than array
                 * 
                 * Cannot return nodeList due to Puppeteer page.evaluate() restriction
                 */
                parseRules: {
                    "title": [".media-body > h1.book-name > a", "text", 'single'],
                    "description": [".row .book-detail", "text", "trim", 'single'],
                    "author": [".book-info .book-name ~ .row .col-md-4:nth-child(1)", "text", "trim", "single"],
                    "genre": [".book-info .book-name ~ .row .col-md-4:nth-child(3)", "text", "trim", "single"],
                    "fragments": ["#all-chapter .panel-body .item > a", "ahref"],
                },

                /**
                 * After the parsing as specified by `parseRules`,
                 * allow additional enhancement/revision
                 */
                postParse: (info, bookId) => {
                    info.id = bookId;

                    /**
                     * fix 2 things with the fragment list
                     * 1. the 1st fragment 
                     */
                    const revisedF = [];
                    const f = info.fragments;
                    for (let i=0; i<f.length; i++) {
                        let [text, href] = f[i];
                        if (i == 0 && text.length > 5)
                            text = '1';
                        revisedF.push([`${text}_1`, href]);

                        for (let j=2; j<=8; j++) {
                            revisedF.push([
                                `${text}_${j}`,
                                href.replace(/\.html$/, `_${j}.html`)
                            ]);
                        }
                    }
                    info.fragments = revisedF;
                },
            },

            fragment: {
                url: (baseUrl, bookId, name, url) => url,
                isValidPage: (page, res) => {
                    return res.status() != "404";
                },
                postParse: (info, bookId, fname, furl, fsLayer) => {
                    if (!info.rawContent) return;
                    let rawContent = info.rawContent.replace("\n\n", "\n");
                    fsLayer.writeContent(bookId, fname, rawContent);
                    delete info.rawContent;
                    info.bookId = bookId;
                    info.name = fname;
                    info.url = furl;
                },
                parseRules: {
                    "rawContent": ["#cont-text", "text", "single"]
                }
            }
        },
    }
})();