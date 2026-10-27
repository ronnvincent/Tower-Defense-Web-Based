#!/usr/bin/env node
/**
 * cloud-dev.mjs — a LOCAL STAND-IN for the Supabase ledger. Not Supabase.
 *
 * Why it exists: the real database is
 * `supabase/migrations/0001_cloud_save.sql`, which has to be applied to a
 * Supabase project and reached over the internet. The game still has to be
 * testable (and demonstrable in the browser) without a project, so this server
 * speaks the *same* seven-function contract against a JSON file:
 *
 *   POST /rest/v1/rpc/cloud_ping
 *   POST /rest/v1/rpc/check_username      { p_username }
 *   POST /rest/v1/rpc/register_player     { p_username, p_device_key }
 *   POST /rest/v1/rpc/sync_progress       { p_device_key, p_data, p_metrics, p_achievements }
 *   POST /rest/v1/rpc/pull_progress       { p_device_key }
 *   POST /rest/v1/rpc/leaderboard_page    { p_limit, p_offset }
 *   POST /rest/v1/rpc/my_rank             { p_device_key }
 *
 * The rules are copies of the SQL on purpose: unique case-insensitive names,
 * a device key per browser, clamped metrics, achievements as rows. If the two
 * ever disagree, the SQL is right and this file is the bug — `tests/cloud-contract.test.js`
 * pins the function names and parameter names so drift is caught in CI.
 *
 * Vite proxies `/supabase-dev` here (`vite.config.js`), so the browser only ever
 * talks to its own origin. On a static host that path 404s and the game reports
 * the cloud as off — it does not silently pretend to save.
 *
 *   node server/cloud-dev.mjs            # port 8791
 *   PORT=9000 node server/cloud-dev.mjs
 *
 * The store file (`.dev-data/cloud-dev.json`) is git-ignored: it is scratch
 * state for local runs, not a database.
 */

import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8791);
const STORE = process.env.CLOUD_DEV_STORE || join(process.cwd(), '.dev-data', 'cloud-dev.json');

const NAME_PATTERN = /^[A-Za-z0-9 ._-]{3,16}$/;
const DEVICE_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
const RESERVED = new Set(['admin', 'administrator', 'system', 'supabase']);

const db = {
  players: [], // { id, username, key, device, created, power, level, stars, best, waves, achievements }
  progress: {}, // playerId -> { data, revision, updated }
  medals: {}, // playerId -> [achievementId]
};

load();

function load() {
  try {
    if (!existsSync(STORE)) return;
    const raw = JSON.parse(readFileSync(STORE, 'utf8'));
    if (Array.isArray(raw.players)) db.players = raw.players;
    if (raw.progress && typeof raw.progress === 'object') db.progress = raw.progress;
    if (raw.medals && typeof raw.medals === 'object') db.medals = raw.medals;
  } catch (error) {
    console.warn('[cloud-dev] store unreadable, starting empty:', error.message);
  }
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(STORE), { recursive: true });
      writeFileSync(STORE, JSON.stringify(db));
    } catch (error) {
      console.warn('[cloud-dev] could not write store:', error.message);
    }
  }, 120);
}

function cleanName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

const clamp = (value, min) => Math.max(min, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : min);

function byName(key) {
  return db.players.find((player) => player.key === key) || null;
}

function byDevice(device) {
  return db.players.find((player) => player.device === device) || null;
}

function ranking() {
  return [...db.players].sort((a, b) => {
    if (a.power !== b.power) return b.power - a.power;
    if (a.level !== b.level) return b.level - a.level;
    if (a.stars !== b.stars) return b.stars - a.stars;
    if (a.best !== b.best) return b.best - a.best;
    if (a.created !== b.created) return a.created - b.created;
    return a.id < b.id ? -1 : 1;
  });
}

/** Every handler returns the payload PostgREST would return. */
const handlers = {
  cloud_ping: () => ({ ok: true, service: 'realm-ledger', schema: 1, storage: 'cloud-dev' }),

  check_username: ({ p_username }) => {
    const username = cleanName(p_username);
    if (!username) return { ok: true, available: false, reason: 'empty', username };
    if (!NAME_PATTERN.test(username) || RESERVED.has(username.toLowerCase())) {
      return { ok: true, available: false, reason: 'invalid', username };
    }
    const taken = Boolean(byName(username.toLowerCase()));
    return { ok: true, available: !taken, reason: taken ? 'taken' : 'free', username };
  },

  register_player: ({ p_username, p_device_key }) => {
    const username = cleanName(p_username);
    const key = username.toLowerCase();
    const device = String(p_device_key ?? '');

    if (!NAME_PATTERN.test(username)) return { ok: false, reason: 'invalid', username };
    if (RESERVED.has(key)) return { ok: false, reason: 'invalid', username };
    if (!DEVICE_PATTERN.test(device)) return { ok: false, reason: 'bad-device' };

    const existing = byName(key);
    if (existing) return { ok: false, reason: 'taken', username };

    const owned = byDevice(device);
    if (owned) {
      return { ok: false, reason: 'device-claimed', playerId: owned.id, username: owned.username };
    }

    const player = {
      id: randomUUID(),
      username,
      key,
      device,
      created: Date.now(),
      power: 0,
      level: 1,
      stars: 0,
      best: 0,
      waves: 0,
      achievements: 0,
    };
    db.players.push(player);
    db.progress[player.id] = { data: {}, revision: 0, updated: Date.now() };
    db.medals[player.id] = [];
    persist();
    return { ok: true, playerId: player.id, username: player.username, createdAt: new Date(player.created).toISOString() };
  },

  sync_progress: ({ p_device_key, p_data, p_metrics, p_achievements }) => {
    const player = byDevice(String(p_device_key ?? ''));
    if (!player) return { ok: false, reason: 'unknown-device' };
    if (!p_data || typeof p_data !== 'object' || Array.isArray(p_data)) {
      return { ok: false, reason: 'bad-payload' };
    }
    if (JSON.stringify(p_data).length > 131072) return { ok: false, reason: 'payload-too-large' };

    const metrics = p_metrics && typeof p_metrics === 'object' ? p_metrics : {};
    player.power = clamp(metrics.power, 0);
    player.level = clamp(metrics.level, 1);
    player.stars = clamp(metrics.stars, 0);
    player.best = Math.max(player.best, clamp(metrics.bestScore, 0));
    player.waves = Math.max(player.waves, clamp(metrics.waves, 0));

    const medals = Array.isArray(p_achievements) ? p_achievements : [];
    const known = new Set(db.medals[player.id] || []);
    for (const medal of medals) {
      if (typeof medal === 'string' && /^[a-z0-9-]{1,64}$/.test(medal)) known.add(medal);
    }
    db.medals[player.id] = [...known];
    player.achievements = known.size;

    const row = db.progress[player.id] || { data: {}, revision: 0 };
    row.data = p_data;
    row.revision += 1;
    row.updated = Date.now();
    db.progress[player.id] = row;
    persist();

    return {
      ok: true,
      revision: row.revision,
      power: player.power,
      level: player.level,
      achievements: known.size,
    };
  },

  pull_progress: ({ p_device_key }) => {
    const player = byDevice(String(p_device_key ?? ''));
    if (!player) return { ok: false, reason: 'unknown-device' };
    return {
      ok: true,
      playerId: player.id,
      username: player.username,
      power: player.power,
      level: player.level,
      stars: player.stars,
      bestScore: player.best,
      waves: player.waves,
      achievements: player.achievements,
      revision: db.progress[player.id]?.revision || 0,
    };
  },

  leaderboard_page: ({ p_limit, p_offset }) => {
    const limit = Math.min(Math.max(Number(p_limit) || 25, 1), 100);
    const offset = Math.max(Number(p_offset) || 0, 0);
    const all = ranking();
    return all.slice(offset, offset + limit).map((player, index) => ({
      rank: offset + index + 1,
      username: player.username,
      power: player.power,
      level: player.level,
      stars: player.stars,
      best_score: player.best,
      waves: player.waves,
      achievements: player.achievements,
      total: all.length,
    }));
  },

  my_rank: ({ p_device_key }) => {
    const player = byDevice(String(p_device_key ?? ''));
    if (!player) return { ok: false, reason: 'unknown-device' };
    const all = ranking();
    return {
      ok: true,
      username: player.username,
      rank: all.findIndex((entry) => entry.id === player.id) + 1,
      total: all.length,
      power: player.power,
      level: player.level,
      stars: player.stars,
      bestScore: player.best,
      waves: player.waves,
      achievements: player.achievements,
    };
  },
};

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, accept',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, accept',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && /\/(health|)$/.test(url.pathname)) {
    json(res, 200, { ok: true, service: 'realm-ledger-dev', players: db.players.length });
    return;
  }

  const match = url.pathname.match(/\/rpc\/([a-z_]+)$/);
  if (req.method !== 'POST' || !match) {
    json(res, 404, { message: 'no such function' });
    return;
  }

  const handler = handlers[match[1]];
  if (!handler) {
    json(res, 404, { message: `function public.${match[1]} does not exist` });
    return;
  }

  const body = await readBody(req);
  try {
    json(res, 200, handler(body || {}));
  } catch (error) {
    console.error('[cloud-dev] handler failed:', error);
    json(res, 500, { message: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cloud-dev] ledger stand-in on http://0.0.0.0:${PORT} (store ${STORE})`);
  console.log('[cloud-dev] this is NOT Supabase — apply supabase/migrations/0001_cloud_save.sql for the real thing');
});
