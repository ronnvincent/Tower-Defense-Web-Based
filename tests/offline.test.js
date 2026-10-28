// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import {
  OFFLINE_MANIFEST_PATH,
  SW_PATH,
  bindInstallButton,
  bindOfflineButton,
  createInstallPrompt,
  createOfflineVault,
  loadOfflineManifest,
  registerServiceWorker,
  serviceWorkerSupported,
} from '../src/systems/Offline.js';

/**
 * The installable shell.
 *
 * A service worker is the one piece of this game that runs after the tab is
 * closed, so it has to fail quietly: no registration in a dev build, no
 * exception on a browser without the API, and no install button unless the
 * browser has actually offered one.
 */

/** A navigator stand-in that records what was asked of it. */
function navWithRegister({ register } = {}) {
  const calls = [];
  return {
    calls,
    serviceWorker: {
      register: register || (async (path, options) => {
        calls.push({ path, options });
        return { scope: '/', path };
      }),
    },
  };
}

describe('service worker support', () => {
  it('needs the API and a secure origin', () => {
    expect(serviceWorkerSupported(navWithRegister(), true)).toBe(true);
    expect(serviceWorkerSupported(navWithRegister(), false)).toBe(false);
    expect(serviceWorkerSupported({}, true)).toBe(false);
    expect(serviceWorkerSupported(null, true)).toBe(false);
  });

  it('registers nothing in a dev build', async () => {
    const nav = navWithRegister();
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: false } });
    expect(result).toEqual({ ok: false, reason: 'dev' });
    expect(nav.calls).toHaveLength(0);
  });

  it('registers the shell at the app scope in a production build', async () => {
    const nav = navWithRegister();
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: true } });
    expect(result.ok).toBe(true);
    expect(nav.calls).toHaveLength(1);
    expect(nav.calls[0].path).toBe(SW_PATH);
    expect(nav.calls[0].options.scope).toBe('./');
  });

  it('turns a refused registration into a result, not an exception', async () => {
    const nav = navWithRegister({ register: async () => { throw new Error('blocked by policy'); } });
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('skips an insecure origin rather than asking for a worker it cannot have', async () => {
    const nav = navWithRegister();
    const result = await registerServiceWorker({ nav, secure: false, env: { PROD: true } });
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
    expect(nav.calls).toHaveLength(0);
  });
});

/** A window stand-in that can fire the install event. */
function fakeWindow() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
}

function installEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = vi.fn();
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('the install offer', () => {
  it('stays unavailable until the browser offers one, and holds the event', () => {
    const win = fakeWindow();
    const prompt = createInstallPrompt(win);
    expect(prompt.canInstall).toBe(false);

    const seen = [];
    prompt.onChange((value) => seen.push(value));
    const event = installEvent();
    win.dispatchEvent(event);

    expect(prompt.canInstall).toBe(true);
    expect(seen).toEqual([true]);
    // preventDefault is what stops Chromium's own mini-infobar from spending it.
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('spends the event exactly once', async () => {
    const win = fakeWindow();
    const prompt = createInstallPrompt(win);
    const event = installEvent('accepted');
    win.dispatchEvent(event);

    expect(await prompt.prompt()).toEqual({ ok: true, outcome: 'accepted' });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(prompt.canInstall).toBe(false);
    // A second click has nothing left to spend.
    expect(await prompt.prompt()).toEqual({ ok: false });
  });

  it('reports a dismissed prompt as not installed', async () => {
    const win = fakeWindow();
    const prompt = createInstallPrompt(win);
    win.dispatchEvent(installEvent('dismissed'));
    expect(await prompt.prompt()).toEqual({ ok: false, outcome: 'dismissed' });
  });

  it('clears itself when the app is installed from the browser menu', () => {
    const win = fakeWindow();
    const prompt = createInstallPrompt(win);
    win.dispatchEvent(installEvent());
    expect(prompt.canInstall).toBe(true);
    win.dispatchEvent(new Event('appinstalled'));
    expect(prompt.canInstall).toBe(false);
  });
});

describe('the menu button', () => {
  function mount() {
    document.body.innerHTML = '<button id="menu-btn-install" class="hidden" type="button">install</button>';
    return document.getElementById('menu-btn-install');
  }

  it('is hidden and disabled until an install is possible', () => {
    const button = mount();
    const win = fakeWindow();
    bindInstallButton(button, createInstallPrompt(win));
    expect(button.classList.contains('hidden')).toBe(true);
    expect(button.disabled).toBe(true);

    win.dispatchEvent(installEvent());
    expect(button.classList.contains('hidden')).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('asks for the install on click and hides itself afterwards', async () => {
    const button = mount();
    const win = fakeWindow();
    const onInstalled = vi.fn();
    bindInstallButton(button, createInstallPrompt(win), { onInstalled });
    win.dispatchEvent(installEvent());
    button.click();
    // The handler awaits the browser's own prompt, so let the microtask queue
    // drain before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('hidden')).toBe(true);
  });

  it('survives a missing button or prompt without throwing', () => {
    expect(() => bindInstallButton(null, createInstallPrompt(fakeWindow()))()).not.toThrow();
    expect(() => bindInstallButton(mount(), null)()).not.toThrow();
  });
});


/* --------------------------------------------------------------------- vault */

/** A fetch that answers one manifest and 404s everything else. */
function manifestFetch(manifest) {
  return async (url) => {
    if (url === OFFLINE_MANIFEST_PATH) {
      return { ok: true, json: async () => manifest };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

/** A service worker stand-in that answers the warming protocol. */
function fakeWorker({ cached = 0, total = 4, fail = 0, silent = false } = {}) {
  const calls = [];
  return {
    calls,
    postMessage(message, ports) {
      calls.push(message);
      const port = ports && ports[0];
      if (!port || silent) return;
      if (message.type === 'status') {
        port.postMessage({ type: 'status', cached, total });
        return;
      }
      if (message.type === 'warm') {
        port.postMessage({ type: 'progress', cached: Math.floor(total / 2), failed: 0, total });
        port.postMessage({ type: 'done', cached: total - fail, failed: fail, total });
      }
    },
  };
}

const fakeNav = (worker) => ({ serviceWorker: { ready: Promise.resolve({ active: worker }) } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the build manifest', () => {
  it('reads the file list and the weight', async () => {
    const manifest = await loadOfflineManifest({
      fetchImpl: manifestFetch({ files: ['/assets/a.png', '/assets/b.png'], bytes: 2048 }),
    });
    expect(manifest.files).toHaveLength(2);
    expect(manifest.count).toBe(2);
    expect(manifest.bytes).toBe(2048);
  });

  it('is optional: a dev build, a 404 or junk is a null, not a throw', async () => {
    expect(await loadOfflineManifest({ fetchImpl: async () => ({ ok: false }) })).toBe(null);
    expect(await loadOfflineManifest({ fetchImpl: async () => ({ ok: true, json: async () => ({ files: [] }) }) })).toBe(null);
    expect(await loadOfflineManifest({ fetchImpl: async () => { throw new Error('offline'); } })).toBe(null);
    expect(await loadOfflineManifest({ fetchImpl: async () => ({ ok: true, json: async () => 'nope' }) })).toBe(null);
  });

  it('keeps only same-origin paths, so a manifest cannot make the worker fetch elsewhere', async () => {
    const manifest = await loadOfflineManifest({
      fetchImpl: manifestFetch({ files: ['/ok.png', 'https://evil.test/x.png', '', 42] }),
    });
    expect(manifest.files).toEqual(['/ok.png']);
  });
});

describe('the offline vault', () => {
  it('asks the worker how much is already local', async () => {
    const worker = fakeWorker({ cached: 2, total: 4 });
    const vault = createOfflineVault({
      nav: fakeNav(worker),
      fetchImpl: manifestFetch({ files: ['/a.png', '/b.png', '/c.png', '/d.png'] }),
    });
    const status = await vault.status();
    expect(status).toMatchObject({ ok: true, cached: 2, total: 4 });
    expect(worker.calls[0].type).toBe('status');
    expect(worker.calls[0].urls).toHaveLength(4);
  });

  it('warms, reporting progress and finishing with the count', async () => {
    const worker = fakeWorker({ cached: 0, total: 3 });
    const vault = createOfflineVault({
      nav: fakeNav(worker),
      fetchImpl: manifestFetch({ files: ['/a.png', '/b.png', '/c.png'] }),
    });
    const seen = [];
    const result = await vault.warm({ onProgress: (row) => seen.push(row.cached) });
    expect(worker.calls[0].type).toBe('warm');
    expect(result).toMatchObject({ ok: true, cached: 3, failed: 0, total: 3 });
    expect(seen.length).toBeGreaterThan(1);
  });

  it('reports a partial warm honestly instead of claiming success', async () => {
    const worker = fakeWorker({ cached: 0, total: 3, fail: 1 });
    const vault = createOfflineVault({
      nav: fakeNav(worker),
      fetchImpl: manifestFetch({ files: ['/a.png', '/b.png', '/c.png'] }),
    });
    const result = await vault.warm();
    expect(result).toMatchObject({ ok: true, cached: 2, failed: 1, total: 3 });
  });

  it('gives up when the worker never answers', async () => {
    const vault = createOfflineVault({
      nav: fakeNav(fakeWorker({ silent: true })),
      fetchImpl: manifestFetch({ files: ['/a.png'] }),
      idleMs: 40,
    });
    const result = await vault.warm({ onProgress: () => {} });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('says why it cannot work rather than pretending', async () => {
    const noManifest = createOfflineVault({ nav: fakeNav(fakeWorker()), fetchImpl: async () => ({ ok: false }) });
    expect(await noManifest.warm()).toEqual({ ok: false, reason: 'no-manifest' });

    const noWorker = createOfflineVault({
      nav: {},
      fetchImpl: manifestFetch({ files: ['/a.png'] }),
    });
    expect(await noWorker.warm()).toMatchObject({ ok: false, reason: 'no-worker' });
  });
});

describe('the save-for-offline key', () => {
  function mount() {
    document.body.innerHTML =
      '<button id="menu-btn-offline" class="menu-icon" type="button"><span data-badge></span></button>';
    return document.getElementById('menu-btn-offline');
  }

  const vaultFor = (worker, files) =>
    createOfflineVault({ nav: fakeNav(worker), fetchImpl: manifestFetch({ files }) });

  it('stays a plain key until it is asked to work', async () => {
    const button = mount();
    bindOfflineButton(button, vaultFor(fakeWorker({ cached: 0, total: 2 }), ['/a.png', '/b.png']));
    await tick();
    expect(button.classList.contains('is-ready')).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toContain('offline');
  });

  it('prints the percentage while warming and OK when every file is local', async () => {
    const button = mount();
    const badge = button.querySelector('[data-badge]');
    bindOfflineButton(button, vaultFor(fakeWorker({ cached: 0, total: 2 }), ['/a.png', '/b.png']));
    await tick();
    button.click();
    await tick();
    await tick();
    expect(badge.textContent).toBe('OK');
    expect(button.classList.contains('is-ready')).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toContain('Playable offline');
  });

  it('exposes itself once the vault is available', async () => {
    const button = mount();
    const vault = vaultFor(fakeWorker({ cached: 0, total: 2 }), ['/a.png', '/b.png']);
    vault.supported = true;
    const states = [];
    bindOfflineButton(button, vault, { onState: (state) => states.push(state) });
    await tick();
    expect(button.classList.contains('hidden')).toBe(false);
    expect(states[0]).toBe('cold');
  });

  it('survives a missing button or vault', () => {
    expect(() => bindOfflineButton(null, vaultFor(fakeWorker(), ['/a.png']))()).not.toThrow();
    expect(() => bindOfflineButton(mount(), null)()).not.toThrow();
  });
});

/* ------------------------------------------------------------- the worker */

/**
 * `public/sw.js` runs in its own global, so it is loaded the way the browser
 * loads it: the source, a `self` that collects listeners, and nothing else.
 *
 * The manifest is the one file the page has to read *after* the network is
 * gone. Before this was wired, a fully-saved player who reloaded offline saw
 * "save every level on this device" — the key had no way to count the cache.
 */
function loadWorker({ fetchImpl, cachesApi }) {
  const listeners = new Map();
  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    location: { origin: 'https://game.test', href: 'https://game.test/' },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  runInNewContext(source, {
    self,
    caches: cachesApi,
    fetch: fetchImpl,
    URL,
    setTimeout,
    clearTimeout,
    console,
  });
  const fire = (type, event) => {
    const handler = listeners.get(type);
    if (!handler) throw new Error(`no ${type} listener`);
    handler(event);
    return event;
  };
  return { fire, self };
}

/** A CacheStorage that only remembers what it is given. */
function fakeCaches() {
  const store = new Map();
  const view = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const map = store.get(name);
    const key = (request) => (typeof request === 'string' ? request : request.url);
    return {
      put: async (request, response) => { map.set(key(request), response); },
      match: async (request) => map.get(key(request)),
      add: async (request) => { map.set(key(request), jsonResponse('{}')); },
      keys: async () => [...map.keys()].map((url) => ({ url })),
    };
  };
  return {
    store,
    open: async (name) => view(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (request) => {
      const key = typeof request === 'string' ? request : request.url;
      for (const map of store.values()) if (map.has(key)) return map.get(key);
      return undefined;
    },
  };
}

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  body,
  clone() { return this; },
  text: async () => body,
});

const MANIFEST_URL = 'https://game.test/offline-manifest.json';
const manifestRequest = { url: MANIFEST_URL, method: 'GET', mode: 'cors' };

/** Dispatch a fetch event and hand back whatever the worker answered with. */
function fetchThrough(worker, request) {
  const event = { request, respondWith: null, waitUntil: null };
  event.respondWith = (promise) => { event.response = promise; };
  event.waitUntil = (promise) => { event.waited = promise; };
  worker.fire('fetch', event);
  return event.response;
}

describe('the worker\'s copy of the build manifest', () => {
  it('serves the cached list when the network is gone', async () => {
    const cachesApi = fakeCaches();
    await (await cachesApi.open('td-shell-v2')).put(manifestRequest, jsonResponse('{"files":["/a.png"]}'));
    const worker = loadWorker({
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
      cachesApi,
    });

    const response = await fetchThrough(worker, manifestRequest);
    expect(JSON.parse(await response.text())).toEqual({ files: ['/a.png'] });
  });

  it('prefers a fresh list when the network is there, and keeps it', async () => {
    const cachesApi = fakeCaches();
    await (await cachesApi.open('td-shell-v2')).put(manifestRequest, jsonResponse('{"files":["/old.png"]}'));
    const worker = loadWorker({
      fetchImpl: async () => jsonResponse('{"files":["/new.png"]}'),
      cachesApi,
    });

    const response = await fetchThrough(worker, manifestRequest);
    expect(JSON.parse(await response.text())).toEqual({ files: ['/new.png'] });
    const kept = await cachesApi.match(manifestRequest);
    expect(JSON.parse(await kept.text())).toEqual({ files: ['/new.png'] });
  });

  it('fails loudly instead of answering JSON with the app shell', async () => {
    const cachesApi = fakeCaches();
    await (await cachesApi.open('td-shell-v2')).put('https://game.test/', jsonResponse('<html></html>'));
    const worker = loadWorker({
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
      cachesApi,
    });

    await expect(fetchThrough(worker, manifestRequest)).rejects.toThrow('Failed to fetch');
  });
});

/** Drive the worker's message protocol and read the port it answers on. */
function askWorker(worker, message) {
  const posted = [];
  const port = { postMessage: (data) => posted.push(data) };
  const event = { data: message, ports: [port], waitUntil: (promise) => { event.done = promise; } };
  worker.fire('message', event);
  return event.done.then(() => posted);
}

describe('the worker counting what is already saved', () => {
  it('matches files whose path contains a space', async () => {
    const cachesApi = fakeCaches();
    const assets = await cachesApi.open('td-assets-v2');
    // Cache keys are serialised URLs, so the browser's copy says %20.
    await assets.put({ url: 'https://game.test/assets/cozy-ui/Icons%20Default/a.png' }, jsonResponse('png'));
    await assets.put({ url: 'https://game.test/assets/b.png' }, jsonResponse('png'));

    const worker = loadWorker({ fetchImpl: async () => jsonResponse('{}'), cachesApi });
    const [reply] = await askWorker(worker, {
      type: 'status',
      urls: ['/assets/cozy-ui/Icons Default/a.png', '/assets/b.png', '/assets/missing.png'],
    });

    expect(reply).toEqual({ type: 'status', cached: 2, total: 3 });
  });
});
