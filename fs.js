const fs = require("fs");

class FsLayer {
    constructor(dirName) {
        this.dirName = dirName;
        if (!fs.existsSync(this.dirName))
            fs.mkdirSync(this.dirName);
    }
    readContent(file) {
        const filePath = `${this.dirName}/${file}`;
        if (fs.existsSync(filePath))
            return fs.readFileSync(filePath, { encoding: 'utf8'});
        return false;
    }

    writeContent(subDir, id, content) {
        const dirPath = `${this.dirName}/${subDir}`;
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath, { recursive: true });

        const filePath = `${dirPath}/${id}`;
        fs.writeFileSync(filePath, content, { encoding: 'utf8' })
    }
}

module.exports = FsLayer;