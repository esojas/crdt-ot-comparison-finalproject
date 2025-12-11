const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

// Create Express app
const app = express();

// Serve static files from client directory
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// In-memory docs map: docName -> { doc, awareness, connections:Set }
const docs = new Map();

function getRoomName(req) {
  // WebsocketProvider connects to ws://host:port/roomname
  // strip leading slash
  const url = req.url || '';
  const name = url.startsWith('/') ? url.slice(1) : url;
  return name || 'default';
}

function getDoc(roomName) {
  let entry = docs.get(roomName);
  if (!entry) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    entry = { doc, awareness, connections: new Set() };
    docs.set(roomName, entry);
    console.log(`[doc] created room "${roomName}"`);

    // Broadcast Yjs updates to all clients in the room
    doc.on('update', (update, origin) => {
      entry.connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN && ws !== origin) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, syncProtocol.messageSync);
          syncProtocol.writeUpdate(encoder, update);
          ws.send(encoding.toUint8Array(encoder));
        }
      });
    });
  }
  return entry;
}

function sendAwarenessUpdate(entry, changedClients, originWs) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, awarenessProtocol.messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(entry.awareness, changedClients)
  );
  const buf = encoding.toUint8Array(encoder);
  entry.connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws !== originWs) {
      ws.send(buf);
    }
  });
}

console.log('Yjs backend initialized');

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  const roomName = getRoomName(req);
  const entry = getDoc(roomName);
  entry.connections.add(ws);
  console.log(`[ws] client ${clientIp} joined room "${roomName}" (clients: ${entry.connections.size})`);

  // Set awareness for this connection
  const awareness = entry.awareness;
  const sendSync = () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageSync);
    syncProtocol.writeSyncStep1(encoder, entry.doc);
    ws.send(encoding.toUint8Array(encoder));

    // Send current awareness states
    const awarenessStates = Array.from(awareness.getStates().keys());
    if (awarenessStates.length) {
      const awEncoder = encoding.createEncoder();
      encoding.writeVarUint(awEncoder, awarenessProtocol.messageAwareness);
      encoding.writeVarUint8Array(
        awEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, awarenessStates)
      );
      ws.send(encoding.toUint8Array(awEncoder));
    }
  };

  sendSync();

  ws.on('message', (data) => {
    const message = new Uint8Array(data);
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === syncProtocol.messageSync) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, entry.doc, ws);
      const reply = encoding.toUint8Array(encoder);
      if (reply.length > 1 && ws.readyState === WebSocket.OPEN) {
        ws.send(reply);
      }
    } else if (messageType === awarenessProtocol.messageAwareness) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
      const changedClients = awarenessProtocol.removeAwarenessStates(awareness, [], ws);
      // Broadcast to others
      sendAwarenessUpdate(entry, awarenessProtocol.decodeAwarenessUpdate(update).added, ws);
    } else if (messageType === awarenessProtocol.messageQueryAwareness) {
      // Respond with current awareness
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, awarenessProtocol.messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(awareness.getStates().keys())
        )
      );
      ws.send(encoding.toUint8Array(encoder));
    }
  });

  ws.on('close', () => {
    entry.connections.delete(ws);
    awarenessProtocol.removeAwarenessStates(
      awareness,
      Array.from(awareness.getStates().keys()).filter((clientId) => {
        const state = awareness.getStates().get(clientId);
        return state && state.ws === ws;
      }),
      ws
    );
    console.log(`[ws] client ${clientIp} left room "${roomName}" (clients: ${entry.connections.size})`);
    if (entry.connections.size === 0) {
      console.log(`[doc] room "${roomName}" now empty; keeping doc in memory`);
    }
  });

  ws.on('error', (error) => {
    console.error(`[ws] error from ${clientIp}:`, error);
    entry.connections.delete(ws);
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
