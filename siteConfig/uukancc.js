const SiteScraper = require("../siteScraper");

module.exports = (() => {
    return {
        // internal identifier for this site
        siteId: 'uukancc',

        // domain url to prepend
        baseUrl: 'https://cn.uukanshu.cc',

        // the set of commands it supports
        runs: {
            scrapeBook: async (scraper, bookId) => {
                const bookInfo = await scraper.scrape("book", bookId);
                scraper.log(`scraping: ${bookInfo['title']}`);
                
                for (let i=0; i<bookInfo.fragments.length; i++) {
                    await scraper.scrape("fragment", bookId, bookInfo.fragments[i]);
                }
            },
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
                            const ch = scraper.addLeadingZero(fragment.id, 3);
                            return {
                                fileName: `${ch}-${fragment.text}.html`,
                                chapterName: fragment.text,
                            }
                        },
                        fragmentSorter: (fragmentA, fragmentB) => {
                            return parseInt(fragmentA.id) < parseInt(fragmentB.id);
                        },
                        postProcessors: [
                            scraper.generateToc,
                            //scraper.encodeSimplify,
                            scraper.htmlize,
                            scraper.buildHtmlPage,
                        ],
                        cleanup: (scraper, chapterList) => {
                            const fullBook = chapterList
                                .map(chapter =>
                                    chapter.htmlContent
                                        .replaceAll("<p>", "<br />\n")
                                        .replaceAll('</p>', '')
                                )
                                .join("\n\n");
                            scraper.fsHelper.writeContent(
                                `${bookInfo.id}/_html`,
                                `_full.html`,
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
                            return parseInt(fragmentA.id) < parseInt(fragmentB.id);
                        }
                    });
                    break;
                }
            }
        },
        entities: {
            book: {
                url: (baseUrl, id) => `${baseUrl}/book/${id}/`,
                parseRules: {
                    "title": [".book .bookinfo h1.booktitle", "op:text", 'single'],
                    "coverImg": [".book .bookinfo .p.bookintro img", "el:img", 'single'],
                    "description": [".book .bookinfo .p.bookintro", "op:text", "op:trim", 'single'],
                    "author": [".book .bookinfo .booktag a.red", "op:text", "op:trim", "single"],
                    //"genre": [".book .bookinfo .booktag .blue", "op:text", "op:trim", "single"],
                    "fragments": ["#list-chapterAll dd > a", "el:a"],
                },
                postParse: (scraper, info, bookId) => {
                    info.id = bookId;
                    let num = 1;
                    info.fragments.forEach(f => {
                        f.id = num++;
                    });
                },
            },

            fragment: {
                url: (baseUrl, bookId, fragmentItem) => fragmentItem.href,
                isValidPage: (page, res) => {
                    return res.status() != "404";
                },
                postParse: (scraper, info, bookId, fragmentItem) => {
                    if (!info.rawContent) return;
                    const rawContent = info.rawContent
                        .split(/(\n)+/)
                        .map(line => line.trim())
                        .join("\n");

                    scraper.saveFragmentContentToFs(bookId, fragmentItem.id, rawContent);

                    delete info.rawContent;
                    for (let k in fragmentItem)
                        info[k] = fragmentItem[k];
                    info.bookId = bookId;
                },
                parseRules: {
                    "rawContent": [".book .readcotent.bbb", "op:text", "single"]
                }
            }
        },
    }
})();