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
 * Bump VERSION on a behaviour change. The activate handler drops every cache
 * that does not carry the current version, so an old shell cannot outlive it.
 */

const VERSION = 'v1';
const SHELL = `td-shell-${VERSION}`;
const ASSETS = `td-assets-${VERSION}`;
const CACHES = [SHELL, ASSETS];

/** The handful of files a cold offline start needs before anything is hashed. */
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest'];

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

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
