const Redis = require('ioredis');

const sub = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

const pub = new Redis({
    host: 'localhost',
    port: 6379,
    dropBufferSupport: true,
});

sub.subscribe('asdf');

sub.on('message', (channel, message) => {
    console.log(args);
});

pub.publish('asdf', 'asdf1');
