#!/usr/bin/env node
/**
 * pvp-relay.mjs — a zero-knowledge duel relay.
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
 * The client dials `/pvp` on whatever host served the page; the dev and
 * preview servers proxy that to this process, so two phones that open the same
 * preview URL share a room without any configuration. To put the relay
 * somewhere else, build with `VITE_PVP_RELAY=wss://relay.example/pvp`.
 *
 * Handshake:
 *   client → hello {roomCode, name, host}
 *   relay  → note  {state:'waiting'}      … guest arrived before the host
 *   relay  → welcome {seat:'p1'|'p2'}     … seated, link is live
 *   relay  → bye {reason}  then close     … bad-code | code-taken | full |
 *                                           no-room | no-host
 * After `welcome` everything else is forwarded verbatim to the peer, and a
 * guest's `hello` is replayed to the host so it can seat them.
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
/** Drop a room this long after the last socket leaves it. */
const ROOM_TTL_MS = 15 * 60 * 1000;
/** How long a guest that arrived before the host is held before giving up. */
const PENDING_MS = Number(process.env.PVP_PENDING_MS || 15000);
/** Pending guests per not-yet-open code — enough for a retried tap or two. */
const PENDING_MAX = 4;

/** @type {Map<string, {code:string, host:import('ws').WebSocket|null, guest:import('ws').WebSocket|null, touched:number}>} */
const rooms = new Map();
/** @type {Map<string, Array<{socket:import('ws').WebSocket, message:object, timer:NodeJS.Timeout}>>} */
const pending = new Map();

const log = (...args) => console.log('[relay]', ...args);

function send(socket, message) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** Send, wait for the frame to flush, then hang up — a bare close can eat it. */
function sendThenClose(socket, message) {
  if (!socket) return;
  if (socket.readyState !== socket.OPEN) {
    try {
      socket.close();
    } catch {
      /* already gone */
    }
    return;
  }
  socket.send(JSON.stringify(message), () => {
    try {
      socket.close();
    } catch {
      /* already gone */
    }
  });
}

function note(socket, payload) {
  send(socket, { v: 1, from: 'relay', type: 'note', payload });
}

function refuse(socket, reason) {
  sendThenClose(socket, { v: 1, from: 'relay', type: 'bye', payload: { reason } });
}

function roomOf(socket) {
  return socket.roomCode ? rooms.get(socket.roomCode) : null;
}

function peerOf(socket) {
  const room = roomOf(socket);
  if (!room) return null;
  return room.host === socket ? room.guest : room.host;
}

/* --------------------------------------------------------------- pending */

function dropPending(socket) {
  for (const [code, list] of pending) {
    const entry = list.find((item) => item.socket === socket);
    if (!entry) continue;
    clearTimeout(entry.timer);
    const rest = list.filter((item) => item.socket !== socket);
    if (rest.length) pending.set(code, rest);
    else pending.delete(code);
  }
}

function holdGuest(socket, message, code) {
  let list = pending.get(code);
  if (!list) pending.set(code, (list = []));
  if (list.length >= PENDING_MAX) {
    refuse(socket, 'full');
    return;
  }
  socket.roomCode = code;
  socket.clientId = message.from;
  const entry = { socket, message, timer: null };
  entry.timer = setTimeout(() => {
    dropPending(socket);
    refuse(socket, 'no-room');
    log('guest timed out', code);
  }, PENDING_MS);
  entry.timer.unref?.();
  list.push(entry);
  note(socket, { state: 'waiting', waitMs: PENDING_MS, roomCode: code });
  log('guest waiting for host', code);
}

function flushPending(code) {
  const list = pending.get(code);
  if (!list) return;
  pending.delete(code);
  const room = rooms.get(code);
  if (!room || !room.host) {
    for (const entry of list) {
      clearTimeout(entry.timer);
      refuse(entry.socket, 'no-host');
    }
    return;
  }
  for (const entry of list) {
    clearTimeout(entry.timer);
    const seated = room.guest;
    if (seated && seated !== entry.socket && seated.readyState === seated.OPEN && seated.clientId !== entry.message.from) {
      refuse(entry.socket, 'full');
      continue;
    }
    if (seated && seated !== entry.socket) {
      try {
        seated.close();
      } catch {
        /* already gone */
      }
    }
    attachGuest(entry.socket, entry.message, room);
  }
}

/* ------------------------------------------------------------------ seats */

function attachGuest(socket, message, room) {
  room.guest = socket;
  room.touched = Date.now();
  socket.roomCode = room.code;
  socket.clientId = message.from;
  send(socket, { v: 1, from: 'relay', type: 'welcome', roomCode: room.code, payload: { seat: 'p2' } });
  // Replay the challenger's hello to the host so it can seat them.
  send(room.host, message);
  log('guest joined', room.code);
}

function claimHost(socket, message, code) {
  const existing = rooms.get(code);
  let reclaimed = false;
  if (existing) {
    // A host that reloaded the page comes back with a *new* client id but the
    // same code; the slot is empty, so let it back in. Only a live host that is
    // not us blocks the code.
    if (existing.host && existing.host !== socket && existing.host.readyState === existing.host.OPEN) {
      if (existing.host.clientId !== message.from) {
        refuse(socket, 'code-taken');
        return;
      }
      try {
        existing.host.close();
      } catch {
        /* already gone */
      }
    }
    reclaimed = true;
    existing.host = socket;
    existing.touched = Date.now();
  } else {
    rooms.set(code, { code, host: socket, guest: null, touched: Date.now() });
  }
  socket.roomCode = code;
  socket.clientId = message.from;
  send(socket, { v: 1, from: 'relay', type: 'welcome', roomCode: code, payload: { seat: 'p1' } });
  log(reclaimed ? 'host reattached' : 'room open', code);
  flushPending(code);
}

function seatGuest(socket, message, code) {
  const room = rooms.get(code);
  if (!room || !room.host) {
    holdGuest(socket, message, code);
    return;
  }
  const seated = room.guest;
  if (seated && seated !== socket && seated.readyState === seated.OPEN && seated.clientId !== message.from) {
    refuse(socket, 'full');
    return;
  }
  if (seated && seated !== socket) {
    try {
      seated.close();
    } catch {
      /* already gone */
    }
  }
  attachGuest(socket, message, room);
}

function handleHello(socket, message) {
  const payload = message.payload || {};
  const code = String(payload.roomCode || '').toUpperCase().slice(0, 5);
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    refuse(socket, 'bad-code');
    return;
  }
  if (payload.host) claimHost(socket, message, code);
  else seatGuest(socket, message, code);
}

function leave(socket) {
  dropPending(socket);
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

/* ----------------------------------------------------------------- server */

const http = createServer((req, res) => {
  if (req.url === '/health') {
    const waiting = [...pending.values()].reduce((total, list) => total + list.length, 0);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, pending: waiting }));
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
    const hostLive = Boolean(room.host && room.host.readyState === room.host.OPEN);
    const guestLive = Boolean(room.guest && room.guest.readyState === room.guest.OPEN);
    const hostless = !hostLive && now - room.touched > ROOM_TTL_MS;
    // Safety net for a socket that never fired `close`: a room with nobody in
    // it is not a room, and a room whose host is long gone is not joinable.
    // A live host is never reaped, so waiting for a challenger cannot lose the
    // code to a timer.
    if ((!hostLive && !guestLive) || hostless) {
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
