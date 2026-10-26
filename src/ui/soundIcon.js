/**
 * soundIcon.js — the two glyphs the sound key can show.
 *
 * The menu and the world map each render their own key, and both are repainted
 * by two different functions (`syncSoundButtons()` and `WorldMapUI.syncSound()`).
 * Keeping the paths in one place is the only way those four call sites can be
 * guaranteed to agree — a muted game must never show a speaker with waves.
 *
 * The glyphs come from the same generated kit as every other icon
 * (`scripts/build_ui_kit.py`, `@_mark("sound")` / `@_mark("muted")`), so a sound
 * key and a fullscreen key read as one set instead of two art styles.
 */

export const SOUND_ON = '/assets/ui-kit/glyph_sound.png';
export const SOUND_OFF = '/assets/ui-kit/glyph_muted.png';

/** @param {boolean} muted @returns {string} the src for the sound key */
export function soundIcon(muted) {
  return muted ? SOUND_OFF : SOUND_ON;
}
