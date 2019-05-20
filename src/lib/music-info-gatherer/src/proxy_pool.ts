import redis from '../../../connection/redis';

const REDIS_PROXY_PREFIX = 'proxy#';

export interface ProxyPoolOptions {
    name: string;
    strategy: 'manual' | 'rotate';
    timeout?: number;
    get(): Promise<string | undefined>;
}

export default class ProxyPool {
    private name!: string;

    private timeout?: number;

    private strategy!: 'manual' | 'rotate';

    constructor(options: ProxyPoolOptions) {
        this.destructureOptions(options);
    }

    public async get(options?: any) {
        return await this[this.strategy](options);
    }

    public async manual(refresh: boolean = false) {
        let buffered: string | null | undefined = await redis.get(`${REDIS_PROXY_PREFIX}${this.name}`);

        if (buffered === null || refresh === true) {
            buffered = await this._get();

            if (this.timeout) {
                await redis.setex(`${REDIS_PROXY_PREFIX}${this.name}`, this.timeout, buffered);
            } else {
                await redis.set(`${REDIS_PROXY_PREFIX}${this.name}`, buffered);
            }
        }

        return buffered;
    }

    public async rotate() {
        return await this._get();
    }

    public async destroy() {
        return await redis.disconnect();
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
    }()
}
