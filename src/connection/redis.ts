import Redis from 'ioredis';

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
    keyPrefix: 'music-index:',
});

export default redis;
