import { describe, it, expect } from 'vitest';
import {
  POWER_WEIGHTS,
  commanderLevel,
  formatMetric,
  playerMetrics,
  totalStars,
} from '../src/systems/PlayerMetrics.js';
import { createProfile } from '../src/systems/Progression.js';

/**
 * The ranking is only as honest as the numbers it sorts on. These tests pin the
 * ladder: one weight table, one commander-level rule, and the property that
 * matters most — buying something never lowers your power.
 */

function profile(overrides = {}) {
  return { ...createProfile(), ...overrides };
}

describe('player metrics', () => {
  it('a brand-new save is one rank-1 hero, level 1, zero stars', () => {
    const metrics = playerMetrics(createProfile());
    expect(metrics.power).toBe(POWER_WEIGHTS.heroRank); // the free Vanguard at rank 1
    expect(metrics.level).toBe(1);
    expect(metrics.stars).toBe(0);
    expect(metrics.bestScore).toBe(0);
    expect(metrics.waves).toBe(0);
    expect(metrics.achievements).toBe(0);
  });

  it('counts stars, medals, hero ranks, companion levels, relics, gems and waves', () => {
    const metrics = playerMetrics(
      profile({
        stars: { 'level-1': 3, 'level-2': 2 },
        achievements: ['first-blood', 'perfect-run'],
        heroRanks: { vanguard: 3, ranger: 2 },
        heroes: ['vanguard', 'ranger'],
        petLevels: { boomer: 4 },
        pets: ['boomer'],
        relics: { 'war-drum': 2 },
        gems: 30,
        endlessBestWave: 12,
        endlessBestScore: 4200,
        bestScore: { 'level-1': 3100 },
      })
    );

    expect(metrics.stars).toBe(5);
    expect(metrics.achievements).toBe(2);
    expect(metrics.waves).toBe(12);
    expect(metrics.bestScore).toBe(4200); // endless best is the best run
    expect(metrics.power).toBe(
      (3 + 2) * POWER_WEIGHTS.heroRank +
        4 * POWER_WEIGHTS.petLevel +
        2 * POWER_WEIGHTS.relicLevel +
        5 * POWER_WEIGHTS.star +
        2 * POWER_WEIGHTS.achievement +
        30 * POWER_WEIGHTS.gem +
        12 * POWER_WEIGHTS.endlessWave
    );
  });

  it('never drops when gold is spent (gold is not in the ladder)', () => {
    const rich = playerMetrics(profile({ gold: 9000, heroRanks: { vanguard: 2 } }));
    const poor = playerMetrics(profile({ gold: 0, heroRanks: { vanguard: 2 } }));
    expect(poor.power).toBe(rich.power);
  });

  it('commander level rises with clears and with extra stars', () => {
    expect(commanderLevel(profile({}))).toBe(1);
    expect(commanderLevel(profile({ stars: { 'level-1': 1 } }))).toBe(2);
    // One level per clear; two extra stars above a first star are not yet
    // another level, the third one is.
    expect(commanderLevel(profile({ stars: { 'level-1': 3 } }))).toBe(2);
    expect(commanderLevel(profile({ stars: { 'level-1': 3, 'level-2': 3 } }))).toBe(4); // 1 + 2 clears + 4/3
    expect(commanderLevel(profile({ stars: { 'level-1': 3, 'level-2': 3, 'level-3': 3 } }))).toBe(6);
    const perfect = playerMetrics(
      profile({
        stars: { 'level-1': 3, 'level-2': 3, 'level-3': 3, 'level-4': 3, 'level-5': 3 },
      })
    );
    expect(perfect.level).toBe(9);
    expect(perfect.stars).toBe(15);
  });

  it('clamps junk instead of producing NaN', () => {
    const metrics = playerMetrics({
      stars: { a: 'x', b: 99, c: -3 },
      achievements: [null, 42, 'ok', 'ok'],
      heroRanks: { vanguard: 'NaN' },
      gems: 'many',
      endlessBestWave: -4,
      bestScore: { 'level-1': 'lots' },
    });
    expect(Number.isFinite(metrics.power)).toBe(true);
    expect(metrics.stars).toBe(3); // the 99 is clamped to 3★
    expect(metrics.achievements).toBe(1); // only the string survives, de-duplicated
    expect(metrics.waves).toBe(0);
    expect(metrics.bestScore).toBe(0);
  });

  it('totalStars reads the star map, not the level list', () => {
    expect(totalStars({ stars: { 'level-1': 3, 'level-2': 1 } })).toBe(4);
    expect(totalStars({})).toBe(0);
    expect(totalStars({ stars: [] })).toBe(0);
  });

  it('formats thousands for the ranking', () => {
    expect(formatMetric(0)).toBe('0');
    expect(formatMetric(1240)).toBe('1,240');
    expect(formatMetric('nope')).toBe('0');
  });
});
