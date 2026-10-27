/**
 * Bastion field — one battlefield grammar for every map in the game.
 *
 * THE BOARD
 * ---------
 * 32 columns x 12 rows of 64 px tiles. The layout is a **base-defence field**,
 * not a corridor: the horde comes at the bastion from three ground portals
 * along the top and two sky gates cut into the side walls, and every road winds
 * down into the one gate the bastion owns, off the middle of the bottom row.
 *
 *     ┌──────────────────────────────────────────────────┐
 *     │ 0  xxxxxxxxxxxxxxxx rim xxxxxxxxxxxxxxxxxxxxxx   │
 *     │ 1     S            S             S               │ ground portals
 *     │ 2  a                                          a  │ sky gates (side walls)
 *     │ 3     ##           ##           ##               │
 *     │ 4     ##           ##           ##               │ enemy ground
 *     ├──────────────────────────────────────────────────┤ ← the build line
 *     │ 5   ##            ##            ##    free field │
 *     │ 6   ##      free build field       ##            │
 *     │ 7   ##        around the bastion    ##           │
 *     │ 8    ##          ##           ##                 │
 *     │ 9      ##        B gate     ##                   │
 *     │ 10                B  bastion                      │
 *     │ 11 xxxxxxxxxxxxxxxx rim xxxxxxxxxxxxxxxxxxxxxx   │
 *     └──────────────────────────────────────────────────┘
 *
 * WHY THIS SHAPE
 * --------------
 *   · **The bastion is bottom-centre on every map.** One column (`axisCol`),
 *     one row (`baseRow`), one bottom rim under it. A stage never moves the
 *     keep again, so the player's eye learns one place to defend.
 *   · **Three ground portals** spread across the top, so a wave can arrive
 *     from the left, the middle or the right, and the roads that leave them
 *     wind before they converge.
 *   · **Two sky gates** in the side walls, where no road can reach: flyers
 *     come in over the wall and cross the field diagonally.
 *   · **Five open rows around the bastion.** No props, no pads, no invisible
 *     rules — every one of those tiles is a legal tower square, and the roads
 *     run through it.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * The old grammar was a river across the middle with two or three bridges and
 * a single portal: one direction of attack, and a hard seam that halved the
 * buildable ground. The river is gone (the ponds that survived are scenery
 * outside the field), the bridge count no longer decides how many lanes exist,
 * and the lane rule is now "one lane per portal" — see `fieldLanes`.
 *
 * ASCII legend (parsed by `parseMap` in mapData.js):
 *   S portal   a sky gate (air only)   B bastion   # road   . grass
 *   ~ pond     x rock / rim
 */

/** Fixed arena geometry. Cols is even so the axis column sits between two rims. */
export const ARENA = Object.freeze({
  cols: 32,
  rows: 12,
  /** Rim row above the portals — the visible margin at the top of the field. */
  rimRow: 0,
  /** Ground portals stand on this row, one row under the rim. */
  portalRow: 1,
  /** Sky gates are cut into the side walls on this row. */
  airRow: 2,
  /**
   * First row of the free build field. Above it is the enemy's ground; from
   * here down to the bastion is the player's — five rows of it, plus the gate.
   */
  buildRow: 5,
  /**
   * Bastion row. One rim row below it (row 11) and the whole field above it:
   * the keep's centre sits at 87.5 % of the world height, with a margin under
   * it so it never touches the edge.
   */
  baseRow: 10,
  /** Bottom rim — the margin that keeps the bastion off the edge. */
  rimRowBottom: 11,
  /** Centre column: the bastion always stands on it. */
  axisCol: 15,
  /** Columns of rock kept along each side wall, inside the rim. */
  buildInset: 2,
});

/**
 * A column authored as an offset from the centre axis.
 *
 * Every battlefield is written this way (`colAt(-9)`, not `col 6`) so widening
 * the arena moves every map at once instead of leaving a dozen hand-tuned
 * boards hugging the left edge of a wider field.
 */
export const colAt = (offset) => ARENA.axisCol + Math.round(offset);

/** Columns of rock around the rim — one cell of visible margin on every side. */
const GRASS = '.';
const ROAD = '#';
const WATER = '~';
const ROCK = 'x';
const AIR = 'a';

/** Characters a compiled lane may write over. */
const PAINTABLE = new Set([GRASS, ROAD]);

/** The default three ground portals, written as offsets from the axis. */
export const DEFAULT_SPAWN_OFFSETS = Object.freeze([-10, 0, 10]);

/** Clamp a column inside the rock rim. */
export function clampCol(col) {
  return Math.max(2, Math.min(ARENA.cols - 3, Math.round(col)));
}

/**
 * The rows and columns a defence may be raised on.
 *
 * Derived from the board itself rather than hand-listed, so a layout change can
 * never leave the build rule pointing at ground the player cannot see:
 *   rows  `buildRow` … `baseRow`      (the field around the keep, gate included)
 *   cols  `buildInset` … `cols-1-buildInset`
 */
export function buildField() {
  return {
    rowMin: ARENA.buildRow,
    rowMax: ARENA.baseRow,
    colMin: ARENA.buildInset,
    colMax: ARENA.cols - 1 - ARENA.buildInset,
  };
}

/** Is this cell inside the free-build field? (Terrain rules still apply.) */
export function inBuildField(row, col) {
  const field = buildField();
  return (
    row >= field.rowMin && row <= field.rowMax && col >= field.colMin && col <= field.colMax
  );
}

/**
 * Fill an orthogonal path between two cells, horizontal first.
 *
 * Only horizontal-then-vertical moves are generated: a diagonal "corner cut"
 * would make a road that touches cells corner-to-corner, which the grid graph
 * does not connect, and BFS would then report a lane that cannot be walked.
 *
 * @param {{row:number,col:number}} from
 * @param {{row:number,col:number}} to
 * @param {(row:number,col:number)=>void} emit
 */
function lineBetween(from, to, emit) {
  let { row, col } = from;
  while (col !== to.col) {
    col += Math.sign(to.col - col);
    emit(row, col);
  }
  while (row !== to.row) {
    row += Math.sign(to.row - row);
    emit(row, col);
  }
}

/**
 * Turn a list of `[row, col]` waypoints into the cells of one lane.
 *
 * @param {[number, number][]} waypoints
 * @returns {{row:number,col:number}[]} cells in walk order, no duplicates
 */
export function compileLane(waypoints) {
  const cells = [];
  const seen = new Set();
  const push = (row, col) => {
    const key = `${row},${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ row, col });
  };
  for (let i = 0; i < waypoints.length; i += 1) {
    const [row, col] = waypoints[i];
    if (i === 0) push(row, col);
    else {
      const [prevRow, prevCol] = waypoints[i - 1];
      lineBetween({ row: prevRow, col: prevCol }, { row, col }, push);
    }
  }
  return cells;
}

/**
 * One lane per ground portal.
 *
 * Each lane leaves its own portal, drops one row, and then **staircases** across
 * the field toward the keep: two columns sideways, one row down, twice over,
 * until it is a couple of columns off the gate. From there it runs straight
 * down and turns into the bastion on the gate row. The middle lane has no
 * staircase to walk — it is the straight avenue — so the board reads as three
 * approaches: one from each flank and one down the middle, all meeting at the
 * same gate.
 *
 * The shapes are deterministic on purpose — a replay, a duel seat and a test
 * must see the same battlefield — and per-map variety comes from `spawnCols`
 * and `wiggle`, never from a random number.
 *
 * @param {object} [spec]
 * @param {number[]} [spec.spawnCols] portal columns (default: three, ±10)
 * @param {number}   [spec.baseCol]   where the keep stands (default: the axis)
 * @param {number}   [spec.wiggle]    0-2, shifts the staircase so maps differ
 * @param {number}   [spec.approach]  columns between a flank lane and the gate
 * @returns {[number,number][][]} waypoint lists, one per portal
 */
export function fieldLanes({
  spawnCols = null,
  baseCol = ARENA.axisCol,
  wiggle = 0,
  approach = 2,
} = {}) {
  const { portalRow, baseRow } = ARENA;
  const base = clampCol(baseCol);
  const portals = (spawnCols?.length
    ? spawnCols
    : DEFAULT_SPAWN_OFFSETS.map((offset) => ARENA.axisCol + offset)
  ).map(clampCol);
  const gateRow = baseRow - 1; // the row every road turns in on
  const endRow = gateRow - 1; // where the staircase stops and runs straight
  const middle = (portals.length - 1) / 2;

  return portals.map((portal, index) => {
    // The column this lane comes down: the gate itself for the middle lane, a
    // couple of columns to the side for the flanks, so three roads arrive at the
    // keep from three directions instead of stacking on one line.
    const offset = (index - middle) * approach;
    const target = clampCol(base + Math.sign(offset) * Math.min(Math.abs(offset), approach));
    // Two columns per stair: one is a long shallow diagonal that crowds the
    // lane beside it, three is a jump the eye reads as a break in the road.
    const stepSize = 2;
    // `wiggle` only delays the first stair by a row, which is enough to make
    // two maps with the same portal spread look different.
    const stairStart = portalRow + 1 + (wiggle % 2);

    const points = [
      [portalRow, portal],
      [stairStart, portal],
    ];
    let row = stairStart;
    let col = portal;
    while (col !== target && row < endRow) {
      col += Math.sign(target - col) * Math.min(stepSize, Math.abs(target - col));
      row += 1;
      points.push([row, col]);
    }
    if (col !== target) points.push([endRow, target]);
    points.push([endRow, col === target ? target : col]);
    points.push([gateRow, target]);
    if (target !== base) points.push([gateRow, base]);
    points.push([baseRow, base]);
    return points;
  });
}

/**
 * Build one battlefield from its spec.
 *
 * @param {object} [spec]
 * @param {number[]} [spec.spawnCols] ground portal columns (three by default)
 * @param {number}   [spec.baseCol]   where the keep stands (default: the axis)
 * @param {number}   [spec.wiggle]    per-map road swing (0-2)
 * @param {number}   [spec.approach]  spacing of the three approach roads
 * @param {[number,number][][]} [spec.lanes] explicit waypoints, for a one-off board
 * @param {[number,number][]} [spec.rocks]   explicit rock cells (enemy ground only)
 * @param {[number,number][]} [spec.ponds]   explicit pond cells (enemy ground only)
 * @param {number[]} [spec.airCols]   side columns that get a sky gate
 * @param {boolean}  [spec.frame]     draw the rocky rim (default true)
 * @returns {string[]} rows of map characters
 */
export function buildArena(spec = {}) {
  const { cols, rows, portalRow, airRow, baseRow, rimRow, rimRowBottom, axisCol, buildRow } = ARENA;
  const spawnCols = (
    spec.spawnCols?.length
      ? spec.spawnCols
      : DEFAULT_SPAWN_OFFSETS.map((offset) => axisCol + offset)
  ).map(clampCol);
  const baseCol = clampCol(spec.baseCol ?? axisCol);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(GRASS));
  const set = (row, col, ch) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    grid[row][col] = ch;
  };
  const at = (row, col) => (row >= 0 && row < rows && col >= 0 && col < cols ? grid[row][col] : ROCK);

  // 1. The rim first, so the lanes below can still be painted over grass.
  if (spec.frame !== false) {
    for (let c = 0; c < cols; c += 1) {
      set(rimRow, c, ROCK);
      set(rimRowBottom, c, ROCK);
    }
    for (let r = 0; r < rows; r += 1) {
      set(r, 0, ROCK);
      set(r, cols - 1, ROCK);
    }
  }

  // 2. Sky gates: an opening in each side wall, on the air row. They are not
  //    road — a ground creep cannot use them — they are where the flyers enter.
  for (const col of spec.airCols?.length ? spec.airCols : [0, cols - 1]) {
    if (col === 0 || col === cols - 1) set(airRow, col, AIR);
  }

  // 3. The gates themselves.
  set(baseRow, baseCol, 'B');
  for (const col of spawnCols) set(portalRow, col, 'S');

  // 4. Roads, one per portal.
  const lanes = (spec.lanes || fieldLanes({ ...spec, spawnCols, baseCol })).map(compileLane);
  for (const lane of lanes) {
    for (const { row, col } of lane) {
      if (at(row, col) === 'S' || at(row, col) === 'B' || at(row, col) === AIR) continue;
      if (PAINTABLE.has(grid[row][col])) set(row, col, ROAD);
    }
  }

  // 5. Scenery, and only where it cannot argue with the player: the enemy's
  //    ground, never the build field, never a gate's own row, never a road.
  //    The five rows around the bastion stay deliberately empty — an obstacle
  //    in the field is a tile the player cannot use, and the brief for the
  //    redesign is an open field.
  const sceneryRow = (row) => row < buildRow;
  const clear = (row, col) => {
    if (row < 1 || row > rows - 2) return false;
    if (col < 2 || col > cols - 3) return false;
    if (!sceneryRow(row)) return false;
    if (at(row, col) !== GRASS) return false;
    if (Math.abs(row - portalRow) === 0 && spawnCols.includes(col)) return false;
    for (const spawnCol of spawnCols) {
      if (Math.abs(row - portalRow) <= 1 && Math.abs(col - spawnCol) <= 1) return false;
    }
    if (row === airRow && (col === 1 || col === cols - 2)) return false;
    return true;
  };
  for (const [r, c] of spec.rocks || []) {
    if (clear(r, c)) set(r, c, ROCK);
  }
  for (const [r, c] of spec.ponds || []) {
    if (clear(r, c)) set(r, c, WATER);
  }

  return grid.map((row) => row.join(''));
}

/**
 * Deterministic prop scatter for maps that want "some rocks" without listing
 * every cell. Uses a tiny integer FNV-style hash so the same map id always
 * produces the same battlefield (duel seats and replays depend on that).
 *
 * @param {string} seed
 * @param {{count?:number, fromRow?:number, toRow?:number, cols?:number}} [options]
 * @returns {[number, number][]}
 */
export function scatterProps(seed, { count = 10, fromRow = 0, toRow = ARENA.buildRow - 1, cols = ARENA.cols } = {}) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const cells = [];
  const seen = new Set();
  let guard = 0;
  while (cells.length < count && guard < count * 60) {
    guard += 1;
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    const row = fromRow + Math.abs(hash % Math.max(1, toRow - fromRow + 1));
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    const col = 2 + Math.abs(hash % Math.max(1, cols - 4));
    const key = `${row},${col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push([row, col]);
  }
  return cells;
}
