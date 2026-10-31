/**
 * DuelPacing.js — the arena's own wave clock.
 *
 * A duel is two boards running side by side, so the wave button is a lie: if
 * one phone could tap "start wave" the two seats would compare a wave 6 board
 * against a wave 2 board, and the rival strip would stop meaning anything. In a
 * duel the arena opens every wave itself:
 *
 *   PREPARE (10 s) → wave 1 → BREATHER (5 s) → wave 2 → … → final wave
 *
 * The prep window is long enough to read the map and place the opening defence;
 * the breather is long enough to spend the gold and patch a leak. Both are
 * *simulation* milliseconds, so pausing the battle pauses the countdown too.
 *
 * Pure: no DOM, no Phaser. `tests/duel-pacing.test.js` drives it directly.
 */

/** How long the gates stay shut so both players can build. */
export const DUEL_PREP_MS = 10_000;
/** How long the arena waits between waves. */
export const DUEL_BREATHER_MS = 5_000;

export const PACING_PHASE = {
  PREP: 'prep',
  BREATHER: 'breather',
  LIVE: 'live',
  DONE: 'done',
};

export function createDuelPacing({ prepMs = DUEL_PREP_MS, breatherMs = DUEL_BREATHER_MS } = {}) {
  return {
    phase: PACING_PHASE.PREP,
    remainingMs: prepMs,
    prepMs,
    breatherMs,
  };
}

/** Whole seconds left, rounded up so the last second reads "1" and not "0". */
export function pacingSeconds(pacing) {
  if (!pacing) return 0;
  return Math.max(0, Math.ceil(pacing.remainingMs / 1000));
}

/**
 * Advance the clock by one simulation step.
 *
 * @param {object} pacing
 * @param {number} deltaMs simulated milliseconds
 * @param {{ waveIdle?: boolean }} [options] `waveIdle` is false while a horde is
 *   still on the map, so the clock holds at zero instead of opening a wave the
 *   manager would refuse.
 * @returns {{ open: boolean, phase: string }}
 */
export function tickPacing(pacing, deltaMs, { waveIdle = true } = {}) {
  if (!pacing) return { open: false, phase: PACING_PHASE.DONE };
  if (pacing.phase !== PACING_PHASE.PREP && pacing.phase !== PACING_PHASE.BREATHER) {
    return { open: false, phase: pacing.phase };
  }

  const step = Math.max(0, Number(deltaMs) || 0);
  pacing.remainingMs = Math.max(0, pacing.remainingMs - step);
  if (pacing.remainingMs > 0 || !waveIdle) return { open: false, phase: pacing.phase };

  pacing.phase = PACING_PHASE.LIVE;
  pacing.remainingMs = 0;
  return { open: true, phase: pacing.phase };
}

/**
 * Drive one simulation step of the duel clock against a wave manager.
 *
 * Kept here rather than in the scene so the rule — "a duel opens its own waves,
 * a campaign never does" — is unit-tested instead of eyeballed.
 *
 * @param {{ pacing:object|null, waveManager:object, gameState:object, deltaMs:number }} step
 * @returns {boolean} true when the caller should open the next wave now
 */
export function advanceDuelPacing({ pacing, waveManager, gameState, deltaMs }) {
  if (!pacing || gameState?.isOver?.()) return false;
  const waveIdle = Boolean(waveManager?.canStartNextWave?.());
  return tickPacing(pacing, deltaMs, { waveIdle }).open;
}

/** Only a run without an arena clock gets to start its own waves. */
export function manualStartAllowed(pacing) {
  return !pacing;
}

/** The wave just ended: book the breather before the next one opens itself. */
export function breathe(pacing) {
  if (!pacing) return pacing;
  pacing.phase = PACING_PHASE.BREATHER;
  pacing.remainingMs = pacing.breatherMs;
  return pacing;
}

/** The script is over. */
export function closePacing(pacing) {
  if (!pacing) return pacing;
  pacing.phase = PACING_PHASE.DONE;
  pacing.remainingMs = 0;
  return pacing;
}

/**
 * What the wave button says when the arena is driving.
 *
 * The button stays on screen as a *readout* rather than disappearing, so the
 * countdown is legible without hunting for it.
 */
export function pacingLabel(pacing, { waveNumber = 1 } = {}) {
  if (!pacing) return null;
  const seconds = pacingSeconds(pacing);
  switch (pacing.phase) {
    case PACING_PHASE.PREP:
      return `PREPARE · ${seconds}`;
    case PACING_PHASE.BREATHER:
      return `NEXT WAVE · ${seconds}`;
    case PACING_PHASE.LIVE:
      return `WAVE ${waveNumber} · AUTO`;
    default:
      return 'FINAL WAVE';
  }
}

/** One line of coaching under the countdown. */
export function pacingHint(pacing) {
  if (!pacing) return '';
  if (pacing.phase === PACING_PHASE.PREP) return 'PLACE YOUR DEFENCES';
  if (pacing.phase === PACING_PHASE.BREATHER) return 'SPEND YOUR GOLD';
  return '';
}
