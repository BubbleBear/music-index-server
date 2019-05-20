const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

!async function() {
    const k = await redis.keys('dist-con-limit:*')
    console.log(k)
}()
