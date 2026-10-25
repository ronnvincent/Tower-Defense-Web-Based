// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
import { ENEMY_SHEETS } from '../src/data/spireManifest.js';

/**
 * Horde facing — the head points down the lane.
 *
 * This file used to pin a **rotation** contract ("turn the body by heading −
 * 90°"). That model was wrong, and fixing it three times never helped, because
 * the problem was the model, not the offset.
 *
 * A Spire strip is **three clips x three directions**, not three palettes:
 *
 *     rows 0-2   idle : south (towards the camera) / north (away) / profile
 *     rows 3-5   walk : the same three
 *     rows 6-8   death: the same three
 *
 * So every creature already ships a drawing for each way it can travel, and the
 * correct pose change is *switch rows*, never rotate. Rotating top-down art by
 * 90° maps its "away from camera" axis onto the screen x axis, which is exactly
 * why the horde looked like it was lying on its side:
 *
 *   • rotation stays 0 in every lane, so the head always points along the road;
 *   • vertical lanes pick the south (0) or north (1) row;
 *   • horizontal lanes pick the profile row (2), mirrored only when the art is
 *     drawn looking the other way — the profile row faces east on some
 *     creatures and west on others, so it is declared per sheet;
 *   • imported Flare creatures are single-pose, so they mirror instead.
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

describe('Enemy facing: the head points down the lane', () => {
  it('never rotates the sprite — the pose comes from the art, not a transform', () => {
    for (const type of ['grunt', 'brute', 'runner', 'swarm', 'shield']) {
      const { enemy, sprite } = spawn(type);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        enemy.faceTravel(dx * 40, dy * 40);
        expect(deg(sprite.rotation), `${type} travelling ${dx},${dy} was rotated`).toBe(0);
      }
    }
  });

  it('wears the south row walking down the map and the north row walking up', () => {
    for (const type of ['grunt', 'brute', 'runner', 'shield']) {
      const { enemy } = spawn(type);
      enemy.faceTravel(0, 40);
      expect(enemy.direction, type).toBe('south');
      expect(enemy.animPrefix, type).toBe(`enemy-${type}-d0`);
      enemy.faceTravel(0, -40);
      expect(enemy.direction, type).toBe('north');
      expect(enemy.animPrefix, type).toBe(`enemy-${type}-d1`);
    }
  });

  it('switches to the profile row across the lane, and only mirrors when needed', () => {
    // The profile art is hand-drawn: `leafbug` looks east, `scorpion` west.
    const eastDrawn = spawn('grunt').enemy;
    expect(eastDrawn.profileFacing).toBe('east');
    eastDrawn.faceTravel(40, 0);
    expect(eastDrawn.direction).toBe('profile');
    expect(eastDrawn.animPrefix).toBe('enemy-grunt-d2');
    expect(eastDrawn.sprite.flipX).toBe(false);
    eastDrawn.faceTravel(-40, 0);
    expect(eastDrawn.sprite.flipX).toBe(true);

    const westDrawn = spawn('brute').enemy;
    expect(westDrawn.profileFacing).toBe('west');
    westDrawn.faceTravel(40, 0);
    expect(westDrawn.direction).toBe('profile');
    expect(westDrawn.sprite.flipX).toBe(true);
    westDrawn.faceTravel(-40, 0);
    expect(westDrawn.sprite.flipX).toBe(false);
  });

  it('mirrors single-pose imported art instead of switching rows', () => {
    const { enemy, sprite } = spawn('thrall');
    expect(enemy.directional).toBe(false);
    enemy.faceTravel(40, 0);
    expect(sprite.flipX).toBe(false);
    enemy.faceTravel(-40, 0);
    expect(sprite.flipX).toBe(true);
    expect(deg(sprite.rotation)).toBe(0);
    // A one-pose sheet has no north row to wear, so it keeps the south clip.
    enemy.faceTravel(0, -40);
    expect(enemy.animPrefix).toBe('enemy-thrall-d0');
  });

  it('holds its pose while standing still', () => {
    const { enemy } = spawn('shield');
    enemy.faceTravel(40, 0);
    const posed = enemy.direction;
    enemy.faceTravel(0.01, 0.01);
    expect(enemy.direction).toBe(posed);
  });

  it('changes pose on the corner, in the same frame the lane changes', () => {
    // The runner crosses the south leg, then the east leg of the lap.
    const { enemy } = spawn('runner');
    const poses = [];
    for (let i = 0; i < 200; i += 1) {
      enemy.update(16);
      poses.push({ leg: enemy.pathIndex, direction: enemy.direction });
    }
    const onSouth = poses.filter((pose) => pose.leg === 1).slice(1);
    const onEast = poses.filter((pose) => pose.leg === 2).slice(1);

    expect(onSouth.length).toBeGreaterThan(0);
    expect(onEast.length).toBeGreaterThan(0);
    // Marching down the map: the south row, head towards the camera.
    for (const pose of onSouth) expect(pose.direction).toBe('south');
    // Turned east: the profile row, art already drawn looking east.
    for (const pose of onEast) expect(pose.direction).toBe('profile');
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

    for (let i = 0; i < 30; i += 1) {
      enemy.update(100);
      expect(enemy.isSieging).toBe(true);
      // Attacking a wall to the north is a northbound pose, never the
      // south-facing default and never a rotation.
      expect(enemy.direction).toBe('north');
      expect(deg(sprites[0].rotation)).toBe(0);
    }
  });

  it('turns all 20 creeps the right way in all four lanes', () => {
    // Driven by the manifest, not by a hand-kept list, so a new creature cannot
    // ship sideways without failing here. Expected values are the *art*, not the
    // heading: a west-drawn profile is mirrored to walk east.
    const lanes = [
      { name: 'east', step: [40, 0], row: 'profile', mirrors: (pf) => pf === 'west' },
      { name: 'west', step: [-40, 0], row: 'profile', mirrors: (pf) => pf === 'east' },
      { name: 'south', step: [0, 40], row: 'south', mirrors: () => false },
      { name: 'north', step: [0, -40], row: 'north', mirrors: () => false },
    ];

    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      for (const lane of lanes) {
        const { enemy } = spawn(key);
        const row = enemy.directional ? lane.row : 'south';
        enemy.faceTravel(lane.step[0], lane.step[1]);
        expect(enemy.direction, `${key} ${lane.name}`).toBe(row);
        expect(enemy.sprite.rotation, `${key} ${lane.name} was rotated`).toBe(0);
        // Vertical lanes never mirror; horizontal lanes mirror the sheets whose
        // profile art is drawn facing the other way.
        // Single-pose art has no profile row at all: it mirrors whenever it walks
        // west, whatever the lane.
        const wantFlip = enemy.directional
          ? row === 'profile' && lane.mirrors(enemy.profileFacing)
          : lane.name === 'west';
        expect(Boolean(enemy.sprite.flipX), `${key} ${lane.name} mirror`).toBe(wantFlip);
        expect(enemy.animPrefix).toBe(`enemy-${key}-d${row === 'south' ? 0 : row === 'north' ? 1 : 2}`);
      }
    }
  });

  it('declares a profile direction for every directional sheet', () => {
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      expect(['east', 'west'], `${key} has no profile direction`).toContain(sheet.profileFacing);
    }
  });
});
