const path = require('path');

const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

const a = `1075.zip    12255.zip  20409.zip   3608.zip   55531.zip  7953.zip   92575.zip
109402.zip  12696.zip  20418.zip   36329.zip  656.zip    8302.zip   94018.zip
1110.zip    12808.zip  204594.zip  36415.zip  70069.zip  83667.zip  972.zip
1185.zip    13025.zip  21352.zip   36711.zip  70412.zip  83669.zip  97548.zip
1214.zip    13308.zip  2597.zip    36778.zip  7474.zip   83699.zip  9899.zip
1219.zip    17161.zip  290.zip     4648.zip   7872.zip   89299.zip
1224.zip    18245.zip  33373.zip   5058.zip   7913.zip   90444.zip`

const filenames = a.split(/\s+/);

const keys = filenames.map(v => v.split('.')[0]);

const dir = '/home/vatel/music-index-server/runtime';

!async function() {
    await Promise.all(keys.map(async key => {
        await redis.hset('cached.file', key, path.join(dir, `${key}.zip`));
    }));
}()
