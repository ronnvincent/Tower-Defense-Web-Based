/**
 * puzzles.js — Blueprint Mode: hand-built boards with the towers already placed.
 *
 * A puzzle is a normal level with three differences: the map and the waves are
 * fixed here, a handful of towers are **pre-placed** (so the interesting
 * decision is where the *next* gold goes, not whether you can afford a start),
 * and stars are measured against the core HP you keep.
 *
 * `preplaced` cells are checked by `tests/modes.test.js` against the real
 * battlefield data — a tower on a road, water or rock cell would silently fail
 * to build, so the data is validated instead of trusted. Since the arena
 * grammar gave every map two mirrored flank roads, the pre-placed pair stands
 * on the grass beside each flank's bend.
 */

/** @typedef {{key:string,row:number,col:number}} PreplacedTower */

export const PUZZLES = Object.freeze([
  {
    id: 'narrow-gate',
    name: 'THE NARROW GATE',
    map: 'grassland',
    blurb: 'Two archers hold the crossroads. Spend 120 gold to make it enough.',
    startingCoins: 120,
    baseHealth: 20,
    preplaced: [
      { key: 'archer', row: 6, col: 6 },
      { key: 'archer', row: 6, col: 18 },
    ],
    waves: [
      { name: 'Probe', groups: [{ type: 'grunt', count: 12, interval: 800 }] },
      {
        name: 'The Push',
        groups: [
          { type: 'grunt', count: 10, interval: 700 },
          { type: 'runner', count: 8, interval: 420, delay: 1500 },
        ],
      },
    ],
    stars: { two: 0.6, three: 0.85 },
  },
  {
    id: 'crossfire',
    name: 'CROSSFIRE',
    map: 'desert',
    blurb: 'A mortar and a bow on opposite bends. Brutes do not care about either.',
    startingCoins: 130,
    baseHealth: 20,
    preplaced: [
      { key: 'cannon', row: 6, col: 7 },
      { key: 'archer', row: 6, col: 17 },
    ],
    waves: [
      {
        name: 'Armour',
        groups: [
          { type: 'brute', count: 4, interval: 1600 },
          { type: 'grunt', count: 8, interval: 900, delay: 800 },
        ],
      },
      {
        name: 'Sandstorm',
        groups: [
          { type: 'swarm', count: 18, interval: 300 },
          { type: 'shield', count: 3, interval: 1500, delay: 1200 },
        ],
      },
    ],
    stars: { two: 0.6, three: 0.85 },
  },
  {
    id: 'frost-line',
    name: 'FROST LINE',
    map: 'ice',
    blurb: 'Two spires, one canyon. Slow them enough and the cold does the rest.',
    startingCoins: 140,
    baseHealth: 22,
    preplaced: [
      { key: 'frost', row: 6, col: 12 },
      { key: 'frost', row: 6, col: 17 },
    ],
    waves: [
      { name: 'Sprint', groups: [{ type: 'runner', count: 14, interval: 380 }] },
      {
        name: 'Tide',
        groups: [
          { type: 'swarm', count: 20, interval: 280 },
          { type: 'grunt', count: 10, interval: 700, delay: 1200 },
        ],
      },
      {
        name: 'Warden of the Pass',
        groups: [
          { type: 'brute', count: 3, interval: 1500 },
          { type: 'colossus', count: 1, interval: 0, delay: 1800 },
        ],
      },
    ],
    stars: { two: 0.55, three: 0.8 },
  },
  {
    id: 'the-vault',
    name: 'THE VAULT',
    map: 'crystal',
    blurb: 'The vault door is a hammer and a bow. Everything else is your problem.',
    startingCoins: 150,
    baseHealth: 20,
    preplaced: [
      { key: 'forge', row: 6, col: 6 },
      { key: 'archer', row: 6, col: 17 },
    ],
    waves: [
      {
        name: 'First Cracks',
        groups: [
          { type: 'grunt', count: 14, interval: 700 },
          { type: 'runner', count: 10, interval: 420, delay: 900 },
        ],
      },
      {
        name: 'Crystal Guard',
        groups: [
          { type: 'shield', count: 4, interval: 1400 },
          { type: 'healer', count: 2, interval: 1800, delay: 600 },
          { type: 'brute', count: 5, interval: 1300, delay: 1200 },
        ],
      },
      {
        name: 'Shattering',
        groups: [
          { type: 'swarm', count: 22, interval: 260 },
          { type: 'sandwyrm', count: 1, interval: 0, delay: 2500 },
        ],
      },
    ],
    stars: { two: 0.55, three: 0.8 },
  },
  {
    id: 'last-stand',
    name: 'LAST STAND',
    map: 'ice',
    blurb: 'One mortar on the east wall and 90 gold. Hold the line anyway.',
    startingCoins: 90,
    baseHealth: 18,
    preplaced: [{ key: 'cannon', row: 6, col: 12 }],
    waves: [
      {
        name: 'Probe',
        groups: [
          { type: 'grunt', count: 10, interval: 850 },
          { type: 'runner', count: 8, interval: 450, delay: 900 },
        ],
      },
      {
        name: 'Hammer',
        groups: [
          { type: 'brute', count: 4, interval: 1500 },
          { type: 'shield', count: 3, interval: 1400, delay: 1000 },
        ],
      },
      {
        name: 'The Last Column',
        groups: [
          { type: 'grunt', count: 12, interval: 600 },
          { type: 'brute', count: 3, interval: 1500, delay: 1500 },
          { type: 'colossus', count: 1, interval: 0, delay: 3000 },
        ],
      },
    ],
    stars: { two: 0.5, three: 0.75 },
  },
  {
    id: 'caldera-watch',
    name: 'CALDERA WATCH',
    map: 'volcanic',
    blurb: 'Two frost spires over the lava. What crawls out is your problem.',
    startingCoins: 170,
    baseHealth: 22,
    preplaced: [
      { key: 'frost', row: 7, col: 7 },
      { key: 'frost', row: 7, col: 13 },
    ],
    waves: [
      {
        name: 'Ash Crawlers',
        groups: [
          { type: 'grunt', count: 16, interval: 650 },
          { type: 'raider', count: 8, interval: 520, delay: 1000 },
        ],
      },
      {
        name: 'Molten Column',
        groups: [
          { type: 'brute', count: 5, interval: 1400 },
          { type: 'healer', count: 3, interval: 1700, delay: 800 },
          { type: 'shield', count: 4, interval: 1300, delay: 1400 },
        ],
      },
      {
        name: 'Warden Awakens',
        groups: [
          { type: 'swarm', count: 20, interval: 300 },
          { type: 'magmalord', count: 1, interval: 0, delay: 2600 },
        ],
      },
    ],
    stars: { two: 0.55, three: 0.8 },
  },
]);

const byId = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));

export function getPuzzle(id) {
  return byId.get(id) || null;
}

/**
 * Turn a puzzle into the level shape the scene already understands.
 *
 * `puzzle: true` keeps it out of campaign progression (no stars banked, no
 * unlock chain) while still using the whole battle pipeline.
 */
export function puzzleLevel(puzzle) {
  if (!puzzle) return null;
  return {
    id: `puzzle-${puzzle.id}`,
    index: 0,
    name: puzzle.name,
    theme: puzzle.map,
    map: puzzle.map,
    blurb: puzzle.blurb,
    startingCoins: puzzle.startingCoins,
    baseHealth: puzzle.baseHealth,
    enemyHealthScale: 1,
    reward: { gold: 0, gems: 0 },
    stars: puzzle.stars || { two: 0.6, three: 0.85 },
    puzzle: true,
    puzzleId: puzzle.id,
    preplaced: puzzle.preplaced,
    waves: puzzle.waves,
  };
}
