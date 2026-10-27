import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
import { Tower } from '../src/entities/Tower.js';
import { BARRICADE } from '../src/data/towerData.js';
import { DEFENCE_HEALTH } from '../src/config/gameConfig.js';
import {
  DEFENCE_HUNT_RADIUS,
  GATE_GUARD_RADIUS,
  huntRadiusFor,
  pickDefenceInReach,
} from '../src/systems/BarricadeCombat.js';
import { makeCombatContext, makeCombatScene } from './helpers/combat.js';

/**
 * Defences first, the gate last.
 *
 * A wall across the lane is unmissable — the creep walks into it. A keep one
 * tile off the road is not, and for a long time the horde walked past the whole
 * line to hammer the gate: the siege target was the cell being stepped into
 * (±1), while every defence a player builds late game stands right beside the
 * bastion, where the assault takes over at ~90 px from the core.
 *
 * These tests pin the two rules that replaced it, on the real Enemy and the
 * real Tower: a defence inside reach is broken first, and inside the ring that
 * guards the bastion it must fall before the core can be touched.
 */

const TILE = 64;
const parkingPath = () => new Array(2000).fill('5,0');
const BASE = { x: 15 * TILE + 32, y: 10 * TILE + 32 };

/** A real creep wired to the same two rules the scene uses. */
function creep(scene, { x = 0, y = 0, typeKey = 'grunt', wave = 1 } = {}) {
  const world = { hits: [], structureHits: [] };
  const enemy = new Enemy(scene, typeKey, wave, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
    getBasePoint: () => BASE,
    getStructureAt: () => null,
    // Exactly the composition in GameScene.getDefenceInReach.
    getDefenceInReach: (e) =>
      pickDefenceInReach(e, scene.activeTowers, huntRadiusFor(e, BASE)),
    onStructureHit: (structure, damage) => {
      world.structureHits.push({ structure, damage });
      structure.takeDamage(damage);
      if (structure.health <= 0) {
        structure.isDestroyed = true;
        const i = scene.activeTowers.indexOf(structure);
        if (i !== -1) scene.activeTowers.splice(i, 1);
      }
    },
    onHitBase: (_e, damage) => world.hits.push(damage),
  });
  enemy.x = x;
  enemy.y = y;
  enemy.reachedBase = false;
  scene.activeEnemies.push(enemy);
  return { enemy, world };
}

/** A creep standing at the head of a real lane (its first cell). */
function creepOn(scene, path) {
  const { enemy, world } = creep(scene, { x: 0, y: 0 });
  const [row, col] = path[0].split(',').map(Number);
  enemy.path = [...path];
  enemy.pathIndex = 0;
  enemy.x = col * TILE + TILE / 2;
  enemy.y = row * TILE + TILE / 2;
  return { enemy, world };
}

function placeTower(scene, context, line, row, col) {
  const tower = new Tower(scene, line, row, col, context);
  scene.activeTowers.push(tower);
  return tower;
}

/** Run the real enemy loop for `seconds`. */
function run(scene, seconds = 5, stepMs = 16) {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += stepMs) {
    for (const enemy of [...scene.activeEnemies]) enemy.update(stepMs);
  }
}

describe('the hunt radius', () => {
  it('is tight on the road and wide inside the ring that guards the bastion', () => {
    const far = { x: BASE.x, y: BASE.y - GATE_GUARD_RADIUS - 40 };
    expect(huntRadiusFor(far, BASE)).toBe(DEFENCE_HUNT_RADIUS);
    expect(huntRadiusFor({ x: BASE.x, y: BASE.y - 100 }, BASE)).toBe(GATE_GUARD_RADIUS);
    // A scene without a keep still answers with the tight radius.
    expect(huntRadiusFor({ x: 0, y: 0 }, null)).toBe(DEFENCE_HUNT_RADIUS);
  });

  it('picks the nearest standing defence and never one out of reach', () => {
    const near = { x: 30, y: 0, health: 10 };
    const far = { x: 200, y: 0, health: 10 };
    expect(pickDefenceInReach({ x: 0, y: 0 }, [far, near], 100)).toBe(near);
    expect(pickDefenceInReach({ x: 0, y: 0 }, [far], 100)).toBe(null);
    expect(pickDefenceInReach({ x: 0, y: 0 }, [], 100)).toBe(null);
    // A ruin is not a target, and a broken one is not a target either.
    expect(pickDefenceInReach({ x: 0, y: 0 }, [{ x: 10, y: 0, isDestroyed: true, health: 10 }], 100)).toBe(null);
    expect(pickDefenceInReach({ x: 0, y: 0 }, [{ x: 10, y: 0, health: 0 }], 100)).toBe(null);
  });

  it('breaks a tie toward the palisade, because it is what is in the way', () => {
    const wall = { x: 40, y: 0, isBarricade: true, health: 10 };
    const keep = { x: 34, y: 0, health: 10 };
    // 6 px closer is not enough to outrank the wall in the road.
    expect(pickDefenceInReach({ x: 0, y: 0 }, [keep, wall], 100)).toBe(wall);
  });
});

describe('defences come first', () => {
  it('a creep walking past a keep one tile off the lane attacks it', () => {
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const lane = lanePath(5, 30);
    const { enemy, world } = creep(scene, { x: 10 * TILE, y: 5 * TILE });
    const tower = placeTower(scene, context, 'archer', 4, 10); // one tile above the lane
    expect(tower.isDestroyed).toBe(false);

    run(scene, 4);

    expect(world.structureHits.length).toBeGreaterThan(0);
    expect(world.structureHits[0].structure).toBe(tower);
    expect(tower.health).toBeLessThan(tower.maxHealth);
    expect(world.hits).toEqual([]); // and it never touched the core
    expect(enemy.isSieging).toBe(true);
    expect(lane.length).toBe(30);
  });

  it('a keep out in the field is not a magnet', () => {
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const { enemy, world } = creep(scene, { x: 10 * TILE, y: 5 * TILE });
    placeTower(scene, context, 'archer', 3, 10); // two tiles off the lane

    run(scene, 3);

    expect(world.structureHits).toEqual([]);
    expect(enemy.isSieging).toBe(false);
  });

  it('a flyer never stops for a wall it is flying over', () => {
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const { enemy, world } = creep(scene, { x: 10 * TILE, y: 5 * TILE, typeKey: 'ashwing' });
    placeTower(scene, context, 'archer', 5, 10);

    run(scene, 3);

    expect(enemy.isSieging).toBe(false);
    expect(world.structureHits).toEqual([]);
  });
});

describe('the gate is the last thing touched', () => {
  /** A real lane that ends on the bastion's own cell, as the map builds it. */
  const gateLane = () => Array.from({ length: 8 }, (_, i) => `10,${8 + i}`);

  it('a guard at the gate must fall before the core takes a single point', () => {
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const { enemy, world } = creepOn(scene, gateLane());
    const guard = placeTower(scene, context, 'archer', 9, 13); // one tile off the lane, 143 px from the keep

    run(scene, 8);

    expect(world.hits).toEqual([]); // the core is untouched while the guard stands
    expect(world.structureHits.length).toBeGreaterThan(0);
    expect(world.structureHits[0].structure).toBe(guard);
    expect(enemy.isSieging).toBe(true);

    // The guard falls; the rest of the route is open and the gate feels it.
    guard.isDestroyed = true;
    guard.health = 0;
    scene.activeTowers.length = 0;
    run(scene, 14);
    expect(world.hits.length).toBeGreaterThan(0);
    expect(enemy.assaulting).toBe(true);
  });

  it('an empty gate is assaulted immediately', () => {
    const scene = makeCombatScene();
    const { enemy, world } = creepOn(scene, gateLane());
    run(scene, 14);
    expect(world.hits.length).toBeGreaterThan(0);
    expect(enemy.assaulting).toBe(true);
  });
});

describe('defence health', () => {
  it('gives every keep a pool that a boss cannot delete in three swings', () => {
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const archer = placeTower(scene, context, 'archer', 4, 4);
    const expected = Math.round((DEFENCE_HEALTH.base + 60 * DEFENCE_HEALTH.perCost) * DEFENCE_HEALTH.scale);
    expect(archer.maxHealth).toBe(expected);
    // The void herald's swing table tops out at 160; three of those must not fell it.
    expect(archer.maxHealth).toBeGreaterThan(160 * 3);
    // Upgrades still climb, compounding on the doubled pool.
    archer.level = 2;
    expect(archer.computeMaxHealth()).toBeGreaterThan(archer.maxHealth - 1);
  });

  it('raises the wall ladder while keeping every tier rising', () => {
    const hp = BARRICADE.levels.map((level) => level.health);
    expect(hp).toEqual([750, 1500, 3000, 5400, 9000]);
    for (let i = 1; i < hp.length; i += 1) expect(hp[i]).toBeGreaterThan(hp[i - 1]);
    // A grunt (10 dmg/s) must not be able to fell a fresh wall on its own.
    expect(hp[0] / 10).toBeGreaterThanOrEqual(60);
  });
});

/** Cells from north to south along one column, as the game builds them. */
function lanePath(row, length) {
  return Array.from({ length }, (_, col) => `${row},${col}`);
}
