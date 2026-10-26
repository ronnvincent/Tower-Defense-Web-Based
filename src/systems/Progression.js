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
import { PET_MAX_LEVEL, getPet, petUpgradeCost } from '../data/petData.js';
import { DEFAULT_STATS, evaluateAchievements } from './Achievements.js';

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
    achievements: [], // ids already paid out
    stats: { ...DEFAULT_STATS },
    relics: {}, // forge purchases: { relicId: level }
    // Companions bought from the menu shop. Meta gold is spent here, never the
    // battle's own coins, and `pet` is the one that fights beside the Vanguard.
    pets: [], // owned pet ids
    pet: null, // equipped pet id
    // Companion levels, `{ petId: 1..5 }`. A bought companion starts at 1 and
    // every level is a real change to the numbers it fights with.
    petLevels: {},
    heroRank: 1, // 1 vanguard · 2 captain · 3 warlord
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
      profile.achievements = Array.isArray(parsed.achievements) ? [...parsed.achievements] : [];
      // Relics are `{ relicId: level }`. This used to force an array, which
      // silently threw away every purchased relic on the next page load — the
      // gems were spent and the level was gone. Keep both shapes readable:
      // an array is the oldest save format and means "owned, level 1".
      const savedRelics = parsed.relics;
      if (Array.isArray(savedRelics)) {
        profile.relics = Object.fromEntries(
          savedRelics.filter((id) => typeof id === 'string' && id).map((id) => [id, 1])
        );
      } else if (savedRelics && typeof savedRelics === 'object') {
        const clean = {};
        for (const [id, level] of Object.entries(savedRelics)) {
          const value = Math.floor(Number(level));
          if (id && Number.isFinite(value) && value > 0) clean[id] = value;
        }
        profile.relics = clean;
      } else {
        profile.relics = {};
      }
      profile.stats = { ...DEFAULT_STATS, ...(parsed.stats || {}) };
      // Companions: unknown ids (a renamed or removed pet) are dropped rather
      // than carried around, and an equipped pet that is not owned is cleared.
      profile.pets = Array.isArray(parsed.pets)
        ? Array.from(new Set(parsed.pets.filter((id) => typeof id === 'string' && id)))
        : [];
      profile.pet = profile.pets.includes(parsed.pet) ? parsed.pet : profile.pets[0] || null;
      // Levels belong to owned companions only; anything else is dropped and
      // every value is clamped to the ladder the shop can actually sell.
      const savedLevels = parsed.petLevels && typeof parsed.petLevels === 'object' ? parsed.petLevels : {};
      const levels = {};
      for (const id of profile.pets) {
        const value = Math.round(Number(savedLevels[id]));
        levels[id] = Number.isFinite(value) ? Math.min(PET_MAX_LEVEL, Math.max(1, value)) : 1;
      }
      profile.petLevels = levels;
      // Rank is a 1..3 ladder; an old or hand-edited save cannot invent a rank
      // the game has no sprite for.
      const rank = Math.round(Number(parsed.heroRank));
      profile.heroRank = Number.isFinite(rank) ? Math.min(3, Math.max(1, rank)) : 1;
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

  /* --------------------------------------------------------- companions */

  /** Ids of every companion the player owns. */
  get pets() {
    return [...this.profile.pets];
  }

  /** The companion that fights, or null when none is equipped. */
  get equippedPet() {
    return this.profile.pet || null;
  }

  ownsPet(id) {
    return this.profile.pets.includes(id);
  }

  /**
   * Buy a companion with meta gold.
   *
   * Returns a result object instead of throwing: the shop needs to say *why*
   * nothing happened ("you need 90 more gold") without a try/catch in a click
   * handler.
   *
   * @returns {{ ok:boolean, reason?:string, gold:number }}
   */
  buyPet(id, price) {
    if (!id) return { ok: false, reason: 'unknown-pet', gold: this.profile.gold };
    if (this.ownsPet(id)) return { ok: false, reason: 'owned', gold: this.profile.gold };
    const cost = Math.max(0, Math.round(Number(price) || 0));
    if (this.profile.gold < cost) return { ok: false, reason: 'gold', gold: this.profile.gold };
    this.profile.gold -= cost;
    this.profile.pets.push(id);
    // A fresh companion is level 1; the shop's upgrade tab is where it grows.
    if (!this.profile.petLevels) this.profile.petLevels = {};
    if (!this.profile.petLevels[id]) this.profile.petLevels[id] = 1;
    // The first companion bought is equipped straight away — buying something
    // and then having to find a second button to use it is a papercut.
    if (!this.profile.pet) this.profile.pet = id;
    this.save();
    return { ok: true, gold: this.profile.gold };
  }

  /* ------------------------------------------------------------- hero */

  /** The Vanguard's rank: 1 vanguard, 2 captain, 3 warlord. */
  get heroRank() {
    return this.profile.heroRank || 1;
  }

  /**
   * Promote the Vanguard to the next rank.
   *
   * The cost is the *next* rank's price, so `promoteHero(2)` asks for the
   * captain's 160. Returns the same result shape as `buyPet` so the shop has a
   * single error vocabulary.
   *
   * @returns {{ ok:boolean, reason?:string, rank:number }}
   */
  promoteHero(cost, maxRank = 3) {
    const next = Math.min(maxRank, this.heroRank + 1);
    if (next === this.heroRank) return { ok: false, reason: 'maxed', rank: this.heroRank };
    const price = Math.max(0, Math.round(Number(cost) || 0));
    if (this.profile.gold < price) return { ok: false, reason: 'gold', rank: this.heroRank };
    this.profile.gold -= price;
    this.profile.heroRank = next;
    this.save();
    return { ok: true, rank: next };
  }

  /** Level of an owned companion (1 for anything unknown). */
  petLevel(id) {
    const value = Math.round(Number(this.profile.petLevels?.[id]));
    return Number.isFinite(value) ? Math.min(PET_MAX_LEVEL, Math.max(1, value)) : 1;
  }

  /** Level of every companion the player owns. */
  get petLevels() {
    return { ...(this.profile.petLevels || {}) };
  }

  /**
   * Buy the next level of an owned companion with meta gold.
   *
   * Same result vocabulary as `buyPet` / `promoteHero` so one click handler can
   * explain every refusal.
   *
   * @returns {{ ok:boolean, reason?:'unknown-pet'|'not-owned'|'maxed'|'gold', level:number, cost:number|null, gold:number }}
   */
  upgradePet(id) {
    const pet = getPet(id);
    const fail = (reason, cost = null) => ({
      ok: false,
      reason,
      level: this.petLevel(id),
      cost,
      gold: this.profile.gold,
    });
    if (!pet) return fail('unknown-pet');
    if (!this.ownsPet(id)) return fail('not-owned');
    const level = this.petLevel(id);
    if (level >= PET_MAX_LEVEL) return fail('maxed');
    const cost = petUpgradeCost(pet, level);
    if (this.profile.gold < cost) return fail('gold', cost);
    this.profile.gold -= cost;
    this.profile.petLevels[id] = level + 1;
    this.save();
    return { ok: true, level: level + 1, cost, gold: this.profile.gold };
  }

  /** Equip an owned companion, or `null` to send it home. */
  equipPet(id) {
    if (id === null) {
      this.profile.pet = null;
      this.save();
      return null;
    }
    if (!this.ownsPet(id)) return this.profile.pet;
    this.profile.pet = id;
    this.save();
    return this.profile.pet;
  }

  /* ------------------------------------------------------------- stats */

  /**
   * Fold an event into the lifetime stats.
   *
   * `max` metrics (peaks like the 20-kill chain or the deepest endless wave)
   * only ever climb; everything else accumulates. No storage write here — the
   * save happens on wave/run boundaries, so a busy wave is not hundreds of
   * localStorage writes.
   */
  trackStats(patch = {}, { max = [] } = {}) {
    const stats = this.profile.stats;
    const peak = new Set(max);
    for (const [key, raw] of Object.entries(patch)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      if (peak.has(key)) stats[key] = Math.max(Number(stats[key]) || 0, value);
      else stats[key] = (Number(stats[key]) || 0) + value;
    }
    stats.starsTotal = this.totalStars;
    return stats;
  }

  /**
   * Pay out every achievement the stats now satisfy.
   * @returns {{ unlocked:object[], gems:number }} newly earned definitions
   */
  syncAchievements() {
    const earned = evaluateAchievements(this.profile.stats, this.profile.achievements);
    if (!earned.length) return { unlocked: [], gems: 0 };
    const gems = earned.reduce((sum, def) => sum + def.gems, 0);
    this.profile.achievements.push(...earned.map((def) => def.id));
    this.profile.gems += gems;
    this.save();
    return { unlocked: earned, gems };
  }

  /** Bank gems from achievements / milestones / dailies. */
  addGems(amount = 0) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!n) return this.profile.gems;
    this.profile.gems += n;
    this.save();
    return this.profile.gems;
  }

  get achievements() {
    return [...this.profile.achievements];
  }

  get stats() {
    return this.profile.stats;
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

    const stats = this.profile.stats;
    stats.runs = (Number(stats.runs) || 0) + 1;
    stats.victories = (Number(stats.victories) || 0) + 1;
    if (stars >= STAR_MAX && previousStars < STAR_MAX) {
      stats.threeStarVictories = (Number(stats.threeStarVictories) || 0) + 1;
    }
    if (baseHealth >= maxBaseHealth) {
      stats.flawlessVictories = (Number(stats.flawlessVictories) || 0) + 1;
    }
    stats.starsTotal = this.totalStars;

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

    const achievements = this.syncAchievements();
    this.save();
    return {
      achievements: achievements.unlocked,
      gemsFromAchievements: achievements.gems,
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
    this.profile.stats.endlessBestWave = Math.max(this.profile.stats.endlessBestWave || 0, wave);
    this.profile.stats.runs = (Number(this.profile.stats.runs) || 0) + 1;
    const achievements = this.syncAchievements();
    this.save();
    return { waveBest, scoreBest, isRecord, achievements: achievements.unlocked, gemsFromAchievements: achievements.gems };
  }

  /**
   * Record a loss. Only an endless run is worth keeping (its depth is the
   * score); a campaign defeat neither earns stars nor beats the level's saved
   * best, so it reports the stored best rather than the losing score.
   */
  recordDefeat(level, { wave = 0, score = 0 } = {}) {
    if (level?.endless) return this.recordEndless({ wave, score });
    this.profile.stats.runs = (Number(this.profile.stats.runs) || 0) + 1;
    const achievements = this.syncAchievements();
    this.save();
    return {
      waveBest: 0,
      scoreBest: this.bestScoreFor(level?.id || ''),
      isRecord: false,
      achievements: achievements.unlocked,
      gemsFromAchievements: achievements.gems,
    };
  }
}

/** Human readable "x / y" star summary for the world map header. */
export function starSummary(store) {
  return `${store.totalStars} / ${store.maxStars}`;
}
