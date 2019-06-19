import { Middleware } from 'koa';
import moment from 'moment';

export default function(): Middleware {
    return async function(ctx, next) {
        try {
            await next();
        } catch (e) {
            global.error({
                module: 'exception catcher',
                time: moment().format('YYYY-MM-DD HH:mm:ss SSS'),
                path: ctx.path,
                query: ctx.query,
                error: {
                    message: e.message,
                    stack: e.stack,
                },
            });
        }
    }
}
