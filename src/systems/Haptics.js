/**
 * Haptics.js — the half of "juice" a phone can feel.
 *
 * A phone player taps with a thumb that covers the control, so on a 5" screen
 * the visual pressed state is often literally under the finger. A 12 ms tick
 * confirms the tap where the eye cannot. It is used sparingly: one short tick
 * per press, a double tick for something being built, three for a refusal.
 *
 * Android (Chrome, Samsung Internet, Firefox) exposes `navigator.vibrate`.
 * iOS Safari does not — the calls are no-ops there, and every caller must
 * treat the return value as optional.
 *
 * Enabled by default only on coarse pointers, so a desktop mouse never buzzes.
 * The preference is stored so it can be switched off from the pause card.
 */

export const HAPTIC_PREF_KEY = 'td-dsalgo:haptics:v1';

/**
 * Vibrate patterns, in milliseconds. `[10, 24, 18]` means buzz 10, pause 24,
 * buzz 18. Kept short — anything over ~80 ms of total buzz reads as an error
 * dialog, not a button.
 */
export const HAPTIC_PATTERNS = Object.freeze({
  tap: 12,
  build: [10, 22, 18],
  upgrade: [12, 26, 12, 26, 20],
  deny: [34, 42, 34],
  wave: [14, 30, 14],
  boss: [22, 54, 22, 54, 36],
});

/**
 * @param {boolean|undefined} coarsePointer
 * @param {{getItem?: Function}|null} storage
 */
export function readHapticPref(coarsePointer, storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem?.(HAPTIC_PREF_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* fall through to the device default */
  }
  return Boolean(coarsePointer);
}

export class Haptics {
  /**
   * @param {{navigatorRef?: object, storage?: object|null, coarsePointer?: boolean}} [env]
   */
  constructor({ navigatorRef = globalThis.navigator, storage = globalThis.localStorage, coarsePointer } = {}) {
    this.navigator = navigatorRef;
    this.storage = storage;
    const coarse = coarsePointer ?? Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
    this.enabled = readHapticPref(coarse, storage);
  }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try {
      this.storage?.setItem?.(HAPTIC_PREF_KEY, this.enabled ? '1' : '0');
    } catch {
      /* private mode */
    }
    return this.enabled;
  }

  /** True when the platform can actually buzz. */
  get supported() {
    return typeof this.navigator?.vibrate === 'function';
  }

  /**
   * @param {keyof typeof HAPTIC_PATTERNS} kind
   * @returns {boolean} whether a vibration was requested
   */
  tap(kind = 'tap') {
    if (!this.enabled || !this.supported) return false;
    const pattern = HAPTIC_PATTERNS[kind] ?? HAPTIC_PATTERNS.tap;
    try {
      this.navigator.vibrate(pattern);
      return true;
    } catch {
      return false;
    }
  }
}

/** Shared instance used by the HUD. */
export const haptics = new Haptics();
