import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_GEM_TOTAL,
  getAchievement,
} from '../src/data/achievements.js';
import {
  DEFAULT_STATS,
  achievementBoard,
  achievementProgress,
  achievementSummary,
  evaluateAchievements,
  gemValue,
  normalizeStats,
} from '../src/systems/Achievements.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { getLevel } from '../src/data/levelData.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('Achievements: catalogue', () => {
  it('ships 26 unique, complete entries', () => {
    expect(ACHIEVEMENTS).toHaveLength(26);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const def of ACHIEVEMENTS) {
      expect(def.name.length).toBeGreaterThan(2);
      expect(def.desc.length).toBeGreaterThan(8);
      expect(def.gems).toBeGreaterThan(0);
      expect(def.target).toBeGreaterThan(0);
      expect(ACHIEVEMENT_CATEGORIES).toContain(def.category);
      // Every metric must exist in the stats contract, or it can never unlock.
      expect(DEFAULT_STATS).toHaveProperty(def.metric);
    }
  });

  it('covers every category and pays a sane gem total', () => {
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect([...categories].sort()).toEqual([...ACHIEVEMENT_CATEGORIES].sort());
    expect(ACHIEVEMENT_GEM_TOTAL).toBeGreaterThan(60);
    expect(ACHIEVEMENT_GEM_TOTAL).toBeLessThan(200);
  });

  it('looks up by id', () => {
    expect(getAchievement('first-blood')?.name).toBe('First Blood');
    expect(getAchievement('nope')).toBeNull();
  });
});

describe('Achievements: evaluation', () => {
  it('normalizes missing, negative and junk metrics to zero', () => {
    const stats = normalizeStats({ kills: -5, wavesCleared: 'x', bestChain: 9 });
    expect(stats.kills).toBe(0);
    expect(stats.wavesCleared).toBe(0);
    expect(stats.bestChain).toBe(9);
    expect(normalizeStats().kills).toBe(0);
  });

  it('reports progress with a clamped ratio', () => {
    const def = getAchievement('hundred-cuts');
    expect(achievementProgress(def, { kills: 25 })).toMatchObject({ value: 25, target: 100, ratio: 0.25, done: false });
    expect(achievementProgress(def, { kills: 500 })).toMatchObject({ ratio: 1, done: true });
  });

  it('unlocks exactly the newly satisfied entries', () => {
    const earned = evaluateAchievements({ kills: 1, towersBuilt: 1 }, []);
    expect(earned.map((a) => a.id).sort()).toEqual(['first-blood', 'first-stone']);
  });

  it('never re-pays an already unlocked entry', () => {
    const earned = evaluateAchievements({ kills: 100 }, ['first-blood', 'hundred-cuts']);
    expect(earned.map((a) => a.id)).not.toContain('first-blood');
    expect(evaluateAchievements({ kills: 100 }, ['first-blood', 'hundred-cuts'])).toHaveLength(0);
  });

  it('can be restricted to a subset (used by tests and admin tools)', () => {
    const earned = evaluateAchievements({ kills: 1000 }, [], { only: ['thousand-blades'] });
    expect(earned).toHaveLength(1);
    expect(earned[0].id).toBe('thousand-blades');
  });

  it('sums gem rewards for a set of ids', () => {
    expect(gemValue(['first-blood', 'hundred-cuts'])).toBe(3);
    expect(gemValue(['nope'])).toBe(0);
  });

  it('builds a grouped board with progress attached', () => {
    const board = achievementBoard({ kills: 50, bestChain: 10 }, ['first-blood']);
    expect(board.map((g) => g.category)).toEqual(ACHIEVEMENT_CATEGORIES);
    const combat = board.find((g) => g.category === 'combat');
    const hundred = combat.items.find((i) => i.id === 'hundred-cuts');
    expect(hundred.ratio).toBeCloseTo(0.5);
    expect(hundred.unlocked).toBe(false);
    expect(combat.items.find((i) => i.id === 'first-blood').unlocked).toBe(true);
  });

  it('summarises claimed vs remaining gems', () => {
    const summary = achievementSummary({}, ['first-blood']);
    expect(summary.unlocked).toBe(1);
    expect(summary.total).toBe(26);
    expect(summary.gemsEarned).toBe(getAchievement('first-blood').gems);
    expect(summary.gemsEarned + summary.gemsRemaining).toBe(ACHIEVEMENT_GEM_TOTAL);
  });
});

describe('Achievements: ProgressStore integration', () => {
  it('banks gems once when a stat crosses a threshold', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    store.trackStats({ kills: 1 });
    const first = store.syncAchievements();
    expect(first.unlocked.map((a) => a.id)).toEqual(['first-blood']);
    expect(store.gems).toBe(1);
    expect(store.syncAchievements().unlocked).toHaveLength(0);
    expect(store.gems).toBe(1);
  });

  it('keeps peak metrics instead of summing them', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    store.trackStats({ bestChain: 6 }, { max: ['bestChain'] });
    store.trackStats({ bestChain: 4 }, { max: ['bestChain'] });
    expect(store.stats.bestChain).toBe(6);
    store.trackStats({ bestChain: 11 }, { max: ['bestChain'] });
    expect(store.stats.bestChain).toBe(11);
  });

  it('records victories, stars and flawless runs', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const level = getLevel('level-1');
    const result = store.recordVictory(level, {
      baseHealth: level.baseHealth,
      maxBaseHealth: level.baseHealth,
      score: 1234,
    });
    expect(result.stars).toBe(3);
    expect(store.stats.victories).toBe(1);
    expect(store.stats.threeStarVictories).toBe(1);
    expect(store.stats.flawlessVictories).toBe(1);
    expect(store.stats.starsTotal).toBe(3);
    expect(result.achievements.map((a) => a.id)).toContain('first-victory');
    expect(store.achievements).toContain('first-victory');
  });

  it('does not double-count a 3★ replay as a second three-star', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const level = getLevel('level-1');
    const win = () =>
      store.recordVictory(level, {
        baseHealth: level.baseHealth,
        maxBaseHealth: level.baseHealth,
        score: 100,
      });
    win();
    win();
    expect(store.stats.threeStarVictories).toBe(1);
    expect(store.stats.victories).toBe(2);
  });

  it('tracks the endless best wave', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    store.recordEndless({ wave: 12, score: 4000 });
    expect(store.stats.endlessBestWave).toBe(12);
    store.recordEndless({ wave: 8, score: 1000 });
    expect(store.stats.endlessBestWave).toBe(12);
  });

  it('persists stats and achievements across reloads', () => {
    const storage = fakeStorage();
    const first = new ProgressStore({ storage });
    first.trackStats({ kills: 60 });
    first.syncAchievements();
    const second = new ProgressStore({ storage });
    expect(second.stats.kills).toBe(60);
    expect(second.achievements).toContain('first-blood');
    expect(second.stats).toHaveProperty('maxTowersAtOnce');
  });
});
