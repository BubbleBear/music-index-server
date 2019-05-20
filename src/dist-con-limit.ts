import redis from './connection/redis';
import subscriber from './connection/subscriber';

const REDIS_PREFIX = 'dist-con-limit:';

let DEBUG = false;

export async function atom(domain: string, fn: (...args: any) => Promise<any>) {
    const atomChannel = `${REDIS_PREFIX}atom:${domain}`;
    const lock = await redis.setnx(domain, true);

    if (lock) {
        DEBUG && console.log('lock in: ', domain, ' : ', lock);
        await fn();
        DEBUG && console.log('lock out: ', domain, ' : ', lock);
        await redis.del(domain);

        await redis.publish(atomChannel, 'lock freed');

        return true;
    }

    subscriber.subscribe(atomChannel);

    return await new Promise(async (resolve) => {
        const cb = function (channel: string, message: string) {
            if (channel === atomChannel && message === 'lock freed') {
                resolve(false);

                subscriber.removeListener('message', cb);
            }
        }

        subscriber.on('message', cb);
    });
}

export async function cleanUp() {
    const keys = await redis.keys(`${REDIS_PREFIX}*`);

    return await Promise.all(keys.map(async key => {
        return await redis.del(key);
    }));
}

export default function wrapper(concurrency: number, domain: string) {
    const REDIS_DOMAIN = `${REDIS_PREFIX}${domain}`;
    const REDIS_LOCK = `${REDIS_DOMAIN}:lock`;
    const REDIS_COUNT = `${REDIS_DOMAIN}:count`;

    subscriber.subscribe(REDIS_DOMAIN);

    subscriber.on('message', async (channel, message) => {
        if (channel === REDIS_DOMAIN && message === 'decr') {
            while (!await atom(REDIS_LOCK, async () => {
                DEBUG && console.log(await count(), queue.length);
                if (await count() < concurrency && queue.length > 0) {
                    await schedule();
                }
            })) {};
        }
    });

    const queue: ReturnType<typeof exec.bind>[] = [];

    // const init = redis.del(REDIS_COUNT);

    async function incr() {
        return await redis.incr(REDIS_COUNT);
    }

    async function decr() {
        const result = await redis.decr(REDIS_COUNT);

        await redis.publish(REDIS_DOMAIN, 'decr');

        return result;
    }

    async function count() {
        return Number(await redis.get(REDIS_COUNT)) || 0;
    }

    async function schedule() {
        const next = queue.shift();
        next && await next();
    }

    async function exec(resolve: (value: any) => void, fn: () => Promise<any>) {
        while (!await atom(REDIS_LOCK, async () => {
            if (await count() < concurrency) {
                await incr();

                const result = await fn().catch((error) => error);
        
                resolve(result);
        
                await decr();
                await schedule();
            } else {
                queue.push(exec.bind(null, resolve, fn));
            }
        })) {}
    }

    async function limit<T>(fn: () => Promise<T>) {
        return new Promise<T>((resolve) => {
            exec(resolve, fn);
        });
    }

    return limit;
}

if (require.main === module) {
    !async function() {
        const arr = Array(4).fill(0);

        const limit = wrapper(2, 'test');
        const limit1 = wrapper(2, 'test');

        async function test() {
            let a: any;
            DEBUG = false;

            // a = arr.map(async (_, i) => {
            //     let r;

            //     while (r = await atom('test', async () => {
            //         return await new Promise(resolve => {
            //             setTimeout(() => {
            //                 console.log(i);
            //                 resolve();
            //             }, 1000);
            //         });
            //     }), !r) {
            //     };

            //     return r;
            // });

            a = [
                Promise.all(arr.map((_, i) => {
                    return limit(async () => {
                        return await new Promise(resolve => {
                            setTimeout(() => {
                                console.log('0: ', i);
                                resolve();
                            }, 1000);
                        });
                    });
                })),
                Promise.all(arr.map(async (_, i) => {
                    return limit1(async () => {
                        return await new Promise(resolve => {
                            setTimeout(() => {
                                console.log('1: ', i);
                                resolve();
                            }, 1000);
                        });
                    });
                })),
            ];

            await Promise.all(a);
        }

        await test();

        process.nextTick(() => {
            console.log(subscriber.listeners('message'));
        })

        console.log('done');
    }()
}
