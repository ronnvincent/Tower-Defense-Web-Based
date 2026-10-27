import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TOWER_TYPES,
  BARRICADE,
  BUILD_OPTIONS,
  getBuildDefinition,
} from '../src/data/towerData.js';
import { Tower } from '../src/entities/Tower.js';
import { TOWER_VISUALS, SLOTS, PROJECTILE_TEXTURES, IMPACT_TEXTURES } from '../src/data/towerVisuals.js';
import { ROYAL_PROJECTILES } from '../src/data/royalProjectiles.js';
import { TIERED_PROJECTILES } from '../src/data/projectileArt.js';
import { IMPACT_SHEETS } from '../src/data/spireManifest.js';
import { ENEMY_TYPES, waveHealthMultiplier } from '../src/data/enemyData.js';
import { STARTING_COINS, STARTING_BASE_HEALTH, WAVE_CLEAR_COINS } from '../src/config/gameConfig.js';

const FORGE_LINES = ['forge', 'runes', 'banner'];
const DAMAGE_TYPES = new Set(['physical', 'explosive', 'piercing', 'magic', 'lightning', 'true']);

describe('Forge defences (the three extra lines)', () => {
  it('adds exactly three new tower lines to the build dock', () => {
    expect(Object.keys(TOWER_TYPES).slice(0, 6)).toEqual([
      'archer', 'cannon', 'frost', 'forge', 'runes', 'banner',
    ]);
    expect(BUILD_OPTIONS.slice(0, 7)).toEqual([
      'archer', 'cannon', 'frost', 'barricade', 'forge', 'runes', 'banner',
    ]);
    // …plus the five engineer lines and the ten royal lines, each on their own
    // dock tab. The count is derived so a future line only updates its data.
    expect(BUILD_OPTIONS).toHaveLength(Object.keys(TOWER_TYPES).length + 1);
  });

  it('gives every dock entry a unique hotkey', () => {
    const hotkeys = BUILD_OPTIONS.map((key) => getBuildDefinition(key).hotkey);
    // Keeps keep 1–7 (muscle memory) and the engineer lines keep the keys next
    // to them. The royal lines take letters so they can never collide with a
    // future number-row line.
    expect(hotkeys.slice(0, 12)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
    for (const key of hotkeys) expect(key, 'every card needs a hotkey').toBeTruthy();
  });

  it.each(FORGE_LINES)('%s is a complete line: 2 levels + 2 specialisations', (key) => {
    const def = TOWER_TYPES[key];
    expect(def).toBeDefined();
    expect(def.name.length).toBeGreaterThan(3);
    expect(def.cost).toBeGreaterThan(0);
    expect(def.levels).toHaveLength(2);
    expect(Object.keys(def.specializations)).toHaveLength(2);

    for (const level of def.levels) {
      expect(DAMAGE_TYPES.has(level.damageType)).toBe(true);
      expect(level.damage).toBeGreaterThan(0);
      expect(level.range).toBeGreaterThan(0);
      expect(level.cooldown).toBeGreaterThanOrEqual(200);
      expect(PROJECTILE_TEXTURES[level.projectile || def.projectile]).toBeTruthy();
    }

    const specs = Object.values(def.specializations);
    for (const spec of specs) {
      expect(spec.branch).toBe(spec.branch === 'spec-a' ? 'spec-a' : 'spec-b');
      expect(spec.upgradeCost).toBeGreaterThan(0);
      expect(spec.range).toBeGreaterThanOrEqual(def.levels[1].range);
      expect(DAMAGE_TYPES.has(spec.damageType)).toBe(true);
      // A specialisation must actually be an upgrade over level 2.
      expect(spec.damage).toBeGreaterThan(def.levels[1].damage);
    }

    // Level 2 has to beat level 1, otherwise the upgrade is a trap.
    expect(def.levels[1].damage).toBeGreaterThan(def.levels[0].damage);
    expect(def.levels[1].upgradeCost).toBeGreaterThan(0);
  });

  it('gives the Hammerforge an explosive identity and the Runestone an armour-breaking one', () => {
    const forge = TOWER_TYPES.forge;
    expect(forge.levels.every((l) => l.splash > 0 && l.damageType === 'explosive')).toBe(true);
    // The two branches split the physical answer in half: the Emberforge carries
    // the blast (crowds), the Thunderforge carries the armour penetration
    // (plate). Giving the Emberforge armour break as well made it strictly
    // better than its sibling at every tier, which is why the break moved.
    expect(forge.specializations.ember.splash).toBeGreaterThan(forge.specializations.thunder.splash);
    expect(forge.specializations.ember.armorBreak).toBeUndefined();
    expect(forge.specializations.thunder.armorPenetration).toBeGreaterThan(0);

    const runes = TOWER_TYPES.runes;
    expect(runes.levels.every((l) => l.damageType === 'magic')).toBe(true);
    // Void Lance is the anti-armour answer: true damage ignores armour entirely.
    expect(runes.specializations.void.damageType).toBe('true');
    expect(runes.specializations.nova.splash).toBeGreaterThan(0);
  });

  it('makes the Banner Keep a force multiplier with a growing aura', () => {
    const banner = TOWER_TYPES.banner;
    const [lvl1, lvl2] = banner.levels;
    expect(lvl1.aura.damageBonus).toBeGreaterThan(0);
    expect(lvl2.aura.damageBonus).toBeGreaterThan(lvl1.aura.damageBonus);
    expect(lvl2.aura.radius).toBeGreaterThan(lvl1.aura.radius);

    const { warbanner, muster } = banner.specializations;
    expect(warbanner.aura.damageBonus).toBeGreaterThan(lvl2.aura.damageBonus);
    expect(muster.aura.fireRateBonus).toBeGreaterThan(0);
    expect(muster.aura.coinPerKill).toBe(1);
  });

  it('maps every specialisation to the right art slot through its branch field', () => {
    const slotOf = Object.getOwnPropertyDescriptor(Tower.prototype, 'visualSlot').get;
    for (const key of Object.keys(TOWER_TYPES)) {
      const def = TOWER_TYPES[key];
      // Level 1 / level 2 slots
      expect(slotOf.call({ specialization: null, level: 1, def })).toBe('lvl1');
      expect(slotOf.call({ specialization: null, level: 2, def })).toBe('lvl2');

      // Every line branches at level 3 now, royal lines included: there is no
      // linear five-step track left to special-case.
      expect(def.linear, `${key} still claims a linear track`).toBeUndefined();
      for (const [specKey, spec] of Object.entries(def.specializations || {})) {
        const slot = slotOf.call({ specialization: specKey, level: 3, def });
        expect(slot, `${key}.${specKey}`).toBe(spec.branch);
      }

      // The two branches must not share art, otherwise the upgrade is invisible.
      expect(TOWER_VISUALS[key]['spec-a'].base).not.toBe(TOWER_VISUALS[key]['spec-b'].base);
    }
  });

  it('ships an icon, base and weapon sheet for every slot of every tower', () => {
    for (const key of Object.keys(TOWER_TYPES)) {
      const slots = TOWER_VISUALS[key];
      expect(slots, `${key} has no visual line`).toBeTruthy();
      for (const slot of Object.keys(slots)) {
        const v = slots[slot];
        expect(v, `${key}.${slot} missing`).toBeTruthy();
        expect(existsSync(join('public/assets/towers', v.base)), `${v.base} missing`).toBe(true);
        expect(existsSync(join('public/assets/towers', v.weapon)), `${v.weapon} missing`).toBe(true);
        expect(v.fw).toBeGreaterThan(0);
        expect(v.fh).toBeGreaterThan(0);
        expect(v.px).toBeGreaterThan(0);
        expect(v.py).toBeGreaterThan(0);
        expect(v.mount).toBeGreaterThan(0);
      }
      expect(existsSync(join('public/assets/ui', `card_${key}.png`)), `card_${key}.png missing`).toBe(true);
    }
    // Every projectile texture is loaded by BootScene. Most are named in the
    // literal list; the tiered and royal shots are queued from their generated
    // tables, so a key listed there is loaded just as surely.
    const boot = readFileSync('src/scenes/BootScene.js', 'utf8');
    const tableLoaded = new Set([
      ...Object.values(ROYAL_PROJECTILES).flatMap((tiers) => Object.values(tiers)),
      ...Object.values(TIERED_PROJECTILES).flatMap((tiers) => Object.values(tiers)),
    ]);
    for (const texture of new Set(Object.values(PROJECTILE_TEXTURES))) {
      const named = boot.includes(`'${texture}'`);
      const tabled = tableLoaded.has(texture) && boot.includes('ROYAL_PROJECTILES') && boot.includes('TIERED_PROJECTILES');
      expect(named || tabled, `${texture} not loaded by BootScene`).toBe(true);
      expect(existsSync(join('public/assets/projectiles', `${texture}.png`)), `${texture}.png missing`).toBe(true);
    }
    for (const texture of new Set(Object.values(IMPACT_TEXTURES))) {
      expect(IMPACT_SHEETS[texture], `${texture} missing from the impact manifest`).toBeTruthy();
      expect(existsSync(join('public/assets/effects', IMPACT_SHEETS[texture].file))).toBe(true);
    }
  });

  it('declares frame geometry that matches the shipped weapon sheets', () => {
    // A stale fw/fh/frames triple does not crash Phaser: it silently slices the
    // strip at the wrong pitch and the tower animates with torn frames.
    const pngSize = (file) => {
      const buf = readFileSync(file);
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    };
    for (const key of Object.keys(TOWER_TYPES)) {
      for (const slot of Object.keys(TOWER_VISUALS[key])) {
        const v = TOWER_VISUALS[key][slot];
        const { width, height } = pngSize(join('public/assets/towers', v.weapon));
        expect(width, `${key}.${slot} strip width`).toBe(v.fw * v.frames);
        expect(height, `${key}.${slot} strip height`).toBe(v.fh);
      }
    }
  });

  it('has a dock sprite rule for every build card', () => {
    const css = readFileSync('src/style.css', 'utf8');
    for (const key of BUILD_OPTIONS) {
      expect(css.includes(`.sprite-${key} {`), `missing .sprite-${key}`).toBe(true);
    }
  });
});

describe('Difficulty rebalance (the campaign is meant to be gentler)', () => {
  it('starts the player with enough gold for two defences and 25 base HP', () => {
    expect(STARTING_COINS).toBe(220);
    expect(STARTING_BASE_HEALTH).toBe(25);
    expect(STARTING_COINS).toBeGreaterThanOrEqual(TOWER_TYPES.archer.cost * 2);
    expect(STARTING_COINS).toBeGreaterThanOrEqual(TOWER_TYPES.forge.cost);
  });

  it('pays a meaningful wave-clear bonus', () => {
    expect(WAVE_CLEAR_COINS.base).toBe(30);
    expect(WAVE_CLEAR_COINS.perWave).toBe(8);
    // Wave 3 clear = 30 + 24 = 54 gold, enough to buy a Runestone upgrade path.
    expect(WAVE_CLEAR_COINS.base + WAVE_CLEAR_COINS.perWave * 3).toBe(54);
  });

  it('scales enemy health gently and caps the ramp', () => {
    expect(waveHealthMultiplier(1)).toBe(1);
    expect(waveHealthMultiplier(2)).toBeCloseTo(1.09, 5);
    expect(waveHealthMultiplier(6)).toBeCloseTo(1.45, 5);
    expect(waveHealthMultiplier(50)).toBe(2); // hard cap keeps late waves sane
  });

  it('softens the two boss health pools', () => {
    expect(ENEMY_TYPES.colossus.health).toBeLessThanOrEqual(1300);
    expect(ENEMY_TYPES.warlord.health).toBeLessThanOrEqual(3400);
    expect(ENEMY_TYPES.warlord.health).toBeGreaterThan(ENEMY_TYPES.colossus.health);
  });
});

describe('Palisade: a wall the horde has to break', () => {
  it('is a five-tier wall that gets tankier and spikier', () => {
    expect(BARRICADE.cost).toBeGreaterThan(0);
    expect(BARRICADE.placement).toBe('wall');
    const tiers = BARRICADE.levels;
    expect(tiers).toHaveLength(5);
    expect(tiers[0].thornsDamage).toBe(0);
    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i].health, `tier ${i + 1} hp`).toBeGreaterThan(tiers[i - 1].health);
      expect(tiers[i].thornsDamage, `tier ${i + 1} thorns`).toBeGreaterThan(tiers[i - 1].thornsDamage);
      expect(tiers[i].upgradeCost, `tier ${i + 1} cost`).toBeGreaterThan(0);
      expect(tiers[i].title).toBeTruthy();
    }
  });

  it('gives every ground enemy a siege attack so no archetype can be walled off forever', () => {
    for (const [key, def] of Object.entries(ENEMY_TYPES)) {
      if (def.flying) {
        // Airborne units do not need to break a wall — they never meet one.
        expect(def.siege, `${key} is airborne and must not siege`).toBe(0);
        continue;
      }
      expect(def.siege, `${key} cannot damage a palisade`).toBeGreaterThan(0);
    }
    // Bigger units break walls faster than chaff.
    expect(ENEMY_TYPES.brute.siege).toBeGreaterThan(ENEMY_TYPES.grunt.siege);
    expect(ENEMY_TYPES.colossus.siege).toBeGreaterThan(ENEMY_TYPES.brute.siege);
    expect(ENEMY_TYPES.warlord.siege).toBeGreaterThan(ENEMY_TYPES.colossus.siege);
  });
});
