/**
 * DailyChallenge.js — one deterministic run per calendar day, plus a streak.
 *
 * The daily is the retention hook: the same seed and modifiers for every player
 * on the same local day, a small twist on the rules, and a streak that is worth
 * protecting. Everything (day hash, Prisma-free RNG, streak maths) is pure so
 * the whole calendar can be tested without a clock.
 *
 * Storage is injected, exactly like ProgressStore, so jsdom/node both work.
 */

export const DAILY_STORAGE_KEY = 'td-dsalgo:daily:v1';
export const DAY_MS = 86_400_000;

/**
 * Modifier pool. Each entry is a rule twist, never a wall:
 *   coinsBonus      added to the level's starting gold
 *   healthDelta     added to the core's max HP
 *   healthScale     multiplied into enemy HP on top of the level ramp
 *   rewardScale     multiplied into every enemy's coin bounty
 *   gems            extra gems paid for finishing the daily
 */
export const DAILY_MODIFIERS = [
  {
    id: 'standard',
    name: 'Standard Muster',
    blurb: 'No twists. A clean run on today’s seed.',
    coinsBonus: 0,
    healthDelta: 0,
    healthScale: 1,
    rewardScale: 1,
    gems: 3,
  },
  {
    id: 'midas',
    name: 'Midas Rush',
    blurb: '+40 starting gold — and a 15% tougher horde.',
    coinsBonus: 40,
    healthDelta: 0,
    healthScale: 1.15,
    rewardScale: 1,
    gems: 4,
  },
  {
    id: 'glass',
    name: 'Glass Bastion',
    blurb: 'The core holds 15 HP. +60 gold to build with.',
    coinsBonus: 60,
    healthDelta: -10,
    healthScale: 1,
    rewardScale: 1,
    gems: 5,
  },
  {
    id: 'rationed',
    name: 'Lean Rations',
    blurb: 'Only 140 gold at the gate — but every kill pays 25% more.',
    coinsBonus: -80,
    healthDelta: 0,
    healthScale: 1,
    rewardScale: 1.25,
    gems: 4,
  },
  {
    id: 'siege',
    name: 'Siege Day',
    blurb: 'The horde is 30% stronger. +80 gold and +2 gems.',
    coinsBonus: 80,
    healthDelta: 0,
    healthScale: 1.3,
    rewardScale: 1,
    gems: 6,
  },
  {
    id: 'bounty',
    name: 'Bounty Board',
    blurb: 'Kills pay 40% more gold. The horde is 10% tougher.',
    coinsBonus: 20,
    healthDelta: 0,
    healthScale: 1.1,
    rewardScale: 1.4,
    gems: 4,
  },
];

/** Local calendar day key, e.g. '2026-10-24'. */
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return dayKey(new Date());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Stable integer per day key (FNV-1a, then reduced to 32 bits). */
export function seedForDay(key) {
  let hash = 0x811c9dc5;
  const text = String(key || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny, seeded, and identical in every browser. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Whole days between two day keys (b − a). */
export function daysBetween(a, b) {
  const parse = (key) => {
    const [y, m, d] = String(key || '').split('-').map(Number);
    if (!y || !m || !d) return NaN;
    return Date.UTC(y, m - 1, d);
  };
  const start = parse(a);
  const end = parse(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / DAY_MS);
}

/** Yesterday's key, relative to a day key. */
export function previousDay(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d) - DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Build today's challenge.
 *
 * @param {{ date?: Date|string, unlockedIds?: string[] }} options
 * @returns {{ key:string, seed:number, modifier:object, levelId:string }}
 */
export function dailyRun({ date = new Date(), unlockedIds = ['level-1'] } = {}) {
  const key = dayKey(date);
  const seed = seedForDay(key);
  const random = mulberry32(seed);
  const modifier = DAILY_MODIFIERS[Math.floor(random() * DAILY_MODIFIERS.length)] || DAILY_MODIFIERS[0];
  const pool = Array.isArray(unlockedIds) && unlockedIds.length ? [...unlockedIds].sort() : ['level-1'];
  // Endless is a mode, not a daily target.
  const campaign = pool.filter((id) => id !== 'endless');
  const levelId = campaign[Math.floor(random() * campaign.length)] || 'level-1';
  return { key, seed, modifier, levelId };
}

/** Apply a daily modifier to a level definition (never mutates the level). */
export function applyDailyModifiers(level, modifier, key = null) {
  if (!level) return level;
  const m = modifier || DAILY_MODIFIERS[0];
  return {
    ...level,
    startingCoins: Math.max(60, (level.startingCoins || 0) + (m.coinsBonus || 0)),
    baseHealth: Math.max(5, (level.baseHealth || 25) + (m.healthDelta || 0)),
    enemyHealthScale: (level.enemyHealthScale || 1) * (m.healthScale || 1),
    rewardScale: (level.rewardScale || 1) * (m.rewardScale || 1),
    daily: {
      key,
      modifierId: m.id,
      name: m.name,
      blurb: m.blurb,
      gems: m.gems || 0,
    },
  };
}

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
    const probe = '__td_daily_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export function createDailyState() {
  return {
    version: 1,
    lastPlayed: null,
    streak: 0,
    bestStreak: 0,
    played: {}, // dayKey -> { won:boolean, score:number }
    bestScore: 0,
    totalWins: 0,
  };
}

/**
 * Daily streak bookkeeping.
 *
 * The streak is about *showing up*, so starting the run is enough; the win adds
 * the completion mark and the gems separately.
 */
export class DailyStore {
  /**
   * @param {{ storage?: Storage, key?: string, now?: () => Date }} [options]
   */
  constructor({ storage, key = DAILY_STORAGE_KEY, now = () => new Date() } = {}) {
    this.storage = storage || safeStorage();
    this.key = key;
    this.now = now;
    this.state = this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return createDailyState();
      const parsed = JSON.parse(raw);
      const base = createDailyState();
      return {
        ...base,
        ...parsed,
        played: { ...(parsed.played || {}) },
      };
    } catch {
      return createDailyState();
    }
  }

  save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* private mode — the streak survives in memory for this session */
    }
    return this.state;
  }

  reset() {
    this.state = createDailyState();
    this.save();
    return this.state;
  }

  todayKey() {
    return dayKey(this.now());
  }

  isPlayed(key = this.todayKey()) {
    return Boolean(this.state.played[key]);
  }

  isWon(key = this.todayKey()) {
    return Boolean(this.state.played[key]?.won);
  }

  /** Streak as of today, without touching storage. */
  currentStreak(key = this.todayKey()) {
    if (this.state.played[key]) return this.state.streak;
    // Not played yet today: yesterday's streak is still alive until midnight.
    if (this.state.lastPlayed && daysBetween(this.state.lastPlayed, key) === 1) return this.state.streak;
    return 0;
  }

  /**
   * Mark today's daily as started and roll the streak.
   * @returns {{ streak:number, extended:boolean, playedToday:boolean, isNewDay:boolean }}
   */
  recordPlay(key = this.todayKey()) {
    if (this.state.played[key]) {
      this.state.played[key] = { ...this.state.played[key] };
      return { streak: this.state.streak, extended: false, playedToday: true, isNewDay: false };
    }

    const gap = this.state.lastPlayed ? daysBetween(this.state.lastPlayed, key) : NaN;
    const extended = gap === 1;
    this.state.streak = extended ? this.state.streak + 1 : 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.lastPlayed = key;
    this.state.played[key] = { won: false, score: 0 };
    this.save();
    return { streak: this.state.streak, extended, playedToday: true, isNewDay: true };
  }

  /**
   * Complete today's daily. Idempotent: a replay cannot farm gems.
   * @returns {{ gems:number, firstWin:boolean, streak:number, bestScore:number }}
   */
  recordWin(key = this.todayKey(), { score = 0, gems = 0 } = {}) {
    const entry = this.state.played[key] || { won: false, score: 0 };
    const firstWin = !entry.won;
    this.state.played[key] = { won: true, score: Math.max(entry.score || 0, score) };
    if (firstWin) this.state.totalWins += 1;
    this.state.bestScore = Math.max(this.state.bestScore, score);
    // A win on a day that was never "started" still counts as showing up.
    if (!this.state.lastPlayed) this.recordPlay(key);
    this.save();
    return {
      gems: firstWin ? gems : 0,
      firstWin,
      streak: this.state.streak,
      bestScore: this.state.bestScore,
    };
  }
}
