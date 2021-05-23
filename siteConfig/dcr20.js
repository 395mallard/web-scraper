
module.exports = {
    siteId: 'dcr20',
    baseUrl: 'https://www.20dcr.com',
    entities: {
        book: {
            url: (baseUrl, id) => {
                return `${baseUrl}/book/${id}/`
            },
            postParse: (info, bookId) => {
                info.id = bookId;
                
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
            parseRules: {
                "title": [".media-body > h1.book-name > a", "text", 'single'],
                "description": [".row .book-detail", "text", "trim", 'single'],
                "author": [".book-info .book-name ~ .row .col-md-4:nth-child(1)", "text", "trim", "single"],
                "genre": [".book-info .book-name ~ .row .col-md-4:nth-child(3)", "text", "trim", "single"],
                "fragments": ["#all-chapter .panel-body .item > a", "ahref"],
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
            },
            parseRules: {
                "rawContent": ["#cont-text", "text", "single"]
            }
        }
    },
}