const winston = require('winston');

const info = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/scripts/info.log', level: 'info' }),
    ],
});

const warn = winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/scripts/warn.log', level: 'warn' }),
    ],
});

const error = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/scripts/error.log', level: 'error' }),
    ],
});

module.exports = {
    info: info.info.bind(info),
    warn: warn.warn.bind(warn),
    error: error.error.bind(error),
};

if (require.main === module) {
}
