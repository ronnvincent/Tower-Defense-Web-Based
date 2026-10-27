// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { cellKey } from '../src/dsa/Graph.js';
import { PathfindingSystem, gateIndexForSpawn, laneIndexForWave } from '../src/systems/PathfindingSystem.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { getLevel } from '../src/data/levelData.js';
import { buildBounds, zoneBlock } from '../src/systems/BuildZone.js';

/**
 * The bastion field.
 *
 * Everything a base-defence stage promises about its ground is checked here, on
 * the data, without a renderer: the horde enters from three portals above the
 * board and flies in through two sky gates in the walls, every road descends
 * from a portal to the bastion on the bottom-centre column, and the five rows
 * around the keep are open ground — no pads, no rocks, no water — so a defence
 * can be raised anywhere legal instead of only on painted tiles.
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
const FIELD_TILES = new Set([TILE.GRASS, TILE.ROAD, TILE.BASE]);

describe('the bastion field: three portals above, one keep below, open ground between', () => {
  it('points the campaign opening stage at the three-way field', () => {
    const parsed = map();
    const cells = parsed.tiles.flat();
    expect(cells.filter((t) => t === TILE.SPAWN), 'ground portals').toHaveLength(3);
    expect(cells.filter((t) => t === TILE.BASE), 'bastions').toHaveLength(1);
    expect(cells.filter((t) => t === TILE.AIR), 'sky gates').toHaveLength(2);
    expect(parsed.spawns).toHaveLength(3);
    expect(parsed.airGates).toHaveLength(2);
    // The three portals sit on one row, the flanks either side of the middle.
    const cols = parsed.spawns.map((spawn) => spawn.col).sort((a, b) => a - b);
    expect(new Set(parsed.spawns.map((spawn) => spawn.row)).size).toBe(1);
    expect(cols[0]).toBeLessThan(parsed.base.col);
    expect(cols[2]).toBeGreaterThan(parsed.base.col);
  });

  it('puts the portals above the bastion and the bastion on the bottom-centre column', () => {
    const parsed = map();
    for (const spawn of parsed.spawns) {
      expect(spawn.row, 'portal is not above the keep').toBeLessThan(parsed.base.row);
      // Row 0 is the rock rim; every portal sits on row 1, one full row inside.
      expect(spawn.row, 'portal is in the rim').toBeGreaterThan(0);
      expect(spawn.col).toBeGreaterThanOrEqual(2);
      expect(spawn.col).toBeLessThanOrEqual(parsed.cols - 3);
    }
    // Bottom-centre: the keep owns the last playable row, on the axis column.
    expect(parsed.base.row).toBe(parsed.rows - 2);
    // Bottom-centre of the board, not merely of the portal row: the flanks are
    // allowed to lean, the keep is not.
    expect(Math.abs(parsed.base.col - (parsed.cols - 1) / 2)).toBeLessThanOrEqual(1);
    // …and the sky gates are cut into the side walls, above the field.
    for (const gate of parsed.airGates) {
      expect(gate.col === 0 || gate.col === parsed.cols - 1, 'sky gate is not in a wall').toBe(true);
      expect(gate.row).toBeLessThan(parsed.buildRow);
    }
  });

  it('runs one road from every portal to the bastion, step by step', () => {
    const routes = lanes();
    const parsed = map();
    expect(routes).toHaveLength(3);

    const gates = parsed.spawns.map((spawn) => cellKey(spawn.row, spawn.col));
    const baseKey = cellKey(parsed.base.row, parsed.base.col);
    expect(routes.map((lane) => lane[0]).sort()).toEqual([...gates].sort());

    const signatures = new Set();
    for (const lane of routes) {
      expect(lane[lane.length - 1]).toBe(baseKey);
      expect(lane.length).toBeGreaterThan(9);
      // No road repeats a cell: a backwards loop would make an enemy walk it twice.
      expect(new Set(lane).size).toBe(lane.length);
      // Every route is a step-by-step orthogonal walk.
      for (let i = 1; i < lane.length; i += 1) {
        const [r1, c1] = lane[i - 1].split(',').map(Number);
        const [r2, c2] = lane[i].split(',').map(Number);
        expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
      }
      for (const key of lane) {
        const [row, col] = key.split(',').map(Number);
        expect(parsed.tiles[row][col], `${key} is not walkable`).not.toBe(TILE.ROCK);
      }
      signatures.add(lane.join('|'));
    }
    expect(signatures.size).toBe(3);
  });

  it('keeps the three roads apart until the gate ring', () => {
    const routes = lanes();
    const parsed = map();
    const shared = new Set();
    for (const lane of routes) shared.add(lane.join('|'));
    expect(shared.size).toBe(3);
    // Two portals may share the final approach into the keep — that is the gate
    // ring — but they must not merge earlier or the flank is decoration.
    const first = new Set(routes[0]);
    const second = routes[1];
    for (const key of second) {
      if (!first.has(key)) continue;
      const [row] = key.split(',').map(Number);
      expect(row, `${key} is shared before the gate ring`).toBeGreaterThanOrEqual(parsed.base.row - 1);
    }
  });

  it('leaves the whole build field free of scenery', () => {
    const parsed = map();
    const bounds = buildBounds(parsed);
    expect(bounds.rowMin).toBe(parsed.buildRow);
    expect(bounds.rowMax).toBe(parsed.base.row);
    for (let row = bounds.rowMin; row <= bounds.rowMax; row += 1) {
      for (let col = bounds.colMin; col <= bounds.colMax; col += 1) {
        // Rocks, ponds and ruins were moved out of the field on purpose: a base
        // defence board must not have a hole the player only discovers when the
        // ghost turns red (Request 40).
        expect(
          FIELD_TILES.has(parsed.tiles[row][col]),
          `${row},${col} is ${parsed.tiles[row][col]} inside the build field`
        ).toBe(true);
      }
    }
    // The row above the field is the enemy's ground — no build cells there.
    expect(zoneBlock({ row: parsed.buildRow - 1, col: 4 }, parsed)).toBe('enemy-half');
  });

  it('deals one portal per enemy, in a rotation both seats can reproduce', () => {
    const count = map().spawns.length;
    expect(count).toBe(3);
    expect([0, 1, 2, 3, 4, 5].map((tick) => gateIndexForSpawn(tick, 1, count))).toEqual([0, 1, 2, 0, 1, 2]);
    expect([0, 1, 2].map((tick) => gateIndexForSpawn(tick, 2, count))).toEqual([1, 2, 0]);
    // The wave still owns one road for the palisade rule.
    expect([1, 2, 3, 4].map((wave) => laneIndexForWave(wave, count))).toEqual([0, 1, 2, 0]);
  });
});

describe('the scene wires free placement into the one build path', () => {
  function sceneFor() {
    const parsed = map();
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
      buildBounds: buildBounds(parsed),
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

  /** Every open grass cell in the field, in reading order. */
  const freeCells = (scene) => {
    const cells = [];
    for (let row = scene.buildBounds.rowMin; row <= scene.buildBounds.rowMax; row += 1) {
      for (let col = scene.buildBounds.colMin; col <= scene.buildBounds.colMax; col += 1) {
        if (scene.map.tiles[row][col] !== TILE.GRASS) continue;
        if (zoneBlock({ row, col }, scene.map) !== null) continue;
        cells.push({ row, col });
      }
    }
    return cells;
  };

  it('accepts a keep on any open field cell, not just a painted spot', () => {
    const scene = sceneFor();
    const cells = freeCells(scene);
    expect(cells.length).toBeGreaterThan(80);
    for (const cell of cells) {
      expect(scene.validateBuild('archer', cell.row, cell.col), `${cell.row},${cell.col}`).toEqual({
        ok: true,
        reason: null,
      });
    }
  });

  it('accepts keeps on a diagonal, so the field is a plane and not a lattice', () => {
    const scene = sceneFor();
    const cells = freeCells(scene);
    const diagonal = (() => {
      const keys = new Set(cells.map((cell) => `${cell.row},${cell.col}`));
      for (const cell of cells) {
        const other = `${cell.row + 1},${cell.col + 1}`;
        const partner = cells.find((entry) => `${entry.row},${entry.col}` === other);
        if (partner && keys.has(other)) return [cell, partner];
      }
      return null;
    })();
    expect(diagonal).toBeTruthy();
    for (const cell of diagonal) {
      expect(scene.validateBuild('archer', cell.row, cell.col)).toEqual({ ok: true, reason: null });
    }
    // Two keeps on the diagonal never share a row or a column.
    expect(diagonal[0].row).not.toBe(diagonal[1].row);
    expect(diagonal[0].col).not.toBe(diagonal[1].col);
  });

  it('refuses a keep standing on the road — the pathway stays clear', () => {
    const scene = sceneFor();
    const target = firstCell(
      scene,
      (type, row, col) =>
        type === TILE.ROAD && row >= scene.buildBounds.rowMin && row <= scene.buildBounds.rowMax
    );
    expect(target).toBeTruthy();
    expect(scene.validateBuild('archer', target.row, target.col)).toEqual({
      ok: false,
      reason: 'road-tile',
    });
  });

  it('refuses the enemy ground above the field line', () => {
    const scene = sceneFor();
    const enemyHalf = firstCell(
      scene,
      (type, row, col) => type === TILE.GRASS && row >= 2 && row < scene.map.buildRow && zoneBlock({ row, col }, scene.map) === 'enemy-half'
    );
    expect(enemyHalf).toBeTruthy();
    expect(scene.validateBuild('archer', enemyHalf.row, enemyHalf.col)).toEqual({
      ok: false,
      reason: 'enemy-half',
    });
  });

  it('still refuses the portal landing rings, the bastion plaza and the rim', () => {
    const scene = sceneFor();
    for (const spawn of scene.map.spawns) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0]]) {
        const cell = { row: spawn.row + dr, col: spawn.col + dc };
        if (scene.map.tiles[cell.row]?.[cell.col] !== TILE.GRASS) continue;
        expect(scene.validateBuild('archer', cell.row, cell.col).reason).toBe('spawn-zone');
      }
    }
    const base = scene.map.base;
    // The ring around the keep: refused for the plaza on grass, for the road on
    // the approach — never buildable either way.
    const ring = [];
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]]) {
      const cell = { row: base.row + dr, col: base.col + dc };
      const tile = scene.map.tiles[cell.row]?.[cell.col];
      if (tile !== TILE.GRASS && tile !== TILE.ROAD) continue;
      ring.push({ cell, tile, reason: scene.validateBuild('archer', cell.row, cell.col).reason });
    }
    expect(ring.length).toBeGreaterThan(2);
    for (const entry of ring) {
      expect(entry.reason, `${entry.cell.row},${entry.cell.col}`).toMatch(/base-zone|road-tile|endpoint/);
    }
    expect(ring.some((entry) => entry.reason === 'base-zone'), 'no grass in the ring').toBe(true);
    expect(scene.validateBuild('archer', 0, 0).reason).toBe('blocked-tile');
  });

  it('keeps scenery out of the field but still paints it outside', () => {
    const parsed = map();
    const outside = [];
    for (let row = 0; row < parsed.rows; row += 1) {
      for (let col = 0; col < parsed.cols; col += 1) {
        if (parsed.tiles[row][col] === TILE.ROCK || parsed.tiles[row][col] === TILE.WATER) {
          outside.push({ row, col });
        }
      }
    }
    expect(outside.length, 'the board lost all of its scenery').toBeGreaterThan(0);
    const bounds = buildBounds(parsed);
    for (const cell of outside) {
      const inField =
        cell.row >= bounds.rowMin &&
        cell.row <= bounds.rowMax &&
        cell.col >= bounds.colMin &&
        cell.col <= bounds.colMax;
      expect(inField, `${cell.row},${cell.col} blocks the field`).toBe(false);
    }
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
