// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';

/**
 * Horde facing.
 *
 * The Spire horde art is drawn facing the camera. The old code rotated the
 * sprite by the travel heading (with a +90° art offset), which laid every creep
 * on its side on a horizontal lane and turned it upside down on the long march
 * south — "walking backwards". These tests pin the rule: the body stays upright
 * and only mirrors left/right.
 *
 * A tiny chainable stub stands in for the Phaser scene; the movement maths runs
 * for real through Enemy.update().
 */

function makeSprite() {
  const sprite = {
    x: 0,
    y: 0,
    rotation: 0,
    flipX: false,
    scaleX: 1,
    scaleY: 1,
    active: true,
    setScale(x, y = x) {
      sprite.scaleX = x;
      sprite.scaleY = y;
      return sprite;
    },
    setDisplaySize: () => sprite,
    setFlipX(value) {
      sprite.flipX = Boolean(value);
      return sprite;
    },
    setTint: () => sprite,
    clearTint: () => sprite,
    setVisible: () => sprite,
    setAlpha: () => sprite,
    setDepth: () => sprite,
    setOrigin: () => sprite,
    setPosition(x, y) {
      sprite.x = x;
      sprite.y = y;
      return sprite;
    },
    play: () => sprite,
    once: () => sprite,
    destroy: () => {},
  };
  return sprite;
}

function makeRect() {
  const rect = {
    x: 0,
    y: 0,
    setOrigin: () => rect,
    setVisible: () => rect,
    setDepth: () => rect,
    setSize: () => rect,
    setPosition: () => rect,
    setAlpha: () => rect,
    destroy: () => {},
  };
  return rect;
}

function makeContainer() {
  const container = {
    x: 0,
    y: 0,
    children: [],
    add: (child) => {
      container.children.push(child);
      return container;
    },
    addAt: (child, index) => {
      container.children.splice(index, 0, child);
      return container;
    },
    setPosition(x, y) {
      container.x = x;
      container.y = y;
      return container;
    },
    setDepth: () => container,
    setAlpha: () => container,
    destroy: () => {},
  };
  return container;
}

function makeScene() {
  const sprites = [];
  const scene = {
    add: {
      container: makeContainer,
      sprite: () => {
        const sprite = makeSprite();
        sprites.push(sprite);
        return sprite;
      },
      image: makeSprite,
      rectangle: makeRect,
      circle: () => makeRect(),
      text: () => makeRect(),
      graphics: () => ({ lineStyle: () => {}, strokeEllipse: () => {}, clear: () => {}, destroy: () => {} }),
    },
    anims: { exists: () => false, create: () => {}, generateFrameNumbers: () => [] },
    tweens: { add: () => {} },
    time: { delayedCall: () => {} },
    textures: { exists: () => false },
  };
  return { scene, sprites };
}

// A route with one leg in each direction: south, east, north, west.
const LAP = ['0,0', '3,0', '3,3', '0,3', '0,0'];

function spawn(typeKey = 'grunt', wave = 1) {
  const { scene, sprites } = makeScene();
  const enemy = new Enemy(scene, typeKey, wave, LAP, { onReachedBase: () => {}, onDefeated: () => {} }, {});
  return { enemy, sprite: sprites[0] };
}

/** Step the simulation for `ms` and collect the rotations the sprite wore. */
function march(enemy, sprite, ms, stepMs = 50) {
  const seen = [];
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    enemy.update(stepMs);
    seen.push(sprite.rotation);
  }
  return seen;
}

describe('Enemy facing: upright on every leg', () => {
  it('ships an upright sprite and never rotates it while marching', () => {
    const { enemy, sprite } = spawn();
    expect(sprite.rotation).toBe(0);

    // Long enough to walk the whole south + east + north + west lap.
    const rotations = march(enemy, sprite, 16_000);
    expect(rotations.length).toBeGreaterThan(100);
    for (const rotation of rotations) expect(rotation).toBe(0);
  });

  it('rotates exactly 0 even on the diagonal-free 90° turns', () => {
    const { enemy, sprite } = spawn('runner');
    // Runners are fast (125 px/s): a 64 px cell takes about 512 ms.
    const rotations = march(enemy, sprite, 3_000, 16);
    expect(Math.max(...rotations.map(Math.abs))).toBe(0);
  });

  it('does not rotate boss sprites either', () => {
    const { enemy, sprite } = spawn('sandwyrm', 6);
    const rotations = march(enemy, sprite, 4_000);
    for (const rotation of rotations) expect(rotation).toBe(0);
  });

  it('mirrors toward a westward lane and back on an eastward one', () => {
    const { enemy, sprite } = spawn();

    // Start at cell (0,0) and head south: no horizontal heading yet.
    march(enemy, sprite, 600);
    const afterSouth = sprite.flipX;

    // Walk far enough to reach the east leg, then the west leg.
    let flippedRight = null;
    let flippedLeft = null;
    for (let i = 0; i < 400; i += 1) {
      enemy.update(50);
      const cell = enemy.getCurrentCellKey();
      if (cell.startsWith('3,') && enemy.pathIndex > 1) {
        if (cell === '3,1' || cell === '3,2') flippedRight = sprite.flipX;
      }
      if (cell.startsWith('0,') && enemy.pathIndex > 3) {
        if (cell === '0,2' || cell === '0,1') flippedLeft = sprite.flipX;
      }
    }

    expect(afterSouth).toBe(false);
    expect(flippedRight).toBe(false);
    expect(flippedLeft).toBe(true);
  });

  it('keeps the body upright when it stops to break a palisade', () => {
    const { scene, sprites } = makeScene();
    // A wall sits on the next waypoint; the creep must stop and swing.
    scene.getBarricadeAt = null;
    const wall = { x: 32, y: 200, isDestroyed: false, health: 420, takeDamage: () => {} };
    const enemy = new Enemy(
      scene,
      'grunt',
      1,
      ['0,0', '3,0'],
      {
        onReachedBase: () => {},
        onDefeated: () => {},
        getBarricadeAt: () => wall,
        onBarricadeHit: () => {},
      },
      {}
    );
    const sprite = sprites[0];

    for (let i = 0; i < 30; i += 1) {
      enemy.update(100);
      expect(enemy.isSieging).toBe(true);
      expect(sprite.rotation).toBe(0);
    }
  });
});
