/**
 * DisplayGateUI — renders the two blocking screens that guard the game:
 *
 *   #rotate-hint      handheld device held in portrait
 *   #fullscreen-gate  handheld device in landscape, waiting for the tap that
 *                     is allowed to trigger native fullscreen
 *
 * Keeping the DOM out of `OrientationGate` means the gate logic stays testable
 * and this file stays a dumb view. Both screens are `position: fixed` children
 * of <body>, so they cover the entire screen even though the game stage itself
 * is letterboxed to 5:3.
 */
import { GATE_MODE } from '../system/displayMode.js';

export class DisplayGateUI {
  /**
   * @param {object} [options]
   * @param {Document} [options.doc]
   * @param {() => void} [options.onEnterFullscreen]
   * @param {() => void} [options.onSkipFullscreen]
   */
  constructor({ doc = globalThis.document, onEnterFullscreen, onSkipFullscreen } = {}) {
    this.doc = doc || null;
    this.onEnterFullscreen = onEnterFullscreen || (() => {});
    this.onSkipFullscreen = onSkipFullscreen || (() => {});
    this.mode = null;

    this.rotateEl = this.doc?.getElementById('rotate-hint') || null;
    this.fullscreenEl = this.doc?.getElementById('fullscreen-gate') || null;

    this._enterBtn = this.doc?.getElementById('btn-enter-fullscreen') || null;
    this._skipBtn = this.doc?.getElementById('btn-skip-fullscreen') || null;

    this._onEnter = (event) => {
      event?.preventDefault?.();
      this.onEnterFullscreen();
    };
    this._onSkip = (event) => {
      event?.preventDefault?.();
      this.onSkipFullscreen();
    };

    this._enterBtn?.addEventListener('click', this._onEnter);
    this._skipBtn?.addEventListener('click', this._onSkip);

    this.apply({ mode: GATE_MODE.NONE, orientation: 'landscape', handheld: false });
  }

  destroy() {
    this._enterBtn?.removeEventListener('click', this._onEnter);
    this._skipBtn?.removeEventListener('click', this._onSkip);
  }

  /**
   * Apply a gate state to the DOM.
   * @param {{mode:string, orientation?:string, handheld?:boolean}} state
   */
  apply(state = {}) {
    const mode = state.mode || GATE_MODE.NONE;
    const previous = this.mode;
    this.mode = mode;

    this.#setVisible(this.rotateEl, mode === GATE_MODE.ROTATE);
    this.#setVisible(this.fullscreenEl, mode === GATE_MODE.FULLSCREEN);

    const body = this.doc?.body;
    if (body) {
      body.classList.toggle('gate-portrait', mode === GATE_MODE.ROTATE);
      body.classList.toggle('gate-fullscreen', mode === GATE_MODE.FULLSCREEN);
      body.classList.toggle('gameplay-blocked', mode !== GATE_MODE.NONE);
      if (state.orientation) body.dataset.orientation = state.orientation;
    }

    // Move focus to the actionable gate when it opens so keyboard/switch users
    // are not left tabbing through a paused battlefield.
    if (mode !== previous) {
      if (mode === GATE_MODE.FULLSCREEN) this.#focus(this._enterBtn);
      else if (mode === GATE_MODE.ROTATE) this.#focus(this.rotateEl);
    }
  }

  #setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) element.removeAttribute('inert');
    else element.setAttribute('inert', '');
  }

  #focus(element) {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      /* jsdom / old browsers */
    }
  }
}
