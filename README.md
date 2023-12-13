# node udp network
 A basic UDP network written in node.js for communication between an unlimited number of nodes.

# About
A basic network of nodes which communicate using UDP packets only. Each node has its own directory, and the network constantly syncs itself with the other nodes. If a node adds a new file to its directory, this file will be transferred using UDP packets. Nodes will confirm they have received each packet as it comes, and hash comparisons are used, meaning the transfers are reliable.

This was made as a project for my Distributed Computing module in my Computer Science degree.

# Usage
`node index.js *contact address* *contact port* *listening port* *unique node name*`

## CLI commands
`nodelist` - provides a list of all nodes

`myFiles` - shows all files currently owned (should be the same across all nodes)

`sendAllNodes *message*` - sends any message to all nodes on the network

`sendSpecificNode *message* *node unique name*` - sends a message to a specific node, with the provided unique name