const cp = require('child_process');

const Redis = require('ioredis');
const moment = require('moment');

const logger = require('./logger');

const REDIS_CONFIG_KEY = 'music.index.config';

const clientProsessPool = [];

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

const subscriber = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

subscriber.subscribe(REDIS_CONFIG_KEY);

async function start(startPort = 7777) {
    let config;
    const confStr = await redis.get(REDIS_CONFIG_KEY);

    if (confStr) {
        config = JSON.parse(confStr).ssClient;
    } else {
        try {
            config = require('../config/index.json').ssClient;
        } catch (e) {}
    }

    // it's essential to shuffle the serverlist to tolerate ss server failures;
    const serverList = shuffle(config.configs);
    let port = startPort;

    for (const server of serverList) {
        let retry = 3;

        while (retry--) {
            try {
                const command = getCommand(server, port++);
                const ssp = cp.spawn('ss-local', command.split(' '));

                await new Promise((resolve, reject) => {
                    ssp.stdout.on('data', (chunk) => {
                        resolve();

                        logger.info({
                            module: 'scripts/ss',
                            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                            desc: 'ss std output',
                            message: chunk.toString(),
                        });
                    });
                
                    ssp.stderr.on('data', (chunk) => {
                        reject();

                        logger.warn({
                            module: 'scripts/ss',
                            time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                            desc: 'ss error output',
                            message: chunk.toString(),
                        });
                    });
                });

                clientProsessPool.push(ssp);

                break;
            } catch (e) {
                logger.error({
                    module: 'scripts/ss',
                    time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                    desc: 'ss error',
                    error: {
                        message: e.message,
                        stack: e.stack,
                    },
                });
            }
        }
    }
}

function getCommand(args, port) {
    return `-p ${args.server_port} -k ${args.password} -m ${args.method} -s ${args.server} -l ${port}`;
}

function shuffle(source) {
    const target = Array(source.length);
    for (const i in source) {
        const j = parseInt(i * Math.random());
        target[i] = target[j];
        target[j] = source[i];
    }

    return target;
}

async function stop() {
    clientProsessPool.forEach(p => {
        p.kill('SIGKILL');
    })

    await Promise.all(clientProsessPool.map(p => {
        return new Promise((resolve, reject) => {
            p.on('close', (code, signal) => {
                console.log(code, signal);
                resolve();
            });
        });
    }));

    clientProsessPool.splice(0, clientProsessPool.length);
}

process.on('beforeExit', async () => {
    stop();
});

if (require.main === module) {
    !async function() {
        await start();
        
        setInterval(async () => {
            await stop();
            await start();
        }, process.argv[2] || 5 * 60 * 1000);

        false && subscriber.on('message', async (channel, message) => {
            if (channel === REDIS_CONFIG_KEY && message === 'ssclient') {
                await stop();
                await start();
            }
        });
    }()
}
