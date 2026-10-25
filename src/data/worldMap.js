/**
 * worldMap.js — the geography of the Bastion.
 *
 * The world map is the game's hub, so it has to be the *same* world the stages
 * are fought in: every region is a theme from `levelData.js`, every banner is a
 * real level id, and every building points at a screen that already exists.
 * Nothing here knows about the DOM — `WorldMapUI` reads this file and paints it,
 * and `tests/world-map.test.js` proves every entry has a live destination.
 *
 * Coordinates are percentages of the terrain plate (1536 x 1024), so a camera
 * zoom or a phone resize never moves a building off its clearing. `x` / `y`
 * are the *foot* of a landmark: the sprite is drawn upwards from that point,
 * which is what makes a 2.5D map read as ground rather than as stickers.
 */

import { ALL_LEVELS, ENDLESS_LEVEL, LEVELS, THEMES, getLevel } from './levelData.js';
import { ACHIEVEMENTS } from './achievements.js';

/** The painted continent. One image, no tiles, no seams to manage. */
export const PLATE = Object.freeze({
  width: 1536,
  height: 1024,
  src: '/assets/worldmap/terrain-src.jpg',
});

/**
 * Regions, in the order the campaign visits them.
 *
 * `levelId` is looked up from the level that actually uses that theme, so a
 * region can never claim a stage that does not exist. `label` is where the
 * name is pinned; `glow` is the soft biome wash behind it (an ellipse, never a
 * box — a rectangle on a painted map reads as a UI bug).
 */
export const REGIONS = Object.freeze([
  {
    id: 'verdant',
    theme: 'grassland',
    levelId: 'level-1',
    label: { x: 15, y: 24 },
    glow: { x: 21, y: 32, rx: 15, ry: 13 },
  },
  {
    id: 'sunscorch',
    theme: 'desert',
    levelId: 'level-2',
    label: { x: 88, y: 15 },
    glow: { x: 85, y: 31, rx: 13, ry: 13 },
  },
  {
    id: 'frostbite',
    theme: 'ice',
    levelId: 'level-3',
    label: { x: 62, y: 11 },
    glow: { x: 60, y: 15, rx: 17, ry: 9 },
  },
  {
    id: 'prism',
    theme: 'crystal',
    levelId: 'level-4',
    label: { x: 87, y: 60 },
    glow: { x: 79, y: 69, rx: 13, ry: 12 },
  },
  {
    id: 'ashen',
    theme: 'volcanic',
    levelId: 'endless',
    label: { x: 27, y: 85 },
    glow: { x: 24, y: 82, rx: 17, ry: 11 },
  },
].map((region) => {
  const theme = THEMES[region.theme];
  return Object.freeze({
    ...region,
    name: theme.name,
    accent: theme.accent,
    fog: theme.fog,
    blurb: theme.blurb,
  });
}));

/**
 * Every interactive thing on the plate.
 *
 *   panel     which panel opens (see WorldMapUI.panelMarkup)
 *   levelId   set only on campaign banners — the stage that banner launches
 *   target    set only on navigate-only buildings — the screen to open
 *
 * `width` is the sprite's drawn width in plate pixels; height follows the art.
 * A banner is narrow and tall, a castle is wide and squat, and both keep their
 * proportions at every zoom because nothing here is stretched.
 */
export const LANDMARKS = Object.freeze([
  {
    id: 'castle',
    name: 'Bastion Castle',
    kind: 'castle',
    panel: 'overview',
    art: '/assets/worldmap/landmark_castle.png',
    x: 48,
    y: 46,
    width: 200,
    tag: 'THE BASTION',
    blurb: 'The last keep. Every road on this map ends at its gate.',
  },
  {
    id: 'banner-verdant',
    name: THEMES.grassland.name,
    kind: 'banner',
    panel: 'briefing',
    levelId: 'level-1',
    art: '/assets/worldmap/landmark_banner-verdant.png',
    x: 24,
    y: 42,
    width: 92,
    tag: 'STAGE I',
  },
  {
    id: 'banner-sunscorch',
    name: THEMES.desert.name,
    kind: 'banner',
    panel: 'briefing',
    levelId: 'level-2',
    art: '/assets/worldmap/landmark_banner-sunscorch.png',
    x: 82,
    y: 36,
    width: 92,
    tag: 'STAGE II',
  },
  {
    id: 'banner-frostbite',
    name: THEMES.ice.name,
    kind: 'banner',
    panel: 'briefing',
    levelId: 'level-3',
    art: '/assets/worldmap/landmark_banner-frostbite.png',
    x: 44,
    y: 22,
    width: 92,
    tag: 'STAGE III',
  },
  {
    id: 'banner-prism',
    name: THEMES.crystal.name,
    kind: 'banner',
    panel: 'briefing',
    levelId: 'level-4',
    art: '/assets/worldmap/landmark_banner-prism.png',
    x: 73,
    y: 66,
    width: 92,
    tag: 'STAGE IV',
  },
  {
    id: 'banner-endless',
    name: ENDLESS_LEVEL.name,
    kind: 'banner',
    panel: 'briefing',
    levelId: 'endless',
    art: '/assets/worldmap/landmark_banner-endless.png',
    x: 17,
    y: 76,
    width: 92,
    tag: 'ENDLESS SIEGE',
  },
  {
    id: 'forge',
    name: 'The Forge',
    kind: 'building',
    panel: 'destination',
    target: 'forge',
    art: '/assets/worldmap/landmark_forge.png',
    x: 33,
    y: 47,
    width: 112,
    tag: 'FORGE',
    blurb: 'Relics, tower doctrine and specialisations. Everything permanent is bought here.',
  },
  {
    id: 'library',
    name: 'Royal Library',
    kind: 'building',
    panel: 'library',
    art: '/assets/worldmap/landmark_library.png',
    x: 59.5,
    y: 38,
    width: 104,
    tag: 'LIBRARY',
    blurb: 'The codex, the field manual and the numbers behind every path.',
  },
  {
    id: 'warroom',
    name: 'War Room',
    kind: 'building',
    panel: 'warroom',
    art: '/assets/worldmap/landmark_warroom.png',
    x: 40,
    y: 58,
    width: 120,
    tag: 'WAR ROOM',
    blurb: 'Eight ways to fight that are not the campaign. Pick one and deploy.',
  },
  {
    id: 'champions',
    name: "Champions' Hall",
    kind: 'building',
    panel: 'destination',
    target: 'leaderboard',
    art: '/assets/worldmap/landmark_champions.png',
    x: 55.5,
    y: 58,
    width: 112,
    tag: 'CHAMPIONS',
    blurb: 'The standings. Every run that ever finished is carved into these walls.',
  },
  {
    id: 'monument',
    name: "Heroes' Monument",
    kind: 'building',
    panel: 'destination',
    target: 'achievements',
    art: '/assets/worldmap/landmark_monument.png',
    x: 49,
    y: 66,
    width: 106,
    tag: 'MONUMENT',
    blurb: 'Medals for the deeds the keep remembers. New ones are paid out the moment you earn them.',
  },
  {
    id: 'shrine',
    name: 'Shrine of the Day',
    kind: 'building',
    panel: 'shrine',
    daily: true,
    art: '/assets/worldmap/landmark_shrine.png',
    x: 67,
    y: 50,
    width: 100,
    tag: 'SHRINE',
    blurb: 'One rule changes every day. Clear it once for the gems, keep the streak alive.',
  },
  {
    id: 'arena',
    name: 'Mirror Arena',
    kind: 'building',
    panel: 'arena',
    duel: true,
    art: '/assets/worldmap/landmark_arena.png',
    x: 35.5,
    y: 34,
    width: 112,
    tag: 'MIRROR ARENA',
    blurb: 'Two keepers, mirrored boards, one relay. First core down loses.',
  },
]);

/* ---------------------------------------------------------------------------
   Queries — pure, so the tests can drive them without a browser.
   ------------------------------------------------------------------------- */

const landmarksById = new Map(LANDMARKS.map((entry) => [entry.id, entry]));

/** @returns {object|null} */
export function getLandmark(id) {
  return landmarksById.get(id) || null;
}

/** The banner a stage is planted at. */
export function landmarkForLevel(levelId) {
  return LANDMARKS.find((entry) => entry.levelId === levelId) || null;
}

/** The region a stage is fought in. */
export function regionForLevel(levelId) {
  return REGIONS.find((region) => region.levelId === levelId) || null;
}

/**
 * Where a stage stands in the player's save.
 *
 *   locked   the gate has not opened yet
 *   next     open, unbeaten, and the earliest such stage — the current objective
 *   cleared  at least one star banked
 *   open     unlocked and replayable, but not the objective
 *
 * Endless has no stars, so "cleared" there means a recorded best wave.
 */
export function stageState(progress, levelId) {
  const level = getLevel(levelId);
  if (!level || !progress) return 'locked';
  if (!progress.isUnlocked(levelId)) return 'locked';
  const cleared = level.endless
    ? (progress.profile?.endlessBestWave || 0) > 0
    : progress.starsFor(levelId) > 0;
  if (cleared) return 'cleared';
  return currentObjective(progress)?.id === levelId ? 'next' : 'open';
}

/**
 * The one stage the player should fight next: the first unlocked stage with no
 * star on it, in campaign order, then Endless once the campaign is done.
 */
export function currentObjective(progress) {
  if (!progress) return LEVELS[0] || null;
  for (const level of LEVELS) {
    if (!progress.isUnlocked(level.id)) return null;
    if (progress.starsFor(level.id) === 0) return level;
  }
  if (progress.isUnlocked(ENDLESS_LEVEL.id) && (progress.profile?.endlessBestWave || 0) === 0) {
    return ENDLESS_LEVEL;
  }
  return null;
}

/** Campaign totals, for the castle overview. */
export function campaignSummary(progress) {
  const cleared = LEVELS.filter((level) => progress?.starsFor(level.id) > 0).length;
  const unlocked = LEVELS.filter((level) => progress?.isUnlocked(level.id)).length;
  return {
    cleared,
    total: LEVELS.length,
    unlocked,
    stars: progress?.totalStars || 0,
    maxStars: progress?.maxStars || 0,
    medals: progress?.profile?.achievements?.length || 0,
    maxMedals: ACHIEVEMENTS.length,
    gold: progress?.gold || 0,
    gems: progress?.gems || 0,
  };
}

/** Every real level id that has a banner — used to prove none went missing. */
export const BANNER_LEVEL_IDS = Object.freeze(
  LEVELS.concat([ENDLESS_LEVEL]).map((level) => level.id)
);

/** Every level id in the game (campaign, endless, and the war-room stages). */
export const ALL_LEVEL_IDS = Object.freeze(ALL_LEVELS.map((level) => level.id));
