const fs = require('fs');
const sample = require('../x.json');
const { list2csv } = require('./utils');

const headerMap = sample.reduce((acc, cur) => {
    acc[cur.name] = cur.name;
    return acc;
}, { ' ': ' ' });

const tunnels = Object.keys(sample[0].data);

const template = tunnels.reduce((acc, cur) => {
    acc[cur] = {};

    return acc;
}, {});

const map = sample.reduce((acc, cur) => {
    const d = cur.data;
    Object.keys(d).forEach(k => {
        switch (k) {
            case 'itunes': d[k] && (acc[k][d[k].name] = '存在'); break;
            case 'qq': d[k] && (acc[k][d[k].name] = d[k].comments); break;
            case 'netease': d[k] && (acc[k][d[k].name] = d[k].comments); break;
            case 'kkbox': d[k] && (acc[k][d[k].name] = '存在'); break;
            case 'spotify': d[k] && (acc[k][d[k].name] = '存在'); break;
            case 'youtube': d[k] && (acc[k][d[k].name] = d[k].views); break;
        }
    });

    return acc;
}, template);

const list = Object.keys(map).reduce((acc, cur) => {
    const entry = map[cur];
    entry[' '] = cur;
    acc.push(entry);

    return acc;
}, []);

const csv = list2csv(list, headerMap).replace(/"undefined"/g, '"不存在"');

const ws = fs.createWriteStream('runtime/x.csv');
ws.write(csv);
ws.end();

console.dir(csv, {
    depth: null,
});
