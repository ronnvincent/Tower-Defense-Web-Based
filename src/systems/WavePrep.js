/**
 * WavePrep — the clock that opens the next wave by itself.
 *
 * Campaign and endless battles are a rhythm, not a menu: the player gets a
 * fixed window between waves to spend gold and place keeps, and the horde
 * marches again when it runs out. This module owns that window as plain data so
 * the rules are testable without a Phaser scene:
 *
 *   · one window at a time — arming replaces, it never stacks;
 *   · the first window (before wave 1) is longer than the between-wave one;
 *   · a window that reaches zero opens exactly once (`open` is returned once,
 *     then the clock is inert until it is armed again);
 *   · a window that can no longer be used (final wave cleared, match over,
 *     defeat) is cancelled rather than left ticking in the background.
 *
 * Duels and Time Attack do not use it: the arena and the run clock already own
 * their own cadence, and two clocks opening the same wave is a bug.
 */
import { WAVE_PREP } from '../config/gameConfig.js';

export const PREP_PHASE = {
  OFF: 'off',
  FIRST: 'first',
  BETWEEN: 'between',
};

const toMs = (value, fallback, floor) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(floor, Math.round(n));
};

/**
 * The two windows a level runs on, in ms.
 *
 * A level may override either one (`level.wavePrep = { firstMs, betweenMs }`),
 * which is how a boss stage can hand out a longer breather than the tutorial.
 * Values below the floor are clamped instead of rejected: a typo in level data
 * must not turn the battle into a four-second conveyor belt.
 */
export function resolvePrepWindows(level = {}) {
  const custom = level?.wavePrep || {};
  return {
    firstMs: toMs(custom.firstMs, WAVE_PREP.firstMs, WAVE_PREP.minMs),
    betweenMs: toMs(custom.betweenMs, WAVE_PREP.betweenMs, WAVE_PREP.minMs),
  };
}

/**
 * A fresh clock for one battle.
 *
 * @param {object} level level definition (may carry `wavePrep`)
 * @param {{autoStart?: boolean}} [options] `autoStart:false` starts inert —
 *        used by the modes whose pacing is owned elsewhere.
 */
export function createWavePrep(level = {}, { autoStart = true } = {}) {
  const windows = resolvePrepWindows(level);
  const active = Boolean(autoStart);
  return {
    ...windows,
    active,
    phase: active ? PREP_PHASE.FIRST : PREP_PHASE.OFF,
    remainingMs: active ? windows.firstMs : 0,
    opened: 0,
  };
}

/** Start (or restart) the window for the next wave. */
export function armWavePrep(prep, phase = PREP_PHASE.BETWEEN) {
  if (!prep) return null;
  prep.phase = phase === PREP_PHASE.FIRST ? PREP_PHASE.FIRST : PREP_PHASE.BETWEEN;
  prep.remainingMs = prep.phase === PREP_PHASE.FIRST ? prep.firstMs : prep.betweenMs;
  prep.active = true;
  return prep;
}

/** Stop the clock — the player started the wave, or the battle ended. */
export function cancelWavePrep(prep) {
  if (!prep) return null;
  prep.active = false;
  prep.phase = PREP_PHASE.OFF;
  prep.remainingMs = 0;
  return prep;
}

/**
 * Advance the clock by one simulation step.
 *
 * @param {object} prep
 * @param {number} deltaMs simulation milliseconds
 * @param {{canStart?: boolean, over?: boolean}} state
 * @returns {{open: boolean, remainingMs: number}}
 */
export function advanceWavePrep(prep, deltaMs, { canStart = false, over = false } = {}) {
  if (!prep || !prep.active) return { open: false, remainingMs: 0 };
  if (over) {
    cancelWavePrep(prep);
    return { open: false, remainingMs: 0 };
  }
  // The next wave already started (or this was the final one): nothing to open.
  if (!canStart) {
    cancelWavePrep(prep);
    return { open: false, remainingMs: 0 };
  }
  const dt = Math.max(0, Number(deltaMs) || 0);
  prep.remainingMs = Math.max(0, prep.remainingMs - dt);
  if (prep.remainingMs > 0) return { open: false, remainingMs: prep.remainingMs };
  cancelWavePrep(prep);
  prep.opened += 1;
  return { open: true, remainingMs: 0 };
}

/** `12` → `0:12`, `75` → `1:15` seconds. */
export function formatPrepClock(remainingMs) {
  const total = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The word on the wave button while the clock runs.
 *
 * The button stays a real control: tapping it calls the wave in early, exactly
 * as a manual start always did. The label only says what will happen if the
 * player does nothing.
 */
export function prepLabel(remainingMs, phase = PREP_PHASE.BETWEEN) {
  const clock = formatPrepClock(remainingMs);
  return phase === PREP_PHASE.FIRST ? `WAVE 1 IN ${clock}` : `NEXT WAVE IN ${clock}`;
}
