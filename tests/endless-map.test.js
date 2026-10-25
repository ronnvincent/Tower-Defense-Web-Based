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
import { TILE_SIZE } from '../src/config/gameConfig.js';
import { THEMES } from '../src/data/levelData.js';

/**
 * The Convergence — the endless battlefield.
 *
 * Two complaints drove this map: the horde was fighting in a shoebox, and the
 * caldera was one flat colour. So it is 28×18 (twice a campaign map), it carries
 * three roads of 33-39 cells each rather than one 54-cell snake, and its ground
 * is painted from four tile sets at once: snowfield, dunes, caldera and the
 * crystal dais under the core.
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
  it('is more than twice the area of a campaign map', () => {
    const campaign = parseMap(MAP_LAYOUT);
    expect(map.cols).toBe(28);
    expect(map.rows).toBe(18);
    expect(map.rows * map.cols).toBeGreaterThanOrEqual(2 * campaign.rows * campaign.cols);
    // 28x18 at 64 px still frames inside the camera's 0.45x floor.
    const fit = Math.min(1280 / (map.cols * TILE_SIZE), 768 / (map.rows * TILE_SIZE));
    expect(fit).toBeGreaterThan(0.45);
  });

  it('runs a road long enough to matter', () => {
    const route = shortestPath(map);
    // Three lanes of 33-39 cells replaced one 54-cell snake: the shortest walk
    // is shorter, but the horde that used to queue on a single road now picks
    // one of three. 30 cells is still ~30 s at creep speed, not a stroll.
    expect(route.length).toBeGreaterThan(30);
    // …but a creep must not take a minute and a half to reach the core at base
    // speed (62 px/s), or wave 1 would be a waiting game.
    const seconds = (route.length * TILE_SIZE) / 62;
    expect(seconds).toBeLessThan(75);
  });

  it('puts water on the map and lets the road cross it', () => {
    const water = map.tiles.flat().filter((tile) => tile === TILE.WATER).length;
    expect(water).toBeGreaterThan(20);

    const isWater = (r, c) => map.tiles[r]?.[c] === TILE.WATER;
    const isLane = (r, c) => {
      const tile = map.tiles[r]?.[c];
      return tile === TILE.ROAD || tile === TILE.SPAWN || tile === TILE.BASE;
    };
    let bridges = 0;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (!isLane(r, c)) continue;
        const across = (isWater(r, c - 1) && isWater(r, c + 1)) || (isWater(r - 1, c) && isWater(r + 1, c));
        if (across) bridges += 1;
      }
    }
    expect(bridges).toBeGreaterThanOrEqual(2);
  });
});

describe('four biomes on one battlefield', () => {
  const grid = getMapBiomes('volcanic');

  it('ships a biome grid that matches the layout', () => {
    expect(grid).toBeTruthy();
    expect(grid.length).toBe(map.rows);
    for (const row of grid) expect(row.length).toBe(map.cols);
    expect(MAP_BIOMES.volcanic).toHaveLength(map.rows);
  });

  it('paints snow, sand, fire and crystal, in that order down the map', () => {
    const themes = new Set(grid.flat());
    for (const theme of ['ice', 'desert', 'volcanic', 'crystal']) {
      expect(themes.has(theme), `${theme} is missing`).toBe(true);
      // Every biome it uses must own a real generated tile set.
      expect(THEMES[theme], `${theme} has no theme entry`).toBeTruthy();
    }
    expect(grid[0][0]).toBe('ice');
    expect(grid[map.rows - 1][0]).toBe('volcanic');
    // The core sits on the crystal dais, the gate in the snowfield.
    expect(grid[map.base.row][map.base.col]).toBe('crystal');
    expect(grid[map.spawn.row][map.spawn.col]).toBe('ice');
  });

  it('makes the road travel through every biome', () => {
    const route = shortestPath(map);
    const visited = new Set(route.map((cell) => grid[cell.row][cell.col]));
    for (const theme of ['ice', 'desert', 'volcanic', 'crystal']) {
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
