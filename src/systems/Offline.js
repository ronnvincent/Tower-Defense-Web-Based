/**
 * Offline.js — the installable half of a browser game.
 *
 * Two things live here, and neither of them is a feature the player has to
 * learn:
 *
 *   registerServiceWorker  puts `public/sw.js` behind the app, so a returning
 *                          visit is served from the device. It never throws and
 *                          never blocks the first paint: a browser without
 *                          service workers, a dev build, or a failed
 *                          registration all resolve to `{ ok: false }` and the
 *                          game plays exactly as it did before.
 *
 *   createInstallPrompt    keeps the browser's `beforeinstallprompt` event
 *                          until the player asks for it. The event cannot be
 *                          replayed, so the handler is captured once and the
 *                          menu button is the only thing that spends it.
 *
 * Both take their environment as a parameter, which is what makes them
 * unit-testable without a browser at all.
 */

export const SW_PATH = '/sw.js';

/**
 * The build's own file list (`scripts/build-offline-manifest.mjs` writes it).
 * Missing in a dev build, which is why every reader treats it as optional.
 */
export const OFFLINE_MANIFEST_PATH = '/offline-manifest.json';

/** Is there a service worker API here, on a secure origin? */
export function serviceWorkerSupported(nav = globalThis.navigator, secure = globalThis.isSecureContext) {
  return Boolean(nav && 'serviceWorker' in nav) && secure !== false;
}

/**
 * Register the offline shell.
 *
 * @returns {Promise<{ok:boolean, reason?:string, registration?:object}>}
 *   `reason` is 'dev' (a dev build must never cache itself), 'unsupported', or
 *   'error'. Callers only ever need `ok`.
 */
export async function registerServiceWorker({
  nav = globalThis.navigator,
  secure = globalThis.isSecureContext,
  env = import.meta.env,
  path = SW_PATH,
} = {}) {
  if (!env || !env.PROD) return { ok: false, reason: 'dev' };
  if (!serviceWorkerSupported(nav, secure)) return { ok: false, reason: 'unsupported' };
  try {
    const registration = await nav.serviceWorker.register(path, { scope: './' });
    return { ok: true, registration };
  } catch (error) {
    // A browser that refuses the worker is not a broken game.
    return { ok: false, reason: 'error', error };
  }
}

/**
 * Wrap `beforeinstallprompt` so the menu can offer the install at its own pace.
 *
 * The event fires once, early, before the player has any reason to care; if the
 * page ignores it the browser will not ask again for a while. Holding it here
 * lets the button appear only when an install is genuinely possible.
 *
 * @returns {{canInstall:boolean, onChange:(fn:(canInstall:boolean)=>void)=>()=>void, prompt:()=>Promise<{ok:boolean, outcome?:string}>}}
 */
export function createInstallPrompt(win = globalThis) {
  let deferred = null;
  const listeners = new Set();
  const emit = () => {
    const value = Boolean(deferred);
    for (const fn of listeners) {
      try {
        fn(value);
      } catch {
        /* a listener throwing must not stop the others */
      }
    }
  };

  win.addEventListener?.('beforeinstallprompt', (event) => {
    // Without preventDefault Chromium shows its own mini-infobar, and the event
    // cannot be used later — the menu would then have a button that does nothing.
    event.preventDefault?.();
    deferred = event;
    emit();
  });
  win.addEventListener?.('appinstalled', () => {
    deferred = null;
    emit();
  });

  return {
    get canInstall() {
      return Boolean(deferred);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async prompt() {
      if (!deferred) return { ok: false };
      const event = deferred;
      // Spend it: a prompt event is single-use, and the browser will fire a new
      // one if the player dismisses and qualifies again.
      deferred = null;
      try {
        const choice = event.prompt ? await event.prompt() : null;
        const outcome = choice?.outcome || (await event.userChoice?.catch?.(() => null))?.outcome || 'dismissed';
        emit();
        return { ok: outcome === 'accepted', outcome };
      } catch {
        emit();
        return { ok: false, outcome: 'error' };
      }
    },
  };
}

/**
 * Paint the menu's install button from the prompt state.
 *
 * Kept out of `main.js` so the "only show it when it can actually install"
 * rule has one home.
 */
export function bindInstallButton(button, prompt, { onInstalled } = {}) {
  if (!button || !prompt) return () => {};
  const paint = (canInstall) => {
    button.classList.toggle('hidden', !canInstall);
    button.disabled = !canInstall;
  };
  paint(prompt.canInstall);
  const off = prompt.onChange(paint);
  const click = async () => {
    const result = await prompt.prompt();
    paint(prompt.canInstall);
    if (result.ok) onInstalled?.(result);
  };
  button.addEventListener('click', click);
  return () => {
    off?.();
    button.removeEventListener('click', click);
  };
}


/* --------------------------------------------------------------------- vault */

/** Read the build's file list. Returns null rather than throwing. */
export async function loadOfflineManifest({ fetchImpl = globalThis.fetch, path = OFFLINE_MANIFEST_PATH } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(path, { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = await response.json();
    const files = Array.isArray(data?.files)
      ? data.files.filter((url) => typeof url === 'string' && url.startsWith('/'))
      : [];
    if (!files.length) return null;
    return { files, count: files.length, bytes: Number(data.bytes) || 0 };
  } catch {
    return null;
  }
}

/**
 * The cache warming half: ask the worker how much of the build is already on
 * the device, and top it up on request.
 *
 * Passive caching means "what you played works offline". This means "the whole
 * game works offline", which is the difference a player feels when they open
 * the app on a train and pick a level they have never played. It is opt-in
 * (a button in the menu) because it downloads the entire build.
 *
 * The worker owns the cache; the page only ever sends it a list and listens for
 * progress, so there is one writer and no chance of the two disagreeing.
 */
export function createOfflineVault({
  nav = globalThis.navigator,
  fetchImpl = globalThis.fetch,
  ManifestLoader = loadOfflineManifest,
  idleMs = 30000,
} = {}) {
  const supported = Boolean(nav && 'serviceWorker' in nav);

  async function worker() {
    if (!supported) return null;
    try {
      const registration = await nav.serviceWorker.ready;
      return registration?.active || registration?.waiting || registration?.installing || null;
    } catch {
      return null;
    }
  }

  /**
   * Send one message and wait for the terminal reply.
   *
   * `idleMs` is a silence timeout, not a total one: 38 MB over a slow phone
   * connection is minutes of legitimate work, but a worker that stops talking
   * for half a minute is gone.
   */
  function ask(target, message, { onProgress, idleMs = 30000 } = {}) {
    return new Promise((resolve) => {
      let timer = null;
      const channel = new MessageChannel();
      const finish = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), idleMs);
      };
      channel.port1.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
          arm();
          onProgress?.(data);
          return;
        }
        if (data.type === 'done') {
          finish({ ok: true, cached: data.cached, failed: data.failed, total: data.total });
          return;
        }
        if (data.type === 'status') {
          finish({ ok: true, cached: data.cached, total: data.total });
        }
      };
      arm();
      try {
        target.postMessage(message, [channel.port2]);
      } catch {
        finish({ ok: false, reason: 'error' });
      }
    });
  }

  return {
    supported,
    /** `{ ok, cached, total, bytes }` — how much of the build is already local. */
    async status() {
      const manifest = await ManifestLoader({ fetchImpl });
      if (!manifest) return { ok: false, reason: 'no-manifest' };
      const target = await worker();
      if (!target) return { ok: false, reason: 'no-worker', total: manifest.count };
      const result = await ask(target, { type: 'status', urls: manifest.files }, { idleMs });
      return { ...result, bytes: manifest.bytes };
    },
    /** Cache whatever is missing. `onProgress({ cached, failed, total })`. */
    async warm({ onProgress } = {}) {
      const manifest = await ManifestLoader({ fetchImpl });
      if (!manifest) return { ok: false, reason: 'no-manifest' };
      const target = await worker();
      if (!target) return { ok: false, reason: 'no-worker', total: manifest.count };
      onProgress?.({ cached: 0, failed: 0, total: manifest.count });
      const result = await ask(target, { type: 'warm', urls: manifest.files }, { onProgress, idleMs });
      return { ...result, bytes: manifest.bytes, total: result.total ?? manifest.count };
    },
  };
}

/**
 * Paint the menu's "save for offline" key.
 *
 * Four states, one button: unsupported (hidden), cold (plain key), warming
 * (percentage on the key), ready (gold). A click only ever *adds* work, so the
 * button is safe to press twice.
 */
export function bindOfflineButton(button, vault, { onState } = {}) {
  if (!button || !vault) return () => {};
  const badge = button.querySelector('[data-badge]') || null;
  let busy = false;

  const paint = (state, detail = {}) => {
    const ready = state === 'ready';
    button.classList.toggle('hidden', !vault.supported);
    button.classList.toggle('is-busy', state === 'warming');
    button.classList.toggle('is-ready', ready);
    button.disabled = busy || ready;
    if (badge) badge.textContent = ready ? 'OK' : detail.percent != null ? `${detail.percent}%` : '';
    const label = ready
      ? 'Playable offline — every level is saved on this device'
      : state === 'warming'
        ? `Saving for offline… ${detail.percent ?? 0}%`
        : 'Save every level on this device for offline play';
    button.title = label;
    button.setAttribute('aria-label', label);
    onState?.(state, detail);
  };

  paint('cold');

  const click = async () => {
    if (busy) return;
    busy = true;
    paint('warming', { percent: 0 });
    const result = await vault.warm({
      onProgress: ({ cached, total }) => {
        const percent = total ? Math.min(99, Math.round((cached / total) * 100)) : 0;
        paint('warming', { percent });
      },
    });
    busy = false;
    if (result.ok && result.failed === 0 && result.cached >= result.total) paint('ready');
    else paint('cold', { percent: result.ok ? 100 : 0 });
  };

  button.addEventListener('click', click);

  // Reflect what is already on the device, so a second visit says "ready"
  // without downloading every file again.
  vault.status().then((result) => {
    if (!result.ok || !result.total) return;
    if (result.cached >= result.total) paint('ready');
    else if (result.cached > 0) paint('cold', { percent: Math.round((result.cached / result.total) * 100) });
  });

  return () => button.removeEventListener('click', click);
}
