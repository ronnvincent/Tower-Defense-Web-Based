/**
 * pvpArenas.js — the three mirrored duel arenas.
 *
 * Every arena is **26 x 16 tiles** (1664 x 1024 px), 73 % more ground than a
 * campaign map, and every one is 180°-rotationally symmetric: the layout you
 * build on is exactly the layout your rival gets, just entered from the other
 * gate. Symmetry is not decoration — it is what makes a race between two
 * identical wave scripts fair, and `tests/pvp.test.js` re-derives it from the
 * ASCII on every run so a hand edit cannot quietly break it.
 *
 * Both players receive the *same* level object, so the horde (counts, types,
 * bosses, health scaling) is identical by construction; only the room and the
 * seed travel between clients. There is nothing to desync because nothing
 * about the wave plan is random.
 *
 *   S  spawn   B  base   #  road   .  buildable   x  rock   ~  water
 */

import { THEMES } from './levelData.js';

/** Shared rules. No relics, no blessings: the arena is the equaliser. */
export const PVP_RULES = Object.freeze({
  startingCoins: 260,
  baseHealth: 25,
  enemyHealthScale: 1,
  /** Long arenas need a little more time between waves than the campaign. */
  waves: 8,
});

const CINDER_CROWN = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  'x.......xxxxxxxxxx.......x',
  'x.......xxxxxxxxxx.......x',
  'x....###################.x',
  'x....#..............#..#.x',
  'x....#...~~~~~~~~...#..#.x',
  'x....#...~~~~~~~~...#..#.x',
  'S#####...~~~~~~~~...#..#.x',
  'x.#..#...~~~~~~~~...#####B',
  'x.#..#...~~~~~~~~...#....x',
  'x.#..#...~~~~~~~~...#....x',
  'x.#..#..............#....x',
  'x.###################....x',
  'x.......xxxxxxxxxx.......x',
  'x.......xxxxxxxxxx.......x',
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
];

const FROSTSPINE = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  'x...........~~~..........x',
  'x..#########~~~..........x',
  'x..#......#####..........x',
  'x..#......##..#########..x',
  'x..#......##..##......#..x',
  'x..#......##..##..~~~.#..x',
  'S###......##..##..~~~.#..x',
  'x..#.~~~..##..##......###B',
  'x..#.~~~..##..##......#..x',
  'x..#......##..##......#..x',
  'x..#########..##......#..x',
  'x..........#####......#..x',
  'x..........~~~#########..x',
  'x..........~~~...........x',
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
];

const DUST_MERIDIAN = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  'x........................x',
  'x........................x',
  'x...#############.######.x',
  'x...#..#.#......#.#....#.x',
  'x...#..#.#~~~~~~#.#....#.x',
  'x...#..#.#~~~~~~#.#....#.x',
  'S####..#.#......#.#....#.x',
  'x.#....#.#......#.#..####B',
  'x.#....#.#~~~~~~#.#..#...x',
  'x.#....#.#~~~~~~#.#..#...x',
  'x.#....#.#......#.#..#...x',
  'x.######.#############...x',
  'x........................x',
  'x........................x',
  'xxxxxxxxxxxxxxxxxxxxxxxxxx',
];

/**
 * The wave script both players run. It is a plain list (no RNG): wave 4 is the
 * mid-boss, wave 8 closes the match with the arena's own boss.
 */
function arenaWaves(bossKey, bossName) {
  return [
    { name: 'Scouting Line', groups: [{ type: 'grunt', count: 14, interval: 900 }] },
    {
      name: 'Swift Infiltration',
      groups: [
        { type: 'grunt', count: 10, interval: 800 },
        { type: 'runner', count: 14, interval: 460, delay: 1200 },
      ],
    },
    {
      name: 'Iron Vanguard',
      groups: [
        { type: 'brute', count: 5, interval: 1500 },
        { type: 'swarm', count: 16, interval: 300, delay: 1000 },
        { type: 'healer', count: 3, interval: 2000, delay: 1400 },
      ],
    },
    {
      name: 'The Colossus Awakening',
      bossWave: true,
      bossKey: 'colossus',
      groups: [
        { type: 'grunt', count: 10, interval: 800 },
        { type: 'swarm', count: 14, interval: 300, delay: 1000 },
        { type: 'colossus', count: 1, interval: 0, delay: 2000 },
      ],
    },
    {
      name: 'Aegis Wall',
      groups: [
        { type: 'shield', count: 6, interval: 1300 },
        { type: 'brute', count: 4, interval: 1400, delay: 1000 },
        { type: 'runner', count: 12, interval: 420, delay: 1400 },
      ],
    },
    {
      name: 'The Long March',
      groups: [
        { type: 'swarm', count: 24, interval: 240 },
        { type: 'healer', count: 4, interval: 1800, delay: 1200 },
        { type: 'brute', count: 6, interval: 1200, delay: 1400 },
      ],
    },
    {
      name: 'Siege Prelude',
      groups: [
        { type: 'shield', count: 7, interval: 1200 },
        { type: 'brute', count: 6, interval: 1100, delay: 1000 },
        { type: 'runner', count: 14, interval: 380, delay: 1200 },
        { type: 'healer', count: 4, interval: 1700, delay: 1400 },
      ],
    },
    {
      name: bossName,
      bossWave: true,
      bossKey,
      groups: [
        { type: 'shield', count: 6, interval: 1200 },
        { type: 'brute', count: 6, interval: 1100, delay: 900 },
        { type: 'healer', count: 4, interval: 1700, delay: 1200 },
        { type: bossKey, count: 1, interval: 0, delay: 2200 },
        { type: 'runner', count: 10, interval: 360, delay: 2000 },
      ],
    },
  ];
}

export const PVP_ARENAS = [
  {
    id: 'cinder-crown',
    name: 'Cinder Crown',
    theme: 'caldera',
    blurb: 'Ash over a live caldera, split by magma. Long sightlines, no safe corner.',
    layout: CINDER_CROWN,
    bossKey: 'magmalord',
    bossName: 'The Caldera Regent',
  },
  {
    id: 'frostspine',
    name: 'Frostspine',
    theme: 'glacier',
    blurb: 'Four switchbacks over a bright ice sheet. Every tower sees two lanes.',
    layout: FROSTSPINE,
    bossKey: 'frostwarden',
    bossName: 'The Warden of the Pass',
  },
  {
    id: 'dust-meridian',
    name: 'Dust Meridian',
    theme: 'oasis',
    blurb: 'A ladder of straights over bleached dunes. Wide shelves, brutal boss lane.',
    layout: DUST_MERIDIAN,
    bossKey: 'sandwyrm',
    bossName: 'The Meridian Wyrm',
  },
];

export const DEFAULT_ARENA_ID = PVP_ARENAS[0].id;

export function getArena(arenaId) {
  return PVP_ARENAS.find((arena) => arena.id === arenaId) || PVP_ARENAS[0];
}

/**
 * A GameScene-compatible level built from an arena.
 *
 * `pvp: true` is the flag the scene checks to skip progression writes and to
 * zero out relics, so nothing carries between the campaign and the arena.
 */
export function getPvpLevel(arenaId = DEFAULT_ARENA_ID) {
  const arena = getArena(arenaId);
  return {
    id: `pvp-${arena.id}`,
    index: 0,
    name: `${arena.name} · DUEL`,
    theme: arena.theme,
    map: arena.id,
    mapLayout: arena.layout,
    blurb: arena.blurb,
    startingCoins: PVP_RULES.startingCoins,
    baseHealth: PVP_RULES.baseHealth,
    enemyHealthScale: PVP_RULES.enemyHealthScale,
    reward: null,
    stars: [0.66, 0.33],
    boss: arena.bossKey,
    waves: arenaWaves(arena.bossKey, arena.bossName),
    endless: false,
    pvp: true,
    arenaId: arena.id,
    themeName: THEMES[arena.theme]?.name || arena.name,
  };
}

/** Arena dimensions in tiles, derived from the data (never hard-coded). */
export function arenaSize(arena) {
  const layout = arena?.layout || [];
  return { rows: layout.length, cols: layout[0]?.length || 0 };
}
