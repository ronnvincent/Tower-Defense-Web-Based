/**
 * viewportLock.js — keep the *page* still so the game owns every gesture.
 *
 * The viewport meta tag (`maximum-scale=1, user-scalable=no`) is the first line
 * of defence, but mobile Safari ignores `user-scalable=no` since iOS 10 and
 * Chrome honours a user's "force enable zoom" accessibility setting. When that
 * happens a pinch zooms the *page* instead of the battlefield and the player
 * ends up staring at a magnified corner of the HUD (the "153% + −" widget).
 *
 * This module adds the JavaScript side of the contract:
 *
 *   - Safari's proprietary `gesture*` events (page pinch) are cancelled.
 *   - Two-finger `touchmove` is cancelled. Single-finger moves are left alone
 *     because Phaser needs them for camera panning; cancelling the default
 *     action never stops our own listeners anyway.
 *   - Ctrl/cmd + wheel (trackpad pinch, ctrl+scroll) is cancelled.
 *   - Ctrl/cmd + `+`, `-`, `0` (browser zoom shortcuts) is cancelled unless the
 *     player is typing into a field.
 *
 * Everything is wrapped in a `release()` function so tests (and a future HMR
 * reload) can detach it again.
 */

/** Keys the browser maps to zoom-in / zoom-out / reset. */
export const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);

/**
 * @param {EventTarget|null|undefined} target
 * @returns {boolean} true when the event comes from a text field.
 */
export function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

/**
 * Ctrl/cmd + a zoom key, without any other modifier.
 *
 * AltGr (Ctrl+Alt) is used for characters such as `+` on some European
 * layouts, so `altKey` must disqualify the shortcut.
 *
 * @param {KeyboardEvent|object|null|undefined} event
 */
export function isBrowserZoomShortcut(event) {
  if (!event) return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  if (event.altKey) return false;
  return ZOOM_KEYS.has(event.key);
}

/**
 * Install the page-zoom guards.
 *
 * @param {{ win?: Window, doc?: Document }} [env]
 * @returns {() => void} release() — removes every listener added here.
 */
export function lockViewport(env = {}) {
  const win = env.win ?? (typeof window === 'undefined' ? undefined : window);
  const doc = env.doc ?? (typeof document === 'undefined' ? undefined : document);
  const active = { passive: false };
  const block = (event) => event.preventDefault();

  const onTouchMove = (event) => {
    // One finger = camera pan / tower tap. Two or more = a pinch, which the
    // browser would turn into a page zoom.
    if (event.touches && event.touches.length > 1) event.preventDefault();
  };

  const onWheel = (event) => {
    if (event.ctrlKey) event.preventDefault();
  };

  const onKeyDown = (event) => {
    if (!isBrowserZoomShortcut(event)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  const listeners = [
    [doc, 'gesturestart', block],
    [doc, 'gesturechange', block],
    [doc, 'gestureend', block],
    [doc, 'touchmove', onTouchMove],
    [doc, 'dblclick', block],
    [win, 'wheel', onWheel],
    [win, 'keydown', onKeyDown],
  ];

  for (const [target, type, handler] of listeners) {
    target?.addEventListener?.(type, handler, active);
  }

  return function release() {
    for (const [target, type, handler] of listeners) {
      target?.removeEventListener?.(type, handler, active);
    }
  };
}
