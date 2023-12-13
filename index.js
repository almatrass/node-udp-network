// 1st argument specifies contact node address
CONTACT_NODE_ADDRESS = process.argv[2] || 'localhost';

// 2nd argument specifies the node we should first
// contact in order to join the network
CONTACT_NODE_PORT = parseInt(process.argv[3]) || 3333;

// 3rd argument specifies our own listening port
SERVER_PORT = parseInt(process.argv[4]) || CONTACT_NODE_PORT;

// 4th argument specifies unique name displayed on network
UNIQUE_NAME = process.argv[5] || `Genesis_node`;

NODE_LIST = {};

const client = require('./src/client');
const server = require('./src/server');

const crypto = require('crypto');

const cliCommands = {
    nodelist: function() {
        console.log(server.getFormattedNodeList());
    },
    myFiles: function() {
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
        console.log(fileList);
    },
    sendAllNodes: function(message) {
        Object.keys(NODE_LIST).forEach(key => {
            client.sendMessage(message, NODE_LIST[key].listeningPort, key.split(':')[0]);
        });
    },
    sendSpecificNode: function(message, nodeName) {
        Object.keys(NODE_LIST).forEach(key => {
            if (NODE_LIST[key].name == nodeName) {
                client.sendMessage(message, NODE_LIST[key].listeningPort, key.split(':')[0]);
            }
        });
    }
};

const stdin = process.openStdin();
stdin.on('data', function(data) {
    data = data.toString().replace('\n', '');
    // This regex splits the input by spaces, but ignores 
    // the spaces between double quotation marks
    const inputArray = data.match(/(".*?"|[^",\s]+)(?=\s* |\s*$)/g);
    const command = inputArray[0];
    const [, ...args] = inputArray;

    for (let i = 0; i < args.length; i++) {
        // This regex removes the quotes if they are first and last characters
        args[i] = args[i].replace(/^"(.*)"$/, '$1');
    }

    if (cliCommands[command]) {
        cliCommands[command](...args);
    }
});

const fs = require('fs');
const dir = `./node_directories/${UNIQUE_NAME}`;

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

setInterval(function() {
    Object.keys(NODE_LIST).forEach(key => {
        const node = NODE_LIST[key];

        client.sendMessage(`ping`, node.listeningPort, key.split(':')[0]);

        if (Date.now() - node.lastPing > 2000) {
            console.log(`${node.name} disconnected from the network`);
            delete NODE_LIST[key];
        }
    });
}, 500);

let syncNodeIndex = 0;

function checkInSync() {
    if (!Object.keys(NODE_LIST)[syncNodeIndex]) {
        syncNodeIndex = 0;
    }
    if (!Object.keys(NODE_LIST).length) {
        return;
    }

    if (!Object.keys(transfersInProgress.outgoing).length && !Object.keys(transfersInProgress.incoming).length) {
        client.sendMessage('getFiles', NODE_LIST[Object.keys(NODE_LIST)[syncNodeIndex]].listeningPort, NODE_LIST[Object.keys(NODE_LIST)[syncNodeIndex]].address);
        console.log('no transfers in progress');
        syncNodeIndex++;
    }
}

setTimeout(() => {
    checkInSync();
}, 1500);
setInterval(checkInSync, 5000);
