const WebSocket = require('ws');
const http = require('http');
const ShareDB = require('sharedb');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const express = require('express');
const path = require('path');

// Create ShareDB backend
const backend = new ShareDB();

// Create Express app
const app = express();

// Serve static files from current directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Create HTTP server with Express
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false 
});

// Connect any incoming WebSocket connection to ShareDB
wss.on('connection', (ws, req) => {
  console.log('WebSocket connection received from:', req.socket.remoteAddress);
  const stream = new WebSocketJSONStream(ws);
  backend.listen(stream);
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

server.listen(8080, () => {
  console.log('Server running on http://localhost:8080');
  console.log('WebSocket available at ws://localhost:8080');
  console.log('Waiting for connections...');
});