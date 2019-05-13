const cp = require('child_process');
const util = require('util');

const config = require('../config/export.json');

const clientProsessPool = [];

async function start(startPort = 7777) {
    const serverList = config.configs;
    let port = startPort;

    // console.log(serverList)

    for (const server of serverList) {
        let retry = 3;

        while (retry--) {
            try {
                const command = getCommand(server, port++);
                const process = cp.spawn('ss-local', command.split(' '));

                process.stdout.on('data', (chunk) => {
                    chunk && console.log(chunk.toString());
                })
            
                process.stderr.on('data', (chunk) => {
                    chunk && console.log(chunk.toString());
                })

                clientProsessPool.push(process);
            } catch (e) {
                console.log(e)
            }
        }
    }

    await Promise.all(clientProsessPool.map(process => {
        return new Promise((resolve, reject) => {
            process.on('close', (code, signal) => {
                console.log(code, signal)
                resolve();
            });
        });
    }));
}

function getCommand(args, port) {
    return `-p ${args.server_port} -k ${args.password} -m ${args.method} -s ${args.server} -l ${port}`;
}

function stop() {
    clientProsessPool.forEach(v => {
        v.kill('SIGKILL');
    })
}

process.on('beforeExit', async () => {
    stop();
});

if (require.main === module) {
    start();
}
