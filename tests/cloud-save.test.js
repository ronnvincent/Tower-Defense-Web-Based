import { describe, it, expect, vi } from 'vitest';
import {
  CLOUD_STORAGE_KEY,
  CloudSave,
  createDeviceKey,
  sanitizeUsername,
  validateUsername,
} from '../src/systems/CloudSave.js';
import { createMemoryStorage } from '../src/utils/storage.js';
import { ProgressStore } from '../src/systems/Progression.js';

/**
 * The ledger bridge, without a ledger.
 *
 * Every decision the brief cares about is here: a name that is taken is refused
 * and *nothing is stored*; a name that is free is claimed and mirrored; a save
 * that cannot reach the network stays local and is queued, never lost.
 */

function fakeClient({
  online = true,
  taken = [],
  failOn = null,
  leaderboard = [],
  myRank = null,
} = {}) {
  const calls = [];
  const names = new Set(taken.map((name) => name.toLowerCase()));

  const rpc = vi.fn(async (name, params = {}) => {
    calls.push({ name, params });
    if (failOn === name) return { ok: false, reason: 'offline' };

    switch (name) {
      case 'check_username': {
        const key = String(params.p_username || '').toLowerCase();
        return {
          ok: true,
          data: { ok: true, available: !names.has(key), reason: names.has(key) ? 'taken' : 'free', username: params.p_username },
        };
      }
      case 'register_player': {
        const key = String(params.p_username || '').toLowerCase();
        if (names.has(key)) return { ok: true, data: { ok: false, reason: 'taken', username: params.p_username } };
        names.add(key);
        return {
          ok: true,
          data: { ok: true, playerId: 'p-1', username: params.p_username },
        };
      }
      case 'sync_progress':
        return { ok: true, data: { ok: true, revision: 3, power: 500 } };
      case 'pull_progress':
        return { ok: true, data: { ok: true, playerId: 'p-1', username: 'Aria', revision: 1 } };
      case 'leaderboard_page':
        return { ok: true, data: leaderboard };
      case 'my_rank':
        return { ok: true, data: myRank || { ok: false, reason: 'unknown-device' } };
      default:
        return { ok: true, data: { ok: true } };
    }
  });

  return {
    configured: true,
    source: 'env',
    calls,
    rpc,
    ping: vi.fn(async () => (online ? { ok: true } : { ok: false, reason: 'offline' })),
  };
}

function harness(options = {}) {
  const storage = options.storage || createMemoryStorage();
  const store = new ProgressStore({ storage, key: 'test:progress' });
  const client = options.client || fakeClient(options);
  const timers = {
    setTimeout: (fn) => {
      timers.pending.push(fn);
      return timers.pending.length;
    },
    clearTimeout: (id) => {
      timers.pending[id - 1] = null;
    },
    pending: [],
  };
  const cloud = new CloudSave({ client, store, storage, timers });
  return { storage, store, client, cloud, timers };
}

describe('usernames', () => {
  it('trims, collapses whitespace and caps at 16', () => {
    expect(sanitizeUsername('  Aria   the   Bold ')).toBe('Aria the Bold');
    expect(sanitizeUsername('x'.repeat(40))).toHaveLength(16);
    expect(sanitizeUsername(null)).toBe('');
    expect(sanitizeUsername('Ari\u0000a')).toBe('Aria');
  });

  it('enforces the shape without rejecting the allowed punctuation', () => {
    expect(validateUsername('Aria').ok).toBe(true);
    expect(validateUsername('Aria the Bold').ok).toBe(true);
    expect(validateUsername('A.B_C-1').ok).toBe(true);
    expect(validateUsername('ab').reason).toBe('short');
    expect(validateUsername('').reason).toBe('empty');
    expect(validateUsername('Aria!').reason).toBe('chars');
    expect(validateUsername('Admin').reason).toBe('reserved');
  });

  it('mints a device key the ledger will accept', () => {
    const key = createDeviceKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Za-z0-9-]{16,64}$/.test(key)).toBe(true);
    expect(createDeviceKey()).not.toBe(key);
  });
});

describe('claiming a name', () => {
  it('refuses a taken name and stores nothing', async () => {
    const { cloud, store, storage, timers } = harness({ taken: ['Aria'] });
    await cloud.start();

    const result = await cloud.claimName('aria');

    expect(result).toEqual({ ok: false, reason: 'taken', username: 'aria' });
    expect(cloud.hasIdentity).toBe(false);
    expect(store.profile.username).toBe('');
    expect(storage.getItem(CLOUD_STORAGE_KEY)).toBeNull();
    expect(timers.pending.filter(Boolean)).toHaveLength(0);
  });

  it('claims a free name, persists the identity and mirrors the save', async () => {
    const { cloud, store, storage, client } = harness();
    await cloud.start();
    const result = await cloud.claimName('  Aria  ');

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('cloud');
    expect(cloud.identity.username).toBe('Aria');
    expect(cloud.identity.claimed).toBe(true);
    expect(store.profile.username).toBe('Aria');

    const stored = JSON.parse(storage.getItem(CLOUD_STORAGE_KEY));
    expect(stored.username).toBe('Aria');
    expect(stored.claimed).toBe(true);
    expect(stored.deviceKey).toMatch(/^[A-Za-z0-9-]{16,64}$/);

    const sync = client.calls.find((call) => call.name === 'sync_progress');
    expect(sync.params.p_device_key).toBe(stored.deviceKey);
    expect(sync.params.p_metrics.power).toBeGreaterThan(0);
  });

  it('never lets one browser claim twice', async () => {
    const { cloud } = harness();
    await cloud.start();
    await cloud.claimName('Aria');
    const second = await cloud.claimName('Borin');
    expect(second).toEqual({ ok: false, reason: 'device-claimed' });
    expect(cloud.identity.username).toBe('Aria');
  });

  it('rejects a malformed name before touching the network', async () => {
    const { cloud, client } = harness();
    await cloud.start();
    const result = await cloud.claimName('ab');
    expect(result).toEqual({ ok: false, reason: 'short' });
    expect(client.calls.some((call) => call.name === 'register_player')).toBe(false);
  });

  it('holds the name locally when the ledger is unreachable, and says so', async () => {
    const { cloud, store } = harness({ online: false });
    await cloud.start();
    expect(cloud.status).toBe('offline');

    const result = await cloud.claimName('Aria');
    expect(result).toEqual({ ok: true, mode: 'offline', username: 'Aria' });
    expect(cloud.identity?.claimed).toBe(false);
    expect(store.profile.username).toBe('Aria');
  });

  it('keeps the name on-device when there is no ledger at all', async () => {
    const storage = createMemoryStorage();
    const store = new ProgressStore({ storage, key: 'test:progress' });
    const cloud = new CloudSave({ client: null, store, storage });
    await cloud.start();
    expect(cloud.status).toBe('off');
    const result = await cloud.claimName('Aria');
    expect(result.mode).toBe('local');
    expect(cloud.cloudLabel).toBe('LOCAL ONLY');
  });
});

describe('checking a name while typing', () => {
  it('answers from the ledger when it is up', async () => {
    const { cloud } = harness({ taken: ['Aria'] });
    await cloud.start();
    expect((await cloud.checkName('aria')).available).toBe(false);
    expect((await cloud.checkName('Borin')).available).toBe(true);
  });

  it('says "no answer" instead of "free" when offline', async () => {
    const { cloud } = harness({ online: false });
    await cloud.start();
    const result = await cloud.checkName('Aria');
    expect(result.ok).toBe(true);
    expect(result.available).toBeNull();
    expect(result.reason).toBe('offline');
  });
});

describe('mirroring the save', () => {
  it('debounces every save into one push', async () => {
    const { cloud, store, client, timers } = harness();
    await cloud.start();
    await cloud.claimName('Aria');
    client.calls.length = 0;

    store.profile.gold = 100;
    store.save();
    store.profile.gold = 200;
    store.save();
    expect(client.calls).toHaveLength(0); // nothing sent yet

    // Run the pending debounce.
    const runnable = timers.pending.filter(Boolean);
    expect(runnable).toHaveLength(1);
    runnable[0]();
    await Promise.resolve();
    await Promise.resolve();

    const syncs = client.calls.filter((call) => call.name === 'sync_progress');
    expect(syncs).toHaveLength(1);
    expect(syncs[0].params.p_data.gold).toBe(200);
  });

  it('sends the medals the save has unlocked', async () => {
    const { cloud, store, client } = harness();
    await cloud.start();
    await cloud.claimName('Aria');
    store.profile.achievements = ['first-blood', 'perfect-run'];
    await cloud.push('test');

    const sync = client.calls.filter((call) => call.name === 'sync_progress').pop();
    expect(sync.params.p_achievements).toEqual(['first-blood', 'perfect-run']);
    expect(sync.params.p_metrics.achievements).toBe(2);
  });

  it('marks the save pending instead of losing it when the push fails', async () => {
    const { cloud, store } = harness();
    await cloud.start();
    await cloud.claimName('Aria');

    const offline = fakeClient({ online: true, failOn: 'sync_progress' });
    cloud.client = offline;
    store.profile.gems = 12;
    const result = await cloud.push('test');

    expect(result.ok).toBe(false);
    expect(cloud.pending).toBe(true);
    expect(cloud.status).toBe('offline');
    expect(cloud.snapshot().pending).toBe(true);
  });

  it('reports a conflict when the ledger no longer knows this device', async () => {
    const { cloud } = harness();
    await cloud.start();
    await cloud.claimName('Aria');
    cloud.client = {
      configured: true,
      ping: async () => ({ ok: true }),
      rpc: async (name) =>
        name === 'sync_progress'
          ? { ok: true, data: { ok: false, reason: 'unknown-device' } }
          : { ok: true, data: { ok: true } },
    };
    const result = await cloud.push('test');
    expect(result.reason).toBe('unknown-device');
    expect(cloud.status).toBe('conflict');
  });
});

describe('ranking reads', () => {
  it('maps the ledger rows and the caller rank', async () => {
    const { cloud } = harness({
      leaderboard: [
        { rank: 1, username: 'Borin', power: 900, level: 5, stars: 12, best_score: 2200, waves: 9, achievements: 8, total: 3 },
        { rank: 2, username: 'Aria', power: 500, level: 3, stars: 7, best_score: 1500, waves: 4, achievements: 3, total: 3 },
      ],
      myRank: { ok: true, username: 'Aria', rank: 2, total: 3, power: 500, level: 3, stars: 7, achievements: 3 },
    });
    await cloud.start();

    const board = await cloud.leaderboard({ limit: 25 });
    expect(board.ok).toBe(true);
    expect(board.total).toBe(3);
    expect(board.rows[0]).toMatchObject({ rank: 1, username: 'Borin', power: 900, bestScore: 2200 });

    // myRank needs a claimed identity, so claim first.
    await cloud.claimName('Aria');
    const mine = await cloud.myRank();
    expect(mine).toMatchObject({ rank: 2, total: 3, username: 'Aria' });
  });

  it('reports an empty board instead of throwing when the ledger is off', async () => {
    const storage = createMemoryStorage();
    const store = new ProgressStore({ storage, key: 'test:progress' });
    const cloud = new CloudSave({ client: null, store, storage });
    const board = await cloud.leaderboard();
    expect(board).toEqual({ ok: false, reason: 'unconfigured', rows: [], total: 0 });
    expect(await cloud.myRank()).toBeNull();
  });
});

describe('releasing a name', () => {
  it('forgets the identity but keeps the save', async () => {
    const { cloud, store, storage } = harness();
    await cloud.start();
    await cloud.claimName('Aria');
    store.profile.gold = 777;

    cloud.releaseIdentity();

    expect(cloud.hasIdentity).toBe(false);
    expect(storage.getItem(CLOUD_STORAGE_KEY)).toBeNull();
    expect(store.profile.username).toBe('');
    expect(store.profile.gold).toBe(777);
  });
});

describe('a returning browser', () => {
  it('skips the gate when the identity is already stored', async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      CLOUD_STORAGE_KEY,
      JSON.stringify({ username: 'Aria', deviceKey: 'aaaa-bbbb-cccc-dddd', claimed: true, mode: 'cloud' })
    );
    const store = new ProgressStore({ storage, key: 'test:progress' });
    const cloud = new CloudSave({ client: fakeClient(), store, storage });

    expect(cloud.needsName).toBe(false);
    await cloud.start();
    expect(cloud.hasIdentity).toBe(true);
    expect(cloud.identity.username).toBe('Aria');
    expect(store.profile.username).toBe('Aria');
  });

  it('ignores a corrupt identity record rather than locking the player out', () => {
    const storage = createMemoryStorage();
    storage.setItem(CLOUD_STORAGE_KEY, JSON.stringify({ username: '', deviceKey: 'short' }));
    const cloud = new CloudSave({ storage, client: null });
    expect(cloud.hasIdentity).toBe(false);
    expect(cloud.needsName).toBe(true);
  });
});
