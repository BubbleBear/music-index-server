import Redis from 'ioredis';

const REDIS_CONFIG_KEY = 'config.key';

export class Config {
    redis: Redis.Redis;

    private _config!: object;

    constructor() {
        this.redis = new Redis({
            host: 'localhost',
            port: 6379,
            dropBufferSupport: true,
        });
    }
}
