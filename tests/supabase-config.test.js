import { describe, expect, it } from 'vitest';
import {
  isLoopbackOrigin,
  normaliseSupabaseUrl,
  resolveSupabaseConfig,
} from '../src/net/supabaseClient.js';

/**
 * Where the ledger address comes from, in priority order:
 *   ?supabase=&key= link → VITE_* build pair → the loopback dev proxy → none.
 *
 * The last step matters on a real deployment: a static host has no
 * `/supabase-dev`, so the client must report "no ledger" there rather than
 * pretending to be online and 404-ing on every call.
 */
describe('normaliseSupabaseUrl', () => {
  it('appends /rest/v1 to a bare project url', () => {
    expect(normaliseSupabaseUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co/rest/v1');
  });

  it('does not double the path when it is already there', () => {
    expect(normaliseSupabaseUrl('https://abc.supabase.co/rest/v1')).toBe(
      'https://abc.supabase.co/rest/v1'
    );
    expect(normaliseSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe(
      'https://abc.supabase.co/rest/v1'
    );
  });

  it('keeps a project mounted under a path', () => {
    expect(normaliseSupabaseUrl('https://host.tld/team/project/')).toBe(
      'https://host.tld/team/project/rest/v1'
    );
  });

  it('refuses anything that is not http(s) or is empty', () => {
    expect(normaliseSupabaseUrl('')).toBe('');
    expect(normaliseSupabaseUrl(null)).toBe('');
    expect(normaliseSupabaseUrl('javascript:alert(1)')).toBe('');
    expect(normaliseSupabaseUrl('file:///etc/passwd')).toBe('');
  });
});

describe('isLoopbackOrigin', () => {
  it('accepts localhost, 127.0.0.1, [::1] and *.localhost', () => {
    expect(isLoopbackOrigin('http://localhost:4300')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1:4320')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:4300')).toBe(true);
    expect(isLoopbackOrigin('https://game.localhost')).toBe(true);
  });

  it('rejects a public origin and garbage', () => {
    expect(isLoopbackOrigin('https://tower-defense.vercel.app')).toBe(false);
    expect(isLoopbackOrigin('https://127.0.0.1.evil.tld')).toBe(false);
    expect(isLoopbackOrigin('')).toBe(false);
    expect(isLoopbackOrigin('not a url')).toBe(false);
  });
});

describe('resolveSupabaseConfig', () => {
  const publicOrigin = 'https://tower-defense.vercel.app';

  it('a ?supabase=&key= link wins over everything, without a rebuild', () => {
    const cfg = resolveSupabaseConfig({
      search: '?supabase=https://abc.supabase.co/&key=%20anon-key%20',
      env: { VITE_SUPABASE_URL: 'https://env.supabase.co', VITE_SUPABASE_ANON_KEY: 'env-key' },
      origin: publicOrigin,
    });
    expect(cfg).toEqual({
      url: 'https://abc.supabase.co/rest/v1',
      anonKey: 'anon-key',
      source: 'link',
    });
  });

  it('ignores a half-filled link', () => {
    const cfg = resolveSupabaseConfig({
      search: '?supabase=https://abc.supabase.co',
      env: {},
      origin: publicOrigin,
    });
    expect(cfg.source).toBe('none');
  });

  it('refuses a non-http project url in the link', () => {
    const cfg = resolveSupabaseConfig({
      search: '?supabase=javascript:alert(1)&key=x',
      env: {},
      origin: publicOrigin,
    });
    expect(cfg.source).toBe('none');
  });

  it('a link with a valid url but empty key is ignored', () => {
    const cfg = resolveSupabaseConfig({
      search: '?supabase=https://abc.supabase.co&key=',
      env: {},
      origin: publicOrigin,
    });
    expect(cfg.source).toBe('none');
  });

  it('falls back to the build-time pair', () => {
    const cfg = resolveSupabaseConfig({
      search: '',
      env: { VITE_SUPABASE_URL: 'https://env.supabase.co', VITE_SUPABASE_ANON_KEY: 'env-key' },
      origin: publicOrigin,
    });
    expect(cfg).toEqual({
      url: 'https://env.supabase.co/rest/v1',
      anonKey: 'env-key',
      source: 'env',
    });
  });

  it('needs both halves of the build-time pair', () => {
    const cfg = resolveSupabaseConfig({
      search: '',
      env: { VITE_SUPABASE_URL: 'https://env.supabase.co' },
      origin: publicOrigin,
    });
    expect(cfg.source).toBe('none');
  });

  it('uses the loopback stand-in on a dev and preview server', () => {
    for (const origin of ['http://127.0.0.1:4300', 'http://localhost:4320']) {
      const cfg = resolveSupabaseConfig({ search: '', env: {}, origin });
      expect(cfg).toEqual({
        url: `${origin}/supabase-dev/rest/v1`,
        anonKey: 'dev-anon',
        source: 'dev',
      });
    }
  });

  it('reports no ledger on a public host instead of inventing a proxy path', () => {
    const cfg = resolveSupabaseConfig({ search: '', env: {}, origin: publicOrigin });
    expect(cfg).toEqual({ url: '', anonKey: '', source: 'none' });
  });
});
