const fs = require('fs');

const list2csv = require('list2csv').default;

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

        const ChineseComs = [];

        const companyCursor = db.collection('company')
            .find({})
            .sort({ company_id: 1 });

        while (await companyCursor.hasNext()) {
            const company = await companyCursor.next();

            if (isChinese(company.name)) {
                ChineseComs.push(company);
            } else {
                const albums = await db.collection('album').find({
                    album_id: {
                        $in: company.albumList.map(album => Number(album.album_id)),
                    },
                }).toArray();

                albums.forEach(album => {
                    if (isChinese(album.singername) || isChinese(album.name)) {
                        ChineseComs.push(company);
                    } else {
                        album.list && album.list.forEach((track) => {
                            if (isChinese(track.songname)) {
                                ChineseComs.push(company);
                            }
                        });
                    }
                });
            }
        }

        const csv = list2csv(ChineseComs.map(com => ({
            id: com.company_id,
            name: com.name,
        })));

        const ws = fs.createWriteStream('all_chinese_coms.csv');
        ws.write(csv);
        ws.end();

        client.close();
    }()
}
