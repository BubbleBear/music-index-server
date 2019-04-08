import Router from 'koa-router';

import Service from './service';

const router = new Router();
const service = new Service();

router.get('/company/:companyId/detail', async (ctx, next) => {
    const params = ctx.params;

    const companyIds = [ params.companyId ];

    const embeded = await service.findEmbededAlbums(companyIds);

    ctx.body = embeded;

    next();
});

router.post('/cleanse_crawler_cache', async (ctx, next) => {
    ctx.body = await service.cleanseCrawlerCache();

    next();
});

export default router;
