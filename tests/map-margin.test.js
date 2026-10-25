import { describe, it, expect } from 'vitest';
import { MAPS, parseMap } from '../src/data/mapData.js';
import { PVP_ARENAS } from '../src/data/pvpArenas.js';
import { TILE_SIZE } from '../src/config/gameConfig.js';

/**
 * Map margin contract.
 *
 * The spawn portal is a 96 px sprite and the core platform an 80 px one, both
 * centred on a 64 px tile. When a gate sits on the outermost tile of the map,
 * half of that art is outside the camera bounds — the player sees a portal cut
 * in half against the edge of the screen and cannot tell where the horde enters
 * or which crystal has to survive. Every gate therefore keeps at least one full
 * tile of terrain between its own tile and the edge of the battlefield; on
 * screen that terrain *is* the margin around the map.
 *
 * The top bar and the dock are the second half of the story. Both span the
 * battlefield, so a gate in the top or bottom band is hidden behind chrome even
 * when it is technically inside the map. Gates therefore keep **two** rows of
 * margin from the top and the bottom, and one column from the sides.
 *
 * These tests are the reason the layouts may not be hand-tweaked back onto the
 * edge: they re-derive the rule from the ASCII for the campaign and the duel
 * arenas both.
 */

/** Half the width of the spawn portal art (`TextureFactory` draws it 96 wide). */
const PORTAL_HALF_PX = 48;

// `MAPS` already contains the default grassland layout under its own id.
const BATTLEFIELDS = [
  ...Object.entries(MAPS).map(([id, layout]) => [`campaign:${id}`, layout]),
  ...PVP_ARENAS.map((arena) => [`arena:${arena.id}`, arena.layout]),
];

/** Tiles between a gate and the nearest edge of the map. 0 means "flush". */
const edgeTileClearance = (map, cell) =>
  Math.min(cell.row, cell.col, map.rows - 1 - cell.row, map.cols - 1 - cell.col);

/** Horizontal margin only — the sides carry no HUD chrome. */
const sideTileClearance = (map, cell) => Math.min(cell.col, map.cols - 1 - cell.col);

/** Vertical margin — must clear the top bar and the forge dock. */
const verticalTileClearance = (map, cell) => Math.min(cell.row, map.rows - 1 - cell.row);

/** Pixels between the centre of a gate tile and the nearest world edge. */
const edgePixelClearance = (map, cell) => edgeTileClearance(map, cell) * TILE_SIZE + TILE_SIZE / 2;

describe('battlefield margins', () => {
  it('covers the campaign maps, the War Room battlefields and every duel arena', () => {
    expect(BATTLEFIELDS).toHaveLength(18);
  });

  it('never parks a spawn or a base on the outermost ring', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const map = parseMap(layout);
      for (const gate of ['spawn', 'base']) {
        const cell = map[gate];
        expect(
          edgeTileClearance(map, cell),
          `${name} ${gate} at ${cell.row},${cell.col} touches the edge of a ${map.rows}x${map.cols} map`
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps both gates out from under the top bar and the dock', () => {
    // Two rows of grass plus the gate tile itself is what the HUD needs before
    // the gate stops being buried: the top bar reaches ~1.7 tiles into the map
    // on a landscape phone, the dock ~2.3.
    for (const [name, layout] of BATTLEFIELDS) {
      const map = parseMap(layout);
      for (const gate of ['spawn', 'base']) {
        expect(
          verticalTileClearance(map, map[gate]),
          `${name} ${gate} at row ${map[gate].row} is in the top/bottom HUD band`
        ).toBeGreaterThanOrEqual(2);
        expect(sideTileClearance(map, map[gate]), `${name} ${gate} touches a side`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('leaves the whole portal sprite inside the camera bounds', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const map = parseMap(layout);
      for (const gate of ['spawn', 'base']) {
        const clearance = edgePixelClearance(map, map[gate]);
        expect(clearance, `${name} ${gate} art would be clipped (${clearance}px of margin)`).toBeGreaterThanOrEqual(
          PORTAL_HALF_PX
        );
      }
    }
  });

  it('gives the rivals mirrored margins — the inset arena stays 180° symmetric', () => {
    for (const arena of PVP_ARENAS) {
      const map = parseMap(arena.layout);
      const { spawn, base } = map;
      expect(spawn.row + base.row, `${arena.id} gate rows`).toBe(map.rows - 1);
      expect(spawn.col + base.col, `${arena.id} gate columns`).toBe(map.cols - 1);
      expect(edgeTileClearance(map, spawn)).toBe(edgeTileClearance(map, base));
    }
  });

  it('keeps the gates on the road network, so the margin never cuts the route', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const map = parseMap(layout);
      // The tile right behind a gate may be anything, but the tile the horde
      // steps onto next has to be road: a gate floating on grass would strand
      // the wave queue.
      const around = [
        [map.spawn.row - 1, map.spawn.col],
        [map.spawn.row + 1, map.spawn.col],
        [map.spawn.row, map.spawn.col - 1],
        [map.spawn.row, map.spawn.col + 1],
      ].filter(([r, c]) => r >= 0 && r < map.rows && c >= 0 && c < map.cols);
      const roads = around.filter(([r, c]) => map.tiles[r][c] === 'road');
      expect(roads.length, `${name} spawn has no road neighbour`).toBeGreaterThanOrEqual(1);

      const baseAround = [
        [map.base.row - 1, map.base.col],
        [map.base.row + 1, map.base.col],
        [map.base.row, map.base.col - 1],
        [map.base.row, map.base.col + 1],
      ].filter(([r, c]) => r >= 0 && r < map.rows && c >= 0 && c < map.cols);
      expect(
        baseAround.filter(([r, c]) => map.tiles[r][c] === 'road').length,
        `${name} base has no road neighbour`
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
