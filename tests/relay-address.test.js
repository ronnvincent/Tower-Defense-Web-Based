/**
 * relay-address.test.js — turning what a player (or a deploy) says into the
 * address the ONLINE link dials. A static host answers no `/pvp`, so this is
 * the only thing standing between a Vercel deploy and a room that works.
 */

import { describe, it, expect } from 'vitest';
import {
  RELAY_STORAGE_KEY,
  isLocalRelay,
  normaliseRelayUrl,
  readStoredRelay,
  relayFromSearch,
  resolveRelayUrl,
  sameOriginRelay,
  writeStoredRelay,
} from '../src/net/relayAddress.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

const httpsPage = { protocol: 'https:', host: 'defenseofkingdom.vercel.app', search: '', pathname: '/' };

describe('relay addresses', () => {
  it('accepts the shapes a human pastes', () => {
    expect(normaliseRelayUrl('wss://relay.example/pvp')).toBe('wss://relay.example/pvp');
    expect(normaliseRelayUrl('  wss://relay.example/pvp/  ')).toBe('wss://relay.example/pvp');
    expect(normaliseRelayUrl('https://relay.example/pvp')).toBe('wss://relay.example/pvp');
    expect(normaliseRelayUrl('http://relay.example/pvp', { secure: false })).toBe('ws://relay.example/pvp');
    expect(normaliseRelayUrl('relay.example', { secure: true })).toBe('wss://relay.example/pvp');
    expect(normaliseRelayUrl('localhost:8787', { secure: false })).toBe('ws://localhost:8787/pvp');
    expect(normaliseRelayUrl('ws://127.0.0.1:8787')).toBe('ws://127.0.0.1:8787/pvp');
  });

  it('keeps a custom path and drops queries and hashes', () => {
    expect(normaliseRelayUrl('wss://relay.example/duel')).toBe('wss://relay.example/duel');
    expect(normaliseRelayUrl('wss://relay.example/pvp?token=abc#x')).toBe('wss://relay.example/pvp');
  });

  it('refuses what is not a socket address', () => {
    expect(normaliseRelayUrl('')).toBe(null);
    expect(normaliseRelayUrl('   ')).toBe(null);
    expect(normaliseRelayUrl('not a url')).toBe(null);
    expect(normaliseRelayUrl('ftp://relay.example')).toBe(null);
    expect(normaliseRelayUrl(null)).toBe(null);
  });

  it('reads ?relay= from a link, and only from a link', () => {
    expect(relayFromSearch('?relay=relay.example')).toBe('wss://relay.example/pvp');
    expect(relayFromSearch('?pvp=relay&relay=wss://relay.example/pvp')).toBe('wss://relay.example/pvp');
    expect(relayFromSearch('')).toBe(null);
  });

  it('persists an override and forgets it on reset', () => {
    const storage = memoryStorage();
    expect(readStoredRelay(storage)).toBe(null);
    writeStoredRelay('wss://relay.example/pvp', storage);
    expect(storage.dump()[RELAY_STORAGE_KEY]).toBe('wss://relay.example/pvp');
    expect(readStoredRelay(storage)).toBe('wss://relay.example/pvp');
    writeStoredRelay(null, storage);
    expect(readStoredRelay(storage)).toBe(null);
  });

  it('resolves in the documented order: saved → link → env → same origin', () => {
    expect(
      resolveRelayUrl({
        stored: 'wss://saved.example/pvp',
        search: '?relay=wss://link.example/pvp',
        envUrl: 'wss://env.example/pvp',
        loc: httpsPage,
      })
    ).toEqual({ url: 'wss://saved.example/pvp', source: 'stored' });

    expect(
      resolveRelayUrl({ stored: null, search: '?relay=wss://link.example/pvp', envUrl: 'wss://env.example/pvp', loc: httpsPage })
    ).toEqual({ url: 'wss://link.example/pvp', source: 'link' });

    expect(
      resolveRelayUrl({ stored: null, search: '', envUrl: 'wss://env.example/pvp', loc: httpsPage })
    ).toEqual({ url: 'wss://env.example/pvp', source: 'env' });

    expect(resolveRelayUrl({ stored: null, search: '', envUrl: null, loc: httpsPage })).toEqual({
      url: 'wss://defenseofkingdom.vercel.app/pvp',
      source: 'same-origin',
    });

    expect(resolveRelayUrl({ stored: null, search: '', envUrl: null, loc: undefined })).toEqual({
      url: null,
      source: 'none',
    });
  });

  it('builds a same-origin address only when there is an origin', () => {
    expect(sameOriginRelay(httpsPage)).toBe('wss://defenseofkingdom.vercel.app/pvp');
    expect(sameOriginRelay({ protocol: 'http:', host: '192.168.1.9:4173' })).toBe('ws://192.168.1.9:4173/pvp');
    expect(sameOriginRelay({ protocol: 'file:', host: '' })).toBe(null);
  });

  it('tells a local relay apart from a hosted one', () => {
    expect(isLocalRelay('ws://localhost:8787/pvp')).toBe(true);
    expect(isLocalRelay('ws://127.0.0.1:8787/pvp')).toBe(true);
    expect(isLocalRelay('ws://[::1]:8787/pvp')).toBe(true);
    expect(isLocalRelay('wss://mirror-arena.onrender.com/pvp')).toBe(false);
    expect(isLocalRelay('wss://defenseofkingdom.vercel.app/pvp')).toBe(false);
  });
});
