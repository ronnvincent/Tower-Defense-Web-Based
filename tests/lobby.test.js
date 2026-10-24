import { describe, it, expect } from 'vitest';
import {
  MSG,
  OP,
  envelope,
  isValidRoomCode,
  makeRoomCode,
  normaliseRoomCode,
  sanitiseName,
  validEnvelope,
} from '../src/net/lobbyProtocol.js';
import {
  COUNTDOWN_MS,
  adoptSnapshot,
  applyIntent,
  createLobbyState,
  lobbyView,
  launchPayload,
  seatOf,
  snapshot,
  tickLobby,
} from '../src/net/LobbyState.js';
import { PvpRoom } from '../src/net/PvpRoom.js';

const room = (overrides = {}) =>
  createLobbyState({ roomCode: 'ABCDE', selfId: 'host', name: 'Ronn', isHost: true, seed: 4, ...overrides });

const intent = (clientId, op, payload = {}) => ({ clientId, op, payload });

const join = (state, clientId = 'guest', name = 'Kai', now = 10) =>
  applyIntent(state, intent(clientId, OP.JOIN, { name }), now);

describe('room protocol', () => {
  it('mints five-character codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toHaveLength(5);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('normalises what a player types', () => {
    expect(normaliseRoomCode(' ab-cde ')).toBe('ABCDE');
    expect(normaliseRoomCode('a1b2c3')).toBe('AB2C3'); // 1 and 0 are not in the alphabet
    expect(normaliseRoomCode(null)).toBe('');
    expect(isValidRoomCode('ABCDE')).toBe(true);
    expect(isValidRoomCode('abcde')).toBe(false);
    expect(isValidRoomCode('ABCD')).toBe(false);
  });

  it('strips markup and control characters from names', () => {
    expect(sanitiseName('  Ronn\u0000 <b> ')).toBe('Ronn b');
    expect(sanitiseName('')).toBe('Challenger');
    expect(sanitiseName('x'.repeat(40))).toHaveLength(16);
  });

  it('only accepts well-formed envelopes', () => {
    expect(validEnvelope(envelope('a', MSG.INTENT, { op: OP.READY }, 'ABCDE'))).toBe(true);
    expect(validEnvelope(null)).toBe(false);
    expect(validEnvelope({ v: 2, from: 'a', type: MSG.INTENT })).toBe(false);
    expect(validEnvelope({ v: 1, from: '', type: MSG.INTENT })).toBe(false);
    expect(validEnvelope({ v: 1, from: 'a', type: 'nope' })).toBe(false);
  });
});

describe('duel lobby', () => {
  it('opens a room with the host in seat p1', () => {
    const state = room();
    expect(state.clients).toHaveLength(1);
    expect(seatOf(state, 'host')).toBe('p1');
    expect(state.match.seats[0].name).toBe('Ronn');
    expect(lobbyView(state).canStart).toBe(false);
  });

  it('seats the challenger opposite the host', () => {
    const state = room();
    const { effects, changed } = join(state);
    expect(changed).toBe(true);
    expect(effects).toContainEqual({ type: 'joined', seat: 'p2' });
    expect(seatOf(state, 'guest')).toBe('p2');
    expect(state.match.seats[1].name).toBe('Kai');
  });

  it('refuses a third player', () => {
    const state = room();
    join(state);
    const { changed, effects } = join(state, 'third', 'Zed');
    expect(changed).toBe(false);
    expect(effects[0]).toEqual({ type: 'rejected', reason: 'full' });
  });

  it('lets a dropped client rejoin into the same seat', () => {
    const state = room();
    join(state, 'guest');
    applyIntent(state, intent('guest', OP.LEAVE), 20);
    expect(seatOf(state, 'guest')).toBeNull();
    join(state, 'guest', 'Kai', 30);
    expect(seatOf(state, 'guest')).toBe('p2');
  });

  it('only starts when both seats are ready', () => {
    const state = room();
    join(state);
    const early = applyIntent(state, intent('host', OP.START), 40);
    expect(early.changed).toBe(true);
    expect(early.effects[0]).toEqual({ type: 'rejected', reason: 'not-ready' });
    expect(state.status).toBe('lobby');

    applyIntent(state, intent('guest', OP.READY, { ready: true }), 50);
    const started = applyIntent(state, intent('host', OP.START), 60);
    expect(started.effects.some((effect) => effect.type === 'countdown')).toBe(true);
    expect(state.status).toBe('countdown');
    expect(state.countdownEndsAt).toBe(60 + COUNTDOWN_MS);
    // The host's "start" also readies them, so one tap is enough.
    expect(state.match.seats[0].ready).toBe(true);
  });

  it('will not start without a rival', () => {
    const state = room();
    applyIntent(state, intent('host', OP.READY, { ready: true }), 10);
    const { effects } = applyIntent(state, intent('host', OP.START), 20);
    expect(effects[0]).toEqual({ type: 'rejected', reason: 'waiting' });
    expect(state.status).toBe('lobby');
  });

  it('only the host may start or pick the arena', () => {
    const state = room();
    join(state);
    expect(applyIntent(state, intent('guest', OP.START), 10).changed).toBe(false);
    expect(applyIntent(state, intent('guest', OP.ARENA, { arenaId: 'frostspine' }), 10).changed).toBe(false);
    expect(applyIntent(state, intent('host', OP.ARENA, { arenaId: 'frostspine' }), 10).changed).toBe(true);
    expect(state.arenaId).toBe('frostspine');
    expect(state.match.arenaId).toBe('frostspine');
  });

  it('ignores an unknown arena id', () => {
    const state = room();
    expect(applyIntent(state, intent('host', OP.ARENA, { arenaId: 'atlantis' }), 10).changed).toBe(false);
  });

  it('goes live when the countdown runs out, with one payload per seat', () => {
    const state = room();
    join(state);
    applyIntent(state, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(state, intent('host', OP.START), 100);
    expect(tickLobby(state, 100 + COUNTDOWN_MS - 1).launched).toBe(false);
    const ready = tickLobby(state, 100 + COUNTDOWN_MS);
    expect(ready.launched).toBe(true);
    expect(state.status).toBe('live');
    expect(ready.payload.pvp).toMatchObject({ roomCode: 'ABCDE', seat: 'p1', arenaId: state.arenaId, seed: 4 });
  });

  it('tracks rival progress and keeps the match live', () => {
    const state = room();
    join(state);
    applyIntent(state, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(state, intent('host', OP.START), 100);
    tickLobby(state, 100 + COUNTDOWN_MS);
    applyIntent(state, intent('guest', OP.PROGRESS, { wave: 4, totalWaves: 8, score: 500, coreHp: 19 }), 200);
    expect(state.match.seats[1].progress).toMatchObject({ wave: 4, score: 500, coreHp: 19 });
    expect(state.status).toBe('live');
    expect(lobbyView(state).rival.progress.wave).toBe(4);
  });

  it('closes the match on a seat report and surfaces the winner', () => {
    const state = room();
    join(state);
    applyIntent(state, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(state, intent('host', OP.START), 100);
    tickLobby(state, 100 + COUNTDOWN_MS);

    const cleared = { outcome: 'cleared', score: 1500, coreHp: 22, waves: 8, timeMs: 200000 };
    applyIntent(state, intent('host', OP.RESULT, cleared), 300);
    expect(state.status).toBe('live'); // waiting on the rival

    const over = applyIntent(
      state,
      intent('guest', OP.RESULT, { ...cleared, score: 900 }),
      400
    );
    expect(state.status).toBe('over');
    expect(over.effects).toContainEqual({
      type: 'match-over',
      resolved: expect.objectContaining({ winner: 'p1', reason: 'points' }),
    });
    expect(state.match.winner).toBe('p1');
  });

  it('forfeits the seat that leaves mid-match', () => {
    const state = room();
    join(state);
    applyIntent(state, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(state, intent('host', OP.START), 100);
    tickLobby(state, 100 + COUNTDOWN_MS);
    applyIntent(state, intent('host', OP.RESULT, { outcome: 'cleared', score: 10, coreHp: 25, waves: 8, timeMs: 1 }), 200);
    const { effects } = applyIntent(state, intent('guest', OP.LEAVE), 300);
    expect(effects.some((effect) => effect.type === 'match-over')).toBe(true);
    expect(state.status).toBe('over');
    expect(state.match.winner).toBe('p1');
  });

  it('resets to a fresh lobby on rematch, keeping names and seats', () => {
    const state = room();
    join(state);
    applyIntent(state, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(state, intent('host', OP.START), 100);
    tickLobby(state, 100 + COUNTDOWN_MS);
    applyIntent(state, intent('host', OP.RESULT, { outcome: 'ko', score: 10, coreHp: 0, waves: 3, timeMs: 1 }), 200);
    expect(state.status).toBe('over');

    const { effects } = applyIntent(state, intent('host', OP.REMATCH), 300);
    expect(effects).toContainEqual({ type: 'rematch' });
    expect(state.status).toBe('lobby');
    expect(state.seed).toBe(5);
    expect(state.match.seats.map((seat) => seat.name)).toEqual(['Ronn', 'Kai']);
    expect(state.match.seats.every((seat) => !seat.ready && !seat.result)).toBe(true);
    expect(state.clients).toHaveLength(2);
  });

  it('round-trips through a host snapshot', () => {
    const host = room();
    join(host);
    applyIntent(host, intent('guest', OP.READY, { ready: true }), 10);
    applyIntent(host, intent('host', OP.ARENA, { arenaId: 'dust-meridian' }), 20);
    applyIntent(host, intent('host', OP.START), 30);

    const guest = createLobbyState({ roomCode: 'ABCDE', selfId: 'guest', name: 'Kai', isHost: false });
    adoptSnapshot(guest, snapshot(host, 40));

    expect(guest.isHost).toBe(false);
    expect(guest.hostId).toBe('host');
    expect(guest.arenaId).toBe('dust-meridian');
    expect(seatOf(guest, 'guest')).toBe('p2');
    expect(guest.status).toBe('countdown');
    expect(guest.countdownEndsAt - 40).toBeGreaterThan(COUNTDOWN_MS - 10);
    expect(guest.match.seats[0].ready).toBe(true);
    expect(lobbyView(guest).canStart).toBe(false);
  });

  it('ignores a snapshot from a different room', () => {
    const guest = createLobbyState({ roomCode: 'ABCDE', selfId: 'guest', isHost: false });
    const before = JSON.stringify(guest);
    adoptSnapshot(guest, { roomCode: 'ZZZZZ', seats: [] });
    expect(JSON.stringify(guest)).toBe(before);
  });

  it('describes the launch payload GameScene expects', () => {
    const state = room();
    expect(launchPayload(state, 'p2')).toEqual({
      pvp: { roomCode: 'ABCDE', arenaId: state.arenaId, seed: 4, seat: 'p2' },
    });
  });
});

describe('PvpRoom over BroadcastChannel', () => {
  const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

  it('wires a host and a challenger end to end', async () => {
    const host = new PvpRoom({ mode: 'local' });
    const guest = new PvpRoom({ mode: 'local' });
    try {
      const hosted = await host.host({ name: 'Ronn' });
      expect(hosted.roomCode).toHaveLength(5);
      expect(hosted.self.name).toBe('Ronn');

      await guest.join({ code: hosted.roomCode, name: 'Kai' });
      await wait(60);

      expect(host.view.connected).toBe(2);
      expect(guest.view.connected).toBe(2);
      expect(guest.view.self.name).toBe('Kai');
      expect(guest.view.hostId ?? guest.state.hostId).toBe(host.selfId);

      guest.setReady(true);
      await wait(60);
      expect(host.view.rival.ready).toBe(true);

      const launches = [];
      host.on('launch', (payload) => launches.push({ who: 'host', ...payload }));
      guest.on('launch', (payload) => launches.push({ who: 'guest', ...payload }));

      host.start();
      await wait(60);
      expect(host.state.status).toBe('countdown');
      expect(guest.state.status).toBe('countdown');

      // Advance the host's clock past the countdown.
      host.now = () => Date.now() + COUNTDOWN_MS + 10;
      host.tick();
      await wait(80);

      expect(launches).toHaveLength(2);
      expect(launches.map((entry) => entry.pvp.seat).sort()).toEqual(['p1', 'p2']);
      expect(new Set(launches.map((entry) => entry.pvp.arenaId)).size).toBe(1);
      expect(host.state.status).toBe('live');
      expect(guest.state.status).toBe('live');
    } finally {
      host.leave();
      guest.leave();
    }
  });

  it('relays a knockout result to both clients', async () => {
    const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
    const host = new PvpRoom({ mode: 'local' });
    const guest = new PvpRoom({ mode: 'local' });
    try {
      const hosted = await host.host({ name: 'Ronn' });
      await guest.join({ code: hosted.roomCode, name: 'Kai' });
      await wait(50);
      guest.setReady(true);
      await wait(50);
      host.start();
      await wait(50);
      host.now = () => Date.now() + COUNTDOWN_MS + 10;
      host.tick();
      await wait(60);

      const over = [];
      host.on('over', (payload) => over.push({ who: 'host', ...payload }));
      guest.on('over', (payload) => over.push({ who: 'guest', ...payload }));

      guest.reportSeat({ outcome: 'ko', score: 120, coreHp: 0, waves: 3, timeMs: 90000 });
      await wait(80);

      expect(over.length).toBe(2);
      expect(over.every((entry) => entry.resolved.winner === 'p1')).toBe(true);
      expect(host.state.status).toBe('over');
      expect(guest.state.status).toBe('over');
    } finally {
      host.leave();
      guest.leave();
    }
  });
});
