import { describe, it, expect } from 'vitest';
import { Tower } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { ASSAULT_RANGE, assaultRing } from '../src/systems/BarricadeCombat.js';
import { makeCombatContext, makeCombatScene } from './helpers/combat.js';

/**
 * The gate rule.
 *
 * A creep that breaks the line does not walk into the keep: it parks on a ring
 * around it so twenty attackers read as a siege instead of one pixel of
 * overlap. The ring lives inside the no-build moat, which is exactly where the
 * player may not raise a defence — so an attacker on the far side of the keep
 * stands further away than any weapon's range, and the line goes silent with
 * every tower intact while the core bleeds out.
 *
 * That was the reported bug: "my barricade breaks, the monsters come through
 * the hole, and my defences just let the base die." These tests pin the rule
 * that replaced it, on the real Tower and the real Enemy: a defence that covers
 * the gate answers the creeps hitting the gate, and nothing else changes.
 */

const TILE = 64;
const parkingPath = () => new Array(2000).fill('5,0');

/** A real lane with the keep at the far end, so `getCurrentCellKey` is real. */
function world({ towers = [], base = { row: 10, col: 15 } } = {}) {
  const scene = makeCombatScene();
  const context = makeCombatContext(scene);
  const basePoint = { x: base.col * TILE + TILE / 2, y: base.row * TILE + TILE / 2 };
  // The scene hands both entities the same point, exactly like GameScene does.
  context.getBasePoint = () => basePoint;
  context.callbacks = { getBasePoint: () => basePoint };

  const built = towers.map(([line, row, col]) => {
    const tower = new Tower(scene, line, row, col, context);
    tower.cooldownTimer = 0;
    tower.context.getBasePoint = () => basePoint;
    scene.activeTowers.push(tower);
    return tower;
  });

  return { scene, context, basePoint, towers: built };
}

/**
 * A real creep parked on the assault ring, as if it had just broken through.
 *
 * `assaultPoint` is what `Enemy.updateBaseAssault` derives from the bearing it
 * arrived on; setting it directly puts the creep on the exact slot the game
 * would have walked it to.
 */
function creepsOnRing(scene, basePoint, { count = 1, bearing = Math.PI / 2, typeKey = 'grunt', wave = 1 } = {}) {
  const made = [];
  for (let i = 1; i <= count; i += 1) {
    const enemy = new Enemy(scene, typeKey, wave, parkingPath(), {
      onReachedBase: () => {},
      onDefeated: () => {},
      getBasePoint: () => basePoint,
    });
    const ring = assaultRing(enemy.id, ASSAULT_RANGE, bearing);
    enemy.assaultPoint = {
      x: basePoint.x + Math.cos(ring.angle) * ring.radius,
      y: basePoint.y + Math.sin(ring.angle) * ring.radius,
    };
    enemy.x = enemy.assaultPoint.x;
    enemy.y = enemy.assaultPoint.y;
    enemy.assaulting = true;
    scene.activeEnemies.push(enemy);
    made.push(enemy);
  }
  return made;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Run the real tower → projectile loop for `seconds` and count real shots. */
function run(context, towers, seconds = 3, stepMs = 16) {
  let shots = 0;
  for (const tower of towers) {
    const fire = tower.fire.bind(tower);
    tower.fire = (target) => {
      shots += 1;
      return fire(target);
    };
  }
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += stepMs) {
    for (const tower of towers) tower.update(stepMs);
    for (const projectile of context.activeProjectiles) projectile.update(stepMs);
    context.activeProjectiles = context.activeProjectiles.filter((p) => !p.isDead);
  }
  return shots;
}

describe('a defence that covers the gate answers the creeps hitting the gate', () => {
  it('fires at a creep standing on the far side of the assault ring', () => {
    // Two archers face each other across the keep, the way a player rings it.
    // The creep arrives from the east, so the west tower is the one whose
    // nominal range does not reach the ring — before the rule it simply stood
    // there while the core was demolished.
    const { scene, basePoint, towers } = world({
      towers: [
        ['archer', 10, 13],
        ['archer', 10, 17],
      ],
    });
    const [west, east] = towers;
    const [creep] = creepsOnRing(scene, basePoint, { // bearing π/2 → due south... use east instead
    });

    // Place the creep on the east slot explicitly: the west tower's own range
    // must fall short of it, or this test proves nothing.
    creep.x = basePoint.x + ASSAULT_RANGE;
    creep.y = basePoint.y;
    expect(distance(west, creep)).toBeGreaterThan(west.attackRange);
    expect(distance(west, basePoint)).toBeLessThanOrEqual(west.attackRange);
    expect(distance(east, creep)).toBeLessThan(east.attackRange);

    west.acquireTarget();
    expect(west.currentTarget).toBe(creep);
  });

  it('leaves a creep that is not attacking the gate alone', () => {
    const { scene, basePoint, towers } = world({ towers: [['archer', 10, 13]] });
    const [west] = towers;
    const [creep] = creepsOnRing(scene, basePoint);
    // Same spot, but it is only walking past on its way somewhere else.
    creep.assaulting = false;

    west.acquireTarget();
    expect(west.currentTarget).toBe(null);
  });

  it('does not extend the range of a defence that cannot see the gate', () => {
    // Four tiles up the lane: the keep is outside its range, so the fight at
    // the gate is somebody else's. Range is not silently global.
    const { scene, basePoint, towers } = world({ towers: [['archer', 4, 15]] });
    const [far] = towers;
    const [creep] = creepsOnRing(scene, basePoint);
    expect(distance(far, basePoint)).toBeGreaterThan(far.attackRange);

    far.acquireTarget();
    expect(far.currentTarget).toBe(null);
  });

  it('keeps the ground/air rule even for a flyer bombing the gate', () => {
    const { scene, basePoint, towers } = world({ towers: [['cannon', 10, 13]] });
    const [gun] = towers;
    const [flyer] = creepsOnRing(scene, basePoint, { typeKey: 'ashwing' });
    flyer.assaulting = true;

    gun.acquireTarget();
    // Whatever the wyrm's category, a gate rule must never teach a ground gun
    // to shoot the air: the answer has to come from `canEngage`, not from here.
    expect(gun.canEngage(flyer)).toBe(false);
    expect(gun.currentTarget).toBe(null);
  });

  it('opens fire for real — the ring attacker takes damage', () => {
    const sceneFrame = world({ towers: [['archer', 10, 13]] });
    const { scene, basePoint, towers } = sceneFrame;
    const [creep] = creepsOnRing(scene, basePoint);
    const before = creep.health;
    const shots = run(sceneFrame.context, towers, 3);
    expect(shots).toBeGreaterThan(0);
    expect(creep.health).toBeLessThan(before);
  });

  it('holds the ordinary rule for a creep beyond range that is not at the gate', () => {
    const { scene, basePoint, towers } = world({ towers: [['archer', 10, 13]] });
    const [creep] = creepsOnRing(scene, basePoint);
    creep.assaulting = false;
    creep.x = basePoint.x - 400;
    expect(towers[0].currentTarget).toBe(null);
    towers[0].acquireTarget();
    expect(towers[0].currentTarget).toBe(null);
  });
});

describe('the cooldown clock never settles on a stale negative', () => {
  it('clamps to zero instead of freezing at -30', () => {
    const { scene, towers } = world({ towers: [['archer', 9, 12]] });
    const [tower] = towers;
    tower.cooldownTimer = 20;
    // A 50 ms frame against a 20 ms timer: the old subtraction left -30 here
    // and every later frame skipped the block because it only ran while > 0.
    tower.update(50);
    expect(tower.cooldownTimer).toBe(0);
    tower.update(16);
    expect(tower.cooldownTimer).toBe(0);
    expect(scene.activeEnemies.length).toBe(0);
  });
});
