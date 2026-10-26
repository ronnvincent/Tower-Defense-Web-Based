import { describe, it, expect, beforeEach } from 'vitest';
import {
  PETS,
  PET_FOLLOW,
  PET_MAX_LEVEL,
  getPet,
  petAbility,
  petSkill,
  petStatRows,
  petUpgradeCost,
} from '../src/data/petData.js';
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

/* ---------------------------------------------------------------------------
   Companion levels (Request 29)
   ------------------------------------------------------------------------- */

describe('pet levels: the numbers the shop prints are the numbers it fights with', () => {
  const bramble = PETS.find((pet) => pet.id === 'bramble');

  it('scales damage, cooldown, reach and slow one step at a time', () => {
    const lv1 = petAbility(bramble, 1);
    const lv3 = petAbility(bramble, 3);
    const lv5 = petAbility(bramble, 5);
    expect(lv1.damage).toBe(bramble.ability.damage);
    expect(lv3.damage).toBeGreaterThan(lv1.damage);
    expect(lv5.damage).toBeGreaterThan(lv3.damage);
    expect(lv5.cooldownMs).toBeLessThan(lv1.cooldownMs);
    expect(lv5.range).toBeGreaterThan(lv1.range);
    expect(lv5.slow).toBeGreaterThan(lv1.slow);
    // A companion may never out-slow a Frost Spire's 60 % ceiling.
    expect(lv5.slow).toBeLessThanOrEqual(0.6);
  });

  it('clamps a hand-edited level into 1..5', () => {
    expect(petAbility(bramble, 0).level).toBe(1);
    expect(petAbility(bramble, 99).level).toBe(PET_MAX_LEVEL);
    expect(petAbility(bramble, 'nonsense').level).toBe(1);
    expect(petAbility(bramble, 5).damage).toBe(petAbility(bramble, PET_MAX_LEVEL).damage);
  });

  it('prices every level in gold and stops at the top', () => {
    const costs = [1, 2, 3, 4].map((level) => petUpgradeCost(bramble, level));
    for (const cost of costs) expect(cost % 5).toBe(0);
    expect(costs[0]).toBeGreaterThan(0);
    expect(costs[3]).toBeGreaterThan(costs[0]);
    expect(petUpgradeCost(bramble, PET_MAX_LEVEL)).toBeNull();
  });

  it('prints a stat row per number the ability actually uses', () => {
    const rows = petStatRows(bramble, 3);
    expect(rows.map((row) => row.label)).toEqual(['DAMAGE', 'SLOW', 'COOLDOWN', 'REACH']);
    expect(rows[0].value).toBe(String(petAbility(bramble, 3).damage));
    const wool = PETS.find((pet) => pet.id === 'wool');
    expect(petStatRows(wool, 1).map((row) => row.label)).toContain('HEAL');
    const boomer = PETS.find((pet) => pet.id === 'boomer');
    expect(petStatRows(boomer, 1).map((row) => row.label)).toContain('BLAST');
  });

  it('names the signature skill of every companion', () => {
    for (const pet of PETS) {
      const skill = petSkill(pet);
      expect(skill.name.length).toBeGreaterThan(3);
      expect(skill.text.length).toBeGreaterThan(10);
      expect(skill.icon).toMatch(/^\/assets\//);
    }
  });

  it('a bought level is what the entity casts with', () => {
    const lv1 = new Pet(makeScene(), bramble, { x: 0, y: 0, level: 1 });
    const lv4 = new Pet(makeScene(), bramble, { x: 0, y: 0, level: 4 });
    expect(lv1.level).toBe(1);
    expect(lv4.level).toBe(4);
    expect(lv4.ability.damage).toBe(petAbility(bramble, 4).damage);
    expect(lv4.ability.damage).toBeGreaterThan(lv1.ability.damage);

    const hero = { x: 0, y: 0, health: 500, maxHealth: 1000 };
    const enemy = makeEnemy(10, 0, { health: 400 });
    lv4.update(1 / 60, hero);
    const cast = lv4.cast([enemy], hero);
    expect(cast).not.toBeNull();
    expect(enemy.damageTaken[0].amount).toBe(petAbility(bramble, 4).damage);
  });
});

describe('ProgressStore: buying a level', () => {
  let storage;
  let store;
  const bramble = PETS.find((pet) => pet.id === 'bramble');

  beforeEach(() => {
    const data = new Map();
    storage = {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    };
    store = new ProgressStore({ storage, key: 'test' });
    store.profile.gold = 5000;
    store.buyPet(bramble.id, bramble.price);
  });

  it('starts a recruited companion at level 1', () => {
    expect(store.petLevel(bramble.id)).toBe(1);
    expect(store.petLevels[bramble.id]).toBe(1);
    expect(store.petLevel('nobody')).toBe(1);
  });

  it('refuses a level you cannot pay for, and says why', () => {
    store.profile.gold = 0;
    const result = store.upgradePet(bramble.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('gold');
    expect(store.petLevel(bramble.id)).toBe(1);
    expect(result.cost).toBe(petUpgradeCost(bramble, 1));
  });

  it('refuses a companion the player does not own or one that does not exist', () => {
    expect(store.upgradePet('boomer').reason).toBe('not-owned');
    expect(store.upgradePet('dragon').reason).toBe('unknown-pet');
  });

  it('spends the gold, raises the level and survives a reload', () => {
    const before = store.gold;
    const cost = petUpgradeCost(bramble, 1);
    const result = store.upgradePet(bramble.id);
    expect(result.ok).toBe(true);
    expect(result.level).toBe(2);
    expect(store.gold).toBe(before - cost);
    const reloaded = new ProgressStore({ storage, key: 'test' });
    expect(reloaded.petLevel(bramble.id)).toBe(2);
  });

  it('stops at level 5 even with a full purse', () => {
    store.profile.gold = 100_000;
    for (let i = 1; i < PET_MAX_LEVEL; i += 1) expect(store.upgradePet(bramble.id).ok).toBe(true);
    expect(store.petLevel(bramble.id)).toBe(PET_MAX_LEVEL);
    const maxed = store.upgradePet(bramble.id);
    expect(maxed.ok).toBe(false);
    expect(maxed.reason).toBe('maxed');
  });

  it('drops levels for companions that are not owned and clamps a bad save', () => {
    storage.setItem(
      'test',
      JSON.stringify({
        gold: 10,
        pets: ['bramble'],
        pet: 'bramble',
        petLevels: { bramble: 99, boomer: 3, ghost: 2 },
      })
    );
    const reloaded = new ProgressStore({ storage, key: 'test' });
    expect(reloaded.petLevel('bramble')).toBe(PET_MAX_LEVEL);
    expect(reloaded.petLevels.boomer).toBeUndefined();
    expect(reloaded.petLevels.ghost).toBeUndefined();
  });
});
