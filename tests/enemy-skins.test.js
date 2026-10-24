import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ENEMY_SHEETS,
  ENEMY_SKINS,
  ENEMY_TIERS,
  ENEMY_PALETTES,
} from '../src/data/spireManifest.js';
import {
  paletteForWave,
  tierForWave,
  textureFor,
  skinFor,
  waveAccent,
  TIER_ACCENTS,
} from '../src/systems/EnemySkins.js';

/**
 * The horde has to look different from wave to wave and map to map, and it has
 * to do so from real files on disk — a missing sheet does not crash the game, it
 * silently draws Phaser's placeholder box, which is the failure mode this suite
 * exists to catch.
 *
 * Three visual axes are pinned here: battlefield (biome re-grade), escalation
 * tier (base / elite / champion sheets) and the strip's own palette rows.
 */

const ENEMIES = 'public/assets/enemies';

function pngSize(path) {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function digest(path) {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

describe('enemy skins — wave escalation', () => {
  it('starts at the base brood and never goes back down', () => {
    let last = -1;
    for (let wave = 1; wave <= 20; wave += 1) {
      const tier = tierForWave(wave);
      expect(tier).toBeGreaterThanOrEqual(last);
      expect(tier).toBeLessThan(ENEMY_TIERS.length);
      last = tier;
    }
  });

  it('maps waves 1-2 to base, 3-4 to elite, 5+ to champion', () => {
    expect([1, 2].map(tierForWave)).toEqual([0, 0]);
    expect([3, 4].map(tierForWave)).toEqual([1, 1]);
    expect([5, 12, 40].map(tierForWave)).toEqual([2, 2, 2]);
  });

  it('walks the three palette row-blocks across a level, then repeats', () => {
    const palettes = Array.from({ length: ENEMY_PALETTES * 4 }, (_, i) => paletteForWave(i + 1));
    // Two waves per palette block, cycling.
    expect(palettes.slice(0, ENEMY_PALETTES * 2)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(palettes.slice(ENEMY_PALETTES * 2)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('escalates scale and glow with the tier', () => {
    const scales = ENEMY_TIERS.map((tier) => tier.scale);
    const glows = ENEMY_TIERS.map((tier) => tier.glow);
    expect(ENEMY_TIERS).toHaveLength(3);
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBeGreaterThan(scales[0]);
    expect(scales[2]).toBeGreaterThan(scales[1]);
    expect(glows[0]).toBe(0);
    expect(glows[1]).toBeGreaterThan(0);
    expect(glows[2]).toBeGreaterThan(glows[1]);
  });

  it('gives each tier its own brood accent', () => {
    expect(new Set(TIER_ACCENTS).size).toBe(TIER_ACCENTS.length);
    expect(waveAccent(1)).toBe(TIER_ACCENTS[0]);
    expect(waveAccent(4)).toBe(TIER_ACCENTS[1]);
    expect(waveAccent(9)).toBe(TIER_ACCENTS[2]);
  });

  it('resolves a distinct texture for every (creep, map, tier) combination', () => {
    for (const key of Object.keys(ENEMY_SKINS)) {
      const seen = new Set();
      for (const theme of ['grassland', 'desert', 'ice', 'volcanic', 'crystal']) {
        for (let tier = 0; tier < ENEMY_TIERS.length; tier += 1) {
          const texture = textureFor(key, theme, tier);
          expect(texture, `${key}/${theme}/tier ${tier}`).toBeTruthy();
          expect(seen.has(texture), `${texture} reused inside ${key}`).toBe(false);
          seen.add(texture);
        }
      }
    }
  });

  it('falls back to the base sheet for an unknown battlefield', () => {
    expect(textureFor('grunt', 'lava-void', 0)).toBe('enemy-grunt');
    expect(textureFor('grunt', undefined, 2)).toBe('enemy-grunt-e2');
    // Clamps an out-of-range tier instead of producing a key that cannot exist.
    expect(textureFor('grunt', 'ice', 99)).toBe('enemy-grunt-ice-e2');
  });

  it('keeps bosses on their single heroic sheet', () => {
    for (const boss of ['sandwyrm', 'frostwarden', 'magmalord']) {
      expect(ENEMY_SKINS[boss]).toBeUndefined();
      expect(textureFor(boss, 'ice', 2)).toBe(`enemy-${boss}`);
    }
  });

  it('reports the tier, scale and glow the renderer needs', () => {
    const base = skinFor('brute', 1, 'desert');
    const champion = skinFor('brute', 7, 'desert');
    expect(base.tier).toBe(0);
    expect(champion.tier).toBe(2);
    expect(champion.scale).toBeGreaterThan(base.scale);
    expect(champion.glow).toBeGreaterThan(base.glow);
    expect(champion.texture).toBe('enemy-brute-desert-e2');
    expect(base.texture).toBe('enemy-brute-desert');
    expect(champion.animPrefix).toBe(`${champion.texture}-v${champion.palette}`);
  });
});

describe('enemy skins — shipped files', () => {
  it('lists every tier for every battlefield in the manifest', () => {
    expect(Object.keys(ENEMY_SKINS).length).toBeGreaterThanOrEqual(8);
    for (const key of Object.keys(ENEMY_SKINS)) {
      const skins = ENEMY_SKINS[key];
      expect(skins, `${key} missing from ENEMY_SKINS`).toBeTruthy();
      expect(Object.keys(skins).sort()).toEqual([
        'crystal',
        'desert',
        'grassland',
        'ice',
        'volcanic',
      ]);
      for (const [theme, tiers] of Object.entries(skins)) {
        expect(tiers, `${key}/${theme}`).toHaveLength(ENEMY_TIERS.length);
      }
    }
  });

  it('ships a PNG for every skin texture, sized like its base strip', () => {
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      if (!ENEMY_SKINS[key]) continue;
      for (const [theme, tiers] of Object.entries(ENEMY_SKINS[key])) {
        for (const texture of tiers) {
          const path = join(ENEMIES, `${texture}.png`);
          expect(existsSync(path), `${texture}.png missing (${key}/${theme})`).toBe(true);
          const { width, height } = pngSize(path);
          expect(width % sheet.frameWidth, `${texture} width`).toBe(0);
          expect((height / sheet.frameHeight) % 1, `${texture} rows`).toBe(0);
          expect(height / sheet.frameHeight, `${texture} row count`).toBe(9);
        }
      }
    }
  });

  it('bakes an actual re-grade per tier instead of copying the base sheet', () => {
    for (const key of Object.keys(ENEMY_SKINS)) {
      const base = digest(join(ENEMIES, `${ENEMY_SKINS[key].grassland[0]}.png`));
      for (const theme of ['grassland', 'desert', 'ice', 'volcanic', 'crystal']) {
        const signatures = ENEMY_SKINS[key][theme].map((texture) =>
          digest(join(ENEMIES, `${texture}.png`))
        );
        expect(new Set(signatures).size, `${key}/${theme} tiers are identical`).toBe(
          ENEMY_TIERS.length
        );
        // The base tier of a biome must differ from the plain sheet too, except
        // for grassland, whose base sheet is the source art.
        if (theme !== 'grassland') {
          expect(signatures[0], `${key}/${theme} base is the plain sheet`).not.toBe(base);
        }
      }
    }
  });
});
