import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { TOWER_VISUALS, SLOTS, MUZZLE_OFFSET } from '../src/data/towerVisuals.js';
import { ASCENSION, MAX_LEVEL, ascensionTier, nextAscension, dps } from '../src/data/towerAscension.js';

const LINES = Object.keys(TOWER_TYPES);

/** Every branch of every line, flattened: [{ line, specKey, spec }] */
const SPECS = LINES.flatMap((line) =>
  Object.entries(TOWER_TYPES[line].specializations).map(([specKey, spec]) => ({ line, specKey, spec }))
);

describe('Five-tier defences', () => {
  it('defines exactly the five tiers the HUD promises', () => {
    expect(MAX_LEVEL).toBe(5);
    // Six Spire keeps + five engineer lines.
    expect(Object.keys(TOWER_TYPES)).toHaveLength(11);
    for (const { line, specKey } of SPECS) {
      expect(ASCENSION[line], `${line} has no ascension table`).toBeTruthy();
      expect(ASCENSION[line][specKey], `${line}.${specKey} never grows past level 3`).toBeTruthy();
      expect(ascensionTier(line, specKey, 3), 'level 3 is the branch itself').toBeNull();
      expect(ascensionTier(line, specKey, 4)).toBeTruthy();
      expect(ascensionTier(line, specKey, 5)).toBeTruthy();
      // Nothing exists above the cap.
      expect(ascensionTier(line, specKey, 6)).toBe(ascensionTier(line, specKey, 5));
    }
  });

  it('gets strictly stronger with every tier', () => {
    for (const { line, specKey, spec } of SPECS) {
      const tiers = [spec, ascensionTier(line, specKey, 4), ascensionTier(line, specKey, 5)];
      const label = `${line}.${specKey}`;
      // Damage per second, counting multi-shot abilities: a "weaker" number
      // that fires three times a draw is still an upgrade, and the ladder has
      // to reflect what the player actually gets.
      const merged = tiers.map((tier, index) =>
        index === 0 ? spec : { ...tiers[index - 1], ...tier }
      );
      const values = merged.map((tier) => dps(tier));
      expect(values[1], `${label} level 4 is not stronger`).toBeGreaterThan(values[0]);
      expect(values[2], `${label} level 5 is not stronger`).toBeGreaterThan(values[1]);
      // The cap tier must be worth the investment on its own: at least 1.6x the
      // level-3 branch, even after the enemy health curve is taken into account.
      expect(values[2] / values[0], `${label} tops out too flat`).toBeGreaterThan(1.6);
    }
  });

  it('charges more for every tier', () => {
    for (const { line, specKey, spec } of SPECS) {
      const lvl4 = ascensionTier(line, specKey, 4);
      const lvl5 = ascensionTier(line, specKey, 5);
      expect(lvl4.upgradeCost, `${line}.${specKey} level 4 is free`).toBeGreaterThan(spec.upgradeCost);
      expect(lvl5.upgradeCost, `${line}.${specKey} level 5 is cheaper than level 4`).toBeGreaterThan(
        lvl4.upgradeCost
      );
      expect(lvl4.title).toBeTruthy();
      expect(lvl5.title).toBeTruthy();
      expect(lvl5.description.length).toBeGreaterThan(20);
    }
  });

  it('hands out a signature ability at the cap', () => {
    const signatures = SPECS.map(({ line, specKey }) => ascensionTier(line, specKey, 5).ability).filter(Boolean);
    // Every line's cap tier names its trick.
    expect(signatures).toHaveLength(SPECS.length);
    for (const ability of signatures) expect(ability.label).toBeTruthy();
    // …and the two flagship behaviours are actually represented.
    expect(signatures.some((ability) => ability.shots > 1)).toBe(true);
    expect(signatures.some((ability) => (ability.nova || 0) > 0)).toBe(true);
  });

  it('walks 3 → 4 → 5 without ever leaving the branch', () => {
    for (const { line, specKey } of SPECS) {
      const level4 = nextAscension(line, specKey, 3);
      const level5 = nextAscension(line, specKey, 4);
      expect(level4.specKey).toBe(specKey);
      expect(level5.specKey).toBe(specKey);
      expect(nextAscension(line, specKey, 5)).toBeNull();
    }
  });
});

describe('The ascended art is real', () => {
  it('publishes all eight visual slots per line', () => {
    expect(SLOTS).toEqual(['lvl1', 'lvl2', 'spec-a', 'spec-b', 'spec-a2', 'spec-a3', 'spec-b2', 'spec-b3']);
    for (const line of LINES) {
      for (const slot of SLOTS) {
        const visual = TOWER_VISUALS[line][slot];
        expect(visual, `${line}.${slot} is missing`).toBeTruthy();
        expect(visual.baseKey).toBe(`tower-base-${visual.file}`);
        expect(visual.weaponKey).toBe(`tower-top-${visual.file}`);
        // Geometry is inherited from the branch, so pivots and mounts stay
        // calibrated; only the textures change.
        expect(visual.fw).toBeGreaterThan(0);
        expect(visual.frames).toBeGreaterThan(0);
      }
    }
  });

  it('ships the level 4/5 textures on disk', () => {
    const root = join(process.cwd(), 'public', 'assets', 'towers');
    for (const line of LINES) {
      for (const slot of ['spec-a2', 'spec-a3', 'spec-b2', 'spec-b3']) {
        const visual = TOWER_VISUALS[line][slot];
        expect(existsSync(join(root, visual.base)), `${visual.base} missing`).toBe(true);
        expect(existsSync(join(root, visual.weapon)), `${visual.weapon} missing`).toBe(true);
      }
    }
  });

  it('gives the ascended weapons a muzzle to aim from', () => {
    for (const line of LINES) {
      for (const slot of ['spec-a2', 'spec-a3', 'spec-b2', 'spec-b3']) {
        const { file } = TOWER_VISUALS[line][slot];
        const muzzle = MUZZLE_OFFSET[file];
        expect(muzzle, `${file} has no muzzle offset`).toBeTruthy();
        expect(typeof muzzle.x).toBe('number');
        expect(typeof muzzle.y).toBe('number');
      }
    }
  });

  it('keeps the branch art distinct from the ascended art', () => {
    for (const line of LINES) {
      const branch = TOWER_VISUALS[line]['spec-a'];
      const cap = TOWER_VISUALS[line]['spec-a3'];
      expect(cap.baseKey).not.toBe(branch.baseKey);
      expect(cap.weaponKey).not.toBe(branch.weaponKey);
    }
  });
});
