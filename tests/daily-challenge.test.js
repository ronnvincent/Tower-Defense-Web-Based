import { describe, it, expect } from 'vitest';
import {
  DAILY_MODIFIERS,
  DailyStore,
  applyDailyModifiers,
  dailyRun,
  dayKey,
  daysBetween,
  mulberry32,
  previousDay,
  seedForDay,
} from '../src/systems/DailyChallenge.js';
import { getLevel } from '../src/data/levelData.js';

/**
 * Daily Challenge.
 *
 * The daily is only fair if it is identical for everyone on the same day and
 * does not reroll on refresh, and the streak is only worth protecting if it
 * breaks exactly when a day is missed. Both are pure functions, so both are
 * pinned here — no clock, no localStorage.
 */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

function atDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

describe('DailyChallenge: calendar', () => {
  it('keys days by the local calendar, zero-padded', () => {
    expect(dayKey(atDate('2026-01-05'))).toBe('2026-01-05');
    expect(dayKey(atDate('2026-12-31'))).toBe('2026-12-31');
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
    expect(daysBetween('2026-10-24', '2026-10-24')).toBe(0);
    expect(daysBetween('2026-10-24', '2026-10-31')).toBe(7);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // non-leap year
    expect(Number.isNaN(daysBetween('nope', '2026-01-01'))).toBe(true);
  });

  it('steps back across month and year boundaries', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2026-10-24')).toBe('2026-10-23');
  });
});

describe('DailyChallenge: seeded run', () => {
  it('produces the same run for the same day', () => {
    const a = dailyRun({ date: atDate('2026-10-24'), unlockedIds: ['level-1', 'level-2'] });
    const b = dailyRun({ date: atDate('2026-10-24'), unlockedIds: ['level-2', 'level-1'] });
    expect(a).toEqual(b);
  });

  it('changes the run on the next day', () => {
    const keys = new Set();
    for (let day = 1; day <= 28; day += 1) {
      const key = `2026-11-${String(day).padStart(2, '0')}`;
      const run = dailyRun({ date: atDate(key), unlockedIds: ['level-1', 'level-2', 'level-3', 'level-4'] });
      keys.add(`${run.modifier.id}:${run.levelId}`);
    }
    // 28 days must not all land on the same rule + level.
    expect(keys.size).toBeGreaterThan(3);
  });

  it('only picks levels the player has unlocked, and never Endless', () => {
    for (let day = 1; day <= 20; day += 1) {
      const run = dailyRun({
        date: atDate(`2026-12-${String(day).padStart(2, '0')}`),
        unlockedIds: ['level-1', 'endless'],
      });
      expect(run.levelId).toBe('level-1');
    }
  });

  it('ships a seed that replays identically', () => {
    const random = mulberry32(seedForDay('2026-10-24'));
    const first = [random(), random(), random()];
    const again = mulberry32(seedForDay('2026-10-24'));
    expect([again(), again(), again()]).toEqual(first);
    // Different day, different stream.
    expect(mulberry32(seedForDay('2026-10-25'))()).not.toBe(first[0]);
  });

  it('every modifier is safe on every level', () => {
    const level = getLevel('level-1');
    for (const modifier of DAILY_MODIFIERS) {
      const run = applyDailyModifiers(level, modifier, '2026-10-24');
      expect(run.startingCoins).toBeGreaterThanOrEqual(60);
      expect(run.baseHealth).toBeGreaterThanOrEqual(5);
      expect(run.enemyHealthScale).toBeGreaterThan(0);
      expect(run.rewardScale).toBeGreaterThan(0);
      expect(run.daily.modifierId).toBe(modifier.id);
      expect(run.daily.gems).toBeGreaterThan(0);
    }
  });

  it('never mutates the shared level definition', () => {
    const level = getLevel('level-1');
    const before = { coins: level.startingCoins, hp: level.baseHealth };
    applyDailyModifiers(level, DAILY_MODIFIERS[1], '2026-10-24');
    expect(level.startingCoins).toBe(before.coins);
    expect(level.baseHealth).toBe(before.hp);
  });
});

describe('DailyChallenge: streak', () => {
  it('starts at 1 on the first play', () => {
    const store = new DailyStore({ storage: fakeStorage(), now: () => atDate('2026-10-24') });
    const first = store.recordPlay();
    expect(first).toMatchObject({ streak: 1, extended: false, playedToday: true });
    expect(store.currentStreak()).toBe(1);
  });

  it('increments on consecutive days', () => {
    const storage = fakeStorage();
    const day1 = new DailyStore({ storage, now: () => atDate('2026-10-24') });
    day1.recordPlay();
    const day2 = new DailyStore({ storage, now: () => atDate('2026-10-25') });
    const result = day2.recordPlay();
    expect(result.streak).toBe(2);
    expect(result.extended).toBe(true);
  });

  it('resets after a missed day', () => {
    const storage = fakeStorage();
    new DailyStore({ storage, now: () => atDate('2026-10-24') }).recordPlay();
    const later = new DailyStore({ storage, now: () => atDate('2026-10-27') });
    expect(later.recordPlay().streak).toBe(1);
    // The best streak survives the break.
    expect(later.state.bestStreak).toBe(1);
  });

  it('does not double-count a replay in the same day', () => {
    const store = new DailyStore({ storage: fakeStorage(), now: () => atDate('2026-10-24') });
    store.recordPlay();
    store.recordPlay();
    store.recordPlay();
    expect(store.state.streak).toBe(1);
    expect(Object.keys(store.state.played)).toHaveLength(1);
  });

  it('keeps yesterday alive until midnight', () => {
    const storage = fakeStorage();
    new DailyStore({ storage, now: () => atDate('2026-10-24') }).recordPlay();
    // Same save opened on the 25th, before playing: the streak is still 1.
    const morning = new DailyStore({ storage, now: () => atDate('2026-10-25') });
    expect(morning.currentStreak()).toBe(1);
    expect(morning.isPlayed()).toBe(false);
    morning.recordPlay();
    expect(morning.state.streak).toBe(2);
  });

  it('breaks the visible streak once a full day is missed', () => {
    const storage = fakeStorage();
    new DailyStore({ storage, now: () => atDate('2026-10-24') }).recordPlay();
    const skipped = new DailyStore({ storage, now: () => atDate('2026-10-26') });
    expect(skipped.currentStreak()).toBe(0);
  });

  it('pays win gems once, no matter how many replays', () => {
    const store = new DailyStore({ storage: fakeStorage(), now: () => atDate('2026-10-24') });
    store.recordPlay();
    const win = store.recordWin(undefined, { score: 900, gems: 5 });
    expect(win).toMatchObject({ gems: 5, firstWin: true, streak: 1 });
    const replay = store.recordWin(undefined, { score: 1200, gems: 5 });
    expect(replay.gems).toBe(0);
    expect(replay.firstWin).toBe(false);
    expect(store.state.bestScore).toBe(1200);
  });

  it('survives corrupt and unavailable storage', () => {
    const corrupt = fakeStorage();
    corrupt.setItem('td-dsalgo:daily:v1', '{not json');
    const store = new DailyStore({ storage: corrupt, now: () => atDate('2026-10-24') });
    expect(store.state.streak).toBe(0);
    expect(store.recordPlay().streak).toBe(1);

    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    const offline = new DailyStore({ storage: throwing, now: () => atDate('2026-10-24') });
    expect(offline.recordPlay().streak).toBe(1);
    expect(offline.isPlayed()).toBe(true);
  });
});
