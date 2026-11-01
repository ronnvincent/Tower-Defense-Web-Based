/**
 * CloudSave.js — the bridge between the local save file and the realm ledger.
 *
 * Design rules, in order of importance:
 *
 *   1. **The game never waits on the network.** The save is written to
 *      localStorage first, exactly as before; the ledger is a copy that catches
 *      up. A battle that ends while Supabase is asleep still banks its gold.
 *   2. **A name is required, and a name is not reusable.** `claimName()` is the
 *      only way an identity is created. A `taken` answer stores nothing and the
 *      caller must ask for another name.
 *   3. **No password, no secrets in the clear beyond the device key.** The
 *      browser mints a random `deviceKey` once; it is the proof of ownership and
 *      it never leaves localStorage or appears in any ranking response.
 *   4. **Every failure is a state, not an exception.** `status` is one of
 *      `off | connecting | online | offline | conflict`, and the UI prints it.
 *
 * The store is injected (`store.profile`, `store.onSave`, `store.setUsername`),
 * so all of this is unit-testable without a browser or a server.
 */

import { createMemoryStorage, getDefaultStorage, readJSON, removeKey, writeJSON } from '../utils/storage.js';
import { playerMetrics } from './PlayerMetrics.js';

export const CLOUD_STORAGE_KEY = 'td-dsalgo:cloud:v1';
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const USERNAME_PATTERN = /^[A-Za-z0-9 ._-]+$/;
export const DEVICE_KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
/** Names the ledger keeps for itself. Compared case-insensitively. */
export const RESERVED_NAMES = Object.freeze(['admin', 'administrator', 'system', 'supabase']);

const PUSH_DEBOUNCE_MS = 1400;
const RETRY_DELAYS_MS = [4000, 12000, 30000];

/** Trim, collapse inner runs of whitespace, cut control characters. */
export function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
  return collapsed.trim().slice(0, USERNAME_MAX);
}

/**
 * @returns {{ ok:boolean, reason?:'empty'|'short'|'chars'|'reserved', value:string }}
 */
export function validateUsername(raw) {
  const value = sanitizeUsername(raw);
  if (!value) return { ok: false, reason: 'empty', value };
  if (value.length < USERNAME_MIN) return { ok: false, reason: 'short', value };
  if (!USERNAME_PATTERN.test(value)) return { ok: false, reason: 'chars', value };
  if (RESERVED_NAMES.includes(value.toLowerCase())) return { ok: false, reason: 'reserved', value };
  return { ok: true, value };
}

/** One line the gate can print for each refusal. */
export const USERNAME_MESSAGES = Object.freeze({
  empty: 'TYPE A NAME FIRST',
  short: `AT LEAST ${USERNAME_MIN} CHARACTERS`,
  chars: 'LETTERS, NUMBERS, SPACE, FULL STOP, DASH AND UNDERSCORE ONLY',
  reserved: 'THAT NAME IS KEPT BY THE REALM',
  taken: 'THAT NAME IS ALREADY CARVED INTO THE LEDGER — PICK ANOTHER',
  'device-claimed': 'THIS BROWSER ALREADY HOLDS A NAME',
  offline: 'THE LEDGER IS UNREACHABLE — NAME KEPT ON THIS DEVICE',
  busy: 'THE LEDGER IS THINKING — TRY AGAIN',
});

/** Random, unguessable, stable per browser. */
export function createDeviceKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic fallback for exotic hosts: still 32 hex chars, just weaker.
  let out = '';
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function normaliseIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const username = sanitizeUsername(raw.username);
  const deviceKey = typeof raw.deviceKey === 'string' ? raw.deviceKey : '';
  if (!username || !DEVICE_KEY_PATTERN.test(deviceKey)) return null;
  return {
    username,
    deviceKey,
    playerId: typeof raw.playerId === 'string' && raw.playerId ? raw.playerId : null,
    // `claimed` means the ledger itself accepted this name; `mode: local` means
    // it is only held on this device (cloud off / offline when it was chosen).
    claimed: Boolean(raw.claimed),
    mode: raw.mode === 'cloud' ? 'cloud' : raw.mode === 'offline' ? 'offline' : 'local',
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

export class CloudSave {
  /**
   * @param {{
   *   client?: object,            // createSupabaseClient(...) or null
   *   store?: object,             // ProgressStore
   *   storage?: Storage,
   *   now?: () => number,
   *   timers?: { setTimeout:Function, clearTimeout:Function },
   * }} options
   */
  constructor({ client = null, store = null, storage, now = Date.now, timers } = {}) {
    this.client = client;
    this.store = store;
    this.storage = storage || getDefaultStorage();
    this.now = now;
    this.timers = timers || {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    };

    this.status = 'off';
    this.statusReason = '';
    this.identity = normaliseIdentity(readJSON(this.storage, CLOUD_STORAGE_KEY).value);
    this.lastSyncAt = 0;
    this.lastError = '';
    this.revision = 0;
    this.remote = null; // last pull/leaderboard row for this player
    this.pending = false;
    this._listeners = new Set();
    this._pushTimer = null;
    this._retryTimer = null;
    this._retries = 0;
    this._started = false;
    this._inflight = null;
    this._unsubscribeStore = null;

    // Restore the name onto the save file (the gate may have been claimed on an
    // older build where only the cloud record existed).
    if (this.identity && this.store && !this.store.profile?.username) {
      this.store.profile.username = this.identity.username;
    }
  }

  /* --------------------------------------------------------------- state */

  /** True when a name has been chosen (cloud or local). The menu is gated on it. */
  get hasIdentity() {
    return Boolean(this.identity);
  }

  /** True when the player must be asked for a name before the menu. */
  get needsName() {
    return !this.identity;
  }

  /** 'cloud' | 'local' | 'offline' — where the name currently lives. */
  get mode() {
    return this.identity?.mode || 'local';
  }

  get isOnline() {
    return this.status === 'online';
  }

  /** Short label for the HUD/gate: "SUPABASE" / "LOCAL" / "OFFLINE". */
  get cloudLabel() {
    if (this.status === 'online') return this.client?.source === 'dev' ? 'LOCAL STAND-IN' : 'SUPABASE';
    if (this.status === 'connecting') return 'CONNECTING';
    if (this.status === 'conflict') return 'NAME CONFLICT';
    if (this.status === 'offline') return 'OFFLINE';
    return 'LOCAL ONLY';
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    listener(this);
    return () => this._listeners.delete(listener);
  }

  _setStatus(status, reason = '') {
    if (this.status === status && this.statusReason === reason) return;
    this.status = status;
    this.statusReason = reason;
    for (const listener of this._listeners) {
      try {
        listener(this);
      } catch {
        /* a listener must never break the save path */
      }
    }
  }

  _saveIdentity(identity) {
    this.identity = normaliseIdentity(identity);
    if (this.identity) writeJSON(this.storage, CLOUD_STORAGE_KEY, this.identity);
    else removeKey(this.storage, CLOUD_STORAGE_KEY);
    return this.identity;
  }

  /* ---------------------------------------------------------------- boot */

  /**
   * Connect, verify an existing identity, and start mirroring saves.
   * Safe to call twice.
   */
  async start() {
    if (this._started) return this.snapshot();
    this._started = true;

    // Mirror every local save from now on.
    if (this.store?.onSave && !this._unsubscribeStore) {
      this._unsubscribeStore = this.store.onSave(() => this.schedulePush('save'));
    }

    if (!this.client?.configured) {
      this._setStatus('off', 'no-ledger');
      return this.snapshot();
    }

    this._setStatus('connecting');
    const ping = await this.client.ping();
    if (!ping.ok) {
      this.lastError = ping.reason || 'offline';
      this._setStatus('offline', this.lastError);
      if (this.identity) this._scheduleRetry();
      return this.snapshot();
    }

    this._setStatus('online');
    if (this.identity) await this._verifyIdentity();
    return this.snapshot();
  }

  /** After a reconnect: is this device still the owner of its row? */
  async _verifyIdentity() {
    if (!this.identity) return;
    const result = await this.client.rpc('pull_progress', { p_device_key: this.identity.deviceKey });
    if (result.ok && result.data?.ok) {
      this.remote = result.data;
      this.identity.playerId = result.data.playerId || this.identity.playerId;
      this.identity.claimed = true;
      this.identity.mode = 'cloud';
      this._saveIdentity(this.identity);
      this.store?.setUsername?.(this.identity.username);
      this.lastSyncAt = this.now();
      await this.push('verify');
      return;
    }
    if (result.data?.reason === 'unknown-device') {
      // The ledger lost this row (project reset) or the key is stale. Re-claim
      // the same name; if somebody else holds it now, say so out loud.
      const reclaimed = await this._register(this.identity.username, this.identity.deviceKey);
      if (reclaimed.ok) {
        this.identity.playerId = reclaimed.playerId || null;
        this.identity.claimed = true;
        this.identity.mode = 'cloud';
        this._saveIdentity(this.identity);
        await this.push('reclaim');
      } else if (reclaimed.reason === 'taken') {
        this._setStatus('conflict', 'taken');
      }
    }
  }

  /* -------------------------------------------------------------- naming */

  /** Live check for the form. Never throws; offline answers `available:null`. */
  async checkName(raw) {
    const local = validateUsername(raw);
    if (!local.ok) return { ok: false, reason: local.reason, value: local.value };
    if (!this.isOnline) return { ok: true, available: null, value: local.value, reason: 'offline' };
    const result = await this.client.rpc('check_username', { p_username: local.value });
    if (!result.ok || !result.data?.ok) {
      return { ok: true, available: null, value: local.value, reason: result.reason || 'offline' };
    }
    return {
      ok: true,
      available: Boolean(result.data.available),
      value: result.data.username || local.value,
      reason: result.data.reason,
    };
  }

  /**
   * Claim a name. This is the one place an identity is born.
   *
   * @returns {Promise<{ok:boolean, reason?:string, mode?:string, username?:string}>}
   *   `reason` is `taken` when the ledger already holds the name — nothing is
   *   stored in that case and the caller must ask again.
   */
  async claimName(raw) {
    const local = validateUsername(raw);
    if (!local.ok) return { ok: false, reason: local.reason };
    if (this.identity) return { ok: false, reason: 'device-claimed' };

    const username = local.value;

    // The player can submit before `start()` has finished dialling (the gate
    // opens instantly). Give the ledger one chance to answer before deciding
    // that it is offline, so a fast submit does not silently become local-only.
    if (this.client?.configured && !this.isOnline) {
      const ping = await this.client.ping();
      if (ping.ok) this._setStatus('online');
    }

    // No ledger: hold the name on this device and say so.
    if (!this.isOnline) {
      this._storeLocalName(username, this.client?.configured ? 'offline' : 'local');
      if (this.client?.configured) this._scheduleRetry();
      return { ok: true, mode: this.mode, username };
    }

    const result = await this._register(username, createDeviceKey());
    if (result.ok) {
      this._saveIdentity({
        username: result.username || username,
        deviceKey: result.deviceKey,
        playerId: result.playerId || null,
        claimed: true,
        mode: 'cloud',
      });
      this.store?.setUsername?.(this.identity.username);
      this._setStatus('online');
      await this.push('claim');
      return { ok: true, mode: 'cloud', username: this.identity.username };
    }

    if (result.reason === 'taken') {
      // The handler the brief asks for: say no, store nothing.
      return { ok: false, reason: 'taken', username };
    }

    if (result.reason === 'device-claimed') {
      // This browser already owns a row but lost its identity record (site data
      // cleared, then restored from a backup). The ledger told us which name it
      // is; adopt it rather than leaving the player stuck at the gate.
      const recovered = await this._recoverDevice(result.deviceKey, result.username, result.playerId);
      if (recovered) return { ok: true, mode: 'cloud', username: this.identity.username };
      return { ok: false, reason: 'device-claimed' };
    }

    // Network hiccup mid-claim: keep the name locally rather than block play.
    this._storeLocalName(username, 'offline');
    this._scheduleRetry();
    return { ok: true, mode: 'offline', username };
  }

  _storeLocalName(username, mode) {
    this._saveIdentity({
      username,
      deviceKey: createDeviceKey(),
      playerId: null,
      claimed: false,
      mode,
    });
    this.store?.setUsername?.(username);
  }

  async _register(username, deviceKey) {
    const result = await this.client.rpc('register_player', {
      p_username: username,
      p_device_key: deviceKey,
    });
    if (!result.ok) return { ok: false, reason: result.reason || 'offline' };
    const payload = result.data || {};
    if (payload.ok) return { ok: true, playerId: payload.playerId, username: payload.username, deviceKey };
    return {
      ok: false,
      reason: payload.reason || 'error',
      playerId: payload.playerId,
      username: payload.username,
      deviceKey,
    };
  }

  /**
   * Adopt the row this device already owns.
   *
   * The `device_key` is the credential, and it is still in this browser — the
   * only thing that was lost is the local record of *which name* it belongs to.
   */
  async _recoverDevice(deviceKey, username, playerId) {
    if (!deviceKey || !username) return false;
    this._saveIdentity({
      username,
      deviceKey,
      playerId: playerId || null,
      claimed: true,
      mode: 'cloud',
    });
    this.store?.setUsername?.(this.identity.username);
    await this.push('recover');
    return true;
  }

  /**
   * Forget the local name. Used when the ledger reports that this name now
   * belongs to another device: the save stays, the name does not.
   */
  releaseIdentity() {
    if (this._pushTimer) this.timers.clearTimeout(this._pushTimer);
    if (this._retryTimer) this.timers.clearTimeout(this._retryTimer);
    this._pushTimer = null;
    this._retryTimer = null;
    this.pending = false;
    this.identity = null;
    removeKey(this.storage, CLOUD_STORAGE_KEY);
    if (this.store?.profile) this.store.profile.username = '';
    this._setStatus(this.client?.configured ? 'online' : 'off', 'released');
  }

  /* ----------------------------------------------------------------- sync */

  /** Queue a mirror of the current save. Every save path ends up here. */
  schedulePush(reason = 'save') {
    if (!this.identity?.claimed) return false;
    this.pending = true;
    if (this._pushTimer) this.timers.clearTimeout(this._pushTimer);
    this._pushTimer = this.timers.setTimeout(() => {
      this._pushTimer = null;
      void this.push(reason);
    }, PUSH_DEBOUNCE_MS);
    return true;
  }

  /**
   * Send the save now.
   * @returns {Promise<{ok:boolean, reason?:string, revision?:number}>}
   */
  async push(reason = 'manual') {
    if (!this.identity) return { ok: false, reason: 'no-identity' };
    if (!this.identity.claimed) return { ok: false, reason: 'unclaimed' };
    if (!this.isOnline) return { ok: false, reason: 'offline' };
    if (this._inflight) return this._inflight;
    if (this._pushTimer) {
      this.timers.clearTimeout(this._pushTimer);
      this._pushTimer = null;
    }

    const profile = this.store?.profile || {};
    const metrics = playerMetrics(profile);
    const achievements = Array.isArray(profile.achievements) ? profile.achievements.slice(0, 64) : [];

    this._inflight = (async () => {
      const result = await this.client.rpc('sync_progress', {
        p_device_key: this.identity.deviceKey,
        p_data: profile,
        p_metrics: {
          power: metrics.power,
          level: metrics.level,
          stars: metrics.stars,
          bestScore: metrics.bestScore,
          waves: metrics.waves,
          achievements: metrics.achievements,
        },
        p_achievements: achievements,
      });

      if (result.ok && result.data?.ok) {
        this.pending = false;
        this._retries = 0;
        this.lastSyncAt = this.now();
        this.revision = Number(result.data.revision) || this.revision;
        this.lastError = '';
        this.remote = { ...(this.remote || {}), ...metrics, username: this.identity.username };
        this._setStatus('online');
        return { ok: true, revision: this.revision, reason };
      }

      if (result.data?.reason === 'unknown-device') {
        this._setStatus('conflict', 'unknown-device');
        return { ok: false, reason: 'unknown-device' };
      }

      this.pending = true;
      this.lastError = result.reason || 'error';
      this._setStatus('offline', this.lastError);
      this._scheduleRetry();
      return { ok: false, reason: this.lastError };
    })();

    try {
      return await this._inflight;
    } finally {
      this._inflight = null;
    }
  }

  _scheduleRetry() {
    if (this._retryTimer || !this.identity) return;
    const delay = RETRY_DELAYS_MS[Math.min(this._retries, RETRY_DELAYS_MS.length - 1)];
    this._retries += 1;
    this._retryTimer = this.timers.setTimeout(async () => {
      this._retryTimer = null;
      if (this._retries > RETRY_DELAYS_MS.length) return;
      const ping = await this.client?.ping?.();
      if (!ping?.ok) {
        this._scheduleRetry();
        return;
      }
      if (!this.identity.claimed) {
        // The name was held locally while the ledger was down: try to claim it
        // for real now. A `taken` answer reopens the gate (status: conflict).
        const result = await this._register(this.identity.username, this.identity.deviceKey);
        if (result.ok) {
          this.identity.playerId = result.playerId || null;
          this.identity.claimed = true;
          this.identity.mode = 'cloud';
          this._saveIdentity(this.identity);
        } else if (result.reason === 'taken') {
          this._setStatus('conflict', 'taken');
          return;
        }
      }
      this._setStatus('online');
      await this.push('retry');
    }, delay);
  }

  /* ---------------------------------------------------------- leaderboard */

  /**
   * The shared ranking.
   * @returns {Promise<{ok:boolean, rows:Array, total:number, reason?:string}>}
   */
  async leaderboard({ limit = 25, offset = 0 } = {}) {
    if (!this.client?.configured) return { ok: false, reason: 'unconfigured', rows: [], total: 0 };
    const result = await this.client.rpc('leaderboard_page', { p_limit: limit, p_offset: offset });
    if (!result.ok) {
      this.lastError = result.reason || 'offline';
      return { ok: false, reason: this.lastError, rows: [], total: 0 };
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      rows: rows.map((row) => ({
        rank: Number(row.rank) || 0,
        username: String(row.username || ''),
        power: Number(row.power) || 0,
        level: Number(row.level) || 1,
        stars: Number(row.stars) || 0,
        bestScore: Number(row.best_score) || 0,
        waves: Number(row.waves) || 0,
        achievements: Number(row.achievements) || 0,
      })),
      total: Number(rows[0]?.total) || rows.length,
    };
  }

  /** Where this device sits, or null when it has no claimed name. */
  async myRank() {
    if (!this.identity?.claimed || !this.isOnline) return null;
    const result = await this.client.rpc('my_rank', { p_device_key: this.identity.deviceKey });
    if (!result.ok || !result.data?.ok) return null;
    return {
      username: result.data.username,
      rank: Number(result.data.rank) || 0,
      total: Number(result.data.total) || 0,
      power: Number(result.data.power) || 0,
      level: Number(result.data.level) || 1,
      stars: Number(result.data.stars) || 0,
      // The ledger keeps these two as tie-breakers; the hall shows them because
      // a player's own best run is worth seeing even when it is not the rank.
      bestScore: Number(result.data.bestScore) || 0,
      waves: Number(result.data.waves) || 0,
      achievements: Number(result.data.achievements) || 0,
    };
  }

  /* ------------------------------------------------------------ daily board */

  /**
   * Post this device's run on a day's seed.
   *
   * The daily board is the one ranking where two players are genuinely
   * comparable, so the run is sent the moment it ends instead of riding the
   * debounced save: a player who closes the tab on the victory card should
   * still be counted. A refusal is a result, never an exception.
   *
   * @returns {Promise<{ok:boolean, score?:number, waves?:number, reason?:string}>}
   */
  async submitDaily({ dayKey, levelId, seed, score, waves } = {}) {
    if (!this.client?.configured) return { ok: false, reason: 'unconfigured' };
    if (!this.identity?.claimed) return { ok: false, reason: 'unclaimed' };
    if (!dayKey || !levelId) return { ok: false, reason: 'bad-run' };

    const result = await this.client.rpc('daily_submit', {
      p_device_key: this.identity.deviceKey,
      p_day_key: String(dayKey),
      p_level_id: String(levelId),
      p_seed: Math.floor(Number(seed)) || 0,
      p_score: Math.max(0, Math.floor(Number(score)) || 0),
      p_waves: Math.max(0, Math.floor(Number(waves)) || 0),
    });
    if (!result.ok) {
      this.lastError = result.reason || 'offline';
      return { ok: false, reason: this.lastError };
    }
    const data = result.data || {};
    if (data.ok === false) return { ok: false, reason: data.reason || 'refused' };
    return { ok: true, score: Number(data.score) || 0, waves: Number(data.waves) || 0 };
  }

  /**
   * One page of a day's board.
   * @returns {Promise<{ok:boolean, rows:Array, total:number, reason?:string}>}
   */
  async dailyBoard({ dayKey, seed = null, limit = 25 } = {}) {
    if (!this.client?.configured) return { ok: false, reason: 'unconfigured', rows: [], total: 0 };
    if (!dayKey) return { ok: false, reason: 'bad-day', rows: [], total: 0 };
    const result = await this.client.rpc('daily_board', {
      p_day_key: String(dayKey),
      p_seed: seed == null ? null : Math.floor(Number(seed)) || 0,
      p_limit: limit,
    });
    if (!result.ok) {
      this.lastError = result.reason || 'offline';
      return { ok: false, reason: this.lastError, rows: [], total: 0 };
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      rows: rows.map((row) => ({
        rank: Number(row.rank) || 0,
        username: String(row.username || ''),
        levelId: String(row.level_id || ''),
        score: Number(row.score) || 0,
        waves: Number(row.waves) || 0,
      })),
      total: Number(rows[0]?.total) || rows.length,
    };
  }

  /**
   * Where this device sits on a day's board, or null when it has not played.
   * @returns {Promise<{played:boolean, rank?:number, total?:number, score?:number, waves?:number, levelId?:string}|null>}
   */
  async myDailyRank({ dayKey, seed = null } = {}) {
    if (!this.identity?.claimed || !this.isOnline) return null;
    const result = await this.client.rpc('my_daily_rank', {
      p_device_key: this.identity.deviceKey,
      p_day_key: String(dayKey || ''),
      p_seed: seed == null ? null : Math.floor(Number(seed)) || 0,
    });
    if (!result.ok || !result.data?.ok) return null;
    if (!result.data.played) return { played: false };
    return {
      played: true,
      rank: Number(result.data.rank) || 0,
      total: Number(result.data.total) || 0,
      score: Number(result.data.score) || 0,
      waves: Number(result.data.waves) || 0,
      levelId: String(result.data.levelId || ''),
    };
  }

  /* --------------------------------------------------------------- misc */

  /** Everything a UI needs, without reaching into internals. */
  snapshot() {
    return {
      status: this.status,
      statusReason: this.statusReason,
      mode: this.mode,
      label: this.cloudLabel,
      hasIdentity: this.hasIdentity,
      username: this.identity?.username || '',
      playerId: this.identity?.playerId || null,
      claimed: Boolean(this.identity?.claimed),
      pending: this.pending,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      revision: this.revision,
    };
  }

  dispose() {
    if (this._pushTimer) this.timers.clearTimeout(this._pushTimer);
    if (this._retryTimer) this.timers.clearTimeout(this._retryTimer);
    this._pushTimer = null;
    this._retryTimer = null;
    this._unsubscribeStore?.();
    this._unsubscribeStore = null;
    this._listeners.clear();
  }
}

export { createMemoryStorage };
