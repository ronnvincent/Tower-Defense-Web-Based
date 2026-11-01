/**
 * focusTarget.js — "shoot that one".
 *
 * Every defence already had a targeting mode (first / last / strongest /
 * nearest), but they are all *rules*, set once from the inspector and then left
 * alone for the rest of the run. None of them can answer the question a player
 * actually asks mid-wave: "why is nobody killing the healer?"
 *
 * The mark is a temporary player instruction: tap a creep on the battlefield and
 * every tower that can reach it shoots it, whatever its targeting mode says.
 * Tap it again (or press Esc) to release. It changes *which* enemy takes the
 * damage, never how much — so the balance model is untouched, but a player who
 * marks the shaman, the summoner or the boss before it reaches the core gets a
 * real tactical lever that costs attention rather than gold.
 *
 * This module is the pure part: hit-testing and the HUD readout. The scene owns
 * the state and the reticle; the tower reads the mark in `acquireTarget()`.
 */

/** How far from the tap, in world pixels, a creep still counts as tapped. */
export const FOCUS_TAP_RADIUS = 30;

/**
 * Can this enemy hold the mark right now?
 *
 * Dead, escaped and zero-health creeps are excluded, so a mark left on a corpse
 * releases itself instead of silently disabling every tower's targeting mode.
 */
export function isFocusable(enemy) {
  if (!enemy) return false;
  if (enemy.isDead || enemy.reachedBase) return false;
  return (enemy.health ?? 1) > 0;
}

/**
 * The live enemy nearest to a world-space tap, or null.
 *
 * Nearest-wins matters when a pack of swarm creeps overlaps: the player taps the
 * one they can see on top, not the first one in the array.
 */
export function enemyAt(enemies, x, y, radius = FOCUS_TAP_RADIUS) {
  if (!Array.isArray(enemies)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    if (!isFocusable(enemy)) continue;
    const distance = Math.hypot((enemy.x ?? 0) - x, (enemy.y ?? 0) - y);
    if (distance <= radius && distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What the HUD chip should show for a marked enemy, or null when there is none.
 *
 * Kept separate from the DOM so the text can be asserted without a browser, and
 * so the scene never has to know how the chip is written.
 */
export function focusReadout(enemy) {
  if (!isFocusable(enemy)) return null;
  const max = Math.max(1, Math.round(enemy.maxHealth ?? enemy.health ?? 1));
  const hp = Math.max(0, Math.round(enemy.health ?? 0));
  return {
    name: String(enemy.def?.name || enemy.typeKey || 'ENEMY').toUpperCase(),
    hp,
    max,
    pct: Math.round((hp / max) * 100),
    boss: Boolean(enemy.isBoss),
  };
}
