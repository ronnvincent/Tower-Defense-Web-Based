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
