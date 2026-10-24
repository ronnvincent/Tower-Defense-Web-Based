/**
 * transports.js — how two duel clients reach each other.
 *
 * Both implementations speak the same tiny contract, so `PvpRoom` never learns
 * which one it is holding:
 *
 *   transport.send(envelope)
 *   transport.close()
 *   transport.onMessage = (envelope) => void
 *   transport.onStatus  = (status) => void   // 'connecting'|'open'|'closed'|'error'
 *
 * • BroadcastTransport — two tabs of the same browser, no server, zero setup.
 *   This is the demo path and the one the automated tests can exercise.
 * • WebSocketTransport — `npm run pvp:relay` (see server/pvp-relay.mjs) for two
 *   machines on the same network, or any relay you host.
 */

import { envelope, validEnvelope } from './lobbyProtocol.js';

const ROOM_PREFIX = 'tdl-duel-';

function hasBroadcastChannel() {
  return typeof BroadcastChannel === 'function';
}

export class BroadcastTransport {
  constructor({ roomCode, selfId }) {
    this.roomCode = roomCode;
    this.selfId = selfId;
    this.channel = null;
    this.onMessage = null;
    this.onStatus = null;
    this.closed = false;
  }

  static isSupported() {
    return hasBroadcastChannel();
  }

  connect() {
    if (!hasBroadcastChannel()) {
      throw new Error('This browser cannot host a local duel room');
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

const RECONNECT_DELAYS = [400, 900, 1800, 3200, 5000];

export class WebSocketTransport {
  constructor({ url, roomCode, selfId, name, host = false }) {
    this.url = url;
    this.roomCode = roomCode;
    this.selfId = selfId;
    this.name = name;
    this.host = host;
    this.socket = null;
    this.onMessage = null;
    this.onStatus = null;
    this.closed = false;
    this.attempt = 0;
    this.queue = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const open = () => {
        this.onStatus?.('connecting');
        let socket;
        try {
          socket = new WebSocket(this.url);
        } catch (error) {
          reject(error);
          return;
        }
        this.socket = socket;
        socket.onopen = () => {
          this.attempt = 0;
          this.onStatus?.('open');
          this.send(envelope(this.selfId, 'hello', { roomCode: this.roomCode, name: this.name, host: this.host }));
          for (const message of this.queue.splice(0)) this.send(message);
          if (!settled) {
            settled = true;
            resolve(this);
          }
        };
        socket.onmessage = (event) => {
          let message;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!validEnvelope(message)) return;
          this.onMessage?.(message);
        };
        socket.onclose = () => {
          if (this.closed) return;
          this.onStatus?.('closed');
          const delay = RECONNECT_DELAYS[Math.min(this.attempt++, RECONNECT_DELAYS.length - 1)];
          setTimeout(() => {
            if (!this.closed) open();
          }, delay);
        };
        socket.onerror = () => {
          this.onStatus?.('error');
          if (!settled) {
            settled = true;
            reject(new Error('Could not reach the duel relay'));
          }
        };
      };
      open();
    });
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
    try {
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.onStatus?.('closed');
  }
}

/**
 * Pick a transport.
 *
 * `VITE_PVP_RELAY` wins when it is set (a full ws:// URL); otherwise the room
 * runs over BroadcastChannel, which needs no server and works offline.
 * `mode: 'local' | 'relay'` forces one for tests and for the UI toggle.
 */
export function createTransport({ mode = 'auto', roomCode, selfId, name, host }) {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PVP_RELAY) || null;
  // With no explicit relay, `mode: 'relay'` still means something: the dev
  // server proxies `/pvp` to `npm run pvp:relay` on the same host, so two
  // devices on one network share a room without any configuration.
  const derivedUrl =
    typeof location !== 'undefined' && location.host
      ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/pvp`
      : null;

  const wantsRelay = mode === 'relay' || (mode === 'auto' && Boolean(envUrl));
  const url = envUrl || derivedUrl;
  if (wantsRelay && url) {
    return new WebSocketTransport({ url, roomCode, selfId, name, host });
  }
  return new BroadcastTransport({ roomCode, selfId });
}
