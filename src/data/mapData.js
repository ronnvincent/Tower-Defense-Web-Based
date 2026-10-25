/**
 * Battlefield layout (20 columns × 12 rows, one character per tile).
 *
 *   S  enemy spawn (walkable)        .  grass — towers can be built here
 *   B  base / goal (walkable)        x  rocks — blocked
 *   #  road (walkable)               ~  water — blocked
 *
 * Gates never sit on the outermost ring. The portal sprite is 96 px and the
 * core platform 80 px, both painted over a 64 px tile, so a gate parked on the
 * edge is physically clipped by the camera bounds — that is what made the spawn
 * and the core hard to see. Every S / B therefore keeps at least one full tile
 * of terrain between its own tile and the edge of the map, which reads as a
 * margin around the battlefield. `tests/map-margin.test.js` enforces the rule
 * for the campaign and the duel arenas both, so a hand edit cannot bring the
 * old flush-with-the-screen gates back.
 *
 * The road network intentionally contains THREE routes from S to B so that the
 * BFS shortest path is meaningful:
 *   - middle route (with a jog through row 7)   → 22 cells (21 steps)  ← shortest
 *   - north route  (row 1)                      → 26 cells
 *   - south route  (row 10)                     → 28 cells
 * Barricades do NOT reroute the horde: a palisade is a solid wall standing on
 * the road, and enemies stop and break it down instead of taking a detour.
 *
 * Gates keep two rows from the top and bottom edges because the portrait of a
 * landscape phone crops the 5:3 stage and then the top bar and the forge dock
 * cover the rest: a gate on row 1 or row 10 is behind chrome even though it is
 * inside the map. Rows 3-8 are the band that is actually on screen.
 */
export const MAP_LAYOUT = [
  //        1111111111
  //234567890123456789
  'xx~~~.......xxx..~~x', // 0
  'x..##############..x', // 1
  '...#.....xx.....#...', // 2
  '...#............#...', // 3
  '~..#..x.....x...#..~', // 4
  'xS######....######Bx', // 5  ← both gates one tile inside the frame
  '...#...#....#...#...', // 6
  '...#...######...#...', // 7
  '...#.x..........#...', // 8
  '~..#.......~~...#..~', // 9
  '...##############...', // 10
  'xx~.....xxx.....~~xx', // 11
];

/**
 * Named battlefields for the campaign.
 *
 * Every one of them offers two or three real routes from the gate to the core,
 * which `PathfindingSystem.computeLanes` derives from the ASCII: grassland keeps
 * the original three-route map, the desert mesa forks around a central plateau,
 * the ice hollow stacks three frozen canyons, and the crystal vault fans three
 * arms out of the gate. A single palisade line therefore cannot choke a wave on
 * any of them — the horde splits.
 */
export const MAPS = {
  grassland: MAP_LAYOUT,
  desert: [
    'xxx......~~......x..', // 0
    '......xxx.........x.', // 1
    '...##############...', // 2
    '...#.....xx.....#...', // 3
    '...#..~~~~......#...', // 4
    'xS##............##Bx', // 5  ← both gates one tile inside the frame
    '...#............#...', // 6
    '...#............#...', // 7
    '...##############...', // 8
    '......xx.....~......', // 9
    '...~........xx......', // 10
    '....xx..............', // 11
  ],
  ice: [
    'x....x..............', // 0
    '...x................', // 1
    '.......~~...........', // 2
    '....############....', // 3  ← north canyon
    '....#..........#....', // 4
    '....#..........##B..', // 5  ← core in the HUD-free band
    '....############....', // 6  ← middle canyon
    '.S###..........#....', // 7  ← gate in the HUD-free band
    '....#..........#....', // 8
    '....############....', // 9  ← south canyon
    '..x...........x.....', // 10
    'x...................', // 11
  ],
  // Endless Siege's battlefield — "The Convergence", 28x18, twice the area of a
  // campaign map and the only map in the game that changes biome underfoot.
  //
  // Three roads cross it instead of one, each between 33 and 39 cells, and they
  // part company within the first few tiles of the snowfield gate: the horde
  // scatters down the west descent, the middle descent or all the way east, and
  // only knits back together at the caldera shelf above the crystal dais. Each
  // band is a different tile set (see MAP_BIOMES), so whichever road a creep
  // takes it still marches from winter into sand and then into fire — the point
  // of the level is that the ground itself tells you how far you have come.
  //
  // The meltwater river is crossed twice on purpose: a lane tile with water on
  // both sides is a bridge, and `tests/endless-map.test.js` re-derives that from
  // the ASCII instead of trusting this comment.
  volcanic: [
    '............~~~~~~~.........', // 0
    '....x.......~~~~~~~.........', // 1
    '.......x.....~~~..x....x....', // 2
    '..S######################...', // 3
    '..x...#.......#.........#...', // 4
    '......#...x...#.........#...', // 5
    '......#....~~~#~~~......#...', // 6
    '......#.......#.........#..x', // 7
    '......###################...', // 8
    '..x.........x........#......', // 9
    '................x...~#~~.~~~', // 10
    '...~~~~~....x........#......', // 11
    '..~~~~........x......#......', // 12
    '.....................###B...', // 13
    '....~~~............x........', // 14
    '..~~~~~~.....x..............', // 15
    '..~~~~~....x................', // 16
    '...x..x....x......x....x....', // 17
  ],
  // Prism Depths: a four-turn spiral. Every switchback has one water pool and one
  // boulder field beside it, so the long straight runs are the only open build
  // space — the level plays as a corridor fight rather than a wide field.
  crystal: [
    'x.......x...........', // 0
    '...x.....~~.........', // 1
    '......x.............', // 2
    '.S##########........', // 3  ← north arm
    '....#......#........', // 4
    '....#......#........', // 5
    '....###########B....', // 6  ← spine into the core
    '....#......#........', // 7
    '....##########......', // 8  ← south arm
    '....................', // 9
    '..x..............x..', // 10
    'x...................', // 11
  ],
};

/**
 * Per-tile biome overlay — the same grid shape as the layout, one letter per
 * cell, naming which tile set that square is painted from:
 *
 *   i  ice       d  desert      v  volcanic      c  crystal
 *
 * Only the endless battlefield has one. The campaign maps are one biome each and
 * the renderer falls back to the level's theme when a map is absent from this
 * table, so nothing about the stages changes.
 *
 * The boundaries are deliberately ragged (a snowdrift spilling into the dunes, a
 * lava tongue climbing back out, a crystal vein up the eastern wall) instead of
 * straight ruler lines: the seam is where the map looks alive.
 */
export const MAP_BIOMES = {
  volcanic: [
    'iiiiiiiiiiiiiiiiiiiiiiiiiiii', // 0  snowfield + meltwater source
    'iiiiiiiiiiiiiiiiiiiiiiiiiiii', // 1
    'iiiiiiiiiiiiiiiiiiiiiiiiiiii', // 2
    'iiiiiiiiiiiiiiiiiiiiiiiiiiii', // 3
    'iiiiiiiiiiiiiiiiiiiiiidddddd', // 4  heat spilling over the pass
    'iiiiiiiiiiiiiidiiidddddddddd', // 5
    'iiiiiiiddddddddddddddddddddd', // 6  snowdrift tongue
    'iiiiidddddddddiiiddddddddddd', // 7  (the river keeps its own colour)
    'iiidddddddddddiiiddddddddddd', // 8
    'dddddddddddddddddddddddddddd', // 9  dunes
    'ddddddddddddddiiiddddddddddd', // 10
    'ddddddddddddddiiiddddddddddd', // 11
    'vvvvvvvvvvvvvvvvvvvvvvcccccc', // 12 caldera shelf
    'vvvvvvvvvvvvvvvvvvvvvvcccccc', // 13
    'vvvvvvvvvvvvvvvvvvvvvvcccccc', // 14
    'vvvvvvvvvvvvvvvvvvvvvvcccccc', // 15
    'vvvvvvvvvvvvvvvvvvvvvvcccccc', // 16
    'vvvvvvvvvvvvvvvvvvvvvvvvvvvv', // 17
  ],
};

/** Biome letter -> campaign theme id (each one owns a generated tile set). */
export const BIOME_THEME = Object.freeze({
  i: 'ice',
  d: 'desert',
  v: 'volcanic',
  c: 'crystal',
});

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

/**
 * Biome grid for a map id, or null when the battlefield is single-biome.
 *
 * Returns `[[themeId, …], …]` so the renderer can ask "which tile set owns this
 * square?" without knowing anything about the letters. A malformed grid is
 * ignored rather than thrown: a texture lookup falling back to the level theme
 * is a cosmetic problem, a crash mid-wave is not.
 */
export function getMapBiomes(mapId) {
  const grid = MAP_BIOMES[mapId];
  if (!grid) return null;
  const layout = getMapLayout(mapId);
  if (grid.length !== layout.length) return null;
  const rows = [];
  for (let r = 0; r < grid.length; r++) {
    if (grid[r].length !== layout[r].length) return null;
    const row = [];
    for (let c = 0; c < grid[r].length; c++) {
      row.push(BIOME_THEME[grid[r][c]] || null);
    }
    rows.push(row);
  }
  return rows;
}

/** Road-like tiles that enemies can walk on (graph nodes). */
export function isWalkableTile(type) {
  return type === TILE.ROAD || type === TILE.SPAWN || type === TILE.BASE;
}

/** Tiles where towers may be built. */
export function isBuildableTile(type) {
  return type === TILE.GRASS;
}
