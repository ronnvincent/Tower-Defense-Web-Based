import { describe, expect, it } from 'vitest';

import { THEMES } from '../src/data/levelData.js';
import { QUALITY_PROFILE } from '../src/systems/QualityManager.js';
import {
  WEATHER_BY_THEME,
  applyAtmosphereSkin,
  buildAtmosphere,
  clearAtmosphereSkin,
  weatherFor,
} from '../src/systems/Atmosphere.js';

/** A DOM stub with just the surface the skin touches. */
function fakeDoc() {
  const classes = new Set(['hidden']);
  const props = new Map();
  const layer = {
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    style: {
      setProperty: (key, value) => props.set(key, value),
      getPropertyValue: (key) => props.get(key) ?? '',
    },
  };
  return {
    layer,
    classes,
    props,
    getElementById: (id) => (id === 'battle-atmosphere' ? layer : null),
  };
}

/** A Phaser scene stub: one particle manager, one clock, one event bus. */
function fakeScene({ textures = ['fx-glow'] } = {}) {
  const emitters = [];
  const listeners = new Map();
  const scene = {
    textures: { exists: (key) => textures.includes(key) },
    add: {
      particles: (_x, _y, texture, config) => {
        const emitter = {
          texture,
          config,
          depth: 0,
          stopped: false,
          destroyed: false,
          setDepth(value) {
            this.depth = value;
            return this;
          },
          stop() {
            this.stopped = true;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        emitters.push(emitter);
        return emitter;
      },
    },
    events: {
      once: (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
      },
      emit: (name) => {
        for (const fn of listeners.get(name) ?? []) fn();
      },
      count: (name) => (listeners.get(name) ?? []).length,
    },
  };
  return { scene, emitters, listeners };
}

describe('atmosphere: weather belongs to the biome', () => {
  it('has a recipe for every theme, and only for real themes', () => {
    const themeIds = Object.keys(THEMES);
    expect(themeIds.length).toBeGreaterThan(0);
    for (const id of themeIds) {
      expect(WEATHER_BY_THEME[id], `no weather for ${id}`).toBeTruthy();
    }
    expect(Object.keys(WEATHER_BY_THEME).sort()).toEqual([...themeIds].sort());
  });

  it('accepts a theme id or a theme object, and refuses the unknown', () => {
    expect(weatherFor('ice')).toBe(WEATHER_BY_THEME.ice);
    expect(weatherFor(THEMES.desert)).toBe(WEATHER_BY_THEME.desert);
    expect(weatherFor({ id: 'nope' })).toBeNull();
    expect(weatherFor(null)).toBeNull();
    expect(weatherFor(undefined)).toBeNull();
  });

  it('every recipe is tame: sparse, slow, low alpha', () => {
    for (const [id, recipe] of Object.entries(WEATHER_BY_THEME)) {
      expect(recipe.frequency, id).toBeGreaterThanOrEqual(150);
      expect(recipe.lifespan.min, id).toBeGreaterThanOrEqual(2000);
      expect(recipe.lifespan.max, id).toBeGreaterThanOrEqual(recipe.lifespan.min);
      // Nothing here may read as a flash: alpha starts well under half.
      expect(recipe.alpha.start, id).toBeLessThanOrEqual(0.55);
      expect(recipe.alpha.end, id).toBe(0);
      // Motes, not sprites: well under half a tile even at full size.
      expect(recipe.scale.start, id).toBeLessThanOrEqual(0.24);
      expect(recipe.scale.end, id).toBeLessThanOrEqual(0.5);
      // …and visible: a mote nobody can see is not atmosphere either.
      expect(recipe.alpha.start, id).toBeGreaterThanOrEqual(0.25);
      expect(typeof recipe.tint, id).toBe('number');
      expect(recipe.blendMode, id).toMatch(/^(ADD|NORMAL)$/);
      expect(typeof recipe.light, id).toBe('string');
      expect(recipe.light, id).toMatch(/^rgba\(/);
    }
  });

  it('gives the top profile something the others do not have', () => {
    const levels = ['high', 'balanced', 'performance'];
    for (let i = 1; i < levels.length; i += 1) {
      const prev = QUALITY_PROFILE[levels[i - 1]];
      const next = QUALITY_PROFILE[levels[i]];
      expect(next.weather).toBeLessThanOrEqual(prev.weather);
      expect(next.detail).toBeLessThanOrEqual(prev.detail);
    }
    // The whole point of the change: HIGH is not merely "nothing removed".
    expect(QUALITY_PROFILE.high.weather).toBeGreaterThan(QUALITY_PROFILE.balanced.weather);
    expect(QUALITY_PROFILE.high.detail).toBeGreaterThan(QUALITY_PROFILE.balanced.detail);
    expect(QUALITY_PROFILE.high.weather).toBe(1);
    expect(QUALITY_PROFILE.high.detail).toBe(1);
    // …and the profiles below it are exactly the screen they always were.
    expect(QUALITY_PROFILE.balanced.weather).toBe(0);
    expect(QUALITY_PROFILE.balanced.detail).toBe(0);
    expect(QUALITY_PROFILE.performance.weather).toBe(0);
    expect(QUALITY_PROFILE.performance.detail).toBe(0);
  });
});

describe('atmosphere: the emitter', () => {
  it('does nothing without a particle-capable scene', () => {
    expect(buildAtmosphere(null)).toBeNull();
    expect(buildAtmosphere({})).toBeNull();
    const bare = { add: {}, textures: { exists: () => true } };
    expect(buildAtmosphere(bare, { theme: 'grassland' })).toBeNull();
  });

  it('refuses dense=0 and unknown biomes instead of drawing a default', () => {
    const { scene, emitters } = fakeScene();
    expect(buildAtmosphere(scene, { theme: 'grassland', density: 0 })).toBeNull();
    expect(buildAtmosphere(scene, { theme: 'nowhere', density: 1 })).toBeNull();
    expect(emitters).toHaveLength(0);
  });

  it('spawns one slow emitter inside the board, behind the HUD', () => {
    const { scene, emitters } = fakeScene();
    const handle = buildAtmosphere(scene, {
      theme: THEMES.ice,
      map: { cols: 20, rows: 14 },
      density: 1,
      tileSize: 64,
    });
    expect(emitters).toHaveLength(1);
    const [emitter] = emitters;
    expect(emitter.texture).toBe('fx-glow');
    expect(emitter.config.quantity).toBe(1);
    expect(emitter.config.emitting).toBe(true);
    expect(emitter.config.frequency).toBe(WEATHER_BY_THEME.ice.frequency);
    expect(emitter.config.x.max).toBe(20 * 64);
    expect(emitter.depth).toBe(60);
    expect(handle.recipe.kind).toBe('snow');

    handle.destroy();
    expect(emitter.destroyed).toBe(true);
  });

  it('thins the weather on a lower profile instead of shortening it', () => {
    const { scene, emitters } = fakeScene();
    buildAtmosphere(scene, { theme: 'grassland', map: { cols: 10, rows: 10 }, density: 0.4 });
    const [emitter] = emitters;
    expect(emitter.config.frequency).toBe(Math.round(WEATHER_BY_THEME.grassland.frequency / 0.4));
    expect(emitter.config.lifespan).toEqual(WEATHER_BY_THEME.grassland.lifespan);
  });

  it('cleans itself up on shutdown, once', () => {
    const { scene, emitters, listeners } = fakeScene();
    buildAtmosphere(scene, { theme: 'desert', map: { cols: 8, rows: 8 } });
    expect(listeners.get('shutdown')).toHaveLength(1);
    scene.events.emit('shutdown');
    expect(emitters[0].destroyed).toBe(true);
  });
});

describe('atmosphere: the light layer', () => {
  it('paints the biome fog and un-hides the layer', () => {
    const doc = fakeDoc();
    expect(doc.classes.has('hidden')).toBe(true);
    const layer = applyAtmosphereSkin(doc, THEMES.volcanic);
    expect(layer).toBe(doc.layer);
    expect(doc.classes.has('hidden')).toBe(false);
    expect(doc.layer.dataset.weather).toBe('ember');
    expect(doc.props.get('--battle-fog')).toBe(THEMES.volcanic.fog);
    expect(doc.props.get('--battle-light')).toBe(WEATHER_BY_THEME.volcanic.light);
  });

  it('falls back to a neutral wash for a theme it does not know', () => {
    const doc = fakeDoc();
    applyAtmosphereSkin(doc, { fog: 'rgba(1, 2, 3, 0.4)' });
    expect(doc.layer.dataset.weather).toBe('none');
    expect(doc.props.get('--battle-fog')).toBe('rgba(1, 2, 3, 0.4)');
    expect(doc.props.get('--battle-light')).toMatch(/^rgba\(/);
  });

  it('hides the layer again on shutdown, and survives a missing layer', () => {
    const doc = fakeDoc();
    applyAtmosphereSkin(doc, THEMES.grassland);
    clearAtmosphereSkin(doc);
    expect(doc.classes.has('hidden')).toBe(true);
    expect(doc.layer.dataset.weather).toBe('none');
    expect(clearAtmosphereSkin({ getElementById: () => null })).toBeNull();
    expect(applyAtmosphereSkin(null, THEMES.grassland)).toBeNull();
  });
});
