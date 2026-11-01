// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
import { Tower } from '../src/entities/Tower.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';

/**
 * Boss mechanics run inside Phaser containers, but the maths lives in
 * Enemy.update(). A chainable stub stands in for the scene so the aura, the
 * freeze pulse and the status-effect timers can be exercised headlessly.
 */
function stub() {
  const target = {
    x: 0,
    y: 0,
    rotation: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    text: '',
  };
  let proxy;
  proxy = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'then') return undefined;
      const fn = () => proxy;
      obj[key] = fn;
      return fn;
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
  return proxy;
}

function makeScene() {
  const proxies = [];
  const make = () => {
    const p = stub();
    proxies.push(p);
    return p;
  };
  return {
    add: {
      container: make,
      image: make,
      sprite: make,
      rectangle: make,
      circle: make,
      text: make,
      graphics: make,
      particles: make,
    },
    anims: { exists: () => false, create: () => {}, generateFrameNumbers: () => [] },
    tweens: { add: () => {} },
    time: { delayedCall: () => {} },
    activeEnemies: [],
    activeTowers: [],
  };
}

/** A route that never ends, so the boss stays put while its timer runs. */
const parkingPath = () => new Array(4000).fill('5,0');

function spawnBoss(typeKey, callbacks = {}) {
  const scene = makeScene();
  const enemy = new Enemy(scene, typeKey, 6, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
    ...callbacks,
  });
  scene.activeEnemies.push(enemy);
  return { enemy, scene };
}

describe('campaign bosses', () => {
  it('ships three distinct, bigger, multi-phase bosses', () => {
    const keys = ['sandwyrm', 'frostwarden', 'magmalord'];
    const radii = [];
    for (const key of keys) {
      const def = ENEMY_TYPES[key];
      expect(def.isBoss).toBe(true);
      expect(def.bossPhases.length).toBeGreaterThanOrEqual(2);
      expect(def.bossPhases[0].thresholdPct).toBe(1);
      for (const phase of def.bossPhases.slice(1)) {
        expect(phase.thresholdPct).toBeGreaterThan(0);
        expect(phase.thresholdPct).toBeLessThan(1);
      }
      radii.push(def.radius);
    }
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
    // Bosses must out-stat the regular final boss' health ramp.
    expect(ENEMY_TYPES.magmalord.health).toBeGreaterThan(ENEMY_TYPES.frostwarden.health);
    expect(ENEMY_TYPES.frostwarden.health).toBeGreaterThan(ENEMY_TYPES.sandwyrm.health);
  });

  it('gives each boss its signature ability', () => {
    expect(ENEMY_TYPES.sandwyrm.bossPhases[0].ability.type).toBe('speedAura');
    expect(ENEMY_TYPES.frostwarden.bossPhases[0].ability.type).toBe('disableTowers');
    expect(ENEMY_TYPES.magmalord.bossPhases[0].ability.type).toBe('summon');
  });
});

describe('speed aura', () => {
  it('fires on its interval and hands the scene a radius + multiplier', () => {
    const calls = [];
    const { enemy } = spawnBoss('sandwyrm', {
      onSpeedAura: (boss, radius, multiplier, durationMs) =>
        calls.push({ boss, radius, multiplier, durationMs }),
    });

    for (let i = 0; i < 500; i += 1) enemy.update(16); // ~8 s
    expect(calls).toHaveLength(1);
    expect(calls[0].boss).toBe(enemy);
    expect(calls[0].radius).toBe(190);
    expect(calls[0].multiplier).toBe(1.35);
    expect(calls[0].durationMs).toBe(3500);
  });

  it('multiplies movement speed for the duration, then expires', () => {
    const { enemy } = spawnBoss('sandwyrm');
    const base = enemy.baseSpeed;

    enemy.applySpeedBoost(1.5, 1000);
    enemy.update(16);
    expect(enemy.speed).toBeCloseTo(base * 1.5, 5);

    // A second, weaker pulse must never slow the horde below the current buff.
    enemy.applySpeedBoost(1.2, 500);
    enemy.update(16);
    expect(enemy.speed).toBeCloseTo(base * 1.5, 5);

    enemy.update(1100);
    expect(enemy.speed).toBeCloseTo(base, 5);
  });

  it('stacks with a slow instead of overwriting it', () => {
    const { enemy } = spawnBoss('sandwyrm');
    enemy.applySlow?.(0.4, 5000);
    enemy.applySpeedBoost(1.5, 5000);
    enemy.update(16);
    expect(enemy.speed).toBeCloseTo(enemy.baseSpeed * (1 - enemy.slowFactor) * 1.5, 5);
  });
});

describe('tower freeze', () => {
  it('the Frost Warden pulses disableTowers and the scene can freeze towers', () => {
    const pulses = [];
    const { enemy } = spawnBoss('frostwarden', {
      onDisableTowers: (boss, radius, durationMs) => pulses.push({ boss, radius, durationMs }),
    });

    for (let i = 0; i < 600; i += 1) enemy.update(16); // ~9.6 s
    expect(pulses).toHaveLength(1);
    expect(pulses[0].radius).toBe(170);
    expect(pulses[0].durationMs).toBe(2600);
  });

  it('a disabled tower stops firing and thaws after its timer', () => {
    const scene = makeScene();
    const context = {
      economy: { coins: 999, score: 0 },
      gameState: { counters: {} },
      activeEnemies: [],
      activeProjectiles: [],
    };
    const tower = new Tower(scene, 'archer', 3, 5, context);

    expect(tower.isDisabled).toBe(false);
    expect(tower.disable(2500)).toBe(true);
    expect(tower.isDisabled).toBe(true);
    expect(tower.disabledTimer).toBe(2500);

    tower.update(1000, scene.activeEnemies);
    expect(tower.isDisabled).toBe(true);

    tower.update(1600, scene.activeEnemies);
    expect(tower.isDisabled).toBe(false);
    expect(tower.disabledTimer).toBe(0);
    // The frost tint and the dimmed container are restored on thaw.
    expect(tower.container.alpha).toBe(1);
  });

  it('a palisade cannot be frozen — it is not a firing tower', () => {
    const scene = makeScene();
    const tower = new Tower(scene, 'barricade', 5, 5, {
      economy: { coins: 999 },
      gameState: { counters: {} },
      activeEnemies: [],
      activeProjectiles: [],
    });
    expect(tower.disable(2000)).toBe(false);
    expect(tower.isDisabled).toBe(false);
  });
});

describe('endless run generator', () => {
  it('waves every fifth wave carries a boss', async () => {
    const { makeEndlessWave } = await import('../src/data/levelData.js');
    for (const n of [5, 10, 15, 20]) {
      const wave = makeEndlessWave(n);
      expect(wave.bossWave).toBe(true);
      expect(wave.groups.some((g) => ENEMY_TYPES[g.type]?.isBoss)).toBe(true);
    }
    for (const n of [1, 2, 3, 4, 6]) {
      expect(makeEndlessWave(n).bossWave).toBeFalsy();
    }
  });
});
