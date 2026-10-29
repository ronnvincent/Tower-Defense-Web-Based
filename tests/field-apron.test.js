// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { TILE_SIZE } from '../src/config/gameConfig.js';

/**
 * The field beyond the wall.
 *
 * A camera fitted to the HUD's band always leaves a margin on one axis, and a
 * margin that shows the *page* is a frame drawn around the battlefield — which
 * is what request 64 removed. These tests hold the two halves of the fix:
 *
 *   drawFieldApron   the biome's own ground continues past the arena, three
 *                    tiles deep, under the board and out of its cells.
 *   publishFieldScale the page is told which ground to repeat and at what size,
 *                    so the strip the camera cannot paint is the same grass at
 *                    the same scale as the field under it.
 */

let GameScene;

beforeAll(async () => {
  vi.stubGlobal(
    'Phaser',
    new Proxy(
      { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
      {
        get(target, key) {
          if (key in target) return target[key];
          return { Scene: target.Scene }[key];
        },
      }
    )
  );
  ({ GameScene } = await import('../src/scenes/GameScene.js'));
});

/** A sprite stub that records what the scene asked for. */
function fakeSprite(kind, ...args) {
  const sprite = {
    kind,
    args,
    depth: null,
    setDepth(value) {
      sprite.depth = value;
      return sprite;
    },
    setDisplaySize() {
      return sprite;
    },
    setAlpha() {
      return sprite;
    },
    setScale() {
      return sprite;
    },
    setFlipX() {
      return sprite;
    },
  };
  return sprite;
}

function fakeScene({ cols = 32, rows = 12 } = {}) {
  const created = [];
  return {
    created,
    map: { cols, rows },
    add: {
      tileSprite: (...args) => {
        const sprite = fakeSprite('tileSprite', ...args);
        created.push(sprite);
        return sprite;
      },
      image: (...args) => {
        const sprite = fakeSprite('image', ...args);
        created.push(sprite);
        return sprite;
      },
    },
  };
}

const themeKey = (base, themeId = null) => `${base}${themeId ? `-${themeId}` : ''}`;

describe('the apron: the field continues past the arena wall', () => {
  it('lays one tiled sheet three tiles wider than the board on every side', () => {
    const scene = fakeScene();
    const sheet = GameScene.prototype.drawFieldApron.call(scene, (base, themeId) => themeKey(base, themeId));

    expect(sheet.kind).toBe('tileSprite');
    const [, , width, height] = sheet.args;
    expect(width).toBe((32 + 3 * 2) * TILE_SIZE);
    expect(height).toBe((12 + 3 * 2) * TILE_SIZE);
    // The sheet is centred on the board, so the apron is symmetric.
    const [x, y] = sheet.args;
    expect(x).toBe((32 * TILE_SIZE) / 2);
    expect(y).toBe((12 * TILE_SIZE) / 2);
    // Under the ground tiles (depth 1), above nothing else.
    expect(sheet.depth).toBeLessThan(1);
  });

  it('never dresses a cell of the board itself', () => {
    const scene = fakeScene();
    GameScene.prototype.drawFieldApron.call(scene, (base, themeId) => themeKey(base, themeId));

    const props = scene.created.filter((sprite) => sprite.kind === 'image');
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      const [x, y] = prop.args;
      const insideX = x >= 0 && x <= 32 * TILE_SIZE;
      const insideY = y >= 0 && y <= 12 * TILE_SIZE;
      expect(insideX && insideY, `prop at ${x},${y} would sit on the board`).toBe(false);
    }
  });

  it('draws nothing when the biome has no ground art instead of a flat colour', () => {
    const scene = fakeScene();
    const sheet = GameScene.prototype.drawFieldApron.call(scene, () => null);
    expect(sheet).toBeNull();
    expect(scene.created).toHaveLength(0);
  });
});

describe('publishFieldScale: the strip the camera cannot paint', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  const sceneWith = ({ zoom = 0.625, displayHeight = 921.6, suffix = '' } = {}) => ({
    scale: { height: 768, displaySize: { height: displayHeight } },
    cameras: { main: { zoom } },
    theme: { tileSuffix: suffix },
  });

  it('reports the size one tile has on screen: world px × zoom × canvas scale', () => {
    GameScene.prototype.publishFieldScale.call(sceneWith());
    // 64 × 0.625 = 40 game px, × 1.2 canvas scale = 48 CSS px.
    expect(document.documentElement.style.getPropertyValue('--field-tile')).toBe('48.00px');
  });

  it('repeats the biome that is actually being fought on', () => {
    GameScene.prototype.publishFieldScale.call(sceneWith({ suffix: '-desert' }));
    expect(document.documentElement.style.getPropertyValue('--battle-ground')).toBe(
      "url('/assets/tiles/grass-desert.png')"
    );
  });

  it('falls back to the campaign ground set on a map without a suffix', () => {
    GameScene.prototype.publishFieldScale.call(sceneWith({ zoom: 1, displayHeight: 768 }));
    expect(document.documentElement.style.getPropertyValue('--field-tile')).toBe('64.00px');
    expect(document.documentElement.style.getPropertyValue('--battle-ground')).toBe(
      "url('/assets/tiles/grass.png')"
    );
  });

  it('survives a scene without a camera instead of writing NaN into the stylesheet', () => {
    const scene = sceneWith();
    scene.cameras = { main: null };
    GameScene.prototype.publishFieldScale.call(scene);
    expect(document.documentElement.style.getPropertyValue('--field-tile')).toBe('');
  });
});
