import { describe, it, expect, vi } from 'vitest';
import { Vfx, ELEMENT_BY_DAMAGE, impactKey } from '../src/systems/Vfx.js';
import { FX_SHEETS, FX_PARTICLES } from '../src/data/fxManifest.js';

/**
 * The Vfx module only ever touches a handful of Phaser APIs. This file stubs
 * exactly those, which is what lets the effect *logic* be tested without a
 * canvas: which strip plays for which element, whether a splash shakes the
 * camera, how many particles a nova throws.
 */
function fakeScene() {
  const created = [];
  const explosions = [];

  const emitter = (texture, config) => ({
    kind: 'emitter',
    texture,
    config,
    setDepth: vi.fn().mockReturnThis(),
    explode: vi.fn((count, x, y) => explosions.push({ texture, count, x, y, config })),
    destroy: vi.fn(),
    scene: {},
  });

  const sprite = (key) => {
    const node = {
      kind: 'sprite',
      key,
      played: null,
      destroyed: false,
      setDepth: vi.fn().mockReturnThis(),
      setScale: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      play: vi.fn(function play(clip) {
        node.played = clip;
        return node;
      }),
      once: vi.fn((event, handler) => {
        node.onComplete = handler;
        return node;
      }),
      destroy: vi.fn(() => {
        node.destroyed = true;
      }),
    };
    created.push(node);
    return node;
  };

  const image = (x, y, key) => {
    const node = {
      kind: 'image',
      key,
      x,
      y,
      destroyed: false,
      setDepth: vi.fn().mockReturnThis(),
      setScale: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
      setAngle: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      setBlendMode: vi.fn().mockReturnThis(),
      destroy: vi.fn(function destroy() {
        node.destroyed = true;
      }),
    };
    created.push(node);
    return node;
  };

  const scene = {
    add: {
      particles: vi.fn((x, y, texture, config) => emitter(texture, config)),
      sprite: vi.fn((x, y, key) => sprite(key)),
      image: vi.fn((x, y, key) => image(x, y, key)),
    },
    textures: { exists: vi.fn(() => true) },
    anims: { exists: vi.fn((key) => key.endsWith('-play')) },
    tweens: { add: vi.fn() },
    cameras: { main: { shake: vi.fn(), flash: vi.fn() } },
  };
  scene.created = created;
  scene.explosions = explosions;
  return scene;
}

describe('Vfx runtime', () => {
  it('plays the impact strip that matches the element', () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.impact(100, 100, 'frost');

    const strip = scene.created.find((node) => node.kind === 'sprite');
    expect(strip.key).toBe('fx-impact-frost');
    expect(strip.played).toBe('fx-impact-frost-play');
    // Debris and smoke both fire.
    expect(scene.explosions.length).toBe(2);
  });

  it('scales a splash and shakes the camera for heavy hits', () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.impact(50, 50, 'explosive', { scale: 1.6, splash: 120 });

    expect(scene.cameras.main.shake).toHaveBeenCalled();
    // A splash also drops a shockwave ring on the ground.
    const rings = scene.created.filter((node) => node.key === 'fx-shockwave');
    expect(rings).toHaveLength(1);
  });

  it('adds impact light only at the top graphics profile', () => {
    // No manager (Node, or a scene booted before the profile exists) keeps the
    // baseline look — no extra sprites, no extra tweens.
    const plain = fakeScene();
    new Vfx(plain).impact(10, 10, 'physical');
    // One flash of light on the hit…
    expect(plain.created.filter((node) => node.key === 'fx-glow')).toHaveLength(1);
    // …but a spark does not scorch stone, so no decal.
    expect(plain.created.filter((node) => node.key === 'fx-scorch')).toHaveLength(0);
    plain.created.length = 0;
    new Vfx(plain).impact(10, 10, 'explosive', { scale: 1.6 });
    expect(plain.created.filter((node) => node.key === 'fx-scorch')).toHaveLength(1);

    // Balanced/performance: the flash and the scorch mark are not drawn at all,
    // and the tier-up spray is scaled by the particle budget.
    const before = globalThis.window;
    globalThis.window = { gameQuality: { particleScale: 0.25, detailLevel: 0, weatherDensity: 0 } };
    try {
      const quiet = fakeScene();
      const vfx = new Vfx(quiet);
      vfx.impact(10, 10, 'explosive', { scale: 1.6 });
      expect(quiet.created.filter((node) => node.key === 'fx-glow')).toHaveLength(0);
      expect(quiet.created.filter((node) => node.key === 'fx-scorch')).toHaveLength(0);

      vfx.tierUp(64, 64, { tier: 5 });
      const spray = quiet.explosions.find((entry) => entry.texture === 'fx-star' && entry.count);
      expect(spray.count).toBe(Math.max(3, Math.round((8 + 5 * 4) * 0.25)));
    } finally {
      if (before === undefined) delete globalThis.window;
      else globalThis.window = before;
    }
  });

  it('leaves the camera alone for a small hit', () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.impact(10, 10, 'physical');
    expect(scene.cameras.main.shake).not.toHaveBeenCalled();
  });

  it("fires the defence's own muzzle flash along the barrel", () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.muzzle(32, 32, Math.PI / 2, 'explosive', 'cannon');
    const flash = scene.created.find((node) => node.kind === 'image' && node.key === 'fx-line-cannon-muzzle');
    expect(flash, 'cannon has no muzzle art').toBeTruthy();
    expect(flash.setRotation).toHaveBeenCalled();
    // The spark cone points where the barrel does (90° = down) and stays tight.
    const sparks = scene.explosions.find((entry) => entry.texture === 'fx-spark');
    expect(sparks.config.angle.min).toBeCloseTo(74, 5);
    expect(sparks.config.angle.max).toBeCloseTo(106, 5);
    expect(sparks.config.alpha.start).toBeLessThan(0.8);
  });

  it('throws shards when a frost nova goes off', () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.nova(64, 64, 1.2);
    expect(scene.created.some((node) => node.key === 'fx-nova')).toBe(true);
    const shards = scene.explosions.find((entry) => entry.texture === 'fx-star');
    expect(shards.count).toBeGreaterThanOrEqual(10);
  });

  it('survives a scene with no particle support', () => {
    const bare = {
      textures: { exists: () => false },
      anims: { exists: () => false },
      add: {},
    };
    const vfx = new Vfx(bare);
    expect(vfx.enabled).toBe(false);
    expect(() => vfx.impact(0, 0, 'fire')).not.toThrow();
    expect(() => vfx.muzzle(0, 0, 0, 'fire')).not.toThrow();
    expect(() => vfx.levelUp(0, 0)).not.toThrow();
    expect(vfx.aura({ x: 0, y: 0 })).toBeNull();
  });

  it('destroys every emitter it built', () => {
    const scene = fakeScene();
    const vfx = new Vfx(scene);
    vfx.impact(0, 0, 'fire');
    const emitters = [...vfx.emitters.values()];
    expect(emitters.length).toBeGreaterThan(0);
    vfx.destroy();
    for (const emitter of emitters) expect(emitter.destroy).toHaveBeenCalled();
    expect(vfx.emitters.size).toBe(0);
  });
});

describe('Element mapping', () => {
  it('routes every damage type the game uses', () => {
    expect(ELEMENT_BY_DAMAGE.physical).toBe('physical');
    expect(ELEMENT_BY_DAMAGE.explosive).toBe('explosive');
    expect(ELEMENT_BY_DAMAGE.magic).toBe('arcane');
    expect(ELEMENT_BY_DAMAGE.lightning).toBe('lightning');
    expect(ELEMENT_BY_DAMAGE.true).toBe('true');
    // Piercing is a physical arrow; it must not fall off the map.
    expect(ELEMENT_BY_DAMAGE.piercing).toBeUndefined();
    expect(impactKey(ELEMENT_BY_DAMAGE.piercing || 'physical')).toBe('fx-impact-physical');
  });

  it('ships an impact strip and particle texture for every element', () => {
    for (const element of new Set(Object.values(ELEMENT_BY_DAMAGE))) {
      expect(FX_SHEETS[`fx-impact-${element}`], `${element} has no impact art`).toBeTruthy();
    }
    // The runtime reads these by name; a rename in the build script must fail
    // here rather than silently dropping the effect in the browser.
    for (const key of ['fx-spark', 'fx-smoke', 'fx-star', 'fx-muzzle', 'fx-muzzle-wide']) {
      expect(FX_PARTICLES[key], `${key} is missing`).toBeTruthy();
    }
    // The aura glow is a single-frame sheet, not a particle texture.
    expect(FX_SHEETS['fx-glow'].frames).toBe(1);
  });

  it('gives every defence line its own impact and muzzle art', () => {
    const lines = ['archer', 'cannon', 'frost', 'forge', 'runes', 'banner'];
    const files = new Set();
    for (const line of lines) {
      const impact = FX_SHEETS[`fx-line-${line}-impact`];
      const muzzle = FX_SHEETS[`fx-line-${line}-muzzle`];
      expect(impact, `${line} has no impact strip`).toBeTruthy();
      expect(muzzle, `${line} has no muzzle art`).toBeTruthy();
      files.add(impact.file);
      files.add(muzzle.file);
    }
    // Twelve distinct files: no line may reuse another line's effect.
    expect(files.size).toBe(lines.length * 2);
  });
});
