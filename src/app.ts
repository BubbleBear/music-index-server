import * as path from 'path';

import Service from './service';
import router from './router';
import { info, warn, error } from './logger';

import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import serve from 'koa-static';
import cors from '@koa/cors';

global.info = info;
global.warn = warn;
global.error = error;

const app = new Koa();

app.context.service = new Service;

app
    .use(cors())
    .use(serve(path.join(__dirname, '../public')))
    .use(bodyparser())
    .use(router.prefix('/api/v1').routes())

app.listen(3000, () => {
    console.log(`listening on port: 3000`);
});
