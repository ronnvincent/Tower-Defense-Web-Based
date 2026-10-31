import { describe, it, expect } from 'vitest';
import { Tower } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ROYAL_TOWER_TYPES } from '../src/data/royalDefences.js';
import { ASCENSION } from '../src/data/towerAscension.js';
import { TILE_SIZE } from '../src/config/gameConfig.js';
import { makeCombatContext, makeCombatScene } from './helpers/combat.js';

/**
 * Point blank.
 *
 * A defence used to refuse any target closer than a `minRange` floor — 90 px on
 * the mortar line, up to 140 px on the twin-bore battery — with the reasoning
 * that a siege piece cannot depress far enough to shoot something standing on
 * its own emplacement.
 *
 * The floor was measured against the wrong thing. A tower stands on a tile, and
 * a creep on the road tile beside it is **one tile** away: 64 px, centre to
 * centre. So the smallest legal walk-by was already inside the floor, and a
 * mortar raised next to the road was silent for every creep that passed it. The
 * player describes exactly that: "my defences stop attacking once the enemies
 * get really close."
 *
 * These tests pin the rule that replaced it: reach is the only gate. A creep
 * inside the ring is shootable however close it stands, and a creep outside it
 * is still out — the fix must not turn every tower into map-wide artillery.
 */

const TILE = TILE_SIZE;
const parkingPath = () => new Array(2000).fill('5,0');

/** Every line that is supposed to shoot at things. */
function offensiveLines() {
  const out = [];
  for (const [line, def] of Object.entries(TOWER_TYPES)) {
    if (def.supportOnly || def.trap) continue;
    out.push({ line, def, family: 'classic' });
  }
  for (const [line, def] of Object.entries(ROYAL_TOWER_TYPES)) {
    if (def.supportOnly || def.trap) continue;
    // Walls are hit-points for creeps to chew, not weapons.
    if (def.barricade || def.defence === 'barricade') continue;
    out.push({ line, def, family: 'royal' });
  }
  return out;
}

/**
 * Run one tower against a creep parked `gap` px away.
 *
 * A stationary creep is the honest probe for a range rule: a walking one only
 * passes through the close band for a few frames, and a bug that makes the whole
 * band unshootable would still show a couple of shots from further out.
 */
function shootout(line, gap, { level = 1, specialization = null, seconds = 8, enemyType = 'grunt' } = {}) {
  const scene = makeCombatScene();
  const context = makeCombatContext(scene);
  const tower = new Tower(scene, line, 5, 5, context);
  if (level !== 1 || specialization) {
    tower.level = level;
    if (specialization) tower.specialization = specialization;
  }
  tower.cooldownTimer = 0;

  const cx = 5 * TILE + TILE / 2;
  const cy = 5 * TILE + TILE / 2;
  const enemy = new Enemy(scene, enemyType, 1, parkingPath(), {
    onReachedBase: () => {},
    onDefeated: () => {},
    getBasePoint: () => ({ x: 100000, y: 100000 }),
  });
  enemy.x = cx + gap;
  enemy.y = cy;

  context.activeEnemies = scene.activeEnemies = [enemy];

  let shots = 0;
  const seen = new Set();
  let everHadTarget = false;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 16) {
    tower.update(16);
    if (tower.currentTarget) everHadTarget = true;
    for (const projectile of context.activeProjectiles) {
      if (!seen.has(projectile.id)) {
        seen.add(projectile.id);
        shots = seen.size;
      }
      projectile.update(16);
    }
    context.activeProjectiles = context.activeProjectiles.filter((p) => !p.isDead);
  }

  return { tower, enemy, shots, everHadTarget, startHealth: enemy.maxHealth, health: enemy.health };
}

/** The creep a line is allowed to shoot: the Skybreaker is an anti-air gun. */
function preyFor(def) {
  return def.targetsGround === false ? 'ashwing' : 'grunt';
}

describe('a defence still fires at point blank', () => {
  it('engages a creep standing one tile from it, on every line that shoots', () => {
    const idle = [];
    const seenLines = new Set();
    for (const { line, def } of offensiveLines()) {
      if (seenLines.has(line)) continue;
      seenLines.add(line);
      const result = shootout(line, TILE, { enemyType: preyFor(def) });
      if (result.shots === 0) idle.push(line);
    }
    // A line that cannot answer a creep touching it is the reported bug.
    expect(idle).toEqual([]);
  });

  it('engages even when the creep is almost on top of it', () => {
    for (const gap of [8, 20, 32, 48]) {
      for (const line of ['mortar', 'royalArtillery']) {
        const { shots, health } = shootout(line, gap);
        expect(shots, `${line} @ ${gap}px fired`).toBeGreaterThan(0);
        expect(health, `${line} @ ${gap}px took damage`).toBeLessThan(92);
      }
    }
  });

  it('covers the whole band the old floor used to make untouchable', () => {
    // 64 px is the nearest legal walk-by; the floors ran 90–140 px, so the
    // reported case is every creep inside that band, not a corner case.
    for (const gap of [64, 80, 89, 90, 110, 129, 130, 140]) {
      for (const line of ['mortar', 'royalArtillery']) {
        const { shots } = shootout(line, gap);
        expect(shots, `${line} @ ${gap}px fired`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the high tiers honest too, where the floor was widest', () => {
    const cases = [
      ['mortar', 'greatmortar', 3],
      ['mortar', 'cluster', 3],
      ['royalArtillery', 'bombard', 3],
      ['royalArtillery', 'battery', 3],
    ];
    for (const [line, specialization, level] of cases) {
      const { shots } = shootout(line, 40, { level, specialization });
      expect(shots, `${line}.${specialization} @ 40px`).toBeGreaterThan(0);
    }
  });

  it('still refuses anything outside its reach', () => {
    // The dead zone was removed, not the ceiling. A tower that shoots at 40 px
    // must still be blind at range + 40 px, or every line has become a map-wide
    // gun and the range stat means nothing.
    for (const { line } of offensiveLines()) {
      const probe = shootout(line, 1);
      const reach = probe.tower.attackRange;
      const outside = shootout(line, reach + 40, { seconds: 4 });
      expect(outside.shots, `${line} fired past ${reach + 40}px`).toBe(0);
    }
  });

  it('does not keep a min-range field in any defence data', () => {
    // The rule is gone from the engine; a leftover field would be a number that
    // no longer means anything, and the next reader would wire it back up.
    const offenders = [];
    const scan = (line, where, stats) => {
      if (!stats) return;
      if (Object.prototype.hasOwnProperty.call(stats, 'minRange')) offenders.push(`${line} ${where}`);
      if (Array.isArray(stats.shots)) return;
    };
    for (const [line, def] of Object.entries(ROYAL_TOWER_TYPES)) {
      (def.levels || []).forEach((stats, i) => scan(line, `L${i + 1}`, stats));
      for (const [key, spec] of Object.entries(def.specializations || {})) scan(line, key, spec);
    }
    for (const [line, branches] of Object.entries(ASCENSION)) {
      for (const [key, branch] of Object.entries(branches || {})) {
        scan(line, `${key}.elite`, branch.elite);
        scan(line, `${key}.apex`, branch.apex);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not sell a dead zone in the shop text', () => {
    const claims = [];
    const check = (name, text) => {
      if (typeof text === 'string' && /dead zone|minimum range|min range/i.test(text)) {
        claims.push(name);
      }
    };
    for (const [line, def] of Object.entries(ROYAL_TOWER_TYPES)) {
      (def.levels || []).forEach((stats, i) => check(`${line} L${i + 1}`, stats.description));
      for (const [key, spec] of Object.entries(def.specializations || {})) {
        check(`${line}.${key}`, spec.description);
      }
    }
    for (const [line, branches] of Object.entries(ASCENSION)) {
      for (const [key, branch] of Object.entries(branches || {})) {
        check(`${line}.${key}.elite`, branch.elite?.description);
        check(`${line}.${key}.apex`, branch.apex?.description);
      }
    }
    expect(claims).toEqual([]);
  });
});

describe('point blank against a creep walking past', () => {
  it('keeps firing after the creep has closed inside the old floor', () => {
    // The real shape of the report: a creep walks the lane beside a mortar. It
    // starts far away (in range, shot at), closes to one tile — the old dead
    // zone — and used to become untouchable for the rest of the walk.
    const scene = makeCombatScene();
    const context = makeCombatContext(scene);
    const tower = new Tower(scene, 'mortar', 5, 5, context);
    tower.cooldownTimer = 0;

    const roadY = 5 * TILE + TILE / 2;      // the lane the creep walks along
    const cx = 5 * TILE + TILE / 2;
    const path = Array.from({ length: 40 }, (_, col) => `5,${col}`);
    const enemy = new Enemy(scene, 'grunt', 1, path, {
      onReachedBase: () => {},
      onDefeated: () => {},
      getBasePoint: () => ({ x: 100000, y: 100000 }),
    });
    // Put the mortar one tile off the road: the closest legal placement.
    tower.y = roadY + TILE;
    context.activeEnemies = scene.activeEnemies = [enemy];
    enemy.x = cx - 300;
    enemy.y = roadY;
    // Targeting, not damage: a grunt dies to the first shell long before it
    // reaches the tower, and the walk would never reach the close band.
    enemy.maxHealth = 100000;
    enemy.health = 100000;

    let shotsWhileClose = 0;
    const seen = new Set();
    for (let elapsed = 0; elapsed < 20000; elapsed += 16) {
      tower.update(16);
      for (const projectile of context.activeProjectiles) {
        if (!seen.has(projectile.id)) {
          seen.add(projectile.id);
          const gap = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
          if (gap <= 96) shotsWhileClose += 1;
        }
        projectile.update(16);
      }
      context.activeProjectiles = context.activeProjectiles.filter((p) => !p.isDead);
      if (!enemy.isDead) enemy.update(16);
      if (enemy.isDead) break;
    }
    expect(shotsWhileClose).toBeGreaterThan(0);
  });
});
