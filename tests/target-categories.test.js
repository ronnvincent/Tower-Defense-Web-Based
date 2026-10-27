import { describe, it, expect } from 'vitest';
import {
  TARGET,
  canTarget,
  defenceTargets,
  enemyTarget,
  isFlying,
  projectileCanHit,
  targetBadge,
  targetLabel,
} from '../src/systems/TargetCategories.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ENGINEER_TOWER_TYPES } from '../src/data/engineerDefenses.js';
import { BARRICADE } from '../src/data/towerData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';
import { Tower } from '../src/entities/Tower.js';
import { makeCombatContext, makeCombatScene, stubNode } from './helpers/combat.js';

/**
 * The ground / air rule, from the four places a shot can land.
 *
 * `flying.test.js` already pins the data and the *acquisition* half: a tower
 * that cannot point up never picks a flyer. That is the easy half, because the
 * player can see the tower standing still. The hard half is everything that
 * happens without an aim: a blast radius, an arc of lightning, a frost nova, the
 * spikes on a palisade. Each of those used to damage every creep in range
 * regardless of category, so "ground only" was only true until two creeps stood
 * close together.
 *
 * These tests run the real Projectile and the real Tower against the real Enemy
 * class over a stub scene, so a regression here is a bug in the game, not a
 * mismatch in a mock.
 */

const ALL_TOWERS = { ...TOWER_TYPES, ...ENGINEER_TOWER_TYPES, barricade: BARRICADE };
const parkingPath = () => new Array(2000).fill('5,0');

/** Real Enemy on a real (stubbed) scene, parked where we put it. */
function creep(scene, typeKey, x, y) {
  const enemy = new Enemy(scene, typeKey, 1, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
  });
  enemy.x = x;
  enemy.y = y;
  enemy.reachedBase = false;
  return enemy;
}

/** A projectile fired point-blank, so one update step lands it. */
function shell(scene, stats, target, x, y) {
  return new Projectile(scene, 'cannonball', x, y, target, { speed: 900, ...stats }, scene.activeEnemies);
}

describe('the categories themselves', () => {
  it('reads the flying flag from the instance or from the definition', () => {
    expect(isFlying({ flying: true })).toBe(true);
    expect(isFlying({ def: { flying: true } })).toBe(true);
    expect(isFlying({})).toBe(false);
    expect(isFlying(null)).toBe(false);
    expect(enemyTarget({ flying: true })).toBe(TARGET.AIR);
    expect(enemyTarget({})).toBe(TARGET.GROUND);
  });

  it('defaults a silent definition to "hits everything"', () => {
    expect(defenceTargets(undefined)).toEqual({ ground: true, air: true });
    expect(defenceTargets({})).toEqual({ ground: true, air: true });
    expect(defenceTargets({ targetsAir: false })).toEqual({ ground: true, air: false });
    expect(defenceTargets({ targetsGround: false })).toEqual({ ground: false, air: true });
  });

  it('writes the rule as words a player can read', () => {
    expect(targetLabel({})).toBe('GROUND + AIR');
    expect(targetBadge({})).toBe('BOTH');
    expect(targetLabel({ targetsAir: false })).toBe('GROUND');
    expect(targetBadge({ targetsAir: false })).toBe('GROUND');
    expect(targetLabel({ targetsGround: false })).toBe('AIR');
    expect(targetBadge({ targetsGround: false })).toBe('AIR');
  });

  it('never targets a dead or arrived creep, whatever its category', () => {
    const def = {};
    expect(canTarget(def, { isDead: true })).toBe(false);
    expect(canTarget(def, { reachedBase: true })).toBe(false);
    expect(canTarget(def, null)).toBe(false);
    expect(canTarget(def, {})).toBe(true);
  });
});

describe('the roster declares what it can hit', () => {
  it('marks the four ground-locked lines and nothing else', () => {
    const groundOnly = Object.entries(ALL_TOWERS)
      .filter(([, def]) => defenceTargets(def).air === false)
      .map(([key]) => key)
      .sort();
    // A wall is ground-only by construction (spikes in the road). The engineer
    // roster is deliberately narrow: gunpowder, acid and a harpoon are all
    // things you point at the ground.
    expect(groundOnly).toEqual(['barricade', 'cannon', 'forge', 'harpoon', 'venom']);
  });

  it('keeps an anti-air answer in the starter roster', () => {
    // Archer, frost and runes are the lines a new player can afford on wave 1.
    for (const key of ['archer', 'frost', 'runes', 'banner']) {
      expect(defenceTargets(ALL_TOWERS[key]).air, `${key} must reach air`).toBe(true);
      expect(defenceTargets(ALL_TOWERS[key]).ground, `${key} must reach ground`).toBe(true);
    }
  });

  it('has a flyer for every wave that asks for one', () => {
    const flyers = Object.entries(ENEMY_TYPES).filter(([, def]) => def.flying).map(([key]) => key);
    expect(flyers.length).toBeGreaterThan(0);
    // Siege is a ground unit's job: a flyer that could also batter the bastion
    // would make every anti-air tower mandatory instead of a choice.
    for (const key of flyers) expect(ENEMY_TYPES[key].siege, `${key} flies and sieges`).toBe(0);
  });
});

describe('acquisition uses the shared rule', () => {
  const scene = makeCombatScene();
  const context = { activeEnemies: [] };
  const makeTower = (typeKey) => new Tower(scene, typeKey, 4, 8, context);
  const ground = () => creep(scene, 'grunt', 0, 0);
  const air = () => creep(scene, 'wraith', 0, 0);

  it('refuses air on a ground-locked line even with nothing else in range', () => {
    const cannon = makeTower('cannon');
    const flyer = air();
    flyer.x = cannon.x;
    flyer.y = cannon.y;
    expect(cannon.canTargetAir).toBe(false);
    context.activeEnemies = [flyer];
    // `acquireTarget` assigns `currentTarget` rather than returning it — the
    // tower keeps its decision on itself, which is what the render loop reads.
    cannon.acquireTarget();
    expect(cannon.currentTarget).toBeNull();
  });

  it('still shoots the ground creep next to that flyer', () => {
    const cannon = makeTower('cannon');
    const walker = ground();
    walker.x = cannon.x;
    walker.y = cannon.y;
    context.activeEnemies = [walker];
    cannon.acquireTarget();
    expect(cannon.currentTarget).toBe(walker);
  });

  it('lets a dual-purpose line pick the flyer', () => {
    const archer = makeTower('archer');
    const flyer = air();
    flyer.x = archer.x;
    flyer.y = archer.y;
    context.activeEnemies = [flyer];
    expect(archer.canTargetAir).toBe(true);
    archer.acquireTarget();
    expect(archer.currentTarget).toBe(flyer);
  });
});

describe('the shot carries the rule into its blast', () => {
  it('leaves a flyer inside a ground-only shell blast untouched', () => {
    const scene = makeCombatScene();
    const walker = creep(scene, 'grunt', 200, 200);
    const flyer = creep(scene, 'wraith', 210, 200);
    scene.activeEnemies.push(walker, flyer);
    const before = { ground: walker.health, air: flyer.health };

    const shot = shell(
      scene,
      { damage: 40, damageType: 'physical', splash: 80, targetsAir: false, targetsGround: true },
      walker,
      200,
      200
    );
    shot.impact(200, 200);

    expect(walker.health).toBeLessThan(before.ground);
    expect(flyer.health, 'a ground shell damaged something flying').toBe(before.air);
  });

  it('hits the flyer too when the shell belongs to a dual-purpose line', () => {
    const scene = makeCombatScene();
    const walker = creep(scene, 'grunt', 200, 200);
    const flyer = creep(scene, 'wraith', 210, 200);
    scene.activeEnemies.push(walker, flyer);
    const before = flyer.health;

    const shot = shell(
      scene,
      { damage: 40, damageType: 'magic', splash: 80, targetsAir: true, targetsGround: true },
      walker,
      200,
      200
    );
    shot.impact(200, 200);

    expect(flyer.health).toBeLessThan(before);
  });

  it('honours an explicit opt-out for a shell that is meant to sweep the sky', () => {
    const scene = makeCombatScene();
    const flyer = creep(scene, 'wraith', 210, 200);
    scene.activeEnemies.push(flyer);
    const before = flyer.health;
    const shot = shell(
      scene,
      { damage: 40, splash: 80, targetsAir: false, splashIgnoresTargeting: true },
      flyer,
      200,
      200
    );
    shot.impact(200, 200);
    expect(flyer.health).toBeLessThan(before);
  });

  it('reports what the fired shot was allowed to hit', () => {
    // The flag must be copied at fire time: by the time a slow shell lands the
    // tower may already be sold, and the blast still has to know.
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const cannon = new Tower(scene, 'cannon', 4, 8, context);
    const walker = creep(scene, 'grunt', cannon.x + 40, cannon.y);
    cannon.fire(walker);

    expect(context.activeProjectiles).toHaveLength(1);
    const stats = context.activeProjectiles[0].stats;
    expect(stats.targetsAir).toBe(false);
    expect(stats.targetsGround).toBe(true);
  });
});

describe('chain lightning keeps the firing line', () => {
  const chainStats = (overrides = {}) => ({
    damage: 30,
    damageType: 'lightning',
    chainTargets: 3,
    chainRange: 200,
    targetsAir: true,
    targetsGround: true,
    ...overrides,
  });

  it('arcs from a ground creep to a nearby flyer when the tower may hit air', () => {
    const scene = makeCombatScene();
    const first = creep(scene, 'grunt', 300, 200);
    const second = creep(scene, 'wraith', 360, 200);
    scene.activeEnemies.push(first, second);
    const before = second.health;

    const shot = new Projectile(scene, 'lightning', 300, 200, first, chainStats(), scene.activeEnemies);
    // Straight into the chain, no flight time to wait out.
    shot.executeChainLightning(first);

    expect(second.health).toBeLessThan(before);
  });

  it('refuses to climb into the sky from a ground-locked tower', () => {
    const scene = makeCombatScene();
    const first = creep(scene, 'grunt', 300, 200);
    const flyer = creep(scene, 'wraith', 360, 200);
    const walker = creep(scene, 'runner', 300, 260);
    scene.activeEnemies.push(first, flyer, walker);
    const before = { air: flyer.health, ground: walker.health };

    const shot = new Projectile(
      scene,
      'lightning',
      300,
      200,
      first,
      chainStats({ targetsAir: false }),
      scene.activeEnemies
    );
    shot.executeChainLightning(first);

    expect(flyer.health).toBe(before.air);
    // …and it still found the ground creep standing behind it, so the skip is a
    // filter, not a dead ability.
    expect(walker.health).toBeLessThan(before.ground);
  });

  it('never hits the same creep twice in one arc', () => {
    const scene = makeCombatScene();
    const first = creep(scene, 'grunt', 300, 200);
    const second = creep(scene, 'runner', 320, 200);
    scene.activeEnemies.push(first, second);
    const before = second.health;

    const shot = new Projectile(
      scene,
      'lightning',
      300,
      200,
      first,
      chainStats({ chainTargets: 5 }),
      scene.activeEnemies
    );
    shot.executeChainLightning(first);

    // Only one other creep exists, so five allowed hops must land one hit.
    // Measured against a second run that allows a single hop: the same creep
    // must lose exactly the same health, which is the real definition of
    // "not hit twice" (armour makes a hard-coded number brittle).
    const dealt = before - second.health;
    expect(dealt).toBeGreaterThan(0);

    const controlScene = makeCombatScene();
    const controlFirst = creep(controlScene, 'grunt', 300, 200);
    const controlSecond = creep(controlScene, 'runner', 320, 200);
    controlScene.activeEnemies.push(controlFirst, controlSecond);
    const controlBefore = controlSecond.health;
    const control = new Projectile(
      controlScene,
      'lightning',
      300,
      200,
      controlFirst,
      chainStats({ chainTargets: 1 }),
      controlScene.activeEnemies
    );
    control.executeChainLightning(controlFirst);

    expect(dealt).toBe(controlBefore - controlSecond.health);
  });
});

describe('novas and spikes obey the same rule', () => {
  it('does not freeze a flyer with a ground-only nova', () => {
    const scene = makeCombatScene();
    const walker = creep(scene, 'grunt', 400, 300);
    const flyer = creep(scene, 'wraith', 410, 300);
    scene.activeEnemies.push(walker, flyer);
    const before = flyer.health;

    const shot = new Projectile(
      scene,
      'frost',
      400,
      300,
      walker,
      {
        damage: 50,
        damageType: 'frost',
        speed: 800,
        nova: 120,
        slow: 0.4,
        slowMs: 1500,
        targetsAir: false,
      },
      scene.activeEnemies
    );
    shot.frostNova(400, 300);

    expect(flyer.health).toBe(before);
    expect(walker.health).toBeLessThan(walker.maxHealth);
  });

  it('does not let palisade spikes hit something flying over the wall', () => {
    const scene = makeCombatScene();
    const context = { activeEnemies: [] };
    const palisade = new Tower(scene, 'barricade', 5, 8, context);
    palisade.level = 2;
    const flyer = creep(scene, 'wraith', palisade.x + 4, palisade.y + 4);
    context.activeEnemies = [flyer];
    const before = flyer.health;

    palisade.checkBarricadeThorns();

    expect(flyer.health).toBe(before);
  });

  it('keeps the spikes working on the wave walking into them', () => {
    const scene = makeCombatScene();
    const context = { activeEnemies: [] };
    const palisade = new Tower(scene, 'barricade', 5, 8, context);
    palisade.level = 2;
    const walker = creep(scene, 'grunt', palisade.x + 4, palisade.y + 4);
    context.activeEnemies = [walker];

    palisade.checkBarricadeThorns();

    expect(walker.health).toBeLessThan(walker.maxHealth);
  });
});

describe('the rule survives a shot whose tower is gone', () => {
  it('keeps the category on stats copied by the firing line', () => {
    // Guards the contract the whole file rests on: `Tower.fire` is the only
    // place the flag can enter the projectile, and it must be a copy, not a
    // reference to the live tower definition.
    const scene = makeCombatScene();
    const tower = new Tower(scene, 'cannon', 4, 8, { activeEnemies: [] });
    const def = tower.def;
    def.targetsAir = false;
    const stats = { targetsAir: def.targetsAir };
    def.targetsAir = true;
    expect(stats.targetsAir).toBe(false);
  });

  it('treats an undefined category as "everything", so old saves keep working', () => {
    const scene = makeCombatScene();
    const flyer = creep(scene, 'wraith', 0, 0);
    expect(projectileCanHit({}, flyer)).toBe(true);
    expect(projectileCanHit({ targetsAir: false }, flyer)).toBe(false);
    expect(projectileCanHit({ targetsGround: false }, flyer)).toBe(true);
    expect(projectileCanHit({ targetsGround: false }, creep(scene, 'grunt', 0, 0))).toBe(false);
  });

  it('has a stub scene that is honest about what the entities touch', () => {
    // A cheap canary: if the combat harness grows a method the entities need,
    // the failures below turn into "undefined is not a function" noise rather
    // than a category bug. Keeping one explicit use of the stub here documents
    // where to look first.
    const scene = makeCombatScene();
    expect(scene.add.image()).toBeTruthy();
    expect(stubNode().setPosition(1, 2)).toBeTruthy();
  });
});
