/**
 * pvp-relay.test.js — the two-device path, exercised for real.
 *
 * Everything here runs against a live `server/pvp-relay.mjs` child process over
 * real WebSocket sockets. No fake transports, no stubbed relay: if a phone in
 * another room of the house could not join, one of these tests would fail.
 *
 * (BroadcastChannel cannot be used here — it never leaves a browser, which is
 * exactly why this file exists.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { PvpRoom } from '../src/net/PvpRoom.js';
import { COUNTDOWN_MS } from '../src/net/LobbyState.js';
import {
  TRANSPORT,
  createTransport,
  linkError,
  preferredMode,
  unreachableMessage,
} from '../src/net/transports.js';

const RELAY_ENTRY = resolve(process.cwd(), 'server/pvp-relay.mjs');

/** A port nobody else is holding. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function startRelay(port, env = {}) {
  const child = spawn(process.execPath, [RELAY_ENTRY], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PVP_PENDING_MS: '150', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });
  await waitFor(() => log.includes('listening on'), 5000, () => `relay did not start:\n${log}`);
  return {
    child,
    get log() {
      return log;
    },
    stop() {
      return new Promise((resolveStop) => {
        if (child.exitCode !== null) return resolveStop();
        child.once('exit', () => resolveStop());
        child.kill('SIGKILL');
      });
    },
  };
}

async function waitFor(predicate, timeout = 4000, message = () => 'condition never became true') {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeout) throw new Error(message());
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}

const url = (port) => `ws://127.0.0.1:${port}/pvp`;

/* ------------------------------------------------------------------------ */

describe('transport choice', () => {
  const page = { protocol: 'https:', host: 'example.test', search: '' };

  it('defaults to the relay whenever the game is served over http(s)', () => {
    expect(preferredMode({ loc: page })).toBe(TRANSPORT.RELAY);
    expect(preferredMode({ loc: { protocol: 'http:', host: '192.168.1.8:4173', search: '' } })).toBe(TRANSPORT.RELAY);
  });

  it('falls back to this-browser only when there is no origin', () => {
    expect(preferredMode({ loc: { protocol: 'file:', host: '', search: '' } })).toBe(TRANSPORT.LOCAL);
    expect(preferredMode({ loc: undefined })).toBe(TRANSPORT.LOCAL);
  });

  it('honours an explicit mode, ?pvp= and VITE_PVP_RELAY', () => {
    expect(preferredMode({ mode: 'local', loc: page })).toBe(TRANSPORT.LOCAL);
    expect(preferredMode({ loc: { ...page, search: '?pvp=local' } })).toBe(TRANSPORT.LOCAL);
    expect(preferredMode({ loc: { protocol: 'file:', host: '', search: '?pvp=relay' } })).toBe(TRANSPORT.RELAY);
    expect(preferredMode({ envUrl: 'ws://relay.test/pvp', loc: { protocol: 'file:', host: '', search: '' } })).toBe(
      TRANSPORT.RELAY
    );
  });

  it('builds a WebSocket transport for the served page, not a local one', () => {
    const transport = createTransport({
      roomCode: 'ABCDE',
      selfId: 'me',
      name: 'Ronn',
      host: true,
      loc: page,
    });
    expect(transport.kind).toBe(TRANSPORT.RELAY);
    expect(transport.url).toBe('wss://example.test/pvp');
  });

  it('refuses to pretend a relay exists when it was asked for and absent', () => {
    expect(() =>
      createTransport({
        mode: 'relay',
        roomCode: 'ABCDE',
        selfId: 'me',
        loc: { protocol: 'file:', host: '', search: '' },
        envUrl: null,
      })
    ).toThrow(/No duel relay address/);
  });
});

describe('duel relay (real sockets)', () => {
  let relay;
  let port;

  beforeAll(async () => {
    port = await freePort();
    relay = await startRelay(port);
  }, 20000);

  afterAll(async () => {
    await relay?.stop();
  });

  it('seats two devices and plays a whole duel over the wire', async () => {
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const launches = [];
    const overs = [];
    try {
      const hosted = await host.host({ name: 'Ronn' });
      expect(hosted.roomCode).toHaveLength(5);
      expect(host.kind).toBe(TRANSPORT.RELAY);
      expect(host.linkUrl).toBe(url(port));
      expect(host.status).toBe('open');

      await guest.join({ code: hosted.roomCode, name: 'Kai' });

      // The joiner is a real second socket: the host must see the seat fill.
      await waitFor(() => host.view.connected === 2 && guest.view.connected === 2);
      expect(guest.view.self.name).toBe('Kai');
      expect(guest.view.rival.name).toBe('Ronn');
      expect(host.view.rival.name).toBe('Kai');

      guest.setReady(true);
      host.setReady(true);
      await waitFor(() => host.view.canStart && guest.view.rival.ready);

      host.on('launch', (payload) => launches.push({ who: 'host', ...payload.pvp }));
      guest.on('launch', (payload) => launches.push({ who: 'guest', ...payload.pvp }));
      host.on('over', (payload) => overs.push({ who: 'host', ...payload }));
      guest.on('over', (payload) => overs.push({ who: 'guest', ...payload }));

      host.start();
      await waitFor(() => guest.state.status === 'countdown');
      expect(host.state.status).toBe('countdown');

      host.now = () => Date.now() + COUNTDOWN_MS + 10;
      host.tick();
      await waitFor(() => launches.length === 2);
      expect(launches.map((entry) => entry.seat).sort()).toEqual(['p1', 'p2']);
      expect(new Set(launches.map((entry) => entry.arenaId)).size).toBe(1);
      expect(new Set(launches.map((entry) => entry.seed)).size).toBe(1);

      guest.reportProgress({ wave: 2, totalWaves: 8, score: 310, coreHp: 18 });
      await waitFor(() => host.view.rival.progress.wave === 2);
      expect(host.view.rival.progress.score).toBe(310);

      guest.reportSeat({ outcome: 'ko', score: 310, coreHp: 0, waves: 4, timeMs: 61000 });
      await waitFor(() => overs.length === 2);
      expect(overs.every((entry) => entry.resolved.winner === 'p1')).toBe(true);
      expect(host.state.status).toBe('over');
      expect(guest.state.status).toBe('over');

      host.rematch();
      await waitFor(() => guest.state.status === 'lobby');
      expect(host.state.status).toBe('lobby');
    } finally {
      host.leave();
      guest.leave();
    }
  }, 20000);

  it('holds a guest that arrives before the host opens the room', async () => {
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const code = 'QK7RM';
    const statuses = [];
    guest.on('status', (status) => statuses.push(status));
    try {
      const joining = guest.join({ code, name: 'Kai' });
      await waitFor(() => statuses.includes('linking'), 3000, 'guest was never told to wait');
      // The host taps CREATE ROOM a moment later — same code.
      await host.host({ name: 'Ronn', code });
      await joining;
      await waitFor(() => host.view.connected === 2 && guest.view.connected === 2);
      expect(guest.status).toBe('open');
    } finally {
      host.leave();
      guest.leave();
    }
  }, 20000);

  it('refuses a code nobody is hosting, in plain words', async () => {
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const errors = [];
    guest.on('error', (message) => errors.push(message));
    try {
      await expect(guest.join({ code: 'K9K9K', name: 'Kai' })).rejects.toThrow(linkError('no-room'));
      expect(guest.status).toBe('error');
      expect(errors).toContain(linkError('no-room'));
    } finally {
      guest.leave();
    }
  }, 20000);

  it('refuses a third challenger', async () => {
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const first = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const third = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    try {
      const hosted = await host.host({ name: 'Ronn' });
      await first.join({ code: hosted.roomCode, name: 'Kai' });
      await waitFor(() => host.view.connected === 2);
      await expect(third.join({ code: hosted.roomCode, name: 'Zed' })).rejects.toThrow(linkError('full'));
    } finally {
      host.leave();
      first.leave();
      third.leave();
    }
  }, 20000);

  it('calls a verdict when the host disappears mid-duel', async () => {
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const overs = [];
    try {
      const hosted = await host.host({ name: 'Ronn' });
      await guest.join({ code: hosted.roomCode, name: 'Kai' });
      await waitFor(() => host.view.connected === 2 && guest.view.connected === 2);
      guest.setReady(true);
      host.setReady(true);
      await waitFor(() => host.view.canStart);
      host.start();
      await waitFor(() => guest.state.status === 'countdown');
      host.now = () => Date.now() + COUNTDOWN_MS + 10;
      host.tick();
      await waitFor(() => guest.state.status === 'live');
      guest.on('over', (payload) => overs.push(payload));
      host.leave();
      await waitFor(() => overs.length === 1);
      expect(overs[0].resolved.winner).toBe('p2');
      expect(guest.state.status).toBe('over');
    } finally {
      guest.leave();
    }
  }, 20000);
});

describe('relay down', () => {
  it('names the address it could not reach, and how to start one', async () => {
    const deadPort = await freePort();
    const target = `ws://127.0.0.1:${deadPort}/pvp`;
    const room = new PvpRoom({ mode: 'relay', relayUrl: target });
    const errors = [];
    room.on('error', (message) => errors.push(message));
    const started = Date.now();
    try {
      await expect(room.host({ name: 'Ronn' })).rejects.toThrow(target);
      await expect(Promise.reject(new Error(errors[0]))).rejects.toThrow(/pvp:relay/);
      expect(Date.now() - started).toBeLessThan(12000);
      expect(room.status).toBe('error');
    } finally {
      room.leave();
    }
  }, 25000);

  it('speaks to a static deploy: no relay process to answer', async () => {
    const room = new PvpRoom({ mode: 'relay', relayUrl: 'ws://defenseofkingdom.example/pvp' });
    try {
      await expect(room.host({ name: 'Ronn' })).rejects.toThrow(/static host has no relay process/);
    } finally {
      room.leave();
    }
  }, 25000);

  it('describes a localhost relay as something to start', () => {
    expect(unreachableMessage('ws://localhost:8787/pvp')).toMatch(/npm run pvp:relay/);
    expect(unreachableMessage('wss://relay.example/pvp')).toMatch(/point the room at one you run/);
  });
});
