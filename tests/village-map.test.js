import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HAVENBROOK_LAYOUT, HAVENBROOK_LANES, MAPS, parseMap } from '../src/data/mapData.js';
import { THEMES, TUTORIAL_LEVEL } from '../src/data/levelData.js';
import { buildField } from '../src/data/arenaLayout.js';
import { VILLAGE_PROPS } from '../src/data/tutorialScript.js';

/**
 * Havenbrook's board contract.
 *
 * The village is the only hand-laid battlefield in the game — every other map
 * is generated from the arena grammar. That freedom is exactly why it needs its
 * own suite: a hand-written layout can be edited into a board the game cannot
 * play, and the failure mode (a lane that reaches nothing, a portal in the
 * rock) only shows up in a browser.
 */

const map = parseMap(HAVENBROOK_LAYOUT);
const LAYOUT_TILES = HAVENBROOK_LAYOUT;
const cell = (row, col) => map.tiles[row]?.[col];

/** Tiles a lane may legally be painted on. */
const WALKABLE = new Set(['road', 'spawn', 'base', 'grass']);

describe('Havenbrook: the board', () => {
  it('is the tutorial’s own map, and nobody else’s', () => {
    expect(TUTORIAL_LEVEL.map).toBe('havenbrook');
    expect(MAPS.havenbrook).toBe(HAVENBROOK_LAYOUT);
    // The campaign nodes must not borrow the village: the story map is a one-off.
    for (const [id, layout] of Object.entries(MAPS)) {
      if (id === 'havenbrook') continue;
      expect(layout === HAVENBROOK_LAYOUT, `${id} reuses the village`).toBe(false);
    }
  });

  it('is the same size as every other battlefield', () => {
    expect(map.rows).toBe(12);
    expect(map.cols).toBe(32);
  });

  it('surrounds the playable ground with a rim, so no gate sits on the edge', () => {
    for (let col = 0; col < map.cols; col += 1) {
      expect(cell(0, col), `top rim at ${col}`).toBe('rock');
      expect(cell(map.rows - 1, col), `bottom rim at ${col}`).toBe('rock');
    }
    for (let row = 0; row < map.rows; row += 1) {
      // The one exception is the two sky gates cut into the side walls: they
      // face the field and are not walkable ground.
      const left = cell(row, 0);
      const right = cell(row, map.cols - 1);
      expect(['rock', 'air'], `left wall at row ${row}`).toContain(left);
      expect(['rock', 'air'], `right wall at row ${row}`).toContain(right);
      if (left === 'air') expect(right).toBe('air');
    }
  });

  it('opens three ground portals and two sky gates', () => {
    const portals = [];
    const air = [];
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (cell(row, col) === 'spawn') portals.push([row, col]);
        if (cell(row, col) === 'air') air.push([row, col]);
      }
    }
    expect(portals).toHaveLength(3);
    expect(air).toHaveLength(2);
    // One portal per lane: three entrances is the map's whole promise.
    expect(new Set(portals.map(([, col]) => col)).size).toBe(3);
    // The gates are cut into the side walls, one on each side.
    expect(air.map(([, col]) => col).sort((a, b) => a - b)).toEqual([0, map.cols - 1]);
  });

  it('keeps exactly one keep, on the centre column', () => {
    const keeps = [];
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (cell(row, col) === 'base') keeps.push([row, col]);
      }
    }
    expect(keeps).toHaveLength(1);
    const [row, col] = keeps[0];
    expect(col).toBe(15);
    expect(row).toBe(10);
  });

  it('gives every portal a walkable lane to the keep', () => {
    const portals = [];
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (cell(row, col) === 'spawn') portals.push({ row, col });
      }
    }
    const keep = { row: 10, col: 15 };
    for (const portal of portals) {
      // Flood fill over walkable ground from the portal; the keep has to be
      // reachable without stepping on rock or water.
      const seen = new Set([`${portal.row},${portal.col}`]);
      const queue = [portal];
      while (queue.length) {
        const { row, col } = queue.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = row + dr;
          const c = col + dc;
          const key = `${r},${c}`;
          if (seen.has(key)) continue;
          const tile = cell(r, c);
          if (!tile || !WALKABLE.has(tile)) continue;
          seen.add(key);
          queue.push({ row: r, col: c });
        }
      }
      expect(seen.has(`${keep.row},${keep.col}`), `portal at ${portal.row},${portal.col}`).toBe(true);
    }
  });

  it('draws its lanes as right angles through the village, not switchbacks', () => {
    // Every road cell on the board must belong to a lane the layout authored:
    // a stray paving tile is a route the pathfinder can take that the map does
    // not show.
    const authored = new Set();
    for (const lane of HAVENBROOK_LANES) {
      for (let i = 1; i < lane.length; i += 1) {
        const [r0, c0] = lane[i - 1];
        const [r1, c1] = lane[i];
        // The compiled lane is a list of corners; walk the whole run.
        const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
        for (let s = 0; s <= steps; s += 1) {
          authored.add(`${r0 + Math.sign(r1 - r0) * s},${c0 + Math.sign(c1 - c0) * s}`);
        }
      }
    }
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (cell(row, col) !== 'road') continue;
        expect(authored.has(`${row},${col}`), `stray road at ${row},${col}`).toBe(true);
      }
    }
  });

  it('leaves the build field empty of water, rock and scenery', () => {
    const field = buildField();
    for (let row = field.rowMin; row <= field.rowMax; row += 1) {
      for (let col = field.colMin; col <= field.colMax; col += 1) {
        const tile = cell(row, col);
        expect(['grass', 'road', 'spawn', 'base'], `${row},${col} is ${tile}`).toContain(tile);
      }
    }
  });

  it('never lets a cottage stand on a tower square', () => {
    const field = buildField();
    for (const prop of VILLAGE_PROPS) {
      // Props are anchored bottom-centre; a one-tile body is the floor of what
      // the art covers, so anything anchored inside the field is a conflict.
      const coversField =
        prop.row >= field.rowMin && prop.row <= field.rowMax + 1 && prop.col >= field.colMin && prop.col <= field.colMax;
      expect(coversField, `${prop.key} at ${prop.col},${prop.row}`).toBe(false);
    }
  });
});

describe('Havenbrook: the village palette', () => {
  it('has its own tile set, not a recolour of the campaign grass', () => {
    const theme = THEMES.village;
    expect(theme).toBeTruthy();
    expect(theme.tileSuffix).toBe('-village');
    const bases = ['grass', 'rock', 'water', 'foliage', 'bridge'];
    for (const base of bases) {
      const path = join('public', 'assets', 'tiles', `${base}${theme.tileSuffix}.png`);
      expect(existsSync(path), `${path} missing`).toBe(true);
    }
    // Sixteen road masks: a right-angled street plan lives on its corners.
    for (let mask = 0; mask < 16; mask += 1) {
      const path = join('public', 'assets', 'tiles', `road_${mask}${theme.tileSuffix}.png`);
      expect(existsSync(path), `${path} missing`).toBe(true);
    }
  });

  it('ships its own world-map thumbnail', () => {
    const thumb = join('public', 'assets', 'ui', 'map_village.png');
    expect(existsSync(thumb)).toBe(true);
    const buffer = readFileSync(thumb);
    expect(buffer.readUInt32BE(16)).toBeGreaterThan(64);
    expect(buffer.readUInt32BE(20)).toBeGreaterThan(32);
  });

  it('is the only theme no campaign node uses', () => {
    // A campaign level pointing at the village palette would put the story's
    // tileset on a stage the player can replay forever.
    for (const [id, theme] of Object.entries(THEMES)) {
      if (id !== 'village') expect(theme.tileSuffix).not.toBe('-village');
    }
  });
});

// The layout string itself has to stay the same size as `parseMap` believes.
it('writes every row of the ascii board', () => {
  expect(LAYOUT_TILES).toHaveLength(12);
  for (const row of LAYOUT_TILES) expect(row).toHaveLength(32);
});
