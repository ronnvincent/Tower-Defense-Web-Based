import { cellKey } from '../dsa/Graph.js';
import { TILE } from '../data/mapData.js';

/**
 * PlacementSystem — validates build requests and tracks tile occupancy.
 *
 * Occupancy is stored in a HASH MAP (JavaScript Map):
 *     key   "row,col"  →  value  the tower or barricade object on that tile
 * Checking whether a tile is free is therefore O(1) on average, instead of
 * scanning the whole towers array (O(n)) on every mouse move.
 */
export const PLACEMENT_ERRORS = {
  'out-of-bounds': 'Outside the battlefield',
  'blocked-tile': 'Rocks and water cannot be built on',
  'road-tile': 'Towers cannot be built on the road',
  'needs-road': 'Barricades must be placed on the road',
  endpoint: 'Cannot block the spawn portal or the base',
  occupied: 'This tile is already occupied',
  'no-coins': 'Not enough coins',
  'enemy-on-tile': 'An enemy is on this tile',
  'not-walkable': 'This road tile is not part of the path network',
  'unknown-type': 'Unknown defence',
  'game-over': 'The match is over',
};

export class PlacementSystem {
  /** @param {{rows:number, cols:number, tiles:string[][]}} map */
  constructor(map) {
    this.map = map;
    /** @type {Map<string, object>} */
    this.occupancy = new Map();
    this.lookups = 0; // number of O(1) occupancy checks performed
  }

  inBounds(row, col) {
    return row >= 0 && col >= 0 && row < this.map.rows && col < this.map.cols;
  }

  tileType(row, col) {
    return this.inBounds(row, col) ? this.map.tiles[row][col] : null;
  }

  isOccupied(row, col) {
    this.lookups++;
    return this.occupancy.has(cellKey(row, col));
  }

  getOccupant(row, col) {
    this.lookups++;
    return this.occupancy.get(cellKey(row, col)) ?? null;
  }

  occupy(row, col, object) {
    this.occupancy.set(cellKey(row, col), object);
  }

  release(row, col) {
    return this.occupancy.delete(cellKey(row, col));
  }

  /**
   * Validate the basic rules for building `definition` at (row, col).
   * GameScene layers the "no wall on top of a living enemy" rule on top of
   * this (see `GameScene.validateBuild`).
   *
   * @param {{cost:number, placement:'grass'|'road'}} definition
   * @param {number} coins player's current coins
   * @returns {{ok:boolean, reason:string|null}}
   */
  validate(definition, row, col, coins) {
    if (!this.inBounds(row, col)) return fail('out-of-bounds');
    const type = this.map.tiles[row][col];

    if (definition.placement === 'road') {
      if (type === TILE.SPAWN || type === TILE.BASE) return fail('endpoint');
      if (type !== TILE.ROAD) return fail('needs-road');
    } else {
      if (type === TILE.ROCK || type === TILE.WATER) return fail('blocked-tile');
      if (type !== TILE.GRASS) return fail('road-tile');
    }

    if (this.isOccupied(row, col)) return fail('occupied');
    if (coins < definition.cost) return fail('no-coins');
    return { ok: true, reason: null };
  }
}

function fail(reason) {
  return { ok: false, reason };
}
