import winston from 'winston';

const infoLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/main/info.log', level: 'info' }),
    ],
});

const warnLogger = winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/main/warn.log', level: 'warn' }),
    ],
});

const errorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/main/error.log', level: 'error' }),
    ],
});

export const info = infoLogger.info.bind(infoLogger);
export const warn = warnLogger.warn.bind(warnLogger);
export const error = errorLogger.error.bind(errorLogger);

if (require.main === module) {
}
