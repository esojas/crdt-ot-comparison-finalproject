const http = require('http');
const express = require('express');
const ShareDB = require('sharedb');
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');

// Create ShareDB backend
const backend = new ShareDB();

// Create Express app
const app = express();

// Serve static files from client directory
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

console.log('ShareDB backend initialized');

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('WebSocket connection received from:', req.socket.remoteAddress);
  
  // Create a ShareDB stream from the WebSocket
  const stream = new WebSocketJSONStream(ws);
  
  // Listen to the ShareDB backend
  backend.listen(stream);
  
  console.log('ShareDB stream connected');
  
  // Handle WebSocket close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle server errors
wss.on('error', (error) => {
  console.error('WebSocket Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
  console.log('Waiting for connections...');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});