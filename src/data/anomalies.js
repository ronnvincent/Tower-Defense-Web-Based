/**
 * anomalies.js — the per-wave twists of Anomaly Mode.
 *
 * One card is drawn at the start of every wave and announced with the wave
 * banner, so the player always knows the problem *before* the creeps walk in.
 * The anomaly lasts exactly one wave: the mode stays readable instead of
 * slowly turning into a slot machine.
 *
 * Draws are seeded from the run seed and the wave number, so wave 7 of a seed
 * is the same twist on every device — and a run can be replayed deliberately.
 */

import { mulberry32 } from '../systems/DailyChallenge.js';

/**
 * The pool. `effect` is folded into the run bag for the duration of one wave
 * (`mods`, `add`, `flags`) or paid once (`instant`).
 */
export const ANOMALIES = Object.freeze([
  {
    id: 'fog',
    name: 'FOG BANK',
    icon: '🌫',
    blurb: 'Tower range −20% for this wave.',
    effect: { mods: { range: 0.8, score: 1.1 } },
  },
  {
    id: 'stampede',
    name: 'STAMPEDE',
    icon: '🐎',
    blurb: 'The horde moves 18% faster.',
    effect: { mods: { enemySpeed: 1.18, killGold: 1.1 } },
  },
  {
    id: 'ironclad',
    name: 'IRONCLAD',
    icon: '🛡',
    blurb: 'The horde carries 15% more HP.',
    effect: { mods: { enemyHealth: 1.15, score: 1.15 } },
  },
  {
    id: 'bloodbath',
    name: 'BLOODBATH',
    icon: '🩸',
    blurb: 'Kills pay 40% less gold — towers hit 15% harder.',
    effect: { mods: { killGold: 0.6, damage: 1.15 } },
  },
  {
    id: 'blackout',
    name: 'BLACKOUT',
    icon: '⛔',
    blurb: 'No barricades this wave. Kill gold +20%.',
    effect: { flags: { noBarricades: true }, mods: { killGold: 1.2 } },
  },
  {
    id: 'twin',
    name: 'TWIN TITANS',
    icon: '👑',
    blurb: 'Boss waves send a second titan. Score +20%.',
    effect: { flags: { twinBoss: true }, mods: { score: 1.2 } },
  },
  {
    id: 'drought',
    name: 'DROUGHT',
    icon: '🏜',
    blurb: 'Kills pay 25% less — but +60 gold lands now.',
    effect: { mods: { killGold: 0.75 }, instant: { gold: 60 } },
  },
  {
    id: 'deadzone',
    name: 'DEAD ZONE',
    icon: '🚫',
    blurb: 'No powerups this wave. Towers hit 25% harder.',
    effect: { flags: { noPowerups: true }, mods: { damage: 1.25 } },
  },
  {
    id: 'frenzy',
    name: 'FRENZY',
    icon: '⚡',
    blurb: 'Faster, tougher horde — score +25%.',
    effect: { mods: { enemySpeed: 1.1, enemyHealth: 1.1, score: 1.25 } },
  },
]);

const byId = new Map(ANOMALIES.map((entry) => [entry.id, entry]));

export function getAnomaly(id) {
  return byId.get(id) || null;
}

/**
 * Draw the twist for wave `wave`.
 *
 * @param {number} seed      run seed
 * @param {number} wave      1-based wave number
 * @param {string|null} previous  last wave's anomaly (never repeated back-to-back)
 */
export function rollAnomaly(seed, wave, previous = null) {
  const random = mulberry32((Number(seed) || 1) * 40503 + (Number(wave) || 0) * 7919);
  const pool = ANOMALIES.filter((entry) => entry.id !== previous);
  if (!pool.length) return ANOMALIES[0];
  return pool[Math.floor(random() * pool.length) % pool.length];
}
