declare module NodeJS {
    interface Global {
        info: import('winston').LeveledLogMethod;
        warn: import('winston').LeveledLogMethod;
        error: import('winston').LeveledLogMethod;
    }
}
