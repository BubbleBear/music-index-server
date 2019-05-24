import Redis from 'ioredis';
import redis from './redis';

const subscriber = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

subscriber.setMaxListeners(100);

export default subscriber;

if (require.main === module) {
    !async function() {
        subscriber.subscribe('a');
        subscriber.subscribe('a');

        subscriber.on('message', (channel, message) => {
            console.log(channel, message);
        });

        await redis.publish('a', 'b');
    }()
}
