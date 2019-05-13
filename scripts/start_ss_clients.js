const cp = require('child_process');

const config = process.argv[2] ? JSON.parse(process.argv[2]) : require('../config/export.json');

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
                const ssp = cp.spawn('ss-local', command.split(' '));

                await new Promise((resolve, reject) => {
                    ssp.stdout.on('data', (chunk) => {
                        chunk && console.log(chunk.toString());
                        resolve();
                    })
                
                    ssp.stderr.on('data', (chunk) => {
                        chunk && console.log(chunk.toString());
                        reject();
                    })
                });

                clientProsessPool.push(ssp);

                break;
            } catch (e) {
                console.log(e);
            }
        }
    }

    await Promise.all(clientProsessPool.map(p => {
        return new Promise((resolve, reject) => {
            p.on('close', (code, signal) => {
                console.log(code, signal);
                resolve();
            });
        });
    }));
}

function getCommand(args, port) {
    return `-p ${args.server_port} -k ${args.password} -m ${args.method} -s ${args.server} -l ${port}`;
}

async function stop() {
    clientProsessPool.forEach(p => {
        // p.kill('SIGTERM');
        console.log(p)
    })

    // await Promise.all(clientProsessPool.map())
}

process.on('beforeExit', async () => {
    stop();
});

if (require.main === module) {
    !async function() {
        start();
        stop();
    }()
}
