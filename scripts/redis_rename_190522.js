const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

!async function() {
    const map = {
        'qq.music.crawler.status': 'qq.music:crawler:status',
        'qq.music.crawler.company': 'qq.music:crawler:company',
        'qq.music.statistics.date': 'qq.music:statistics.date',
        'downloading.file': 'file:downloading',
        'cached.file': 'file:cached',
        'music.index.config': 'config',
    };

    for (key in map) {
        await redis.exists(key) &&
        await redis.rename(key, `music-index:${map[key]}`);
    }

    redis.disconnect();
}()
