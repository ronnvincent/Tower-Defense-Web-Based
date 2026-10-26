/**
 * Difficulty.js — the three campaign presets.
 *
 * A preset changes two numbers and nothing else: how much health a creep is
 * born with, and how hard it hits the core and the palisades. Gold is
 * deliberately untouched — the specification is explicit that a harder run is
 * not a poorer run, and paying the player less would only make the early waves
 * a slog instead of a test.
 *
 * The choice is read at stage start and frozen for that attempt, so a restart
 * or a replay cannot stack multipliers, and it is stored next to the rest of the
 * settings so the next launch remembers it.
 */

import { readJSON, writeJSON } from '../utils/storage.js';

/** "1", "1.25", "1.5" — no trailing zeroes, no locale surprises. */
const trim = (value) => String(Math.round(value * 100) / 100);

export const DIFFICULTY_KEY = 'td-dsalgo:difficulty:v1';

/** Presets, in UI order. Multipliers are applied once, at spawn time. */
export const DIFFICULTIES = Object.freeze([
  {
    id: 'normal',
    name: 'Normal',
    healthScale: 1,
    damageScale: 1,
    blurb: 'The campaign as designed. Enemy health and damage are untouched.',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    healthScale: 1.25,
    damageScale: 1.15,
    blurb: 'Creeps bring a quarter more health and hit harder. Rewards are unchanged.',
  },
  {
    id: 'nightmare',
    name: 'Nightmare',
    healthScale: 1.5,
    damageScale: 1.3,
    blurb: 'Half again the health and a third more damage. For a finished tower line.',
  },
]);

export const DEFAULT_DIFFICULTY = 'normal';

/** Look a preset up by id, falling back to Normal for anything unknown. */
export function difficultyFor(id) {
  return DIFFICULTIES.find((preset) => preset.id === id) || DIFFICULTIES[0];
}

/** One-line readout for the briefing card, e.g. "Health ×1.25 · Damage ×1.15". */
export function difficultyMultiplierLabel(id) {
  const preset = difficultyFor(id);
  return `Health ×${trim(preset.healthScale)} · Damage ×${trim(preset.damageScale)}`;
}

/** Compact form for tight rows, e.g. "×1.25 HP · ×1.15 DMG". */
export function difficultyShortLabel(id) {
  const preset = difficultyFor(id);
  return `×${trim(preset.healthScale)} HP · ×${trim(preset.damageScale)} DMG`;
}

/**
 * Stored choice. Invalid or corrupted values fall back to Normal instead of
 * throwing, because a bad save must never block the campaign.
 */
export class DifficultyStore {
  constructor({ storage = globalThis.localStorage, key = DIFFICULTY_KEY } = {}) {
    this.storage = storage;
    this.key = key;
    const record = readJSON(this.storage, key);
    const saved = record?.value?.id ?? record?.id;
    this.id = DIFFICULTIES.some((preset) => preset.id === saved) ? saved : DEFAULT_DIFFICULTY;
  }

  get preset() {
    return difficultyFor(this.id);
  }

  /** Persist a new preset. Returns the preset that is now in force. */
  set(id) {
    const preset = difficultyFor(id);
    this.id = preset.id;
    writeJSON(this.storage, this.key, { id: preset.id });
    return preset;
  }
}
