// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NameGateUI } from '../src/ui/NameGateUI.js';
import { CloudSave, CLOUD_STORAGE_KEY } from '../src/systems/CloudSave.js';
import { createMemoryStorage } from '../src/utils/storage.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { audio } from '../src/rendering/AudioSynth.js';

/**
 * The gate in front of the menu.
 *
 * The rule under test is the one from the brief: a name that is already taken
 * must be refused, and nothing about it may be stored. The gate reads the real
 * markup from `index.html`, so a renamed id fails here instead of shipping a
 * screen where the button does nothing.
 */

const html = readFileSync('index.html', 'utf8');

function mountFromIndex() {
  const start = html.indexOf('<body>');
  const end = html.indexOf('</body>');
  const body = html.slice(start + 6, end).replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

const $ = (id) => document.getElementById(id);

function fakeClient({ taken = [], online = true } = {}) {
  const names = new Set(taken.map((name) => name.toLowerCase()));
  return {
    configured: true,
    source: 'env',
    ping: vi.fn(async () => (online ? { ok: true } : { ok: false, reason: 'offline' })),
    rpc: vi.fn(async (name, params = {}) => {
      if (name === 'check_username') {
        const key = String(params.p_username || '').toLowerCase();
        return { ok: true, data: { ok: true, available: !names.has(key), reason: names.has(key) ? 'taken' : 'free' } };
      }
      if (name === 'register_player') {
        const key = String(params.p_username || '').toLowerCase();
        if (names.has(key)) return { ok: true, data: { ok: false, reason: 'taken' } };
        names.add(key);
        return { ok: true, data: { ok: true, playerId: 'p-9', username: params.p_username } };
      }
      if (name === 'sync_progress') return { ok: true, data: { ok: true, revision: 1 } };
      return { ok: true, data: { ok: true } };
    }),
  };
}

async function build({ taken = [], online = true } = {}) {
  const storage = createMemoryStorage();
  const store = new ProgressStore({ storage, key: 'test:progress' });
  const client = fakeClient({ taken, online });
  const cloud = new CloudSave({ client, store, storage });
  // A real page boots through start(); so do these, so the gate is tested
  // against a connected ledger rather than an implicit one.
  await cloud.start();
  const accepted = [];
  const gate = new NameGateUI($('name-gate'), {
    cloud,
    onAccepted: (info) => accepted.push(info),
  });
  return { storage, store, client, cloud, gate, accepted };
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

beforeEach(() => {
  mountFromIndex();
  vi.spyOn(audio, 'playClick').mockImplementation(() => {});
  vi.spyOn(audio, 'playCoin').mockImplementation(() => {});
  vi.spyOn(audio, 'playError').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the gate markup', () => {
  it('exists in index.html, starts hidden, and is a labelled dialog', () => {
    const gate = $('name-gate');
    expect(gate).toBeTruthy();
    expect(gate.classList.contains('hidden')).toBe(true);
    expect(gate.getAttribute('role')).toBe('dialog');
    expect(gate.getAttribute('aria-modal')).toBe('true');
    expect($('name-gate-input')?.getAttribute('maxlength')).toBe('16');
  });

  it('opens over the menu and focuses the field', async () => {
    vi.useFakeTimers();
    const { gate } = await build();
    gate.open();
    expect($('name-gate').classList.contains('hidden')).toBe(false);
    vi.runAllTimers();
    expect(document.activeElement).toBe($('name-gate-input'));
    gate.dispose();
  });
});

describe('claiming a name', () => {
  it('accepts a free name, stores it, and tells the caller', async () => {
    vi.useFakeTimers();
    const { gate, cloud, store, accepted, storage } = await build();
    gate.open();
    $('name-gate-input').value = 'Aria';
    await gate.claim();
    await flush();

    expect(accepted).toEqual([{ username: 'Aria', mode: 'cloud' }]);
    expect(cloud.identity.username).toBe('Aria');
    expect(store.profile.username).toBe('Aria');
    expect(JSON.parse(storage.getItem(CLOUD_STORAGE_KEY)).username).toBe('Aria');
    expect($('name-gate-status').textContent).toContain('WELCOME');

    vi.runAllTimers();
    expect($('name-gate').classList.contains('hidden')).toBe(true);
    gate.dispose();
  });

  it('refuses a taken name, keeps the gate open, and stores nothing', async () => {
    vi.useFakeTimers();
    const { gate, cloud, store, accepted, storage } = await build({ taken: ['Aria'] });
    gate.open();
    $('name-gate-input').value = 'aria';
    const result = await gate.claim();

    expect(result).toEqual({ ok: false, reason: 'taken', username: 'aria' });
    expect(accepted).toHaveLength(0);
    expect(cloud.hasIdentity).toBe(false);
    expect(store.profile.username).toBe('');
    expect(storage.getItem(CLOUD_STORAGE_KEY)).toBeNull();

    const status = $('name-gate-status');
    expect(status.textContent).toContain('ALREADY CARVED');
    expect(status.dataset.tone).toBe('error');
    expect($('name-gate').classList.contains('hidden')).toBe(false);
    expect(vi.mocked(audio.playError)).toHaveBeenCalled();
    gate.dispose();
  });

  it('explains a too-short name without calling the ledger', async () => {
    const { gate, client } = await build();
    gate.open();
    $('name-gate-input').value = 'ab';
    const result = await gate.claim();

    expect(result).toEqual({ ok: false, reason: 'short' });
    expect($('name-gate-status').textContent).toContain('AT LEAST 3 CHARACTERS');
    expect(client.rpc).not.toHaveBeenCalledWith('register_player', expect.anything());
    gate.dispose();
  });

  it('lets the second attempt through after a refusal', async () => {
    vi.useFakeTimers();
    const { gate, cloud, accepted } = await build({ taken: ['Aria'] });
    gate.open();
    $('name-gate-input').value = 'Aria';
    await gate.claim();
    expect(cloud.hasIdentity).toBe(false);

    $('name-gate-input').value = 'Borin';
    await gate.claim();
    await flush();
    expect(accepted[0].username).toBe('Borin');
    expect(cloud.identity.username).toBe('Borin');
    gate.dispose();
  });
});

describe('the live availability check', () => {
  it('warns that a name is taken before the player submits', async () => {
    vi.useFakeTimers();
    const { gate } = await build({ taken: ['Aria'] });
    gate.open();
    $('name-gate-input').value = 'Aria';
    $('name-gate-input').dispatchEvent(new Event('input'));

    vi.advanceTimersByTime(400);
    await flush();
    expect($('name-gate-status').textContent).toContain('ALREADY CARVED');
    gate.dispose();
  });

  it('confirms a free name', async () => {
    vi.useFakeTimers();
    const { gate } = await build();
    gate.open();
    $('name-gate-input').value = 'Borin';
    $('name-gate-input').dispatchEvent(new Event('input'));

    vi.advanceTimersByTime(400);
    await flush();
    expect($('name-gate-status').textContent).toContain('FREE');
    gate.dispose();
  });
});

describe('when the ledger is down', () => {
  it('still lets the player in, with the name held on this device', async () => {
    vi.useFakeTimers();
    const { gate, cloud, accepted } = await build({ online: false });
    await cloud.start();
    expect(cloud.status).toBe('offline');

    gate.open();
    $('name-gate-input').value = 'Aria';
    await gate.claim();
    await flush();

    expect(accepted[0]).toEqual({ username: 'Aria', mode: 'offline' });
    expect(cloud.mode).toBe('offline');
    expect($('name-gate-cloud').textContent).toContain('OFFLINE');
    gate.dispose();
  });
});

describe('a name conflict reported later', () => {
  it('brings the gate back with the refusal message', async () => {
    const { gate } = await build();
    gate.reopen('taken');
    expect($('name-gate').classList.contains('hidden')).toBe(false);
    expect($('name-gate-status').textContent).toContain('ALREADY CARVED');
    gate.dispose();
  });
});
