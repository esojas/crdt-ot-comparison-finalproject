const http = require('http');
const express = require('express');
const WebSocket = require('ws');

// Create Express app
const app = express();

// Serve static files from client directory
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store rooms and their connected clients
const rooms = new Map();

console.log('Yjs backend initialized');

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('WebSocket connection received from:', req.socket.remoteAddress);
  
  let roomName = 'whiteboard-room'; // Default room name
  let room = rooms.get(roomName);
  
  if (!room) {
    room = new Set();
    rooms.set(roomName, room);
  }
  
  room.add(ws);
  console.log(`Client joined room: ${roomName} (${room.size} clients)`);
  
  // Broadcast messages to all other clients in the same room
  ws.on('message', (message, isBinary) => {
    console.log(`Received message (${isBinary ? 'binary' : 'text'}, ${message.length} bytes) from client`);
    // Broadcast to all clients except the sender
    let broadcastCount = 0;
    room.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        // Send the message (ws library auto-detects binary)
        client.send(message);
        broadcastCount++;
      }
    });
    console.log(`Broadcasted message to ${broadcastCount} client(s)`);
  });
  
  // Handle WebSocket close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomName);
    } else {
      console.log(`Client left room: ${roomName} (${room.size} clients remaining)`);
    }
  });
  
  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomName);
    }
  });
});

// Handle server errors
wss.on('error', (error) => {
  console.error('WebSocket Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Yjs server running on http://localhost:${PORT}`);
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
