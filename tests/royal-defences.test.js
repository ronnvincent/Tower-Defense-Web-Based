import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROYAL_LINES, ROYAL_TOWER_TYPES, ROYAL_SUPPORT_LINES } from '../src/data/royalDefences.js';
import { ASCENSION } from '../src/data/towerAscension.js';
import { ROYAL_PROJECTILES } from '../src/data/royalProjectiles.js';
import { TOWER_TYPES, BUILD_OPTIONS, BUILD_GROUPS, SUPPORT_LINES, BARRICADE } from '../src/data/towerData.js';
import { TOWER_VISUALS, PROJECTILE_TEXTURES, IMPACT_TEXTURES, MUZZLE_OFFSET, NON_ROTATING_TYPES } from '../src/data/towerVisuals.js';
import { TARGETING_MODE, sortTargets } from '../src/entities/TowerTargeting.js';
import { Tower } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile, TRAIL_BUDGET, TRAIL_INTERVAL_MS } from '../src/entities/Projectile.js';
import { RoyalSystems, REPAIR_UNDER_FIRE } from '../src/systems/RoyalSystems.js';
import { makeCombatScene, makeCombatContext, parkingPath } from './helpers/combat.js';

/**
 * The royal roster: ten base-defence lines, each branching at level 3 into two
 * five-tier paths (branch A keeps the line's own machine, branch B is a second
 * one with its own building, weapon, shot and wreck).
 *
 * These tests run the real `Tower`, `Projectile`, `Enemy` and `RoyalSystems`
 * over the headless combat harness, so what is asserted here is the behaviour
 * the player gets — acquisition order, the category filter, real splash
 * coordinates, bounded chains, repairs that cannot outpace damage, a ward that
 * changes damage maths, and an upgrade track that charges exactly once.
 */

const SCENE_KEYS = ['x', 'y'];

/** Real Enemy parked where we put it. */
function creep(scene, typeKey, x, y, options = {}) {
  const enemy = new Enemy(scene, typeKey, 1, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
  });
  enemy.x = x;
  enemy.y = y;
  enemy.distanceTraveled = options.distanceTraveled ?? 0;
  enemy.reachedBase = false;
  if (options.flying !== undefined) enemy.flying = options.flying;
  if (options.isBoss !== undefined) enemy.isBoss = options.isBoss;
  if (options.health !== undefined) enemy.health = options.health;
  return enemy;
}

/** A tower on a stub scene, at a known position. */
function tower(scene, context, key, row = 3, col = 10) {
  return new Tower(scene, key, row, col, context);
}

/** Read a PNG's width/height from the IHDR chunk without a decoder. */
function pngSize(file) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/* ============================================================ the roster */

describe('royal roster', () => {
  it('ships ten lines, each branching into two five-tier paths', () => {
    expect(ROYAL_LINES).toHaveLength(10);
    for (const key of ROYAL_LINES) {
      const def = ROYAL_TOWER_TYPES[key];
      expect(def, `${key} missing`).toBeTruthy();
      expect(def.royal, `${key} must be marked as a royal line`).toBe(true);
      // Two shared tiers, then the branch is bought at level 3.
      expect(def.levels, `${key} has no levels`).toHaveLength(2);
      expect(def.levels.map((l) => l.level)).toEqual([1, 2]);
      const specs = Object.values(def.specializations || {});
      expect(specs, `${key} needs two branches`).toHaveLength(2);
      expect(new Set(specs.map((s) => s.branch))).toEqual(new Set(['spec-a', 'spec-b']));
      // Both paths climb: L3 price, L4 price, L5 price, each higher than the last.
      for (const spec of specs) {
        expect(spec.specKey, `${key} branch needs a specKey`).toBeTruthy();
        expect(spec.title, `${key}.${spec.specKey} needs a name`).toBeTruthy();
        expect(Number.isFinite(spec.damage), `${key}.${spec.specKey} damage`).toBe(true);
        const asc = ASCENSION[key]?.[spec.specKey];
        expect(asc, `${key}.${spec.specKey} has no ascension tiers`).toBeTruthy();
        const costs = [spec.upgradeCost, asc.elite.upgradeCost, asc.apex.upgradeCost];
        for (const cost of costs) expect(cost, `${key}.${spec.specKey} upgrade cost`).toBeGreaterThan(0);
        for (let i = 1; i < costs.length; i += 1) {
          expect(costs[i], `${key}.${spec.specKey} upgrade ${i + 3} must cost more`).toBeGreaterThan(costs[i - 1]);
        }
      }
      // The two branches must be different answers, never the same tower twice.
      // A field building has no damage block, so its payload is the aura, the
      // repair crew or the ward it carries.
      const payload = (spec) => JSON.stringify([spec.damage, spec.cooldown, spec.aura, spec.repair, spec.debuff]);
      const [a, b] = specs;
      expect(payload(a) === payload(b), `${key} ships the same branch twice`).toBe(false);
    }
  });

  it('is wired into the flat roster, the dock and the hotkeys', () => {
    for (const key of ROYAL_LINES) {
      expect(TOWER_TYPES[key]).toBe(ROYAL_TOWER_TYPES[key]);
      expect(BUILD_OPTIONS).toContain(key);
    }
    const keys = [...Object.values(TOWER_TYPES), BARRICADE].map((def) => def.hotkey);
    expect(new Set(keys).size, 'every defence needs its own hotkey').toBe(keys.length);
    // Four tabs, none wider than seven cards — a phone screen cannot take more.
    expect(BUILD_GROUPS.map((g) => g.key)).toEqual(['keeps', 'engineer', 'royal', 'ward']);
    for (const group of BUILD_GROUPS) {
      expect(group.lines.length).toBeLessThanOrEqual(7);
    }
  });

  it('declares its support lines once', () => {
    expect(ROYAL_SUPPORT_LINES).toEqual(['workshop', 'obelisk']);
    for (const key of ROYAL_SUPPORT_LINES) expect(SUPPORT_LINES).toContain(key);
  });

  it('keeps the wall five tiers, each tougher than the last', () => {
    expect(BARRICADE.levels).toHaveLength(5);
    for (let i = 1; i < BARRICADE.levels.length; i += 1) {
      expect(BARRICADE.levels[i].health).toBeGreaterThan(BARRICADE.levels[i - 1].health);
      expect(BARRICADE.levels[i].upgradeCost).toBeGreaterThan(0);
    }
  });
});

/* ================================================================ the art */

describe('royal art is real, unique and shipped', () => {
  it('gives every tier of both branches its own base and weapon sheet on disk', () => {
    const SLOTS = ['lvl1', 'lvl2', 'spec-a', 'spec-a2', 'spec-a3', 'spec-b', 'spec-b2', 'spec-b3'];
    for (const key of ROYAL_LINES) {
      const slots = TOWER_VISUALS[key];
      expect(slots, `${key} has no visual line`).toBeTruthy();
      const bases = new Set();
      for (const slot of SLOTS) {
        const art = slots[slot];
        expect(art, `${key} ${slot} art missing`).toBeTruthy();
        bases.add(art.base);
        for (const file of [art.base, art.weapon]) {
          const path = join(process.cwd(), 'public', 'assets', 'towers', file);
          expect(existsSync(path), `${file} missing`).toBe(true);
        }
        const weapon = pngSize(join(process.cwd(), 'public', 'assets', 'towers', art.weapon));
        // A strip is `frames` square frames laid left to right: a stale
        // fw/frames pair slices the art at the wrong pitch, which does not
        // crash Phaser and simply animates as torn frames.
        expect(weapon.width).toBe(art.fw * art.frames);
        expect(weapon.height).toBe(art.fh);
        expect(art.frames).toBe(6);
        expect(MUZZLE_OFFSET[art.file], `${art.file} has no measured muzzle`).toBeTruthy();
        expect(MUZZLE_OFFSET[art.file].y).toBeLessThan(0);
      }
      // No tier may reuse another tier's drawing — five tiers a branch, and the
      // second branch is a different machine, not a repaint.
      expect(bases.size, `${key} reuses art between tiers`).toBe(SLOTS.length);
    }
  });

  it('ships branch-B effects and shots, not just branch-B towers', () => {
    for (const key of ROYAL_LINES) {
      for (const file of [`fx-line-${key}-b-impact.png`, `fx-line-${key}-b-muzzle.png`]) {
        expect(existsSync(join(process.cwd(), 'public/assets/fx', file)), file).toBe(true);
      }
      expect(existsSync(join(process.cwd(), 'public/assets/towers', `ruin_${key}-b.png`))).toBe(true);
      const tiers = ROYAL_PROJECTILES[key];
      if (!tiers) continue;
      for (const file of [tiers.b, tiers.b2]) {
        expect(existsSync(join(process.cwd(), 'public/assets/projectiles', `${file}.png`)), file).toBe(true);
        expect(file).not.toBe(tiers.a);
      }
      expect(existsSync(join(process.cwd(), 'public/assets/fx', `fx-line-${key}-b-trail.png`))).toBe(true);
    }
  });

  it('ships a dock card, a projectile and an impact strip per line', () => {
    for (const key of ROYAL_LINES) {
      expect(existsSync(join(process.cwd(), 'public/assets/ui', `card_${key}.png`))).toBe(true);
      expect(existsSync(join(process.cwd(), 'public/assets/fx', `fx-line-${key}-impact.png`))).toBe(true);
      expect(existsSync(join(process.cwd(), 'public/assets/fx', `fx-line-${key}-muzzle.png`))).toBe(true);
      const def = ROYAL_TOWER_TYPES[key];
      if (!def.projectile) continue;
      const texture = PROJECTILE_TEXTURES[def.projectile];
      expect(texture, `${key} has no projectile texture`).toBeTruthy();
      expect(existsSync(join(process.cwd(), 'public/assets/projectiles', `${texture}.png`))).toBe(true);
      expect(IMPACT_TEXTURES[def.projectile], `${key} has no impact fallback`).toBeTruthy();
    }
    // Seven shooting lines, three field buildings: each shot is its own file.
    const shots = ROYAL_LINES.filter((k) => ROYAL_TOWER_TYPES[k].projectile).map(
      (k) => PROJECTILE_TEXTURES[ROYAL_TOWER_TYPES[k].projectile]
    );
    expect(new Set(shots).size).toBe(shots.length);
  });

  it('does not rotate a static weapon', () => {
    for (const key of ['rimeTower', 'workshop', 'obelisk', 'spikeTrap']) {
      expect(NON_ROTATING_TYPES.has(key), `${key} must not rotate`).toBe(true);
    }
  });
});

/* ========================================================== target rules */

describe('the category filter is a real rule', () => {
  let scene;
  let context;

  beforeEach(() => {
    scene = makeCombatScene();
    context = makeCombatContext(scene);
  });

  it('declares what each line can reach', () => {
    expect(ROYAL_TOWER_TYPES.mortar.targetsAir).toBe(false);
    expect(ROYAL_TOWER_TYPES.skybreaker.targetsGround).toBe(false);
    expect(ROYAL_TOWER_TYPES.spikeTrap.targetsAir).toBe(false);
    expect(ROYAL_TOWER_TYPES.royalArtillery.targetsAir).not.toBe(false);
    expect(ROYAL_TOWER_TYPES.royalArtillery.targetsGround).not.toBe(false);
  });

  it('never lets "boss first" outrank a ground-only filter', () => {
    const gun = tower(scene, context, 'royalArtillery', 5, 10);
    gun.setTargetCategory('ground');
    // Past the gun's 100 px minimum range: a siege piece cannot shoot its own
    // emplacement, and the filter test must not be a min-range test in disguise.
    const flyingBoss = creep(scene, 'wraith', gun.x + 160, gun.y, { isBoss: true, flying: true });
    const walker = creep(scene, 'grunt', gun.x + 180, gun.y);
    scene.activeEnemies.push(flyingBoss, walker);

    gun.acquireTarget();
    expect(gun.currentTarget).toBe(walker);

    // Switching to AIR makes the flying boss the only legal target.
    gun.setTargetCategory('air');
    gun.acquireTarget();
    expect(gun.currentTarget).toBe(flyingBoss);
  });

  it('drops a target the filter no longer allows', () => {
    const gun = tower(scene, context, 'skybreaker', 5, 10);
    const walker = creep(scene, 'grunt', gun.x + 40, gun.y);
    scene.activeEnemies.push(walker);
    gun.acquireTarget();
    expect(gun.currentTarget, 'an air-only tracker must not lock a walker').toBeNull();
  });

  it('copies the live filter into the shot, so splash obeys it too', () => {
    const mortar = tower(scene, context, 'mortar', 5, 10);
    const walker = creep(scene, 'grunt', mortar.x + 140, mortar.y);
    scene.activeEnemies.push(walker);
    mortar.acquireTarget();
    expect(mortar.currentTarget).toBe(walker);
    expect(mortar.engagedTargets).toEqual({ ground: true, air: false });
  });

  it('honours a minimum range (a siege gun cannot shoot its own emplacement)', () => {
    const gun = tower(scene, context, 'royalArtillery', 5, 10);
    const pointBlank = creep(scene, 'grunt', gun.x + 20, gun.y);
    const far = creep(scene, 'grunt', gun.x + 300, gun.y);
    scene.activeEnemies.push(pointBlank, far);
    gun.acquireTarget();
    expect(gun.currentTarget).toBe(far);
  });
});

describe('priority ordering', () => {
  const entry = (enemy) => ({ enemy, dist: Math.hypot(enemy.x, enemy.y) });

  const roster = () => {
    const boss = { isBoss: true, health: 400, distanceTraveled: 10, currentSpeed: 30, x: 0, y: 100 };
    const healthy = { isBoss: false, health: 300, distanceTraveled: 90, currentSpeed: 60, x: 0, y: 50 };
    const weak = { isBoss: false, health: 20, distanceTraveled: 40, currentSpeed: 120, x: 0, y: 10 };
    return [entry(healthy), entry(weak), entry(boss)];
  };

  it('orders by the mode it is given', () => {
    expect(sortTargets(roster(), TARGETING_MODE.BOSS)[0].enemy.isBoss).toBe(true);
    expect(sortTargets(roster(), TARGETING_MODE.STRONGEST)[0].enemy.health).toBe(400);
    expect(sortTargets(roster(), TARGETING_MODE.WEAKEST)[0].enemy.health).toBe(20);
    expect(sortTargets(roster(), TARGETING_MODE.NEAREST)[0].enemy.y).toBe(10);
    expect(sortTargets(roster(), TARGETING_MODE.FASTEST)[0].enemy.currentSpeed).toBe(120);
    expect(sortTargets(roster(), TARGETING_MODE.FIRST)[0].enemy.distanceTraveled).toBe(90);
    expect(sortTargets(roster(), TARGETING_MODE.LAST)[0].enemy.distanceTraveled).toBe(10);
  });

  it('offers the panel only where the choice matters', () => {
    for (const key of ['royalArtillery', 'arcaneSniper', 'skybreaker']) {
      expect(ROYAL_TOWER_TYPES[key].targeting?.panel, `${key} needs a panel`).toBe(true);
      expect(ROYAL_TOWER_TYPES[key].targeting.modes.length).toBeGreaterThanOrEqual(4);
    }
    expect(ROYAL_TOWER_TYPES.tesla.targeting).toBeUndefined();
  });
});

/* ============================================================= combat */

describe('royal combat behaviour', () => {
  let scene;
  let context;

  beforeEach(() => {
    scene = makeCombatScene();
    context = makeCombatContext(scene);
  });

  it('burns the chain down instead of copying full damage to every body', () => {
    const first = creep(scene, 'grunt', 300, 200, { health: 900 });
    const second = creep(scene, 'grunt', 360, 200, { health: 900 });
    const third = creep(scene, 'grunt', 420, 200, { health: 900 });
    scene.activeEnemies.push(first, second, third);

    const stats = {
      speed: 900,
      damage: 100,
      damageType: 'lightning',
      chainTargets: 3,
      chainRange: 100,
      chainFalloff: 0.5,
      targetsGround: true,
      targetsAir: true,
    };
    const shot = new Projectile(scene, 'teslaArc', 300, 200, first, stats, scene.activeEnemies);
    const before = scene.activeEnemies.map((e) => e.health);
    shot.executeChainLightning(first);

    const lost = scene.activeEnemies.map((e, i) => before[i] - e.health);
    // The primary is not re-hit by its own chain (it was already damaged by the
    // single-target path); the hops carry 50 % less each time.
    expect(lost[1]).toBe(50);
    expect(lost[2]).toBe(25);
    for (const amount of lost) expect(amount).toBeLessThanOrEqual(100);
  });

  it('never hits one creep twice in a single chain', () => {
    const start = creep(scene, 'grunt', 300, 200, { health: 400 });
    const hop = creep(scene, 'grunt', 350, 200, { health: 400 });
    scene.activeEnemies.push(start, hop);
    const shot = new Projectile(
      scene,
      'teslaArc',
      300,
      200,
      start,
      { speed: 900, damage: 60, damageType: 'lightning', chainTargets: 6, chainRange: 120, chainFalloff: 0.9, targetsGround: true, targetsAir: true },
      scene.activeEnemies
    );
    shot.executeChainLightning(start);
    expect(400 - hop.health).toBe(54); // one hop at 90 % of 60
  });

  it('lands a mortar shell on the coordinates it was aimed at, not on a body', () => {
    const spot = { x: 260, y: 200 };
    const aim = creep(scene, 'grunt', spot.x, spot.y, { health: 900 });
    scene.activeEnemies.push(aim);
    const stats = {
      speed: 900,
      damage: 90,
      damageType: 'explosive',
      splash: 60,
      groundTarget: true,
      targetsGround: true,
      targetsAir: false,
    };
    const shot = new Projectile(scene, 'mortarShell', 100, 200, aim, stats, scene.activeEnemies);

    // The creep walks away while the shell is in the air. The blast must stay
    // on the ground it was aimed at (the real deliverable), not follow it.
    aim.x = 600;
    aim.y = 400;
    for (let i = 0; i < 40 && !shot.isDead; i += 1) shot.update(16);
    expect(shot.isDead).toBe(true);
    expect(aim.health, 'the shell should not chase its target').toBe(900);

    // A creep standing on the marked spot would have been hit.
    const bystander = creep(scene, 'grunt', spot.x + 10, spot.y, { health: 500 });
    scene.activeEnemies.push(bystander);
    const second = new Projectile(scene, 'mortarShell', 100, 200, bystander, stats, scene.activeEnemies);
    for (let i = 0; i < 40 && !second.isDead; i += 1) second.update(16);
    expect(bystander.health).toBeLessThan(500);
  });
});

/* ======================================================= field effects */

describe('royal field effects', () => {
  let scene;
  let context;
  let systems;

  beforeEach(() => {
    scene = makeCombatScene();
    context = makeCombatContext(scene);
    systems = new RoyalSystems(scene);
  });

  it('repairs the worst-hit structure and never rebuilds rubble', () => {
    const workshop = tower(scene, context, 'workshop', 6, 10);
    // A royal tower branches at level 3; the repair yard lives on branch A.
    workshop.level = 3;
    workshop.specialization = 'master';
    const damaged = tower(scene, context, 'archer', 6, 11);
    damaged.health = 40;
    const destroyed = tower(scene, context, 'archer', 6, 12);
    destroyed.health = 0;
    destroyed.isDestroyed = true;
    scene.activeTowers.push(workshop, damaged, destroyed);

    systems.tickRepairs(1000);
    expect(damaged.health).toBeGreaterThan(40);
    expect(destroyed.health, 'rubble must stay rubble').toBe(0);

    // A crew under fire works at half rate.
    const near = creep(scene, 'grunt', damaged.x + 20, damaged.y);
    scene.activeEnemies.push(near);
    const before = damaged.health;
    systems.tickRepairs(1000);
    const healedUnderFire = damaged.health - before;
    expect(healedUnderFire).toBeGreaterThan(0);
    expect(healedUnderFire).toBeLessThan(workshop.stats.repair.perSecond - 0.01);
    expect(REPAIR_UNDER_FIRE).toBe(0.5);
  });

  it('makes the repair visible — one beam per heal, capped, gone on its own', () => {
    const workshop = tower(scene, context, 'workshop', 6, 10);
    // A royal tower branches at level 3; the repair yard lives on branch A.
    workshop.level = 3;
    workshop.specialization = 'master';
    const damaged = tower(scene, context, 'archer', 6, 11);
    damaged.health = 40;
    scene.activeTowers.push(workshop, damaged);

    // Count the graphics objects the repair actually creates.
    let beams = 0;
    const realGraphics = scene.add.graphics;
    scene.add.graphics = () => {
      beams += 1;
      return realGraphics();
    };

    systems.tickRepairs(500);
    expect(damaged.health).toBeGreaterThan(40);
    expect(beams, 'a landed repair draws its beam').toBe(1);
    expect(workshop.wasRepairing).toBe(true);

    // Nothing hurt: the crew idles, no beam, no swing.
    damaged.health = damaged.maxHealth;
    systems.tickRepairs(500);
    expect(beams).toBe(1);

    // The live-beam budget holds even if several workshops land on one beat.
    for (let i = 0; i < 12; i += 1) systems.playRepairBeam(workshop, damaged);
    expect(beams).toBeLessThanOrEqual(8);

    // The "working" lamp turns itself off two ticks after the last heal.
    damaged.health = 10;
    scene.time.now = 5000;
    systems.tickRepairs(500);
    expect(workshop.wasRepairing).toBe(true);
    damaged.health = damaged.maxHealth;
    scene.time.now = 9000;
    systems.update(600);
    expect(workshop.wasRepairing).toBe(false);
  });

  it('a ward lowers real mitigation and lapses when the creep leaves', () => {
    const obelisk = tower(scene, context, 'obelisk', 6, 10);
    obelisk.level = 5;
    obelisk.specialization = 'rune';
    scene.activeTowers.push(obelisk);
    const guard = creep(scene, 'guard', obelisk.x + 30, obelisk.y, { health: 900 });
    scene.activeEnemies.push(guard);

    const baseResist = guard.effectiveResistances().physical;
    expect(baseResist).toBeCloseTo(0.35, 5);

    const applied = systems.tickWards();
    expect(applied).toBe(1);
    expect(guard.armorBreak).toBe(26);
    expect(guard.effectiveResistances().physical).toBeCloseTo(0.05, 5);

    // A physical hit now lands for more than it did before the ward.
    const plain = creep(scene, 'guard', 0, 0, { health: 900 });
    const wardedHit = guard.applyDamage(100, 'physical').finalDamage;
    const plainHit = plain.applyDamage(100, 'physical').finalDamage;
    expect(wardedHit).toBeGreaterThan(plainHit);

    // It is a field, not a permanent curse.
    for (let i = 0; i < 200; i += 1) guard.update(16);
    expect(guard.resistanceBreak).toBe(0);
    expect(guard.effectiveResistances().physical).toBeCloseTo(0.35, 5);
  });

  it('triggers a trap once per activation and never on a flyer', () => {
    const trap = tower(scene, context, 'spikeTrap', 6, 10);
    scene.activeTowers.push(trap);
    const walker = creep(scene, 'grunt', trap.x, trap.y, { health: 400 });
    const flyer = creep(scene, 'wraith', trap.x, trap.y, { health: 400, flying: true });
    scene.activeEnemies.push(walker, flyer);

    expect(systems.tickTraps(100)).toBe(1);
    expect(walker.health).toBe(400 - ROYAL_TOWER_TYPES.spikeTrap.levels[0].damage);
    expect(flyer.health, 'spikes in the road cannot reach the sky').toBe(400);

    // The second tick is inside the cooldown: no second helping.
    walker.health = 400;
    expect(systems.tickTraps(100)).toBe(0);
    expect(walker.health).toBe(400);

    // After the cooldown it re-arms.
    expect(systems.tickTraps(ROYAL_TOWER_TYPES.spikeTrap.levels[0].trapCooldown)).toBe(1);
    expect(walker.health).toBeLessThan(400);
  });

  it('fires the spike trap of the branch it was built as', () => {
    const lines = [];
    scene.vfx = {
      impact: (x, y, element, opts) => lines.push(opts?.line ?? null),
      groundBlast: () => {},
    };

    const impaler = tower(scene, context, 'spikeTrap', 6, 10);
    impaler.level = 3;
    impaler.specialization = 'impaler';
    const caltrop = tower(scene, context, 'spikeTrap', 6, 14);
    caltrop.level = 3;
    caltrop.specialization = 'caltrop';
    scene.activeTowers.push(impaler, caltrop);

    // One body per plate, so each trap triggers exactly once.
    scene.activeEnemies.push(
      creep(scene, 'grunt', impaler.x, impaler.y, { health: 900 }),
      creep(scene, 'grunt', caltrop.x, caltrop.y, { health: 900 })
    );
    expect(systems.tickTraps(100)).toBe(2);
    // Branch A hits under the line id, branch B under its own — the two
    // triggers must not wear the same burst.
    expect(lines.sort()).toEqual(['spikeTrap', 'spikeTrap-b']);
    expect(existsSync(join(process.cwd(), 'public/assets/fx/fx-line-spikeTrap-b-impact.png'))).toBe(true);
  });
});

/* ============================================================ upgrades */

describe('the five-tier upgrade track', () => {
  let scene;
  let context;

  beforeEach(() => {
    scene = makeCombatScene();
    context = makeCombatContext(scene);
  });

  it('walks L1 → L5, charges once per tier and stops at the cap', () => {
    const turret = tower(scene, context, 'siegeBallista', 6, 10);
    const spentAtStart = context.economy.coins;
    const seen = new Set([turret.visual.base]);

    for (let level = 2; level <= 5; level += 1) {
      const tier = turret.nextUpgrades[0];
      expect(tier, `L${level} should be offered`).toBeTruthy();
      const cost = tier.upgradeCost;
      // The 260 ms double-click guard is cleared by the scene's clock, which the
      // headless harness does not run — the double-click test below exercises
      // that lock directly.
      turret.upgradeLock = false;
      expect(turret.upgrade()).toBe(true);
      expect(turret.level).toBe(level);
      expect(turret.visual.base, `L${level} must wear its own art`).not.toBe(seen.values().next().value);
      seen.add(turret.visual.base);
      expect(context.economy.coins).toBe(spentAtStart - sumSpent(turret));
      expect(turret.totalInvested).toBeGreaterThan(cost);
    }
    expect(turret.level).toBe(5);
    expect(seen.size).toBe(5);
    expect(turret.nextUpgrades).toHaveLength(0);
    expect(turret.upgrade()).toBe(false);
  });

  it('refuses an upgrade it cannot afford and never spends on a refusal', () => {
    const turret = tower(scene, context, 'royalArtillery', 6, 10);
    context.economy.coins = 10;
    const before = context.economy.coins;
    expect(turret.canUpgrade()).toBe(false);
    expect(turret.upgrade()).toBe(false);
    expect(turret.level).toBe(1);
    expect(context.economy.coins).toBe(before);
  });

  it('rejects a double click instead of charging twice', () => {
    const turret = tower(scene, context, 'arcaneSniper', 6, 10);
    const coins = context.economy.coins;
    expect(turret.upgrade()).toBe(true);
    const afterFirst = context.economy.coins;
    expect(turret.upgrade(), 'the second press lands on the same tier').toBe(false);
    expect(context.economy.coins).toBe(afterFirst);
    expect(afterFirst).toBeLessThan(coins);
  });

  it('keeps the damage ratio when a battered battery is reinforced', () => {
    const turret = tower(scene, context, 'tesla', 6, 10);
    turret.health = turret.maxHealth * 0.5;
    turret.upgrade();
    expect(turret.health / turret.maxHealth).toBeCloseTo(0.5, 2);
  });
});

describe('trails — one streak per royal shot, bounded', () => {
  let scene;
  let context;

  beforeEach(() => {
    scene = makeCombatScene();
    context = makeCombatContext(scene);
    scene.activeEnemies = [];
  });

  it('ships a trail texture for every shooting line and none for the field lines', () => {
    const shooting = ['royalArtillery', 'siegeBallista', 'arcaneSniper', 'mortar', 'rimeTower', 'tesla', 'skybreaker'];
    for (const key of shooting) {
      expect(existsSync(join(process.cwd(), 'public/assets/fx', `fx-line-${key}-trail.png`)), key).toBe(true);
    }
    // The workshop, obelisk and trap never fire, so they must not ship a
    // projectile trail that nothing can ever draw.
    for (const key of ['workshop', 'obelisk', 'spikeTrap']) {
      expect(existsSync(join(process.cwd(), 'public/assets/fx', `fx-line-${key}-trail.png`)), key).toBe(false);
    }
  });

  it('ships its own wreck for every line, so a destroyed building is identifiable', () => {
    for (const key of ROYAL_LINES) {
      expect(existsSync(join(process.cwd(), 'public/assets/towers', `ruin_${key}.png`)), key).toBe(true);
    }
  });

  it('drips streaks behind a flying shot, and only once per interval', () => {
    const shotStats = { damage: 10, speed: 600, damageType: 'physical', line: 'royalArtillery' };
    const aim = creep(scene, 'grunt', 900, 300);
    const shot = new Projectile(scene, 'royalShell', 100, 300, aim, shotStats, scene.activeEnemies);
    scene.textures.exists = () => true;
    // Re-resolve against the scene that now "has" the trail texture.
    shot.trailKey = shot.resolveTrailKey(scene, 'royalArtillery');

    shot.updateTrail(TRAIL_INTERVAL_MS - 1);
    expect(scene.__trailSprites ?? 0).toBe(0);
    shot.updateTrail(2);
    expect(scene.__trailSprites).toBe(1);
    shot.updateTrail(TRAIL_INTERVAL_MS);
    expect(scene.__trailSprites).toBe(2);
  });

  it('refuses to exceed the sprite budget', () => {
    const shotStats = { damage: 10, speed: 600, damageType: 'physical', line: 'mortar' };
    const aim = creep(scene, 'grunt', 900, 300);
    const shot = new Projectile(scene, 'mortarShell', 100, 300, aim, shotStats, scene.activeEnemies);
    shot.trailKey = shot.resolveTrailKey(scene, 'mortar');
    scene.__trailSprites = TRAIL_BUDGET;
    expect(shot.spawnTrail()).toBeNull();
    expect(scene.__trailSprites).toBe(TRAIL_BUDGET);
    scene.__trailSprites = 0;
  });

  it('draws no trail for a line that does not ship one', () => {
    const shotStats = { damage: 10, speed: 600, damageType: 'physical' };
    const aim = creep(scene, 'grunt', 900, 300);
    const shot = new Projectile(scene, 'arrow', 100, 300, aim, shotStats, scene.activeEnemies);
    expect(shot.trailKey).toBeNull();
    expect(shot.spawnTrail()).toBeNull();
  });
});

/** Sum of the upgrade costs actually charged so far (the build cost excluded). */
function sumSpent(turret) {
  return turret.totalInvested - turret.def.cost;
}
