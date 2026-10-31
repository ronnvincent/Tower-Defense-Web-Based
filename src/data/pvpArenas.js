/**
 * pvpArenas.js — the three duel arenas.
 *
 * Every arena is built on the **same grammar as the campaign boards**: 32 x 12
 * tiles, a rock rim all round, three ground portals along the top, two sky gates
 * in the side walls, and the keep on the bottom-centre column with a rim row
 * under it. A duel is not a different game with a different map language — it is
 * the same game with both seats on the same board.
 *
 * FAIRNESS
 * --------
 * The arenas used to be 26 x 16 and 180°-rotationally symmetric. Rotation is no
 * longer the guarantee: both clients receive the *same* level object, byte for
 * byte (see `getPvpLevel` and tests/pvp.test.js), so there is nothing to mirror.
 * What must stay equal is the board, the wave script, the gold and the boss —
 * and those are equal by construction.
 *
 * The three arenas differ in what the approaches cost you: Cinder Crown spreads
 * its portals to the walls and swings the roads hard, Frostspine is the plain
 * three-lane board, and Dust Meridian crowds the left two portals so the right
 * approach arrives late.
 *
 *   S  spawn   B  base   #  road   .  buildable   x  rock   ~  water
 */

import { THEMES } from './levelData.js';
import { ARENA, buildArena, scatterProps } from './arenaLayout.js';

/** Shared rules. No relics, no blessings, no powerups: the arena equalises. */
/**
 * What a duel does **not** have. The arena is the equaliser: both seats build
 * the same towers from the same gold, so a relic, a purchased blessing or a
 * hand-played powerup would be a private advantage the rival cannot answer.
 * The scene reads these flags; `tests/duel-rules.test.js` pins them.
 */
export const PVP_MATCH_RULES = Object.freeze({
  powerups: false,
  blessings: false,
  relics: false,
});

export const PVP_RULES = Object.freeze({
  startingCoins: 260,
  baseHealth: 25,
  enemyHealthScale: 1,
  /** Seven pressure waves, two bounty waves, then the arena's boss. */
  waves: 10,
});

/** One board from its spec, exactly like a campaign map. */
const arenaBoard = (spec) => buildArena(spec);

/** Scenery is confined to the enemy's ground — the field around the keep is empty. */
const rock = (seed, count) => scatterProps(seed, { count, fromRow: 2, toRow: ARENA.buildRow - 1 });

// The three arenas differ in the spread of their portals and how hard the roads
// swing, never in the rules: same three approaches, same bottom-centre keep,
// same open field. A duel is not a different game with a different map language.
const CINDER_CROWN = arenaBoard({
  spawnCols: [4, 15, 27],
  wiggle: 2,
  rocks: rock('cinder-crown', 8),
});

const FROSTSPINE = arenaBoard({
  spawnCols: [5, 15, 25],
  wiggle: 0,
  rocks: rock('frostspine', 10),
});

const DUST_MERIDIAN = arenaBoard({
  spawnCols: [6, 14, 26],
  wiggle: 1,
  rocks: rock('dust-meridian', 7),
});

/**
 * The script both players run. A plain list, no RNG: seven pressure waves, two
 * **bounty** waves that pay a lump of gold and double gold per kill, the
 * mid-boss at wave 5, and the arena's own boss closing the match at wave 10.
 *
 * The bounty waves are the reason a duel is not only a race. They arrive on a
 * fixed beat, they are announced on both phones at the same moment, and they
 * reward a board that can burst rather than one that only turtles — so the
 * answer to "who is ahead" changes twice per match.
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
      name: 'Gold Caravan',
      bounty: true,
      bountyGold: 220,
      bountyScore: 300,
      bountyKillGold: 2,
      groups: [
        { type: 'grunt', count: 18, interval: 400 },
        { type: 'runner', count: 12, interval: 320, delay: 900 },
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
      name: 'Toll of the Dunes',
      bounty: true,
      bountyGold: 260,
      bountyScore: 360,
      bountyKillGold: 2,
      groups: [
        { type: 'swarm', count: 24, interval: 220 },
        { type: 'runner', count: 12, interval: 300, delay: 800 },
        { type: 'grunt', count: 10, interval: 420, delay: 1600 },
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
    rules: PVP_MATCH_RULES,
    arenaId: arena.id,
    themeName: THEMES[arena.theme]?.name || arena.name,
  };
}

/** Arena dimensions in tiles, derived from the data (never hard-coded). */
export function arenaSize(arena) {
  const layout = arena?.layout || [];
  return { rows: layout.length, cols: layout[0]?.length || 0 };
}
