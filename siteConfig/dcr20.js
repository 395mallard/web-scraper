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

                    scraper.addItemUrlsToScrape(hrefEls
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
                    await scraper.scrape("fragment", bookId, bookInfo.fragments[i]);
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
                const bookInfo = scraper._dbSelect('book', bookId);
                if (!bookInfo.id)
                    throw new Error(`${bookId} is not a valid item`);

                // 
                const aggregation = scraper.generateFileAggregation(
                    bookInfo.fragments,
                    // if two files generate the same chapter one, they will combine
                    (fragment) => {
                        let [ch] = fragment.id.split("_");
                        if (ch.length === 1)
                            ch = `0${ch}`;
                        return `ch${ch}`
                        return {
                            chapterName: fragment.name,
                            fileName: `ch${ch}`
                        }
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
                    "title": [".media-body > h1.book-name > a", "op:text", 'single'],
                    "coverImg": ["img.book-img-middel", "el:img", 'single'],
                    "description": [".row .book-detail", "op:text", "op:trim", 'single'],
                    "author": [".book-info .book-name ~ .row .col-md-4:nth-child(1)", "op:text", "op:trim", "single"],
                    "genre": [".book-info .book-name ~ .row .col-md-4:nth-child(3)", "op:text", "op:trim", "single"],
                    "fragments": ["#all-chapter .panel-body .item > a", "el:a"],
                },

                /**
                 * After the parsing as specified by `parseRules`,
                 * allow additional enhancement/revision
                 * 
                 * Mainly to clean up and reformat what was scrape, especially
                 * the fragmentList, [
                 *  { id: '1_1', name: 'xxxxxx', url: 'yyyy' }
                 * ]
                 */
                postParse: (scraper, info, bookId) => {
                    info.id = bookId;

                    /**
                     * fix 2 things with the fragment list
                     * 1. the 1st fragment name rename
                     * 2. for each chapter, divide into up to 8 child pages
                     */
                    const revisedF = [];
                    const f = info.fragments;
                    for (let i=1; i<=f.length; i++) {
                        const fragment = f[i-1];

                        // if (i == 1 && fragment.text.length > 5)
                        //     fragment.text = '1';

                        revisedF.push({
                            id: `${i}_1`,
                            name: `${fragment.text}`,
                            url: fragment.href
                        });

                        for (let j=2; j<=8; j++) {
                            revisedF.push({
                                id: `${i}_${j}`,
                                name: `${fragment.text}`,
                                url: fragment.href.replace(/\.html$/, `_${j}.html`)
                            });
                        }
                    }
                    info.fragments = revisedF;
                },
            },

            fragment: {
                url: (baseUrl, bookId, fragmentItem) => fragmentItem.url,
                isValidPage: (page, res) => {
                    return res.status() != "404";
                },
                /**
                 * 1. format rawcontent
                 * 2. save it to fs
                 * 3. delete rawContent from info because we don't want to save it to db
                 */
                postParse: (scraper, info, bookId, fragmentItem) => {
                    if (!info.rawContent) return;
                    let rawContent = info.rawContent.replace("\n\n", "\n");

                    scraper.saveFragmentContentToFs(bookId, fragmentItem.id, rawContent);

                    delete info.rawContent;
                    for (let k in fragmentItem)
                        info[k] = fragmentItem[k];
                    info.bookId = bookId;
                },
                parseRules: {
                    "rawContent": ["#cont-text", "op:text", "single"]
                }
            }
        },
    }
})();