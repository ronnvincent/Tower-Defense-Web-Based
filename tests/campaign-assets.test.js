import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_LEVELS,
  LEVELS,
  THEMES,
  ENDLESS_BOSSES,
  makeEndlessWave,
  countEndlessEnemies,
} from '../src/data/levelData.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { createHash } from 'node:crypto';

/**
 * The campaign promises a distinct battlefield and a unique boss for every
 * level. A missing PNG does not crash the game — Phaser draws a green
 * placeholder box — so the world map would happily advertise a theme whose
 * tiles were never generated. This suite walks the data and checks the real
 * files on disk.
 */

const TILES = 'public/assets/tiles';
const UI = 'public/assets/ui';
const ENEMIES = 'public/assets/enemies';

const file = (...parts) => join(...parts);

/** Width / height straight out of the PNG IHDR chunk (bytes 16..24). */
function pngSize(path) {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('campaign tiles', () => {
  it('ships a full tile set (grass, rock, water, foliage, 16 road masks) per theme', () => {
    const themes = Object.values(THEMES);
    // Six campaign biomes, three duel arenas and three War Room biomes, each
    // with its own palette rather than borrowing a campaign tileset.
    expect(themes).toHaveLength(12);

    for (const theme of themes) {
      const suffix = theme.tileSuffix;
      for (const base of ['grass', 'rock', 'water', 'foliage']) {
        expect(existsSync(file(TILES, `${base}${suffix}.png`)), `${base}${suffix}.png missing`).toBe(true);
      }
      for (let mask = 0; mask < 16; mask += 1) {
        expect(
          existsSync(file(TILES, `road_${mask}${suffix}.png`)),
          `road_${mask}${suffix}.png missing`
        ).toBe(true);
      }
    }
  });

  it('gives every theme its own road art rather than shipping one file four times', () => {
    const hashes = Object.values(THEMES).map((theme) =>
      createHash('sha1').update(readFileSync(file(TILES, `road_3${theme.tileSuffix}.png`))).digest('hex')
    );
    expect(new Set(hashes).size).toBe(Object.values(THEMES).length);
  });
});

describe('campaign enemy art', () => {
  const enemyKeys = new Set();
  for (const level of ALL_LEVELS) {
    for (const id of ENDLESS_BOSSES) enemyKeys.add(id);
    if (level.endless) continue;
    for (const wave of level.waves) {
      for (const group of wave.groups || []) enemyKeys.add(group.type);
      if (wave.bossKey) enemyKeys.add(wave.bossKey);
    }
  }

  it('has a sheet for every creep the waves spawn, bosses included', () => {
    expect(enemyKeys.size).toBeGreaterThan(6);
    for (const key of enemyKeys) {
      // A type may fly on another creature's sheet (`art`), so the manifest
      // lookup goes through the art key exactly like EnemyAssets does.
      const artKey = ENEMY_TYPES[key]?.art || key;
      const sheet = ENEMY_SHEETS[artKey];
      expect(sheet, `no manifest entry for "${key}"`).toBeTruthy();
      expect(existsSync(file(ENEMIES, sheet.file)), `${sheet.file} missing`).toBe(true);
    }
  });

  it('ships a whole-frame boss sheet and a boss-sized body for every boss', () => {
    for (const boss of ['warlord', 'sandwyrm', 'frostwarden', 'magmalord']) {
      const sheet = ENEMY_SHEETS[boss];
      const def = ENEMY_TYPES[boss];
      expect(sheet, `${boss} missing from the manifest`).toBeTruthy();
      expect(def.isBoss, `${boss} is not flagged as a boss`).toBe(true);

      const { width, height } = pngSize(file(ENEMIES, sheet.file));
      expect(width % sheet.frameWidth, `${sheet.file} width is not a whole number of frames`).toBe(0);
      expect(height % sheet.frameHeight, `${sheet.file} height is not a whole number of frames`).toBe(0);
      // Enemy.js scales art by radius, so radius is the real on-screen size.
      expect(def.radius, `${boss} is not drawn bigger than a creep`).toBeGreaterThan(
        ENEMY_TYPES.grunt.radius * 1.5
      );
      // Every animation row must physically fit in the strip.
      const framesPerRow = width / sheet.frameWidth;
      expect(framesPerRow).toBeGreaterThanOrEqual(Math.max(sheet.idle, sheet.move, sheet.death));
      expect(Math.min(sheet.idle, sheet.move, sheet.death)).toBeGreaterThan(0);
    }
  });

  it('generates endless waves whose creeps all have art', () => {
    for (let n = 1; n <= 12; n += 1) {
      const wave = makeEndlessWave(n);
      for (const group of wave.groups) {
        expect(ENEMY_SHEETS[group.type], `endless wave ${n} spawns "${group.type}"`).toBeTruthy();
      }
      if (wave.bossKey) {
        expect(ENEMY_SHEETS[wave.bossKey], `endless wave ${n} boss "${wave.bossKey}"`).toBeTruthy();
      }
      expect(countEndlessEnemies(n)).toBeGreaterThan(0);
    }
  });
});

describe('campaign UI art', () => {
  it('has a battlefield thumbnail and a themed accent for every level', () => {
    for (const level of ALL_LEVELS) {
      const theme = THEMES[level.theme];
      expect(theme, `${level.id} uses unknown theme "${level.theme}"`).toBeTruthy();
      expect(existsSync(file(UI, `map_${level.theme}.png`)), `map_${level.theme}.png missing`).toBe(true);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // One biome per *campaign* stage: the map is a tour, not a repeat. Mode
    // levels deliberately reuse a biome (Time Attack is grassland again).
    const maps = new Set(LEVELS.map((level) => level.theme));
    expect(maps.size).toBe(LEVELS.length);
  });

  it('has every star, lock and wallet icon the overlays reference', () => {
    for (const name of ['star_gold.png', 'star_empty.png', 'lock.png', 'icon_gem.png', 'icon_coin.png']) {
      expect(existsSync(file(UI, name)), `${name} missing`).toBe(true);
    }
  });
});
