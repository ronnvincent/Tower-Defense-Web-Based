/**
 * Arena template — one battlefield grammar for every map in the game.
 *
 * THE BOARD
 * ---------
 * The battlefield is landscape and split **horizontally**, the way a player
 * already reads an arena-defence board — twenty-six columns wide, twelve rows
 * tall, which is the widest shape the battle band between the top bar and the
 * forge can show without cropping a rim:
 *
 *     ┌──────────────────────────────────────────────────┐
 *     │ 0  rim  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    │
 *     │ 1        S  portal (enemy musters here)          │  enemy ground: 5 rows
 *     │ 2   lane corridors fan out to the crossings      │
 *     │ 3   the last approach before the water           │
 *     │ 4   landing, staggered so no road is a ruler     │
 *     │ 5  ~~~~~~~~~~~~ RIVER ~~~~~~~~~~~~ (flowing)     │  ← the split line
 *     │ 6   bridge landings                              │
 *     │ 7   the courtyard — where the keeps stand        │  our ground: 7 rows
 *     │ 8   the gate road                                │
 *     │ 9        B  bastion (bottom, with margin)        │
 *     │ 10  grass margin                                 │
 *     │ 11 rim  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    │
 *     └──────────────────────────────────────────────────┘
 *
 * Five rows above the river and seven below it is the 40 / 60 cut in whole
 * rows, and the river *is* the line. The bastion owns row 9 with two rows of
 * margin under it; the portal owns row 2 with two rows of margin over it.
 *
 * WHY A RIVER
 * -----------
 * A hard seam between two halves reads as a crop. A river reads as a border
 * that belongs to the place: it is animated (see `createRiverFlow`), it is
 * impassable, and every lane has to cross it at a bridge — which is exactly
 * where a defence wants to stand. The number of crossings is per map (two or
 * three), so the board does not look reused.
 *
 * LANES
 * -----
 * A lane is authored as **waypoints** and compiled into orthogonal road cells
 * by `compileLane`. That keeps every map's route readable as data, while
 * `PathfindingSystem.computeLanes` still derives the real routes from the ASCII
 * and the tests still re-derive every rule from the board itself.
 *
 * Every map is authored as a *spread from the centre axis*, never as absolute
 * columns, so the arena width lives in exactly one place.
 *
 * ASCII legend (parsed by `parseMap` in mapData.js):
 *   S portal   B bastion   # road   . grass   ~ water   x rock
 */

/** Fixed arena geometry. Cols is even so the axis column sits between two rim margins. */
export const ARENA = Object.freeze({
  cols: 26,
  rows: 12,
  /** Rim row above the portal — the visible margin at the top of the field. */
  rimRow: 0,
  /** Portal row, two rows below the rim: a full row of enemy ground above it. */
  portalRow: 2,
  /**
   * The river: the horizontal split line. Five of twelve rows are the enemy's
   * (41.7 %) and seven are ours (58.3 %) — the 40 / 60 cut, in whole rows.
   */
  riverRow: 5,
  /** First row of our side — the only rows a defence may be built on. */
  playerRow: 6,
  /** Bastion row: two rows of margin below it (row 10 grass, row 11 rim). */
  baseRow: 9,
  /** Bottom rim — the margin that keeps the bastion off the edge. */
  rimRowBottom: 11,
  /** Centre column: portal and bastion are always on it. */
  axisCol: 12,
});

const GRASS = '.';
const ROAD = '#';
const WATER = '~';
const ROCK = 'x';

/** Characters a compiled lane may write over. */
const PAINTABLE = new Set([GRASS, ROAD]);

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
 * Build one arena from its lane waypoints and props.
 *
 * @param {object} [spec]
 * @param {[number, number][][]} [spec.lanes]  waypoint lists, one per lane; the
 *   first cell of each must be the portal and the last the bastion
 * @param {[number, number][]} [spec.rocks]    explicit rock cells
 * @param {[number, number][]} [spec.ponds]    explicit water cells on our side
 * @param {boolean} [spec.frame]               draw the rocky rim (default true)
 * @returns {string[]} rows of map characters
 */
export function buildArena(spec = {}) {
  const { cols, rows, portalRow, riverRow, baseRow, axisCol } = ARENA;
  // The two gates may sit on different columns: a board where the horde enters
  // on one flank and the keep stands on the other is what makes three crossings
  // *equally* long (see `arenaLanes`). Centred is the default.
  const portalCol = clampCol(spec.portalCol ?? axisCol);
  const baseCol = clampCol(spec.baseCol ?? axisCol);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(GRASS));
  const set = (row, col, ch) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    grid[row][col] = ch;
  };
  const at = (row, col) => (row >= 0 && row < rows && col >= 0 && col < cols ? grid[row][col] : ROCK);

  const lanes = (spec.lanes || []).map(compileLane);

  // 1. Every lane crossing the river keeps its bridge; the rest of the line is
  //    open water. Crossings are derived from the lanes themselves, so a map
  //    can never advertise a bridge nobody walks over.
  const crossings = new Set();
  for (const lane of lanes) {
    for (const cell of lane) if (cell.row === riverRow) crossings.add(cell.col);
  }

  // 2. Rim first, so a lane can still be painted over it (it never is — the
  //    lanes stay inside the rim by construction, see tests/map-margin).
  if (spec.frame !== false) {
    for (let c = 0; c < cols; c += 1) {
      set(ARENA.rimRow, c, ROCK);
      set(ARENA.rimRowBottom, c, ROCK);
    }
    for (let r = 0; r < rows; r += 1) {
      set(r, 0, ROCK);
      set(r, cols - 1, ROCK);
    }
  }

  // 3. The river: one full row of water, broken only by the crossings.
  for (let c = 0; c < cols; c += 1) {
    set(riverRow, c, crossings.has(c) ? ROAD : WATER);
  }

  // 4. Gates.
  set(portalRow, portalCol, 'S');
  set(baseRow, baseCol, 'B');

  // 5. Roads.
  for (const lane of lanes) {
    for (const { row, col } of lane) {
      if (at(row, col) === 'S' || at(row, col) === 'B') continue;
      if (PAINTABLE.has(grid[row][col])) set(row, col, ROAD);
    }
  }

  // 6. Props. Rocks and ponds are decoration *and* the honest answer to "why
  //    can't I build there" — they are terrain, not an invisible rule.
  for (const [r, c] of spec.rocks || []) {
    if (grid[r]?.[c] === GRASS) set(r, c, ROCK);
  }
  for (const [r, c] of spec.ponds || []) {
    if (grid[r]?.[c] === GRASS) set(r, c, WATER);
  }

  return grid.map((row) => row.join(''));
}

/** Clamp a gate/bridge column inside the rock rim. */
function clampCol(col) {
  return Math.max(2, Math.min(ARENA.cols - 3, Math.round(col)));
}

/**
 * The routes of one battlefield, compiled from waypoints.
 *
 * ONE RULE FOR EVERY MAP
 * ----------------------
 * The horde enters at `portalCol` on the top row of the enemy half, runs down
 * to a corridor row, crosses the river at each bridge in `bridges`, lands on our
 * side, runs along a courtyard row, and turns in at `baseCol` to reach the keep.
 *
 * WHY THE GATES CAN SIT OFF-CENTRE
 * --------------------------------
 * A lane's length is its horizontal travel plus its vertical travel. Every
 * crossing that lies **between the portal column and the gate column** has the
 * same horizontal travel — `|b − portalCol| + |baseCol − b| = |baseCol −
 * portalCol|` — and the same vertical travel, so the routes come out *exactly*
 * the same length and `PathfindingSystem.computeLanes` keeps all of them.
 *
 * That is the whole reason a map may run from a corner of the enemy half to the
 * opposite corner of ours: it is not decoration, it is what makes three lanes
 * genuinely equal. On a centred board the outermost bridge is always ~2·|Δ|
 * cells longer than the middle one, and a third lane collapses into a shortcut.
 *
 * @param {object} [spec]
 * @param {number} [spec.portalCol] where the horde enters (default: the axis)
 * @param {number} [spec.baseCol]   where the keep stands (default: the axis)
 * @param {number[]} [spec.bridges] crossing columns, 2 or 3 per map
 * @param {number} [spec.corridorRow] row the horde runs along in its own half
 * @param {number} [spec.turnRow]   courtyard row the lane turns in on
 * @param {'both'|'enemy'|'court'|false} [spec.stair] which half gets the
 *   two-cell stagger that keeps a road from reading as a ruler
 * @returns {[number,number][][]}
 */
export function arenaLanes({
  portalCol = ARENA.axisCol,
  baseCol = ARENA.axisCol,
  bridges = null,
  corridorRow: argCorridorRow = 3,
  turnRow: argTurnRow = 7,
  stair = 'both',
} = {}) {
  const { portalRow, riverRow, playerRow, baseRow } = ARENA;
  const corridorRow = argCorridorRow;
  const turnRow = argTurnRow;
  const p = clampCol(portalCol);
  const g = clampCol(baseCol);
  const crossings = (bridges ?? [p, g]).map(clampCol);
  // `corridorRow` / `turnRow` may be a single row or a list, one per lane. A
  // list fans the roads out (two parallel courtyard runs instead of one) which
  // is what stops a wide board from reading as a single rectangular circuit.
  // Vertical travel is identical either way, so the lanes stay equal length.
  const rowFor = (value, index) =>
    Array.isArray(value) ? value[index % value.length] : value;

  const route = (bridge, index) => {
    // The corridor can never occupy the portal's own row: a road running
    // sideways out of the portal mouth would swallow the spawn cell's
    // neighbours and read as a wall of stone across the top of the board.
    const corridorRow = Math.min(
      riverRow - 1,
      Math.max(portalRow + 1, rowFor(argCorridorRow, index))
    );
    // Every lane turns in on the SAME courtyard row: the routes converge on one
    // approach road to the keep instead of running two or three parallel roads
    // down our half. Three parallel runs plus their stairs enclosed grass
    // pockets and read as a paved plaza with holes in it — the fork that matters
    // is the one in the enemy half, where the horde actually picks a crossing.
    const turnRow = Math.min(baseRow - 1, Math.max(playerRow, rowFor(argTurnRow, 0)));
    const enemyStair = (stair === 'enemy' || stair === 'both') && corridorRow + 1 < riverRow;
    const courtStair = false;
    const corridorEnd = enemyStair ? corridorRow + 1 : corridorRow;
    const points = [[portalRow, p]];
    if (corridorRow !== portalRow) points.push([corridorRow, p]);
    if (enemyStair) {
      const mid = Math.round((p + bridge) / 2);
      if (mid !== p && mid !== bridge) points.push([corridorRow, mid], [corridorRow + 1, mid]);
    }
    points.push([corridorEnd, bridge]);
    points.push([riverRow, bridge]); // the crossing
    points.push([playerRow, bridge]); // landing on our bank
    points.push([turnRow, bridge]);
    if (courtStair) {
      const mid = Math.round((bridge + g) / 2);
      if (mid !== bridge && mid !== g) points.push([turnRow, mid], [turnRow + 1, mid]);
    }
    points.push([turnRow + (courtStair ? 1 : 0), g]);
    points.push([baseRow, g]);
    return points;
  };
  return crossings.map(route);
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
export function scatterProps(seed, { count = 10, fromRow = 0, toRow = ARENA.rows - 1, cols = ARENA.cols } = {}) {
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
