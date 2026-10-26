// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  HERO,
  Hero,
  nearestGroundTarget,
  isGroundEnemy,
  isAliveEnemy,
} from '../src/entities/Hero.js';

/**
 * The Bastion Vanguard.
 *
 * The specification fixes every number: 500 health, 110 px/s, 30 px reach, 30
 * damage every second, and a 100-damage ground strike on a 12 s cooldown with a
 * 75 px radius that hits each enemy once. These tests pin those numbers and the
 * rules around them (ground only, no double dips, a real down state) against a
 * stub scene, because none of that needs a renderer to be true.
 */

function stubScene() {
  const group = () => ({});
  return {
    add: {
      container: () => ({
        x: 0,
        y: 0,
        setPosition(x, y) {
          this.x = x;
          this.y = y;
          return this;
        },
        setDepth() {
          return this;
        },
        add() {},
        destroy() {},
      }),
      ellipse: group,
      graphics: () => ({
        clear() {},
        fillStyle() {
          return this;
        },
        fillRect() {
          return this;
        },
      }),
      image: () => ({
        frame: { name: '0' },
        setOrigin() {},
        setScale() {},
        setFrame(name) {
          this.frame = { name: String(name) };
        },
        setFlipX() {},
        setAlpha() {},
        setTint() {},
        clearTint() {},
      }),
    },
  };
}

let nextId = 1;
function enemy({ x = 0, y = 0, flying = false, health = 200, dead = false, escaped = false } = {}) {
  return {
    id: nextId++,
    x,
    y,
    flying,
    def: { flying },
    health,
    isDead: dead,
    reachedBase: escaped,
    hits: [],
    applyDamage(amount, type) {
      this.hits.push([amount, type]);
      this.health = Math.max(0, this.health - amount);
      if (this.health === 0) this.isDead = true;
      return { isDefeated: this.health === 0, finalDamage: amount };
    },
  };
}

function makeHero(options = {}) {
  return new Hero(stubScene(), { x: 0, y: 0, ...options });
}

describe('hero config', () => {
  it('uses the specified stat line', () => {
    expect(HERO.maxHealth).toBe(500);
    expect(HERO.speed).toBe(110);
    expect(HERO.range).toBe(30);
    expect(HERO.damage).toBe(30);
    expect(HERO.intervalMs).toBe(1000);
    expect(HERO.strike).toEqual({
      damage: 100,
      radius: 75,
      cooldownMs: 12000,
      type: 'physical',
    });
  });

  it('starts at full health and off cooldown', () => {
    const hero = makeHero();
    expect(hero.health).toBe(500);
    expect(hero.isDown).toBe(false);
    expect(hero.strikeReady).toBe(true);
  });

  it('knows what a ground enemy is', () => {
    expect(isGroundEnemy(enemy())).toBe(true);
    expect(isGroundEnemy(enemy({ flying: true }))).toBe(false);
    expect(isGroundEnemy(enemy({ dead: true }))).toBe(true); // ground, but not alive
    expect(isGroundEnemy(null)).toBe(false);
    expect(isAliveEnemy(enemy({ dead: true }))).toBe(false);
    expect(isAliveEnemy(enemy({ escaped: true }))).toBe(false);
    expect(isAliveEnemy(enemy({ health: 0 }))).toBe(false);
  });
});

describe('hero targeting', () => {
  it('picks the closest living ground creep inside reach', () => {
    const hero = { x: 0, y: 0 };
    const far = enemy({ x: 40, y: 0 });
    const near = enemy({ x: 12, y: 0 });
    const flier = enemy({ x: 4, y: 0, flying: true });
    const corpse = enemy({ x: 2, y: 0, dead: true });
    expect(nearestGroundTarget(hero, [far, flier, corpse, near], 30)).toBe(near);
  });

  it('returns null when nothing is in reach', () => {
    const hero = { x: 0, y: 0 };
    expect(nearestGroundTarget(hero, [enemy({ x: 200, y: 0 })], 30)).toBeNull();
    expect(nearestGroundTarget(hero, [], 30)).toBeNull();
    expect(nearestGroundTarget(hero, null, 30)).toBeNull();
  });
});

describe('hero auto-attack', () => {
  it('hits once per second for 30 physical damage', () => {
    const hero = makeHero();
    const target = enemy({ x: 10, y: 0 });
    const first = hero.update(16, [target]);
    expect(first.attacked).toBe(target);
    expect(target.hits).toEqual([[30, 'physical']]);

    // Still on cooldown: no second swing in the same second.
    hero.update(500, [target]);
    expect(target.hits).toHaveLength(1);
    // A full second after the first swing, it swings again.
    hero.update(600, [target]);
    expect(target.hits).toHaveLength(2);
  });

  it('does not tick its cooldown into an instant double swing when idle', () => {
    const hero = makeHero();
    hero.update(5000, []);
    const target = enemy({ x: 5, y: 0 });
    hero.update(16, [target]);
    hero.update(16, [target]);
    expect(target.hits).toHaveLength(1);
  });

  it('never reaches a flier', () => {
    const hero = makeHero();
    const flier = enemy({ x: 5, y: 0, flying: true });
    hero.update(16, [flier]);
    expect(flier.hits).toHaveLength(0);
  });
});

describe('Shieldbreaker Strike', () => {
  it('hits every ground creep in radius for 100 once', () => {
    const hero = makeHero({ x: 100, y: 100 });
    const inside = enemy({ x: 140, y: 100 });
    const edge = enemy({ x: 100, y: 175 });
    const outside = enemy({ x: 100, y: 200 });
    const flier = enemy({ x: 110, y: 100, flying: true });
    const result = hero.strike([inside, edge, outside, flier]);

    expect(result).toEqual({ hits: 2, ready: true });
    expect(inside.hits).toEqual([[100, 'physical']]);
    expect(edge.hits).toEqual([[100, 'physical']]);
    expect(outside.hits).toHaveLength(0);
    expect(flier.hits).toHaveLength(0);
  });

  it('never damages the same enemy twice in one cast', () => {
    const hero = makeHero({ x: 0, y: 0 });
    const target = enemy({ x: 10, y: 0 });
    hero.strike([target, target, target]);
    expect(target.hits).toHaveLength(1);
  });

  it('starts a 12 s cooldown and refuses a second cast', () => {
    const hero = makeHero();
    hero.strike([enemy({ x: 5, y: 0 })]);
    expect(hero.strikeCooldownMs).toBe(12000);
    expect(hero.strikeReady).toBe(false);
    expect(hero.strike([enemy({ x: 5, y: 0 })])).toEqual({ hits: 0, ready: false });

    hero.update(6000, []);
    expect(hero.strikeReady).toBe(false);
    hero.update(6001, []);
    expect(hero.strikeReady).toBe(true);
  });

  it('revalidates liveness at cast time, not from a stale list', () => {
    const hero = makeHero({ x: 0, y: 0 });
    const corpse = enemy({ x: 5, y: 0, dead: true });
    const escaped = enemy({ x: 6, y: 0, escaped: true });
    expect(hero.strike([corpse, escaped])).toEqual({ hits: 0, ready: true });
    expect(corpse.hits).toHaveLength(0);
    expect(escaped.hits).toHaveLength(0);
  });
});

describe('hero movement and the down state', () => {
  it('walks toward an order at 110 px/s and stops on arrival', () => {
    const hero = makeHero({ x: 0, y: 0 });
    hero.moveTo(110, 0);
    hero.update(500, []);
    expect(hero.x).toBeGreaterThan(50);
    expect(hero.x).toBeLessThan(60);
    hero.update(500, []);
    expect(hero.x).toBe(110);
    expect(hero.destination).toBeNull();
  });

  it('clamps an order to the map bounds', () => {
    const hero = makeHero({ x: 0, y: 0, bounds: { x0: 10, y0: 20, x1: 100, y1: 200 } });
    hero.moveTo(-500, 9999);
    expect(hero.destination).toEqual({ x: 10, y: 200 });
  });

  it('takes contact damage from a crowd and goes down at zero', () => {
    const hero = makeHero({ x: 0, y: 0 });
    const crowd = [
      enemy({ x: 10, y: 0 }),
      enemy({ x: 0, y: 10 }),
      enemy({ x: -10, y: 0 }),
    ];
    // 3 creeps x 18 dps x 1 s
    hero.update(1000, crowd);
    expect(Math.round(hero.health)).toBe(500 - 54);
    // Flung far away, no more contact damage.
    const hp = hero.health;
    hero.update(1000, [enemy({ x: 400, y: 400 })]);
    expect(hero.health).toBe(hp);
  });

  it('cannot be moved or made to strike while downed, and revives at full health', () => {
    const hero = makeHero();
    hero.takeDamage(500);
    expect(hero.isDown).toBe(true);
    expect(hero.moveTo(10, 10)).toBe(false);
    expect(hero.strike([enemy({ x: 5, y: 0 })])).toEqual({ hits: 0, ready: false });

    hero.revive();
    expect(hero.health).toBe(500);
    expect(hero.isDown).toBe(false);
    expect(hero.moveTo(10, 10)).toBe(true);
  });

  it('never goes below zero health', () => {
    const hero = makeHero();
    hero.takeDamage(9999);
    expect(hero.health).toBe(0);
    hero.takeDamage(100);
    expect(hero.health).toBe(0);
  });
});

describe('the Vanguard health bar', () => {
  it('stays hidden at full health and appears once hurt', () => {
    const hero = makeHero();
    const calls = { rects: 0, clears: 0 };
    hero.healthBar = {
      clear() {
        calls.clears += 1;
        return this;
      },
      fillStyle() {
        return this;
      },
      fillRect() {
        calls.rects += 1;
        return this;
      },
    };
    hero.drawHealthBar();
    expect(calls.clears).toBe(1);
    // No frame, no fill: a full bar would sit on top of the bastion painting.
    expect(calls.rects).toBe(0);

    hero.takeDamage(120);
    calls.rects = 0;
    hero.drawHealthBar();
    expect(calls.rects).toBe(3); // frame, track, fill

    // A downed Vanguard draws no bar at all: an empty dark rectangle floating
    // over a toppled body reads as a bug, and the HUD panel already says DOWN.
    hero.takeDamage(999);
    expect(hero.isDown).toBe(true);
    calls.rects = 0;
    hero.drawHealthBar();
    expect(calls.rects).toBe(0);
  });
});

describe('scene wiring', () => {
  // jsdom has no file: URL, so the path is read from the repo root instead.
  const source = readFileSync('src/scenes/GameScene.js', 'utf8');

  it('spawns the Vanguard in front of the bastion gate, not under the keep', () => {
    expect(source).toContain('heroGateCell()');
    const start = source.indexOf('heroGateCell() {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, start + 1200);
    // The gate cell is the row below the bastion, on solid ground.
    expect(body).toContain('base.row + 1');
    expect(body).toContain('tile === TILE.GRASS');
    // …with a fallback so a tighter courtyard still spawns somewhere legal.
    expect(body).toContain('mainPath');
  });
});
