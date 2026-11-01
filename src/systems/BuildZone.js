/**
 * Build-zone rules — where a defence may stand.
 *
 * The board is a **base-defence field** (see `data/arenaLayout.js`): the enemy's
 * ground along the top, the player's field around the keep at the bottom. Those
 * two halves are not just painted differently, they are the rule:
 *
 *   1. **The field only.** A defence may be raised anywhere in the five rows
 *      around the bastion (`buildRow` … `baseRow`) and nowhere above them. The
 *      enemy's ground belongs to the horde; a keep standing in the muster ground
 *      would be shooting at a road nobody has walked yet.
 *   2. **Never on the path.** The road is the lane the horde walks. Keeps stand
 *      on the grass beside it, never on it. The one exception is the palisade,
 *      which is *by design* a road object (that is what a wall is), and it may
 *      only be planted inside the field too.
 *   3. **Leave the gate room.** The bastion's own tile and the ring of tiles
 *      touching it stay clear, so the keep art never buries a tower and the
 *      assault ring has somewhere to stand.
 *
 * There are **no designated pads** any more. A cell is legal when it is inside
 * the field, on grass, and away from the gates — three sentences a player can
 * read straight off the screen.
 */

/** Chebyshev distance around the bastion that is kept clear, in tiles. */
export const BASE_CLEARANCE = 1;

export const BUILD_ZONE_REASONS = Object.freeze({
  'enemy-half': 'Outside the defence field — build between the road line and the bastion',
  'road-tile': 'That is the lane — keeps stand on the grass beside it',
  'spawn-zone': 'That is the portal landing ground — the horde spawns here',
  'base-zone': 'That is the bastion plaza — leave the gate room',
  'blocked-tile': 'Rocks and water cannot be built on',
  'needs-road': 'Barricades must be placed on the road',
  endpoint: 'Cannot block the spawn portal or the base',
  'off-route': 'No enemies march through this tile',
});

/** Chebyshev distance in tiles. */
export function tileDistance(a, b) {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/** Every ground portal on the board (older data may still carry one). */
export function spawnPoints(map) {
  if (Array.isArray(map?.spawns) && map.spawns.length) return map.spawns;
  return map?.spawn ? [map.spawn] : [];
}

/**
 * The rectangle a defence may be raised in, derived from the board itself.
 *
 * Rows run from the first field row to the bastion's own row; columns leave one
 * cell of grass inside the rock wall on either side. Nothing is hand-listed per
 * map, so a layout change can never leave the rule pointing at ground the player
 * cannot see.
 *
 * @param {{rows?:number, cols?:number, buildRow?:number, base?:{row:number}}} map
 */
export function buildBounds(map) {
  const cols = map?.cols ?? 32;
  const rows = map?.rows ?? 12;
  const rowMin = Number.isFinite(map?.buildRow) ? map.buildRow : 5;
  const rowMax = Math.min(rows - 2, map?.base?.row ?? rows - 2);
  return { rowMin, rowMax, colMin: 2, colMax: cols - 3 };
}

/**
 * Which row first belongs to the player. Kept as a named export because older
 * callers ask for it by that name; the field starts one row under the enemy's
 * last road row, straight from the board.
 */
export function playerRow(map) {
  return buildBounds(map).rowMin;
}

/** Is this cell on our side of the field line? */
export function onPlayerGround(cell, map) {
  const bounds = buildBounds(map);
  return (
    cell.row >= bounds.rowMin &&
    cell.row <= bounds.rowMax &&
    cell.col >= bounds.colMin &&
    cell.col <= bounds.colMax
  );
}

/**
 * @param {{row:number, col:number}} cell
 * @param {{spawns?:Array, spawn?:{row:number,col:number}, base:{row:number,col:number}}} map
 * @returns {null | 'spawn-zone' | 'enemy-half' | 'base-zone'}
 */
export function zoneBlock(cell, map) {
  // The portal rings are checked first so the player is told the most specific
  // truth: those tiles are the muster ground, not merely "outside the field".
  for (const spawn of spawnPoints(map)) {
    if (tileDistance(cell, spawn) <= 2) return 'spawn-zone';
  }
  if (!onPlayerGround(cell, map)) return 'enemy-half';
  if (map?.base && tileDistance(cell, map.base) <= BASE_CLEARANCE) return 'base-zone';
  return null;
}

/**
 * Is this cell inside the build field? Terrain (water, rock, the road) is
 * checked by the caller.
 *
 * @param {{row:number,col:number}} cell
 * @param {object} map
 */
export function isFreeBuildCell(cell, map) {
  return zoneBlock(cell, map) === null;
}
