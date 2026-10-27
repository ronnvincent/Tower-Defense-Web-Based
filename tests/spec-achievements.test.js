import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, getAchievement } from '../src/data/achievements.js';
import {
  DEFAULT_STATS,
  normalizeStats,
  evaluateAchievements,
  achievementProgress,
} from '../src/systems/Achievements.js';

/**
 * The six medals the master brief asks for, by the name it gives them.
 *
 * A medal is only real if a *stat that the game actually increments* is above
 * its target, so each row below names the metric as well as the label. The
 * tracking call sites are covered in `tests/achievements.test.js` and by the
 * scene wiring (`trackStats` on upgrade, on spell cast, on victory).
 */

const SPEC = [
  { label: 'First Victory', id: 'first-victory', metric: 'victories' },
  { label: 'Untouched Bastion', id: 'hold-the-line', metric: 'flawlessVictories' },
  { label: 'Tower Master', id: 'tower-master', metric: 'maxedTowers' },
  { label: 'Arcane Arsenal', id: 'arcane-arsenal', metric: 'spellsCast' },
  { label: 'Boss Slayer', id: 'boss-slayer', metric: 'bossesKilled' },
];

describe('spec achievements', () => {
  it('ships every medal under the name the brief uses', () => {
    for (const row of SPEC) {
      const def = getAchievement(row.id);
      expect(def, `${row.label} missing`).toBeTruthy();
      expect(def.name).toBe(row.label);
      expect(def.metric).toBe(row.metric);
      expect(def.target).toBeGreaterThan(0);
      expect(def.gems).toBeGreaterThan(0);
    }
  });

  it('tracks the two new metrics as real lifetime counters', () => {
    expect(DEFAULT_STATS.maxedTowers).toBe(0);
    expect(DEFAULT_STATS.spellsCast).toBe(0);
    const normalized = normalizeStats({ maxedTowers: 2, spellsCast: 7 });
    expect(normalized.maxedTowers).toBe(2);
    expect(normalized.spellsCast).toBe(7);
  });

  it('unlocks Tower Master only when a tower is finished', () => {
    const ids = (stats, paid = []) => evaluateAchievements(stats, paid).map((a) => a.id);
    expect(ids({ maxedTowers: 0 })).not.toContain('tower-master');
    expect(ids({ maxedTowers: 1 })).toContain('tower-master');
  });

  it('unlocks Arcane Arsenal on the tenth spell, not the ninth', () => {
    const ids = (stats) => evaluateAchievements(stats, []).map((a) => a.id);
    expect(ids({ spellsCast: 9 })).not.toContain('arcane-arsenal');
    expect(ids({ spellsCast: 10 })).toContain('arcane-arsenal');
  });

  it('never pays the same medal twice', () => {
    const earned = evaluateAchievements({ spellsCast: 10, maxedTowers: 3 }, []).map((a) => a.id);
    expect(earned).toContain('arcane-arsenal');
    const again = evaluateAchievements({ spellsCast: 40, maxedTowers: 3 }, earned).map((a) => a.id);
    expect(again).not.toContain('arcane-arsenal');
  });

  it('shows real progress towards a medal that is still locked', () => {
    const def = getAchievement('arcane-arsenal');
    const progress = achievementProgress(def, { spellsCast: 4 });
    expect(progress.value).toBe(4);
    expect(progress.target).toBe(10);
    expect(progress.done).toBe(false);
    expect(progress.ratio).toBeCloseTo(0.4, 5);
  });

  it('keeps the whole catalogue uniquely identified', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of ACHIEVEMENTS) expect(DEFAULT_STATS).toHaveProperty(def.metric);
  });
});
