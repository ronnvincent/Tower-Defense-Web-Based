/**
 * Achievements.js — one evaluator for the whole checklist.
 *
 * The definitions live in `data/achievements.js` as data (metric + target), so
 * unlocking is a single comparison and the menu can render progress bars from
 * the same numbers. Nothing here touches storage: `ProgressStore` owns the save
 * file, this module only answers "what is done now that was not before?".
 */

import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, getAchievement } from '../data/achievements.js';

/** Every metric the catalogue reads, with its zero. */
export const DEFAULT_STATS = {
  runs: 0,
  kills: 0,
  wavesCleared: 0,
  bossesKilled: 0,
  bestChain: 0,
  earlyCalls: 0,
  towersBuilt: 0,
  palisadesBuilt: 0,
  upgradesBought: 0,
  maxTowersAtOnce: 0,
  goldEarned: 0,
  victories: 0,
  flawlessVictories: 0,
  threeStarVictories: 0,
  starsTotal: 0,
  endlessBestWave: 0,
  dailyWins: 0,
  dailyStreak: 0,
};

/** Missing / corrupt metrics read as zero instead of NaN. */
export function normalizeStats(stats = {}) {
  const out = { ...DEFAULT_STATS };
  for (const key of Object.keys(DEFAULT_STATS)) {
    const value = Number(stats?.[key]);
    out[key] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return out;
}

/**
 * Progress for one achievement.
 * @returns {{ value:number, target:number, ratio:number, done:boolean }}
 */
export function achievementProgress(def, stats = {}) {
  const target = Math.max(1, Number(def?.target) || 1);
  const normalized = normalizeStats(stats);
  const value = Math.max(0, Number(normalized[def?.metric]) || 0);
  return {
    value,
    target,
    ratio: Math.min(1, value / target),
    done: value >= target,
  };
}

/**
 * Which achievements are complete but not yet banked.
 *
 * @param {object} stats lifetime stats
 * @param {string[]} unlocked ids already paid out
 * @param {{ only?: string[] }} [options] restrict to specific ids (tests/debug)
 * @returns {object[]} newly earned definitions, catalogue order
 */
export function evaluateAchievements(stats, unlocked = [], { only = null } = {}) {
  const paid = new Set(Array.isArray(unlocked) ? unlocked : []);
  const restrict = Array.isArray(only) ? new Set(only) : null;
  const earned = [];
  for (const def of ACHIEVEMENTS) {
    if (paid.has(def.id)) continue;
    if (restrict && !restrict.has(def.id)) continue;
    const progress = achievementProgress(def, stats);
    if (progress.done) earned.push(def);
  }
  return earned;
}

/** Gem value of a set of ids (used when unlocking in bulk). */
export function gemValue(ids = []) {
  return ids.reduce((sum, id) => sum + (getAchievement(id)?.gems || 0), 0);
}

/** Catalogue grouped by category, with progress attached — for the menu. */
export function achievementBoard(stats, unlocked = []) {
  const paid = new Set(Array.isArray(unlocked) ? unlocked : []);
  return ACHIEVEMENT_CATEGORIES.map((category) => ({
    category,
    items: ACHIEVEMENTS.filter((a) => a.category === category).map((def) => ({
      ...def,
      ...achievementProgress(def, stats),
      unlocked: paid.has(def.id),
    })),
  }));
}

/** "7 / 24 · 31 gems banked". */
export function achievementSummary(stats, unlocked = []) {
  const paid = new Set(Array.isArray(unlocked) ? unlocked : []);
  const earned = ACHIEVEMENTS.filter((a) => paid.has(a.id));
  return {
    unlocked: earned.length,
    total: ACHIEVEMENTS.length,
    gemsEarned: earned.reduce((sum, a) => sum + a.gems, 0),
    gemsRemaining: ACHIEVEMENTS.filter((a) => !paid.has(a.id)).reduce((sum, a) => sum + a.gems, 0),
    percent: ACHIEVEMENTS.length ? earned.length / ACHIEVEMENTS.length : 0,
  };
}
