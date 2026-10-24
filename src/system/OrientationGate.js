/**
 * OrientationGate — watches the device orientation and decides when gameplay
 * must be blocked.
 *
 * It only *decides*; the DOM and the pause/resume side effects are handled by
 * the caller (`DisplayGateUI` and `main.js`). That split keeps this class
 * testable with a fake window and no Phaser.
 *
 * Events watched (all of them, because no single one is reliable across
 * browsers and Android/iOS both fire a different subset):
 *   - window resize              (every rotation, plus desktop windows)
 *   - window orientationchange   (legacy iOS)
 *   - screen.orientation change  (modern Android/iOS 16.4+)
 *   - matchMedia orientation     (Safari 5+, also fires in the iframe preview)
 *   - visibilitychange           (returning from the app switcher can change it)
 *
 * Updates are debounced because a rotation fires a burst of resize events
 * while the viewport animates, and flapping the gate mid-rotation would pause
 * and resume the game several times.
 */
import { detectOrientation, isHandheldDevice, resolveGateMode } from './displayMode.js';

const DEFAULT_DEBOUNCE = 120;

export class OrientationGate {
  /**
   * @param {object} [options]
   * @param {Window} [options.win]
   * @param {Document} [options.doc]
   * @param {boolean} [options.handheld] force handheld detection (tests)
   * @param {() => ({width:number, height:number, type?:string})} [options.getViewport]
   * @param {{supported:boolean, active:boolean}} [options.fullscreen]
   * @param {(state:object, previous:object|null) => void} [options.onChange]
   * @param {number} [options.debounceMs]
   */
  constructor({
    win = globalThis.window,
    doc = globalThis.document,
    handheld,
    getViewport,
    fullscreen = null,
    onChange,
    debounceMs = DEFAULT_DEBOUNCE,
  } = {}) {
    this.win = win || null;
    this.doc = doc || null;
    this.fullscreen = fullscreen;
    this.debounceMs = debounceMs;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};

    this.handheld = typeof handheld === 'boolean' ? handheld : this.#detectHandheld();
    this.getViewport = getViewport || (() => this.#readViewport());

    this.skipFullscreenPrompt = false;
    this.state = null;
    this._started = false;
    this._timer = null;
    this._mediaQuery = null;
    this._screenOrientation = null;

    this._schedule = () => this.schedule();
    this._onVisibility = () => {
      if (!this.doc || this.doc.visibilityState !== 'hidden') this.schedule();
    };
  }

  /** Begin listening for orientation changes. */
  start() {
    if (this._started) return this;
    this._started = true;

    this.win?.addEventListener?.('resize', this._schedule, { passive: true });
    this.win?.addEventListener?.('orientationchange', this._schedule, { passive: true });
    this.doc?.addEventListener?.('visibilitychange', this._onVisibility);

    this._screenOrientation = this.win?.screen?.orientation || null;
    try {
      this._screenOrientation?.addEventListener?.('change', this._schedule);
    } catch {
      // Older Safari exposes screen.orientation without events.
    }

    try {
      this._mediaQuery = this.win?.matchMedia?.('(orientation: portrait)') || null;
      if (this._mediaQuery) {
        if (typeof this._mediaQuery.addEventListener === 'function') {
          this._mediaQuery.addEventListener('change', this._schedule);
        } else if (typeof this._mediaQuery.addListener === 'function') {
          this._mediaQuery.addListener(this._schedule);
        }
      }
    } catch {
      this._mediaQuery = null;
    }

    this.refresh();
    return this;
  }

  /** Stop listening and cancel a pending refresh. */
  stop() {
    this._started = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.win?.removeEventListener?.('resize', this._schedule);
    this.win?.removeEventListener?.('orientationchange', this._schedule);
    this.doc?.removeEventListener?.('visibilitychange', this._onVisibility);

    try {
      this._screenOrientation?.removeEventListener?.('change', this._schedule);
    } catch {
      /* no-op */
    }

    if (this._mediaQuery) {
      if (typeof this._mediaQuery.removeEventListener === 'function') {
        this._mediaQuery.removeEventListener('change', this._schedule);
      } else if (typeof this._mediaQuery.removeListener === 'function') {
        this._mediaQuery.removeListener(this._schedule);
      }
    }
    this._mediaQuery = null;
    this._screenOrientation = null;
    return this;
  }

  /** Debounced refresh (safe to call on every resize event). */
  schedule() {
    if (this._timer) clearTimeout(this._timer);
    if (this.debounceMs <= 0) {
      this.refresh();
      return;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this.refresh();
    }, this.debounceMs);
  }

  /**
   * Recompute the state and notify the listener when the gate mode changed.
   * @returns {object} the current state
   */
  refresh() {
    const viewport = this.getViewport() || {};
    const orientation = detectOrientation(viewport);
    const fullscreenSupported = Boolean(this.fullscreen?.supported);
    const fullscreenActive = Boolean(this.fullscreen?.active);

    // A new portrait phase re-arms the fullscreen prompt: the player should be
    // asked to go fullscreen again after rotating back, even if they once
    // chose "play without fullscreen".
    if (orientation === 'portrait') this.skipFullscreenPrompt = false;

    const mode = resolveGateMode({
      handheld: this.handheld,
      orientation,
      fullscreenSupported,
      fullscreenActive,
      skipFullscreenPrompt: this.skipFullscreenPrompt,
    });

    const next = {
      handheld: this.handheld,
      orientation,
      mode,
      fullscreenSupported,
      fullscreenActive,
      skipFullscreenPrompt: this.skipFullscreenPrompt,
      viewport: { width: Number(viewport.width) || 0, height: Number(viewport.height) || 0 },
    };

    const previous = this.state;
    this.state = next;

    const changed =
      !previous ||
      previous.mode !== next.mode ||
      previous.orientation !== next.orientation ||
      previous.fullscreenActive !== next.fullscreenActive;

    if (changed) {
      try {
        this.onChange(next, previous);
      } catch (error) {
        console.error('[OrientationGate] onChange handler failed', error);
      }
    }
    return next;
  }

  /** Player dismissed the "enter fullscreen" prompt for this landscape phase. */
  skipFullscreen() {
    this.skipFullscreenPrompt = true;
    return this.refresh();
  }

  /**
   * The player deliberately left fullscreen (Esc / system gesture). Do not
   * immediately re-open the prompt — that would trap them in a loop. The next
   * rotation into landscape re-arms it.
   */
  noteFullscreenExit() {
    this.skipFullscreenPrompt = true;
    return this.refresh();
  }

  /** Force a re-evaluation of the device class (e.g. after a UA change). */
  setHandheld(handheld) {
    this.handheld = Boolean(handheld);
    return this.refresh();
  }

  #readViewport() {
    const width = this.win?.innerWidth ?? this.doc?.documentElement?.clientWidth ?? 0;
    const height = this.win?.innerHeight ?? this.doc?.documentElement?.clientHeight ?? 0;
    const type = this.win?.screen?.orientation?.type || '';
    return { width, height, type };
  }

  #detectHandheld() {
    let coarsePointer = false;
    let hoverNone = false;
    try {
      coarsePointer = Boolean(this.win?.matchMedia?.('(pointer: coarse)')?.matches);
      hoverNone = Boolean(this.win?.matchMedia?.('(hover: none)')?.matches);
    } catch {
      /* matchMedia unavailable */
    }
    const nav = this.win?.navigator || globalThis.navigator;
    return isHandheldDevice({
      userAgent: nav?.userAgent,
      maxTouchPoints: nav?.maxTouchPoints,
      coarsePointer,
      hoverNone,
    });
  }
}
