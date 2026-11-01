/**
 * EndlessMilestones.js — depth markers for the endless run.
 *
 * Endless has no finish line, so every five waves it pays a checkpoint: gold
 * mid-run (spendable immediately) and gems for the meta layer. Past wave 50 the
 * spacing doubles, which keeps the later run from turning into a reward vending
 * machine while still giving a reason to push one more wave.
 *
 * Pure data + pure functions: the scene decides when a wave completes, this
 * module answers what that late wave was worth.
 */

/** Checkpoint every 5 waves to 50, then every 10. */
export const MILESTONE_WAVES = [
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 5), // 5..50
  ...Array.from({ length: 5 }, (_, i) => 60 + i * 10), // 60..100
];

/** Gold paid at a checkpoint — grows with depth but sub-linear. */
export function milestoneGold(wave) {
  return Math.round(30 + wave * 6);
}

/** Gems paid at a checkpoint (1 at wave 5, capped at 5). */
export function milestoneGems(wave) {
  return Math.min(5, 1 + Math.floor(wave / 20));
}

export const ENDLESS_MILESTONES = MILESTONE_WAVES.map((wave) => ({
  wave,
  gold: milestoneGold(wave),
  gems: milestoneGems(wave),
}));

/** The checkpoint sitting exactly on `wave`, or null. */
export function milestoneAt(wave) {
  const n = Math.floor(Number(wave) || 0);
  return ENDLESS_MILESTONES.find((m) => m.wave === n) || null;
}

/**
 * Checkpoints crossed in (fromExclusive, toInclusive].
 *
 * The caller passes the last wave it paid out and the wave that just completed,
 * so a speed-run that jumps two checkpoints (impossible today, cheap to guard)
 * pays both instead of silently skipping one.
 */
export function milestonesBetween(fromExclusive, toInclusive) {
  const from = Math.floor(Number(fromExclusive) || 0);
  const to = Math.floor(Number(toInclusive) || 0);
  if (to <= from) return [];
  return ENDLESS_MILESTONES.filter((m) => m.wave > from && m.wave <= to);
}

/** The next checkpoint after `wave`, or null past the table. */
export function nextMilestone(wave) {
  const n = Math.floor(Number(wave) || 0);
  return ENDLESS_MILESTONES.find((m) => m.wave > n) || null;
}

/** Waves remaining until the next checkpoint (null when none is left). */
export function wavesToNextMilestone(wave) {
  const next = nextMilestone(wave);
  return next ? next.wave - Math.floor(Number(wave) || 0) : null;
}

/**
 * Is this wave a new personal best?
 *
 * The endless HUD shows the record marker, so "past your record" needs to be a
 * single answer rather than a comparison repeated at three call sites.
 */
export function isRecordWave(wave, bestWave) {
  return Math.floor(Number(wave) || 0) > Math.floor(Number(bestWave) || 0);
}

/** "WAVE 10 · +96g +1💎" — one-line toast copy. */
export function milestoneLabel(milestone) {
  if (!milestone) return '';
  return `WAVE ${milestone.wave} · +${milestone.gold}g +${milestone.gems}💎`;
}
