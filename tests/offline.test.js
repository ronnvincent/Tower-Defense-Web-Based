// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  SW_PATH,
  bindInstallButton,
  createInstallPrompt,
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
function fakeNav({ register } = {}) {
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
    expect(serviceWorkerSupported(fakeNav(), true)).toBe(true);
    expect(serviceWorkerSupported(fakeNav(), false)).toBe(false);
    expect(serviceWorkerSupported({}, true)).toBe(false);
    expect(serviceWorkerSupported(null, true)).toBe(false);
  });

  it('registers nothing in a dev build', async () => {
    const nav = fakeNav();
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: false } });
    expect(result).toEqual({ ok: false, reason: 'dev' });
    expect(nav.calls).toHaveLength(0);
  });

  it('registers the shell at the app scope in a production build', async () => {
    const nav = fakeNav();
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: true } });
    expect(result.ok).toBe(true);
    expect(nav.calls).toHaveLength(1);
    expect(nav.calls[0].path).toBe(SW_PATH);
    expect(nav.calls[0].options.scope).toBe('./');
  });

  it('turns a refused registration into a result, not an exception', async () => {
    const nav = fakeNav({ register: async () => { throw new Error('blocked by policy'); } });
    const result = await registerServiceWorker({ nav, secure: true, env: { PROD: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('skips an insecure origin rather than asking for a worker it cannot have', async () => {
    const nav = fakeNav();
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
