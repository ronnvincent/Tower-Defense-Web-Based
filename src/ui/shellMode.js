/**
 * shellMode.js — which HUD shell is this device getting?
 *
 * The game shipped one HUD that shrank at breakpoints: the same top bar, the
 * same floating inspector, the same seven-card forge. On a 390 px-tall phone
 * in landscape that is not a scaled-down desktop HUD, it is a HUD that still
 * spends its budget the desktop way — a 56 px engraved bar at the top, a
 * 150 px card dock at the bottom, and a draggable panel parked over the lane.
 * Forty percent of the battlefield goes to furniture.
 *
 * The two shells are therefore different layouts, not two sizes of the same
 * one (see the "MOBILE COMMAND SHELL" section of `src/style.css`):
 *
 *   desktop — three bands. Labelled top bar, open forge dock with cards,
 *             floating inspector anchored to the tower, camera pill.
 *
 *   mobile  — corners only. A 44 px status rail at the top, one BUILD button in
 *             the bottom-left thumb zone, powers up the left edge, the forge as
 *             a full-width sheet that folds itself the moment you pick a card,
 *             the inspector as a bottom sheet, and the middle of the screen
 *             left empty for the lane.
 *
 * Detection is deliberately blunt: a coarse pointer on a landscape screen up to
 * 1100 CSS px. A desktop with a touchscreen stays on the desktop shell because
 * its pointer is fine; a phablet in portrait is left to the rotate gate, which
 * is the screen that owns that case. `?hud=mobile` / `?hud=desktop` overrides
 * the guess, which is how the mobile shell is checked on a desktop browser.
 */

/** Attribute written on `<html>`; every mobile rule in the stylesheet hangs off it. */
export const SHELL_ATTR = 'data-shell';

/** Above this width even a touch screen has room for the desktop bands. */
export const MOBILE_SHELL_MAX_WIDTH = 1100;

/** localStorage key for a manual override chosen from the pause card. */
export const SHELL_PREF_KEY = 'td-dsalgo:shell:v1';

/**
 * @param {{coarse?: boolean, width?: number, height?: number, override?: string|null}} input
 * @returns {'mobile'|'desktop'}
 */
export function resolveShell({ coarse = false, width = 0, height = 0, override = null } = {}) {
  if (override === 'mobile' || override === 'desktop') return override;
  // No touch: the desktop shell, even on a narrow window. A resized browser is
  // a pointer, not a thumb.
  if (!coarse) return 'desktop';
  // Portrait is the rotate gate's job; it must look the same on both shells.
  if (!(Number(width) > Number(height))) return 'desktop';
  return Number(width) <= MOBILE_SHELL_MAX_WIDTH ? 'mobile' : 'desktop';
}

/**
 * `?hud=mobile` / `?hud=desktop` on the URL. Read once per resolution so the
 * user can hand a link to a reviewer and get the other layout.
 *
 * @param {string} [search] `location.search`
 * @returns {'mobile'|'desktop'|null}
 */
export function readShellOverride(search = '') {
  const match = /[?&]hud=(mobile|desktop)\b/.exec(String(search || ''));
  return match ? match[1] : null;
}

/**
 * Persisted choice from the pause card.
 *
 * `auto` is the default and means "use the pointer heuristic"; the two explicit
 * values exist for players on a 2-in-1 who want the corner layout on a screen
 * the heuristic calls a desktop, and for reviewers.
 *
 * @param {{getItem?: Function}|null} storage
 * @returns {'auto'|'mobile'|'desktop'}
 */
export function readShellPref(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem?.(SHELL_PREF_KEY);
    return value === 'mobile' || value === 'desktop' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * @param {'auto'|'mobile'|'desktop'} value
 * @param {{setItem?: Function}|null} storage
 * @returns {'auto'|'mobile'|'desktop'}
 */
export function writeShellPref(value, storage = globalThis.localStorage) {
  const next = value === 'mobile' || value === 'desktop' ? value : 'auto';
  try {
    storage?.setItem?.(SHELL_PREF_KEY, next);
  } catch {
    /* private mode: the choice does not survive the reload, which is fine */
  }
  return next;
}

/**
 * Publish the shell on the document root. CSS keys off it; nothing else has to
 * know which layout is live.
 *
 * @param {Document} doc
 * @param {'mobile'|'desktop'} shell
 */
export function applyShell(doc, shell) {
  doc?.documentElement?.setAttribute(SHELL_ATTR, shell);
  return shell;
}
