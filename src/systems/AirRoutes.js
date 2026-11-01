/**
 * AirRoutes — where the sky lanes run.
 *
 * The horde's ground roads are BFS lanes over the road tiles. A flyer does not
 * use them: it crosses the river, the ponds and the rocks, and it does not care
 * where the bridge is. Before this file, a wraith was only a creep with the
 * `flying` flag — it walked the same road as the grunts, just 22 px higher, so
 * "air route" was a piece of UI vocabulary with nothing behind it.
 *
 * Three sky lanes are derived from the board itself, deterministically:
 *
 *     mouth (top rim)  ── down ──┐
 *                                └── diagonal ──▶ bastion
 *
 * The mouths are spread across the width so a wave of flyers can arrive at the
 * left, the middle or the right of the map. The last two cells always run into
 * the bastion, which keeps the "reached the base" rule identical to the ground
 * lanes: the same `reachBase()` call, the same bastion damage interval.
 *
 * Everything here is pure geometry over `{ rows, cols, spawn, base }`, so the
 * duel seats and the headless tests derive byte-identical lanes.
 */

/** A cell key in the same `row,col` form the pathfinder uses. */
const key = (row, col) => `${row},${col}`;

/** Clamp a column to a cell that exists on the board. */
function clampCol(col, cols) {
  return Math.max(0, Math.min(cols - 1, Math.round(col)));
}

/**
 * The cells a straight flight passes through, ends included.
 *
 * Eight-connected steps: a diagonal move covers one row and one column, which
 * is how the creeps are drawn (three-quarter poses), and it keeps the number of
 * waypoints proportional to the distance instead of to the pixel gap.
 */
export function flightCells(from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const cells = [];
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    cells.push(key(Math.round(from.row + dr * t), Math.round(from.col + dc * t)));
  }
  return cells;
}

/** Drop repeats while keeping order — a pure vertical flight repeats nothing,
 *  but a clamped mouth can sit on the same column as the bend. */
function dedupe(cells) {
  const out = [];
  for (const cell of cells) if (cell !== out[out.length - 1]) out.push(cell);
  return out;
}

/**
 * The mouths a flyer can enter from.
 *
 * A base-defence board has **two sky gates** cut into the side walls — the one
 * place a road cannot reach — plus the central portal's own airspace, so a wave
 * of flyers can come in from the left, the middle or the right. Boards without
 * gates (older layouts, and the synthetic maps the tests build) fall back to
 * three spread columns across the top.
 */
export function airMouths(map) {
  const cols = map.cols || map.tiles?.[0]?.length || 0;
  if (!cols) return [];
  const gates = (Array.isArray(map.airGates) ? map.airGates : []).map((gate) => ({
    row: gate.row,
    col: gate.col,
  }));
  const axis = map.base?.col ?? Math.floor(cols / 2);
  const mouths = gates.slice(0, 2);
  // The central lane: a flyer can also come straight over the main portal.
  const centreRow = Number.isFinite(map.spawns?.[0]?.row) ? map.spawns[0].row : 1;
  mouths.push({ row: Math.max(0, centreRow), col: clampCol(axis, cols) });
  if (mouths.length >= 3) return mouths;
  // Fallback spread for a board with no gates at all.
  const portal = map.spawn?.col ?? Math.floor(cols / 2);
  const middle = Math.floor((portal + axis) / 2);
  for (const col of [portal, middle, portal - 6, portal + 6]) {
    if (mouths.length >= 3) break;
    const c = clampCol(col, cols);
    if (mouths.some((mouth) => mouth.col === c)) continue;
    mouths.push({ row: 1, col: c });
  }
  return mouths.slice(0, 3);
}

/**
 * Build the sky lanes for one board.
 *
 * @param {{rows:number, cols:number, spawns?:Array, spawn:{row,col}, airGates?:Array, base:{row,col}}} map
 * @param {{bendRow?:number}} [options]
 * @returns {{ lanes: string[][], mouths: number[], laneAt: (index:number)=>string[] }}
 */
export function buildAirRoutes(map, options = {}) {
  const rows = map.rows || map.tiles?.length || 0;
  const cols = map.cols || map.tiles?.[0]?.length || 0;
  const base = { row: map.base?.row ?? rows - 3, col: map.base?.col ?? Math.floor(cols / 2) };
  // The bend is the row where the sky lane turns onto the bastion column.
  // Halfway down is late enough to stay wide over the field and early enough to
  // give a ground player time to swing a tower around.
  const bendRow = Math.max(2, Math.min(base.row - 1, options.bendRow ?? Math.round((1 + base.row) / 2)));

  const mouths = airMouths(map);
  const lanes = mouths.map((mouth) => {
    const bend = { row: bendRow, col: base.col };
    const approach = { row: Math.max(bend.row, base.row - 1), col: base.col };
    if (approach.row === base.row) return dedupe([...flightCells(mouth, bend), ...flightCells(bend, base)]);
    return dedupe([...flightCells(mouth, bend), ...flightCells(bend, approach), ...flightCells(approach, base)]);
  });

  return {
    lanes,
    mouths: mouths.map((mouth) => mouth.col),
    laneCount: lanes.length,
    /** Same rotation rule as the ground lanes: the spawn ordinal picks the lane. */
    laneAt(index) {
      if (!lanes.length) return [];
      const safe = ((Math.floor(Number(index) || 0) % lanes.length) + lanes.length) % lanes.length;
      return lanes[safe];
    },
  };
}

/** Every cell any sky lane crosses — used by the minimap / debug overlay. */
export function airCells(routes) {
  const cells = new Set();
  for (const lane of routes?.lanes || []) for (const cell of lane) cells.add(cell);
  return cells;
}
