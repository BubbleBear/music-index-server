import * as path from 'path';

import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import serve from 'koa-static';

import router from './router';

const app = new Koa();

(app as any).childProcessMap = {};

app
    .use(serve(path.join(__dirname, '../public')))
    .use(bodyparser())
    .use(router.prefix('/api/v1').routes())

app.listen(3000, () => {
    console.log(`listening on port: 3000`);
});
