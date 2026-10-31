import { describe, expect, it, vi } from 'vitest';
import { createBattleFxAnims, FX_KEY_OVERRIDES, hasBattleFxArt, queueBattleFxArt } from '../src/systems/BattleArt.js';
import { FX_PARTICLES, FX_SHEETS } from '../src/data/fxManifest.js';
import { IMPACT_SHEETS } from '../src/data/spireManifest.js';

function fakeLoader() {
  const calls = [];
  return {
    calls,
    image: (key, path) => calls.push({ kind: 'image', key, path }),
    spritesheet: (key, path, frame) => calls.push({ kind: 'spritesheet', key, path, frame }),
  };
}

function fakeTextures(keys) {
  const set = new Set(keys);
  return { exists: (key) => set.has(key), get: (key) => ({ key }) };
}

function fakeScene(textureKeys, existingAnims = []) {
  const created = [];
  const anims = new Set(existingAnims);
  return {
    created,
    textures: fakeTextures(textureKeys),
    anims: {
      exists: (key) => anims.has(key),
      create: (cfg) => {
        anims.add(cfg.key);
        created.push(cfg);
        return cfg;
      },
      generateFrameNumbers: (key, { start, end }) => ({ key, start, end }),
    },
  };
}

describe('BattleArt — deferred effect art', () => {
  it('queues the impact and fx pack, minus the keys the UI kit owns', () => {
    const load = fakeLoader();
    queueBattleFxArt(load);
    const keys = load.calls.map((c) => c.key);

    expect(keys).toContain('fx-spark');
    expect(keys).toContain('fx-shockwave');
    const shadowed = (manifest) => Object.keys(manifest).filter((k) => FX_KEY_OVERRIDES.has(k)).length;
    expect(keys.length).toBe(
      Object.keys(IMPACT_SHEETS).length +
        Object.keys(FX_SHEETS).length -
        shadowed(FX_SHEETS) +
        Object.keys(FX_PARTICLES).length -
        shadowed(FX_PARTICLES),
    );
    for (const key of FX_KEY_OVERRIDES) expect(keys).not.toContain(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('single-frame sheets load as images, strips as spritesheets', () => {
    const load = fakeLoader();
    queueBattleFxArt(load);
    const glowGold = load.calls.find((c) => c.key === 'fx-glow-gold');
    const shockwave = load.calls.find((c) => c.key === 'fx-shockwave');
    expect(glowGold.kind).toBe('image');
    expect(shockwave.kind).toBe('spritesheet');
    expect(shockwave.frame).toMatchObject({ frameWidth: 192, frameHeight: 192 });
  });

  it('hasBattleFxArt only reports true when the pack sentinels are resident', () => {
    expect(hasBattleFxArt(fakeTextures([]))).toBe(false);
    expect(hasBattleFxArt(fakeTextures(['fx-spark']))).toBe(false);
    expect(hasBattleFxArt(fakeTextures(['fx-spark', 'fx-shockwave']))).toBe(true);
    expect(hasBattleFxArt(undefined)).toBe(false);
  });

  it('creates clips only for textures that arrived, and never twice', () => {
    const scene = fakeScene(['fx-shockwave', 'fx-nova']);
    createBattleFxAnims(scene);
    const keys = scene.created.map((c) => c.key);
    expect(keys).toContain('fx-shockwave-play');
    expect(keys).toContain('fx-nova-play');
    expect(keys.some((k) => k.startsWith('fx-impact-physical'))).toBe(false);

    const before = scene.created.length;
    createBattleFxAnims(scene);
    expect(scene.created.length).toBe(before);
  });

  it('survives a scene without an anims manager', () => {
    expect(() => createBattleFxAnims(undefined)).not.toThrow();
    expect(() => createBattleFxAnims({ textures: fakeTextures([]) })).not.toThrow();
  });
});
