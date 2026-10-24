/**
 * Battlefield layout (20 columns × 12 rows, one character per tile).
 *
 *   S  enemy spawn (walkable)        .  grass — towers can be built here
 *   B  base / goal (walkable)        x  rocks — blocked
 *   #  road (walkable)               ~  water — blocked
 *
 * The road network intentionally contains THREE routes from S to B so that the
 * BFS shortest path is meaningful:
 *   - middle route (with a jog through row 7)   → 24 cells (23 steps)  ← shortest
 *   - north route  (row 1)                      → 28 cells
 *   - south route  (row 10)                     → 30 cells
 * Barricades do NOT reroute the horde: a palisade is a solid wall standing on
 * the road, and enemies stop and break it down instead of taking a detour.
 */
export const MAP_LAYOUT = [
  //        1111111111
  //234567890123456789
  'xx~~~.......xxx..~~x', // 0
  'x..##############..x', // 1
  '...#.....xx.....#...', // 2
  '...#............#...', // 3
  '~..#..x.....x...#..~', // 4
  'S#######....#######B', // 5
  '...#...#....#...#...', // 6
  '...#...######...#...', // 7
  '...#.x..........#...', // 8
  '~..#.......~~...#..~', // 9
  '...##############...', // 10
  'xx~.....xxx.....~~xx', // 11
];

/**
 * Named battlefields for the campaign. Grassland keeps the original three-route
 * map; the desert mesa forks around a central plateau, and the ice hollow is a
 * single serpentine canyon where one good palisade is worth a whole tower.
 */
export const MAPS = {
  grassland: MAP_LAYOUT,
  desert: [
    'xxx......~~......x..', // 0
    '......xxx.........x.', // 1
    '...##############...', // 2
    '...#.....xx.....#...', // 3
    '...#..~~~~......#...', // 4
    'S###............###B', // 5
    '...#............#...', // 6
    '...#............#...', // 7
    '...##############...', // 8
    '......xx.....~......', // 9
    '...~........xx......', // 10
    '....xx..............', // 11
  ],
  ice: [
    'xxx...~~............', // 0
    'x...................', // 1
    '...##############.x.', // 2
    'xx.#........~~..#..x', // 3
    '...#.xxx........#...', // 4
    '...#~~..........#...', // 5
    '...#....#########...', // 6
    '...#....#...xx......', // 7
    '...#....###########B', // 8
    '...#~.....xx........', // 9
    'S###................', // 10
    '~~~............xxx..', // 11
  ],
  // Endless Siege keeps its own battlefield: a four-step staircase down the
  // caldera, so the run does not replay the Verdant Marches layout in ash.
  volcanic: [
    'S####...............', // 0
    '....#.....xx........', // 1
    '....#..~~....x...x..', // 2
    '....#####...........', // 3
    '..x.....#....x......', // 4
    '...x....#.....~~....', // 5
    '..x.....#####.......', // 6
    '..x.........#.......', // 7
    '...~~.......#....x..', // 8
    '............#####.x.', // 9
    '..x...x....~~...#...', // 10
    '....x..........~###B', // 11
  ],
  // Prism Depths: a four-turn spiral. Every switchback has one water pool and one
  // boulder field beside it, so the long straight runs are the only open build
  // space — the level plays as a corridor fight rather than a wide field.
  crystal: [
    'S###....x...........', // 0
    '...#..x.....~~......', // 1
    '...#....~~....x.....', // 2
    '...############.....', // 3
    '..x...........#.....', // 4
    '.......x......#..x..', // 5
    '..x...........#.....', // 6
    '..#############.....', // 7
    '..#.....x...........', // 8
    '..#......~~....x....', // 9
    '..##########........', // 10
    '.....x.....B....x...', // 11
  ],
};

export const TILE = {
  GRASS: 'grass',
  ROAD: 'road',
  SPAWN: 'spawn',
  BASE: 'base',
  ROCK: 'rock',
  WATER: 'water',
};

const CHAR_TO_TILE = {
  '.': TILE.GRASS,
  '#': TILE.ROAD,
  S: TILE.SPAWN,
  B: TILE.BASE,
  x: TILE.ROCK,
  '~': TILE.WATER,
};

/**
 * Convert the string layout into a 2D array of tile types and locate S and B.
 * Throws a descriptive error if the layout is malformed, so a broken map is
 * caught before gameplay starts.
 */
export function parseMap(layout = MAP_LAYOUT) {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const tiles = [];
  let spawn = null;
  let base = null;

  for (let r = 0; r < rows; r++) {
    if (layout[r].length !== cols) {
      throw new Error(`Map row ${r} has ${layout[r].length} columns, expected ${cols}`);
    }
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = layout[r][c];
      const type = CHAR_TO_TILE[ch];
      if (!type) throw new Error(`Unknown map character '${ch}' at row ${r}, col ${c}`);
      if (type === TILE.SPAWN) {
        if (spawn) throw new Error('Map has more than one spawn');
        spawn = { row: r, col: c };
      }
      if (type === TILE.BASE) {
        if (base) throw new Error('Map has more than one base');
        base = { row: r, col: c };
      }
      row.push(type);
    }
    tiles.push(row);
  }
  if (!spawn) throw new Error('Map has no spawn (S)');
  if (!base) throw new Error('Map has no base (B)');
  return { rows, cols, tiles, spawn, base };
}

/**
 * Resolve a map id to its layout, falling back to the original battlefield so a
 * typo in a level definition can never crash the scene.
 */
export function getMapLayout(mapId) {
  return MAPS[mapId] || MAP_LAYOUT;
}

/** Road-like tiles that enemies can walk on (graph nodes). */
export function isWalkableTile(type) {
  return type === TILE.ROAD || type === TILE.SPAWN || type === TILE.BASE;
}

/** Tiles where towers may be built. */
export function isBuildableTile(type) {
  return type === TILE.GRASS;
}
