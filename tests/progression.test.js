import { describe, it, expect } from 'vitest';
import {
  ProgressStore,
  starRating,
  computeRewards,
  createProfile,
  starSummary,
  STAR_MAX,
} from '../src/systems/Progression.js';
import { LEVELS, ENDLESS_LEVEL, getLevel } from '../src/data/levelData.js';

/** In-memory Storage stand-in so persistence can be exercised off-browser. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => map,
  };
}

describe('starRating', () => {
  it('awards 3 stars at 85% base health, 2 at 50%, 1 for surviving', () => {
    expect(starRating({ baseHealth: 25, maxBaseHealth: 25 })).toBe(3);
    expect(starRating({ baseHealth: 22, maxBaseHealth: 25 })).toBe(3); // 88%
    expect(starRating({ baseHealth: 21, maxBaseHealth: 25 })).toBe(2); // 84%
    expect(starRating({ baseHealth: 13, maxBaseHealth: 25 })).toBe(2); // 52%
    expect(starRating({ baseHealth: 12, maxBaseHealth: 25 })).toBe(1); // 48%
    expect(starRating({ baseHealth: 1, maxBaseHealth: 25 })).toBe(1);
  });

  it('honours per-level thresholds and never crashes on a zeroed core', () => {
    const thresholds = { two: 0.6, three: 0.9 };
    expect(starRating({ baseHealth: 23, maxBaseHealth: 25, thresholds })).toBe(3);
    expect(starRating({ baseHealth: 15, maxBaseHealth: 25, thresholds })).toBe(2);
    expect(starRating({ baseHealth: 0, maxBaseHealth: 0 })).toBe(1);
  });
});

describe('computeRewards', () => {
  it('pays the full bounty on a first clear and a bonus gem at 3 stars', () => {
    const level = getLevel('level-1');
    expect(computeRewards(level, { stars: 1, firstClear: true })).toEqual({
      gold: level.reward.gold,
      gems: level.reward.gems,
    });
    expect(computeRewards(level, { stars: 3, firstClear: true }).gems).toBe(level.reward.gems + 1);
  });

  it('pays only a 20% gold stipend on replays', () => {
    const level = getLevel('level-2');
    const replay = computeRewards(level, { stars: 3, firstClear: false });
    expect(replay.gold).toBe(Math.round(level.reward.gold * 0.2));
    expect(replay.gems).toBe(0);
  });
});

describe('ProgressStore', () => {
  it('starts with only level 1 open', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    expect(store.profile).toEqual(createProfile());
    expect(store.isUnlocked('level-1')).toBe(true);
    expect(store.isUnlocked('level-2')).toBe(false);
    expect(store.totalStars).toBe(0);
    expect(store.maxStars).toBe(LEVELS.length * STAR_MAX);
  });

  it('unlocks the next level (and Endless) on the first clear', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const result = store.recordVictory(getLevel('level-1'), {
      baseHealth: 20,
      maxBaseHealth: 25,
      score: 900,
    });
    expect(result.stars).toBe(2);
    expect(result.firstClear).toBe(true);
    expect(result.unlocked).toBe('level-2');
    expect(result.unlockedAll).toEqual(['level-2', 'endless']);
    expect(store.isUnlocked('level-2')).toBe(true);
    expect(store.isUnlocked('endless')).toBe(true);
    expect(store.gold).toBe(getLevel('level-1').reward.gold);
    expect(store.bestScoreFor('level-1')).toBe(900);
    expect(starSummary(store)).toBe(`2 / ${LEVELS.length * STAR_MAX}`);
  });

  it('keeps the best stars on replay and only pays the stipend', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const level = getLevel('level-1');
    store.recordVictory(level, { baseHealth: 25, maxBaseHealth: 25, score: 500 });
    const goldAfterFirst = store.gold;
    const replay = store.recordVictory(level, { baseHealth: 12, maxBaseHealth: 25, score: 300 });

    expect(replay.firstClear).toBe(false);
    expect(replay.improved).toBe(false);
    expect(replay.unlocked).toBeNull();
    expect(replay.unlockedAll).toEqual([]);
    expect(store.starsFor('level-1')).toBe(3);
    expect(store.bestScoreFor('level-1')).toBe(500);
    expect(store.gold).toBe(goldAfterFirst + Math.round(level.reward.gold * 0.2));
  });

  it('never lets a campaign defeat overwrite the saved best score', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const level = getLevel('level-1');
    store.recordVictory(level, { baseHealth: 25, maxBaseHealth: 25, score: 900 });
    const loss = store.recordDefeat(level, { wave: 4, score: 4800 });
    expect(loss.isRecord).toBe(false);
    expect(loss.scoreBest).toBe(900);
    expect(store.bestScoreFor('level-1')).toBe(900);
    expect(store.profile.stars['level-1']).toBe(3);
  });

  it('records endless depth without granting stars', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    const first = store.recordEndless({ wave: 7, score: 1200 });
    expect(first).toMatchObject({ waveBest: 7, scoreBest: 1200, isRecord: true });
    // Reaching wave 7 clears no achievement yet, so nothing is paid out.
    expect(first.achievements).toEqual([]);
    expect(first.gemsFromAchievements).toBe(0);
    const worse = store.recordEndless({ wave: 4, score: 800 });
    expect(worse.isRecord).toBe(false);
    expect(store.profile.endlessBestWave).toBe(7);
    expect(store.totalStars).toBe(0);
  });

  it('a defeat never awards stars but endless keeps the depth reached', () => {
    const store = new ProgressStore({ storage: fakeStorage() });
    store.recordDefeat(getLevel('level-1'), { wave: 3, score: 200 });
    expect(store.starsFor('level-1')).toBe(0);
    expect(store.isUnlocked('level-2')).toBe(false);

    store.recordDefeat(ENDLESS_LEVEL, { wave: 9, score: 3000 });
    expect(store.profile.endlessBestWave).toBe(9);
  });

  it('persists to storage and rehydrates, merging over a fresh profile', () => {
    const storage = fakeStorage();
    const first = new ProgressStore({ storage });
    first.recordVictory(getLevel('level-1'), { baseHealth: 25, maxBaseHealth: 25, score: 750 });
    first.unlock('level-3');

    const second = new ProgressStore({ storage });
    expect(second.starsFor('level-1')).toBe(3);
    expect(second.gold).toBe(first.gold);
    expect(second.isUnlocked('level-3')).toBe(true);

    const raw = JSON.parse(storage.getItem('td-dsalgo:progress:v1'));
    delete raw.gems; // simulate an older save file
    storage.setItem('td-dsalgo:progress:v1', JSON.stringify(raw));
    const legacy = new ProgressStore({ storage });
    expect(legacy.gems).toBe(0);
    expect(legacy.starsFor('level-1')).toBe(3);
  });

  it('survives corrupt JSON and a throwing storage', () => {
    const storage = fakeStorage();
    storage.setItem('td-dsalgo:progress:v1', '{not json');
    expect(new ProgressStore({ storage }).starsFor('level-1')).toBe(0);

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const store = new ProgressStore({ storage: broken });
    expect(() => store.recordVictory(getLevel('level-1'), {
      baseHealth: 25,
      maxBaseHealth: 25,
      score: 1,
    })).not.toThrow();
    expect(store.starsFor('level-1')).toBe(3);
  });
});
