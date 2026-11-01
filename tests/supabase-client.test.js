import { describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../src/net/supabaseClient.js';

/**
 * The whole network layer is one POST per function. These tests pin the parts
 * that are easy to get subtly wrong and impossible to see from the game: the
 * URL shape, the two headers, and the fact that a failed call is a value rather
 * than an exception.
 */
function recorder(response = { status: 200, body: '{"ok":true}' }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (response.throws) throw response.throws;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.body,
    };
  };
  return { calls, fetchImpl };
}

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl';

describe('createSupabaseClient', () => {
  it('posts to /rpc/<name> with a json body', async () => {
    const { calls, fetchImpl } = recorder();
    const client = createSupabaseClient({
      url: 'https://abc.supabase.co',
      anonKey: JWT,
      fetchImpl,
    });
    const result = await client.rpc('check_username', { p_username: 'Aria' });

    expect(result).toEqual({ ok: true, data: { ok: true }, status: 200 });
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/check_username');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual({ p_username: 'Aria' });
    expect(calls[0].init.headers.apikey).toBe(JWT);
  });

  it('sends a legacy anon key as a bearer token as well', async () => {
    const { calls, fetchImpl } = recorder();
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    await client.rpc('cloud_ping');
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${JWT}`);
  });

  it('does not send a publishable key as a bearer token', async () => {
    const { calls, fetchImpl } = recorder();
    const client = createSupabaseClient({
      url: 'https://abc.supabase.co',
      anonKey: 'sb_publishable_abc123',
      fetchImpl,
    });
    await client.rpc('cloud_ping');
    expect(calls[0].init.headers.apikey).toBe('sb_publishable_abc123');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('turns a 404 into a named reason instead of an exception', async () => {
    const { fetchImpl } = recorder({ status: 404, body: '{"message":"Could not find"}' });
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    const result = await client.rpc('sync_progress', {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-function');
    expect(result.status).toBe(404);
  });

  it('turns a 500 into an http failure and keeps the body', async () => {
    const { fetchImpl } = recorder({ status: 500, body: '{"message":"boom"}' });
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    const result = await client.rpc('sync_progress', {});
    expect(result).toMatchObject({ ok: false, reason: 'http', status: 500 });
    expect(result.data).toEqual({ message: 'boom' });
  });

  it('reports a dropped network as offline', async () => {
    const { fetchImpl } = recorder({ throws: new TypeError('Failed to fetch') });
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    const result = await client.rpc('cloud_ping');
    expect(result).toEqual({ ok: false, reason: 'offline' });
  });

  it('reports an aborted request as a timeout', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const { fetchImpl } = recorder({ throws: abort });
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    const result = await client.rpc('cloud_ping');
    expect(result.reason).toBe('timeout');
  });

  it('refuses to call anything without a url', async () => {
    const { calls, fetchImpl } = recorder();
    const client = createSupabaseClient({ url: '', anonKey: JWT, fetchImpl });
    expect(client.configured).toBe(false);
    const result = await client.rpc('cloud_ping');
    expect(result).toEqual({ ok: false, reason: 'unconfigured' });
    expect(calls).toHaveLength(0);
  });

  it('survives a response that is not json', async () => {
    const { fetchImpl } = recorder({ status: 200, body: '<html>proxy</html>' });
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: JWT, fetchImpl });
    const result = await client.rpc('cloud_ping');
    expect(result).toEqual({ ok: true, data: null, status: 200 });
  });
});
