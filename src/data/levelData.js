/**
 * levelData.js — the campaign: three hand-built levels plus Endless Siege.
 *
 * A level is a self-contained ruleset. GameScene reads it in init() and nothing
 * else in the game hard-codes "six waves" any more:
 *
 *   id / index      stable key and the 1-based order shown on the world map
 *   name / blurb    world-map copy
 *   theme / map     which tile palette and which ASCII battlefield to build
 *   waves           array of WaveManager wave definitions
 *   endless         true -> the wave list is generated forever
 *   startingCoins   economy seed for the run
 *   baseHealth      realm core HP for the run
 *   enemyHealthScale extra multiplier on top of the per-wave ramp
 *   reward          meta currencies granted on the first clear (scaled by stars)
 *   stars           base-health fractions for 2★ and 3★
 *   boss            archetype that closes the level
 *
 * The level-1 waves are the original six, untouched, so the first campaign is
 * still the battle the balance pass was tuned against.
 */

import { WAVES } from './waveData.js';

/** Visual palettes. `tileSuffix` selects the generated tile set. */
export const THEMES = {
  grassland: {
    id: 'grassland',
    name: 'Verdant Marches',
    tileSuffix: '',
    accent: '#8fd694',
    fog: 'rgba(30, 70, 46, 0.22)',
    portalTint: 0xb388ff,
    baseTint: 0xffffff,
    blurb: 'Old roads, three lanes, and a warlord who has already picked the middle one.',
  },
  desert: {
    id: 'desert',
    name: 'Sunscorch Mesa',
    tileSuffix: '-desert',
    accent: '#f0c060',
    fog: 'rgba(120, 82, 30, 0.24)',
    portalTint: 0xff9f43,
    baseTint: 0xfff1d0,
    blurb: 'A mesa splits the caravan road in two. Sandstorms make the fast things faster.',
  },
  ice: {
    id: 'ice',
    name: 'Frostbite Hollow',
    tileSuffix: '-ice',
    accent: '#9fd8ff',
    fog: 'rgba(30, 60, 96, 0.28)',
    portalTint: 0x7fdcff,
    baseTint: 0xe6f6ff,
    blurb: 'One canyon, one way in. The Warden freezes whatever answers the door.',
  },
  volcanic: {
    id: 'volcanic',
    name: 'Ashen Caldera',
    tileSuffix: '-volcanic',
    accent: '#ff8a5c',
    fog: 'rgba(90, 28, 18, 0.3)',
    portalTint: 0xff5d3b,
    baseTint: 0xffd9c2,
    blurb: 'No end, no dawn — only the next wave and the next boss.',
  },
};

/** Campaign levels in world-map order. */
export const LEVELS = [
  {
    id: 'level-1',
    index: 1,
    name: 'Verdant Marches',
    theme: 'grassland',
    map: 'grassland',
    blurb: THEMES.grassland.blurb,
    startingCoins: 220,
    baseHealth: 25,
    enemyHealthScale: 1,
    waves: WAVES,
    reward: { gold: 150, gems: 4 },
    stars: { two: 0.5, three: 0.85 },
    boss: 'warlord',
  },
  {
    id: 'level-2',
    index: 2,
    name: 'Sunscorch Mesa',
    theme: 'desert',
    map: 'desert',
    blurb: THEMES.desert.blurb,
    startingCoins: 240,
    baseHealth: 25,
    enemyHealthScale: 1.15,
    reward: { gold: 200, gems: 6 },
    stars: { two: 0.5, three: 0.85 },
    boss: 'sandwyrm',
    waves: [
      {
        name: 'Caravan Scouts',
        groups: [{ type: 'grunt', count: 12, interval: 900 }],
      },
      {
        name: 'Sand Runners',
        groups: [
          { type: 'grunt', count: 8, interval: 850 },
          { type: 'runner', count: 12, interval: 480, delay: 1200 },
        ],
      },
      {
        name: 'Scarab Tide',
        groups: [
          { type: 'swarm', count: 20, interval: 300 },
          { type: 'brute', count: 3, interval: 1600, delay: 1400 },
        ],
      },
      {
        name: 'Mesa Brutes',
        groups: [
          { type: 'brute', count: 5, interval: 1500 },
          { type: 'healer', count: 3, interval: 2100, delay: 1200 },
          { type: 'shield', count: 3, interval: 1500, delay: 1500 },
        ],
      },
      {
        name: 'Colossus at Noon',
        bossWave: true,
        bossKey: 'colossus',
        groups: [
          { type: 'swarm', count: 14, interval: 320 },
          { type: 'colossus', count: 1, interval: 0, delay: 2200 },
        ],
      },
      {
        name: 'The Shieldwall',
        groups: [
          { type: 'shield', count: 8, interval: 1300 },
          { type: 'brute', count: 6, interval: 1200, delay: 1200 },
          { type: 'runner', count: 12, interval: 380, delay: 1500 },
        ],
      },
      {
        name: 'The Dune Tyrant',
        bossWave: true,
        bossKey: 'sandwyrm',
        groups: [
          { type: 'brute', count: 4, interval: 1300 },
          { type: 'healer', count: 3, interval: 1800, delay: 1000 },
          { type: 'sandwyrm', count: 1, interval: 0, delay: 2600 },
          { type: 'runner', count: 10, interval: 340, delay: 1800 },
        ],
      },
    ],
  },
  {
    id: 'level-3',
    index: 3,
    name: 'Frostbite Hollow',
    theme: 'ice',
    map: 'ice',
    blurb: THEMES.ice.blurb,
    startingCoins: 260,
    baseHealth: 25,
    enemyHealthScale: 1.3,
    reward: { gold: 260, gems: 8 },
    stars: { two: 0.5, three: 0.85 },
    boss: 'frostwarden',
    waves: [
      {
        name: 'First Frost',
        groups: [{ type: 'grunt', count: 14, interval: 850 }],
      },
      {
        name: 'Glacier Sprint',
        groups: [
          { type: 'runner', count: 14, interval: 420 },
          { type: 'grunt', count: 8, interval: 800, delay: 1400 },
        ],
      },
      {
        name: 'Hollow Swarm',
        groups: [
          { type: 'swarm', count: 24, interval: 280 },
          { type: 'shield', count: 3, interval: 1600, delay: 1500 },
        ],
      },
      {
        name: 'Iron Cold',
        groups: [
          { type: 'brute', count: 6, interval: 1400 },
          { type: 'healer', count: 4, interval: 1900, delay: 1200 },
        ],
      },
      {
        name: 'The Hollow Colossus',
        bossWave: true,
        bossKey: 'colossus',
        groups: [
          { type: 'grunt', count: 10, interval: 700 },
          { type: 'colossus', count: 1, interval: 0, delay: 2400 },
        ],
      },
      {
        name: 'Rimeguard',
        groups: [
          { type: 'shield', count: 8, interval: 1200 },
          { type: 'swarm', count: 20, interval: 260, delay: 1000 },
        ],
      },
      {
        name: 'Avalanche',
        groups: [
          { type: 'brute', count: 8, interval: 1200 },
          { type: 'healer', count: 4, interval: 1800, delay: 1000 },
          { type: 'runner', count: 12, interval: 360, delay: 1400 },
        ],
      },
      {
        name: 'The Frost Warden',
        bossWave: true,
        bossKey: 'frostwarden',
        groups: [
          { type: 'shield', count: 6, interval: 1200 },
          { type: 'brute', count: 5, interval: 1200, delay: 1200 },
          { type: 'frostwarden', count: 1, interval: 0, delay: 2600 },
          { type: 'runner', count: 10, interval: 320, delay: 2000 },
        ],
      },
    ],
  },
];

/** Endless Siege — the fourth node on the world map, unlocked with level 2. */
export const ENDLESS_LEVEL = {
  id: 'endless',
  index: 4,
  name: 'Endless Siege',
  theme: 'volcanic',
  map: 'grassland',
  blurb: THEMES.volcanic.blurb,
  endless: true,
  startingCoins: 260,
  baseHealth: 25,
  enemyHealthScale: 1.2,
  reward: { gold: 0, gems: 0 },
  stars: { two: 0.5, three: 0.85 },
  boss: 'magmalord',
  waves: [],
};

/** Every selectable node, campaign first and Endless last. */
export const ALL_LEVELS = [...LEVELS, ENDLESS_LEVEL];

/** Look up a level by id (defaults to the first campaign level). */
export function getLevel(id) {
  return ALL_LEVELS.find((level) => level.id === id) || LEVELS[0];
}

/** The level after `id`, or null at the end of the campaign. */
export function getNextLevel(id) {
  const index = LEVELS.findIndex((level) => level.id === id);
  return index >= 0 ? LEVELS[index + 1] || null : null;
}

/** Bosses rotate through the endless run, one every fifth wave. */
export const ENDLESS_BOSSES = ['colossus', 'sandwyrm', 'frostwarden', 'magmalord'];

/**
 * Build wave `n` (1-based) of Endless Siege.
 *
 * The shape deliberately repeats a 5-wave pattern — pressure, swarm, armour,
 * mixed, boss — while counts and health ramp forever. Wave numbers feed
 * `waveHealthMultiplier`, so the stat curve keeps climbing without new data.
 */
export function makeEndlessWave(n) {
  const wave = Math.max(1, Math.floor(n));
  const step = ((wave - 1) % 5) + 1;
  const cycle = Math.floor((wave - 1) / 5);
  const extra = Math.min(18, cycle * 2);

  if (step === 5) {
    const bossKey = ENDLESS_BOSSES[cycle % ENDLESS_BOSSES.length];
    return {
      name: `Boss Cycle ${cycle + 1}`,
      bossWave: true,
      bossKey,
      groups: [
        { type: 'swarm', count: 10 + extra, interval: 260 },
        { type: 'brute', count: 3 + Math.min(6, cycle), interval: 1200, delay: 1200 },
        { type: bossKey, count: 1, interval: 0, delay: 2200 },
      ],
    };
  }

  if (step === 1) {
    return {
      name: `Endless Wave ${wave}`,
      groups: [
        { type: 'grunt', count: 12 + extra, interval: Math.max(320, 900 - wave * 12) },
        { type: 'runner', count: 6 + extra, interval: 420, delay: 1000 },
      ],
    };
  }
  if (step === 2) {
    return {
      name: `Endless Wave ${wave}`,
      groups: [
        { type: 'swarm', count: 18 + extra, interval: Math.max(180, 300 - wave * 4) },
        { type: 'shield', count: 2 + cycle, interval: 1400, delay: 1200 },
      ],
    };
  }
  if (step === 3) {
    return {
      name: `Endless Wave ${wave}`,
      groups: [
        { type: 'brute', count: 4 + Math.min(8, cycle), interval: 1300 },
        { type: 'healer', count: 2 + Math.min(4, cycle), interval: 1800, delay: 1200 },
      ],
    };
  }
  return {
    name: `Endless Wave ${wave}`,
    groups: [
      { type: 'shield', count: 4 + Math.min(6, cycle), interval: 1200 },
      { type: 'runner', count: 8 + extra, interval: 340, delay: 1000 },
      { type: 'swarm', count: 10 + extra, interval: 240, delay: 1200 },
    ],
  };
}

/**
 * Total enemies in an endless wave, used by the HUD counter before the wave
 * starts. Mirrors `countWaveEnemies` without importing waveData twice.
 */
export function countEndlessEnemies(n) {
  return makeEndlessWave(n).groups.reduce((sum, group) => sum + group.count, 0);
}
