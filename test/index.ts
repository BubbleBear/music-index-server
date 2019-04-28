import { normalizeString } from '../src/utils';

const results = require('../x.json');

const songName = '东西';
const artistName = '林俊呈';

const bestMatches = Object.keys(results).reduce((acc, cur) => {
    console.log('--', cur)
    acc[cur] = (results as any)[cur].filter((v: any) => {
            console.log('----', songName
                ,normalizeString(v.name)
                ,normalizeString(v.name).includes(normalizeString(songName))
                , v.artists.reduce((acc: boolean, cur: any) => {
                    return acc || normalizeString(cur.name).includes(normalizeString(artistName));
                }, false))

            return normalizeString(v.name).includes(normalizeString(songName))
                && (normalizeString(v.name).includes(normalizeString(artistName))
                || v.artists.reduce((acc: boolean, cur: any) => {
                    console.log('------', cur.name, normalizeString(cur.name), normalizeString(cur.name).includes(normalizeString(artistName)))
                    
                    return acc || normalizeString(cur.name).includes(normalizeString(artistName));
                }, false));
        })[0] || null;

    return acc;
}, {} as any);

console.log(bestMatches)
