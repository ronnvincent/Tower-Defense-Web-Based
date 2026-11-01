/**
 * Relics.js — pure relic maths: levels, aggregate bonuses, purchase rules.
 *
 * The save file stores `profile.relics` as `{ relicId: level }`. Everything the
 * scene needs is derived here, so "what does my collection actually do?" has
 * exactly one answer and it is unit-testable without a store.
 */

import { RELICS, getRelic } from '../data/relics.js';

/** Stored level for a relic (0 when never bought). */
export function relicLevel(relics, id) {
  const raw = relics?.[id];
  const level = Math.floor(Number(raw) || 0);
  const def = getRelic(id);
  if (!def) return 0;
  return Math.max(0, Math.min(def.maxLevel, level));
}

/** What the next level costs, or null when maxed. */
export function nextRelicCost(id, level = 0) {
  const def = getRelic(id);
  if (!def) return null;
  const current = Math.floor(Number(level) || 0);
  if (current >= def.maxLevel) return null;
  return def.costs[current] ?? null;
}

/**
 * Can this relic be upgraded right now?
 * @returns {{ ok:boolean, level:number, cost:number|null, reason?:string }}
 */
export function canBuyRelic(id, relics = {}, gems = 0) {
  const def = getRelic(id);
  if (!def) return { ok: false, level: 0, cost: null, reason: 'unknown-relic' };
  const level = relicLevel(relics, id);
  if (level >= def.maxLevel) return { ok: false, level, cost: null, reason: 'maxed' };
  const cost = nextRelicCost(id, level);
  if (!Number.isFinite(gems) || gems < cost) return { ok: false, level, cost, reason: 'gems' };
  return { ok: true, level, cost };
}

/**
 * Aggregate bonuses from a whole collection.
 *
 * Multipliers are returned as factors so callers can multiply rather than
 * remember whether "10%" means 0.1 or 1.1.
 *
 * @returns {{ startingGold:number, baseHealth:number, damage:number,
 *             cooldown:number, killGold:number, sellRefund:number }}
 */
export function relicBonuses(relics = {}) {
  const out = {
    startingGold: 0,
    baseHealth: 0,
    damage: 1,
    cooldown: 1,
    killGold: 1,
    sellRefund: 1,
  };
  for (const def of RELICS) {
    const level = relicLevel(relics, def.id);
    if (!level) continue;
    const effect = def.effect || {};
    if (effect.startingGold) out.startingGold += effect.startingGold * level;
    if (effect.baseHealth) out.baseHealth += effect.baseHealth * level;
    if (effect.towerDamage) out.damage *= 1 + effect.towerDamage * level;
    if (effect.towerCooldown) out.cooldown *= Math.max(0.4, 1 - effect.towerCooldown * level);
    if (effect.killGold) out.killGold *= 1 + effect.killGold * level;
    if (effect.sellRefund) out.sellRefund *= 1 + effect.sellRefund * level;
  }
  return out;
}

/**
 * Buy one level. Pure: returns the next `relics` map and the gem cost, or null
 * when the purchase is not allowed. The caller banks the gems.
 *
 * @returns {{ relics:object, id:string, level:number, cost:number } | null}
 */
export function buyRelic(relics, id, gems) {
  const check = canBuyRelic(id, relics, gems);
  if (!check.ok) return null;
  return {
    relics: { ...relics, [id]: check.level + 1 },
    id,
    level: check.level + 1,
    cost: check.cost,
  };
}

/** Collection view for the forge UI: def + owned level + next price + effect preview. */
export function relicBoard(relics = {}, gems = 0) {
  return RELICS.map((def) => {
    const level = relicLevel(relics, def.id);
    const cost = nextRelicCost(def.id, level);
    const check = canBuyRelic(def.id, relics, gems);
    return {
      ...def,
      level,
      cost,
      maxed: level >= def.maxLevel,
      affordable: check.ok,
      current: def.format(level),
      next: cost ? def.format(level + 1) : null,
    };
  });
}

/** "3 / 9 levels · 6 / 18 relics owned" line for the forge header. */
export function relicSummary(relics = {}) {
  const levels = RELICS.reduce((sum, def) => sum + relicLevel(relics, def.id), 0);
  const maxLevels = RELICS.reduce((sum, def) => sum + def.maxLevel, 0);
  const owned = RELICS.filter((def) => relicLevel(relics, def.id) > 0).length;
  return { levels, maxLevels, owned, total: RELICS.length };
}
