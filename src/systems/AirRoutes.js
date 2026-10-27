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
 * The three mouths a flyer can enter from.
 *
 * Spread wide on purpose: the bastion column, the portal column and the middle
 * of the board. A single-column sky would make every anti-air tower a clone of
 * the one next to it, because the same three cells would cover every wave.
 */
export function airMouths(map) {
  const cols = map.cols || map.tiles?.[0]?.length || 0;
  if (!cols) return [];
  const portal = map.spawn?.col ?? Math.floor(cols / 2);
  const bastion = map.base?.col ?? Math.floor(cols / 2);
  const middle = Math.floor((portal + bastion) / 2);
  // A board whose portal and bastion share a column (level 2 runs straight down
  // the middle) would otherwise get a single sky lane, and one lane means one
  // anti-air tower covers every flyer in the run. The offsets below guarantee a
  // left / middle / right choice on every board.
  const candidates = [portal, middle, bastion, portal - 5, portal + 5, middle - 8, middle + 8];
  const seen = new Set();
  const mouths = [];
  for (const col of candidates) {
    if (mouths.length >= 3) break;
    const c = clampCol(col, cols);
    if (seen.has(c)) continue;
    seen.add(c);
    mouths.push(c);
  }
  return mouths;
}

/**
 * Build the sky lanes for one board.
 *
 * @param {{rows:number, cols:number, spawn:{row,col}, base:{row,col}}} map
 * @param {{mouthRow?:number, bendRow?:number}} [options]
 * @returns {{ lanes: string[][], mouths: number[], laneAt: (index:number)=>string[] }}
 */
export function buildAirRoutes(map, options = {}) {
  const rows = map.rows || map.tiles?.length || 0;
  const cols = map.cols || map.tiles?.[0]?.length || 0;
  const base = { row: map.base?.row ?? rows - 3, col: map.base?.col ?? Math.floor(cols / 2) };
  // Flyers cross the top rim: one row above the portal, which is where the
  // spawner's own ground lanes begin, so both arrive "from the north".
  const mouthRow = Math.max(0, Math.min(rows - 2, options.mouthRow ?? 1));
  // The bend is the row where the sky lane turns toward the bastion. Halfway
  // down is late enough to stay wide over the river and early enough to give a
  // ground player time to swing a tower around.
  const bendRow = Math.max(mouthRow + 1, Math.min(base.row - 1, options.bendRow ?? Math.round((mouthRow + base.row) / 2)));

  const mouths = airMouths(map);
  const lanes = mouths.map((col) => {
    const mouth = { row: mouthRow, col };
    const bend = { row: bendRow, col };
    const approach = { row: Math.max(bend.row, base.row - 1), col: base.col };
    if (approach.row === base.row) return dedupe([...flightCells(mouth, bend), ...flightCells(bend, base)]);
    return dedupe([...flightCells(mouth, bend), ...flightCells(bend, approach), ...flightCells(approach, base)]);
  });

  return {
    lanes,
    mouths,
    laneCount: lanes.length,
    /** Same rotation rule as the ground lanes: the wave ordinal picks the lane. */
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
