# CRDT-OT Comparison Final Project

A collaborative whiteboard application comparing ShareDB (Operational Transform) and YJS (CRDT) implementations.

## Setup

First, install all dependencies:

```bash
npm install
```

## Running ShareDB

ShareDB uses Operational Transform (OT) for collaboration.

1. **Build the client bundle:**
   ```bash
   npm run build:client
   ```

2. **Start the ShareDB server:**
   ```bash
   npm run start:server
   ```
   Or directly:
   ```bash
   node sharedb/server/sharedb-server.js
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8080/index.html`

## Running YJS

YJS uses CRDT (Conflict-free Replicated Data Types) for collaboration.

**Important:** YJS requires two separate terminal windows/consoles.

### Terminal 1 - WebSocket Server:
```bash
PORT=1234 npx y-websocket
```

### Terminal 2 - Static File Server:
```bash
npx serve . -l 8000
```

Then navigate to `http://localhost:8000/yjs/client/index.html` in your browser.

## Project Structure

- `sharedb/` - ShareDB (OT) implementation
  - `server/` - ShareDB server
  - `client/` - ShareDB client (requires bundling)
- `yjs/` - YJS (CRDT) implementation
  - `server/` - YJS server
  - `client/` - YJS client
