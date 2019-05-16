import * as emitter from 'events';
import * as path from 'path';

import Redis from 'ioredis';

import redis from './connection/redis';

const REDIS_CONFIG_KEY = 'music.index.config';

const subscriber = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

subscriber.subscribe(REDIS_CONFIG_KEY);

export class Config extends emitter.EventEmitter {
    private _config: {
        ssClient: {
            configs: object[],
        },
        domestics: string[],
        foreign: string[],
        browserPool: {
            chromePath: string,
            browserCap: number,
        },
    } = {
        ssClient: { configs: [] },
        domestics: [],
        foreign: [],
        browserPool: {
            chromePath: '',
            browserCap: 0,
        },
    };

    private _init: Promise<void>;

    constructor(defaultConfigDir = path.join(__dirname, '../config')) {
        super();

        subscriber.on('message', async (channel, message) => {
            console.log(channel, message);
            
            if (channel === REDIS_CONFIG_KEY) {
                await this.pull();
            }
        });
        
        this._init = this.init(defaultConfigDir);
    }

    async init(configDir: string) {
        if (await redis.exists(REDIS_CONFIG_KEY)) {
            try {
                await this.pull();
            } catch (e) {
                await this.erase();
                await this.init(configDir);
            }
        } else {
            this._config = require(path.join(configDir, 'index.json'));
            console.log(this._config)
            await this.push('init');
        }
        
        this.emit('ready');
    }

    async erase() {
        await this._init;

        this._config = {
            ssClient: { configs: [] },
            domestics: [],
            foreign: [],
            browserPool: {
                chromePath: '',
                browserCap: 0,
            },
        };

        await redis.del(REDIS_CONFIG_KEY);
    }

    async pull() {
        const jsonStr = (await redis.get(REDIS_CONFIG_KEY))!;
        this._config = JSON.parse(jsonStr);
        this.emit('pulled');
    }

    async push(message: string) {
        const jsonStr = JSON.stringify(this._config);
        await redis.set(REDIS_CONFIG_KEY, jsonStr);
        await redis.publish(REDIS_CONFIG_KEY, message);
        this.emit('pushed');
    }

    async set<T extends keyof Config['_config']>(key: T, value: Config['_config'][T]) {
        await this._init;
        
        this._config[key] = value;
        await this.push(key);
    }

    async get<T extends keyof Config['_config']>(key: T): Promise<Config['_config'][T]> {
        await this._init;

        return JSON.parse(JSON.stringify(this._config[key]));
    }

    async dump(): Promise<Config['_config']> {
        await this._init;

        return JSON.parse(JSON.stringify(this._config));
    }
}

export default new Config();

if (require.main === module) {
    !async function() {
        const config = await new Config();
        const conf1 = await new Config();
        // await config.erase();
        await config.set('domestics', []);
    }()
}
