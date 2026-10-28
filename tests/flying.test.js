import { describe, it, expect } from 'vitest';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ENGINEER_TOWER_TYPES } from '../src/data/engineerDefenses.js';
import { Tower, TARGETING_MODE } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { frostTargets } from '../src/systems/Powerups.js';
import { isGroundEnemy } from '../src/entities/Hero.js';
import { LEVELS, getLevel } from '../src/data/levelData.js';

/**
 * The airborne contract.
 *
 * A flying creep is not "a creep with a flag": it must ignore the road's
 * furniture (palisades), be invisible to every defence that cannot point up,
 * and still be killable by everything that can. These tests pin all three
 * halves of that rule, plus the art indirection that lets a new type reuse an
 * existing sheet.
 */

const ALL_TOWERS = { ...TOWER_TYPES, ...ENGINEER_TOWER_TYPES };

/** A tower shell that needs no Phaser scene: `acquireTarget` is pure data. */
function fakeTower({ targetsAir = true, ancestors = [] } = {}) {
  const tower = Object.create(Tower.prototype);
  tower.def = { targetsAir };
  // `attackRange` is a getter on the prototype (it folds in upgrades and
  // buffs), so an own data property is what shadows it on a bare shell.
  Object.defineProperty(tower, 'attackRange', { value: 200, configurable: true });
  tower.targetingMode = TARGETING_MODE.FIRST;
  tower.currentTarget = null;
  tower.x = 0;
  tower.y = 0;
  tower.scene = null;
  tower.context = { activeEnemies: ancestors };
  return tower;
}

const creep = (x, y, extra = {}) => ({
  x,
  y,
  isDead: false,
  reachedBase: false,
  health: 100,
  distanceTraveled: x,
  ...extra,
});

describe('flying archetype data', () => {
  it('ships a regular flyer that borrows a sheet instead of inventing one', () => {
    const wraith = ENEMY_TYPES.wraith;
    expect(wraith).toBeTruthy();
    expect(wraith.flying).toBe(true);
    expect(wraith.art).toBe('ashwing');
    expect(ENEMY_SHEETS[wraith.art], 'the borrowed sheet must exist').toBeTruthy();
    expect(ENEMY_SHEETS.wraith, 'no phantom sheet should be declared').toBeUndefined();
  });

  it('makes the wyvern boss airborne too, and strips its siege value', () => {
    expect(ENEMY_TYPES.ashwing.flying).toBe(true);
    expect(ENEMY_TYPES.ashwing.siege).toBe(0);
  });

  it('never lets an airborne unit carry siege damage', () => {
    for (const [key, def] of Object.entries(ENEMY_TYPES)) {
      if (!def.flying) continue;
      expect(def.siege, `${key} flies and sieges at once`).toBe(0);
    }
  });
});

describe('anti-air rule', () => {
  it('marks artillery, melee, pools and winches as ground-only', () => {
    for (const key of ['cannon', 'forge', 'venom', 'harpoon']) {
      expect(ALL_TOWERS[key].targetsAir, `${key} should be ground-only`).toBe(false);
    }
  });

  it('leaves every arrow, bolt, shard and arc able to hit the air', () => {
    for (const key of ['archer', 'crossbow', 'frost', 'runes', 'gatling', 'flamer']) {
      expect(ALL_TOWERS[key].targetsAir, `${key} should reach the sky`).not.toBe(false);
    }
  });

  it('exposes the rule on the tower itself', () => {
    const ground = Object.create(Tower.prototype);
    ground.def = ALL_TOWERS.cannon;
    expect(ground.canTargetAir).toBe(false);
    const air = Object.create(Tower.prototype);
    air.def = ALL_TOWERS.archer;
    expect(air.canTargetAir).toBe(true);
  });

  it('makes a ground-only tower ignore a flyer it would otherwise shoot', () => {
    const flyer = creep(120, 0, { flying: true, health: 50 });
    const walker = creep(60, 0, { flying: false, health: 50 });

    const cannon = fakeTower({ targetsAir: false, ancestors: [flyer, walker] });
    cannon.acquireTarget();
    expect(cannon.currentTarget).toBe(walker);

    const archer = fakeTower({ targetsAir: true, ancestors: [flyer] });
    archer.acquireTarget();
    expect(archer.currentTarget).toBe(flyer);
  });

  it('drops the target entirely when only a flyer is in range', () => {
    const cannon = fakeTower({ targetsAir: false, ancestors: [creep(90, 0, { flying: true })] });
    cannon.acquireTarget();
    expect(cannon.currentTarget).toBeNull();
  });
});

describe('airborne units ignore palisades', () => {
  it('never enters the siege state', () => {
    const flyer = { flying: true, isSieging: true, siegeTarget: { id: 1 }, siegeTimer: 50 };
    // The guard is the first branch of updateSiege: no scene is needed.
    const result = Enemy.prototype.updateSiege.call(flyer, 16);
    expect(result).toBe(false);
    expect(flyer.isSieging).toBe(false);
    expect(flyer.siegeTarget).toBeNull();
    expect(flyer.siegeTimer).toBe(0);
  });
});

describe('spells and hero respect the sky', () => {
  it('does not slow airborne creeps with Frost Surge', () => {
    const hits = frostTargets(
      [
        { x: 10, y: 10, isDead: false, reachedBase: false, flying: true },
        { x: 12, y: 10, isDead: false, reachedBase: false },
      ],
      10,
      10,
      50
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].flying).toBeUndefined();
  });

  it('never lets the hero strike a flyer', () => {
    expect(isGroundEnemy({ flying: true })).toBe(false);
    expect(isGroundEnemy({ def: { flying: true } })).toBe(false);
    expect(isGroundEnemy({})).toBe(true);
  });
});

describe('the campaign fields the flyer', () => {
  const spawnsOf = (level) =>
    level.waves.flatMap((wave) => (wave.groups || []).map((group) => group.type));

  it('fields the wraith across the campaign, always after the opening waves', () => {
    // It used to be a stage-5 exclusive. That made the air rule a curiosity and
    // left four stages where a dock of ground-only guns was never wrong — see
    // systems/AirRoutes.js. The debut is still late in each stage, because the
    // first two waves are the build-up, not the exam.
    const withWraith = LEVELS.filter((level) => spawnsOf(level).includes('wraith'));
    expect(withWraith.map((level) => level.id)).toContain('level-5');
    expect(withWraith.length).toBeGreaterThanOrEqual(4);
    for (const level of withWraith) {
      const first = level.waves.findIndex((wave) => wave.groups.some((group) => group.type === 'wraith'));
      expect(first, `${level.id} opens with flyers`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Target acquisition does not allocate', () => {
  it('reuses one entry per creep in reach across every tick', () => {
    const creeps = [creep(40, 0), creep(80, 0), creep(120, 0)];
    const tower = fakeTower({ ancestors: creeps });
    tower.acquireTarget();
    const list = tower._inRange;
    const entries = list.slice();

    for (let tick = 0; tick < 200; tick += 1) {
      for (const c of creeps) c.x = 40 + Math.sin(tick / 7) * 10;
      tower.acquireTarget();
      // The same array and the same entry objects, every tick.
      expect(tower._inRange).toBe(list);
    }
    expect(list).toHaveLength(3);
    for (let i = 0; i < entries.length; i += 1) {
      expect(list[i]).toBe(entries[i]);
    }
    // …and the values are still live, not frozen at the first tick.
    expect(list[0].enemy).toBe(tower.currentTarget);
    expect(tower.currentTarget).toBeTruthy();
  });

  it('shrinks the list when creeps die without leaking stale targets', () => {
    const a = creep(40, 0);
    const b = creep(60, 0);
    const tower = fakeTower({ ancestors: [a, b] });
    tower.acquireTarget();
    expect(tower._inRange).toHaveLength(2);
    b.isDead = true;
    tower.acquireTarget();
    expect(tower._inRange).toHaveLength(1);
    expect(tower._inRange[0].enemy).toBe(a);
    tower.context.activeEnemies = [];
    tower.acquireTarget();
    expect(tower.currentTarget).toBeNull();
    expect(tower._inRange).toHaveLength(0);
  });
});
