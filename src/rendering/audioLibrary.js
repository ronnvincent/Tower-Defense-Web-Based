/**
 * audioLibrary.js — every recorded sound the game owns, in one table.
 *
 * The project used to ship seven foley clips and synthesise everything else.
 * Request 44 replaced that with a real library: 60 files, each one named for
 * the thing in the game that triggers it, so "which sample plays when a mortar
 * fires" is answered by data rather than by a branch buried in AudioSynth.
 *
 * Two rules this table exists to enforce:
 *
 *   1. **Nothing is invented.** Every `file` here is a path that exists in
 *      `public/assets/audio/`. `tests/audio-library.test.js` walks the table and
 *      fails if a path is missing, so a typo cannot ship as silence.
 *   2. **Every weapon sounds like itself.** `TOWER_SAMPLES` maps each defence
 *      line in `towerData` / `royalDefences` to its own recording; a line with no
 *      mapping is a loud failure in the tests, not a tower that fires silently.
 *
 * Licence provenance lives in `docs/audio-credits.md`; each entry records its
 * pack here so the two can be cross-checked without listening to anything.
 *
 * This file is pure data — no AudioContext, no fetch, no DOM — so it can be
 * unit-tested and imported by the loader without touching the runtime.
 */

/** Root of the sample tree, relative to the site root (Vite copies `public/`). */
export const AUDIO_ROOT = '/assets/audio';

/**
 * How loud each family sits under the shared `sfx` bus, and how closely two
 * plays of the same key may follow each other.
 *
 * The cooldowns are the anti-spam rule from §5 of the brief: eight towers all
 * firing on one frame used to land eight copies of the same sample inside a
 * millisecond, which is not "eight shots" to the ear, it is one clipped bang.
 */
export const FAMILY = Object.freeze({
  ui: { gain: 0.55, cooldownMs: 45 },
  wall: { gain: 0.6, cooldownMs: 55 },
  tower: { gain: 0.62, cooldownMs: 60 },
  enemy: { gain: 0.4, cooldownMs: 90 },
  boss: { gain: 0.8, cooldownMs: 400 },
  cue: { gain: 0.75, cooldownMs: 900 },
});

/**
 * The catalogue.
 *
 * `variants` is what keeps a wall under sustained attack from sounding like one
 * sample on repeat: the bank cycles through the list per hit.
 *
 * @typedef {{
 *   file: string, family: keyof typeof FAMILY, gain?: number,
 *   cooldownMs?: number, rate?: number, pack: string,
 * }} SoundEntry
 * @type {Record<string, SoundEntry>}
 */
export const AUDIO_LIBRARY = Object.freeze({
  /* ------------------------------------------------------------------ UI */
  'ui.click': { file: 'ui/ui_click.ogg', family: 'ui', pack: 'kenney-interface' },
  'ui.hover': { file: 'ui/ui_hover.ogg', family: 'ui', gain: 0.32, cooldownMs: 70, pack: 'kenney-ui' },
  'ui.confirm': { file: 'ui/ui_confirm.ogg', family: 'ui', pack: 'kenney-interface' },
  'ui.cancel': { file: 'ui/ui_cancel.ogg', family: 'ui', pack: 'kenney-interface' },
  'ui.error': { file: 'ui/ui_error.ogg', family: 'ui', gain: 0.62, pack: 'kenney-interface' },
  'ui.place': { file: 'ui/ui_place.ogg', family: 'ui', pack: 'kenney-interface' },
  'ui.upgrade': { file: 'ui/ui_upgrade.ogg', family: 'ui', pack: 'kenney-interface' },
  'ui.coins': { file: 'ui/ui_coins.ogg', family: 'ui', gain: 0.5, cooldownMs: 120, pack: 'kenney-rpg' },
  'ui.panelOpen': { file: 'ui/ui_panel_open.ogg', family: 'ui', gain: 0.45, pack: 'kenney-interface' },
  'ui.panelClose': { file: 'ui/ui_panel_close.ogg', family: 'ui', gain: 0.45, pack: 'kenney-interface' },
  'ui.toggle': { file: 'ui/ui_toggle.ogg', family: 'ui', gain: 0.45, pack: 'kenney-ui' },
  'ui.waveStart': { file: 'ui/ui_wave_start.ogg', family: 'ui', gain: 0.7, cooldownMs: 500, pack: 'kenney-interface' },
  'ui.warning': { file: 'ui/ui_warning.ogg', family: 'ui', gain: 0.6, cooldownMs: 1500, pack: 'kenney-impact' },

  /* ---------------------------------------------------------------- walls */
  // Three wood hits, two stone hits and a separate break for each: a barricade
  // under a wave is hit dozens of times a second and must not machine-gun.
  'wall.woodHit': {
    file: 'walls/wall_wood_hit_1.ogg',
    family: 'wall',
    variants: ['walls/wall_wood_hit_1.ogg', 'walls/wall_wood_hit_2.ogg', 'walls/wall_wood_hit_3.ogg'],
    pack: 'kenney-impact',
  },
  'wall.woodBreak': { file: 'walls/wall_wood_break.ogg', family: 'wall', gain: 0.75, cooldownMs: 150, pack: 'kenney-impact' },
  'wall.stoneHit': {
    file: 'walls/wall_stone_hit_1.ogg',
    family: 'wall',
    variants: ['walls/wall_stone_hit_1.ogg', 'walls/wall_stone_hit_2.ogg'],
    pack: 'kenney-impact',
  },
  'wall.stoneBreak': { file: 'walls/wall_stone_break.ogg', family: 'wall', gain: 0.8, cooldownMs: 150, pack: 'kenney-impact' },
  'wall.metalHit': { file: 'walls/wall_metal_hit.ogg', family: 'wall', gain: 0.55, pack: 'kenney-impact' },
  'wall.build': { file: 'walls/wall_build.ogg', family: 'wall', gain: 0.55, cooldownMs: 200, pack: 'kenney-impact' },
  'wall.upgrade': { file: 'walls/wall_upgrade.ogg', family: 'wall', gain: 0.6, cooldownMs: 200, pack: 'kenney-rpg' },

  /* --------------------------------------------------------------- towers */
  'tower.archer': { file: 'towers/tower_archer.ogg', family: 'tower', pack: 'kenney-rpg' },
  'tower.crossbow': { file: 'towers/tower_crossbow.ogg', family: 'tower', pack: 'kenney-rpg' },
  'tower.gatling': { file: 'towers/tower_gatling.ogg', family: 'tower', gain: 0.5, cooldownMs: 45, pack: 'kenney-impact' },
  'tower.cannon': { file: 'towers/tower_cannon.ogg', family: 'tower', gain: 0.7, pack: 'kenney-impact' },
  'tower.mortar': { file: 'towers/tower_mortar.ogg', family: 'tower', gain: 0.68, pack: 'kenney-impact' },
  'tower.royalArtillery': { file: 'towers/tower_royalArtillery.ogg', family: 'tower', gain: 0.8, cooldownMs: 120, pack: 'kenney-impact' },
  'tower.siegeBallista': { file: 'towers/tower_siegeBallista.ogg', family: 'tower', gain: 0.6, pack: 'kenney-rpg' },
  'tower.arcaneSniper': { file: 'towers/tower_arcaneSniper.ogg', family: 'tower', pack: 'kenney-digital' },
  'tower.rimeTower': { file: 'towers/tower_rimeTower.ogg', family: 'tower', pack: 'kenney-digital' },
  'tower.frost': { file: 'towers/tower_frost.ogg', family: 'tower', pack: 'kenney-digital' },
  'tower.tesla': { file: 'towers/tower_tesla.ogg', family: 'tower', gain: 0.55, pack: 'kenney-digital' },
  'tower.skybreaker': { file: 'towers/tower_skybreaker.ogg', family: 'tower', pack: 'kenney-digital' },
  'tower.runes': { file: 'towers/tower_runes.ogg', family: 'tower', gain: 0.55, pack: 'kenney-digital' },
  'tower.obelisk': { file: 'towers/tower_obelisk.ogg', family: 'tower', gain: 0.6, cooldownMs: 300, pack: 'kenney-digital' },
  'tower.spikeTrap': { file: 'towers/tower_spikeTrap.ogg', family: 'tower', gain: 0.5, pack: 'kenney-impact' },
  'tower.workshop': { file: 'towers/tower_workshop.ogg', family: 'tower', pack: 'kenney-rpg' },
  'tower.forge': { file: 'towers/tower_forge.ogg', family: 'tower', pack: 'kenney-rpg' },
  'tower.flamer': { file: 'towers/tower_flamer.ogg', family: 'tower', gain: 0.45, rate: 0.85, cooldownMs: 90, pack: 'kenney-impact' },
  'tower.venom': { file: 'towers/tower_venom.ogg', family: 'tower', gain: 0.5, pack: 'kenney-impact' },
  'tower.harpoon': { file: 'towers/tower_harpoon.ogg', family: 'tower', pack: 'kenney-rpg' },
  'tower.banner': { file: 'towers/tower_banner.ogg', family: 'tower', gain: 0.5, cooldownMs: 400, pack: 'kenney-digital' },

  /* -------------------------------------------------------------- enemies */
  'enemy.step': {
    file: 'enemies/enemy_step_1.ogg',
    family: 'enemy',
    gain: 0.3,
    cooldownMs: 160,
    variants: ['enemies/enemy_step_1.ogg', 'enemies/enemy_step_2.ogg', 'enemies/enemy_step_3.ogg'],
    pack: 'kenney-impact',
  },
  'enemy.hit': { file: 'enemies/enemy_hit.ogg', family: 'enemy', gain: 0.45, pack: 'kenney-impact' },
  'enemy.death': { file: 'enemies/enemy_death.ogg', family: 'enemy', gain: 0.55, cooldownMs: 120, pack: 'kenney-impact' },
  'boss.enter': { file: 'enemies/boss_enter.ogg', family: 'boss', pack: 'kenney-impact' },
  'boss.hit': { file: 'enemies/boss_hit.ogg', family: 'boss', gain: 0.65, cooldownMs: 180, pack: 'kenney-impact' },

  /* ------------------------------------------------------ victory / defeat */
  'cue.victory': { file: 'cues/cue_victory.ogg', family: 'cue', pack: 'kenney-jingles' },
  'cue.defeat': { file: 'cues/cue_defeat.ogg', family: 'cue', pack: 'kenney-jingles' },
  'cue.waveClear': { file: 'cues/cue_wave_clear.ogg', family: 'cue', gain: 0.55, cooldownMs: 1200, pack: 'kenney-jingles' },
});

/**
 * Defence line → its own recording.
 *
 * The keys are exactly the `typeKey`s the game builds towers from. Every
 * offensive line in `towerData.js` and `royalDefences.js` must appear here (a
 * test enforces it), so adding a tower without a sound is a failing build
 * rather than a silent gun.
 */
export const TOWER_SAMPLES = Object.freeze({
  archer: 'tower.archer',
  cannon: 'tower.cannon',
  frost: 'tower.frost',
  forge: 'tower.forge',
  runes: 'tower.runes',
  banner: 'tower.banner',
  crossbow: 'tower.crossbow',
  gatling: 'tower.gatling',
  flamer: 'tower.flamer',
  venom: 'tower.venom',
  harpoon: 'tower.harpoon',
  royalArtillery: 'tower.royalArtillery',
  siegeBallista: 'tower.siegeBallista',
  arcaneSniper: 'tower.arcaneSniper',
  mortar: 'tower.mortar',
  rimeTower: 'tower.rimeTower',
  tesla: 'tower.tesla',
  skybreaker: 'tower.skybreaker',
  workshop: 'tower.workshop',
  obelisk: 'tower.obelisk',
  spikeTrap: 'tower.spikeTrap',
});

/** Support buildings that pulse rather than fire. */
export const SUPPORT_SAMPLES = Object.freeze({
  workshop: 'tower.workshop',
  obelisk: 'tower.obelisk',
  banner: 'tower.banner',
});

/**
 * Wall material → the family of samples it takes when hit.
 * `barricade` is the wooden palisade; every stronger tier reads as stone.
 */
export const WALL_SAMPLES = Object.freeze({
  wood: 'wall.woodHit',
  stone: 'wall.stoneHit',
  metal: 'wall.metalHit',
});

/**
 * Music: one file per gameplay state, plus the crossfade length.
 *
 * `gain` is relative to the caller's music bus; the files were normalised to
 * −20 dBFS RMS at build time, so these numbers only decide how far under the
 * effects each state sits.
 */
export const MUSIC_TRACKS = Object.freeze({
  menu: { file: 'music/music_menu.ogg', gain: 0.85 },
  realm: { file: 'music/music_menu.ogg', gain: 0.85 },
  prep: { file: 'music/music_prep.ogg', gain: 0.85 },
  forge: { file: 'music/music_prep.ogg', gain: 0.8 },
  warroom: { file: 'music/music_prep.ogg', gain: 0.8 },
  battle: { file: 'music/music_battle.ogg', gain: 0.9 },
  intense: { file: 'music/music_intense.ogg', gain: 0.95 },
  boss: { file: 'music/music_boss.ogg', gain: 1 },
  victory: { file: 'music/music_victory.ogg', gain: 0.9 },
});

/** Seconds of equal-power crossfade between two music states. */
export const MUSIC_CROSSFADE = 1.4;

/** Resolve a catalogue id to its entry, or null for an unknown id. */
export function soundEntry(id) {
  return Object.prototype.hasOwnProperty.call(AUDIO_LIBRARY, id) ? AUDIO_LIBRARY[id] : null;
}

/** Every distinct file the library references (variants included), deduplicated. */
export function libraryFiles() {
  const files = new Set();
  for (const entry of Object.values(AUDIO_LIBRARY)) {
    if (entry.file) files.add(entry.file);
    for (const variant of entry.variants || []) files.add(variant);
  }
  return [...files].sort();
}

/** Every music file, deduplicated (several states share a track by design). */
export function musicFiles() {
  return [...new Set(Object.values(MUSIC_TRACKS).map((track) => track.file))].sort();
}

/** The recording for a defence line, or null if that line has none. */
export function towerSample(typeKey) {
  const id = TOWER_SAMPLES[typeKey];
  return id ? soundEntry(id) : null;
}
