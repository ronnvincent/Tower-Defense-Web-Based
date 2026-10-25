/**
 * transports.js — how two duel clients reach each other.
 *
 * Both implementations speak the same tiny contract, so `PvpRoom` never learns
 * which one it is holding:
 *
 *   transport.send(envelope)
 *   transport.close()
 *   transport.onMessage = (envelope) => void
 *   transport.onStatus  = (status) => void
 *   // 'connecting'|'reconnecting'|'linking'|'open'|'closed'|'error'
 *
 * • WebSocketTransport — a relay (see server/pvp-relay.mjs). This is the only
 *   path that can cross a device boundary: the client dials `/pvp` on whatever
 *   host served the page, and the dev/preview server proxies that to the relay.
 *   `connect()` does not resolve until the relay has *seated* the socket, so a
 *   wrong code fails loudly instead of parking the player on a dead board.
 * • BroadcastTransport — two tabs of one browser, no server. Useful for a demo
 *   and for tests. It cannot reach another device and it resolves immediately,
 *   which is why the room watches for a silent peer (see PvpRoom#checkPeer).
 *
 * Picking one (see {@link preferredMode}):
 *   1. an explicit `mode: 'local' | 'relay'` (tests, the lobby's link chips)
 *   2. `?pvp=local` / `?pvp=relay` in the URL (handy on a phone)
 *   3. `VITE_PVP_RELAY` (a full ws:// URL, for a relay on another host)
 *   4. served over http(s) → relay; opened from disk (file://) → local
 *
 * Rule 4 is the one that fixes two-device play: before it existed, the default
 * was BroadcastChannel, so two phones sat waiting for each other forever.
 */

import { MSG, envelope, validEnvelope } from './lobbyProtocol.js';

const ROOM_PREFIX = 'tdl-duel-';

export const TRANSPORT = Object.freeze({ LOCAL: 'local', RELAY: 'relay' });

/** Relay refusals, in words a player can act on. */
const REASONS = Object.freeze({
  'bad-code': 'That room code is not valid. Codes are five characters, A–Z and 2–9.',
  'code-taken': 'Another room already holds that code. Press CREATE ROOM again for a fresh one.',
  'no-room': 'No room is open under that code yet. Ask the host to press CREATE ROOM, then join.',
  'no-host': 'The host closed that room.',
  full: 'That room already seats two challengers.',
  'peer-left': 'Your rival left the room.',
  'wrong-room': 'Your rival is in a different room.',
});

/** @param {string} reason a relay `bye` reason */
export function linkError(reason, fallback = 'Could not join that room') {
  return REASONS[reason] || fallback;
}

/** Relay URL advertised for this page: env override, else same-origin `/pvp`. */
export function relayUrlFor({ envUrl = null, loc = globalThis.location } = {}) {
  if (envUrl) return envUrl;
  const host = loc?.host;
  if (!host) return null;
  const secure = loc.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${host}/pvp`;
}

/**
 * Decide which transport a room should use. Pure so it can be unit-tested
 * without a browser.
 * @returns {'local'|'relay'}
 */
export function preferredMode({ mode = 'auto', envUrl = null, loc = globalThis.location } = {}) {
  if (mode === TRANSPORT.LOCAL || mode === TRANSPORT.RELAY) return mode;
  let param = null;
  try {
    param = new URLSearchParams(loc?.search || '').get('pvp');
  } catch {
    param = null;
  }
  if (param === TRANSPORT.LOCAL || param === TRANSPORT.RELAY) return param;
  if (envUrl) return TRANSPORT.RELAY;
  if (loc && /^https?:$/.test(loc.protocol || '')) return TRANSPORT.RELAY;
  return TRANSPORT.LOCAL;
}

function envRelayUrl() {
  try {
    return import.meta?.env?.VITE_PVP_RELAY || null;
  } catch {
    return null;
  }
}

export class BroadcastTransport {
  constructor({ roomCode, selfId }) {
    this.kind = TRANSPORT.LOCAL;
    this.url = null;
    this.roomCode = roomCode;
    this.selfId = selfId;
    this.channel = null;
    this.onMessage = null;
    this.onStatus = null;
    this.closed = false;
  }

  static isSupported() {
    return typeof BroadcastChannel === 'function';
  }

  connect() {
    if (typeof BroadcastChannel !== 'function') {
      return Promise.reject(new Error('This browser cannot open a local room'));
    }
    this.channel = new BroadcastChannel(ROOM_PREFIX + this.roomCode);
    this.channel.onmessage = (event) => {
      const message = event.data;
      if (!validEnvelope(message) || message.from === this.selfId) return;
      this.onMessage?.(message);
    };
    this.onStatus?.('open');
    return Promise.resolve(this);
  }

  send(message) {
    if (this.closed || !this.channel) return;
    this.channel.postMessage({ ...message, from: this.selfId });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.channel?.close();
    } catch {
      /* already gone */
    }
    this.onStatus?.('closed');
  }
}

/** How many times an initial dial is retried before we admit the relay is down. */
const ATTEMPT_DELAYS = [400, 900, 1800];
/** How long the relay gets to seat us before the dial counts as failed. */
const HANDSHAKE_MS = 15000;

export class WebSocketTransport {
  constructor({
    url,
    roomCode,
    selfId,
    name,
    host = false,
    socketFactory = null,
    handshakeMs = HANDSHAKE_MS,
  }) {
    this.kind = TRANSPORT.RELAY;
    this.url = url;
    this.roomCode = roomCode;
    this.selfId = selfId;
    this.name = name;
    this.host = host;
    this.socketFactory = socketFactory || ((target) => new WebSocket(target));
    this.handshakeMs = handshakeMs;
    this.socket = null;
    this.onMessage = null;
    this.onStatus = null;
    this.closed = false;
    /** True once the relay has answered `welcome` for this socket. */
    this.seated = false;
    this.attempt = 0;
    this.queue = [];
    this.retryTimer = null;
    this.handshakeTimer = null;
    this.settle = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
      this.attempt = 0;
      this.#dial();
    });
  }

  #dial() {
    this.onStatus?.(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let socket;
    try {
      socket = this.socketFactory(this.url);
    } catch (error) {
      this.#fail(error?.message || 'Could not open a duel link');
      return;
    }
    this.socket = socket;
    this.seated = false;
    /** This dial is over: either seated, refused, or dropped while dialling. */
    let done = false;

    const stopDial = () => {
      done = true;
      clearTimeout(this.handshakeTimer);
    };

    this.handshakeTimer = setTimeout(() => {
      if (this.seated || this.closed || done) return;
      stopDial();
      try {
        socket.close();
      } catch {
        /* already gone */
      }
      this.#fail('The duel relay did not answer. Check that `npm run pvp:relay` is running.');
    }, this.handshakeMs);
    this.handshakeTimer.unref?.();

    /**
     * A dial that never reached the relay. Browsers fire `error` then `close`;
     * Node's WebSocket fires `error` and never closes at all, so both events
     * land here and `done` keeps it from counting twice.
     */
    const dialFailed = () => {
      if (done || this.closed) return;
      stopDial();
      try {
        socket.close();
      } catch {
        /* already gone */
      }
      if (this.attempt < ATTEMPT_DELAYS.length) {
        const delay = ATTEMPT_DELAYS[this.attempt++];
        this.onStatus?.('reconnecting');
        this.retryTimer = setTimeout(() => {
          if (!this.closed) this.#dial();
        }, delay);
        this.retryTimer.unref?.();
        return;
      }
      this.#fail(
        'Could not reach the duel relay. Start it with `npm run pvp:relay`, or host one and set VITE_PVP_RELAY.'
      );
    };

    socket.onopen = () => {
      if (this.closed) return;
      this.send(envelope(this.selfId, MSG.HELLO, {
        roomCode: this.roomCode,
        name: this.name,
        host: this.host,
      }));
      for (const message of this.queue.splice(0)) this.send(message);
    };

    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (!validEnvelope(message)) return;

      // The relay speaks twice during a dial: `note` while it waits for the
      // host's room to exist, then `welcome` (seated) or `bye` (refused).
      if (message.type === MSG.NOTE) {
        this.onStatus?.('linking');
        return;
      }
      if (!this.seated) {
        if (message.type === MSG.WELCOME) {
          this.seated = true;
          stopDial();
          this.attempt = 0;
          this.onStatus?.('open');
          this.#settleOk();
          return;
        }
        if (message.type === MSG.BYE) {
          stopDial();
          this.closed = true;
          try {
            socket.close();
          } catch {
            /* already gone */
          }
          this.#fail(linkError(message.payload?.reason, 'The duel relay refused the room'), message.payload?.reason);
          return;
        }
      }
      if (message.type === MSG.WELCOME) return; // late duplicate; seats come from the host
      this.onMessage?.(message);
    };

    socket.onerror = () => {
      if (this.closed) return;
      if (!this.seated) dialFailed();
      else this.onStatus?.('error');
    };

    socket.onclose = () => {
      if (this.closed) return;
      if (!this.seated) {
        dialFailed();
        return;
      }
      // We were seated and the link dropped. Do not silently redial: a new
      // socket is a new room, and the player deserves to see the drop.
      stopDial();
      this.closed = true;
      this.onStatus?.('closed');
      this.#settleOk();
    };
  }

  #settleOk() {
    const settle = this.settle;
    this.settle = null;
    settle?.resolve(this);
  }

  #fail(message, reason = null) {
    if (this.closed && !this.settle) return;
    this.closed = true;
    this.onStatus?.('error');
    const settle = this.settle;
    this.settle = null;
    if (settle) {
      const error = new Error(message);
      error.reason = reason;
      settle.reject(error);
    }
  }

  send(message) {
    if (this.closed) return;
    const payload = JSON.stringify({ ...message, from: this.selfId });
    if (this.socket?.readyState === 1) this.socket.send(payload);
    else if (this.socket?.readyState === 0) this.queue.push(message);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.handshakeTimer);
    try {
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.onStatus?.('closed');
    this.settle?.resolve(this);
    this.settle = null;
  }
}

/**
 * Build the transport for a room.
 *
 * @param {object} options
 * @param {'auto'|'local'|'relay'} [options.mode]
 * @param {string} [options.url]  explicit relay address (tests)
 */
export function createTransport({
  mode = 'auto',
  roomCode,
  selfId,
  name,
  host,
  url = null,
  envUrl = envRelayUrl(),
  loc = globalThis.location,
} = {}) {
  const resolved = preferredMode({ mode, envUrl, loc });
  if (resolved === TRANSPORT.LOCAL) return new BroadcastTransport({ roomCode, selfId });
  const target = url || relayUrlFor({ envUrl, loc });
  if (!target) {
    // Asking for the relay with nowhere to dial is a configuration error, not
    // a reason to fall back to a link that can never leave this machine.
    throw new Error('No duel relay address: set VITE_PVP_RELAY or serve the game over http(s).');
  }
  return new WebSocketTransport({ url: target, roomCode, selfId, name, host });
}
