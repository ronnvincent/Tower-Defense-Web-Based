// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { cellKey } from '../src/dsa/Graph.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { getLevel, LEVELS, ENDLESS_LEVEL, ALL_LEVELS } from '../src/data/levelData.js';
import { getBuildDefinition } from '../src/data/towerData.js';

/**
 * Build points.
 *
 * Stage 1's contract is 300 gold, 20 lives, 8 waves and **8 build points**.
 * The cap is a data field on the level and is enforced in the one validation
 * path the build ghost and the real build share, so this file is about three
 * things only: the numbers, the rule, and the readout that makes the rule
 * visible. Placement on every other level has to stay free — that is the
 * existing behaviour this must not break.
 */

let GameScene;
let HUD;

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
  ({ HUD } = await import('../src/ui/HUD.js'));
});

/** A bare scene with just the collaborators `validateBuild` reads. */
function sceneFor({ levelId = 'level-1', coins = 5000, towers = 0, maxTowers } = {}) {
  const level = getLevel(levelId);
  const map = parseMap(getMapLayout(level.map));
  const route = new Set();
  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      if (map.tiles[row][col] === TILE.ROAD) route.add(cellKey(row, col));
    }
  }
  const scene = {
    level,
    map,
    placement: new PlacementSystem(map),
    economy: { coins },
    activeTowers: [],
    routeCells: route,
    runMods: {},
    maxTowers: maxTowers ?? (Number.isFinite(level.maxTowers) ? level.maxTowers : Infinity),
    usedBuildPoints: GameScene.prototype.usedBuildPoints,
    validateBuild: GameScene.prototype.validateBuild,
    isEnemyOnCell: () => false,
  };
  for (let i = 0; i < towers; i += 1) scene.activeTowers.push({ isBarricade: false });
  return scene;
}

/**
 * The first tile of `type` that is a legal build site on our side of the river.
 * Grass above the river is enemy ground since Request 22, and a road is never a
 * build site for a keep — so a blind top-left scan would return a cell that is
 * refused for a reason this file is not testing.
 */
function firstTile(map, type, { after = 0 } = {}) {
  for (let row = Math.max(after, 0); row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      if (map.tiles[row][col] !== type) continue;
      // Keeps and palisades are both player-half objects.
      if (row <= (map.riverRow ?? 0)) continue;
      return { row, col };
    }
  }
  return null;
}

describe('stage 1 contract', () => {
  it('ships 300 gold, 20 lives, 8 waves and 8 build points', () => {
    const level = getLevel('level-1');
    expect(level.startingCoins).toBe(300);
    expect(level.baseHealth).toBe(20);
    expect(level.waves).toHaveLength(8);
    expect(level.maxTowers).toBe(8);
  });

  it('leaves build points unlimited on every other level and mode', () => {
    for (const level of ALL_LEVELS) {
      if (level.id === 'level-1') continue;
      expect(level.maxTowers, `${level.id} must not cap keeps`).toBeUndefined();
    }
    expect(ENDLESS_LEVEL.maxTowers).toBeUndefined();
    // The campaign list is the one the briefing screen draws from.
    expect(LEVELS.filter((level) => Number.isFinite(level.maxTowers))).toHaveLength(1);
  });

  it('treats an absent cap as unlimited in the scene', () => {
    const scene = sceneFor({ levelId: 'level-2', towers: 200 });
    const tile = firstTile(scene.map, TILE.GRASS);
    expect(scene.maxTowers).toBe(Infinity);
    expect(scene.validateBuild('archer', tile.row, tile.col)).toEqual({ ok: true, reason: null });
  });
});

describe('the cap is enforced where the ghost reads it', () => {
  it('allows the eighth keep and refuses the ninth with a readable reason', () => {
    const scene = sceneFor({ towers: 7 });
    const tile = firstTile(scene.map, TILE.GRASS);
    expect(scene.usedBuildPoints()).toBe(7);
    expect(scene.validateBuild('archer', tile.row, tile.col)).toEqual({ ok: true, reason: null });

    scene.activeTowers.push({ isBarricade: false });
    expect(scene.usedBuildPoints()).toBe(8);
    expect(scene.validateBuild('archer', tile.row, tile.col)).toEqual({
      ok: false,
      reason: 'max-towers',
    });
  });

  it('does not count palisades and still lets one be raised at full budget', () => {
    const scene = sceneFor({ towers: 8 });
    scene.activeTowers.push({ isBarricade: true });
    expect(scene.usedBuildPoints()).toBe(8);

    const road = firstTile(scene.map, TILE.ROAD);
    expect(scene.validateBuild('barricade', road.row, road.col)).toEqual({ ok: true, reason: null });
    // …and the ninth keep is still refused.
    const grass = firstTile(scene.map, TILE.GRASS);
    expect(scene.validateBuild('archer', grass.row, grass.col).reason).toBe('max-towers');
  });

  it('keeps the tile, zone and gold rules in front of the cap', () => {
    // A capped, broke player is told about the tile first: the ghost must not
    // paint a rock green just because a build point is free.
    const scene = sceneFor({ towers: 0, coins: 0 });
    const rock = firstTile(scene.map, TILE.ROCK);
    expect(scene.validateBuild('archer', rock.row, rock.col).reason).toBe('blocked-tile');
    // The portal landing ring outranks the gold check too (the portal tile
    // itself is not buildable ground, so the ring is probed one cell over).
    expect(scene.validateBuild('archer', scene.map.spawn.row, scene.map.spawn.col - 1).reason).toBe(
      'spawn-zone'
    );
    const grass = firstTile(scene.map, TILE.GRASS);
    expect(scene.validateBuild('archer', grass.row, grass.col).reason).toBe('no-coins');
    // …and with gold in the bank the cap answers, not the map.
    const rich = sceneFor({ towers: 99, coins: 999 });
    expect(rich.validateBuild('archer', grass.row, grass.col).reason).toBe('max-towers');
  });

  it('counts the defence the player is about to buy, not the palisade', () => {
    expect(getBuildDefinition('barricade').placement).toBe('road');
    expect(getBuildDefinition('archer').placement).toBe('grass');
    const scene = sceneFor({ towers: 0 });
    scene.activeTowers.push({ isBarricade: true }, { isBarricade: false });
    expect(scene.usedBuildPoints()).toBe(1);
  });
});

describe('the readout in the forge header', () => {
  const build = () => {
    document.body.innerHTML = '<span id="dock-points" class="dock-points hidden"></span>';
    return document.getElementById('dock-points');
  };

  it('is hidden when a level has no cap', () => {
    const el = build();
    HUD.prototype.setBuildPoints.call({}, 3, Infinity);
    expect(el.classList.contains('hidden')).toBe(true);
    expect(el.textContent).toBe('');
  });

  it('shows used/max and turns amber when the budget is gone', () => {
    const el = build();
    HUD.prototype.setBuildPoints.call({}, 3, 8);
    expect(el.classList.contains('hidden')).toBe(false);
    expect(el.textContent).toBe('3/8 BUILDS');
    expect(el.classList.contains('is-full')).toBe(false);
    expect(el.getAttribute('aria-label')).toBe('3 of 8 build points used');

    HUD.prototype.setBuildPoints.call({}, 8, 8);
    expect(el.textContent).toBe('8/8 BUILDS');
    expect(el.classList.contains('is-full')).toBe(true);
  });

  it('clamps a counter that would read higher than the budget', () => {
    const el = build();
    HUD.prototype.setBuildPoints.call({}, 12, 8);
    expect(el.textContent).toBe('8/8 BUILDS');
  });
});
