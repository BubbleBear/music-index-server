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
        ssclient: {
            configs: object[],
        },
        domestics: string[],
        foreign: string[],
    } = {
        ssclient: { configs: [] },
        domestics: [],
        foreign: [],
    };

    private _init: Promise<void>;

    constructor(defaultConfigpath = path.join(__dirname, '../config/export.json')) {
        super();

        subscriber.on('message', async (channel, message) => {
            console.log(channel, message);
            
            if (channel === REDIS_CONFIG_KEY) {
                await this.pull();
            }
        });
        
        this._init = this.init(defaultConfigpath);
    }

    async init(configPath: string) {
        if (await redis.exists(REDIS_CONFIG_KEY)) {
            try {
                await this.pull();
            } catch (e) {
                await this.erase();
                await this.init(configPath);
            }
        } else {
            this._config.ssclient = require(configPath);
            await this.push('init');
        }
        
        this.emit('ready');
    }

    async erase() {
        await this._init;

        this._config = {
            ssclient: { configs: [] },
            domestics: [],
            foreign: [],
        };

        await redis.del(REDIS_CONFIG_KEY);
    }

    async pull() {
        const jsonStr = (await redis.get(REDIS_CONFIG_KEY))!;
        this._config = JSON.parse(jsonStr);
        this.emit('pulled');
    }

    async push(message: string) {
        await this._init;

        const jsonStr = JSON.stringify(this._config);
        await redis.set(REDIS_CONFIG_KEY, jsonStr);
        await redis.publish(REDIS_CONFIG_KEY, message);
        this.emit('pushed');
    }

    async set(key: keyof Config['_config'], value: Config['_config'][typeof key]) {
        await this._init;
        
        this._config[key] = value;
        await this.push(key);
    }

    async get(key: keyof Config['_config']): Promise<Config['_config'][keyof Config['_config']]> {
        await this._init;

        return JSON.parse(JSON.stringify(this._config[key]));
    }

    async dump(): Promise<Config['_config']> {
        await this._init;

        return JSON.parse(JSON.stringify(this._config));
    }
}

if (require.main === module) {
    !async function() {
        const config = await new Config();

        config.set('ssclient', {
            configs: [],
        });
    }()
}
