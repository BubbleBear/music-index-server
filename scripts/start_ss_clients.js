const cp = require('child_process');
const util = require('util');

const config = require('../config/shadowsocks.json');

const clientProsessPool = [];

async function start(startPort = 7777) {
    const serverList = config.configs;

    // console.log(serverList)

    // todo: increase port on start-up failure
    const commands = serverList.map(v => {
        return `ss-local -p ${v.server_port} -k ${v.password} -m ${v.method} -s ${v.server} -l ${startPort++}`;
    });

    await Promise.all(commands.map(async v => {
        try {
            const process = await util.promisify(cp.exec)(v);
            clientProsessPool.push(process);
        } catch (e) {
            console.log(e)
        }
    }));
}

process.on('beforeExit', async () => {
    console.log('beforeExit');
    clientProsessPool.forEach(v => {
        v.kill('SIGKILL');
    })
});

if (require.main === module) {
    start();
}
