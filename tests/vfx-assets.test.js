import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_SHEETS, FX_PARTICLES } from '../src/data/fxManifest.js';
import { ELEMENT_BY_DAMAGE, impactKey, particleKeys } from '../src/systems/Vfx.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ASCENSION } from '../src/data/towerAscension.js';

const FX = join(process.cwd(), 'public', 'assets', 'fx');

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path) {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('Effect atlas', () => {
  it('ships every strip the manifest promises', () => {
    for (const [key, sheet] of Object.entries(FX_SHEETS)) {
      const path = join(FX, sheet.file);
      expect(existsSync(path), `${key}: ${sheet.file} missing`).toBe(true);
      const { width, height } = pngSize(path);
      if (sheet.frames > 1) {
        expect(width, `${key} width is not whole frames`).toBe(sheet.frameWidth * sheet.frames);
        expect(height, `${key} height is not one frame`).toBe(sheet.frameHeight);
      } else {
        expect(width).toBe(sheet.frameWidth);
        expect(height).toBe(sheet.frameHeight);
      }
      expect(sheet.frameRate).toBeGreaterThan(0);
    }
  });

  it('ships every particle texture', () => {
    for (const [key, file] of Object.entries(FX_PARTICLES)) {
      expect(existsSync(join(FX, file)), `${key} missing`).toBe(true);
    }
    expect(particleKeys()).toEqual(Object.keys(FX_PARTICLES));
  });

  it('has an impact strip for every element a tower can deal', () => {
    const damageTypes = new Set();
    for (const line of Object.values(TOWER_TYPES)) {
      for (const level of line.levels) damageTypes.add(level.damageType);
      for (const spec of Object.values(line.specializations || {})) damageTypes.add(spec.damageType);
    }
    for (const line of Object.values(ASCENSION)) {
      for (const spec of Object.values(line)) {
        for (const tier of [spec.elite, spec.apex]) damageTypes.add(tier.damageType ?? 'inherit');
      }
    }
    for (const damageType of damageTypes) {
      if (damageType === 'inherit') continue;
      const element = ELEMENT_BY_DAMAGE[damageType] || 'physical';
      expect(FX_SHEETS[`fx-impact-${element}`], `${damageType} has no impact art`).toBeTruthy();
      expect(impactKey(element)).toBe(`fx-impact-${element}`);
    }
  });

  it('falls back to a physical hit for an unknown element', () => {
    expect(impactKey('plasma')).toBe('fx-impact-physical');
  });
});
