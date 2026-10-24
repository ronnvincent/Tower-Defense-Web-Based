// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';

/**
 * Horde facing.
 *
 * The Spire strips are top-down art, so the body *can* be turned into its
 * heading — what broke twice was the offset. Every creep is drawn with its head
 * on the bottom edge of the frame ("faces south"), which means the turn angle is
 * `heading − 90°`. The old code applied `heading + 90°` and therefore pointed
 * every monster exactly backwards; the follow-up "fix" froze the rotation at 0,
 * which only made the error consistent: a northbound creep still walked away
 * from the camera.
 *
 * These tests pin the contract that replaces both attempts:
 *   • each sheet declares which way its art points (`spriteManifest.facing`);
 *   • `faceTravel()` wears that offset, snapped to eight 45° poses;
 *   • a corner turns the body in the same frame the lane changes;
 *   • front-on art ('camera') is the one class that may never rotate.
 *
 * A tiny chainable stub stands in for the Phaser scene; the movement maths runs
 * for real through `Enemy.update()`.
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

function spawn(typeKey = 'grunt', wave = 1, path = LAP) {
  const { scene, sprites } = makeScene();
  const enemy = new Enemy(scene, typeKey, wave, path, { onReachedBase: () => {}, onDefeated: () => {} }, {});
  return { enemy, sprite: sprites[0], scene };
}

/** Normalised angle in degrees, 0 = facing east on screen. */
const deg = (radians) => ((Math.round((radians * 180) / Math.PI) % 360) + 360) % 360;

describe('sprite orientation contract', () => {
  it('declares a facing for every sheet the game can spawn', () => {
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      expect(['south', 'north', 'camera'], `${key} has no usable facing`).toContain(sheet.facing);
    }
    const declared = new Set(Object.values(ENEMY_SHEETS).map((sheet) => sheet.facing));
    // The horde art is top-down: south for everything but the void butterfly.
    expect(declared.has('south')).toBe(true);
    expect(declared.has('north')).toBe(true);
  });

  it('reads the sheet metadata onto the instance', () => {
    expect(spawn('grunt').enemy.facing).toBe('south');
    expect(spawn('healer').enemy.facing).toBe('north');
  });
});

describe('Enemy facing: the head leads the march', () => {
  /** South-drawn art: head on the bottom edge, so south is rotation 0. */
  it('turns south-drawn art to all four lanes', () => {
    const { enemy, sprite } = spawn('grunt');
    const cases = [
      { dx: 0, dy: 1, want: 0, lane: 'south' },
      { dx: 1, dy: 0, want: 270, lane: 'east' },
      { dx: 0, dy: -1, want: 180, lane: 'north' },
      { dx: -1, dy: 0, want: 90, lane: 'west' },
    ];
    for (const { dx, dy, want, lane } of cases) {
      enemy.faceTravel(dx * 40, dy * 40);
      expect(deg(sprite.rotation), `${lane} lane`).toBe(want);
    }
  });

  it('turns the one north-drawn sheet the other way round', () => {
    const { enemy, sprite } = spawn('healer');
    const cases = [
      { dx: 0, dy: -1, want: 0, lane: 'north' },
      { dx: 1, dy: 0, want: 90, lane: 'east' },
      { dx: 0, dy: 1, want: 180, lane: 'south' },
      { dx: -1, dy: 0, want: 270, lane: 'west' },
    ];
    for (const { dx, dy, want, lane } of cases) {
      enemy.faceTravel(dx * 40, dy * 40);
      expect(deg(sprite.rotation), `${lane} lane`).toBe(want);
    }
  });

  it('keeps every pose on a 45° step so the pixel art stays legible', () => {
    const { enemy, sprite } = spawn('brute');
    for (let angle = 0; angle < 360; angle += 7) {
      const rad = (angle * Math.PI) / 180;
      enemy.faceTravel(Math.cos(rad) * 40, Math.sin(rad) * 40);
      const stepped = (deg(sprite.rotation) / 45) % 1;
      expect(stepped, `${angle}° produced ${deg(sprite.rotation)}°`).toBe(0);
    }
  });

  it('never mirrors a rotated sheet — the head must not swap sides', () => {
    const { enemy, sprite } = spawn('runner');
    enemy.faceTravel(-40, 0);
    expect(sprite.rotation).not.toBe(0);
    expect(sprite.flipX).toBe(false);
  });

  it('holds its pose while standing still', () => {
    const { enemy, sprite } = spawn('shield');
    enemy.faceTravel(40, 0);
    const posed = sprite.rotation;
    enemy.faceTravel(0.01, 0.01);
    expect(sprite.rotation).toBe(posed);
  });

  it('turns on the corner instead of gliding on its side', () => {
    // The runner crosses the south leg, then the east leg of the lap.
    const { enemy, sprite } = spawn('runner');
    const poses = [];
    for (let i = 0; i < 200; i += 1) {
      enemy.update(16);
      poses.push({ leg: enemy.pathIndex, cell: enemy.getCurrentCellKey(), rotation: deg(sprite.rotation) });
    }
    // `pathIndex` is the waypoint being walked to: 1 = south leg, 2 = east leg.
    // The first frame of a leg is the frame that snapped onto the corner, so it
    // still wears the pose it arrived with; from then on the new lane wins.
    const onSouth = poses.filter((pose) => pose.leg === 1).slice(1);
    const onEast = poses.filter((pose) => pose.leg === 2).slice(1);

    expect(onSouth.length).toBeGreaterThan(0);
    expect(onEast.length).toBeGreaterThan(0);
    // Marching down the map: the head points south (rotation 0 for south art).
    for (const pose of onSouth) expect(pose.rotation).toBe(0);
    // Turned east: a full quarter turn, applied as the lane changed.
    for (const pose of onEast) expect(pose.rotation).toBe(270);
  });

  it('faces the palisade it is breaking', () => {
    const { scene, sprites } = makeScene();
    // The wall sits on the waypoint to the north of the spawn cell.
    const wall = { x: 32, y: 32, isDestroyed: false, health: 420, takeDamage: () => {} };
    const enemy = new Enemy(
      scene,
      'grunt',
      1,
      ['3,0', '0,0'],
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
      // Head turned toward the wall above it. The siege solver parks attackers
      // in a queue slot beside the wall, so the exact pose is north (180°) or
      // the north-west/north-east diagonal — never the south-facing default.
      expect([135, 180, 225]).toContain(deg(sprite.rotation));
    }
  });

  it('falls back to mirroring for front-on art that cannot rotate', () => {
    const { enemy, sprite } = spawn('grunt');
    enemy.facing = 'camera';
    enemy.faceTravel(-40, 0);
    expect(sprite.rotation).toBe(0);
    expect(sprite.flipX).toBe(true);
    enemy.faceTravel(40, 0);
    expect(sprite.flipX).toBe(false);
  });
});
