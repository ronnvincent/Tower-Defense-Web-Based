/**
 * sw.js — the offline shell.
 *
 * The game is a browser game, so the second visit is the expensive one that
 * nobody is paid to wait for: `BootScene` asks for every biome's tiles before
 * the menu, and there are hundreds of them. This worker keeps the hashed
 * build output on the device, so a returning player starts from disk.
 *
 * The strategy is deliberately boring, because a stale game is worse than a
 * slow one:
 *
 *   navigation   network first (so a deploy lands on the next visit), cache
 *                only when the network fails — that is the offline case
 *   /assets/…    cache first (Vite hashes these filenames, so a new build is a
 *                new URL and can never collide with a cached one)
 *   /fonts/, /icons/, manifest
 *                cache first, same reason
 *   everything else (the ledger, the duel relay, telemetry)
 *                untouched — never cached, never intercepted
 *
 * On top of the passive caching there is a message protocol the page drives
 * (see `src/systems/Offline.js`): `warm` fills the cache from the build's own
 * file list, `status` counts how much of that list is already here. Passive
 * caching only ever covers what the player has already opened; warming covers
 * the levels they have not, which is what makes the game playable offline
 * rather than merely repeatable offline.
 *
 * Bump VERSION on a behaviour change. The activate handler drops every cache
 * that does not carry the current version, so an old shell cannot outlive it.
 */

const VERSION = 'v2';
const SHELL = `td-shell-${VERSION}`;
const ASSETS = `td-assets-${VERSION}`;
const CACHES = [SHELL, ASSETS];

/** The handful of files a cold offline start needs before anything is hashed. */
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest'];

/**
 * The build's own file list (`scripts/build-offline-manifest.mjs` writes it).
 *
 * It is the one file the page has to read *after* the network is gone: without
 * it the menu cannot tell how much of the build is already on the device, and
 * the offline key would greet a fully-saved player with "save every level".
 */
const MANIFEST_PATH = '/offline-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // `addAll` rejects the whole install when one file 404s, and a missing
      // manifest must not cost the player their offline shell.
      await Promise.all(SHELL_FILES.map((file) => cache.add(file).catch(() => null)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !CACHES.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

/** Cache-first: the URL is content-addressed, so a hit is always the right file. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Opaque and error responses are not worth keeping: a cached 404 is a bug
  // that survives a reload.
  if (response.ok) cache.put(request, response.clone()).catch(() => null);
  return response;
}

/** Network-first, with the cached shell as the offline floor. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => null);
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (await cache.match('./index.html'));
    if (hit) return hit;
    throw error;
  }
}

/**
 * Network-first for the manifest, cached copy as the floor.
 *
 * Not cache-first: a stale list would count files the cache no longer matches
 * and warm URLs from a build that is gone. Not plain network: offline is
 * exactly the case it exists for. `caches.match` searches every cache, because
 * the warming pass files its copy under the asset cache.
 */
async function manifestFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const shell = await caches.open(SHELL);
      shell.put(request, response.clone()).catch(() => null);
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // A different origin is the ledger, the relay or a font CDN: not ours to hold.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname === MANIFEST_PATH) {
    event.respondWith(manifestFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});

/* ---------------------------------------------------------------- warming */

/** How many files to pull at once: enough to use the pipe, few enough to yield. */
const WARM_CONCURRENCY = 6;
/** Tell the page often enough to paint a bar, rarely enough not to flood it. */
const PROGRESS_EVERY = 20;

/** Is this URL already in the asset cache? */
async function alreadyCached(request) {
  const cache = await caches.open(ASSETS);
  return Boolean(await cache.match(request));
}

/**
 * Cache every URL in `urls` that is not cached yet.
 *
 * A file that fails is counted, not thrown: one missing sprite must not abort
 * the other 1 675 files, and the page can report "1 675 / 1 676" honestly
 * instead of claiming a success it did not have.
 */
async function warm(urls, report) {
  const total = urls.length;
  let cached = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= total) return;
      const url = urls[index];
      try {
        const request = new Request(url, { credentials: 'same-origin' });
        if (!(await alreadyCached(request))) {
          const response = await fetch(request);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const cache = await caches.open(ASSETS);
          await cache.put(request, response);
        }
        cached += 1;
      } catch {
        failed += 1;
      }
      if ((cached + failed) % PROGRESS_EVERY === 0) report({ cached, failed, total });
    }
  };

  await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, total) }, worker));
  report({ cached, failed, total });
  return { cached, failed, total };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (!port) return;

  if (data.type === 'status' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        // One `keys()` and a set, not 1 676 `match()` round trips: the page
        // asks this on every menu load, and a per-file answer made the offline
        // key sit on its cold state long enough to look broken.
        const cache = await caches.open(ASSETS);
        // Compare whole URLs, not paths: `pathname` re-encodes a space as %20,
        // and forty files live under `assets/cozy-ui/Icons Default/`, so a path
        // comparison reported them missing and the key never reached "ready".
        const have = new Set((await cache.keys()).map((request) => request.url));
        let cached = 0;
        for (const url of data.urls) {
          let key = url;
          try {
            key = new URL(url, self.location.href).href;
          } catch {
            // a malformed entry is just a file this device does not have
          }
          if (have.has(key)) cached += 1;
        }
        port.postMessage({ type: 'status', cached, total: data.urls.length });
      })()
    );
    return;
  }

  if (data.type === 'warm' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        let last = 0;
        const report = ({ cached, failed, total }) => {
          const now = Date.now();
          if (now - last < 250 && cached + failed < total) return;
          last = now;
          port.postMessage({ type: 'progress', cached, failed, total });
        };
        const result = await warm(data.urls, report);
        port.postMessage({ type: 'done', ...result });
      })()
    );
  }
});
