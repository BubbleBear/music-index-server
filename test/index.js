const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

!async function() {
    await redis.hmset('test', {
        '阿斯顿发': 1
    })

    const items = await redis.hgetall('test');

    console.log(items);

    await redis.disconnect();
}()
