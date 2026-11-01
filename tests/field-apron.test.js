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
 *   drawFieldApron   the biome's own ground continues past the arena, five
 *                    tiles deep, under the board and out of its cells.
 *   publishFieldScale the page is told which ground to repeat, at what size and
 *                    from which phase, so the strip the camera cannot paint is
 *                    the same grass on the same grid as the field above it.
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
  it('lays one tiled sheet five tiles wider than the board on every side', () => {
    const scene = fakeScene();
    const sheet = GameScene.prototype.drawFieldApron.call(scene, (base, themeId) => themeKey(base, themeId));

    expect(sheet.kind).toBe('tileSprite');
    const [, , width, height] = sheet.args;
    // Request 66: at the campaign's fit zoom a 768 px canvas looks at 1229 world
    // px, so the apron has to reach five tiles past the board to fill it.
    expect(width).toBe((32 + 5 * 2) * TILE_SIZE);
    expect(height).toBe((12 + 5 * 2) * TILE_SIZE);
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
    scale: { height: 768, displaySize: { height: displayHeight }, width: 1280 },
    cameras: { main: { zoom, width: 1280, height: 768, scrollX: 384, scrollY: 96 } },
    cameraRig: { frame: { top: 0 } },
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

  it('publishes where world (0, 0) lands, so the page grid lines up with the board', () => {
    // 1280 wide at 0.625 looks at 2048 world px — wider than the view, so a
    // scroll of 384 centres it and the board's left edge lands on the canvas'
    // left edge. Vertically the same zoom looks at 2048 world px for a 768 px
    // view, so the world's top edge sits (2048 - 768) / 2 - 96 = 544 world px
    // above the view: × 0.625 × a 1.2 canvas scale = 100.8 CSS px.
    GameScene.prototype.publishFieldScale.call(sceneWith());
    expect(document.documentElement.style.getPropertyValue('--field-x')).toBe('0.00px');
    expect(document.documentElement.style.getPropertyValue('--field-y')).toBe('100.80px');

    // A pan moves it: 64 world px further left is 0.625 × 64 × 1.2 = 48 CSS px.
    const panned = sceneWith();
    panned.cameras.main.scrollX = 320;
    GameScene.prototype.publishFieldScale.call(panned);
    expect(document.documentElement.style.getPropertyValue('--field-x')).toBe('48.00px');
  });

  it('follows a pan, and ignores one too small to see', () => {
    const scene = { ...sceneWith(), publishFieldScale: vi.fn() };
    scene.publishFieldScale = GameScene.prototype.publishFieldScale.bind(scene);
    const written = () => document.documentElement.style.getPropertyValue('--field-x');

    GameScene.prototype.syncFieldPhase.call(scene);
    const first = written();
    expect(first).not.toBe('');

    // A tenth of a pixel of camera movement writes nothing new.
    scene.cameras.main.scrollX += 0.05;
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');
    GameScene.prototype.syncFieldPhase.call(scene);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    // A real pan does.
    scene.cameras.main.scrollX += 64;
    GameScene.prototype.syncFieldPhase.call(scene);
    expect(written()).not.toBe(first);
  });

  it('survives a scene without a camera instead of writing NaN into the stylesheet', () => {
    const scene = sceneWith();
    scene.cameras = { main: null };
    GameScene.prototype.publishFieldScale.call(scene);
    expect(document.documentElement.style.getPropertyValue('--field-tile')).toBe('');
  });
});
