import { SPAWN_GATES } from '../config/gameConfig.js';

/**
 * Which portals a wave is allowed to leave from.
 *
 * The board has three mouths, but a wave that uses all of them at once cannot be
 * read: three columns of creeps appear in the same second and the player has to
 * guess which push matters. The rule here keeps the fight legible:
 *
 *   • the opening waves walk **one** road, and the next wave takes the next one,
 *     so the beacon, the toast and the marching horde all agree;
 *   • past the halfway mark a wave may split over two roads;
 *   • only at the end of a stage (or deep into an endless run) does a wave pour
 *     out of every gate at once.
 *
 * Everything is a pure function of the wave ordinal, the stage length and the
 * board's lane count — never a random draw — so a duel seat, a replay and the
 * server's idea of a wave all produce byte-identical spawns.
 */

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const wholeNumber = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * How far through the stage a wave is: 0 at the first wave, 1 at the last.
 *
 * An endless run has no last wave, so it ramps over `endlessRampWaves` and then
 * stays at 1 — deep waves are allowed the whole board.
 *
 * @param {{waveNumber?:number, totalWaves?:number, endless?:boolean}} wave
 * @returns {number} 0…1
 */
export function waveProgress({ waveNumber = 1, totalWaves = 0, endless = false } = {}) {
  const wave = Math.max(1, wholeNumber(waveNumber, 1));
  const total = wholeNumber(totalWaves, 0);
  const openEnded = endless || !Number.isFinite(totalWaves);
  if (openEnded) return clamp01((wave - 1) / Math.max(1, SPAWN_GATES.endlessRampWaves));
  // A one-wave stage has no ramp to climb: wave 1 is also its last wave, so it
  // keeps the opening rule instead of dividing by zero.
  if (total < 2) return 0;
  return clamp01((wave - 1) / (total - 1));
}

/**
 * How many gates that wave may use.
 *
 * Never more than the board offers, never fewer than one, and never worse than
 * the three-way cap the config declares (a board with five mouths still splits
 * three ways at most — beyond that the spawn is noise, not pressure).
 */
export function gatesInPlay({ waveNumber = 1, totalWaves = 0, endless = false, laneCount = 1 } = {}) {
  const lanes = Math.max(1, wholeNumber(laneCount, 1));
  const cap = Math.max(1, Math.min(lanes, SPAWN_GATES.maxGates));
  const progress = waveProgress({ waveNumber, totalWaves, endless });
  if (progress >= SPAWN_GATES.tripleAt) return cap;
  if (progress >= SPAWN_GATES.doubleAt) return Math.min(cap, 2);
  return 1;
}

/**
 * Which gate the n-th enemy of a wave walks out of.
 *
 * The wave owns a **contiguous block** of gates starting at its own ordinal, and
 * the enemies cycle inside that block only. With `activeGates = gateCount` this
 * is the flat rotation; with one gate it is the old "one wave, one road" rule.
 *
 * @param {number} spawnCounter 0-based index of the enemy within the wave
 * @param {number} waveNumber 1-based wave
 * @param {number} gateCount portals the board offers (0 = no gates)
 * @param {number} [activeGates] how many of them this wave may use
 */
export function gateIndexForSpawn(spawnCounter, waveNumber, gateCount, activeGates = gateCount) {
  const count = Math.max(0, wholeNumber(gateCount, 0));
  if (!count) return 0;
  const wave = Math.max(1, wholeNumber(waveNumber, 1));
  const tick = Math.max(0, wholeNumber(spawnCounter, 0));
  const active = Math.min(count, Math.max(1, wholeNumber(activeGates, count)));
  const base = ((wave - 1) % count + count) % count;
  return (base + (tick % active)) % count;
}

/** The gates a wave uses, in the order its enemies take them. */
export function gateSlotsForWave(waveNumber, gateCount, activeGates = gateCount) {
  const count = Math.max(0, wholeNumber(gateCount, 0));
  if (!count) return [];
  const active = Math.min(count, Math.max(1, wholeNumber(activeGates, count)));
  return Array.from({ length: active }, (_, i) => gateIndexForSpawn(i, waveNumber, count, active));
}

/**
 * The whole plan for one wave, in the shape the scene wants it.
 *
 * @param {{waveNumber:number, totalWaves?:number, endless?:boolean, laneCount:number}} wave
 * @returns {{progress:number, gates:number, slots:number[], primary:number}}
 */
export function waveGatePlan({ waveNumber = 1, totalWaves = 0, endless = false, laneCount = 1 } = {}) {
  const progress = waveProgress({ waveNumber, totalWaves, endless });
  const gates = gatesInPlay({ waveNumber, totalWaves, endless, laneCount });
  const slots = gateSlotsForWave(waveNumber, laneCount, gates);
  return { progress, gates, slots, primary: slots[0] ?? 0 };
}
