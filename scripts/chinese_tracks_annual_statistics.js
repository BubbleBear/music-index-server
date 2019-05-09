const fs = require('fs');

const list2csv = require('./utils').list2csv;

const mongo = require('mongodb');

let client;
let db;

async function getDB(useClient) {
    if (!db) {
        client = useClient || await mongo.connect('mongodb://localhost', {
            keepAlive: 5 * 60 * 1000,
            useNewUrlParser: true,
        });

        db = client.db('qq_music_crawler');
    }

    return db;
}

function isChinese(str) {
    var patrn = /[\u4E00-\u9FA5]|[\uFE30-\uFFA0]/gi;
    if (!patrn.exec(str)) {
        return false;
    } else {
        return true;
    }
}

if (require.main === module) {
    !async function() {
        await getDB();

        const matrix = [];

        const companyCursor = db.collection('company').find({}).sort({ company_id: 1 });

        const yearSet = new Set;

        const entry = {
            '中文歌曲数量': '中文歌曲数量',
        };

        while (await companyCursor.hasNext()) {
            const company = await companyCursor.next();

            

            const albums = await db.collection('album').find({
                album_id: {
                    $in: company.albumList.map(album => Number(album.album_id)),
                },
            }).toArray();

            albums.forEach((album) => {
                const year = album.aDate.split('-')[0];

                yearSet.add(year);

                entry[year] || (entry[year] = 0);

                if (isChinese(album.singername) || isChinese(album.name)) {
                    entry[year] += album.total;
                } else {
                    album.list.forEach((track) => {
                        if (isChinese(track.songname)) {
                            entry[year]++;
                        }
                    });
                }
            });

            console.log(company.company_id);
        }

        matrix.push(entry);

        const years = [...yearSet].sort((a, b) => {
            return Number(a) - Number(b);
        });

        const head = years.reduce((acc, cur) => {
            acc.set(cur, cur);
            return acc;
        }, new Map( [['中文歌曲数量', '发行年份']] ));

        const csv = list2csv(matrix, head).replace(/"undefined"/g, '0');

        const ws = fs.createWriteStream('chinese_tracks_annual_statistics.csv');
        ws.write(csv);
        ws.end();

        client.close();
    }()
}
