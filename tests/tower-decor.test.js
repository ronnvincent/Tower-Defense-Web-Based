// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Tower } from '../src/entities/Tower.js';
import { DECOR_ART } from '../src/data/towerDecor.js';
import {
  LINE_BASE_PROJECTILE,
  TIERED_PROJECTILES,
  projectileArtFor,
} from '../src/data/projectileArt.js';

const ROOT = path.resolve(__dirname, '..');

/** Minimal display object: chainable setters plus the fields we assert on. */
function node(extra = {}) {
  const base = {
    x: 0,
    y: 0,
    alpha: 1,
    scale: 1,
    rotation: 0,
    key: null,
    visible: true,
    setOrigin() {
      return this;
    },
    setScale(value) {
      this.scale = value;
      return this;
    },
    setAlpha(value) {
      this.alpha = value;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setRotation(value) {
      this.rotation = value;
      return this;
    },
    setTexture(key) {
      this.key = key;
      return this;
    },
    setDepth() {
      return this;
    },
    setBlendMode() {
      return this;
    },
    setVisible(value) {
      this.visible = value;
      return this;
    },
    setText() {
      return this;
    },
    setColor() {
      return this;
    },
    clearTint() {
      return this;
    },
    clear() {
      return this;
    },
    lineStyle() {
      return this;
    },
    fillStyle() {
      return this;
    },
    fillCircle() {
      return this;
    },
    strokeCircle() {
      return this;
    },
    remove() {},
    destroy() {
      this.destroyed = true;
    },
  };
  return Object.assign(base, extra);
}

/**
 * Records every sprite the tower creates, and gives containers a real child
 * list so decoration layers can be inspected the way the scene would hold them.
 */
function makeScene(options = {}) {
  const images = [];
  const tweens = [];
  const timers = [];
  const hasTexture = options.hasTexture ?? (() => true);

  const makeContainer = () => {
    const children = [];
    const container = node({
      children,
      add(child) {
        children.push(child);
        return container;
      },
      addAt(child, index) {
        children.splice(index, 0, child);
        return container;
      },
      removeAll() {
        children.length = 0;
        return container;
      },
    });
    return container;
  };

  const makeImage = (x, y, key, frame) => {
    const image = node({ x, y, key, frame });
    images.push(image);
    return image;
  };

  return {
    images,
    tweens,
    timers,
    add: {
      container: makeContainer,
      image: makeImage,
      sprite: makeImage,
      text: () => node({ text: '' }),
      graphics: () => node(),
      rectangle: () => node(),
      circle: () => node(),
      particles: () => node(),
    },
    anims: { exists: () => false, create: () => {}, generateFrameNumbers: () => [] },
    tweens: {
      add: (config) => {
        tweens.push(config);
        return config;
      },
    },
    time: {
      delayedCall: () => ({ remove() {} }),
      addEvent: (config) => {
        timers.push(config);
        return { remove() {} };
      },
    },
    textures: { exists: (key) => hasTexture(key), get: () => null },
    activeEnemies: [],
    activeTowers: [],
  };
}

const CONTEXT = () => ({
  economy: { coins: 9999, score: 0, spend: () => true },
  gameState: { counters: {} },
  activeEnemies: [],
  activeProjectiles: [],
});

function towerAtLevel(level, sceneOptions = {}, typeKey = 'archer') {
  const scene = makeScene(sceneOptions);
  const tower = new Tower(scene, typeKey, 2, 3, CONTEXT());
  tower.level = level;
  tower.refreshDecorations();
  return { tower, scene };
}

/** Texture keys currently attached to the decoration layers. */
function decorKeys(tower) {
  return (tower.decorParts || []).map((part) => part.key);
}

describe('tower decoration art', () => {
  it('ships a pennant, shard and standard for all six defence lines', () => {
    for (const line of ['archer', 'cannon', 'frost', 'forge', 'runes', 'banner']) {
      for (const piece of ['pennant', 'crystal', 'cloth']) {
        const key = `${piece}-${line}`;
        expect(DECOR_ART[key]).toBe(`${key}.png`);
        expect(existsSync(path.join(ROOT, 'public/assets/towers/deco', DECOR_ART[key]))).toBe(true);
      }
    }
  });

  it('ships the shared pieces the tiers are built from', () => {
    for (const key of ['deco-parapet', 'deco-plinth', 'deco-brazier', 'deco-flame-0', 'deco-flame-1', 'deco-flame-2']) {
      expect(DECOR_ART[key], key).toBeTruthy();
      expect(existsSync(path.join(ROOT, 'public/assets/towers/deco', DECOR_ART[key]))).toBe(true);
    }
  });
});

describe('geometry changes per tier', () => {
  it('a level 1 tower carries no decoration at all', () => {
    const { tower } = towerAtLevel(1);
    expect(tower.decorParts).toHaveLength(0);
  });

  it('level 2 adds a merlon crown and a pair of pennants', () => {
    const { tower } = towerAtLevel(2);
    const keys = decorKeys(tower);
    expect(keys).toContain('deco-parapet');
    expect(keys.filter((key) => key === 'pennant-archer')).toHaveLength(2);
    expect(tower.decorParts.length).toBe(3);
  });

  it('level 3 adds a fortified footing and a hung battle standard', () => {
    const { tower } = towerAtLevel(3);
    const keys = decorKeys(tower);
    expect(keys).toContain('deco-plinth');
    expect(keys).toContain('cloth-archer');
    // The crown widens and the pennants ride outwards.
    const crown = tower.decorParts.find((part) => part.key === 'deco-parapet');
    expect(crown.scale).toBeGreaterThan(1);
  });

  it('level 4 lights twin braziers with a looping flame timer', () => {
    const { tower, scene } = towerAtLevel(4);
    const keys = decorKeys(tower);
    expect(keys.filter((key) => key === 'deco-brazier')).toHaveLength(2);
    expect(keys.filter((key) => key.startsWith('deco-flame-'))).toHaveLength(2);
    expect(scene.timers).toHaveLength(1);
    expect(scene.timers[0].loop).toBe(true);
  });

  it('level 5 floats two shards above the keep', () => {
    const { tower } = towerAtLevel(5);
    const crystals = tower.decorParts.filter((part) => part.key === 'crystal-archer');
    expect(crystals).toHaveLength(2);
    // They hover above the crown, not beside the flags.
    const crown = tower.decorParts.find((part) => part.key === 'deco-parapet');
    for (const shard of crystals) {
      expect(shard.y).toBeLessThan(crown.y - 30);
    }
  });

  it('each tier is a strict superset of the previous one', () => {
    const counts = [1, 2, 3, 4, 5].map((level) => towerAtLevel(level).tower.decorParts.length);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `level ${i + 1}`).toBeGreaterThan(counts[i - 1]);
    }
  });

  it('upgrading clears the old parts before building the new tier', () => {
    const { tower } = towerAtLevel(2);
    const firstParts = [...tower.decorParts];
    tower.level = 4;
    tower.refreshDecorations();
    for (const part of firstParts) expect(part.destroyed).toBe(true);
    expect(decorKeys(tower)).not.toContain('deco-flame-0');
  });
});

describe('per-line and per-tier projectiles', () => {
  it('gives every line its own level-4 and level-5 shot', () => {
    for (const line of ['archer', 'cannon', 'frost', 'forge', 'runes', 'banner']) {
      expect(TIERED_PROJECTILES[line][4]).toBe(`proj-line-${line}-4`);
      expect(TIERED_PROJECTILES[line][5]).toBe(`proj-line-${line}-5`);
      for (const level of [4, 5]) {
        const file = path.join(ROOT, 'public/assets/projectiles', `${TIERED_PROJECTILES[line][level]}.png`);
        expect(existsSync(file), file).toBe(true);
      }
    }
  });

  it('gives the banner keep a bolt of its own before level 4', () => {
    expect(LINE_BASE_PROJECTILE.banner).toBe('proj-banner');
    expect(existsSync(path.join(ROOT, 'public/assets/projectiles/proj-banner.png'))).toBe(true);
    expect(projectileArtFor('banner', 1)).toBe('proj-banner');
    expect(projectileArtFor('banner', 3)).toBe('proj-banner');
  });

  it('leaves early tiers on the shared type table', () => {
    expect(projectileArtFor('archer', 1)).toBeNull();
    expect(projectileArtFor('archer', 3)).toBeNull();
    expect(projectileArtFor('archer', 4)).toBe('proj-line-archer-4');
    expect(projectileArtFor('archer', 5)).toBe('proj-line-archer-5');
  });

  it('a tower reports its tiered art once it is textured', () => {
    const { tower } = towerAtLevel(4);
    expect(tower.projectileArt).toBe('proj-line-archer-4');
    tower.level = 5;
    expect(tower.projectileArt).toBe('proj-line-archer-5');
  });

  it('falls back to the branch art when a tiered texture is missing', () => {
    const { tower } = towerAtLevel(
      4,
      { hasTexture: (key) => !key.startsWith('proj-line-') },
      'frost'
    );
    // A real level-4 tower is always specialised, so the branch slot supplies
    // the fallback art ('proj-frost-3' for the blizzard branch).
    tower.specialization = 'blizzard';
    tower.applyVisual();
    expect(tower.visual.slotTexture).toBe('proj-frost-3');
    expect(tower.projectileArt).toBe('proj-frost-3');
  });
});
