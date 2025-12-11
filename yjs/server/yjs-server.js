const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const map = require('lib0/map');

// Create Express app
const app = express();
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

const docs = new Map();

const messageSync = 0;
const messageAwareness = 1;

/**
 * Gets a Y.Doc by name, whether in memory or on disk
 */
const getYDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new Y.Doc();
  doc.gc = true;
  docs.set(docname, doc);
  return doc;
});

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  conn.close();
};

const send = (doc, conn, message) => {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
  }
  try {
    conn.send(message, err => {
      if (err != null) {
        closeConn(doc, conn);
      }
    });
  } catch (e) {
    closeConn(doc, conn);
  }
};

const setupWSConnection = (conn, req, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) => {
  conn.binaryType = 'arraybuffer';
  
  const doc = getYDoc(docName);
  doc.conns = doc.conns || new Map();
  doc.awareness = doc.awareness || new awarenessProtocol.Awareness(doc);
  
  doc.conns.set(conn, new Set());

  // Listen for Yjs updates and broadcast them
  const updateHandler = (update, origin) => {
    if (origin !== conn) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, c) => {
        if (c !== conn) {
          send(doc, c, message);
        }
      });
    }
  };
  doc.on('update', updateHandler);

  // Listen for awareness updates and broadcast them
  const awarenessChangeHandler = ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients));
    const buff = encoding.toUint8Array(encoder);
    doc.conns.forEach((_, c) => {
      send(doc, c, buff);
    });
  };
  doc.awareness.on('update', awarenessChangeHandler);

  conn.on('message', message => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const messageType = decoding.readVarUint(decoder);
      
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
          if (encoding.length(encoder) > 1) {
            send(doc, conn, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
          break;
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(doc, conn, encoding.toUint8Array(encoder));
  
  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
    send(doc, conn, encoding.toUint8Array(encoder));
  }

  conn.on('close', () => {
    doc.off('update', updateHandler);
    doc.awareness.off('update', awarenessChangeHandler);
    closeConn(doc, conn);
  });
};

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', setupWSConnection);

const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Yjs server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
  console.log('Server ready for CRDT synchronization');
});

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
