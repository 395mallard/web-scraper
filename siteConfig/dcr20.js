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
            buildBook: async (scraper, bookId, outputType) => {
                const bookInfo = scraper._dbSelect('book', bookId);
                if (!bookInfo.id)
                    throw new Error(`${bookId} is not a valid item`);

                switch (outputType) {
                case 'html':
                    scraper.aggregateFragments(bookInfo.id, {
                        fragments: bookInfo.fragments,
                        outDir: '_html',
                        aggregator: (fragment) => {
                            let [ch] = fragment.id.split("_");
                            if (ch.length === 1)
                                ch = `0${ch}`;
                            return {
                                fileName: `${ch}-${fragment.name}.html`,
                                chapterName: fragment.name,
                            }
                        },
                        fragmentSorter: (fragmentA, fragmentB) => {
                            const a = parseInt(fragmentA.id.replace('_', '.')) || fragmentA.id;
                            const b = parseInt(fragmentB.id.replace('_', '.')) || fragmentB.id;
                            return a < b;
                        },
                        postProcessors: [
                            scraper.generateToc,
                            scraper.htmlize,
                            scraper.buildHtmlPage,
                        ],
                        cleanup: (scraper, chapterList) => {
                            const fullBook = chapterList
                                .map(chapter => chapter.htmlContent)
                                .join("\n\n");
                            scraper.fsHelper.writeContent(
                                `${bookInfo.id}/_mobi`,
                                `${bookInfo.title}.html`,
                                fullBook
                            );
                        }
                    });
                    break;
                case 'txt':
                default:
                    scraper.aggregateFragments(bookInfo.id, {
                        fragments: bookInfo.fragments,
                        outDir: '_fulltxt',
                        aggregator: (fragment) => {
                            return {
                                fileName: `${bookInfo.title}.txt`
                            }
                        },
                        fragmentSorter: (fragmentA, fragmentB) => {
                            const a = parseInt(fragmentA.id.replace('_', '.')) || fragmentA.id;
                            const b = parseInt(fragmentB.id.replace('_', '.')) || fragmentB.id;
                            return a < b;
                        }
                    });
                    break;
                }
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