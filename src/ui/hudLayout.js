/**
 * hudLayout.js — keep the floating HUD clear of the panels it is not part of.
 *
 * The dock and the top bar are sized by their *content* (seven build cards, a
 * wrapping wave button, a placement hint that comes and goes), so no static
 * `bottom: 150px` guess can promise that the camera cluster, the camera hint or
 * the toast never overlap them. On a phone in landscape those guesses were off
 * by 30–60 px, which is exactly the "the zoom pill sits on my dock" bug.
 *
 * Instead of guessing, measure: a ResizeObserver mirrors the real rectangles
 * into two custom properties on `<html>` —
 *
 *   --dock-clearance    distance from the bottom of the screen to the dock top
 *   --topbar-clearance  distance from the top of the screen to the top bar
 *
 * and the CSS that used to hard-code those numbers reads the variables. Because
 * the dock is bottom-anchored, showing the placement hint grows it upwards, the
 * observer fires, and everything stacked above it moves up on the next frame.
 */

/** Breathing room between a floating HUD element and the panel below it. */
export const HUD_GAP_PX = 10;

/** Media queries may seed these before the first measurement. */
export const DOCK_CLEARANCE_VAR = '--dock-clearance';
export const TOPBAR_CLEARANCE_VAR = '--topbar-clearance';

/**
 * Distance from the bottom of the viewport to the top edge of a bottom-anchored
 * panel, plus `gap` pixels of breathing room.
 *
 * @param {{ top: number, height?: number }|null|undefined} rect
 * @param {number} viewportHeight
 * @param {number} [gap]
 * @returns {number|null} null when the panel is missing or not laid out yet.
 */
export function dockClearance(rect, viewportHeight, gap = HUD_GAP_PX) {
  if (!rect || !Number.isFinite(viewportHeight)) return null;
  // jsdom and a display:none dock both report an empty box; keep the CSS seed.
  if (!Number.isFinite(rect.height) || rect.height <= 0) return null;
  if (!Number.isFinite(rect.top)) return null;
  return Math.max(0, Math.round(viewportHeight - rect.top + gap));
}

/**
 * Distance from the top of the viewport to the bottom edge of a top-anchored
 * panel, plus `gap` pixels.
 *
 * @param {{ bottom: number, height?: number }|null|undefined} rect
 * @param {number} [gap]
 * @returns {number|null}
 */
export function topClearance(rect, gap = HUD_GAP_PX) {
  if (!rect || !Number.isFinite(rect.bottom)) return null;
  if (!Number.isFinite(rect.height) || rect.height <= 0) return null;
  return Math.max(0, Math.round(rect.bottom + gap));
}

/**
 * Owns the measurements and the observers that keep them fresh.
 */
export class HudLayout {
  /**
   * @param {{ doc?: Document, win?: Window }} [env]
   */
  constructor({ doc = document, win = window } = {}) {
    this.doc = doc;
    this.win = win;
    this.observer = null;
    this.onResize = null;
    this.onVisualViewport = null;
    this.frame = null;
  }

  /** Event fired on <window> after every re-measure that changed a value. */
  static get EVENT() {
    return 'hud-layout-change';
  }

  /** Measure now and publish the custom properties. */
  sync() {
    const root = this.doc?.documentElement;
    if (!root) return;
    const viewportHeight = this.win?.innerHeight || root.clientHeight || 0;

    let changed = false;
    const dock = this.doc.getElementById('hud-bottom-dock');
    const dockPx = dockClearance(dock?.getBoundingClientRect?.(), viewportHeight);
    if (dockPx != null) {
      if (root.style.getPropertyValue(DOCK_CLEARANCE_VAR) !== `${dockPx}px`) changed = true;
      root.style.setProperty(DOCK_CLEARANCE_VAR, `${dockPx}px`);
    }

    // The run rail hangs below the top bar but is not part of its box, so it
    // has to be measured too — otherwise a toast lands across a mode's chips.
    const topbar = this.doc.getElementById('hud-top-bar');
    let topPx = topClearance(topbar?.getBoundingClientRect?.());
    const rail = this.doc.getElementById('run-strip');
    if (rail && rail.offsetParent !== null) {
      const railPx = topClearance(rail.getBoundingClientRect?.());
      if (railPx != null) topPx = Math.max(topPx ?? 0, railPx);
    }
    if (topPx != null) {
      if (root.style.getPropertyValue(TOPBAR_CLEARANCE_VAR) !== `${topPx}px`) changed = true;
      root.style.setProperty(TOPBAR_CLEARANCE_VAR, `${topPx}px`);
    }
    // The battlefield camera frames itself inside the band these two numbers
    // describe, so a folded dock has to tell it to re-fit.
    if (changed) this.win?.dispatchEvent?.(new (this.win.Event || Event)(HudLayout.EVENT));
  }

  /** Coalesce bursts of resize events into one measurement per frame. */
  schedule() {
    if (this.frame != null) return;
    const raf = this.win?.requestAnimationFrame;
    if (typeof raf !== 'function') {
      this.sync();
      return;
    }
    this.frame = raf.call(this.win, () => {
      this.frame = null;
      this.sync();
    });
  }

  /**
   * Watch the panels (content changes) and the viewport (rotation, browser
   * chrome collapsing, entering fullscreen).
   */
  observe() {
    this.sync();

    const ResizeObserverImpl = this.win?.ResizeObserver;
    if (typeof ResizeObserverImpl === 'function') {
      this.observer = new ResizeObserverImpl(() => this.schedule());
      for (const id of ['hud-bottom-dock', 'hud-top-bar']) {
        const el = this.doc.getElementById(id);
        if (el) this.observer.observe(el);
      }
    }

    this.onResize = () => this.schedule();
    this.win?.addEventListener?.('resize', this.onResize);
    this.win?.addEventListener?.('orientationchange', this.onResize);

    if (this.win?.visualViewport) {
      this.onVisualViewport = () => this.schedule();
      this.win.visualViewport.addEventListener('resize', this.onVisualViewport);
    }

    // Web fonts land after first paint and can change the dock height.
    this.doc?.fonts?.ready?.then?.(() => this.schedule()).catch?.(() => {});
    return this;
  }

  /** Detach every observer/listener. */
  disconnect() {
    this.observer?.disconnect?.();
    this.observer = null;
    if (this.onResize) {
      this.win?.removeEventListener?.('resize', this.onResize);
      this.win?.removeEventListener?.('orientationchange', this.onResize);
      this.onResize = null;
    }
    if (this.onVisualViewport) {
      this.win.visualViewport.removeEventListener('resize', this.onVisualViewport);
      this.onVisualViewport = null;
    }
    this.frame = null;
  }
}
