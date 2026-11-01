/**
 * TargetCategories — the ground / air contract, written once.
 *
 * A defence and a creep meet in four places: acquisition (which enemy a tower
 * picks), the projectile that flies at it, the splash it leaves behind, and the
 * chain that arcs onward from the hit. The rule is one sentence —
 *
 *     a defence may only damage a creep whose category it declares
 *
 * — but until now each of those four places decided for itself. Acquisition got
 * it right (`Tower.acquireTarget`), and the area effects did not: a Boulder
 * Sling, which is ground-only by design, still damaged a wraith that happened to
 * be inside its blast, and a chain from a ground-locked keep could arc upward.
 * The bug was invisible in play (the sling never *aims* at a flyer, so the blast
 * only caught one by accident) and completely real.
 *
 * So the check lives here and everything else asks it. Data decides the answer:
 *
 *   enemy.def.flying     true  → AIR
 *   def.targetsAir       false → cannot touch AIR   (default true)
 *   def.targetsGround    false → cannot touch GROUND (default true)
 *
 * `targetsGround: false` is what an anti-air battery would ship with. No line
 * uses it yet, but the whole pipeline already honours it (see
 * `tests/target-categories.test.js`), so adding one is a data change and a
 * sprite, not a combat rewrite.
 *
 * The two defaults are deliberately permissive: a definition that says nothing
 * hits everything, which is what every tower written before this file assumed.
 * Opting *out* is explicit and has to be justified in the tower's data.
 */

/** The two categories a defence can declare. Kept as strings so they read in tests. */
export const TARGET = Object.freeze({
  GROUND: 'ground',
  AIR: 'air',
});

/** True for a creep that flies, whether the flag is on the instance or its data. */
export function isFlying(enemy) {
  return Boolean(enemy?.flying || enemy?.def?.flying || enemy?.isFlying);
}

/** The category a single creep belongs to. */
export function enemyTarget(enemy) {
  return isFlying(enemy) ? TARGET.AIR : TARGET.GROUND;
}

/**
 * What a defence can hit, as a pair of booleans.
 * @param {object|null|undefined} def a tower definition (`targetsAir`, `targetsGround`)
 */
export function defenceTargets(def) {
  return {
    ground: def?.targetsGround !== false,
    air: def?.targetsAir !== false,
  };
}

/**
 * The one rule. A dead creep is never targetable; `reachedBase` creeps are not
 * either (they are already inside the gate and no longer part of the fight).
 */
export function canTarget(def, enemy) {
  if (!enemy || enemy.isDead || enemy.reachedBase) return false;
  const targets = defenceTargets(def);
  return isFlying(enemy) ? targets.air : targets.ground;
}

/**
 * The same rule, from a projectile's point of view.
 *
 * A shot already in the air carries the firing line's categories (`Tower.fire`
 * copies them into the stats), because by the time it lands the tower may be
 * gone — sold, destroyed, or retired by a restart — and the blast still has to
 * know whose shell it is.
 */
export function projectileCanHit(stats, enemy) {
  if (!stats || !enemy || enemy.isDead || enemy.reachedBase) return false;
  return isFlying(enemy) ? stats.targetsAir !== false : stats.targetsGround !== false;
}

/**
 * "GROUND", "AIR" or "GROUND + AIR" — the long form for the inspector.
 * @param {object} def
 */
export function targetLabel(def) {
  const targets = defenceTargets(def);
  if (targets.ground && targets.air) return 'GROUND + AIR';
  return targets.ground ? 'GROUND' : 'AIR';
}

/**
 * "GROUND", "AIR" or "BOTH" — the short form for a dock card, which is 84 px
 * wide on a desktop dock and 74 on a phone.
 */
export function targetBadge(def) {
  const targets = defenceTargets(def);
  if (targets.ground && targets.air) return 'BOTH';
  return targets.ground ? 'GROUND' : 'AIR';
}
