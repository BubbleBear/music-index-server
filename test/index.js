const fs = require('fs');

const contentStr = fs.readFileSync('./config/all_chinese_coms.csv').toString();

const content = contentStr.split(/[\r\n]+/);
const head = content.splice(0, 1)[0].split(',').map(v => {
    return v.match(/^\s*"?(.*?)"?\s*$/)[1];
});
const list = content.map((rowStr) => {
    const row = rowStr.split(',');
    const item = head.reduce((acc, cur, i) => {
        acc[cur] = row[i] && row[i].match(/^\s*"?(.*?)"?\s*$/)[1];

        return acc;
    }, {});

    return item;
});

console.log(list)
