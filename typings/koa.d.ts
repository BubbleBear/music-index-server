import Service from '../src/service';

declare module 'koa' {
    interface BaseContext {
        service: Service;
    }
}
