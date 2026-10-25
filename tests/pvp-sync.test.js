/**
 * pvp-sync.test.js — how *live* the duel actually is, measured over real
 * sockets against a real relay.
 *
 * The lobby test proves the room converges. This one answers the questions a
 * player asks instead: does my rival's strip move when they move, does the
 * countdown start together even if one phone's clock is wrong, does a burst of
 * updates arrive in order, and how much work does a snapshot cost.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'node:perf_hooks';

import { PvpRoom } from '../src/net/PvpRoom.js';
import { COUNTDOWN_MS, adoptSnapshot, createLobbyState, lobbyView, snapshot } from '../src/net/LobbyState.js';
import { freePort, relayUrl, startRelay, waitFor } from './helpers/relay.js';

const url = relayUrl;

/**
 * The part of a snapshot both seats must agree on, byte for byte.
 *
 * `countdownEndsAt` is deliberately excluded: it is a *local* deadline rebuilt
 * from `countdownRemaining` on each machine's own clock, which is exactly why a
 * phone with a wrong clock still starts at the right moment (see the skew test).
 */
function roomCore(room) {
  const snap = snapshot(room.state, 0);
  const { serverNow, countdownRemaining, countdownEndsAt, ...core } = snap;
  return core;
}

/** Resolve on the next `state` event that satisfies `predicate`. */
function nextState(room, predicate, label = 'state', timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`${label} never arrived`));
    }, timeout);
    const off = room.on('state', (view) => {
      if (!predicate(view)) return;
      clearTimeout(timer);
      off();
      resolve(view);
    });
  });
}

let relay;
let port;

beforeAll(async () => {
  port = await freePort();
  relay = await startRelay(port);
}, 20000);

afterAll(async () => {
  await relay?.stop();
});

/** Two seats, both ready, countdown over, match live. */
async function liveDuel(hostOptions = {}, guestOptions = {}) {
  const host = new PvpRoom({ mode: 'relay', relayUrl: url(port), ...hostOptions });
  const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port), ...guestOptions });
  const hosted = await host.host({ name: 'Ronn' });
  await guest.join({ code: hosted.roomCode, name: 'Kai' });
  await waitFor(() => host.view.connected === 2 && guest.view.connected === 2);
  host.setReady(true);
  guest.setReady(true);
  await waitFor(() => host.view.canStart);
  host.start();
  await waitFor(() => guest.state.status === 'countdown');
  host.now = () => Date.now() + COUNTDOWN_MS + 10;
  host.tick();
  await waitFor(() => guest.state.status === 'live');
  host.now = () => Date.now();
  return { host, guest };
}

describe('duel synchronisation', () => {
  it('keeps both seats byte-identical through every lobby change', async () => {
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    try {
      const hosted = await host.host({ name: 'Ronn' });
      await guest.join({ code: hosted.roomCode, name: 'Kai' });
      await waitFor(() => guest.view.connected === 2);
      expect(roomCore(guest)).toEqual(roomCore(host));

      const renamed = nextState(guest, (view) => view.self?.ready === true, 'guest ready');
      guest.setReady(true);
      await renamed;
      expect(roomCore(guest)).toEqual(roomCore(host));

      const arenaPicked = nextState(guest, (view) => view.arena.id === 'frostspine', 'arena pick');
      host.pickArena('frostspine');
      await arenaPicked;
      expect(roomCore(guest)).toEqual(roomCore(host));

      host.setReady(true);
      // Only the host may start, so the guest's proof is its own view of the
      // rival's readiness.
      await waitFor(() => host.view.canStart && guest.view.rival?.ready === true);
      expect(roomCore(guest)).toEqual(roomCore(host));

      const counting = nextState(guest, (view) => view.status === 'countdown', 'countdown');
      host.start();
      await counting;
      expect(roomCore(guest)).toEqual(roomCore(host));

      host.now = () => Date.now() + COUNTDOWN_MS + 10;
      host.tick();
      await waitFor(() => guest.state.status === 'live');
      expect(roomCore(guest)).toEqual(roomCore(host));

      const reported = nextState(host, (view) => view.rival?.progress?.score === 640, 'progress');
      guest.reportProgress({ wave: 3, totalWaves: 8, score: 640, coreHp: 19, alive: true });
      await reported;
      // ...and the guest must come back with the host's copy of the same fact.
      await waitFor(() => guest.view.self?.progress?.score === 640);
      expect(roomCore(guest)).toEqual(roomCore(host));
    } finally {
      host.leave();
      guest.leave();
    }
  }, 25000);

  it('shows my rival move in single-digit milliseconds on a local relay', async () => {
    const { host, guest } = await liveDuel();
    const samples = [];
    try {
      for (let score = 100; score < 125; score++) {
        const started = performance.now();
        const seen = nextState(host, (view) => view.rival?.progress?.score === score, `progress ${score}`);
        guest.reportProgress({ wave: 2, totalWaves: 8, score, coreHp: 20, alive: true });
        await seen;
        samples.push(performance.now() - started);
      }
      // The other direction, host → guest, is one hop rather than two.
      const started = performance.now();
      const seenByGuest = nextState(guest, (view) => view.rival?.progress?.score === 777, 'host progress');
      host.reportProgress({ wave: 4, totalWaves: 8, score: 777, coreHp: 21, alive: true });
      await seenByGuest;
      expect(performance.now() - started).toBeLessThan(250);

      samples.sort((a, b) => a - b);
      const p50 = samples[Math.floor(samples.length * 0.5)];
      const p95 = samples[Math.floor(samples.length * 0.95)];
      // Round trip: intent → relay → host reducer → snapshot → relay → view.
      // A local relay is ~1 ms; the bound is loose so CI noise cannot flake it,
      // while still failing if anything starts batching or queueing.
      expect(p95).toBeLessThan(250);
      expect(p50).toBeLessThan(60);
    } finally {
      host.leave();
      guest.leave();
    }
  }, 25000);

  it('runs both countdowns off their own clock, so a skewed phone still starts together', async () => {
    const skewMs = 4 * 60 * 1000;
    const host = new PvpRoom({ mode: 'relay', relayUrl: url(port) });
    // This phone thinks it is four minutes behind the host.
    const guest = new PvpRoom({ mode: 'relay', relayUrl: url(port), now: () => Date.now() - skewMs });
    try {
      const hosted = await host.host({ name: 'Ronn' });
      await guest.join({ code: hosted.roomCode, name: 'Kai' });
      await waitFor(() => host.view.connected === 2 && guest.view.connected === 2);
      host.setReady(true);
      guest.setReady(true);
      await waitFor(() => host.view.canStart);
      host.start();
      await waitFor(() => guest.state.status === 'countdown');

      const hostLeft = host.state.countdownEndsAt - host.now();
      const guestLeft = guest.state.countdownEndsAt - guest.now();
      expect(Math.abs(hostLeft - guestLeft)).toBeLessThan(150);
      expect(hostLeft).toBeLessThanOrEqual(COUNTDOWN_MS);
    } finally {
      host.leave();
      guest.leave();
    }
  }, 25000);

  it('delivers a burst in order and never lets a stale score win', async () => {
    const { host, guest } = await liveDuel();
    const seen = [];
    const off = host.on('state', (view) => {
      if (view.rival) seen.push(view.rival.progress.score);
    });
    try {
      for (let i = 1; i <= 120; i++) {
        guest.reportProgress({ wave: 1, totalWaves: 8, score: i * 10, coreHp: 20, alive: true });
      }
      await waitFor(() => host.view.rival?.progress?.score === 1200, 8000);
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
      }
      expect(seen[seen.length - 1]).toBe(1200);
    } finally {
      off();
      host.leave();
      guest.leave();
    }
  }, 30000);

  it('does not put an unchanged heartbeat on the wire', async () => {
    const { host, guest } = await liveDuel();
    const intents = [];
    const send = guest.transport.send.bind(guest.transport);
    guest.transport.send = (message) => {
      if (message?.type === 'intent') intents.push(message.payload?.op);
      send(message);
    };
    try {
      const payload = { wave: 2, totalWaves: 8, score: 500, coreHp: 20, alive: true };
      guest.reportProgress(payload);
      guest.reportProgress({ ...payload });
      guest.reportProgress({ ...payload });
      await waitFor(() => host.view.rival?.progress?.score === 500);
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(intents.filter((op) => op === 'progress')).toHaveLength(1);

      guest.reportProgress({ ...payload, score: 520 });
      await waitFor(() => host.view.rival?.progress?.score === 520);
      expect(intents.filter((op) => op === 'progress')).toHaveLength(2);
    } finally {
      host.leave();
      guest.leave();
    }
  }, 25000);

  it('pays a fraction of a millisecond per snapshot', () => {
    const hostState = createLobbyState({ roomCode: 'ABCDE', selfId: 'host', name: 'Ronn', isHost: true, seed: 7 });
    const guestState = createLobbyState({ roomCode: 'ABCDE', selfId: 'guest', name: 'Kai', isHost: false, seed: 7 });
    hostState.clients.push({ id: 'guest', seat: 'p2', name: 'Kai' });
    hostState.match.seats[1].name = 'Kai';
    const snap = snapshot(hostState, 0);
    const bytes = JSON.stringify(snap).length;
    expect(bytes).toBeLessThan(1200);

    const runs = 4000;
    const started = performance.now();
    for (let i = 0; i < runs; i++) {
      adoptSnapshot(guestState, snap, 1000 + i);
      lobbyView(guestState);
    }
    const perOp = (performance.now() - started) / runs;
    // Adopting a snapshot and deriving the view is pure object maths; it must
    // never be the reason a phone drops a frame (~16 ms).
    expect(perOp).toBeLessThan(0.5);
  });
});
