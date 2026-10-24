import { describe, it, expect } from 'vitest';
import {
  ENEMY_TYPES,
  waveHealthMultiplier,
  endlessHealthScale,
  endlessSpeedScale,
  endlessRewardScale,
} from '../src/data/enemyData.js';
import {
  ENDLESS_BOSSES,
  ENDLESS_TITANS,
  TITAN_FIRST_CYCLE,
  TITAN_PAIR_CYCLE,
  ENDLESS_LEVEL,
  makeEndlessWave,
  countEndlessEnemies,
} from '../src/data/levelData.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';

/**
 * Endless difficulty contract.
 *
 * The mode had one real problem: every ramp it owned stopped climbing. The
 * campaign HP curve is capped at 2× (waves 12+), the wave generator capped its
 * reinforcements at 18 bodies and the boss rotation never changed — so wave 20
 * was wave 5 with a longer queue. These tests pin the replacement: uncapped
 * stats, a cadence that tightens with depth, and titans from the fourth boss
 * cycle onwards.
 */

describe('endless stat ramps', () => {
  it('never stops climbing, unlike the capped campaign curve', () => {
    expect(waveHealthMultiplier(40)).toBe(2); // campaign: flat from wave 12
    expect(endlessHealthScale(40)).toBeGreaterThan(endlessHealthScale(20));
    expect(endlessHealthScale(20)).toBeGreaterThan(endlessHealthScale(10));
    expect(endlessHealthScale(10)).toBeGreaterThan(1);
    // Wave 20 must be a real wall, not a rounding error.
    expect(endlessHealthScale(20)).toBeGreaterThan(4);
    expect(endlessHealthScale(50)).toBeGreaterThan(12);
  });

  it('raises speed slowly and caps it so the horde stays readable', () => {
    expect(endlessSpeedScale(1)).toBe(1);
    expect(endlessSpeedScale(20)).toBeGreaterThan(1.3);
    for (const wave of [30, 50, 80, 200]) {
      expect(endlessSpeedScale(wave)).toBeLessThanOrEqual(1.75);
    }
  });

  it('pays a bounty that tracks the health ramp', () => {
    expect(endlessRewardScale(1)).toBe(1);
    expect(endlessRewardScale(20)).toBeGreaterThan(2);
    expect(endlessRewardScale(40)).toBeGreaterThan(endlessRewardScale(20));
  });
});

describe('endless titans', () => {
  it('ships two bosses that out-stat the campaign set', () => {
    const campaignBoss = ENEMY_TYPES.prismlord;
    for (const key of ENDLESS_TITANS) {
      const def = ENEMY_TYPES[key];
      expect(def, `${key} missing from ENEMY_TYPES`).toBeTruthy();
      expect(def.isBoss).toBe(true);
      expect(def.health).toBeGreaterThan(campaignBoss.health);
      expect(def.radius).toBeGreaterThan(ENEMY_TYPES.grunt.radius * 1.5);
      expect(def.bossPhases.length).toBeGreaterThanOrEqual(4);
      expect(def.bossPhases[0].thresholdPct).toBe(1);
      for (const phase of def.bossPhases.slice(1)) {
        expect(phase.thresholdPct).toBeGreaterThan(0);
        expect(phase.thresholdPct).toBeLessThan(1);
      }
      // Every phase has to do something: a threshold with no payload is dead
      // weight in the fight.
      for (const phase of def.bossPhases.slice(1)) {
        const payload =
          phase.grantShield || phase.speedMultiplier || phase.armor !== undefined || phase.ability;
        expect(payload, `${key} ${phase.name} does nothing`).toBeTruthy();
      }
      // Art exists for every titan: no invisible boss on the field.
      expect(ENEMY_SHEETS[key]).toBeTruthy();
    }
  });

  it('gives each titan a distinct signature', () => {
    expect(ENEMY_TYPES.obsidian.bossPhases[0].ability.type).toBe('summon');
    expect(ENEMY_TYPES.voidherald.bossPhases[0].ability.type).toBe('disableTowers');
    expect(ENEMY_TYPES.obsidian.armor).toBeGreaterThan(ENEMY_TYPES.voidherald.armor);
    expect(ENEMY_TYPES.voidherald.baseDamage).toBeGreaterThan(ENEMY_TYPES.obsidian.baseDamage);
  });
});

describe('endless wave curve', () => {
  it('keeps the boss every fifth wave rule for the first twenty waves', () => {
    for (let n = 1; n <= 20; n += 1) {
      const wave = makeEndlessWave(n);
      expect(wave.groups.length).toBeGreaterThan(0);
      expect(Boolean(wave.bossWave)).toBe(n % 5 === 0);
      for (const group of wave.groups) {
        expect(group.count).toBeGreaterThan(0);
        expect(ENEMY_TYPES[group.type], `${group.type} is not a real creep`).toBeTruthy();
      }
    }
  });

  it('rotates the campaign five, then adds titans on top', () => {
    // Wave 5 / 10 / 15: campaign bosses only, no titan yet.
    for (const wave of [5, 10, 15]) {
      const types = makeEndlessWave(wave).groups.map((group) => group.type);
      for (const titan of ENDLESS_TITANS) expect(types).not.toContain(titan);
    }
    // From TITAN_FIRST_CYCLE the boss wave carries one titan…
    const first = TITAN_FIRST_CYCLE * 5 + 5; // cycle 3 closes on wave 20
    for (const wave of [first, first + 5, first + 10]) {
      const types = makeEndlessWave(wave).groups.map((group) => group.type);
      expect(types.filter((type) => ENDLESS_TITANS.includes(type)).length).toBe(1);
    }
    // …and from TITAN_PAIR_CYCLE both of them walk in together.
    const pairWave = TITAN_PAIR_CYCLE * 5 + 5; // wave 45
    const pairTypes = makeEndlessWave(pairWave).groups.map((group) => group.type);
    for (const titan of ENDLESS_TITANS) expect(pairTypes).toContain(titan);
    expect(makeEndlessWave(pairWave).bossWave).toBe(true);
  });

  it('still rotates the campaign bosses as the anchor of a boss wave', () => {
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const wave = makeEndlessWave(cycle * 5 + 5);
      expect(wave.bossKey).toBe(ENDLESS_BOSSES[cycle % ENDLESS_BOSSES.length]);
      expect(wave.groups.some((group) => group.type === wave.bossKey)).toBe(true);
    }
  });

  it('grows the horde with depth instead of plateauing', () => {
    expect(countEndlessEnemies(20)).toBeGreaterThan(countEndlessEnemies(10));
    expect(countEndlessEnemies(40)).toBeGreaterThan(countEndlessEnemies(20));
    expect(countEndlessEnemies(60)).toBeGreaterThan(countEndlessEnemies(40));
  });

  it('tightens the spawn cadence as the run goes on', () => {
    const cadence = (n) =>
      makeEndlessWave(n).groups
        .filter((group) => group.type === 'swarm')
        .reduce((sum, group) => sum + group.interval, 0);
    expect(cadence(22)).toBeLessThan(cadence(2));
    expect(cadence(50)).toBeLessThan(cadence(20));
  });

  it('spawns nothing the art pipeline does not ship', () => {
    for (let n = 1; n <= 60; n += 1) {
      const wave = makeEndlessWave(n);
      for (const group of wave.groups) {
        expect(ENEMY_SHEETS[group.type], `wave ${n} spawns "${group.type}"`).toBeTruthy();
      }
      if (wave.bossKey) expect(ENEMY_SHEETS[wave.bossKey]).toBeTruthy();
    }
  });
});

describe('endless level', () => {
  it('funds a bigger battlefield', () => {
    expect(ENDLESS_LEVEL.map).toBe('volcanic');
    expect(ENDLESS_LEVEL.startingCoins).toBeGreaterThanOrEqual(300);
    expect(ENDLESS_LEVEL.baseHealth).toBe(25);
  });
});
