// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  TOWER_TYPES,
  BUILD_OPTIONS,
  BUILD_GROUPS,
  groupForBuild,
  getBuildDefinition,
} from '../src/data/towerData.js';
import { ENGINEER_LINES } from '../src/data/engineerDefenses.js';
import {
  TOWER_VISUALS,
  SLOTS,
  MUZZLE_OFFSET,
  PROJECTILE_TEXTURES,
  IMPACT_TEXTURES,
} from '../src/data/towerVisuals.js';
import { ENGINEER_ART } from '../src/data/engineerTowerArt.js';
import { FX_SHEETS } from '../src/data/fxManifest.js';
import { IMPACT_SHEETS } from '../src/data/spireManifest.js';
import { ASCENSION, ascensionTier, dps, MAX_LEVEL } from '../src/data/towerAscension.js';
import { NICHE, costAt, statsAt, TARGETS, throughput } from './helpers/balance.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';

const ROOT = path.resolve(__dirname, '..');
const TOWER_DIR = path.join(ROOT, 'public/assets/towers');
const PROJ_DIR = path.join(ROOT, 'public/assets/projectiles');
const FX_DIR = path.join(ROOT, 'public/assets/fx');

/* ------------------------------------------------------------------ stubs */

function stubNode(extra = {}) {
  const target = { x: 0, y: 0, alpha: 1, visible: true, destroy() {} };
  let proxy;
  proxy = new Proxy(
    Object.assign(target, extra),
    {
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
    }
  );
  return proxy;
}

function makeScene() {
  return {
    add: {
      container: () => stubNode(),
      image: () => stubNode(),
      sprite: () => stubNode(),
      text: () => stubNode(),
      graphics: () => stubNode(),
      rectangle: () => stubNode(),
      circle: () => stubNode(),
      particles: () => stubNode(),
    },
    anims: { exists: () => false },
    tweens: { add: () => {} },
    time: { delayedCall: () => {} },
    textures: { exists: () => true, get: () => null },
    activeEnemies: [],
    activeTowers: [],
    cameras: { main: { shake: () => {} } },
    vfx: null,
  };
}

const parkingPath = () => new Array(2000).fill('5,0');

function spawnCreep(typeKey, scene = makeScene()) {
  const enemy = new Enemy(scene, typeKey, 1, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
  });
  scene.activeEnemies.push(enemy);
  return enemy;
}

/* ------------------------------------------------------------------- tests */

describe('the engineer roster', () => {
  it('ships five new lines, each with two levels and two branches', () => {
    expect(ENGINEER_LINES).toHaveLength(5);
    expect(ENGINEER_LINES.sort()).toEqual(['crossbow', 'flamer', 'gatling', 'harpoon', 'venom']);
    for (const line of ENGINEER_LINES) {
      const def = TOWER_TYPES[line];
      expect(def, `${line} is missing from TOWER_TYPES`).toBeTruthy();
      expect(def.levels).toHaveLength(2);
      expect(Object.keys(def.specializations)).toHaveLength(2);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(30);
      // The two branches must be different answers, never the same tower twice.
      const [a, b] = Object.values(def.specializations);
      expect(a.branch).not.toBe(b.branch);
      expect(a.damage === b.damage && a.cooldown === b.cooldown).toBe(false);
    }
  });

  it('gives every engineer line its own money-quote identity', () => {
    // Each of the five covers a different role: precision / raw dps / burn /
    // poison / control. If two lines share a signature the roster is padding.
    const signatures = {
      crossbow: (spec) => (spec.armorPenetration || 0) > 0.5 || spec.bossBonus > 0,
      gatling: (spec) => spec.cooldown <= 120,
      flamer: (spec) => spec.dot?.kind === 'fire',
      venom: (spec) => spec.dot?.kind === 'poison',
      harpoon: (spec) => (spec.stunMs || 0) > 0 || spec.bossBonus >= 0.4,
    };
    for (const line of ENGINEER_LINES) {
      const branches = Object.values(TOWER_TYPES[line].specializations);
      const capTiers = Object.keys(TOWER_TYPES[line].specializations).map((specKey) => {
        const spec = TOWER_TYPES[line].specializations[specKey];
        return { ...spec, ...ascensionTier(line, specKey, 4), ...ascensionTier(line, specKey, 5) };
      });
      expect(capTiers.some(signatures[line]), `${line} never reaches its own identity`).toBe(true);
      expect(branches.length).toBe(2);
    }
  });

  it('pages the dock into families that cover every build option exactly once', () => {
    const covered = BUILD_GROUPS.flatMap((group) => group.lines);
    expect(new Set(covered).size).toBe(covered.length);
    expect(new Set(covered)).toEqual(new Set(BUILD_OPTIONS));
    for (const key of BUILD_OPTIONS) {
      expect(groupForBuild(key).lines).toContain(key);
      expect(getBuildDefinition(key).hotkey).toBeTruthy();
    }
    // No tab is so large that it needs a second row on a phone.
    for (const group of BUILD_GROUPS) expect(group.lines.length).toBeLessThanOrEqual(7);
  });
});

describe('engineer art', () => {
  it('ships a base and a weapon for all eight slots of all five lines', () => {
    for (const line of ENGINEER_LINES) {
      for (const slot of SLOTS) {
        const art = ENGINEER_ART[line][slot];
        expect(art, `${line}.${slot}`).toBeTruthy();
        expect(existsSync(path.join(TOWER_DIR, art.base)), art.base).toBe(true);
        expect(existsSync(path.join(TOWER_DIR, art.weapon)), art.weapon).toBe(true);
      }
    }
  });

  it('grows the silhouette with every tier instead of repainting it', () => {
    // The complaint that started this pass: an upgrade must change the drawing.
    // Each tier's canvas is taller and wider than the one below it.
    for (const line of ENGINEER_LINES) {
      const heights = ['lvl1', 'lvl2', 'spec-a', 'spec-a2', 'spec-a3'].map(
        (slot) => ENGINEER_ART[line][slot].height
      );
      for (let i = 1; i < heights.length; i += 1) {
        expect(heights[i], `${line} tier ${i + 1} is not taller`).toBeGreaterThan(heights[i - 1]);
      }
      const widths = ['lvl1', 'lvl2', 'spec-b', 'spec-b2', 'spec-b3'].map(
        (slot) => ENGINEER_ART[line][slot].width
      );
      for (let i = 1; i < widths.length; i += 1) {
        expect(widths[i], `${line} tier ${i + 1} is not wider`).toBeGreaterThan(widths[i - 1]);
      }
    }
  });

  it('registers every slot in the shared visual table with a measured muzzle', () => {
    for (const line of ENGINEER_LINES) {
      for (const slot of SLOTS) {
        const visual = TOWER_VISUALS[line][slot];
        expect(visual, `${line}.${slot} missing from TOWER_VISUALS`).toBeTruthy();
        expect(visual.baseKey).toBe(`tower-base-${visual.file}`);
        expect(visual.weaponKey).toBe(`tower-top-${visual.file}`);
        expect(visual.frames).toBeGreaterThan(1);
        const muzzle = MUZZLE_OFFSET[visual.file];
        expect(muzzle, `${visual.file} has no muzzle`).toBeTruthy();
        expect(muzzle.y).toBeLessThan(0);
      }
    }
  });

  it('gives every engineer shot its own projectile sprite', () => {
    for (const line of ENGINEER_LINES) {
      const types = new Set();
      const def = TOWER_TYPES[line];
      types.add(def.projectile);
      for (const spec of Object.values(def.specializations)) if (spec.projectile) types.add(spec.projectile);
      for (const type of types) {
        const key = PROJECTILE_TEXTURES[type];
        expect(key, `${type} has no projectile art`).toBeTruthy();
        expect(existsSync(path.join(PROJ_DIR, `${key}.png`)), key).toBe(true);
        expect(IMPACT_TEXTURES[type], `${type} has no impact fallback`).toBeTruthy();
        expect(IMPACT_SHEETS[IMPACT_TEXTURES[type]], IMPACT_TEXTURES[type]).toBeTruthy();
      }
    }
    // …and no two lines fire the same sprite.
    const perLine = ENGINEER_LINES.map((line) => PROJECTILE_TEXTURES[TOWER_TYPES[line].projectile]);
    expect(new Set(perLine).size).toBe(perLine.length);
  });

  it('ships an impact and a muzzle effect for every engineer line', () => {
    for (const line of ENGINEER_LINES) {
      for (const kind of ['impact', 'muzzle']) {
        const key = `fx-line-${line}-${kind}`;
        expect(FX_SHEETS[key], `${key} missing from the fx manifest`).toBeTruthy();
        expect(existsSync(path.join(FX_DIR, FX_SHEETS[key].file))).toBe(true);
      }
      expect(FX_SHEETS[`fx-line-${line}-impact`].frames).toBeGreaterThan(4);
    }
  });
});

describe('burn and poison', () => {
  it('ticks damage over time without touching armour', () => {
    const creep = spawnCreep('brute'); // 40 armour would otherwise eat most hits
    const before = creep.health;
    creep.applyDot({ damage: 10, tickMs: 500, durationMs: 2000, kind: 'fire' });
    creep.updateDots(500);
    expect(creep.health).toBe(before - 10);
    creep.updateDots(500);
    expect(creep.health).toBe(before - 20);
  });

  it('expires on its own and never stacks into an infinite burn', () => {
    const creep = spawnCreep('grunt');
    const before = creep.health;
    creep.applyDot({ damage: 5, tickMs: 100, durationMs: 300, kind: 'fire' });
    for (let i = 0; i < 20; i += 1) creep.updateDots(100);
    expect(creep.dots).toHaveLength(0);
    // 3 ticks of 5, not 20.
    expect(before - creep.health).toBe(15);
  });

  it('re-applying the same kind refreshes the stack instead of duplicating it', () => {
    const creep = spawnCreep('grunt');
    creep.applyDot({ damage: 6, tickMs: 500, durationMs: 1000, kind: 'poison' });
    creep.applyDot({ damage: 9, tickMs: 500, durationMs: 3000, kind: 'poison' });
    expect(creep.dots).toHaveLength(1);
    expect(creep.dots[0].damage).toBe(9);
    expect(creep.dots[0].remainingMs).toBe(3000);
  });

  it('lets fire and poison work on the same target', () => {
    const creep = spawnCreep('grunt');
    creep.applyDot({ damage: 4, tickMs: 500, durationMs: 1000, kind: 'fire' });
    creep.applyDot({ damage: 4, tickMs: 500, durationMs: 1000, kind: 'poison' });
    expect(creep.dots).toHaveLength(2);
  });

  it('runs the burn from Enemy.update, so a creep can die mid-walk', () => {
    const creep = spawnCreep('swarm');
    creep.applyDot({ damage: 200, tickMs: 100, durationMs: 500, kind: 'fire' });
    creep.update(100);
    expect(creep.isDead).toBe(true);
  });
});

describe('enemy traits', () => {
  it('phalanx blunts a hit when the creep is packed with allies', () => {
    // Two separate boards: one lone thrall, one thrall in a scrum.
    const loneScene = makeScene();
    const alone = spawnCreep('thrall', loneScene);

    const packScene = makeScene();
    const packed = spawnCreep('thrall', packScene);
    for (let i = 0; i < 3; i += 1) {
      const buddy = spawnCreep('thrall', packScene);
      buddy.x = packed.x + i * 4;
      buddy.y = packed.y;
    }

    const aloneDamage = alone.applyDamage(100, 'physical').damageDealtToHealth;
    const packedDamage = packed.applyDamage(100, 'physical').damageDealtToHealth;
    expect(packedDamage).toBeLessThan(aloneDamage);
  });

  it('adaptive armour hardens the brute as it is hit', () => {
    const brute = spawnCreep('brute');
    const start = brute.armor;
    for (let i = 0; i < 4; i += 1) brute.applyDamage(50, 'physical');
    expect(brute.armor).toBeGreaterThan(start);
    // …but it is capped, so it can never become invulnerable.
    for (let i = 0; i < 40; i += 1) brute.applyDamage(50, 'physical');
    expect(brute.armor).toBeLessThanOrEqual(start + 30);
  });

  it('enrage makes a cornered runner faster, never faster than the cap', () => {
    const runner = spawnCreep('runner');
    runner.update(16);
    const healthy = runner.speed;
    runner.health = 1;
    runner.update(16);
    expect(runner.speed).toBeGreaterThan(healthy);
    expect(runner.speed).toBeLessThanOrEqual(runner.baseSpeed * 1.31);
  });
});

describe('stun and boss damage', () => {
  it('stuns stop movement and then wear off', () => {
    const creep = spawnCreep('grunt');
    const startX = creep.x;
    creep.applyStun(500);
    creep.update(16);
    expect(creep.x).toBe(startX);
    for (let i = 0; i < 40; i += 1) creep.update(16);
    expect(creep.stunTimer).toBe(0);
  });

  it('bosses resist most of a stun', () => {
    const boss = spawnCreep('voidherald'); // stunResist 0.6
    boss.applyStun(1000);
    expect(boss.stunTimer).toBeCloseTo(400, 5);
    const grunt = spawnCreep('grunt');
    grunt.applyStun(1000);
    expect(grunt.stunTimer).toBe(1000);
  });

  it('bossBonus only pays out against bosses', () => {
    const stats = {
      damage: 100,
      damageType: 'piercing',
      armorPenetration: 1,
      bossBonus: 0.5,
      speed: 500,
    };
    const scene = makeScene();
    // Magmalord carries no shield, so the hit lands on health and the bonus is
    // measurable instead of being eaten by a barrier.
    const boss = spawnCreep('magmalord', scene);
    const grunt = spawnCreep('grunt', scene);
    const projectile = new Projectile(scene, 'harpoon', boss.x, boss.y, boss, stats, scene.activeEnemies);
    const vsBoss = projectile.hitEnemy(boss, 100).damageDealtToHealth;
    const vsGrunt = projectile.hitEnemy(grunt, 100).damageDealtToHealth;
    expect(vsBoss).toBeGreaterThan(vsGrunt);
  });

  it('carries the doT and stun from a shot into the target', () => {
    const scene = makeScene();
    const grunt = spawnCreep('grunt', scene);
    const stats = {
      damage: 10,
      damageType: 'magic',
      dot: { damage: 5, tickMs: 500, durationMs: 1000, kind: 'poison' },
      stunMs: 300,
      speed: 500,
    };
    const projectile = new Projectile(scene, 'acid', grunt.x, grunt.y, grunt, stats, scene.activeEnemies);
    projectile.hitEnemy(grunt, 10);
    expect(grunt.dots).toHaveLength(1);
    expect(grunt.stunTimer).toBe(300);
  });
});

describe('balance guardrails', () => {
  /**
   * Power per gold, measured the same way the niche contract measures it.
   *
   * The old version of this block carried its own private weighting — aura x2.6,
   * chain x2.0, dot x1.8 — which made a support standard and a DPS turret
   * comparable and then complained when they were not. A banner buffs the whole
   * field and a gatling shoots things; dividing one by the other is not a
   * balance question.
   *
   * So the band is now checked inside the two families that actually compete:
   * damage branches against each other, utility branches against each other.
   */
  const families = () =>
    Object.entries(TOWER_TYPES).flatMap(([line, def]) =>
      Object.keys(def.specializations || {}).map((specKey) => {
        const niche = NICHE[line][specKey];
        const stats = statsAt(line, specKey, 5);
        const cost = costAt(line, specKey, 5);
        // "Power" is what the tower does to a single target plus what it does to
        // a crowd, averaged — a tower with splash is not twice a tower.
        const power = (throughput(stats, TARGETS.single) + throughput(stats, TARGETS.pack)) / 2;
        const family = niche === 'control' ? 'control' : niche === 'support' ? 'support' : 'damage';
        return { key: `${line}.${specKey}`, ratio: power / cost, cost, family };
      })
    );

  /** Best-to-worst spread inside one family. */
  function band(family) {
    const rows = families()
      .filter((row) => row.family === family)
      .sort((a, b) => b.ratio - a.ratio);
    expect(rows.length, `${family} family is empty`).toBeGreaterThanOrEqual(2);
    return { best: rows[0], worst: rows[rows.length - 1], spread: rows[0].ratio / rows[rows.length - 1].ratio };
  }

  it('keeps every damage branch inside the same power-per-gold band', () => {
    const { best, worst, spread } = band('damage');
    // Roughly a 4x band, so no line is simply "the right choice" in every game.
    expect(spread, `${best.key} dwarfs ${worst.key}`).toBeLessThan(4.2);
  });

  it('keeps the control towers comparable to each other', () => {
    // Both still shoot; the slow is a bonus, not a substitute for damage.
    const { best, worst, spread } = band('control');
    expect(spread, `${best.key} dwarfs ${worst.key}`).toBeLessThan(2.5);
  });

  it('keeps the two standards comparable to each other', () => {
    // Neither shoots for a living, so they must be close — the reason to pick
    // one is the aura, not a hidden DPS difference.
    const { best, worst, spread } = band('support');
    expect(spread, `${best.key} dwarfs ${worst.key}`).toBeLessThan(1.5);
  });

  it('never asks an absurd amount of gold for a maxed tower', () => {
    const rows = Object.values(families());
    const costs = rows.map((r) => r.cost);
    expect(Math.max(...costs) / Math.min(...costs)).toBeLessThan(1.9);
  });

  it('caps every line at level 5 with a signature and a rising cost', () => {
    for (const line of Object.keys(TOWER_TYPES)) {
      for (const specKey of Object.keys(TOWER_TYPES[line].specializations)) {
        const spec = TOWER_TYPES[line].specializations[specKey];
        const l4 = ascensionTier(line, specKey, 4);
        const l5 = ascensionTier(line, specKey, 5);
        expect(MAX_LEVEL).toBe(5);
        expect(l5.upgradeCost).toBeGreaterThan(l4.upgradeCost);
        expect(l5.ability?.label).toBeTruthy();
        expect(ASCENSION[line][specKey]).toBeTruthy();
      }
    }
  });

  it('keeps every branch worth upgrading on its own', () => {
    for (const line of Object.keys(TOWER_TYPES)) {
      for (const specKey of Object.keys(TOWER_TYPES[line].specializations)) {
        const spec = TOWER_TYPES[line].specializations[specKey];
        const l4 = { ...spec, ...ascensionTier(line, specKey, 4) };
        const l5 = { ...l4, ...ascensionTier(line, specKey, 5) };
        expect(dps(l4), `${line}.${specKey} L4`).toBeGreaterThan(dps(spec));
        expect(dps(l5), `${line}.${specKey} L5`).toBeGreaterThan(dps(l4));
      }
    }
  });

  it('keeps the boss roster a threat after the new lines land', () => {
    const bosses = Object.entries(ENEMY_TYPES).filter(([, def]) => def.isBoss);
    expect(bosses.length).toBeGreaterThanOrEqual(11);
    const brute = ENEMY_TYPES.brute;
    for (const [key, def] of bosses) {
      expect(def.health, `${key} is weaker than a brute`).toBeGreaterThan(brute.health * 3);
      expect(def.stunResist, `${key} has no stun resistance`).toBeGreaterThan(0);
    }
    // The titans must still out-stat the entry bosses.
    expect(ENEMY_TYPES.voidherald.health).toBeGreaterThan(ENEMY_TYPES.magmalord.health);
  });
});
