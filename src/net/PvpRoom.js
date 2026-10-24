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
import { createTransport } from './transports.js';

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
  constructor({ mode = 'auto', now = () => Date.now() } = {}) {
    this.mode = mode;
    this.now = now;
    this.state = null;
    this.transport = null;
    this.handlers = new Map();
    this.launched = false;
    this.overEmitted = false;
    this.closed = false;
    this.status = 'idle';
    this.lastError = null;
    this.selfId = randomId();
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

  /* ------------------------------------------------------------------ setup */

  async host({ name = 'Host', arenaId = null, seed = null } = {}) {
    const roomCode = makeRoomCode();
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
    });
    this.transport.onMessage = (message) => this.#handle(message);
    this.transport.onStatus = (status) => {
      this.status = status;
      this.emit(ROOM_EVENTS.STATUS, status);
    };
    await this.transport.connect();
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
        adoptSnapshot(this.state, message.payload);
        this.#publish();
        this.#maybeLaunch();
        // The joiner is not the authority, so the end of a match arrives as a
        // snapshot field rather than a reducer effect — surface it once.
        if (this.state.status === LOBBY_STATUS.OVER) this.#emitOver();
        return;
      }

      case MSG.BYE: {
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
    if (!this.state?.isHost || this.state.status !== 'countdown') return false;
    const before = this.state.status;
    const { launched } = tickLobby(this.state, now);
    if (!launched && this.state.status === before) return false;
    this.#broadcast();
    return true;
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
