// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { getLevel } from '../src/data/levelData.js';
import {
  calculateDamage,
  DAMAGE_TYPE,
} from '../src/systems/CombatCalculator.js';
import { siegeDamage, SIEGE_INTERVAL_MS } from '../src/systems/BarricadeCombat.js';
import { makeCombatScene, parkingPath } from './helpers/combat.js';

/**
 * Resistance, shield and enemy-support.
 *
 * The Armored Guard and Hex Adept are the only archetypes that use two systems
 * the rest of the bestiary does not: typed damage resistances and a support
 * caster that hands out barriers. Both are wired into the **central** resolver
 * (`CombatCalculator.calculateDamage` ← `Enemy.applyDamage`), so the tests here
 * drive the real Enemy against real config — no second copy of the formula.
 *
 * The rules being pinned, in the order the brief asks for them:
 *   1. `damage = max(1, base × (1 − resist))`, after armour, before the shield.
 *   2. The shield is spent before health.
 *   3. A support pulse replaces a shield only when the new one is stronger.
 *   4. A caster fires once per interval, never once per frame.
 *   5. A dead or escaped creep is neither warded nor served by a dead caster.
 *   6. One death, one reward.
 *   7. Every ground archetype can still break a palisade.
 */

/** The exact support blocks these tests pin, written out so a silent edit fails. */
const HEX_SUPPORT = Object.freeze({ kind: 'shield', amount: 20, radius: 100, intervalMs: 7000 });
const HEALER_SUPPORT = Object.freeze({ type: 'heal', radius: 95, amount: 30, intervalMs: 2500 });

let GameScene;

beforeAll(async () => {
  vi.stubGlobal(
    'Phaser',
    new Proxy(
      { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
      {
        get(target, key) {
          if (key in target) return target[key];
          return { Scene: target.Scene }[key];
        },
      }
    )
  );
  ({ GameScene } = await import('../src/scenes/GameScene.js'));
});

/** Spawn a real Enemy of `typeKey` on a parked lane, with an optional death hook. */
function spawn(typeKey, { wave = 1, options = {}, callbacks = {} } = {}) {
  const scene = makeCombatScene();
  const deaths = [];
  const enemy = new Enemy(
    scene,
    typeKey,
    wave,
    parkingPath(),
    {
      onReachedBase: () => {},
      onDefeated: (e) => deaths.push(e),
      ...callbacks,
    },
    options
  );
  scene.activeEnemies.push(enemy);
  return { enemy, scene, deaths };
}

/** The GameScene slice that `tickEnemySupport` / `pulseShieldWard` touch. */
function supportScene(enemies) {
  const vfx = { impact: vi.fn(), groundBlast: vi.fn() };
  // `tickEnemySupport` calls `pulseShieldWard` through `this`, so the stand-in
  // scene has to borrow the real prototype method rather than reimplement it.
  return {
    activeEnemies: enemies,
    vfx,
    pulseShieldWard: GameScene.prototype.pulseShieldWard,
  };
}

function tick(scene, ms) {
  GameScene.prototype.tickEnemySupport.call(scene, ms);
}

function pulse(scene, caster) {
  return GameScene.prototype.pulseShieldWard.call(scene, caster, caster.def.support);
}

describe('typed resistances — the central formula', () => {
  it('takes the configured fraction off a physical hit', () => {
    const res = calculateDamage({
      rawDamage: 100,
      damageType: DAMAGE_TYPE.PHYSICAL,
      resistances: { physical: 0.35 },
    });
    expect(res.finalDamage).toBe(65);
    expect(res.damageDealtToHealth).toBe(65);
  });

  it('applies a different fraction per damage type, and none for an unlisted type', () => {
    const armed = { physical: 0.35, piercing: 0.2 };
    expect(calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, resistances: armed }).finalDamage).toBe(65);
    expect(calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PIERCING, resistances: armed }).finalDamage).toBe(80);
    // Magic is not listed for this target, so it lands whole.
    expect(calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.MAGIC, resistances: armed }).finalDamage).toBe(100);
    // A magic-resistant target turns the same hit down.
    expect(
      calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.MAGIC, resistances: { magic: 0.5 } }).finalDamage
    ).toBe(50);
  });

  it('stacks after armour, not before it', () => {
    // 40 armour alone leaves 100 × 100/140 = 71; a 35 % resistance then takes
    // 65 % of that = 46. (Applying the resistance first would give 49.)
    const res = calculateDamage({
      rawDamage: 100,
      damageType: DAMAGE_TYPE.PHYSICAL,
      armor: 40,
      resistances: { physical: 0.35 },
    });
    expect(res.finalDamage).toBe(46);
  });

  it('never drops below 1 damage and clamps a hostile resistance', () => {
    expect(calculateDamage({ rawDamage: 1, damageType: DAMAGE_TYPE.PHYSICAL, resistances: { physical: 0.95 } }).finalDamage).toBe(1);
    // A config that claims 100 % immunity is capped at 95 %, so nothing in the
    // game can be literally unkillable by its own data.
    expect(calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, resistances: { physical: 1 } }).finalDamage).toBe(5);
    // Negative / nonsense values are ignored rather than healing the target.
    expect(calculateDamage({ rawDamage: 10, damageType: DAMAGE_TYPE.PHYSICAL, resistances: { physical: -0.5 } }).finalDamage).toBe(10);
    expect(calculateDamage({ rawDamage: 10, damageType: DAMAGE_TYPE.PHYSICAL, resistances: { physical: 'x' } }).finalDamage).toBe(10);
  });

  it('lets true damage ignore a resistance', () => {
    expect(
      calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.TRUE, resistances: { physical: 0.35, magic: 0.5 } }).finalDamage
    ).toBe(100);
  });
});

describe('Armored Guard in the real damage path', () => {
  it('carries the configured resistance and takes the reduced hit', () => {
    const { enemy } = spawn('guard');
    expect(enemy.def.resistances).toEqual({ physical: 0.35, piercing: 0.2 });
    const before = enemy.health;
    const res = enemy.applyDamage(100, DAMAGE_TYPE.PHYSICAL);
    expect(res.finalDamage).toBe(65);
    expect(enemy.health).toBe(before - 65);

    // Magic is not resisted, so a mage hurts it through the plate.
    const again = enemy.applyDamage(100, DAMAGE_TYPE.MAGIC);
    expect(again.finalDamage).toBe(100);
  });

  it('clamps health at zero instead of letting it go negative', () => {
    const { enemy, deaths } = spawn('guard');
    const res = enemy.applyDamage(999999, DAMAGE_TYPE.TRUE);
    expect(res.isDefeated).toBe(true);
    expect(enemy.health).toBe(0);
    expect(enemy.health).toBeGreaterThanOrEqual(0);
    expect(deaths).toHaveLength(1);
  });
});

describe('shields: spent before health, never stacked', () => {
  it('absorbs into the barrier before touching the health pool', () => {
    // `shield` ships a 120-point barrier at wave 1.
    const { enemy } = spawn('shield');
    expect(enemy.shield).toBe(120);
    const hp = enemy.health;

    const res = enemy.applyDamage(50, DAMAGE_TYPE.PHYSICAL);
    expect(res.shieldAbsorbed).toBeGreaterThan(0);
    expect(res.damageDealtToHealth).toBe(0);
    expect(enemy.health).toBe(hp);
    expect(enemy.shield).toBeLessThan(120);
  });

  it('spills only the overflow into health once the barrier breaks', () => {
    const { enemy } = spawn('hex');
    const hp = enemy.health;
    // No barrier yet: everything lands on health.
    const first = enemy.applyDamage(10, DAMAGE_TYPE.TRUE);
    expect(first.shieldAbsorbed).toBe(0);
    expect(enemy.health).toBe(hp - 10);

    enemy.grantShield(20);
    expect(enemy.shield).toBe(20);
    const hp2 = enemy.health;
    const second = enemy.applyDamage(30, DAMAGE_TYPE.TRUE);
    expect(second.shieldAbsorbed).toBe(20);
    expect(second.damageDealtToHealth).toBe(10);
    expect(enemy.shield).toBe(0);
    expect(enemy.health).toBe(hp2 - 10);
  });

  it('replaces a barrier only when the new one is stronger', () => {
    const { enemy } = spawn('hex');
    expect(enemy.grantShield(20)).toBe(20);
    expect(enemy.shield).toBe(20);

    // Same strength: nothing happens, and it cannot grow by repetition.
    expect(enemy.grantShield(20)).toBe(0);
    expect(enemy.shield).toBe(20);

    // Weaker: refused, so a second weaker caster cannot strip a stronger ward.
    expect(enemy.grantShield(8)).toBe(0);
    expect(enemy.shield).toBe(20);

    // Stronger: replaces, and reports only the difference it added.
    expect(enemy.grantShield(120)).toBe(100);
    expect(enemy.shield).toBe(120);
    expect(enemy.grantShield(120)).toBe(0);
  });

  it('refuses to ward a dead or escaped creep', () => {
    const { enemy } = spawn('hex');
    enemy.isDead = true;
    expect(enemy.grantShield(20)).toBe(0);
    expect(enemy.shield).toBe(0);

    const escaped = spawn('hex').enemy;
    escaped.reachedBase = true;
    expect(escaped.grantShield(20)).toBe(0);
  });
});

describe('Hex Adept support pulses', () => {
  it('is configured as a 7 s, 100 px, 20-point shield caster', () => {
    expect(ENEMY_TYPES.hex.support).toEqual(HEX_SUPPORT);
    expect(ENEMY_TYPES.hex.support.intervalMs).toBe(7000);
    expect(ENEMY_TYPES.hex.support.radius).toBe(100);
    expect(ENEMY_TYPES.hex.support.amount).toBe(20);
  });

  it('does not fire on every frame — one pulse per interval, on the dot', () => {
    const { enemy: caster } = spawn('hex');
    const { enemy: ally } = spawn('grunt');
    ally.x = caster.x + 30;
    ally.y = caster.y;
    const scene = supportScene([caster, ally]);

    // Integer frames so the boundary is exact: 7000 ms is the interval, and the
    // millisecond before it must not pulse.
    for (let i = 0; i < 437; i += 1) tick(scene, 16); // 6,992 ms
    tick(scene, 7); // 6,999 ms
    expect(caster.supportTimer).toBe(6999);
    expect(ally.shield).toBe(0);
    expect(scene.vfx.impact).not.toHaveBeenCalled();

    tick(scene, 1); // 7,000 ms — the pulse
    expect(ally.shield).toBe(20);
    expect(caster.supportTimer).toBe(0);
    expect(scene.vfx.impact).toHaveBeenCalledTimes(1);

    // 60 more frames (≈1 s) must not keep re-warding.
    for (let i = 0; i < 60; i += 1) tick(scene, 16);
    expect(ally.shield).toBe(20);
    expect(scene.vfx.impact).toHaveBeenCalledTimes(1);
    expect(caster.supportTimer).toBe(960);
  });

  it('runs each caster on its own clock, so two adepts never pulse in lockstep', () => {
    const { enemy: earlier } = spawn('hex');
    const { enemy: later } = spawn('hex');
    const { enemy: ally } = spawn('grunt');
    ally.x = earlier.x;
    ally.y = earlier.y;
    later.x = earlier.x;
    later.y = earlier.y;

    // The first caster has already been on the field for 3 s when the second
    // one arrives — exactly what a wave does when it spawns them a beat apart.
    const scene = supportScene([earlier]);
    for (let i = 0; i < 300; i += 1) tick(scene, 10);
    expect(earlier.supportTimer).toBe(3000);

    scene.activeEnemies.push(later);
    // 4 s later the earlier caster crosses its 7 s mark; the later one is at 4 s.
    for (let i = 0; i < 400; i += 1) tick(scene, 10);
    expect(earlier.supportTimer).toBe(0);
    expect(later.supportTimer).toBe(4000);

    // 3 s after that the later one fires on its own schedule.
    for (let i = 0; i < 300; i += 1) tick(scene, 10);
    expect(later.supportTimer).toBe(0);
    expect(earlier.supportTimer).toBe(3000);
  });

  it('shields only living allies inside the radius', () => {
    const { enemy: caster } = spawn('hex');
    const inside = spawn('grunt').enemy;
    const outside = spawn('grunt').enemy;
    const dead = spawn('grunt').enemy;
    inside.x = caster.x + 50;
    inside.y = caster.y;
    outside.x = caster.x + 101;
    outside.y = caster.y;
    dead.x = caster.x + 10;
    dead.y = caster.y;
    dead.isDead = true;

    const scene = supportScene([caster, inside, outside, dead]);
    const warded = pulse(scene, caster);
    expect(warded).toBe(1);
    expect(inside.shield).toBe(20);
    expect(outside.shield).toBe(0);
    expect(dead.shield).toBe(0);
  });

  it('does not stack two casters into a double barrier', () => {
    const { enemy: a } = spawn('hex');
    const { enemy: b } = spawn('hex');
    const { enemy: ally } = spawn('grunt');
    for (const caster of [a, b]) {
      caster.x = ally.x = 400;
      caster.y = ally.y = 400;
    }
    const scene = supportScene([a, b, ally]);
    pulse(scene, a);
    expect(ally.shield).toBe(20);
    pulse(scene, b);
    expect(ally.shield).toBe(20);
  });

  it('stops pulsing once the caster dies or reaches the base', () => {
    const dead = spawn('hex').enemy;
    const escaped = spawn('hex').enemy;
    const { enemy: ally } = spawn('grunt');
    ally.x = dead.x;
    ally.y = dead.y;
    escaped.x = dead.x;
    escaped.y = dead.y;
    dead.isDead = true;
    escaped.reachedBase = true;

    const scene = supportScene([dead, escaped, ally]);
    for (let i = 0; i < 600; i += 1) tick(scene, 100);
    expect(ally.shield).toBe(0);
    expect(dead.supportTimer).toBeUndefined();
    expect(escaped.supportTimer).toBeUndefined();
  });

  it('keeps a warded creep killable — the barrier is not immunity', () => {
    const { enemy } = spawn('hex');
    enemy.grantShield(20);
    const hp = enemy.health;
    // 20 barrier + 90 body at 1 damage a hit: 110 TRUE hits, not infinite.
    let hits = 0;
    while (!enemy.isDead && hits < 500) {
      enemy.applyDamage(1, DAMAGE_TYPE.TRUE);
      hits += 1;
    }
    expect(enemy.isDead).toBe(true);
    expect(hits).toBe(20 + hp);
  });
});

describe('one death, one reward', () => {
  it('fires onDefeated exactly once however many hits land afterwards', () => {
    const { enemy, deaths } = spawn('grunt');
    enemy.health = 5;
    expect(enemy.applyDamage(10, DAMAGE_TYPE.TRUE).isDefeated).toBe(true);
    expect(deaths).toHaveLength(1);

    // A second splash, a chain bolt or a stale projectile must not pay again.
    for (let i = 0; i < 5; i += 1) {
      const after = enemy.applyDamage(10, DAMAGE_TYPE.TRUE);
      expect(after.isDefeated).toBe(false);
      expect(after.finalDamage).toBe(0);
    }
    expect(deaths).toHaveLength(1);
    expect(enemy.health).toBe(0);
  });
});

describe('palisades are still un-dodgeable', () => {
  it('gives the Hex Adept a real siege swing', () => {
    expect(ENEMY_TYPES.hex.flying).toBeUndefined();
    expect(ENEMY_TYPES.hex.siege).toBeGreaterThan(0);
    // A fragile caster, so it hits softer than the armoured lines but never 0.
    expect(siegeDamage(ENEMY_TYPES.hex)).toBe(6);
    expect(siegeDamage(ENEMY_TYPES.hex)).toBeLessThan(siegeDamage(ENEMY_TYPES.healer));
    expect(siegeDamage(ENEMY_TYPES.hex)).toBeGreaterThan(siegeDamage(ENEMY_TYPES.swarm));
  });

  it('lands that swing on a wall through the real updateSiege path', () => {
    const hits = [];
    const { enemy } = spawn('hex', {
      callbacks: {
        getStructureAt: () => wall,
        onStructureHit: (target, damage, attacker) => hits.push({ target, damage, attacker }),
      },
    });
    // The wall sits on the creep's own tile, so contact is immediate.
    const wall = { x: enemy.x, y: enemy.y, health: 420, isDestroyed: false };

    expect(enemy.updateSiege(16)).toBe(true);
    expect(enemy.isSieging).toBe(true);
    expect(hits).toHaveLength(0);

    // One full interval, then the swing lands.
    enemy.updateSiege(SIEGE_INTERVAL_MS);
    expect(hits).toHaveLength(1);
    expect(hits[0].damage).toBe(6);
    expect(hits[0].target).toBe(wall);
    expect(hits[0].attacker).toBe(enemy);
  });

  it('never lets an airborne unit siege, so wraiths still fly over walls', () => {
    const { enemy } = spawn('wraith');
    const wall = { x: enemy.x, y: enemy.y, health: 420, isDestroyed: false };
    const scene = makeCombatScene();
    const hits = [];
    enemy.callbacks.getStructureAt = () => wall;
    enemy.callbacks.onStructureHit = (...args) => hits.push(args);
    enemy.scene = scene;
    expect(enemy.updateSiege(SIEGE_INTERVAL_MS)).toBe(false);
    expect(enemy.isSieging).toBe(false);
    expect(hits).toHaveLength(0);
  });
});

describe('stage 5 actually fields the archetypes under test', () => {
  it('puts guard, hex and wraith in the Ashen Caldera wave list', () => {
    const stage = getLevel('level-5');
    const types = new Set();
    for (const wave of stage.waves) {
      for (const group of wave.groups) types.add(group.type);
    }
    expect(types.has('guard')).toBe(true);
    expect(types.has('hex')).toBe(true);
    expect(types.has('wraith')).toBe(true);
    // …and the flying one is the only airborne type in the stage.
    const airborne = [...types].filter((t) => ENEMY_TYPES[t].flying);
    expect(airborne).toEqual(['wraith']);
  });

  it('leaves the older support rule untouched', () => {
    // The older Plague Shaman keeps its own ability block; the new Hex Adept
    // must not have silently replaced it.
    expect(ENEMY_TYPES.healer.ability).toEqual(HEALER_SUPPORT);
    expect(ENEMY_TYPES.healer.support).toBeUndefined();
    expect(ENEMY_TYPES.hex.ability).toBeUndefined();
  });
});
