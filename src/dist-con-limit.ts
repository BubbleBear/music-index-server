import redis from './connection/redis';

const REDIS_PREFIX = 'dist-con-limit:';

export default function wrapper(concurrency: number, domain: string) {
    const REDIS_DOMAIN = `${REDIS_PREFIX}${domain}`;
    const REDIS_LOCK = `${REDIS_DOMAIN}:lock`;
    const REDIS_COUNT = `${REDIS_DOMAIN}:count`;

    const queue: ReturnType<typeof exec.bind>[] = [];

    const init = redis.del(REDIS_LOCK, REDIS_COUNT);

    async function atom(fn: (...args: any) => Promise<any>) {
        await init;

        const lock = await redis.setnx(REDIS_LOCK, true);

        if (lock) {
            await fn();
        }

        await redis.del(REDIS_LOCK);

        return !!lock;
    }

    async function incr() {
        return await redis.incr(REDIS_COUNT);
    }

    async function decr() {
        return await redis.decr(REDIS_COUNT);
    }

    async function count() {
        await init;

        return Number(await redis.get(REDIS_COUNT)) || 0;
    }

    async function schedule() {
        await decr();

        const next = queue.shift();
        next && next();
    }

    async function exec(resolve: (value: any) => void, fn: () => Promise<any>) {
        while (!await atom(async () => {
            // console.log('count ########### ', await count());
            if (await count() < concurrency) {
                await incr();
    
                const result = fn().catch((error) => error);
        
                resolve(result);
        
                result.then(schedule);
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
        const arr = Array(10).fill(0);

        const limit = wrapper(2, 'test');

        async function test() {
            await Promise.all(arr.map((_, i) => {
                return limit(async () => {
                    return await new Promise(resolve => {
                        setTimeout(() => {
                            console.log(i);
                            resolve();
                        }, 1000);
                    });
                });
            }));
        }

        await test();
    }()
}
