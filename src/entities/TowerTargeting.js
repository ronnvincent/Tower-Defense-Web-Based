/**
 * TowerTargeting — the single source of truth for *which* enemy a defence
 * shoots at.
 *
 * It used to live as a `switch` inside `Tower.acquireTarget`, which was fine
 * while every tower offered the same four modes. The royal batteries ask for
 * more (a siege gun wants the boss, an anti-air tracker wants the fastest
 * flyer, a sniper wants the healthiest target), and the shop data needs to name
 * those modes without importing the entity — `towerData → royalDefences →
 * Tower` would be a cycle at module-evaluation time. So the vocabulary and the
 * ordering live here, the entity imports them, and the data imports them too.
 *
 * Two rules are enforced here rather than in each caller:
 *
 *   1. **The category filter beats the priority.** "Boss first" on a ground-only
 *      gun means *ground* bosses first; a flying boss is not a candidate at all.
 *      `Tower.acquireTarget` filters by category before it sorts, so this falls
 *      out of the pipeline, and `sortTargets` never sees an ineligible creep.
 *   2. **No target is selected twice.** Ordering is a stable sort on a copy, so
 *      the enemy list is never mutated by aiming.
 */

export const TARGETING_MODE = {
  FIRST: 'first',
  LAST: 'last',
  STRONGEST: 'strongest',
  WEAKEST: 'weakest',
  NEAREST: 'nearest',
  BOSS: 'boss',
  FASTEST: 'fastest',
};

/** Human labels for the inspector's priority panel. */
export const TARGETING_LABELS = {
  [TARGETING_MODE.BOSS]: 'Boss First',
  [TARGETING_MODE.STRONGEST]: 'Highest HP',
  [TARGETING_MODE.WEAKEST]: 'Lowest HP',
  [TARGETING_MODE.NEAREST]: 'Nearest',
  [TARGETING_MODE.FASTEST]: 'Fastest',
  [TARGETING_MODE.FIRST]: 'First (closest to Bastion)',
  [TARGETING_MODE.LAST]: 'Last (freshly spawned)',
};

/** Compact labels for a 4-button row on a phone. */
export const TARGETING_SHORT = {
  [TARGETING_MODE.BOSS]: 'BOSS',
  [TARGETING_MODE.STRONGEST]: 'HP+',
  [TARGETING_MODE.WEAKEST]: 'HP-',
  [TARGETING_MODE.NEAREST]: 'NEAR',
  [TARGETING_MODE.FASTEST]: 'FAST',
  [TARGETING_MODE.FIRST]: 'FIRST',
  [TARGETING_MODE.LAST]: 'LAST',
};

/**
 * Order `entries` ({ enemy, dist }) by priority.
 *
 * The list is sorted in place by the caller's request (it owns the array), but
 * every comparator has a deterministic tie-breaker — `distanceTraveled`, then
 * id — so two identical creeps never swap places between frames and make a
 * barrel twitch.
 *
 * @param {{enemy: object, dist: number}[]} entries
 * @param {string} mode a `TARGETING_MODE` value
 */
export function sortTargets(entries, mode) {
  const tie = (a, b) => (b.enemy.distanceTraveled || 0) - (a.enemy.distanceTraveled || 0);

  switch (mode) {
    case TARGETING_MODE.LAST:
      return entries.sort((a, b) => (a.enemy.distanceTraveled || 0) - (b.enemy.distanceTraveled || 0));
    case TARGETING_MODE.STRONGEST:
      return entries.sort((a, b) => (b.enemy.health || 0) - (a.enemy.health || 0) || tie(a, b));
    case TARGETING_MODE.WEAKEST:
      return entries.sort((a, b) => (a.enemy.health || 0) - (b.enemy.health || 0) || tie(a, b));
    case TARGETING_MODE.NEAREST:
      return entries.sort((a, b) => a.dist - b.dist || tie(a, b));
    case TARGETING_MODE.BOSS:
      // Bosses outrank everything; inside the boss group the healthiest leads,
      // so a two-boss wave does not split the gun between them.
      return entries.sort((a, b) => {
        const bossRank = Number(Boolean(b.enemy.isBoss)) - Number(Boolean(a.enemy.isBoss));
        if (bossRank !== 0) return bossRank;
        return (b.enemy.health || 0) - (a.enemy.health || 0) || tie(a, b);
      });
    case TARGETING_MODE.FASTEST:
      // "Fastest" means the creep covering ground quickest right now, which is
      // what an anti-air battery cares about — a flyer at 1.8× speed is the one
      // about to be out of reach. `currentSpeed` is the live, slowed value.
      return entries.sort(
        (a, b) =>
          (b.enemy.currentSpeed || b.enemy.speed || 0) - (a.enemy.currentSpeed || a.enemy.speed || 0) ||
          tie(a, b)
      );
    case TARGETING_MODE.FIRST:
    default:
      return entries.sort((a, b) => (b.enemy.distanceTraveled || 0) - (a.enemy.distanceTraveled || 0));
  }
}
