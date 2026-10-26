// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { cellKey } from '../src/dsa/Graph.js';
import { PathfindingSystem, laneIndexForWave } from '../src/systems/PathfindingSystem.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { deriveBuildSlots, resolveSlotConfig } from '../src/systems/BuildSlots.js';
import { getLevel } from '../src/data/levelData.js';
import { zoneBlock } from '../src/systems/BuildZone.js';

/**
 * The bastion battlefield.
 *
 * Everything a wave-defence stage promises about its ground is checked here, on
 * the data, without a renderer: the portal is *above* the bastion, every wave
 * road descends from one to the other, the roads are genuinely different roads,
 * and the pads sit in the lower defence zone rather than scattered over the
 * whole field.
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

const level = () => getLevel('level-1');
const map = () => parseMap(getMapLayout(level().map));
const lanes = () => new PathfindingSystem(map()).computeLanes({ max: 3 });

describe('the bastion gate is laid out as an upper enemy zone over a lower defence zone', () => {
  it('points the campaign opening stage at the vertical bastion battlefield', () => {
    expect(level().map).toBe('bastion-approach');
    const parsed = map();
    expect(parsed.tiles.flat().filter((t) => t === TILE.SPAWN)).toHaveLength(1);
    expect(parsed.tiles.flat().filter((t) => t === TILE.BASE)).toHaveLength(1);
  });

  it('puts the portal above the bastion, both inside the frame', () => {
    const parsed = map();
    expect(parsed.spawn.row).toBeLessThan(parsed.base.row);
    expect(parsed.spawn.row).toBeGreaterThanOrEqual(2);
    // The camera now fits the whole board into the band between the top bar and
    // the forge (see camera/battleFrame.js), so no row can hide behind chrome.
    // What still has to hold is the arena margin: a full row of terrain between
    // each gate and the rock rim.
    expect(parsed.base.row).toBeLessThan(parsed.rows - 1);
    expect(parsed.spawn.row).toBeGreaterThan(1);
    // Both gates stay clear of the side rims, whatever column a map picks.
    for (const gate of [parsed.spawn, parsed.base]) {
      expect(gate.col).toBeGreaterThanOrEqual(2);
      expect(gate.col).toBeLessThanOrEqual(parsed.cols - 3);
    }
  });

  it('offers two mirror-image roads, one per bridge', () => {
    const routes = lanes();
    const parsed = map();
    expect(routes).toHaveLength(2);

    const spawnKey = cellKey(parsed.spawn.row, parsed.spawn.col);
    const baseKey = cellKey(parsed.base.row, parsed.base.col);
    const signatures = new Set();
    for (const lane of routes) {
      expect(lane[0]).toBe(spawnKey);
      expect(lane[lane.length - 1]).toBe(baseKey);
      expect(lane.length).toBeGreaterThan(12);
      // No road repeats a cell: a backwards loop would make an enemy walk it twice.
      expect(new Set(lane).size).toBe(lane.length);
      // Every route is a step-by-step orthogonal walk.
      for (let i = 1; i < lane.length; i += 1) {
        const [r1, c1] = lane[i - 1].split(',').map(Number);
        const [r2, c2] = lane[i].split(',').map(Number);
        expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
      }
      signatures.add(lane.join('|'));
    }
    expect(signatures.size).toBe(2);

    // One lane crosses the left bridge, the other the right one.
    const bridgeOf = (lane) => lane.find((key) => key.startsWith('5,'));
    const bridgeCols = routes.map((lane) => Number(bridgeOf(lane).split(',')[1])).sort((a, b) => a - b);
    expect(bridgeCols[0]).toBeLessThan(parsed.cols / 2);
    expect(bridgeCols[1]).toBeGreaterThan(parsed.cols / 2);
  });

  it('deals one lane per wave, in a fixed rotation both seats can reproduce', () => {
    const count = lanes().length;
    expect([1, 2, 3, 4, 5].map((wave) => laneIndexForWave(wave, count))).toEqual([0, 1, 0, 1, 0]);
  });

  it('keeps every pad inside the level band and out of the two no-build zones', () => {
    const { slots } = deriveBuildSlots(map(), lanes(), resolveSlotConfig(level()));
    const parsed = map();
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.row).toBeGreaterThanOrEqual(level().buildSlots.minRow);
      expect(slot.row).toBeLessThanOrEqual(level().buildSlots.maxRow);
      // Pads are hints on the free-placement field, so they may sit in either
      // half — but never on the portal landing ring or the bastion plaza.
      expect(zoneBlock(slot, parsed)).toBe(null);
    }
  });
});

describe('the scene wires free placement into the one build path', () => {
  function sceneFor() {
    const parsed = map();
    const { keys } = deriveBuildSlots(parsed, lanes(), resolveSlotConfig(level()));
    const route = new Set();
    for (let row = 0; row < parsed.rows; row += 1) {
      for (let col = 0; col < parsed.cols; col += 1) {
        if (parsed.tiles[row][col] === TILE.ROAD) route.add(cellKey(row, col));
      }
    }
    return {
      level: level(),
      map: parsed,
      placement: new PlacementSystem(parsed),
      economy: { coins: 5000 },
      activeTowers: [],
      routeCells: route,
      buildSlotKeys: keys,
      runMods: {},
      maxTowers: 8,
      usedBuildPoints: GameScene.prototype.usedBuildPoints,
      validateBuild: GameScene.prototype.validateBuild,
      isEnemyOnCell: () => false,
    };
  }

  const firstCell = (scene, predicate) => {
    for (let row = 0; row < scene.map.rows; row += 1) {
      for (let col = 0; col < scene.map.cols; col += 1) {
        if (predicate(scene.map.tiles[row][col], row, col)) return { row, col };
      }
    }
    return null;
  };
  const near = (cell, gate, distance) =>
    Math.max(Math.abs(cell.row - gate.row), Math.abs(cell.col - gate.col)) <= distance;

  it('accepts a keep on grass that is not a suggested pad', () => {
    const scene = sceneFor();
    const target = firstCell(
      scene,
      (type, row, col) =>
        type === TILE.GRASS &&
        row > scene.map.riverRow &&
        !scene.buildSlotKeys.has(cellKey(row, col)) &&
        !near({ row, col }, scene.map.spawn, 2) &&
        !near({ row, col }, scene.map.base, 2)
    );
    expect(target).toBeTruthy();
    expect(scene.validateBuild('archer', target.row, target.col)).toEqual({ ok: true, reason: null });
  });

  it('refuses a keep standing on the road — the pathway stays clear', () => {
    const scene = sceneFor();
    const target = firstCell(
      scene,
      (type, row, col) =>
        type === TILE.ROAD &&
        row > scene.map.riverRow &&
        !near({ row, col }, scene.map.spawn, 2) &&
        !near({ row, col }, scene.map.base, 2)
    );
    expect(target).toBeTruthy();
    expect(scene.validateBuild('archer', target.row, target.col)).toEqual({
      ok: false,
      reason: 'road-tile',
    });
  });

  it('accepts a keep on a pad and refuses the enemy half', () => {
    const scene = sceneFor();
    const [row, col] = [...scene.buildSlotKeys][0].split(',').map(Number);
    expect(scene.validateBuild('archer', row, col)).toEqual({ ok: true, reason: null });

    // The far bank belongs to the horde: grass there is terrain, not a build
    // site (Request 22 — defences only on our side of the river).
    const enemyHalf = firstCell(
      scene,
      (type, r, c) =>
        type === TILE.GRASS &&
        r > 0 &&
        r < scene.map.riverRow &&
        !near({ row: r, col: c }, scene.map.spawn, 3)
    );
    expect(enemyHalf).toBeTruthy();
    expect(scene.validateBuild('archer', enemyHalf.row, enemyHalf.col)).toEqual({
      ok: false,
      reason: 'enemy-half',
    });
  });

  it('still refuses the portal landing ring, the bastion plaza, water and rock', () => {
    const scene = sceneFor();
    const spawn = scene.map.spawn;
    const ring = firstCell(scene, (type, row, col) => type === TILE.GRASS && near({ row, col }, spawn, 1));
    expect(ring).toBeTruthy();
    expect(scene.validateBuild('archer', ring.row, ring.col)).toEqual({
      ok: false,
      reason: 'spawn-zone',
    });
    const base = scene.map.base;
    expect(scene.validateBuild('archer', base.row, base.col - 1)).toEqual({
      ok: false,
      reason: 'base-zone',
    });
    const water = firstCell(scene, (type) => type === TILE.WATER);
    expect(water).toBeTruthy();
    expect(scene.validateBuild('archer', water.row, water.col).reason).toBe('blocked-tile');
    const rock = firstCell(scene, (type) => type === TILE.ROCK);
    expect(rock).toBeTruthy();
    expect(scene.validateBuild('archer', rock.row, rock.col).reason).toBe('blocked-tile');
  });
});

describe('the auto-start clock is not armed where another clock already owns the game', () => {
  it('runs in campaign, endless and the solo modes', () => {
    const proto = GameScene.prototype;
    expect(proto.autoWavesEnabled.call({ level: level(), mode: {} })).toBe(true);
    expect(proto.autoWavesEnabled.call({ level: { endless: true }, mode: {} })).toBe(true);
  });

  it('stays off in a duel and in Time Attack, and off when a level says so', () => {
    const proto = GameScene.prototype;
    expect(proto.autoWavesEnabled.call({ level: { pvp: true }, mode: {} })).toBe(false);
    expect(proto.autoWavesEnabled.call({ level: level(), mode: { timeAttack: true } })).toBe(false);
    expect(proto.autoWavesEnabled.call({ level: { rules: { autoWaves: false } }, mode: {} })).toBe(false);
  });
});
