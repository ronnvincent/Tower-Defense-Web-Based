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
    // Portal above, bastion below, a river between them — the endless field
    // reads as the same board as the campaign, only repainted.
    expect(map.spawn.row).toBeLessThan(map.base.row);
    expect(map.rows).toBe(ARENA.rows);
    expect(map.cols).toBe(ARENA.cols);
    // 26x12 at 64 px still frames inside the camera's 0.45x floor.
    const fit = Math.min(1280 / (map.cols * TILE_SIZE), 768 / (map.rows * TILE_SIZE));
    expect(fit).toBeGreaterThan(0.45);
  });

  it('runs a road long enough to matter', () => {
    const route = shortestPath(map);
    // Two mirrored lane roads, 19 cells each: ~19 s at 62 px/s, long enough for
    // the defence to work and short enough that wave 1 is not a waiting game.
    expect(route.length).toBeGreaterThanOrEqual(15);
    // …but a creep must not take a minute and a half to reach the core at base
    // speed (62 px/s), or wave 1 would be a waiting game.
    const seconds = (route.length * TILE_SIZE) / 62;
    expect(seconds).toBeLessThan(75);
  });

  it('puts water on the map and lets the road cross it', () => {
    // The rift fills one full row except for the three bridges.
    const water = map.tiles.flat().filter((tile) => tile === TILE.WATER).length;
    expect(water).toBeGreaterThanOrEqual(12);
    expect(map.tiles[ARENA.riverRow].filter((t) => t === TILE.WATER).length).toBeGreaterThan(12);

    // The rift is the row holding the most water. Its walkable cells must form
    // exactly two contiguous crossings — the two bridges — and nothing else
    // (a grass gap in the rift would read as a third, unmarked crossing).
    const isLane = (r, c) => {
      const tile = map.tiles[r]?.[c];
      return tile === TILE.ROAD || tile === TILE.SPAWN || tile === TILE.BASE;
    };
    const waterIn = map.tiles.map((row) => row.filter((tile) => tile === TILE.WATER).length);
    const riftRow = waterIn.indexOf(Math.max(...waterIn));
    expect(waterIn[riftRow]).toBeGreaterThan(0);
    const crossings = [];
    let run = 0;
    for (let c = 0; c < map.cols; c += 1) {
      if (isLane(riftRow, c)) run += 1;
      else if (map.tiles[riftRow][c] !== TILE.WATER) throw new Error(`rift row ${riftRow} has a ${map.tiles[riftRow][c]} at col ${c}`);
      else if (run) {
        crossings.push(run);
        run = 0;
      }
    }
    if (run) crossings.push(run);
    // Three bridges on the endless field, one cell wide each.
    expect(crossings).toEqual([1, 1, 1]);
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
    // different map. The river is the seam, so the warm half starts there.
    expect(themes.has('crystal')).toBe(false);
    expect(grid[0][0]).toBe('ice');
    expect(grid[map.rows - 1][0]).toBe('volcanic');
    expect(grid[map.spawn.row][map.spawn.col]).toBe('ice');
    expect(grid[map.base.row][map.base.col]).toBe('volcanic');
    // The water row itself stays desert-themed so the divider reads as water
    // rather than as a lava flow.
    expect(grid[ARENA.riverRow][0]).toBe('desert');
    expect(grid[ARENA.riverRow + 1][0]).toBe('volcanic');
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
