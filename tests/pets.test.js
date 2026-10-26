import { describe, it, expect, beforeEach } from 'vitest';
import { PETS, PET_FOLLOW, getPet } from '../src/data/petData.js';
import { UNIT_SHEETS } from '../src/data/unitArt.js';
import { HERO_TIERS, heroTier, nextHeroTier } from '../src/data/heroData.js';
import { Pet } from '../src/entities/Pet.js';
import { ProgressStore } from '../src/systems/Progression.js';

/* ---------------------------------------------------------------------------
   A tiny Phaser stand-in: the Pet only ever asks for a container, a shadow
   ellipse and one sprite, plus setPosition/setDepth/destroy. Anything the
   entity does not need is left off on purpose, so a future call to a real
   Phaser API shows up here as a TypeError instead of silently passing.
   ------------------------------------------------------------------------- */

function makeScene() {
  const container = {
    add() {
      return container;
    },
    setDepth() {
      return container;
    },
    setPosition(x, y) {
      container.x = x;
      container.y = y;
      return container;
    },
    destroy() {
      container.destroyed = true;
    },
  };
  return {
    add: {
      container: () => container,
      ellipse: () => ({}),
      // No `sprite` on purpose: the entity must keep the image fallback that
      // the Hero uses, because the test scene has no animation manager.
      image: () => ({ setOrigin() {}, setScale() {} }),
    },
    anims: { exists: () => false },
  };
}

function makeEnemy(x, y, overrides = {}) {
  return {
    id: overrides.id || `${x}:${y}`,
    x,
    y,
    health: overrides.health ?? 100,
    isDead: false,
    reachedBase: false,
    flying: false,
    damageTaken: [],
    slow: null,
    dot: null,
    applyDamage(amount, type) {
      this.damageTaken.push({ amount, type });
      this.health = Math.max(0, this.health - amount);
    },
    applySlow(fraction, ms) {
      this.slow = { fraction, ms };
    },
    applyDot(dot) {
      this.dot = dot;
    },
    ...overrides,
  };
}

describe('companion catalogue', () => {
  it('offers at least five companions', () => {
    expect(PETS.length).toBeGreaterThanOrEqual(5);
  });

  it('gives every companion a unique id and a real sheet', () => {
    const ids = PETS.map((pet) => pet.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pet of PETS) {
      expect(UNIT_SHEETS[pet.texture], `${pet.id} needs a packed sheet`).toBeTruthy();
      expect(pet.price).toBeGreaterThan(0);
      expect(pet.ability.cooldownMs).toBeGreaterThan(0);
    }
  });

  it('prices the later companions above the earlier ones', () => {
    const prices = PETS.map((pet) => pet.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('looks a pet up by id and returns null for anything else', () => {
    expect(getPet(PETS[0].id)?.name).toBe(PETS[0].name);
    expect(getPet('nope')).toBeNull();
    expect(getPet(undefined)).toBeNull();
  });
});

describe('ProgressStore companions and ranks', () => {
  let storage;
  let store;

  beforeEach(() => {
    const data = new Map();
    storage = {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    };
    store = new ProgressStore({ storage, key: 'test' });
  });

  it('starts with no companions and rank 1', () => {
    expect(store.pets).toEqual([]);
    expect(store.equippedPet).toBeNull();
    expect(store.heroRank).toBe(1);
  });

  it('refuses a purchase the wallet cannot cover', () => {
    const pet = PETS[0];
    const result = store.buyPet(pet.id, pet.price);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('gold');
    expect(store.pets).toEqual([]);
    expect(store.gold).toBe(0);
  });

  it('buys, equips and pays once', () => {
    const pet = PETS[0];
    store.profile.gold = pet.price + 50;
    const result = store.buyPet(pet.id, pet.price);
    expect(result.ok).toBe(true);
    expect(store.gold).toBe(50);
    expect(store.ownsPet(pet.id)).toBe(true);
    // The first purchase equips itself.
    expect(store.equippedPet).toBe(pet.id);
    // Buying it twice is refused and charges nothing.
    const again = store.buyPet(pet.id, pet.price);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('owned');
    expect(store.gold).toBe(50);
  });

  it('survives a reload and drops an equipped pet that is not owned', () => {
    const pet = PETS[1];
    store.profile.gold = 10_000;
    store.buyPet(pet.id, pet.price);
    store.profile.pet = 'ghost-pet';
    store.save();
    const reloaded = new ProgressStore({ storage, key: 'test' });
    expect(reloaded.pets).toContain(pet.id);
    expect(reloaded.equippedPet).toBe(pet.id);
  });

  it('only equips companions the player owns', () => {
    store.profile.gold = 10_000;
    store.buyPet(PETS[0].id, PETS[0].price);
    store.buyPet(PETS[1].id, PETS[1].price);
    expect(store.equipPet(PETS[1].id)).toBe(PETS[1].id);
    expect(store.equipPet('unknown')).toBe(PETS[1].id);
    expect(store.equipPet(null)).toBeNull();
  });

  it('promotes the Vanguard and refuses at the top rank', () => {
    store.profile.gold = 1_000;
    const first = store.promoteHero(heroTier(2).promoteCost, HERO_TIERS.length);
    expect(first).toEqual({ ok: true, rank: 2 });
    expect(store.gold).toBe(1_000 - heroTier(2).promoteCost);
    const second = store.promoteHero(heroTier(3).promoteCost, HERO_TIERS.length);
    expect(second).toEqual({ ok: true, rank: 3 });
    const third = store.promoteHero(0, HERO_TIERS.length);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('maxed');
    expect(store.heroRank).toBe(3);
  });

  it('clamps a hand-edited rank into the ladder', () => {
    store.profile.heroRank = 99;
    store.save();
    expect(new ProgressStore({ storage, key: 'test' }).heroRank).toBe(3);
  });
});

describe('Pet entity', () => {
  it('walks behind the hero and snaps when it is left far behind', () => {
    const scene = makeScene();
    const pet = new Pet(scene, PETS[0], { x: 0, y: 0 });
    const hero = { x: 400, y: 300, facing: 1, isDown: false };
    pet.follow(hero, 16);
    expect(pet.x).toBeGreaterThan(0);
    expect(pet.x).toBeLessThan(400);

    // Beyond the snap distance it is teleported instead of flying across.
    hero.x = 4000;
    pet.follow(hero, 16);
    expect(pet.x).toBeCloseTo(4000 - PET_FOLLOW.offsetX, 5);
  });

  it('taunts the closest creep: damage plus a slow', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'bramble'), { x: 0, y: 0 });
    const near = makeEnemy(40, 0);
    const far = makeEnemy(200, 0);
    const cast = pet.cast([near, far], { x: 0, y: 0, isDown: false });
    expect(cast.id).toBe('taunt');
    expect(near.damageTaken).toEqual([{ amount: pet.ability.damage, type: 'physical' }]);
    expect(near.slow).toEqual({ fraction: pet.ability.slow, ms: pet.ability.slowMs });
    expect(far.damageTaken).toEqual([]);
    // The cooldown is now running, so a second cast does nothing.
    expect(pet.ready).toBe(false);
    expect(pet.cast([near], { x: 0, y: 0 })).toBeNull();
  });

  it('burns a target through the enemy DOT channel', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'ember'), { x: 0, y: 0 });
    const target = makeEnemy(30, 0);
    const cast = pet.cast([target], { x: 0, y: 0 });
    expect(cast.id).toBe('burn');
    expect(target.dot).toMatchObject({
      damage: pet.ability.damage,
      tickMs: pet.ability.tickMs,
      durationMs: pet.ability.durationMs,
      kind: 'fire',
    });
  });

  it('aims the bomb at the densest knot and hits each creep once', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'boomer'), { x: 0, y: 0 });
    const knot = [makeEnemy(100, 0, { id: 'a' }), makeEnemy(110, 0, { id: 'b' }), makeEnemy(105, 10, { id: 'c' })];
    const lone = makeEnemy(240, 0, { id: 'lone' });
    const cast = pet.cast([...knot, lone], { x: 0, y: 0 });
    expect(cast.id).toBe('bomb');
    expect(cast.hits).toBe(3);
    for (const enemy of knot) {
      expect(enemy.damageTaken.length).toBe(1);
      expect(enemy.damageTaken[0].amount).toBe(pet.ability.damage);
    }
    expect(lone.damageTaken.length).toBe(0);
  });

  it('mends the Vanguard only when it is actually hurt', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'wool'), { x: 0, y: 0 });
    let drawn = 0;
    const hero = {
      x: 0,
      y: 0,
      isDown: false,
      health: 500,
      maxHealth: 500,
      drawHealthBar: () => {
        drawn += 1;
      },
    };
    expect(pet.cast([], hero)).toBeNull();
    expect(pet.ready).toBe(true);

    hero.health = 200;
    const cast = pet.cast([], hero);
    expect(cast.id).toBe('mend');
    expect(hero.health).toBe(200 + 500 * pet.ability.healRatio);
    expect(drawn).toBe(1);
  });

  it('does nothing while the hero is down', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'fletch'), { x: 0, y: 0 });
    const target = makeEnemy(20, 0);
    const result = pet.update(16, [target], { x: 0, y: 0, isDown: true });
    expect(result.cast).toBeNull();
    expect(target.damageTaken).toEqual([]);
  });

  it('never targets flying creeps', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'fletch'), { x: 0, y: 0 });
    const flyer = makeEnemy(20, 0, { flying: true });
    expect(pet.cast([flyer], { x: 0, y: 0 })).toBeNull();
  });

  it('ticks its cooldown down in update', () => {
    const pet = new Pet(makeScene(), PETS.find((p) => p.id === 'fletch'), { x: 0, y: 0 });
    const target = makeEnemy(20, 0);
    pet.update(16, [target], { x: 0, y: 0, isDown: false });
    expect(pet.ready).toBe(false);
    pet.update(pet.ability.cooldownMs, [], { x: 0, y: 0, isDown: false });
    expect(pet.ready).toBe(true);
  });
});
