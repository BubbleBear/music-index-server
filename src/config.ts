import * as emitter from 'events';
import * as path from 'path';

import redis from './connection/redis';
import subscriber from './connection/subscriber';

const REDIS_CONFIG_KEY = 'config';

export interface Config {
    ssClient: {
        configs: object[],
    },
    domestics: string[],
    foreign: string[],
    browserPool: {
        chromePath: string,
        browserCap: number,
    },
};

export class Config extends emitter.EventEmitter {
    private _config?: Config;

    public _init: Promise<void>;

    public get config() {
        return this._config ? JSON.parse(JSON.stringify(this._config)) : this._config;
    }

    constructor(defaultConfigDir = path.join(__dirname, '../config')) {
        super();

        subscriber.subscribe(REDIS_CONFIG_KEY);

        subscriber.on('message', async (channel, message) => {
            if (channel === REDIS_CONFIG_KEY) {
                await this.pull();
            }
        });
        
        this._init = this.init(defaultConfigDir);
    }

    private async init(configDir: string) {
        if (await redis.exists(REDIS_CONFIG_KEY)) {
            try {
                await this.pull();
            } catch (e) {
                console.log('error: ', e);
                await this.erase();
                await this.init(configDir);
            }
        } else {
            this._config = require(path.join(configDir, 'index.json'));
            await this.push('init');
        }

        this.emit('ready');
    }

    async erase() {
        await this._init;

        this._config = undefined;

        await redis.del(REDIS_CONFIG_KEY);
        await redis.publish(REDIS_CONFIG_KEY, 'erase');
    }

    async pull() {
        const jsonStr = (await redis.get(REDIS_CONFIG_KEY))!;

        if (jsonStr) {
            this._config = JSON.parse(jsonStr);
            this.emit('pulled');
        }
    }

    async push(message: string) {
        const jsonStr = JSON.stringify(this._config);
        await redis.set(REDIS_CONFIG_KEY, jsonStr);
        await redis.publish(REDIS_CONFIG_KEY, message);
        this.emit('pushed');
    }

    async set<T extends keyof Config>(key: T, value: Config[T]) {
        await this._init;

        this._config![key] = value;
        await this.push(key);
    }

    async get<T extends keyof Config>(key: T): Promise<Config[T]> {
        await this._init;

        return this.config[key];
    }

    async dump(): Promise<Config> {
        await this._init;

        return this.config;
    }
}

if (require.main === module) {
    !async function() {
        const config = new Config();
        // await config.erase();
        const conf1 = new Config();
        await conf1._init;
        console.log(await config.dump());
    }()
}
