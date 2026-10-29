/**
 * The bastion's rules (Request 67).
 *
 * These are the numbers and the shape of the ladder, not the Phaser side of it:
 * five levels, a branch at three, a cost per tier, and art that actually exists
 * in the working tree at the size the config claims. The art check matters more
 * than it looks — the scene anchors the keep on `foot / sheet.length` and seats
 * the gun on `socket`, so a sheet re-generated at a new height without the
 * config following it would float the health bar and bury the gun.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASTION_ART,
  BASTION_BRANCHES,
  BASTION_BRANCH_ORDER,
  BASTION_FORM_ART,
  BASTION_LEVELS,
  BASTION_MAX_LEVEL,
  BASTION_SPEC_LEVEL,
  BASTION_WEAPON_ART,
  BASTION_WEAPONS,
  bastionAbility,
  bastionBranch,
  bastionStats,
  bastionTitle,
  bastionUpgrades,
  bastionWeaponKey,
  bastionWeaponScale,
} from '../src/config/baseUpgrades.js';
import { TOWER_TYPES } from '../src/data/towerData.js';

const dps = (stats) => (stats.damage / stats.cooldown) * 1000;

/** Width/height straight out of the PNG's IHDR — no image dependency needed. */
function pngSize(path) {
  const buffer = readFileSync(path);
  expect(buffer.slice(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('the bastion ladder', () => {
  it('has exactly five tiers and branches at three', () => {
    expect(BASTION_MAX_LEVEL).toBe(5);
    expect(BASTION_SPEC_LEVEL).toBe(3);
    expect(Object.keys(BASTION_ART).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(BASTION_BRANCH_ORDER).toEqual(['storm', 'sunforge']);
  });

  it('prices every tier above level one', () => {
    expect(BASTION_LEVELS[1].cost).toBe(0);
    expect(BASTION_LEVELS[2].cost).toBeGreaterThan(0);
    for (const key of BASTION_BRANCH_ORDER) {
      const branch = BASTION_BRANCHES[key];
      for (const level of [3, 4, 5]) {
        expect(branch.levels[level].cost).toBeGreaterThan(0);
      }
    }
    // A maxed bastion is an investment, not a freebie: more than a fully
    // upgraded tower line and less than a lane of them.
    const total = BASTION_LEVELS[2].cost + 260 + 420 + 700;
    expect(total).toBeGreaterThan(1200);
    expect(total).toBeLessThan(2200);
  });

  it('gives every tier a stat block that hits the air and the ground', () => {
    for (const level of [1, 2]) {
      const stats = bastionStats({ level });
      expect(stats.targetsGround).toBe(true);
      expect(stats.targetsAir).toBe(true);
      expect(Number.isFinite(stats.damage)).toBe(true);
      expect(stats.cooldown).toBeGreaterThan(0);
      expect(stats.range).toBeGreaterThan(0);
    }
    for (const key of BASTION_BRANCH_ORDER) {
      for (const level of [3, 4, 5]) {
        const stats = bastionStats({ level, specialization: key });
        expect(stats.targetsGround).toBe(true);
        expect(stats.targetsAir).toBe(true);
        expect(stats.damage).toBeGreaterThan(0);
      }
    }
  });

  it('raises damage, DPS and range on every step of the storm line', () => {
    let previous = bastionStats({ level: 2 });
    for (const [level, key] of [[3, 'storm'], [4, 'storm'], [5, 'storm']]) {
      const stats = bastionStats({ level, specialization: key });
      expect(stats.damage).toBeGreaterThan(previous.damage);
      expect(dps(stats)).toBeGreaterThan(dps(previous));
      expect(stats.range).toBeGreaterThanOrEqual(previous.range);
      previous = stats;
    }
  });

  it('raises damage, DPS and splash on every step of the sunforge line', () => {
    let previous = bastionStats({ level: 2 });
    for (const [level, key] of [[3, 'sunforge'], [4, 'sunforge'], [5, 'sunforge']]) {
      const stats = bastionStats({ level, specialization: key });
      expect(stats.damage).toBeGreaterThan(previous.damage);
      expect(dps(stats)).toBeGreaterThan(dps(previous));
      expect(stats.splash).toBeGreaterThan(previous.splash || 0);
      previous = stats;
    }
  });

  it('makes the keep hit harder than any single defence line', () => {
    // The brief: "mas maganda yung ability nya compare sa mga current defenses".
    const bestTowerDps = Math.max(
      ...Object.values(TOWER_TYPES).map((def) => {
        const top = def.levels?.[def.levels.length - 1];
        if (!top || !top.damage || !top.cooldown) return 0;
        return (top.damage / top.cooldown) * 1000;
      })
    );
    expect(dps(bastionStats({ level: 5, specialization: 'storm' }))).toBeGreaterThan(bestTowerDps);
    expect(dps(bastionStats({ level: 5, specialization: 'sunforge' }))).toBeGreaterThan(bestTowerDps);
  });

  it('gives each branch a timed signature ability no tower has', () => {
    const storm = bastionStats({ level: 5, specialization: 'storm' });
    expect(storm.nova.damage).toBeGreaterThan(0);
    expect(storm.nova.radius).toBeGreaterThan(100);
    expect(storm.nova.slow).toBeGreaterThan(0);
    expect(storm.chainTargets).toBeGreaterThanOrEqual(4);

    const sun = bastionStats({ level: 5, specialization: 'sunforge' });
    expect(sun.flare.damage).toBeGreaterThan(0);
    expect(sun.flare.splash).toBeGreaterThan(90);
    expect(sun.dot.kind).toBe('burn');
    expect(sun.splash).toBeGreaterThan(0);
  });

  it('names the tiers and picks a weapon per branch', () => {
    expect(bastionTitle({ level: 1 })).toBe(BASTION_LEVELS[1].title);
    expect(bastionTitle({ level: 2 })).toBe(BASTION_LEVELS[2].title);
    expect(bastionTitle({ level: 4, specialization: 'storm' })).toBe(
      BASTION_BRANCHES.storm.levels[4].title
    );
    expect(bastionWeaponKey({ level: 2 }).key).toBe(BASTION_WEAPONS.wardCrystal.key);
    expect(bastionWeaponKey({ level: 4, specialization: 'sunforge' }).key).toBe(
      BASTION_WEAPONS.sunCannon.key
    );
    expect(bastionBranch('nope')).toBe(null);
  });

  it('offers one next tier, then a two-way choice, then nothing at the top', () => {
    expect(bastionUpgrades({ level: 1 }).map((o) => o.key)).toEqual(['bastion-2']);
    const choice = bastionUpgrades({ level: 2 });
    expect(choice.map((o) => o.specKey)).toEqual(['storm', 'sunforge']);
    expect(choice[0].branch).toBe('spec-a');
    expect(choice[1].branch).toBe('spec-b');
    expect(new Set(choice.map((o) => o.upgradeCost)).size).toBe(1);
    expect(bastionUpgrades({ level: 3, specialization: 'storm' }).map((o) => o.key)).toEqual([
      'bastion-4',
    ]);
    expect(bastionUpgrades({ level: 5, specialization: 'sunforge' })).toEqual([]);
  });

  it('gives every upgrade option the numbers the inspector prints', () => {
    for (const option of [
      ...bastionUpgrades({ level: 1 }),
      ...bastionUpgrades({ level: 2 }),
      ...bastionUpgrades({ level: 4, specialization: 'storm' }),
    ]) {
      expect(Number.isFinite(option.upgradeCost)).toBe(true);
      expect(Number.isFinite(option.damage)).toBe(true);
      expect(Number.isFinite(option.cooldown)).toBe(true);
      expect(Number.isFinite(option.range)).toBe(true);
      expect(option.title.length).toBeGreaterThan(3);
      expect(option.description.length).toBeGreaterThan(10);
      // Tier cards show the next castle; the two branch cards show the gun the
      // choice changes (a castle cropped into a card's art slot read as a wall).
      expect(option.preview).toMatch(/^assets\/arena\/bastion-(l\d|ward-crystal|sun-cannon)\.png$/);
    }
  });

  it('grows the weapon with the castle without covering it', () => {
    let previous = bastionWeaponScale(1);
    for (const level of [2, 3, 4, 5]) {
      const scale = bastionWeaponScale(level);
      expect(scale).toBeGreaterThan(previous);
      expect(scale).toBeLessThan(1.4);
      previous = scale;
    }
  });
});

describe('the bastion art on disk', () => {
  it('ships five form sheets at the size the config claims', () => {
    expect(BASTION_FORM_ART).toHaveLength(5);
    for (const art of BASTION_FORM_ART) {
      const form = Object.values(BASTION_ART).find((entry) => entry.key === art.key);
      const file = resolve(process.cwd(), 'public', art.path);
      expect(existsSync(file)).toBe(true);
      const size = pngSize(file);
      expect([size.width, size.height]).toEqual(form.sheet);
      // The foot has to sit inside the sheet, with the contact shadow below it.
      expect(form.foot).toBeGreaterThan(0);
      expect(form.foot).toBeLessThan(size.height);
    }
  });

  it('ships both weapon heads and seats them inside their own art', () => {
    for (const weapon of BASTION_WEAPON_ART) {
      const file = resolve(process.cwd(), 'public', weapon.path);
      expect(existsSync(file)).toBe(true);
      const size = pngSize(file);
      const entry = Object.values(BASTION_WEAPONS).find((w) => w.key === weapon.key);
      expect(size.width).toBeGreaterThan(50);
      expect(size.height).toBeGreaterThan(80);
      // The muzzle is measured from the pivot at the bottom centre, pointing up.
      expect(entry.muzzle.y).toBeLessThan(0);
      expect(Math.abs(entry.muzzle.y)).toBeLessThan(size.height);
    }
  });

  it('keeps every form the same width and ground line', () => {
    // One mount constant for five sheets is only true if the sheets agree.
    const widths = new Set(Object.values(BASTION_ART).map((form) => form.sheet[0]));
    const feet = new Set(Object.values(BASTION_ART).map((form) => form.foot));
    expect(widths.size).toBe(1);
    expect(feet.size).toBe(1);
  });
});
