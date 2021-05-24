const fs = require("fs");

/**
 * light wrapper for native `fs` node module
 * Used by scrapper to store book fragment
 */
class FsLayer {
    /**
     * @param siteName e.g. `dcr20`
     */
    constructor(siteName) {
        this.siteName = siteName;
        if (!fs.existsSync(this.siteName))
            fs.mkdirSync(this.siteName);
    }

    /// ALL operations use file path relative to site dir e.g. `./dcr20`

    /**
     * return scalar array (unsorted) of all file names under a subpath that is not 
     * prefixed with `.` nor `_`
     */
    ls(path) {
        const dirPath = `${this.dirName}/${path}`;
        return fs.readdirSync(dirPath).filter(name => !name.match(/^\_/));
    }

    /**
     * return the text content of a filePath
     */
    readFile(filePath) {
        return fs.readFileSync(`${this.dirName}/${filePath}`, { encoding: 'utf8' });
    }

    /**
     * write string content to file path
     */
    writeContent(subDir, fileName, content) {
        const dirPath = `${this.dirName}/${subDir}`;
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath, { recursive: true });

        const filePath = `${dirPath}/${fileName}`;
        fs.writeFileSync(filePath, content, { encoding: 'utf8' })
    }
}

module.exports = FsLayer;