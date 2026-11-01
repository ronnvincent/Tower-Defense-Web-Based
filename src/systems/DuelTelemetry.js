/**
 * DuelTelemetry.js — how often the duel HUD is allowed to work.
 *
 * The rival strip is a remote readout. It cannot show anything the room has not
 * told us yet, and the room speaks at 2 Hz, so repainting it on every frame is
 * pure layout work: ~60 style writes a second for text that did not change.
 * These are budgets, not frame rates, and they are the one place the cadence
 * lives — `GameScene` asks, it does not decide.
 */

/** Repaint the rival strip at most this often (≈ 8 Hz, faster than the feed). */
export const RIVAL_PAINT_MS = 120;
/** Send my own wave / points / core HP this often (2 Hz). */
export const PROGRESS_REPORT_MS = 500;

/**
 * Which of the two telemetry jobs are due.
 * @param {number} now scene clock (ms)
 * @param {{paint?:number, report?:number}} last previous run times
 */
export function telemetryPlan(now, { paint = 0, report = 0 } = {}) {
  const clock = Number(now) || 0;
  return {
    paint: clock - (Number(paint) || 0) >= RIVAL_PAINT_MS,
    report: clock - (Number(report) || 0) >= PROGRESS_REPORT_MS,
  };
}

/**
 * A cheap identity for a progress payload. Two equal keys mean there is
 * nothing new to put on the wire, which is most of a quiet wave.
 */
export function progressKey(progress = {}) {
  const wave = Math.floor(Number(progress.wave) || 0);
  const total = Math.floor(Number(progress.totalWaves) || 0);
  const score = Math.floor(Number(progress.score) || 0);
  const hp = Number.isFinite(progress.coreHp) ? Math.max(0, Math.floor(progress.coreHp)) : 'x';
  const alive = progress.alive === false ? 0 : 1;
  return `${wave}|${total}|${score}|${hp}|${alive}`;
}
