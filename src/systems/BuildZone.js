/**
 * Build-zone rules — where a defence may stand.
 *
 * The board is split horizontally by a river (see `data/arenaLayout.js`): the
 * enemy half is above it, our half below. Those two halves are not just painted
 * differently, they are the rule:
 *
 *   1. **Our half only.** A defence may only be raised on the player's side of
 *      the river — the rows from `playerRow` down. The enemy half belongs to the
 *      horde; a keep standing in the muster ground would be shooting at a road
 *      nobody has walked yet, and it would put the build cursor somewhere the
 *      player cannot defend.
 *   2. **Never on the path.** The road is the lane the horde walks. Keeps stand
 *      on the grass beside it, never on it — a tower dropped on the lane used to
 *      reroute the whole wave, which read as the monsters politely walking
 *      around your mistake. The one exception is the palisade, which is *by
 *      design* a road object (that is what a wall is), and it may only be
 *      planted inside our half too.
 *   3. **Leave the gate room.** The bastion's own tile and the ring of tiles
 *      touching it stay clear, so the keep art never buries a tower and the
 *      assault ring has somewhere to stand.
 *
 * Everything is a terrain rule a player can read off the screen: water, rock,
 * the river, the road, the gate.
 */

/** Chebyshev distance around the bastion that is kept clear, in tiles. */
export const BASE_CLEARANCE = 1;

export const BUILD_ZONE_REASONS = Object.freeze({
  'enemy-half': 'The far bank is the horde’s ground — build on our side of the river',
  'road-tile': 'That is the lane — keeps stand on the grass beside it',
  'spawn-zone': 'That is the portal landing ground — the horde spawns here',
  'base-zone': 'That is the bastion plaza — leave the gate room',
  'blocked-tile': 'Rocks and water cannot be built on',
  'needs-road': 'Barricades must be placed on the road',
  'endpoint': 'Cannot block the spawn portal or the base',
  'off-route': 'No enemies march through this tile',
});

/** Chebyshev distance in tiles. */
export function tileDistance(a, b) {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/**
 * Which row first belongs to the player. Derived from the map itself (the
 * river row is the last water row that runs the full width), so a layout change
 * can never desynchronise the build rule from the picture on screen.
 *
 * @param {{rows:number, cols:number, tiles:string[][]}} map
 * @param {number} [riverRow] explicit override from the arena grammar
 */
export function playerRow(map, riverRow) {
  if (Number.isFinite(riverRow)) return riverRow + 1;
  if (!map?.tiles?.length) return 0;
  for (let r = 0; r < map.rows; r += 1) {
    const row = map.tiles[r];
    if (row.filter((tile) => tile === 'water').length >= Math.max(3, Math.floor(map.cols * 0.6))) {
      return r + 1;
    }
  }
  return 0;
}

/** Is this cell on our side of the river? */
export function onPlayerGround(cell, map) {
  return cell.row >= playerRow(map, map?.riverRow);
}

/**
 * @param {{row:number, col:number}} cell
 * @param {{spawn:{row:number,col:number}, base:{row:number,col:number}}} map
 * @returns {null | 'spawn-zone' | 'base-zone' | 'enemy-half'}
 */
export function zoneBlock(cell, map) {
  // The portal ring is checked first so the player is told the most specific
  // truth: those tiles are the muster ground, not merely "the far bank". (Both
  // reasons are real; the half rule is the one that covers the rest.)
  if (map?.spawn && tileDistance(cell, map.spawn) <= 2) return 'spawn-zone';
  if (!onPlayerGround(cell, map)) return 'enemy-half';
  if (map?.base && tileDistance(cell, map.base) <= BASE_CLEARANCE) return 'base-zone';
  return null;
}

/**
 * Is this cell inside the build field? Terrain (water, rock, the road) is
 * checked by the caller.
 *
 * @param {{row:number,col:number}} cell
 * @param {{spawn:{row:number,col:number}, base:{row:number,col:number}}} map
 */
export function isFreeBuildCell(cell, map) {
  return zoneBlock(cell, map) === null;
}
