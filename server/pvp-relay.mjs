#!/usr/bin/env node
/**
 * pvp-relay.mjs — a 120-line, zero-knowledge duel relay.
 *
 * It does not run the game and it does not keep score: it pairs two sockets
 * into a room keyed by the room code and forwards envelopes between them. All
 * rules live in `src/net/LobbyState.js`, so the host stays authoritative and
 * this process stays dumb — which is exactly what you want in a server you do
 * not want to redeploy every time the game changes.
 *
 *   npm run pvp:relay            # ws://0.0.0.0:8787/pvp
 *   PORT=9000 npm run pvp:relay
 *
 * Then point the client at it:
 *
 *   VITE_PVP_RELAY=ws://localhost:8787/pvp npm run dev
 *
 * On the sandbox preview host the dev server proxies `/pvp` to this relay, so
 * `VITE_PVP_RELAY=ws://<preview-host>/pvp` works from two devices as well.
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
/** Drop a room this long after the last socket leaves it. */
const ROOM_TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, {code:string, host:import('ws').WebSocket, guest:import('ws').WebSocket|null, touched:number}>} */
const rooms = new Map();

const log = (...args) => console.log('[relay]', ...args);

function send(socket, message) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function roomOf(socket) {
  return socket.roomCode ? rooms.get(socket.roomCode) : null;
}

function peerOf(socket) {
  const room = roomOf(socket);
  if (!room) return null;
  return room.host === socket ? room.guest : room.host;
}

function leave(socket) {
  const room = roomOf(socket);
  if (!room) return;
  const peer = peerOf(socket);
  send(peer, {
    v: 1,
    from: socket.clientId || 'relay',
    type: 'bye',
    roomCode: room.code,
    payload: { reason: 'peer-left' },
  });
  if (room.host === socket) room.host = null;
  if (room.guest === socket) room.guest = null;
  room.touched = Date.now();
  if (!room.host && !room.guest) {
    rooms.delete(room.code);
    log('room closed', room.code);
  } else {
    log('peer left', room.code);
  }
  socket.roomCode = null;
}

function handleHello(socket, message) {
  const payload = message.payload || {};
  const code = String(payload.roomCode || '').toUpperCase().slice(0, 5);
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    send(socket, { v: 1, from: 'relay', type: 'bye', payload: { reason: 'bad-code' } });
    socket.close();
    return;
  }

  if (payload.host) {
    if (rooms.has(code)) {
      send(socket, { v: 1, from: 'relay', type: 'bye', payload: { reason: 'code-taken' } });
      socket.close();
      return;
    }
    rooms.set(code, { code, host: socket, guest: null, touched: Date.now() });
    socket.roomCode = code;
    socket.clientId = message.from;
    send(socket, { v: 1, from: 'relay', type: 'welcome', roomCode: code, payload: { seat: 'p1' } });
    log('room open', code);
    return;
  }

  const room = rooms.get(code);
  if (!room || !room.host) {
    send(socket, { v: 1, from: 'relay', type: 'bye', payload: { reason: 'no-room' } });
    socket.close();
    return;
  }
  if (room.guest && room.guest.readyState === room.guest.OPEN) {
    send(socket, { v: 1, from: 'relay', type: 'bye', payload: { reason: 'full' } });
    socket.close();
    return;
  }
  room.guest = socket;
  room.touched = Date.now();
  socket.roomCode = code;
  socket.clientId = message.from;
  send(socket, { v: 1, from: 'relay', type: 'welcome', roomCode: code, payload: { seat: 'p2' } });
  // Replay the challenger's hello to the host so it can seat them.
  send(room.host, message);
  log('guest joined', code);
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('Duels speak WebSocket at /pvp\n');
});

const wss = new WebSocketServer({ server: http, path: '/pvp', maxPayload: 64 * 1024 });

wss.on('connection', (socket, req) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!message || message.v !== 1 || typeof message.type !== 'string') return;

    if (message.type === 'hello') {
      handleHello(socket, message);
      return;
    }
    if (message.type === 'bye') {
      leave(socket);
      return;
    }
    const peer = peerOf(socket);
    if (peer) {
      send(peer, message);
      const room = roomOf(socket);
      if (room) room.touched = Date.now();
    }
  });

  socket.on('close', () => leave(socket));
  socket.on('error', () => leave(socket));
  socket.remote = req.socket.remoteAddress;
});

// Liveness + room GC.
const timer = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > ROOM_TTL_MS && !room.guest) {
      rooms.delete(code);
      log('room expired', code);
    }
  }
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
timer.unref?.();

http.listen(PORT, HOST, () => {
  log(`duel relay listening on ws://${HOST}:${PORT}/pvp`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('shutting down');
    clearInterval(timer);
    wss.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
