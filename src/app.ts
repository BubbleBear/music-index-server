import * as path from 'path';

import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import serve from 'koa-static';
import Router from 'koa-router';

import Service from './service';

const app = new Koa();

const router = new Router({
    prefix: '/api/v1',
});

const service = new Service();

router.get('/company/:companyId/detail', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    ctx.body = embeded;

    next();
});

app
    .use(serve(path.join(__dirname, '../public')))
    .use(bodyparser())
    .use(router.routes())

app.listen(3000);
