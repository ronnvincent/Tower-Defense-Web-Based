/**
 * UX settings — the three switches that are not about the mixer.
 *
 * Screen shake, floating damage numbers and the colour-vision palette all live
 * in the same record as the faders (`td-dsalgo:settings:v1`), because that is
 * the settings record this game already has and a second key would give the
 * player two places to look for one answer:
 *
 *     {
 *       muted: false,
 *       volumes: { master, music, sfx, ambient },
 *       ux: { shake, damageNumbers, colourAssist }
 *     }
 *
 * The mixer writes `muted` and `volumes`, this module writes `ux`, and both
 * merge into whatever the record already holds — neither may swallow the other's
 * fields. `AudioSynth#persist()` spreads the existing record for the same
 * reason.
 *
 * The values are read by the places that draw, not by the simulation:
 * `GameScene` asks before it shakes the camera, `Projectile` before it spawns a
 * number. Nothing here can change damage, timing or balance.
 */

import { STORAGE_KEYS } from './gameConfig.js';
import { readJSON, writeJSON, getDefaultStorage } from '../utils/storage.js';

/** The three switches, with the meaning of the safe default. */
export const UX_DEFAULTS = Object.freeze({
  shake: true,
  damageNumbers: true,
  colourAssist: false,
});

/** Every switch key, in panel order. */
export const UX_KEYS = Object.freeze(Object.keys(UX_DEFAULTS));

/** Coerce a saved (or hand-edited) record into three booleans. */
export function normalizeUx(raw = {}) {
  const out = { ...UX_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of UX_KEYS) {
    const value = raw[key];
    if (typeof value === 'boolean') out[key] = value;
    // A hand-edited "false"/"0" is still an answer; anything else falls back.
    else if (value === 'false' || value === 0 || value === '0') out[key] = false;
    else if (value === 'true' || value === 1 || value === '1') out[key] = true;
  }
  return out;
}

/** The whole settings record, as the two owners leave it. */
function readRecord(storage) {
  return readJSON(storage, STORAGE_KEYS.settings)?.value ?? {};
}

export class UxSettings {
  /**
   * @param {{ storage?: Storage, root?: { dataset: object, setAttribute?: Function } }} [options]
   */
  constructor({ storage = null, root = null } = {}) {
    this.storage = storage;
    this.root = root;
    this.listeners = new Set();
    this.values = normalizeUx(readRecord(this.#resolveStorage())?.ux);
    this.apply();
  }

  #resolveStorage() {
    if (this.storage) return this.storage;
    try {
      this.storage = getDefaultStorage();
    } catch {
      this.storage = null;
    }
    return this.storage;
  }

  #root() {
    if (this.root) return this.root;
    if (typeof document === 'undefined') return null;
    this.root = document.documentElement;
    return this.root;
  }

  /** Read every switch (a copy — a caller cannot move the panel by mutating it). */
  get all() {
    return { ...this.values };
  }

  /** @param {'shake'|'damageNumbers'|'colourAssist'} key */
  get(key) {
    return Boolean(this.values[key]);
  }

  /**
   * Set one switch, persist it and repaint the document.
   * @returns {{changed:boolean, values:object}}
   */
  set(key, value) {
    if (!UX_KEYS.includes(key)) return { changed: false, values: this.all };
    const next = Boolean(value);
    if (this.values[key] === next) return { changed: false, values: this.all };
    this.values[key] = next;
    this.#persist();
    this.apply();
    for (const listener of this.listeners) {
      try {
        listener(this.all, key);
      } catch {
        // A listener that throws is the listener's problem, not the setting's.
      }
    }
    return { changed: true, values: this.all };
  }

  /** Flip one switch (the panel's switch buttons are buttons, not checkboxes). */
  toggle(key) {
    return this.set(key, !this.get(key));
  }

  /** @param {(values:object, key:string) => void} listener */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Write the switches back into the shared record, keeping the mixer's fields. */
  #persist() {
    const storage = this.#resolveStorage();
    if (!storage) return;
    const record = readRecord(storage);
    writeJSON(storage, STORAGE_KEYS.settings, { ...record, ux: { ...this.values } });
  }

  /**
   * Paint the switches on `<html>` so CSS can answer without a class on every
   * element: `data-ux-shake`, `data-ux-damage`, `data-ux-colour`.
   */
  apply() {
    const root = this.#root();
    if (!root?.dataset) return;
    root.dataset.uxShake = this.values.shake ? 'on' : 'off';
    root.dataset.uxDamage = this.values.damageNumbers ? 'on' : 'off';
    root.dataset.uxColour = this.values.colourAssist ? 'on' : 'off';
  }
}

/** The browser singleton. Read-only until a panel calls `set()`. */
export const uxSettings = new UxSettings();

/** Cheap reader for hot paths (`Projectile.showDamageText`, `GameScene.shakeCamera`). */
export function uxEnabled(key) {
  return uxSettings.get(key);
}
