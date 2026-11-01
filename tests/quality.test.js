/**
 * The graphics profile.
 *
 * Three profiles, one `auto` setting, and a one-way demotion when a battle
 * cannot hold its frames. These tests pin the *policy*: a 2 GB phone must not
 * be handed the full-atmosphere profile, an explicit choice must win over the
 * detector, and `auto` must never oscillate between levels.
 */

import { describe, expect, it } from 'vitest';
import { readJSON } from '../src/utils/storage.js';
import { createMemoryStorage } from '../src/utils/storage.js';
import { STORAGE_KEYS } from '../src/config/gameConfig.js';
import {
  QUALITY_LEVELS,
  QUALITY_PROFILE,
  QualityManager,
  detectQuality,
} from '../src/systems/QualityManager.js';

const saved = (storage) => readJSON(storage, STORAGE_KEYS.graphics)?.value;

describe('Quality — detection', () => {
  it('gives budget phones the performance profile', () => {
    expect(detectQuality({ memory: 2, width: 844, height: 390 })).toBe('performance');
  });

  it('gives 3-4 GB devices and touch screens the balanced profile', () => {
    expect(detectQuality({ memory: 4, width: 768, height: 1024 })).toBe('balanced');
    expect(detectQuality({ coarse: true, width: 844, height: 390 })).toBe('balanced');
  });

  it('keeps a desktop on high', () => {
    expect(detectQuality({ memory: 8, coarse: false, width: 1920, height: 1080 })).toBe('high');
  });

  it('never returns a level outside the profile table', () => {
    for (const env of [{}, { memory: 1 }, { coarse: true }, { width: 320, height: 480 }]) {
      expect(QUALITY_LEVELS).toContain(detectQuality(env));
    }
  });
});

describe('Quality — the manager', () => {
  it('defaults to auto and keeps the detected level', () => {
    const manager = new QualityManager({ storage: createMemoryStorage(), env: { memory: 3, width: 800, height: 600 } });
    expect(manager.setting).toBe('auto');
    expect(manager.level).toBe('balanced');
    expect(manager.state.auto).toBe(true);
  });

  it('persists an explicit choice and applies it over the detector', () => {
    const storage = createMemoryStorage();
    const manager = new QualityManager({ storage, env: { memory: 2 } });
    expect(manager.level).toBe('performance');
    manager.set('high');
    expect(manager.setting).toBe('high');
    expect(manager.level).toBe('high');
    expect(saved(storage)).toEqual({ quality: 'high' });
    // A fresh boot keeps the player's choice.
    expect(new QualityManager({ storage }).setting).toBe('high');
  });

  it('ignores junk instead of falling into an unknown profile', () => {
    const manager = new QualityManager({ storage: createMemoryStorage(), env: {} });
    const before = manager.setting;
    manager.set('ultra');
    expect(manager.setting).toBe(before);
  });

  it('scales particles and ambience monotonically across profiles', () => {
    const values = QUALITY_LEVELS.map((level) => QUALITY_PROFILE[level]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i].particles).toBeLessThanOrEqual(values[i - 1].particles);
      expect(values[i].ambience).toBeLessThanOrEqual(values[i - 1].ambience);
    }
    expect(QUALITY_PROFILE.performance.particles).toBeGreaterThan(0); // never zero: an impact still reads
    expect(QUALITY_PROFILE.performance.ambience).toBe(0);
  });

  it('demotes once, only in auto, and never comes back', () => {
    const manager = new QualityManager({ storage: createMemoryStorage(), env: { memory: 8, width: 1920, height: 1080 } });
    expect(manager.level).toBe('high');
    expect(manager.degrade()).toBe(true);
    expect(manager.level).toBe('balanced');
    expect(manager.degrade()).toBe(true);
    expect(manager.level).toBe('performance');
    expect(manager.degrade()).toBe(false); // floor
    expect(manager.level).toBe('performance');

    const pinned = new QualityManager({ storage: createMemoryStorage(), env: { memory: 8 } });
    pinned.set('high');
    expect(pinned.degrade()).toBe(false);
    expect(pinned.level).toBe('high');
  });

  it('survives a missing document and storage (node, SSR, private mode)', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => new QualityManager({ storage, env: { memory: 4 } })).not.toThrow();
  });
});
