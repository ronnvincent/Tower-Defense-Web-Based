/**
 * LobbyState.js — the authoritative state of one duel room.
 *
 * Pure and synchronous: `applyIntent(state, intent, now)` returns a new state
 * plus a list of effects, and the networking layer is the only thing that knows
 * whether the bytes travelled over BroadcastChannel or a WebSocket. The host
 * runs this reducer; joiners adopt its `snapshot()` verbatim.
 *
 * Why host-authoritative instead of peer-to-peer state? A duel is a race, not a
 * lockstep simulation: the only shared facts are "which arena, which seed,
 * who is ready, what has each seat reported". Those fit in one small snapshot,
 * so a reconnect is a single message instead of a replay log.
 */

import { PVP_ARENAS, PVP_RULES, DEFAULT_ARENA_ID, getArena } from '../data/pvpArenas.js';
import {
  MATCH_STATUS,
  createMatch,
  getSeat,
  goLive,
  renameSeat,
  reportProgress,
  reportSeat,
  setReady,
  beginCountdown,
  bothReady,
  forfeit,
  opponentOf,
} from '../systems/PvpMatch.js';
import { OP, sanitiseName } from './lobbyProtocol.js';

/** Countdown before the gates open, so both players can see the arena. */
export const COUNTDOWN_MS = 3200;
export const MAX_CLIENTS = 2;

export const LOBBY_STATUS = MATCH_STATUS;

export function createLobbyState({
  roomCode,
  selfId,
  name = 'Host',
  isHost = true,
  arenaId = DEFAULT_ARENA_ID,
  seed = 1,
  now = 0,
} = {}) {
  const match = createMatch({ roomCode, arenaId, seed, totalWaves: PVP_RULES.waves, now });
  if (isHost) renameSeat(match, 'p1', sanitiseName(name, 'Host'));
  return {
    roomCode,
    selfId,
    hostId: isHost ? selfId : null,
    isHost,
    arenaId,
    seed,
    status: MATCH_STATUS.LOBBY,
    countdownEndsAt: 0,
    match,
    clients: isHost ? [{ id: selfId, seat: 'p1', name: sanitiseName(name, 'Host') }] : [],
    lastChange: now,
  };
}

export function clientEntry(state, clientId) {
  return state.clients.find((client) => client.id === clientId) || null;
}

export function seatOf(state, clientId) {
  return clientEntry(state, clientId)?.seat || null;
}

export function seatForClient(state, clientId) {
  const seatId = seatOf(state, clientId);
  return seatId ? getSeat(state.match, seatId) : null;
}

export function selfSeat(state) {
  return seatOf(state, state.selfId);
}

export function rivalSeat(state) {
  const mine = selfSeat(state);
  return mine ? getSeat(state.match, opponentOf(mine)) : null;
}

function freeSeat(state) {
  const taken = new Set(state.clients.map((client) => client.seat));
  return ['p1', 'p2'].find((seat) => !taken.has(seat)) || null;
}

function touch(state, now) {
  state.lastChange = now;
  return state;
}

/**
 * Fold one client intent into the room.
 *
 * @param {object} state
 * @param {{clientId:string, op:string, payload?:object}} intent
 * @param {number} now  monotonic ms (injected, so tests are deterministic)
 * @returns {{state:object, effects:Array<object>, changed:boolean}}
 */
export function applyIntent(state, intent, now = 0) {
  const effects = [];
  const clientId = intent?.clientId;
  const op = intent?.op;
  const payload = intent?.payload || {};
  if (!clientId || !op) return { state, effects, changed: false };

  const existing = clientEntry(state, clientId);
  const seatId = existing?.seat || null;

  switch (op) {
    case OP.JOIN: {
      if (existing) {
        // A rejoin (refresh, dropped socket) keeps the same seat.
        return { state: touch(state, now), effects: [{ type: 'joined', seat: seatId }], changed: true };
      }
      if (state.clients.length >= MAX_CLIENTS || state.status !== MATCH_STATUS.LOBBY) {
        return { state, effects: [{ type: 'rejected', reason: 'full' }], changed: false };
      }
      const seat = freeSeat(state);
      if (!seat) return { state, effects: [{ type: 'rejected', reason: 'full' }], changed: false };
      const name = sanitiseName(payload.name, seat === 'p2' ? 'Challenger' : 'Host');
      state.clients.push({ id: clientId, seat, name });
      renameSeat(state.match, seat, name);
      effects.push({ type: 'joined', seat });
      return { state: touch(state, now), effects, changed: true };
    }

    case OP.LEAVE: {
      if (!existing) return { state, effects, changed: false };
      state.clients = state.clients.filter((client) => client.id !== clientId);
      if (state.status === MATCH_STATUS.LOBBY) {
        const seat = getSeat(state.match, existing.seat);
        if (seat) {
          seat.ready = false;
          seat.name = seat.id === 'p1' ? 'Host' : 'Challenger';
        }
      } else if (state.status !== MATCH_STATUS.OVER) {
        const { resolved } = forfeit(state.match, existing.seat, now);
        if (resolved) {
          state.status = MATCH_STATUS.OVER;
          effects.push({ type: 'match-over', resolved });
        }
      }
      effects.push({ type: 'left', seat: existing.seat });
      return { state: touch(state, now), effects, changed: true };
    }

    case OP.READY: {
      if (!seatId) return { state, effects, changed: false };
      const { changed } = setReady(state.match, seatId, payload.ready !== false);
      if (changed) effects.push({ type: 'ready', seat: seatId });
      return { state: touch(state, now), effects, changed };
    }

    case OP.RENAME: {
      if (!seatId) return { state, effects, changed: false };
      const name = sanitiseName(payload.name, 'Player');
      renameSeat(state.match, seatId, name);
      const seat = getSeat(state.match, seatId);
      if (existing) existing.name = seat?.name || name;
      return { state: touch(state, now), effects, changed: true };
    }

    case OP.ARENA: {
      if (state.status !== MATCH_STATUS.LOBBY) return { state, effects, changed: false };
      // The host owns the map pick; a challenger's tap is a request the host
      // client forwards, so the same reducer works on either machine.
      if (clientId !== state.hostId) return { state, effects, changed: false };
      const arena = PVP_ARENAS.find((entry) => entry.id === payload.arenaId);
      if (!arena || arena.id === state.arenaId) return { state, effects, changed: false };
      state.arenaId = arena.id;
      state.match.arenaId = arena.id;
      return { state: touch(state, now), effects: [{ type: 'arena', arenaId: arena.id }], changed: true };
    }

    case OP.START: {
      // Only the room's owner may open the gates, whatever a client claims.
      if (clientId !== state.hostId || state.status !== MATCH_STATUS.LOBBY) return { state, effects, changed: false };
      if (state.clients.length < MAX_CLIENTS) {
        return { state, effects: [{ type: 'rejected', reason: 'waiting' }], changed: false };
      }
      // The host's tap also readies the host, so "start" is a single button for
      // the person who created the room.
      const hostSeat = seatOf(state, state.hostId);
      if (hostSeat) setReady(state.match, hostSeat, true);
      if (!bothReady(state.match)) {
        return {
          state: touch(state, now),
          effects: [{ type: 'rejected', reason: 'not-ready' }],
          changed: true,
        };
      }
      beginCountdown(state.match, now);
      state.status = MATCH_STATUS.COUNTDOWN;
      state.countdownEndsAt = now + COUNTDOWN_MS;
      effects.push({ type: 'countdown', endsAt: state.countdownEndsAt });
      return { state: touch(state, now), effects, changed: true };
    }

    case OP.PROGRESS: {
      if (!seatId || state.status !== MATCH_STATUS.LIVE) return { state, effects, changed: false };
      reportProgress(state.match, seatId, payload);
      return { state: touch(state, now), effects: [{ type: 'progress', seat: seatId }], changed: true };
    }

    case OP.RESULT: {
      if (!seatId) return { state, effects, changed: false };
      const { resolved, changed } = reportSeat(state.match, { ...payload, seat: seatId }, now);
      if (!changed) return { state, effects, changed: false };
      effects.push({ type: 'result', seat: seatId, resolved: resolved || null });
      if (resolved) {
        state.status = MATCH_STATUS.OVER;
        effects.push({ type: 'match-over', resolved });
      }
      return { state: touch(state, now), effects, changed: true };
    }

    case OP.REMATCH: {
      if (clientId !== state.hostId || state.status !== MATCH_STATUS.OVER) return { state, effects, changed: false };
      const seats = state.match.seats.map((seat) => ({ id: seat.id, name: seat.name }));
      state.match = createMatch({ roomCode: state.roomCode, arenaId: state.arenaId, seed: state.seed + 1, totalWaves: PVP_RULES.waves, now });
      for (const seat of seats) renameSeat(state.match, seat.id, seat.name);
      state.seed += 1;
      state.status = MATCH_STATUS.LOBBY;
      state.countdownEndsAt = 0;
      effects.push({ type: 'rematch' });
      return { state: touch(state, now), effects, changed: true };
    }

    default:
      return { state, effects, changed: false };
  }
}

/** Drive the countdown clock. Call from the host's frame tick (or a test). */
export function tickLobby(state, now = 0) {
  if (state.status !== MATCH_STATUS.COUNTDOWN) return { state, launched: false };
  if (now < state.countdownEndsAt) return { state, launched: false };
  const seat = selfSeat(state);
  goLive(state.match, now);
  state.status = MATCH_STATUS.LIVE;
  return {
    state,
    launched: Boolean(seat),
    payload: seat ? { pvp: { roomCode: state.roomCode, arenaId: state.arenaId, seed: state.seed, seat } } : null,
  };
}

/** The message the host broadcasts after every change. */
export function snapshot(state, now = 0) {
  return {
    v: 1,
    roomCode: state.roomCode,
    hostId: state.hostId,
    arenaId: state.arenaId,
    seed: state.seed,
    status: state.status,
    countdownEndsAt: state.countdownEndsAt,
    // Absolute timestamps are meaningless across two machines; send the
    // remaining time and let each client build its own deadline.
    countdownRemaining: state.status === MATCH_STATUS.COUNTDOWN
      ? Math.max(0, state.countdownEndsAt - now)
      : 0,
    clients: state.clients.map((client) => ({ ...client })),
    seats: state.match.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      ready: seat.ready,
      result: seat.result ? { ...seat.result } : null,
      progress: { ...seat.progress },
    })),
    winner: state.match.winner,
    loser: state.match.loser,
    reason: state.match.reason,
    draw: Boolean(state.match.draw),
    endedAt: state.match.endedAt,
    serverNow: now,
  };
}

/**
 * Apply a host snapshot on a joining client.
 *
 * Absolute host timestamps are meaningless on another machine — the snapshot
 * carries `countdownRemaining` instead — so the deadline is rebuilt from this
 * client's own clock, which is why a phone whose clock is minutes off still
 * starts its countdown correctly.
 */
export function adoptSnapshot(state, snap, now = Date.now()) {
  if (!snap || snap.roomCode !== state.roomCode) return state;
  state.hostId = snap.hostId;
  state.isHost = snap.hostId === state.selfId;
  state.arenaId = snap.arenaId;
  state.seed = snap.seed;
  state.status = snap.status;
  state.countdownEndsAt = snap.status === MATCH_STATUS.COUNTDOWN
    ? now + (snap.countdownRemaining || 0)
    : 0;
  state.clients = (snap.clients || []).map((client) => ({ ...client }));
  state.match.roomCode = snap.roomCode;
  state.match.arenaId = snap.arenaId;
  state.match.seed = snap.seed;
  state.match.status = snap.status;
  state.match.seats = (snap.seats || []).map((seat) => ({
    id: seat.id,
    name: seat.name,
    ready: Boolean(seat.ready),
    result: seat.result ? { ...seat.result } : null,
    progress: { ...seat.progress },
  }));
  state.match.winner = snap.winner ?? null;
  state.match.loser = snap.loser ?? null;
  state.match.reason = snap.reason ?? null;
  state.match.draw = Boolean(snap.draw);
  state.match.endedAt = snap.endedAt || 0;
  return state;
}

/**
 * Everything the lobby panel paints, derived — never stored.
 * `selfId` absent means the room has not told us our seat yet.
 */
export function lobbyView(state) {
  const mine = seatForClient(state, state.selfId);
  const rival = rivalSeat(state);
  const connected = state.clients.length;
  const arena = getArena(state.arenaId);
  return {
    roomCode: state.roomCode,
    status: state.status,
    isHost: state.isHost,
    connected,
    arena: { id: arena.id, name: arena.name, theme: arena.theme, blurb: arena.blurb },
    arenas: PVP_ARENAS.map((entry) => ({
      id: entry.id,
      name: entry.name,
      theme: entry.theme,
      blurb: entry.blurb,
      selected: entry.id === state.arenaId,
    })),
    self: mine
      ? { id: mine.id, name: mine.name, ready: mine.ready, progress: { ...mine.progress } }
      : null,
    rival: rival
      ? {
          id: rival.id,
          name: rival.name,
          ready: rival.ready,
          progress: { ...rival.progress },
          present: state.clients.some((client) => client.seat === rival.id),
        }
      : null,
    canStart: Boolean(state.isHost && connected >= MAX_CLIENTS && bothReady(state.match)),
    countdownMs: state.status === MATCH_STATUS.COUNTDOWN ? Math.max(0, state.countdownEndsAt) : 0,
    results: state.match.seats.map((seat) => ({ id: seat.id, name: seat.name, result: seat.result })),
    winner: state.match.winner,
    reason: state.match.reason,
    draw: Boolean(state.match.draw),
  };
}

/** The launch payload `GameScene` accepts for a duel. */
export function launchPayload(state, seat, extra = {}) {
  return {
    pvp: {
      roomCode: state.roomCode,
      arenaId: state.arenaId,
      seed: state.seed,
      seat,
    },
    ...extra,
  };
}
