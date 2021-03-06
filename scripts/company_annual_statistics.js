const fs = require('fs');

const list2csv = require('list2csv');

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

if (require.main === module) {
    !async function() {
        await getDB();

        const matrix = [];

        const companyCursor = db.collection('company').find({}).sort({ company_id: 1 });

        const yearSet = new Set;

        while (await companyCursor.hasNext()) {
            const company = await companyCursor.next();

            const entry = {
                id: company.company_id,
                name: company.name,
            };

            const albums = await db.collection('album').find({
                album_id: {
                    $in: company.albumList.map(album => Number(album.album_id)),
                },
            }).toArray();

            albums.forEach((album) => {
                const year = album.aDate.split('-')[0];

                yearSet.add(year);

                entry[year] = entry[year] === undefined ? album.total : entry[year] + album.total;
            });

            matrix.push(entry);

            console.log(company.company_id);
        }

        const years = [...yearSet].sort((a, b) => {
            return Number(a) - Number(b);
        });

        const head = years.reduce((acc, cur) => {
            acc.set(cur, cur);
            return acc;
        }, new Map( [['company_id', 'id'], ['name', '唱片公司']] ));

        const csv = list2csv(matrix, head).replace(/"undefined"/g, '0');

        const ws = fs.createWriteStream('company_annual_statistics.csv');
        ws.write(csv);
        ws.end();

        client.close();
    }()
}
