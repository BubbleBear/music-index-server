import Redis from 'ioredis';

const REDIS_PROXY_PREFIX = 'proxy#';

export interface ProxyPoolOptions {
    name: string;
    strategy: 'manual' | 'rotate';
    timeout?: number;
    get(): Promise<string | undefined>;
}

export default class ProxyPool {
    private name!: string;

    private redis: Redis.Redis;

    private timeout?: number;

    private strategy!: 'manual' | 'rotate';

    constructor(options: ProxyPoolOptions) {
        this.destructureOptions(options);

        this.redis = new Redis({
            host: 'localhost',
            port: 6379,
            dropBufferSupport: true,
        });
    }

    public async get(options?: any) {
        return await this[this.strategy](options);
    }

    public async manual(refresh: boolean = false) {
        let buffered: string | null | undefined = await this.redis.get(`${REDIS_PROXY_PREFIX}${this.name}`);

        if (buffered === null || refresh === true) {
            buffered = await this._get();

            if (this.timeout) {
                await this.redis.setex(`${REDIS_PROXY_PREFIX}${this.name}`, this.timeout, buffered);
            } else {
                await this.redis.set(`${REDIS_PROXY_PREFIX}${this.name}`, buffered);
            }
        }

        return buffered;
    }

    public async rotate() {
        return await this._get();
    }

    public async destroy() {
        return await this.redis.disconnect();
    }

    private async _get(): Promise<string | undefined> {
        throw new Error('underlay get method not implemented, which should be provide in constructing options');

        return '';
    }

    private destructureOptions(options: ProxyPoolOptions) {
        ({
            name: this.name,
            get: this._get,
            timeout: this.timeout,
            strategy: this.strategy,
        } = options);
    }
}

if (require.main === module) {
    !async function() {
        const redis = new Redis({
            host: 'localhost',
            port: 6379,
            dropBufferSupport: true,
        });

        await redis.setex('test', 10, null);

        const test = await redis.get('test');

        console.log(test)

        await redis.disconnect();
    }()
}
