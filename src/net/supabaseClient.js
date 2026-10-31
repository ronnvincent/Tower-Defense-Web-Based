/**
 * supabaseClient.js — a 120-line Supabase REST client, so the game can talk to
 * the ledger without adding a dependency.
 *
 * The game ships two runtime dependencies (Phaser and `ws`, the latter only for
 * the duel relay). Pulling in `@supabase/supabase-js` — plus its auth, realtime
 * and storage modules — to make seven HTTP POSTs would have been the largest
 * thing in the bundle after Phaser itself. PostgREST is a plain JSON API, so
 * this file is the whole client:
 *
 *   POST {url}/rest/v1/rpc/{function}  { "p_name": ... }
 *
 * Everything the ledger exposes is a function (see
 * `supabase/migrations/0001_cloud_save.sql`), so there is no query builder to
 * reimplement and no table access to get wrong.
 *
 * Configuration, first match wins:
 *   1. `?supabase=<url>&key=<anon key>` in the page URL (per link, not stored)
 *   2. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` at build time
 *   3. `/supabase-dev` — the local stand-in, but only on a loopback origin
 *
 * The anon key is a *public* key by design; it can only call the functions the
 * migration grants. It is not a secret and must never be the service-role key.
 */

export const SUPABASE_CLOUD_PING = 'cloud_ping';
export const SUPABASE_DEV_PATH = '/supabase-dev';
const DEFAULT_TIMEOUT_MS = 9000;

/** Accepts `https://xyz.supabase.co`, with or without a trailing `/rest/v1`. */
export function normaliseSupabaseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(text, globalThis.location?.href || 'http://localhost/');
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (!url.host) return '';
  const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  if (/\/rest\/v1$/.test(base)) return base;
  return `${base}/rest/v1`;
}

/**
 * Read the ledger address out of the page, the build, or the dev proxy.
 *
 * @param {{ search?: string, env?: object, origin?: string }} [sources]
 * @returns {{ url:string, anonKey:string, source:'link'|'env'|'dev'|'none' }}
 */
export function resolveSupabaseConfig({ search, env, origin } = {}) {
  const envVars = env || import.meta.env || {};
  const pageSearch = search ?? (globalThis.location?.search || '');
  const pageOrigin = origin ?? (globalThis.location?.origin || '');

  // 1. A link can point at any project without a rebuild:
  //    ?supabase=https://abc.supabase.co&key=eyJ...
  try {
    const params = new URLSearchParams(pageSearch);
    const url = normaliseSupabaseUrl(params.get('supabase'));
    const key = (params.get('key') || '').trim();
    if (url && key) return { url, anonKey: key, source: 'link' };
  } catch {
    /* no page search — fall through */
  }

  // 2. The build-time pair.
  const envUrl = normaliseSupabaseUrl(envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL);
  const envKey = String(envVars.VITE_SUPABASE_ANON_KEY || envVars.SUPABASE_ANON_KEY || '').trim();
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: 'env' };

  // 3. The local stand-in — on loopback only. `vite dev` and `vite preview`
  //    proxy `/supabase-dev` to `server/cloud-dev.mjs`. A deployed site has no
  //    such path, so inventing one there would make the app claim a ledger it
  //    cannot reach and 404 on every single call; on a public host with no env
  //    pair the honest answer is "none configured", and the game stays local.
  if (isLoopbackOrigin(pageOrigin)) {
    return {
      url: normaliseSupabaseUrl(`${pageOrigin}${SUPABASE_DEV_PATH}`),
      anonKey: 'dev-anon',
      source: 'dev',
    };
  }

  return { url: '', anonKey: '', source: 'none' };
}

/** True for localhost / 127.0.0.1 / [::1] / *.localhost — where the proxy lives. */
export function isLoopbackOrigin(origin) {
  let host;
  try {
    host = new URL(String(origin || '')).hostname;
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  );
}

/**
 * A tiny PostgREST client.
 *
 * `rpc()` never throws for a network failure: it returns
 * `{ ok:false, reason:'offline' }` so a caller in a click handler does not need
 * a try/catch, and so "the ledger is down" is a state the game can render.
 */
export function createSupabaseClient({ url, anonKey, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = normaliseSupabaseUrl(url);
  const key = String(anonKey || '').trim();
  const doFetch = fetchImpl || globalThis.fetch;

  const client = {
    base,
    key,
    configured: Boolean(base && key && typeof doFetch === 'function'),
    source: 'none',

    /**
     * Call one ledger function.
     *
     * @param {string} name
     * @param {object} [params] named arguments, `p_`-prefixed like the SQL
     * @returns {Promise<{ok:boolean, data?:any, reason?:string, status?:number}>}
     */
    async rpc(name, params = {}, options = {}) {
      if (!base) return { ok: false, reason: 'unconfigured' };
      if (typeof doFetch !== 'function') return { ok: false, reason: 'unavailable' };

      const timeout = Math.max(1000, Number(options.timeoutMs) || timeoutMs);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), timeout);
      // A legacy anon key is a JWT and belongs in both headers. The newer
      // publishable keys (`sb_publishable_...`) are opaque strings — sending one
      // as a Bearer token makes PostgREST try to parse it as a JWT and reject it.
      const bearer = /^ey[A-Za-z0-9_-]+\./.test(key) ? { Authorization: `Bearer ${key}` } : {};
      try {
        const response = await doFetch(`${base}/rpc/${name}`, {
          method: 'POST',
          headers: {
            apikey: key,
            ...bearer,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(params || {}),
          signal: controller?.signal,
        });
        clearTimeout(timer);

        const text = await response.text().catch(() => '');
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
        }

        if (!response.ok) {
          return {
            ok: false,
            reason: response.status === 404 ? 'missing-function' : 'http',
            status: response.status,
            data,
          };
        }
        return { ok: true, data, status: response.status };
      } catch (error) {
        clearTimeout(timer);
        const aborted = error?.name === 'AbortError';
        return { ok: false, reason: aborted ? 'timeout' : 'offline' };
      }
    },

    /** Is there a ledger at this address that speaks our schema? */
    async ping() {
      const result = await client.rpc(SUPABASE_CLOUD_PING, {}, { timeoutMs: 4000 });
      if (!result.ok) return { ok: false, reason: result.reason || 'offline' };
      const payload = result.data || {};
      if (payload?.ok && payload?.schema === 1) return { ok: true, service: payload.service };
      return { ok: false, reason: 'wrong-schema' };
    },
  };

  return client;
}
