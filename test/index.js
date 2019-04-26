const fs = require('fs');
const sample = require('../tocsv.json');
const { list2csv } = require('./utils');

const tunnels = Object.keys(sample[0].data);

const orderedHeaderMap = tunnels.reduce((acc, cur) => {
    acc.set(cur, cur);
    return acc;
}, new Map([[' ', ' ']]));

const map = sample.reduce((acc, cur) => {
    const d = cur.data;
    Object.keys(d).forEach(k => {
        if (d[k] && d[k].name) {
            if (acc[d[k].name] == undefined) {
                acc[d[k].name] = {};
            }

            switch (k) {
                case 'itunes': acc[d[k].name][k] = '存在'; break;
                case 'qq': acc[d[k].name][k] = d[k].comments; break;
                case 'netease': acc[d[k].name][k] = d[k].comments; break;
                case 'kkbox': acc[d[k].name][k] = '存在'; break;
                case 'spotify': acc[d[k].name][k] = '存在'; break;
                case 'youtube': acc[d[k].name][k] = d[k].views; break;
            }
        }
    });

    return acc;
}, {});

const list = Object.keys(map).reduce((acc, cur) => {
    const entry = map[cur];
    entry[' '] = cur;
    acc.push(entry);

    return acc;
}, []);

const csv = list2csv(list, orderedHeaderMap).replace(/"undefined"/g, '"未找到"');

const ws = fs.createWriteStream('runtime/x.csv');
ws.write(csv);
ws.end();

console.dir(csv, {
    depth: null,
});
