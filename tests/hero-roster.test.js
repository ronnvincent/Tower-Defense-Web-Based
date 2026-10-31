// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HERO,
  HERO_CLASSES,
  HERO_CLASS_IDS,
  HERO_RANK_COUNT,
  HERO_SKILLS,
  HERO_SKILL_IDS,
  heroClass,
  heroRank,
  nextHeroRank,
  skillStats,
} from '../src/data/heroData.js';
import { Hero } from '../src/entities/Hero.js';
import { UNIT_SHEETS } from '../src/data/unitArt.js';

/**
 * The five-Vanguard roster (request 32).
 *
 * The point of the roster is that the classes are *data*: the same entity, the
 * same cast dispatcher, five sheets. So these tests pin the invariants a new
 * class must satisfy — a distinct sheet, three ranks that actually scale, three
 * skills that exist in the table, and one cast path that respects the table's
 * numbers — rather than re-testing the Vanguard's original stat line, which
 * `hero.test.js` already owns.
 */

function stubScene() {
  const group = () => ({});
  return {
    add: {
      container: () => ({
        x: 0,
        y: 0,
        setDepth() {
          return this;
        },
        setPosition() {
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
        lineStyle() {
          return this;
        },
        strokeRect() {
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
function enemy({ x = 0, y = 0, flying = false, health = 500, dead = false, escaped = false } = {}) {
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
    slows: [],
    dots: [],
    applyDamage(amount, type) {
      this.hits.push([amount, type]);
      this.health = Math.max(0, this.health - amount);
      if (this.health === 0) this.isDead = true;
      return { isDefeated: this.health === 0, finalDamage: amount };
    },
    applySlow(factor, ms) {
      this.slows.push([factor, ms]);
    },
    applyDot(dot) {
      this.dots.push(dot);
    },
  };
}

function makeHero(options = {}) {
  return new Hero(stubScene(), { x: 0, y: 0, ...options });
}

describe('the five-hero roster', () => {
  it('has exactly five classes with unique ids, names and prices', () => {
    expect(HERO_CLASSES).toHaveLength(5);
    expect(new Set(HERO_CLASS_IDS).size).toBe(5);
    expect(new Set(HERO_CLASSES.map((c) => c.name)).size).toBe(5);
    expect(new Set(HERO_CLASSES.map((c) => c.price)).size).toBe(5);
    expect(HERO_CLASS_IDS).toContain(DEFAULT_HERO);
  });

  it('covers five different archetypes, not five tints of one knight', () => {
    const roles = HERO_CLASSES.map((c) => c.role);
    expect(new Set(roles).size).toBe(5);
    expect(new Set(HERO_CLASSES.map((c) => c.attack))).toEqual(new Set(['melee', 'ranged']));
    // Exactly one archer: the ranged class.
    expect(HERO_CLASSES.filter((c) => c.attack === 'ranged')).toHaveLength(1);
  });

  it('gives every class its own complete three-clip sheet', () => {
    const textures = HERO_CLASSES.map((c) => c.texture);
    expect(new Set(textures).size).toBe(5);
    for (const key of textures) {
      const sheet = UNIT_SHEETS[key];
      expect(sheet, key).toBeTruthy();
      for (const clip of ['idle', 'walk', 'attack']) {
        expect(sheet.clips[clip], `${key}/${clip}`).toBeGreaterThanOrEqual(6);
      }
      expect(sheet.body.w).toBeGreaterThan(40);
      expect(sheet.body.h).toBeGreaterThan(40);
    }
  });

  it('falls back to the Vanguard for an unknown class id', () => {
    expect(heroClass('nobody').id).toBe('vanguard');
    expect(heroRank('nobody', 2).classId).toBe('vanguard');
  });
});

describe('ranks', () => {
  it('gives every class three ranks that get stronger', () => {
    for (const klass of HERO_CLASSES) {
      expect(klass.ranks).toHaveLength(HERO_RANK_COUNT);
      const [one, two, three] = klass.ranks;
      expect(two.maxHealth).toBeGreaterThan(one.maxHealth);
      expect(three.maxHealth).toBeGreaterThan(two.maxHealth);
      expect(two.damage).toBeGreaterThan(one.damage);
      expect(three.damage).toBeGreaterThan(two.damage);
      // Faster swings, same reach ballpark — never a weaker rank.
      expect(two.intervalMs).toBeLessThan(one.intervalMs);
      expect(three.intervalMs).toBeLessThan(two.intervalMs);
      expect(three.range).toBeGreaterThanOrEqual(one.range);
    }
  });

  it('unlocks one more skill per rank and never changes the order', () => {
    for (const klass of HERO_CLASSES) {
      expect(klass.skills).toHaveLength(3);
      for (const id of klass.skills) expect(HERO_SKILL_IDS).toContain(id);
      klass.ranks.forEach((rank, index) => {
        expect(rank.skills).toEqual(klass.skills.slice(0, index + 1));
      });
      expect(nextHeroRank(klass.id, 1).rank).toBe(2);
      expect(nextHeroRank(klass.id, 3)).toBeNull();
    }
  });

  it('clamps a rank outside 1..3 instead of returning undefined', () => {
    expect(heroRank('cinder', 0).rank).toBe(1);
    expect(heroRank('cinder', 99).rank).toBe(3);
  });

  it('prices recruitment and carries the promote cost on the rank', () => {
    expect(heroClass('vanguard').price).toBe(0);
    for (const klass of HERO_CLASSES.slice(1)) expect(klass.price).toBeGreaterThan(0);
    expect(heroRank('warden', 1).promoteCost).toBe(0);
    expect(heroRank('warden', 2).promoteCost).toBeGreaterThan(0);
    expect(heroRank('warden', 3).promoteCost).toBeGreaterThan(heroRank('warden', 2).promoteCost);
  });
});

describe('the skill table', () => {
  it('has every skill the classes reference, each with a glyph that exists', () => {
    for (const klass of HERO_CLASSES) {
      for (const id of klass.skills) {
        const skill = HERO_SKILLS[id];
        expect(skill.id).toBe(id);
        expect(skill.name.length).toBeGreaterThan(2);
        expect(skill.glyph.startsWith('/assets/')).toBe(true);
        expect(['burst', 'volley', 'slow', 'burn', 'self']).toContain(skill.kind);
      }
    }
  });

  it('uses every kind somewhere, so no branch is dead', () => {
    const kinds = new Set(HERO_SKILL_IDS.map((id) => HERO_SKILLS[id].kind));
    expect(kinds).toEqual(new Set(['burst', 'volley', 'slow', 'burn', 'self']));
  });

  it('scales damage up and cooldown down with rank', () => {
    const base = skillStats('volley', 1);
    const top = skillStats('volley', 3);
    expect(base.damage).toBe(52);
    expect(top.damage).toBeGreaterThan(base.damage);
    expect(top.cooldownMs).toBeLessThan(base.cooldownMs);
    expect(top.radius).toBe(base.radius);
    expect(skillStats('nope', 1)).toBeNull();
    // Bulwark heals more at rank 3.
    expect(skillStats('bulwark', 3).healRatio).toBeGreaterThan(skillStats('bulwark', 1).healRatio);
  });
});

describe('Hero picks its class from the data', () => {
  it('spawns the selected class at the selected rank', () => {
    const ranger = makeHero({ classId: 'ranger', tier: 2 });
    expect(ranger.classId).toBe('ranger');
    expect(ranger.textureKey).toBe('hero-ranger');
    expect(ranger.isRanged).toBe(true);
    expect(ranger.maxHealth).toBe(heroRank('ranger', 2).maxHealth);
    expect(ranger.maxHealth).toBeGreaterThan(heroRank('ranger', 1).maxHealth);
    expect(ranger.skills).toEqual(heroClass('ranger').skills.slice(0, 2));
  });

  it('keeps every melee class melee', () => {
    for (const klass of HERO_CLASSES.filter((c) => c.attack === 'melee')) {
      expect(makeHero({ classId: klass.id }).isRanged).toBe(false);
    }
  });
});

describe('casting a skill through the one dispatcher', () => {
  it('volley spends its arrows on the closest few, once each', () => {
    const ranger = makeHero({ classId: 'ranger', tier: 1, x: 0, y: 0 });
    const near = enemy({ x: 20, y: 0 });
    const mid = enemy({ x: 60, y: 0 });
    const far = enemy({ x: 120, y: 0 });
    const outside = enemy({ x: 400, y: 0 });
    const flier = enemy({ x: 10, y: 0, flying: true });
    const result = ranger.castSkill('volley', [near, mid, far, outside, flier, near]);

    const stats = skillStats('volley', 1);
    expect(result.fired).toBe(true);
    expect(result.kind).toBe('volley');
    expect(result.hits).toBe(3); // the three in range, four is the cap
    for (const target of [near, mid, far]) {
      expect(target.hits).toEqual([[stats.damage, 'physical']]);
    }
    expect(outside.hits).toHaveLength(0);
    expect(flier.hits).toHaveLength(0);
    expect(ranger.lastCast.id).toBe('volley');
    expect(ranger.lastCast.at).toEqual({ x: 0, y: 0 });
  });

  it('never fires the same skill twice while it is on cooldown', () => {
    const ranger = makeHero({ classId: 'ranger', tier: 1 });
    const target = enemy({ x: 10, y: 0 });
    expect(ranger.castSkill('volley', [target]).fired).toBe(true);
    expect(ranger.castSkill('volley', [target]).fired).toBe(false);
    expect(target.hits).toHaveLength(1);
    expect(ranger.skillCooldownMax('volley')).toBe(8500);
  });

  it('snare hits and slows everything in its ring', () => {
    const halberd = makeHero({ classId: 'halberdier', tier: 2 });
    const a = enemy({ x: 30, y: 0 });
    const b = enemy({ x: 0, y: 120 });
    const result = halberd.castSkill('snare', [a, b]);
    const stats = skillStats('snare', 2);
    expect(result.hits).toBe(2);
    expect(a.slows).toEqual([[stats.slow, stats.slowMs]]);
    expect(b.slows).toHaveLength(1);
  });

  it('ember brands every creep it hits with the same burn', () => {
    const cinder = makeHero({ classId: 'cinder', tier: 3 });
    const crowd = [enemy({ x: 20, y: 0 }), enemy({ x: 0, y: 60 }), enemy({ x: -40, y: 0 })];
    const result = cinder.castSkill('ember', crowd);
    expect(result.kind).toBe('burn');
    expect(result.hits).toBe(3);
    for (const target of crowd) {
      expect(target.dots).toHaveLength(1);
      expect(target.dots[0]).toMatchObject({ damage: 14, kind: 'fire' });
    }
  });

  it('bulwark heals and opens the guard window instead of hitting', () => {
    const warden = makeHero({ classId: 'warden', tier: 3 });
    warden.health = warden.maxHealth * 0.5;
    const result = warden.castSkill('bulwark', []);
    expect(result.fired).toBe(true);
    expect(result.healed).toBeGreaterThan(0);
    expect(warden.health).toBeGreaterThan(warden.maxHealth * 0.5);
    expect(warden.guardMs).toBe(skillStats('bulwark', 3).durationMs);
    // Nothing to heal and still guarded: the cast is not spent.
    warden.health = warden.maxHealth;
    warden.skillCooldowns.bulwark = 0;
    expect(warden.castSkill('bulwark', []).fired).toBe(false);
  });

  it('refuses to cast while down or with an empty ring', () => {
    const hero = makeHero({ classId: 'cinder', tier: 1 });
    expect(hero.castSkill('ember', [enemy({ x: 999, y: 0 })]).fired).toBe(false);
    hero.health = 0;
    expect(hero.castSkill('ember', [enemy({ x: 10, y: 0 })]).fired).toBe(false);
  });

  it('casts nothing the class does not own', () => {
    // The Vanguard has no cleave: the table knows it, this hero does not.
    const vanguard = makeHero({ classId: 'vanguard', tier: 3 });
    expect(vanguard.skills).not.toContain('cleave');
    expect(vanguard.skillCooldowns.cleave).toBeUndefined();
  });
});

describe('automatic casting', () => {
  it('waits for the trigger, then fires once', () => {
    const ranger = makeHero({ classId: 'ranger', tier: 1, x: 0, y: 0 });
    const solo = [enemy({ x: 40, y: 0 })];
    // Volley wants two targets.
    expect(ranger.autoCast(solo)).toEqual([]);
    const pair = [enemy({ x: 40, y: 0 }), enemy({ x: 60, y: 0 })];
    expect(ranger.autoCast(pair)).toEqual(['volley']);
  });

  it('holds Bulwark until the health trigger is met', () => {
    const warden = makeHero({ classId: 'warden', tier: 3 });
    expect(warden.autoCast([])).toEqual([]);
    warden.health = warden.maxHealth * 0.2;
    expect(warden.autoCast([])).toEqual(['bulwark']);
  });

  it('reports the cast to the scene through update()', () => {
    const cinder = makeHero({ classId: 'cinder', tier: 3, auto: true, autoSkills: true, x: 0, y: 0 });
    const crowd = [enemy({ x: 10, y: 0 }), enemy({ x: 0, y: 20 })];
    const step = cinder.update(16, crowd);
    // Ember first (its ring is the class's opening skill), then anything else
    // that is ready — both are reported, and both left their mark.
    expect(step.casts).toContain('ember');
    expect(crowd[0].dots).toHaveLength(1);
    expect(cinder.lastCast).toBeTruthy();
    expect(cinder.skillCooldown('ember')).toBe(skillStats('ember', 3).cooldownMs);
  });
});
