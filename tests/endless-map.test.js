import { describe, it, expect } from 'vitest';
import {
  MAPS,
  MAP_LAYOUT,
  MAP_BIOMES,
  BIOME_THEME,
  parseMap,
  getMapBiomes,
  TILE,
} from '../src/data/mapData.js';
import { ARENA } from '../src/data/arenaLayout.js';
import { TILE_SIZE } from '../src/config/gameConfig.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { THEMES } from '../src/data/levelData.js';

/**
 * The Convergence — the endless battlefield.
 *
 * Two complaints drove this map: the horde was fighting in a shoebox, and the
 * caldera was one flat colour. It now uses the same arena grammar as every
 * other battlefield (portal on top, bastion at the bottom, rift across the
 * middle) and its ground is painted from four tile sets at once: snowfield,
 * dunes, caldera and the crystal vein along the east wall.
 *
 * These tests pin the parts a hand edit could quietly break: the size, the
 * four-biome coverage, the road actually passing through every biome, and the
 * river being crossable (a water tile the road may not cross would make the
 * level unwinnable — BFS would find no path).
 */

const map = parseMap(MAPS.volcanic);

/** Shortest walkable route from spawn to base, as a list of {row,col}. */
function shortestPath(parsed) {
  const { rows, cols, tiles, spawn, base } = parsed;
  const walkable = (r, c) => {
    const t = tiles[r]?.[c];
    return t === TILE.ROAD || t === TILE.SPAWN || t === TILE.BASE;
  };
  const key = (r, c) => `${r},${c}`;
  const queue = [spawn];
  const seen = new Set([key(spawn.row, spawn.col)]);
  const prev = new Map();
  while (queue.length) {
    const cell = queue.shift();
    if (cell.row === base.row && cell.col === base.col) break;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const r = cell.row + dr;
      const c = cell.col + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (!walkable(r, c) || seen.has(key(r, c))) continue;
      seen.add(key(r, c));
      prev.set(key(r, c), cell);
      queue.push({ row: r, col: c });
    }
  }
  const route = [];
  let cursor = base;
  while (cursor) {
    route.push(cursor);
    if (cursor.row === spawn.row && cursor.col === spawn.col) break;
    cursor = prev.get(key(cursor.row, cursor.col));
  }
  return route.reverse();
}

describe('The Convergence layout', () => {
  it('uses the shared arena grammar', () => {
    const campaign = parseMap(MAP_LAYOUT);
    expect(map.cols).toBe(campaign.cols);
    expect(map.rows).toBe(campaign.rows);
    // Three portals above, bastion below — the endless field reads as the same
    // board as the campaign, only repainted.
    expect(map.spawns).toHaveLength(3);
    expect(map.airGates).toHaveLength(2);
    expect(map.spawn.row).toBeLessThan(map.base.row);
    expect(map.rows).toBe(ARENA.rows);
    expect(map.cols).toBe(ARENA.cols);
    // 32x12 at 64 px still frames inside the camera's 0.45x floor.
    const fit = Math.min(1280 / (map.cols * TILE_SIZE), 768 / (map.rows * TILE_SIZE));
    expect(fit).toBeGreaterThan(0.45);
  });

  it('runs a road long enough to matter', () => {
    const route = shortestPath(map);
    // The three portal roads, 10-21 cells each: long enough for the defence to
    // work and short enough that wave 1 is not a waiting game.
    expect(route.length).toBeGreaterThanOrEqual(15);
    // …but a creep must not take a minute and a half to reach the core at base
    // speed (62 px/s), or wave 1 would be a waiting game.
    const seconds = (route.length * TILE_SIZE) / 62;
    expect(seconds).toBeLessThan(75);
  });

  it('keeps its scenery out of the build field and off the road', () => {
    // The endless field follows the same rule as the campaign boards: the five
    // rows around the bastion are open ground, and every rock or pond lives in
    // the horde's muster ground above them.
    const bounds = { rowMin: map.buildRow, rowMax: map.base.row, colMin: 2, colMax: map.cols - 3 };
    const scenery = [];
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        const tile = map.tiles[row][col];
        if (tile === TILE.ROCK || tile === TILE.WATER) scenery.push({ row, col, tile });
      }
    }
    expect(scenery.length, 'the board lost all of its scenery').toBeGreaterThan(40);
    for (const cell of scenery) {
      const inField =
        cell.row >= bounds.rowMin &&
        cell.row <= bounds.rowMax &&
        cell.col >= bounds.colMin &&
        cell.col <= bounds.colMax;
      expect(inField, `${cell.row},${cell.col} blocks the build field`).toBe(false);
    }
    // …and none of it stands on a lane, so every approach stays walkable.
    const lanes = new PathfindingSystem(map).computeLanes().flat();
    const road = new Set(lanes);
    for (const cell of scenery) {
      expect(road.has(`${cell.row},${cell.col}`), `${cell.row},${cell.col} is on a road`).toBe(false);
    }
  });
});

describe('three biomes on one battlefield', () => {
  const grid = getMapBiomes('volcanic');

  it('ships a biome grid that matches the layout', () => {
    expect(grid).toBeTruthy();
    expect(grid.length).toBe(map.rows);
    for (const row of grid) expect(row.length).toBe(map.cols);
    expect(MAP_BIOMES.volcanic).toHaveLength(map.rows);
  });

  it('paints snow, sand and fire — one band per biome, top to bottom', () => {
    const themes = new Set(grid.flat());
    for (const theme of ['ice', 'desert', 'volcanic']) {
      expect(themes.has(theme), `${theme} is missing`).toBe(true);
      // Every biome it uses must own a real generated tile set.
      expect(THEMES[theme], `${theme} has no theme entry`).toBeTruthy();
    }
    // Three bands, not four: the crystal strip that used to sit under the keep
    // turned the whole player half lilac and made the bastion look dropped on a
    // different map. The bands are cut on the field grammar — the horde's
    // muster ground is snow, the field line starts the dunes, and the caldera
    // owns the rows around the bastion.
    expect(themes.has('crystal')).toBe(false);
    expect(grid[0][0]).toBe('ice');
    expect(grid[map.rows - 1][0]).toBe('volcanic');
    expect(grid[map.spawn.row][map.spawn.col]).toBe('ice');
    expect(grid[map.base.row][map.base.col]).toBe('volcanic');
    expect(grid[ARENA.buildRow - 1][0]).toBe('ice');
    expect(grid[ARENA.buildRow][0]).toBe('desert');
    expect(grid[ARENA.baseRow - 2][0]).toBe('desert');
    expect(grid[ARENA.baseRow - 1][0]).toBe('volcanic');
  });

  it('makes the road travel from the snowfield into the caldera', () => {
    const route = shortestPath(map);
    const visited = new Set(route.map((cell) => grid[cell.row][cell.col]));
    for (const theme of ['ice', 'desert', 'volcanic']) {
      expect(visited.has(theme), `the road never reaches the ${theme} band`).toBe(true);
    }
  });

  it('decodes biome letters to themes and ignores maps without an overlay', () => {
    expect(BIOME_THEME.i).toBe('ice');
    expect(BIOME_THEME.d).toBe('desert');
    expect(BIOME_THEME.v).toBe('volcanic');
    expect(BIOME_THEME.c).toBe('crystal');
    expect(getMapBiomes('grassland')).toBeNull();
    expect(getMapBiomes('nope')).toBeNull();
  });
});
