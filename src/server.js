const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const fs = require('fs');
const crypto = require('crypto');

const client = require('./client');

transfersInProgress = {
    outgoing: {},
    incoming: {}
};

const networkCommands = {
    joinNetwork: function(name, listeningPort, address, port) {
        
        Object.keys(NODE_LIST).forEach(key => {
            // 'key' here is the incoming 'address:port' identifier of the node
            // Let the joining node know about all the other stored nodes
            client.sendMessage(`newNode ${NODE_LIST[key].name} ${NODE_LIST[key].listeningPort} ${key}`, listeningPort, address);

            // Let the other nodes know about the new joining node
            client.sendMessage(`newNode ${name} ${listeningPort} ${address}:${port}`, NODE_LIST[key].listeningPort, key.split(':')[0]);

            console.log(`newNode ${NODE_LIST[key].name} ${NODE_LIST[key].listeningPort} ${key}`)
        });

        // Let the joining node know about us 
        client.sendMessage(`newNodeMe ${UNIQUE_NAME} ${SERVER_PORT}`, listeningPort, address);

        NODE_LIST[`${address}:${port}`] = {
            name,
            address,
            listeningPort,
            lastPing: Date.now()
        };
        console.log(`${name} connected from ${address}:${port} (listening on port ${listeningPort})`);

        networkCommands['printFiles'](address, port);
    },
    newNode: function(name, listeningPort, addressAndPort) {
        NODE_LIST[`${addressAndPort}`] = {
            name,
            listeningPort,
            lastPing: Date.now()
        };
        console.log(`Connected to node ${name} from ${addressAndPort} (listening on port ${listeningPort})`);
    },
    newNodeMe: function(name, listeningPort, address, port) {
        NODE_LIST[`${address}:${port}`] = {
            name,
            address,
            listeningPort,
            lastPing: Date.now()
        };
        console.log(`Connected to node ${name} from ${address}:${port} (listening on port ${listeningPort})`);
    },
    ping: function(address, port) {
        if (!NODE_LIST[`${address}:${port}`]) return;
        NODE_LIST[`${address}:${port}`].lastPing = Date.now();
    },
    // unstableConnection will simulate unstable internet and deliberately drop packets
    requestFile: function(fileName, unstableConnection, address, port) {
        try {
            fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${fileName}`);
        } catch (err) {
            return client.sendMessage(`printThis "File does not exist. Try another node."`, NODE_LIST[`${address}:${port}`].listeningPort, address);
        }
        
        transfersInProgress.outgoing[`${address}:${port}:${fileName}`] = {};
        transfersInProgress.outgoing[`${address}:${port}:${fileName}`].fileName = fileName;
        if (unstableConnection == 'true') {
            transfersInProgress.outgoing[`${address}:${port}:${fileName}`].unstableConnection = true;
        }

        client.sendMessage(`startFileTransfer ${fileName}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
    },
    startFileTransfer: function(fileName, address, port) {
        transfersInProgress.incoming[`${address}:${port}:${fileName}`] = {};
        transfersInProgress.incoming[`${address}:${port}:${fileName}`].fileName = fileName;

        fs.writeFileSync(`./node_directories/${UNIQUE_NAME}/${transfersInProgress.incoming[`${address}:${port}:${fileName}`].fileName}`, '');

        client.sendMessage(`readyForFileTransfer ${fileName}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
    },
    readyForFileTransfer: function(fileName, address, port) {
        let data = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${fileName}`, 'utf-8');

        // Regex splits data into chunks. The \s\S part ensures we preserve newlines.
        let chunkArray = data.match(/[\s\S]{1,500}/g);

        transfersInProgress.outgoing[`${address}:${port}:${fileName}`].chunks = chunkArray;

        client.sendMessage(`fileChunk 0 ${fileName} ${chunkArray[0]}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
    },
    fileChunk: function(chunkNum, fileName, data, address, port) {
        fs.appendFileSync(`./node_directories/${UNIQUE_NAME}/${transfersInProgress.incoming[`${address}:${port}:${fileName}`].fileName}`, data);
        client.sendMessage(`chunkReceived ${chunkNum} ${fileName}`, NODE_LIST[`${address}:${port}`].listeningPort, address);


        transfersInProgress.incoming[`${address}:${port}:${fileName}`].lastChunkReceived = chunkNum;

        let timeoutFunc;
        function retryChunk() {
            if (transfersInProgress.incoming[`${address}:${port}:${fileName}`] && transfersInProgress.incoming[`${address}:${port}:${fileName}`].lastChunkReceived == chunkNum) {
                console.log(`Didn't get chunk ${1 + parseInt(chunkNum)} for ${fileName}, requesting again`);
                client.sendMessage(`chunkReceived ${chunkNum} ${fileName}`, NODE_LIST[`${address}:${port}`].listeningPort, address);

                clearTimeout(timeoutFunc);

                timeoutFunc = setTimeout(retryChunk, 5000);
            }
        }
        timeoutFunc = setTimeout(retryChunk, 5000);
    },
    chunkReceived: function(chunkNum, fileName, address, port) {
        chunkNum = parseInt(chunkNum);

        if (transfersInProgress.outgoing[`${address}:${port}:${fileName}`].chunks[chunkNum + 1]) {
            if (transfersInProgress.outgoing[`${address}:${port}:${fileName}`].unstableConnection && Math.floor(Math.random() * 4) == 3) {
                return;
            }

            client.sendMessage(`fileChunk ${chunkNum + 1} ${fileName} ${transfersInProgress.outgoing[`${address}:${port}:${fileName}`].chunks[chunkNum + 1]}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
        } else {
            let fileData = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${fileName}`, 'utf8');
            let fileHash = crypto.createHash('md5').update(fileData, 'utf8').digest('hex');

            delete transfersInProgress.outgoing[`${address}:${port}:${fileName}`];

            client.sendMessage(`transferComplete ${fileName} ${fileHash}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
        }
    },
    transferComplete: function(fileName, hash, address, port) {
        let fileData = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${fileName}`, 'utf8');
        let fileHash = crypto.createHash('md5').update(fileData, 'utf8').digest('hex');

        delete transfersInProgress.incoming[`${address}:${port}:${fileName}`];

        if (fileHash == hash) {
            console.log(`Hashes match! File ${fileName} successfully transferred!`);
        } else {
            console.log(`Malformed data detected. Try requesting the file again.`);
        }
    },
    printFiles: function(address, port) {
        let fileList = `----${UNIQUE_NAME}'s files----\n`;
        fs.readdirSync(`./node_directories/${UNIQUE_NAME}`).forEach(file => {
            fileList += ('\n' + file + ' | ');
            let fileData;

            try {
                fileData = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${file}`, 'utf8');
            } catch (err) {
                return console.error(err);
            }

            fileList += crypto.createHash('md5').update(fileData, 'utf8').digest('hex');
        });
        
        client.sendMessage(`printThis ${fileList}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
    },
    getFiles: function(address, port) {
        let response = {
            fileArr: []
        };
        fs.readdirSync(`./node_directories/${UNIQUE_NAME}`).forEach(file => {
            let fileData;

            try {
                fileData = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${file}`, 'utf8');
            } catch (err) {
                return console.error(err);
            }

            let hash = crypto.createHash('md5').update(fileData, 'utf8').digest('hex');

            response.fileArr.push({
                fileName: file,
                fileHash: hash
            });
        });

        response = JSON.stringify(response);
        
        console.log(NODE_LIST);
        console.log(address);
        console.log(port)

        client.sendMessage(`fileList ${response}`, NODE_LIST[`${address}:${port}`].listeningPort, address);
    },
    printThis: function(data) {
        console.log(data);
    },
    fileList: function(files, address, port) {
        let fileList = JSON.parse(files).fileArr;
        let filesUpdated = [];

        fileList.forEach(function(externFile) {
            let localFileData = null;

            try {
                localFileData = fs.readFileSync(`./node_directories/${UNIQUE_NAME}/${externFile.fileName}`, 'utf8');
            } catch (err) {
                // Just don't update localFileData
            }

            let localHash = null;
            if (localFileData) {
                localHash = crypto.createHash('md5').update(localFileData, 'utf8').digest('hex');
            } 

            if (!localFileData || (localHash != externFile.fileHash)) {
                client.sendMessage(`requestFile ${externFile.fileName} false`, NODE_LIST[`${address}:${port}`].listeningPort, address);
                filesUpdated.push(externFile.fileName);
            }
        });
        if (filesUpdated.length) {
            console.log(`The following files were missing/malformed and are being synced:`);
            filesUpdated.forEach(function(fileName) {
                console.log(`\n${fileName}`);
            });
        } else {
            // console.log(`All files are up to date!`);
        }
    }
};

function handleMessage(msg, rinfo) {
    msg = msg.toString();

    
    let command = msg.substring(0, msg.indexOf(' '));

    // if (msg != 'ping' && msg.split(' ')[0] != 'fileChunk' && command != 'fileList' && msg != 'getFiles') {
        console.log(`[MESSAGE RECEIVED]: ${msg} from ${rinfo.address}:${rinfo.port}`);
    // }

    if (command == 'printThis') {
        networkCommands[command](msg.substring(msg.indexOf(' ') + 1), rinfo.address, rinfo.port);
    } else if (command == 'fileChunk') {
        let chunkNum = msg.split(' ')[1];
        let fileName = msg.split(' ')[2];
        let data = msg.split(' ').slice(3).join(' ');

        networkCommands['fileChunk'](chunkNum, fileName, data, rinfo.address, rinfo.port);
    } else {
        const inputArray = msg.split(' ');
        command = inputArray[0];
        const [, ...args] = inputArray;

        if (networkCommands[command]) {
            networkCommands[command](...args, rinfo.address, rinfo.port);
        }
    }
}

function handleError(err) {
    console.error(`[ERROR]:\n${err.stack}`);
    server.close();
}

function serverListening() {
    const address = server.address();
    console.log(`[SERVER LISTENING]: Listening on port ${address.port}`);

    if (SERVER_PORT != CONTACT_NODE_PORT) {
        client.joinNetwork(UNIQUE_NAME, CONTACT_NODE_PORT);
    }
}

function getFormattedNodeList() {
    let formattedString = ``;
    Object.keys(NODE_LIST).forEach(key => {
        formattedString += `${NODE_LIST[key].name} is connected from address ${key} (listening on port ${NODE_LIST[key].listeningPort})\n`;
    });
    return formattedString;
}

server.on('error', handleError);

server.on('message', handleMessage);

server.on('listening', serverListening);

server.bind(SERVER_PORT);

module.exports = { getFormattedNodeList };