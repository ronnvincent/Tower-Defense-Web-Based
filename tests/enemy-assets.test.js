/**
 * Per-battle enemy sheets.
 *
 * Loading all 210 strips at boot was the largest single item in the boot
 * profile (184 MP decoded). These tests pin the selection rules so the saving
 * cannot quietly turn back into "load everything", and so a level can never
 * field a creature whose art was not queued.
 */

import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { LEVELS, ENDLESS_LEVEL } from '../src/data/levelData.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';
import {
  createEnemyAnims,
  enemyOwner,
  enemyTexturesForLevel,
  enemyTypesForLevel,
  enemyTexturesForType,
  queueEnemySheets,
} from '../src/systems/EnemyAssets.js';

const ALL_TEXTURES = Object.entries(ENEMY_SHEETS).length;

describe('EnemyAssets — selection', () => {
  it('knows which creature every texture belongs to', () => {
    expect(enemyOwner('enemy-grunt')).toBe('grunt');
    expect(enemyOwner('enemy-grunt-desert-e2')).toBe('grunt');
    expect(enemyOwner('enemy-voidherald')).toBe('voidherald');
    expect(enemyOwner('tile-grass')).toBeNull();
  });

  it('gives a creature its base art plus the three tiers of one biome', () => {
    const keys = enemyTexturesForType('grunt', 'desert');
    expect(keys.has('enemy-grunt')).toBe(true);
    expect(keys.has('enemy-grunt-desert')).toBe(true);
    expect(keys.has('enemy-grunt-desert-e1')).toBe(true);
    expect(keys.has('enemy-grunt-desert-e2')).toBe(true);
    // The other four biomes are not needed for a desert battle.
    expect(keys.has('enemy-grunt-ice')).toBe(false);
    expect(keys.size).toBe(4);
  });

  it('falls back to grassland for an unknown biome instead of loading nothing', () => {
    const keys = enemyTexturesForType('grunt', 'no-such-biome');
    expect(keys.has('enemy-grunt')).toBe(true);
    // Grassland is the base art, so its tier list already names `enemy-grunt`.
    expect(keys.size).toBe(3);
    expect(keys.has('enemy-grunt-e1')).toBe(true);
  });

  it('loads the creatures a level actually spawns, and its boss', () => {
    const level = LEVELS[0];
    const types = enemyTypesForLevel(level);
    for (const wave of level.waves) {
      for (const group of wave.groups) {
        // The loader keys on the *art* strip: a wraith flies on the wyvern
        // sheet, so its art key is not its rules key.
        const art = ENEMY_TYPES[group.type]?.art || group.type;
        expect(types.has(art), `${group.type} needs ${art}`).toBe(true);
      }
    }
    expect(types.has(ENEMY_TYPES[level.boss]?.art || level.boss)).toBe(true);

    const keys = enemyTexturesForLevel(level);
    expect(keys.length).toBeLessThan(40);
    expect(keys).toContain(`enemy-${level.boss}`);
    for (const key of keys) expect(enemyOwner(key)).toBeTruthy();
  });

  it('loads every creature for an endless run, whose waves are generated', () => {
    const types = enemyTypesForLevel(ENDLESS_LEVEL);
    expect(types.size).toBe(ALL_TEXTURES);
    const keys = enemyTexturesForLevel(ENDLESS_LEVEL);
    expect(keys).toContain('enemy-voidherald');
    expect(keys).toContain('enemy-obsidian');
  });

  it('never returns a key the manifest does not own', () => {
    for (const level of [...LEVELS, ENDLESS_LEVEL]) {
      for (const key of enemyTexturesForLevel(level)) {
        expect(enemyOwner(key), `${level.id} queues ${key}`).toBeTruthy();
      }
    }
  });
});

describe('EnemyAssets — loading', () => {
  const fakeLoader = () => {
    const queued = [];
    return { queued, spritesheet: (key) => queued.push(key) };
  };
  const fakeTextures = (existing, placeholders = []) => ({
    removed: [],
    exists: (key) => existing.includes(key),
    get: (key) => ({ frameTotal: placeholders.includes(key) ? 1 : 30 }),
    remove(key) { this.removed.push(key); existing.splice(existing.indexOf(key), 1); },
  });

  it('queues only what is missing, with the manifest frame size', () => {
    const loader = fakeLoader();
    const level = LEVELS[0];
    const { keys, queued } = queueEnemySheets(loader, fakeTextures([]), level);
    expect(queued).toBe(keys.length);
    expect(loader.queued.sort()).toEqual(keys);
  });

  it('replaces a single-frame placeholder with the real strip', () => {
    const loader = fakeLoader();
    const level = LEVELS[0];
    const keys = enemyTexturesForLevel(level);
    // TextureFactory drew `enemy-grunt` before the battle queued the pack.
    const textures = fakeTextures([...keys], ['enemy-grunt']);
    const { queued } = queueEnemySheets(loader, textures, level);
    expect(queued).toBe(1);
    expect(loader.queued).toEqual(['enemy-grunt']);
    expect(textures.removed).toEqual(['enemy-grunt']);
  });

  it('skips textures that are already on the TextureManager', () => {
    const loader = fakeLoader();
    const level = LEVELS[0];
    const keys = enemyTexturesForLevel(level);
    const { queued } = queueEnemySheets(loader, fakeTextures(keys), level);
    expect(queued).toBe(0);
    expect(loader.queued).toHaveLength(0);
  });
});

describe('EnemyAssets — clips', () => {
  function fakeScene() {
    const created = [];
    const textures = new Map();
    for (const key of enemyTexturesForLevel(LEVELS[0])) {
      const type = enemyOwner(key);
      const sheet = ENEMY_SHEETS[type];
      textures.set(key, { source: [{ width: sheet.frameWidth * 14, height: sheet.frameHeight * 9 }] });
    }
    return {
      created,
      textures: {
        exists: (key) => textures.has(key),
        get: (key) => textures.get(key),
      },
      anims: {
        exists: (key) => created.some((a) => a.key === key),
        create: (anim) => created.push(anim),
        generateFrameNumbers: (key, { start, end }) => ({ key, start, end }),
      },
    };
  }

  it('registers a clip trio per direction, plus the south aliases', () => {
    const scene = fakeScene();
    const keys = ['enemy-grunt'];
    createEnemyAnims(scene, keys);
    const names = scene.created.map((a) => a.key);
    for (const dir of [0, 1, 2]) {
      expect(names).toContain(`enemy-grunt-d${dir}-idle`);
      expect(names).toContain(`enemy-grunt-d${dir}-move`);
      expect(names).toContain(`enemy-grunt-d${dir}-death`);
    }
    expect(names).toContain('enemy-grunt-idle');
    expect(names).toContain('enemy-grunt-move');
  });

  it('is idempotent: a second call adds no duplicate animations', () => {
    const scene = fakeScene();
    createEnemyAnims(scene, ['enemy-grunt']);
    const first = scene.created.length;
    createEnemyAnims(scene, ['enemy-grunt']);
    expect(scene.created.length).toBe(first);
  });
});
