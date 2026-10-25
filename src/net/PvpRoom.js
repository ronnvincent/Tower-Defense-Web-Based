/**
 * PvpRoom.js — one duel room, from "create / join" to "rematch".
 *
 * The room owns a {@link LobbyState}; the host is the only client that folds
 * intents into it, and everyone else paints the host's snapshot. Networking is
 * delegated to a transport (BroadcastChannel or WebSocket), so this file has no
 * socket code and can be driven directly by tests.
 *
 * Events emitted:
 *   'state'   (view)                  every time the lobby view changes
 *   'launch'  ({ pvp })               the countdown hit zero — start GameScene
 *   'over'    ({ resolved, view })    the match has been decided
 *   'status'  ('open'|'closed'|...)   transport health, for the lobby badge
 *   'error'   (message)               user-facing problem ("room full", ...)
 *
 * The room also refuses to be a silent dead end: a challenger that never hears
 * a snapshot from the host within {@link PEER_TIMEOUT_MS} gets an `error` that
 * says so, instead of a board that waits forever.
 */

import {
  COUNTDOWN_MS,
  LOBBY_STATUS,
  MAX_CLIENTS,
  adoptSnapshot,
  applyIntent,
  createLobbyState,
  lobbyView,
  seatOf,
  snapshot,
  tickLobby,
} from './LobbyState.js';
import { MSG, OP, envelope, isValidRoomCode, makeRoomCode, normaliseRoomCode } from './lobbyProtocol.js';
import { forfeit, opponentOf } from '../systems/PvpMatch.js';
import { TRANSPORT, createTransport, linkError } from './transports.js';

/** A joiner that hears nothing from the host for this long is told so. */
export const PEER_TIMEOUT_MS = 9000;

export const ROOM_EVENTS = Object.freeze({
  STATE: 'state',
  LAUNCH: 'launch',
  OVER: 'over',
  STATUS: 'status',
  ERROR: 'error',
});

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export class PvpRoom {
  constructor({ mode = 'auto', now = () => Date.now(), relayUrl = null } = {}) {
    this.mode = mode;
    this.now = now;
    this.relayUrl = relayUrl;
    this.state = null;
    this.transport = null;
    this.handlers = new Map();
    this.launched = false;
    this.overEmitted = false;
    this.closed = false;
    this.status = 'idle';
    this.lastError = null;
    this.selfId = randomId();
    /** When this client started looking for its host (0 = not searching). */
    this.joinedAt = 0;
    /** True once the host has actually spoken to us. */
    this.peerSeen = false;
    this.peerWarned = false;
  }

  /* --------------------------------------------------------------- events */

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) || []) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[pvp] ${event} handler failed`, error);
      }
    }
  }

  get view() {
    return this.state ? lobbyView(this.state) : null;
  }

  get seat() {
    return this.state ? seatOf(this.state, this.selfId) : null;
  }

  /** 'relay' | 'local' once a transport exists, else what we are asking for. */
  get kind() {
    return this.transport?.kind || null;
  }

  /** The relay this room dials, or null for a same-browser room. */
  get linkUrl() {
    return this.transport?.url || null;
  }

  /* ------------------------------------------------------------------ setup */

  /**
   * Open a room. `code` lets the host pin the code (used by tests and by a
   * future "bring your own code" field); otherwise one is minted.
   */
  async host({ name = 'Host', arenaId = null, seed = null, code = null } = {}) {
    this.closed = false;
    this.peerSeen = false;
    this.peerWarned = false;
    const roomCode = code ? normaliseRoomCode(code) : makeRoomCode();
    this.state = createLobbyState({
      roomCode,
      selfId: this.selfId,
      name,
      isHost: true,
      arenaId: arenaId || undefined,
      seed: seed ?? Math.floor(Math.random() * 1e6),
      now: this.now(),
    });
    await this.#openTransport({ roomCode, name, host: true });
    this.#publish();
    return this.view;
  }

  async join({ code, name = 'Challenger' } = {}) {
    this.closed = false;
    this.peerSeen = false;
    this.peerWarned = false;
    const roomCode = normaliseRoomCode(code);
    if (!isValidRoomCode(roomCode)) throw new Error('That room code is not valid');
    this.state = createLobbyState({
      roomCode,
      selfId: this.selfId,
      name,
      isHost: false,
      seed: 1,
      now: this.now(),
    });
    await this.#openTransport({ roomCode, name, host: false });
    this.#sendIntent(OP.JOIN, { name });
    this.#publish();
    return this.view;
  }

  async #openTransport({ roomCode, name, host }) {
    this.transport = createTransport({
      mode: this.mode,
      roomCode,
      selfId: this.selfId,
      name,
      host,
      url: this.relayUrl,
    });
    this.transport.onMessage = (message) => this.#handle(message);
    this.transport.onStatus = (status) => {
      this.status = status;
      this.emit(ROOM_EVENTS.STATUS, status);
    };
    try {
      await this.transport.connect();
    } catch (error) {
      this.status = 'error';
      this.lastError = error?.message || 'Could not open the duel link';
      this.emit(ROOM_EVENTS.STATUS, 'error');
      this.emit(ROOM_EVENTS.ERROR, this.lastError);
      throw error;
    }
    // Only a searcher needs a watchdog; the host is the one being waited for.
    this.joinedAt = host ? 0 : this.now();
  }

  /* --------------------------------------------------------------- intents */

  setReady(ready) {
    this.#sendIntent(OP.READY, { ready: Boolean(ready) });
  }

  rename(name) {
    this.#sendIntent(OP.RENAME, { name });
  }

  pickArena(arenaId) {
    if (this.state?.isHost) {
      const { changed } = applyIntent(this.state, {
        clientId: this.selfId,
        op: OP.ARENA,
        payload: { arenaId },
      }, this.now());
      if (changed) this.#publish();
      return;
    }
    this.#sendIntent(OP.ARENA, { arenaId });
  }

  start() {
    this.#sendIntent(OP.START, {});
  }

  /** Mid-match heartbeat so both players can watch each other. */
  reportProgress(progress) {
    if (!this.state || this.state.status !== 'live') return;
    this.#sendIntent(OP.PROGRESS, progress);
  }

  /** Terminal report from GameScene (`window.gamePvp.reportSeat`). */
  reportSeat(report) {
    if (!this.state) return;
    this.#sendIntent(OP.RESULT, {
      outcome: report.outcome,
      score: report.score,
      coreHp: report.coreHp,
      waves: report.waves,
      timeMs: report.timeMs,
    });
  }

  rematch() {
    this.launched = false;
    this.overEmitted = false;
    this.#sendIntent(OP.REMATCH, {});
  }

  leave() {
    if (this.closed) return;
    if (this.transport) this.transport.send(envelope(this.selfId, MSG.BYE, { op: OP.LEAVE }, this.state?.roomCode));
    if (this.state && this.state.isHost) {
      applyIntent(this.state, { clientId: this.selfId, op: OP.LEAVE }, this.now());
    }
    this.closed = true;
    this.transport?.close();
    this.state = null;
  }

  /* -------------------------------------------------------------- plumbing */

  #sendIntent(op, payload) {
    if (!this.state) return;
    if (this.state.isHost) {
      this.#applyLocalIntent({ clientId: this.selfId, op, payload });
      return;
    }
    this.transport?.send(envelope(this.selfId, MSG.INTENT, { op, payload }, this.state.roomCode));
  }

  #handle(message) {
    if (!this.state) return;
    switch (message.type) {
      case MSG.HELLO: {
        // A relayed client announcing itself: tell it the room and the truth.
        const payload = message.payload || {};
        if (payload.roomCode && normaliseRoomCode(payload.roomCode) !== this.state?.roomCode) {
          this.transport?.send(envelope(this.selfId, MSG.BYE, { reason: 'wrong-room' }, this.state?.roomCode));
          return;
        }
        this.#applyRemoteIntent({ clientId: message.from, op: OP.JOIN, payload: { name: payload.name } });
        this.#broadcast();
        return;
      }

      case MSG.INTENT: {
        if (!this.state?.isHost) return;
        const { op, payload } = message.payload || {};
        this.#applyRemoteIntent({ clientId: message.from, op, payload });
        return;
      }

      case MSG.SYNC: {
        if (this.state?.isHost) return;
        this.peerSeen = true;
        adoptSnapshot(this.state, message.payload);
        this.#publish();
        this.#maybeLaunch();
        // The joiner is not the authority, so the end of a match arrives as a
        // snapshot field rather than a reducer effect — surface it once.
        if (this.state.status === LOBBY_STATUS.OVER) this.#emitOver();
        return;
      }

      case MSG.BYE: {
        const reason = message.payload?.reason;
        if (reason && reason !== 'peer-left' && reason !== 'wrong-room') {
          // The relay refused us (or the host refused a stale hello). Say what
          // happened and stop: there is no room to sit in.
          this.emit(ROOM_EVENTS.ERROR, linkError(reason, 'The duel link was refused'));
          return;
        }
        if (this.state?.isHost) {
          this.#applyRemoteIntent({ clientId: message.from, op: OP.LEAVE, payload: {} });
          return;
        }
        // A challenger cannot edit the room, but if the host vanishes mid-match
        // they still deserve a verdict instead of a frozen arena.
        const seat = this.seat;
        if (this.state && seat && this.state.status === LOBBY_STATUS.LIVE) {
          const { resolved } = forfeit(this.state.match, opponentOf(seat), this.now());
          this.state.status = LOBBY_STATUS.OVER;
          this.#publish();
          if (resolved) {
            this.overEmitted = true;
            this.emit(ROOM_EVENTS.OVER, { resolved, view: this.view });
          }
          return;
        }
        this.emit(ROOM_EVENTS.ERROR, 'Your rival left the room');
        return;
      }

      default:
        return;
    }
  }

  #applyRemoteIntent(intent) {
    const { effects, changed } = applyIntent(this.state, intent, this.now());
    if (!changed) {
      for (const effect of effects) {
        if (effect.type === 'rejected') {
          this.emit(ROOM_EVENTS.ERROR, effect.reason === 'full' ? 'That room is full' : 'Wait for your rival');
        }
      }
      return;
    }
    for (const effect of effects) this.#handleEffect(effect);
    this.#broadcast();
  }

  #applyLocalIntent(intent) {
    const { effects, changed } = applyIntent(this.state, intent, this.now());
    if (!changed) {
      for (const effect of effects) {
        if (effect.type === 'rejected') {
          this.emit(ROOM_EVENTS.ERROR, effect.reason === 'full' ? 'That room is full' : 'Wait for your rival');
        }
      }
      this.#publish();
      return;
    }
    for (const effect of effects) this.#handleEffect(effect);
    this.#broadcast();
  }

  #handleEffect(effect) {
    if (effect.type === 'match-over') {
      this.overEmitted = true;
      this.emit(ROOM_EVENTS.OVER, { resolved: effect.resolved, view: this.view });
    }
  }

  /** Emit the end of a match exactly once, whichever side learned of it. */
  #emitOver() {
    if (this.overEmitted) return;
    this.overEmitted = true;
    const { match } = this.state;
    this.emit(ROOM_EVENTS.OVER, {
      resolved: {
        winner: match.winner,
        loser: match.loser,
        reason: match.reason,
        draw: Boolean(match.draw),
        decided: true,
        waiting: false,
      },
      view: this.view,
    });
  }

  #broadcast() {
    if (!this.state?.isHost) {
      this.#publish();
      return;
    }
    this.transport?.send(envelope(this.selfId, MSG.SYNC, snapshot(this.state, this.now()), this.state.roomCode));
    this.#publish();
  }

  #publish() {
    this.emit(ROOM_EVENTS.STATE, this.view);
    this.#maybeLaunch();
  }

  #maybeLaunch() {
    if (this.launched || this.state?.status !== 'live') return;
    const seat = this.seat;
    if (!seat) return;
    this.launched = true;
    this.emit(ROOM_EVENTS.LAUNCH, {
      pvp: {
        roomCode: this.state.roomCode,
        arenaId: this.state.arenaId,
        seed: this.state.seed,
        seat,
      },
    });
  }

  /**
   * Drive the countdown. The host owns the clock; joiners follow the snapshot.
   * @returns {boolean} true when the match just went live
   */
  tick(now = this.now()) {
    this.#checkPeer(now);
    if (!this.state?.isHost || this.state.status !== 'countdown') return false;
    const before = this.state.status;
    const { launched } = tickLobby(this.state, now);
    if (!launched && this.state.status === before) return false;
    this.#broadcast();
    return true;
  }

  /**
   * A local room cannot be acked by a server, so the only proof a host exists
   * is an incoming snapshot. Without this the challenger's board waits
   * forever — the exact bug that made two-device duels look like nothing
   * happened.
   */
  #checkPeer(now) {
    if (this.closed || !this.state || this.state.isHost) return;
    if (this.peerSeen || this.peerWarned || !this.joinedAt) return;
    if (this.state.status !== LOBBY_STATUS.LOBBY) return;
    if (this.state.clients.length > 1) return; // someone is in the other seat
    if (now - this.joinedAt < PEER_TIMEOUT_MS) return;
    this.peerWarned = true;
    this.emit(
      ROOM_EVENTS.ERROR,
      this.kind === TRANSPORT.LOCAL
        ? 'No host answered in this browser. Local rooms only work in two tabs of the same browser — pick an ONLINE room for two devices.'
        : 'No host answered that code. Ask the host to press CREATE ROOM, then join again.'
    );
  }

  /** Milliseconds left on the countdown (0 when not counting). */
  countdownRemaining(now = this.now()) {
    if (!this.state || this.state.status !== 'countdown') return 0;
    return Math.max(0, this.state.countdownEndsAt - now);
  }

  get canStart() {
    return Boolean(this.view?.canStart);
  }

  get maxClients() {
    return MAX_CLIENTS;
  }

  get countdownMs() {
    return COUNTDOWN_MS;
  }
}
