// yjs-server.js
const http = require('http')
const WebSocket = require('ws')
const setupWSConnection = require('y-websocket/bin/utils').setupWSConnection

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('y-websocket server')
})

const wss = new WebSocket.Server({ server })

wss.on('connection', (conn, req) => {
  // setupWSConnection will handle the y-websocket protocol
  setupWSConnection(conn, req)
})

const port = process.env.PORT || 1234
server.listen(port, () => {
  console.log('y-websocket server running on port', port)
})
