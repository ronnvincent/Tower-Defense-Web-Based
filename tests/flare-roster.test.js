import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { ENEMY_SHEETS, ENEMY_SKINS, ENEMY_PALETTES } from '../src/data/spireManifest.js';
import { ENDLESS_BOSSES, ALL_LEVELS, THEMES, makeEndlessWave } from '../src/data/levelData.js';

/**
 * Flare roster contract.
 *
 * The horde used to be one art pack: every creep and every boss came out of the
 * Spire sheets, so wave 20 looked like wave 1 in a different colour. The six
 * Flare creatures are imported by `scripts/extract_flare_enemies.py`, which
 * rewrites packed atlases into the game's 9-row idle/move/death strip. These
 * tests pin the parts a data edit can silently break:
 *
 *   - the strip still slices into whole frames, and every row has animation,
 *   - the manifest still knows how to face and animate each new body,
 *   - the new bodies are actually reachable in a run (not dead data),
 *   - the three new bosses keep their multi-phase scripts.
 */

const ENEMIES = join('public', 'assets', 'enemies');
const FLARE = ['thrall', 'raider', 'bonearcher', 'ironhorn', 'ashwing', 'gravesworn'];
const FLARE_CREEPS = ['thrall', 'raider', 'bonearcher'];
const FLARE_BOSSES = ['ironhorn', 'ashwing', 'gravesworn'];

function pngSize(path) {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Every type id any campaign or endless wave can spawn. */
function spawnedTypes() {
  const seen = new Set(ENDLESS_BOSSES);
  for (const level of ALL_LEVELS) {
    if (level.endless) continue;
    for (const wave of level.waves) {
      for (const group of wave.groups || []) seen.add(group.type);
      if (wave.bossKey) seen.add(wave.bossKey);
    }
  }
  return seen;
}

describe('Flare creature data', () => {
  it('registers all six creatures with a sheet and a facing contract', () => {
    for (const key of FLARE) {
      expect(ENEMY_TYPES[key], `${key} missing from ENEMY_TYPES`).toBeTruthy();
      const sheet = ENEMY_SHEETS[key];
      expect(sheet, `${key} missing from the manifest`).toBeTruthy();
      expect(['south', 'north', 'camera']).toContain(sheet.facing);
      expect(sheet.frameWidth).toBeGreaterThan(0);
      expect(sheet.frameHeight).toBeGreaterThan(0);
      // Both clips must exist, or the creature never animates.
      expect(sheet.move, `${key} has no walk cycle`).toBeGreaterThan(1);
      expect(sheet.idle, `${key} has no idle`).toBeGreaterThan(0);
      expect(sheet.death, `${key} has no death`).toBeGreaterThan(0);
    }
  });

  it('ships a 9-row strip whose rows all fit inside the frame grid', () => {
    for (const key of FLARE) {
      const sheet = ENEMY_SHEETS[key];
      const path = join(ENEMIES, sheet.file);
      expect(existsSync(path), `${sheet.file} missing`).toBe(true);

      const { width, height } = pngSize(path);
      expect(width % sheet.frameWidth, `${sheet.file}: width is not whole frames`).toBe(0);
      expect(height % sheet.frameHeight, `${sheet.file}: height is not whole frames`).toBe(0);
      // idle / move / death x 3 palette rows.
      expect(height / sheet.frameHeight).toBe(9);

      const cols = width / sheet.frameWidth;
      expect(cols).toBeGreaterThanOrEqual(Math.max(sheet.idle, sheet.move, sheet.death));
      // The measured ink count is what BootScene animates: a frame that never
      // drew anything would silently shorten the clip.
      expect(sheet.idle).toBeLessThanOrEqual(cols);
      expect(sheet.death).toBeLessThanOrEqual(cols);
    }
  });

  it('bakes a biome skin for every creep, in every tier', () => {
    const themes = Object.values(THEMES)
      .map((theme) => theme.id)
      .filter((id) => ENEMY_SKINS.thrall?.[id]);

    for (const key of FLARE_CREEPS) {
      const skins = ENEMY_SKINS[key];
      expect(skins, `${key} has no skins`).toBeTruthy();
      for (const theme of themes) {
        const tiers = skins[theme];
        expect(tiers, `${key} missing ${theme}`).toHaveLength(ENEMY_PALETTES);
        for (const texture of tiers) {
          expect(existsSync(join(ENEMIES, `${texture}.png`)), `${texture}.png missing`).toBe(true);
        }
      }
    }
  });

  it('keeps the three new bosses on multi-phase scripts', () => {
    for (const key of FLARE_BOSSES) {
      const def = ENEMY_TYPES[key];
      expect(def.isBoss, `${key} is not flagged as a boss`).toBe(true);
      expect(def.bossPhases.length).toBeGreaterThanOrEqual(3);

      // Thresholds must descend: enterBossPhase walks them in order.
      const thresholds = def.bossPhases.map((phase) => phase.thresholdPct);
      for (let i = 1; i < thresholds.length; i += 1) {
        expect(thresholds[i]).toBeLessThan(thresholds[i - 1]);
      }

      // Each boss owns a different way to break a defence.
      const kinds = def.bossPhases.map((phase) => phase.ability?.type).filter(Boolean);
      expect(kinds.length, `${key} has no ability phase`).toBeGreaterThan(0);
      for (const kind of kinds) {
        expect(['summon', 'speedAura', 'disableTowers']).toContain(kind);
      }

      // Enemy.js scales art by radius, so the radius is the real boss size.
      expect(def.radius).toBeGreaterThan(ENEMY_TYPES.grunt.radius * 1.5);
      // A boss has to outlast a brute but not outlast the titans.
      expect(def.health).toBeGreaterThan(ENEMY_TYPES.brute.health * 3);
      expect(def.health).toBeLessThan(ENEMY_TYPES.voidherald.health);
    }
  });

  it('gives the three bosses three different signatures', () => {
    const signature = (key) => ENEMY_TYPES[key].bossPhases.map((p) => p.ability?.type || p.name).join('|');
    const sigs = FLARE_BOSSES.map(signature);
    expect(new Set(sigs).size).toBe(FLARE_BOSSES.length);

    // …and the actual mechanic each one is built around.
    expect(ENEMY_TYPES.ironhorn.bossPhases[0].ability.type).toBe('speedAura');
    expect(ENEMY_TYPES.ashwing.bossPhases[1].ability.type).toBe('disableTowers');
    expect(ENEMY_TYPES.gravesworn.bossPhases[0].ability.type).toBe('summon');
  });
});

describe('Flare roster reachability', () => {
  it('fields every new creep somewhere a player can meet it', () => {
    const reachable = spawnedTypes();
    for (const key of FLARE_CREEPS) {
      expect(reachable.has(key), `${key} is never spawned`).toBe(true);
    }
  });

  it('puts every new boss in the endless rotation, and only after wave 25', () => {
    for (const key of FLARE_BOSSES) {
      const index = ENDLESS_BOSSES.indexOf(key);
      expect(index, `${key} is not in ENDLESS_BOSSES`).toBeGreaterThanOrEqual(0);
    }

    // The campaign five stay the first five cycles so early endless is unchanged.
    expect(ENDLESS_BOSSES.slice(0, 5)).toEqual([
      'colossus',
      'sandwyrm',
      'frostwarden',
      'magmalord',
      'prismlord',
    ]);

    const bossAt = (wave) => makeEndlessWave(wave).bossKey;
    for (let wave = 5; wave <= 25; wave += 5) {
      expect(FLARE_BOSSES).not.toContain(bossAt(wave));
    }
    // …and a run that reaches the deep cycles does meet them.
    const deep = [30, 35, 40, 45, 50].map((wave) => bossAt(wave));
    for (const key of FLARE_BOSSES) expect(deep).toContain(key);
  });

  it('keeps the new creeps out of the first endless cycle', () => {
    // Wave 1-5 is the tutorial: campaign bestiary only.
    for (let wave = 1; wave <= 5; wave += 1) {
      const types = makeEndlessWave(wave).groups.map((group) => group.type);
      for (const key of FLARE_CREEPS) {
        expect(types, `wave ${wave} already spawns ${key}`).not.toContain(key);
      }
    }
    // By wave 11 the variety is in.
    const later = new Set();
    for (let wave = 6; wave <= 15; wave += 1) {
      for (const group of makeEndlessWave(wave).groups) later.add(group.type);
    }
    for (const key of FLARE_CREEPS) expect(later.has(key), `${key} never joins endless`).toBe(true);
  });

  it('gives the new bodies distinct roles instead of recolours', () => {
    const { grunt, raider, thrall, bonearcher } = ENEMY_TYPES;
    // Raider: faster than a grunt, frailer.
    expect(raider.speed).toBeGreaterThan(grunt.speed);
    expect(raider.health).toBeLessThan(grunt.health);
    // Thrall: the opposite trade — a wall that walks.
    expect(thrall.speed).toBeLessThan(grunt.speed);
    expect(thrall.health).toBeGreaterThan(grunt.health * 2);
    // Archer: in between, and armoured.
    expect(bonearcher.speed).toBeLessThan(raider.speed);
    expect(bonearcher.speed).toBeGreaterThan(thrall.speed);
    expect(bonearcher.armor).toBeGreaterThan(0);
    // All three pay more than a grunt: late-run fodder has to fund the answer.
    for (const key of FLARE_CREEPS) {
      expect(ENEMY_TYPES[key].reward).toBeGreaterThan(grunt.reward);
    }
  });
});
