import * as path from 'path';

import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import serve from 'koa-static';
import Router from 'koa-router';

const app = new Koa();

const router = new Router();

router.get('/', (ctx, next) => {
    ctx.body = 'asdf';
    next()
});

app
    .use(serve(path.join(__dirname, '../public')))
    .use(bodyparser())
    .use(router.routes())

app.listen(3000);
