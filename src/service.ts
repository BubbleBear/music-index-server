import mongo, { MongoClient, Db } from "mongodb";

export default class Service {
    private promise: Promise<MongoClient>;
    
    client!: MongoClient;

    private db!: Db;

    constructor(options?: any) {
        this.promise = mongo.connect('mongodb://localhost:27017', Object.assign({
            useNewUrlParser: true,
        }, options));
    }

    async sync() {
        if (this.db) {
            return;
        }

        this.client = await this.promise;
        this.db = this.client.db('qq_music_spider');
    }

    async findCompanies(companyIds: number[]) {
        await this.sync();

        const companyCollection = this.db.collection('company');

        const companies = await companyCollection.find({
            company_id: {
                $in: companyIds.map(v => Number(v)),
            },
        })
        .project({
            _id: 0,
        })
        .toArray();

        return companies;        
    }

    async findAlbums(albumIds: number[]) {
        await this.sync();

        const albumCollection = this.db.collection('album');

        const albums = await albumCollection.find({
            album_id: {
                $in: albumIds.map(v => Number(v)),
            },
        })
        .project({
            _id: 0,
        })
        .toArray();

        return albums;
    }

    async findEmbededAlbums(companyIds: number[]) {
        await this.sync();

        const companies = await this.findCompanies(companyIds);

        const albumIds = companies.reduce((acc: number[], company) => {
            acc = acc.concat(
                company.albumList.map(
                    (album: any) => parseInt(album.album_id),
                ),
            );

            return acc;
        }, []);

        const albums = await this.findAlbums(albumIds);

        const albumMap = albums.reduce((acc, album) => {
            acc[album.album_id] = album;
            return acc;
        }, {});

        companies.forEach(company => {
            company.albumList = company.albumList.map((album: any) => albumMap[album.album_id]);
        });

        return companies;
    }
}

if (require.main === module) {
    !async function() {
        const service = new Service();

        const r = await service.findEmbededAlbums([64, 30])

        console.dir(JSON.stringify(r), {
            depth: null,
        });

        await service.client.close();
    }();
}
