const dgram = require('dgram');
const client = dgram.createSocket('udp4');

function sendMessage(message, port, host) {
    // console.log(`Sending message ${message} to ${host}:${port}`);
    client.send(message, port, host, err => {
        if (err) throw err;
    });
};

function joinNetwork(uniqueName, contactPort) {
    sendMessage(`joinNetwork ${uniqueName} ${SERVER_PORT}`, contactPort, CONTACT_NODE_ADDRESS);
};

module.exports = { sendMessage, joinNetwork };