/**
 * relayAddress.js — where the ONLINE link dials.
 *
 * A page served by Vite (`dev` or `preview`) can answer `/pvp` itself, because
 * it proxies that path to the relay. A **static** host — Vercel, Pages, S3 —
 * has no process to proxy to, so `wss://<host>/pvp` is just a 404 and the room
 * has nowhere to go. On a deploy like that the address has to be supplied, so
 * it is resolved in exactly one place, first match wins:
 *
 *   1. the lobby's RELAY ADDRESS field (persisted in localStorage)
 *   2. `?relay=` in the page URL        — quick to type on a phone
 *   3. `VITE_PVP_RELAY` at build time   — one address for every visitor
 *   4. the same origin's `/pvp`         — Vite dev / preview
 */

export const RELAY_STORAGE_KEY = 'td-duel-relay';
export const RELAY_PATH = '/pvp';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Turn what a human pasted into a ws(s):// URL a socket can open.
 *
 * Accepts `wss://relay.example/pvp`, `https://relay.example/pvp`,
 * `relay.example` and `localhost:8787`; drops trailing slashes, queries and
 * hashes; defaults the path to `/pvp`. Returns null when it cannot be a relay.
 *
 * @param {string} input
 * @param {{ secure?: boolean }} [options] used only when the input has no scheme
 */
export function normaliseRelayUrl(input, { secure = isSecurePage() } = {}) {
  let text = String(input ?? '').trim();
  if (!text) return null;

  if (/^https:\/\//i.test(text)) text = text.replace(/^https:\/\//i, 'wss://');
  else if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, 'ws://');
  else if (!/^wss?:\/\//i.test(text)) {
    // `localhost:8787` is a host and a port, not a scheme; `ftp://…` is a
    // scheme we cannot speak. Only the latter is rejected.
    const hostAndPort = /^[^/?]+:\d+(?:[/?]|$)/.test(text);
    if (SCHEME.test(text) && !hostAndPort) return null;
    text = `${secure ? 'wss' : 'ws'}://${text}`;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
  if (!url.hostname) return null;

  const path = url.pathname.replace(/\/+$/, '') || RELAY_PATH;
  return `${url.protocol}//${url.host}${path}`;
}

function isSecurePage() {
  try {
    const protocol = globalThis.location?.protocol;
    // No page at all means we are being called from a host that will serve
    // https, so a bare hostname has to become wss://.
    return protocol ? protocol === 'https:' : true;
  } catch {
    return true;
  }
}

/** `?relay=wss://…` — per-link, never persisted. */
export function relayFromSearch(search) {
  let raw = null;
  try {
    raw = new URLSearchParams(search || '').get('relay');
  } catch {
    raw = null;
  }
  return normaliseRelayUrl(raw);
}

/** The address saved from the lobby's field, if any. */
export function readStoredRelay(storage = safeStorage()) {
  try {
    return normaliseRelayUrl(storage?.getItem(RELAY_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredRelay(url, storage = safeStorage()) {
  try {
    if (url) storage?.setItem(RELAY_STORAGE_KEY, url);
    else storage?.removeItem(RELAY_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Same-origin `/pvp` for the page we are on, or null with no origin. */
export function sameOriginRelay(loc = globalThis.location) {
  const host = loc?.host;
  if (!host) return null;
  return normaliseRelayUrl(`${loc.protocol === 'https:' ? 'wss' : 'ws'}://${host}${RELAY_PATH}`);
}

/**
 * @returns {{ url: string|null, source: 'stored'|'link'|'env'|'same-origin'|'none' }}
 */
export function resolveRelayUrl({
  stored = readStoredRelay(),
  search = globalThis.location?.search || '',
  envUrl = null,
  loc = globalThis.location,
} = {}) {
  const candidates = [
    ['stored', normaliseRelayUrl(stored)],
    ['link', relayFromSearch(search)],
    ['env', normaliseRelayUrl(envUrl)],
    ['same-origin', sameOriginRelay(loc)],
  ];
  for (const [source, url] of candidates) {
    if (url) return { url, source };
  }
  return { url: null, source: 'none' };
}

/** True when the address points at this machine — the dev-relay case. */
export function isLocalRelay(url) {
  return /\/\/(localhost|127(?:\.\d+){3}|\[::1\])(?::|\/|$)/i.test(String(url || ''));
}
