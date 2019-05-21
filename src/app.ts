import * as fs from 'fs';
import * as path from 'path';

import Koa from 'koa';
import bodyparser from 'koa-body';
import serve from 'koa-static';
import cors from '@koa/cors';
import axios from 'axios';

import Service from './service';
import router from './router';
import { info, warn, error } from './logger';
import { cleanUp } from './dist-con-limit';

process.setMaxListeners(20);

global.info = info;
global.warn = warn;
global.error = error;

try {
    fs.mkdirSync(path.join(__dirname, '../runtime'));
} catch (e) {}

const app = new Koa();

Object.defineProperty(app.context, 'service', {
    get: () => new Service(),
});

app
    .use(cors())
    .use(serve(path.join(__dirname, '../public')))
    .use(bodyparser({
        multipart: true,
    }))
    .use(router.prefix('/api/v1').routes())

cleanUp()
.then(async () => {
    const service = new Service();
    const running = await service.listDownloadingFiles();

    await Promise.all(running.map(async (v) => {
        await service.unmarkDownloading(v);
    }));
})
.then(() => {
    app.listen(3000, () => {
        console.log(`listening on port: 3000`);
    });
})
