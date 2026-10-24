/**
 * lobbyProtocol.js — room codes and the messages a duel room exchanges.
 *
 * A room is host-authoritative. Every client sends *intents* ("I'm ready",
 * "I picked this arena", "my core fell"), the host folds them into one state
 * with {@link LobbyState} and broadcasts a `sync` snapshot back. That keeps a
 * single source of truth no matter how many messages arrive out of order, and
 * it is the same contract on BroadcastChannel, a WebSocket relay, or a test
 * harness.
 */

/** Room codes avoid 0/O, 1/I/L so a code read aloud cannot be mistyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** @param {() => number} rng */
export function makeRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return code;
}

/** Uppercase, strip anything that is not a room-code character, cap length. */
export function normaliseRoomCode(input) {
  return String(input || '')
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code) {
  return typeof code === 'string' && code.length === ROOM_CODE_LENGTH && /^[A-Z0-9]+$/.test(code);
}

export const MSG = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  INTENT: 'intent',
  SYNC: 'sync',
  BYE: 'bye',
});

/** Lobby intents the host understands. */
export const OP = Object.freeze({
  JOIN: 'join',
  LEAVE: 'leave',
  READY: 'ready',
  RENAME: 'rename',
  ARENA: 'arena',
  START: 'start',
  PROGRESS: 'progress',
  RESULT: 'result',
  REMATCH: 'rematch',
});

export function sanitiseName(name, fallback = 'Challenger') {
  const clean = String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return clean || fallback;
}

/**
 * Wrap a payload in an envelope. `from` is the sender's client id, so the host
 * can attribute an intent to a seat without trusting the payload.
 */
export function envelope(from, type, payload = null, roomCode = null) {
  return { v: 1, from, type, roomCode, payload };
}

/** Reject anything that is not a well-formed envelope before it reaches state. */
export function validEnvelope(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.v !== 1) return false;
  if (typeof message.from !== 'string' || !message.from) return false;
  return Object.values(MSG).includes(message.type);
}
