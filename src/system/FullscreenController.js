/**
 * FullscreenController — thin, defensive wrapper around the Fullscreen API.
 *
 * Browser rules that shape this class:
 *  - `requestFullscreen()` only works inside a *user gesture* (click, tap,
 *    keydown). A page cannot go fullscreen on load, so the game arms a
 *    one-shot listener for the first gesture and also calls `request()`
 *    directly from click handlers (`Play`, the ⛶ button, the gate button).
 *  - Inside an iframe without `allow="fullscreen"`, `document.fullscreenEnabled`
 *    is false and calls reject — we detect that up-front and never show a
 *    button that cannot work.
 *  - Leaving fullscreen is a user action too (Esc / system gesture). We never
 *    fight it; we just report the new state.
 *  - Screen Orientation lock only works while fullscreen, and only on some
 *    platforms (Android Chrome). Everything is feature-detected and swallowed.
 */
import { describeFullscreenError, resolveFullscreenApi } from './displayMode.js';

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

export class FullscreenController {
  /**
   * @param {object} [options]
   * @param {Document} [options.doc]
   * @param {Element} [options.root] element that becomes fullscreen (default: <html>)
   * @param {(state: {supported:boolean, active:boolean, element:Element|null}) => void} [options.onChange]
   * @param {Window} [options.win]
   */
  constructor({ doc = globalThis.document, root, win = globalThis.window, onChange } = {}) {
    this.doc = doc || null;
    this.win = win || null;
    this.root = root || this.doc?.documentElement || null;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    this.api = resolveFullscreenApi(this.doc, this.root);
    this.lastError = null;
    this.pending = false;

    this._bound = false;
    this._gestureCleanup = null;
    this._onChangeEvent = () => this.#emit();
    this._onErrorEvent = (event) => {
      this.lastError = event?.error || this.lastError;
      this.#emit();
    };
  }

  /** Is the Fullscreen API available *and* permitted on this page? */
  get supported() {
    return Boolean(this.api && this.api.supported);
  }

  /** Is the document currently fullscreen? */
  get active() {
    return Boolean(this.api && this.api.element());
  }

  /** The element currently filling the screen (null when not fullscreen). */
  get element() {
    return this.api ? this.api.element() : null;
  }

  /** Start listening for state changes. */
  bind() {
    if (this._bound || !this.api || !this.doc) return this;
    this._bound = true;
    this.doc.addEventListener(this.api.vendor.change, this._onChangeEvent);
    this.doc.addEventListener(this.api.vendor.error, this._onErrorEvent);
    return this;
  }

  destroy() {
    if (this._bound && this.api && this.doc) {
      this.doc.removeEventListener(this.api.vendor.change, this._onChangeEvent);
      this.doc.removeEventListener(this.api.vendor.error, this._onErrorEvent);
    }
    this._bound = false;
    this.#disarmGesture();
  }

  /**
   * Enter fullscreen. Must be called from a user-gesture handler to succeed in
   * a normal browser tab; failures are reported, never thrown.
   * @returns {Promise<boolean>} true when the document is (or becomes) fullscreen
   */
  async request() {
    if (!this.supported) return false;
    if (this.active) return true;
    if (this.pending) return false;

    this.pending = true;
    try {
      const result = this.api.request();
      if (result && typeof result.then === 'function') await result;
      else await Promise.resolve();
      this.lastError = null;
      // The promise resolves = the browser accepted the request. The
      // `fullscreenchange` event may still be a frame away, so do not read
      // `this.active` here.
      return true;
    } catch (error) {
      // NotAllowedError (no gesture), TypeError (iframe policy), NotSupportedError.
      this.lastError = error;
      this.#warn('request', error);
      return false;
    } finally {
      this.pending = false;
      this.#emit();
    }
  }

  /** Leave fullscreen. Safe to call when already out. */
  async exit() {
    if (!this.api || !this.active) return false;
    try {
      const result = this.api.exit();
      if (result && typeof result.then === 'function') await result;
    } catch (error) {
      this.lastError = error;
      this.#warn('exit', error);
      return false;
    }
    return true;
  }

  /** @returns {Promise<boolean>} whether the document ended up fullscreen */
  async toggle() {
    if (this.active) {
      await this.exit();
      return false;
    }
    return this.request();
  }

  /**
   * Call `request()` on the next user gesture. This is what makes "launch in
   * fullscreen" possible on desktop: the first click or key press anywhere in
   * the game grants the transient activation the API demands.
   *
   * @param {string[]} [events]
   * @returns {() => void} cancel function
   */
  requestOnFirstGesture(events = GESTURE_EVENTS) {
    if (!this.supported || this.active) return () => {};
    this.#disarmGesture();

    const handler = () => {
      this.#disarmGesture();
      // Fire-and-forget: the caller's UI reacts through onChange.
      void this.request();
    };

    const target = this.win || this.doc;
    const listen = (type, fn, options) => target?.addEventListener?.(type, fn, options);
    const unlisten = (type, fn, options) => target?.removeEventListener?.(type, fn, options);

    for (const type of events) listen(type, handler, { capture: true, once: true, passive: true });

    this._gestureCleanup = () => {
      for (const type of events) unlisten(type, handler, { capture: true });
    };
    return this._gestureCleanup;
  }

  /** Try to lock the screen orientation (Android Chrome, while fullscreen). */
  async lockOrientation(orientation = 'landscape') {
    const screenOrientation = this.win?.screen?.orientation;
    if (!screenOrientation || typeof screenOrientation.lock !== 'function') return false;
    try {
      await screenOrientation.lock(orientation);
      return true;
    } catch {
      // Unsupported (iOS/Firefox), or not fullscreen yet — not an error for us.
      return false;
    }
  }

  /** Release an orientation lock (no-op where unsupported). */
  unlockOrientation() {
    const screenOrientation = this.win?.screen?.orientation;
    if (!screenOrientation || typeof screenOrientation.unlock !== 'function') return false;
    try {
      screenOrientation.unlock();
      return true;
    } catch {
      return false;
    }
  }

  #emit() {
    try {
      this.onChange({
        supported: this.supported,
        active: this.active,
        element: this.element,
        error: this.lastError,
      });
    } catch (error) {
      console.error('[Fullscreen] onChange handler failed', error);
    }
  }

  #warn(action, error) {
    // A blocked request is expected (e.g. a keyboard-less iframe). Log once so
    // it stays diagnosable without spamming the console every frame.
    if (this._lastLogged === `${action}:${error?.name}`) return;
    this._lastLogged = `${action}:${error?.name}`;
    console.info(`[Fullscreen] ${action} unavailable — ${describeFullscreenError(error)}`);
  }

  #disarmGesture() {
    if (this._gestureCleanup) {
      this._gestureCleanup();
      this._gestureCleanup = null;
    }
  }
}
