/**
 * Progression.js — stars, unlocks, rewards and the save file.
 *
 * Everything here is pure data in / data out, with the browser storage injected,
 * so the whole progression curve is unit-testable without a DOM.
 *
 * Star rules (per level, `thresholds` come from levelData):
 *   3★  finish with at least `three` of the realm core left (85% by default)
 *   2★  at least `two` (50%)
 *   1★  survived at all
 * A defeat never awards stars.
 */

import { LEVELS, getNextLevel } from '../data/levelData.js';

export const STORAGE_KEY = 'td-dsalgo:progress:v1';
export const STAR_MAX = 3;

/** Campaign levels, in order (Endless is a mode, not a star target). */
export const CAMPAIGN_LEVELS = LEVELS;

/**
 * @param {{ baseHealth:number, maxBaseHealth:number, thresholds?:{two:number,three:number} }} result
 * @returns {1|2|3}
 */
export function starRating({ baseHealth, maxBaseHealth, thresholds = { two: 0.5, three: 0.85 } }) {
  if (!(maxBaseHealth > 0)) return 1;
  const ratio = Math.max(0, Math.min(1, baseHealth / maxBaseHealth));
  if (ratio >= thresholds.three) return 3;
  if (ratio >= thresholds.two) return 2;
  return 1;
}

/**
 * Meta rewards for finishing a level.
 *
 * A first clear pays the level's full bounty (plus a gem for a flawless 3★);
 * replays pay a 20% gold stipend so farming is possible but slow.
 *
 * @param {object} level level definition
 * @param {{ stars:number, firstClear:boolean }} result
 * @returns {{ gold:number, gems:number }}
 */
export function computeRewards(level, { stars, firstClear }) {
  const bounty = level?.reward || { gold: 0, gems: 0 };
  if (!firstClear) {
    return { gold: Math.round((bounty.gold || 0) * 0.2), gems: 0 };
  }
  const flawless = stars >= STAR_MAX ? 1 : 0;
  return { gold: bounty.gold || 0, gems: (bounty.gems || 0) + flawless };
}

/** In-memory storage used when localStorage is unavailable (private mode). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function safeStorage() {
  try {
    const probe = '__td_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

/** A fresh save: level 1 open, nothing cleared. */
export function createProfile() {
  return {
    version: 1,
    unlocked: ['level-1'],
    stars: {}, // levelId -> 1..3
    bestScore: {}, // levelId -> number
    gold: 0,
    gems: 0,
    endlessBestWave: 0,
    endlessBestScore: 0,
    campaignComplete: false,
  };
}

export class ProgressStore {
  /**
   * @param {{ storage?: Storage, key?: string }} [options]
   */
  constructor({ storage, key = STORAGE_KEY } = {}) {
    this.storage = storage || safeStorage();
    this.key = key;
    this.profile = this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return createProfile();
      const parsed = JSON.parse(raw);
      // Merge over a fresh profile so an older save never misses a field.
      const profile = { ...createProfile(), ...parsed };
      profile.stars = { ...(parsed.stars || {}) };
      profile.bestScore = { ...(parsed.bestScore || {}) };
      profile.unlocked = Array.isArray(parsed.unlocked) && parsed.unlocked.length
        ? Array.from(new Set(['level-1', ...parsed.unlocked]))
        : ['level-1'];
      return profile;
    } catch {
      return createProfile();
    }
  }

  save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.profile));
    } catch {
      /* quota / private mode — the run continues with in-memory progress */
    }
    return this.profile;
  }

  reset() {
    this.profile = createProfile();
    this.save();
    return this.profile;
  }

  isUnlocked(levelId) {
    return this.profile.unlocked.includes(levelId);
  }

  unlock(levelId) {
    if (!levelId || this.isUnlocked(levelId)) return false;
    this.profile.unlocked.push(levelId);
    this.save();
    return true;
  }

  starsFor(levelId) {
    return this.profile.stars[levelId] || 0;
  }

  bestScoreFor(levelId) {
    return this.profile.bestScore[levelId] || 0;
  }

  get totalStars() {
    return CAMPAIGN_LEVELS.reduce((sum, level) => sum + this.starsFor(level.id), 0);
  }

  get maxStars() {
    return CAMPAIGN_LEVELS.length * STAR_MAX;
  }

  get gold() {
    return this.profile.gold;
  }

  get gems() {
    return this.profile.gems;
  }

  /**
   * Record a win: stars only improve, score only improves, rewards are banked,
   * and the next node unlocks on the first clear.
   *
   * @returns {{ stars:number, previousStars:number, improved:boolean, firstClear:boolean,
   *             rewards:{gold:number,gems:number}, unlocked:string|null,
   *             unlockedAll:string[] }}
   */
  recordVictory(level, { baseHealth, maxBaseHealth, score = 0 }) {
    const stars = starRating({ baseHealth, maxBaseHealth, thresholds: level.stars });
    const previousStars = this.starsFor(level.id);
    const firstClear = previousStars === 0;
    const rewards = computeRewards(level, { stars, firstClear });

    this.profile.stars[level.id] = Math.max(previousStars, stars);
    this.profile.bestScore[level.id] = Math.max(this.bestScoreFor(level.id), score);
    this.profile.gold += rewards.gold;
    this.profile.gems += rewards.gems;

    const newlyUnlocked = [];
    if (level.endless) {
      this.profile.campaignComplete = true;
    } else {
      const next = getNextLevel(level.id);
      const targets = [next?.id];
      // Beating level 1 also opens Endless Siege.
      if (level.id === 'level-1') targets.push('endless');
      for (const id of targets) {
        if (id && !this.isUnlocked(id)) {
          this.profile.unlocked.push(id);
          newlyUnlocked.push(id);
        }
      }
      if (!next && level.id === LEVELS[LEVELS.length - 1].id) {
        this.profile.campaignComplete = true;
      }
    }

    this.save();
    return {
      stars,
      previousStars,
      improved: stars > previousStars,
      firstClear,
      rewards,
      // A single clear can open two doors (level 2 *and* Endless Siege), so the
      // result screen gets every id; `unlocked` stays the first one for callers
      // that only want to announce a single thing.
      unlocked: newlyUnlocked[0] || null,
      unlockedAll: newlyUnlocked,
    };
  }

  /**
   * Record an endless run. Endless never "wins", so the only progress is the
   * deepest wave reached and the best score.
   */
  recordEndless({ wave = 0, score = 0 } = {}) {
    const waveBest = Math.max(this.profile.endlessBestWave, wave);
    const scoreBest = Math.max(this.profile.endlessBestScore, score);
    const isRecord = wave > this.profile.endlessBestWave || score > this.profile.endlessBestScore;
    this.profile.endlessBestWave = waveBest;
    this.profile.endlessBestScore = scoreBest;
    this.save();
    return { waveBest, scoreBest, isRecord };
  }

  /**
   * Record a loss. Only an endless run is worth keeping (its depth is the
   * score); a campaign defeat neither earns stars nor beats the level's saved
   * best, so it reports the stored best rather than the losing score.
   */
  recordDefeat(level, { wave = 0, score = 0 } = {}) {
    if (level?.endless) return this.recordEndless({ wave, score });
    return { waveBest: 0, scoreBest: this.bestScoreFor(level?.id || ''), isRecord: false };
  }
}

/** Human readable "x / y" star summary for the world map header. */
export function starSummary(store) {
  return `${store.totalStars} / ${store.maxStars}`;
}
