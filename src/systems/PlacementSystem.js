import { cellKey } from '../dsa/Graph.js';
import { TILE } from '../data/mapData.js';
import { zoneBlock, onPlayerGround } from './BuildZone.js';

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
  'max-towers': 'Every build point is taken — sell a keep to raise another',
  'enemy-on-tile': 'An enemy is on this tile',
  'off-route': 'No enemies march through this tile',
  'not-a-slot': 'Keeps stand on the marked pads — pick a ring',
  'enemy-half': 'The far bank is the horde’s ground — build on our side of the river',
  'spawn-zone': 'That is the portal landing ground — the horde spawns here',
  'base-zone': 'That is the bastion plaza — leave the gate room',
  'no-route': 'That keep would seal the only road to the bastion',
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
   * @param {{route?: Set<string>}} [options] `route` = cells the horde actually marches
   * @returns {{ok:boolean, reason:string|null}}
   */
  validate(definition, row, col, coins, options = {}) {
    if (!this.inBounds(row, col)) return fail('out-of-bounds');
    const type = this.map.tiles[row][col];

    if (definition.placement === 'road') {
      // A palisade is a road object: it is dropped on the lane the horde walks,
      // and only on our side of the river — a wall on the far bank would be met
      // before the horde has even crossed, which is not what the card promises.
      if (type === TILE.SPAWN || type === TILE.BASE) return fail('endpoint');
      if (type !== TILE.ROAD) return fail('needs-road');
      if (!onPlayerGround({ row, col }, this.map)) return fail('enemy-half');
      if (options.route && !options.route.has(cellKey(row, col))) return fail('off-route');
    } else {
      // Keeps stand on the grass **beside** the lane. Not on the lane: the road
      // is the path the horde walks, and a tower dropped on it either rerouted
      // the whole wave or — worse — sat in the monsters' way and never fired.
      if (type !== TILE.GRASS) return fail(type === TILE.ROAD ? 'road-tile' : 'blocked-tile');
      const zone = zoneBlock({ row, col }, this.map);
      if (zone) return fail(zone);
    }

    if (this.isOccupied(row, col)) return fail('occupied');
    if (coins < definition.cost) return fail('no-coins');
    return { ok: true, reason: null };
  }
}

function fail(reason) {
  return { ok: false, reason };
}
