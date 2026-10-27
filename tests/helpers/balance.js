import { TOWER_TYPES } from '../../src/data/towerData.js';
import { ASCENSION, dps } from '../../src/data/towerAscension.js';
import { calculateEffectiveArmor, getArmorDamageMultiplier } from '../../src/systems/CombatCalculator.js';

/**
 * One balance model, shared by the tests and by `scripts/balance-report.mjs`.
 *
 * It reproduces the runtime's maths instead of inventing a second one:
 *
 *   damage   `CombatCalculator.calculateDamage()` — armour is reduced by
 *            armour-break first, then by `armorPenetration`, and the damage
 *            types carry intrinsic penetration (piercing 0.5, magic and
 *            lightning 0.75, true 1.0).
 *   speed    `towerAscension.dps()` — damage x shots / cooldown.
 *   burn     `Enemy.applyDot()` keeps one DoT per kind and refreshes it, so a
 *            tower that keeps firing sustains `damage / tickMs` forever.
 *   splash   linear falloff from 100 % at the centre to 40 % at the rim, with
 *            our 64 px tiles: a radius of 128 px covers two tiles out, so the
 *            number of extra bodies is `radius / 64`, capped by the pack size.
 *   chain    `Projectile.executeChainLightning()` lands 75 % damage per link.
 *   bosses   `hitEnemy()` multiplies by `1 + bossBonus` for `isBoss` targets.
 */

const INTRINSIC_PENETRATION = {
  physical: 0,
  explosive: 0,
  piercing: 0.5,
  magic: 0.75,
  lightning: 0.75,
  true: 1,
};

/** TILE_SIZE, the spacing the splash model assumes. */
const TILE_PX = 64;

/**
 * Four representative targets. Every defence has to be good at *one* of them;
 * that is the whole point of a specialisation.
 */
export const TARGETS = {
  /** A swarm pack: five bodies inside a 128 px blast. */
  pack: { armor: 0, bodies: 5, boss: false },
  /** One target, unarmoured — the "single-target" column. */
  single: { armor: 0, bodies: 1, boss: false },
  /** Heavy line infantry (the brute) — armour 40. */
  armor: { armor: 40, bodies: 1, boss: false },
  /** The Obsidian Behemoth, the toughest titan — armour 70 and `isBoss`. */
  boss: { armor: 70, bodies: 1, boss: true },
};

/** Damage multiplier for a stat block against one target. */
export function mitigation(stats, target) {
  const armor = Math.max(0, target.armor - (stats.armorBreak || 0));
  const pen = Math.min(1, (INTRINSIC_PENETRATION[stats.damageType] || 0) + (stats.armorPenetration || 0));
  let multiplier = getArmorDamageMultiplier(calculateEffectiveArmor(armor, pen, 0));
  if (target.boss && stats.bossBonus) multiplier *= 1 + stats.bossBonus;
  return multiplier;
}

/**
 * Effective damage per second against one target, in the units the player
 * actually experiences: everything the shot does, over the time it takes.
 */
export function throughput(stats, target) {
  if (!stats) return 0;
  const base = dps(stats);
  const multiplier = mitigation(stats, target);
  let total = base * multiplier;

  // Burn: sustained while the tower keeps firing (one DoT per kind refreshes).
  if (stats.dot?.tickMs) {
    total += ((stats.dot.damage / stats.dot.tickMs) * 1000) * multiplier;
  }

  const extraBodies = Math.min(Math.max(0, target.bodies - 1), (stats.splash || 0) / TILE_PX);
  if (stats.splash && extraBodies > 0) {
    // Mean falloff for bodies spread across the blast: (1.0 + 0.4) / 2.
    total += base * multiplier * extraBodies * 0.7;
  }
  if (stats.chainTargets && target.bodies > 1) {
    total += base * multiplier * Math.min(stats.chainTargets, target.bodies - 1) * 0.75;
  }
  return total;
}

/** Resolve a branch to the stat block a given level actually fires with. */
export function statsAt(line, specKey, level) {
  const def = TOWER_TYPES[line];
  if (!def) return null;
  if (level <= 2) return def.levels[level - 1] || def.levels[def.levels.length - 1];
  const spec = def.specializations?.[specKey];
  if (!spec) return null;
  if (level === 3) return spec;
  const asc = ASCENSION[line]?.[specKey];
  if (!asc) return spec;
  if (level === 4) return { ...spec, ...asc.elite };
  return { ...spec, ...asc.elite, ...asc.apex };
}

/** Total gold spent to reach `level` down one branch. */
export function costAt(line, specKey, level) {
  const def = TOWER_TYPES[line];
  if (level <= 1) return def.cost;
  let cost = def.cost + (def.levels[1]?.upgradeCost || 0);
  if (level < 3) return cost;
  const spec = def.specializations[specKey];
  cost += spec.upgradeCost || 0;
  const asc = ASCENSION[line][specKey];
  if (level >= 4) cost += asc.elite.upgradeCost || 0;
  if (level >= 5) cost += asc.apex.upgradeCost || 0;
  return cost;
}

/** Everything a branch does to one target at one level. */
export function evaluate(line, specKey, level) {
  const stats = statsAt(line, specKey, level);
  const columns = Object.fromEntries(
    Object.entries(TARGETS).map(([name, target]) => [name, Math.round(throughput(stats, target))])
  );
  return { line, specKey, level, stats, cost: costAt(line, specKey, level), columns };
}

/** The pair of branches a line offers at one level, in declaration order. */
export function branchPair(line, level) {
  const specs = Object.keys(TOWER_TYPES[line]?.specializations || {});
  return specs.map((specKey) => evaluate(line, specKey, level));
}

/**
 * What each branch promises to be. The numbers have to back the promise; see
 * `tests/branch-niche.test.js`.
 *
 *   pack    – clears crowds of unarmoured bodies
 *   single  – the biggest hit on one unarmoured target
 *   armor   – strips or punches through plate (armour 40+)
 *   boss    – the answer to a titan, boss bonus included
 *   control – slows or freezes the lane instead of killing it
 *   support – buffs the defences around it rather than shooting well
 */
export const NICHE = {
  archer: { rapid: 'pack', sniper: 'boss' },
  cannon: { siege: 'pack', artillery: 'boss' },
  frost: { blizzard: 'control', lightning: 'pack' },
  forge: { ember: 'pack', thunder: 'armor' },
  runes: { nova: 'pack', void: 'boss' },
  banner: { muster: 'support', warbanner: 'support' },
  crossbow: { repeater: 'pack', piercer: 'boss' },
  gatling: { storm: 'pack', shred: 'armor' },
  flamer: { napalm: 'pack', inferno: 'single' },
  venom: { plague: 'pack', corrosive: 'armor' },
  harpoon: { grapple: 'control', ballista: 'boss' },
};

/** Utility a control / support branch is allowed to trade damage for. */
export function utilityOf(stats) {
  const out = [];
  if (stats?.slow) out.push('slow');
  if (stats?.stunMs) out.push('stun');
  if (stats?.aura) out.push('aura');
  if (stats?.aura?.coinPerKill) out.push('gold');
  if (stats?.aura?.fireRateBonus) out.push('fireRate');
  return out;
}

/** Levels a branch is allowed to declare a niche at. */
export const NICHE_LEVELS = [3, 4, 5];
