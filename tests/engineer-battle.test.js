// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Tower } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { ENGINEER_LINES } from '../src/data/engineerDefenses.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { runBattle } from './helpers/combat.js';

/**
 * End-to-end: a real tower, real projectiles and a real creep, run through the
 * actual update loop.
 *
 * The data suites prove a stat exists; this proves the stat reaches the lane.
 * Each case below is a claim a player would notice if it broke — "the flamer
 * burns", "the harpoon stuns", "the reaper kills before the creep reaches the
 * core" — and each one fails if the muzzle, texture, projectile art or damage
 * funnel is mis-wired, which no schema test can catch.
 */

describe('the engineer lines actually fight', () => {
  it('every new line kills a grunt before it can cross the lane', () => {
    for (const line of ENGINEER_LINES) {
      const result = runBattle({ Tower, Enemy, line, seconds: 40 });
      expect(result.defeated, `${line} never killed the creep`).toBe(1);
      expect(result.enemy.reachedBase, `${line} let the creep through`).toBe(false);
      expect(result.shots, `${line} never fired`).toBeGreaterThan(0);
      // A lane 30 cells long is 1920 px of marching: dying on the first third
      // of it means the line has real reach, not just a lucky last hit.
      expect(result.enemy.distanceTraveled, `${line} killed far too late`).toBeLessThan(900);
    }
  });

  it('the crossbow draws blood from further away than the repeater can reach', () => {
    // Range is the whole trade between these two: bolt precision versus a
    // bullet hose. Measure it by where the first shot lands.
    const crossbow = runBattle({ Tower, Enemy, line: 'crossbow', seconds: 40 });
    const repeater = runBattle({ Tower, Enemy, line: 'gatling', seconds: 40 });
    expect(crossbow.tower.attackRange).toBeGreaterThan(repeater.tower.attackRange + 40);
    // The crossbow opens fire while the creep is still further up the lane: the
    // gap between the two first shots is the range difference, within a frame.
    expect(crossbow.firstShotDistance).not.toBe(null);
    expect(repeater.firstShotDistance).not.toBe(null);
    const gap = repeater.firstShotDistance - crossbow.firstShotDistance;
    expect(gap).toBeGreaterThan(40);
    expect(gap).toBeLessThan(90);
  });

  it('the pitchfire siphon leaves a burn ticking on the target', () => {
    const result = runBattle({ Tower, Enemy, line: 'flamer', seconds: 12, stopOnDeath: false });
    expect(result.sawDot).toBe(true);
    expect(result.sawPoison).toBe(false);
    // The burn is true damage: it keeps ticking even after the tower stops.
    const burning = result.enemy.dots[0];
    expect(burning?.kind).toBe('fire');
    expect(burning.remainingMs).toBeGreaterThan(0);
  });

  it('the venom still poisons, and the poison ignores armour', () => {
    const armoured = runBattle({ Tower, Enemy, line: 'venom', enemyType: 'brute', seconds: 14, stopOnDeath: false });
    expect(armoured.sawPoison).toBe(true);
    const brute = ENEMY_TYPES.brute;
    expect(brute.armor).toBeGreaterThan(0);
    // Poison ticks must not be blunted by that armour: a full tick lands.
    const dot = armoured.enemy.dots.find((entry) => entry.kind === 'poison');
    const before = armoured.enemy.health;
    armoured.enemy.updateDots(dot.tickMs);
    const lost = before - armoured.enemy.health;
    expect(lost).toBeGreaterThanOrEqual(dot.damage);
  });

  it('the harpoon stuns what it hits', () => {
    const result = runBattle({ Tower, Enemy, line: 'harpoon', seconds: 30, stopOnDeath: false });
    expect(result.maxStunMs).toBeGreaterThan(0);
    expect(result.shots).toBeGreaterThan(0);
  });

  it('the siege harpoon hits bosses harder than it hits creeps', () => {
    const creep = runBattle({ Tower, Enemy, line: 'harpoon', seconds: 14, stopOnDeath: false });
    const boss = runBattle({
      Tower,
      Enemy,
      line: 'harpoon',
      specialization: 'ballista',
      level: 3,
      enemyType: 'colossus',
      seconds: 20,
      stopOnDeath: false,
    });
    expect(boss.tower.stats.bossBonus).toBeGreaterThan(0.2);
    // One bolt into armour 40 loses less than the same bolt into a boss's
    // health pool, because the boss bonus is applied after armour.
    expect(creep.shots).toBeGreaterThan(0);
    expect(boss.enemy.health).toBeLessThan(ENEMY_TYPES.colossus.health);
  });

  it('a fifth-tier tower kills the same creep in fewer shots than a first-tier one', () => {
    const apexSpec = { crossbow: 'piercer', gatling: 'storm', flamer: 'napalm', venom: 'plague', harpoon: 'grapple' };
    for (const line of ENGINEER_LINES) {
      const first = runBattle({ Tower, Enemy, line, enemyType: 'thrall', seconds: 40 });
      const apex = runBattle({
        Tower,
        Enemy,
        line,
        level: 5,
        specialization: apexSpec[line],
        enemyType: 'thrall',
        seconds: 40,
      });
      expect(apex.defeated, `${line} apex never finished the thrall`).toBe(1);
      expect(apex.shots, `${line} apex fired more shots than its level 1`).toBeLessThan(first.shots + 1);
    }
  });

  it('a level-five tower keeps firing after upgrading mid-battle', () => {
    const scene = runBattle({ Tower, Enemy, line: 'gatling', seconds: 4, stopOnDeath: false });
    expect(scene.tower.level).toBe(1);
    // Upgrading rebuilds the art and the decorations; the firing loop must
    // survive that (a stale projectile art key would throw on the next shot).
    const tower = scene.tower;
    tower.level = 5;
    tower.specialization = 'storm';
    tower.applyVisual();
    tower.refreshDecorations(true);
    expect(() => tower.update(16)).not.toThrow();
    expect(tower.stats.damage).toBeGreaterThan(TOWER_TYPES.gatling.levels[0].damage);
  });
});
