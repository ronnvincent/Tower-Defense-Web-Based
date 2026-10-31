/**
 * Bastion health rules, in one place.
 *
 * The bastion is the thing the player is defending, so "how hurt is it?" must
 * have exactly one answer shared by the HUD (which paints the bar), the scene
 * (which shakes the crystal) and the browser checks. The thresholds live here
 * rather than in two CSS classes and an `if` in the render loop.
 */

export const BASTION_STATE = {
  STABLE: 'stable',
  WARNING: 'warning',
  CRITICAL: 'critical',
  FALLEN: 'fallen',
};

/** Fractions of maximum integrity. Both are inclusive upper bounds. */
export const BASTION_THRESHOLDS = {
  warning: 0.6,
  critical: 0.3,
};

/**
 * @param {number} health current integrity
 * @param {number} maxHealth maximum integrity
 * @returns {'fallen'|'critical'|'warning'|'stable'}
 */
export function bastionState(health, maxHealth) {
  const max = Number(maxHealth) || 0;
  const hp = Math.max(0, Number(health) || 0);
  if (max <= 0) return BASTION_STATE.FALLEN;
  if (hp <= 0) return BASTION_STATE.FALLEN;
  const ratio = hp / max;
  if (ratio <= BASTION_THRESHOLDS.critical) return BASTION_STATE.CRITICAL;
  if (ratio <= BASTION_THRESHOLDS.warning) return BASTION_STATE.WARNING;
  return BASTION_STATE.STABLE;
}

/**
 * How hard a leak should read, 0-1.
 *
 * A grunt chipping one point off twenty should not shake the screen like the
 * warlord taking twelve, so the reaction is scaled by the share of the bar the
 * hit removed. Capped at 1 so a single huge hit cannot throw the camera.
 */
export function leakIntensity(damage, maxHealth) {
  const max = Number(maxHealth) || 0;
  if (max <= 0) return 1;
  return Math.max(0, Math.min(1, (Number(damage) || 0) / max));
}

/** True while the bastion's bar should pulse (critical, but still standing). */
export function isBastionCritical(state) {
  return state === BASTION_STATE.CRITICAL;
}
