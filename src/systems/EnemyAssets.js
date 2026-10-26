/**
 * EnemyAssets — which enemy sheets a battle actually needs, and the clips
 * that go with them.
 *
 * The game ships 20 creatures × 5 biome re-grades × 3 escalation tiers = 210
 * enemy strips. Loading all of them at boot cost **184 megapixels of decoded
 * texture** (≈736 MB once uploaded) for a single battle that uses at most 41
 * of them — on a phone GPU that is a black-screen waiting to happen, and it was
 * the single largest item in the boot profile.
 *
 * So the sheets are now loaded per battle, by this module:
 *
 *   • the types the level's waves actually spawn, plus its boss;
 *   • only the biome re-grades for that level's theme;
 *   • endless runs get every creature, because their wave list is generated.
 *
 * Textures already in the TextureManager are skipped, so returning to a battle
 * is still instant and nothing is ever reloaded or duplicated.
 */

import { ENEMY_SHEETS, ENEMY_SKINS } from '../data/spireManifest.js';

export const ENEMY_DIRECTIONS = 3;

/**
 * textureKey -> creature key. `enemy-grunt-desert-e1` and `enemy-grunt` are the
 * same creature for animation purposes; the manifest only keys the base.
 */
const OWNER = (() => {
  const map = new Map();
  for (const [type, sheets] of Object.entries(ENEMY_SKINS)) {
    map.set(`enemy-${type}`, type);
    for (const tiers of Object.values(sheets)) {
      for (const textureKey of tiers) map.set(textureKey, type);
    }
  }
  for (const type of Object.keys(ENEMY_SHEETS)) {
    if (!map.has(`enemy-${type}`)) map.set(`enemy-${type}`, type);
  }
  return map;
})();

/** The creature a texture belongs to, or null for anything else. */
export function enemyOwner(textureKey) {
  return OWNER.get(textureKey) || null;
}

/** Base sheet + this battlefield's three tiers for one creature. */
export function enemyTexturesForType(type, theme = 'grassland') {
  const out = new Set();
  if (!ENEMY_SHEETS[type]) return out;
  out.add(`enemy-${type}`);
  const sheets = ENEMY_SKINS[type] || {};
  const tiers = sheets[theme] || sheets.grassland || Object.values(sheets)[0] || [];
  for (const key of tiers) out.add(key);
  return out;
}

/** Every creature type the level can put on the field. */
export function enemyTypesForLevel(level) {
  const types = new Set();
  for (const wave of level?.waves || []) {
    for (const group of wave?.groups || []) {
      if (group?.type) types.add(group.type);
    }
    // Endless waves carry a rotating boss per wave.
    if (wave?.bossKey) types.add(wave.bossKey);
  }
  if (level?.boss) types.add(level.boss);
  // Endless (and anything else whose wave list is generated at runtime) can
  // field the whole bestiary, so it must load the whole bestiary for its biome.
  if (level?.endless) {
    for (const type of Object.keys(ENEMY_SHEETS)) types.add(type);
  }
  return types;
}

/**
 * The texture keys a battle needs. Sorted so the load order (and therefore the
 * loading screen) is deterministic.
 */
export function enemyTexturesForLevel(level) {
  const theme = level?.theme || 'grassland';
  const keys = new Set();
  for (const type of enemyTypesForLevel(level)) {
    for (const key of enemyTexturesForType(type, theme)) keys.add(key);
  }
  // Endless titans are fielded by the generator, not by a wave entry.
  if (level?.endless) {
    for (const type of ['voidherald', 'obsidian']) {
      for (const key of enemyTexturesForType(type, theme)) keys.add(key);
    }
  }
  return [...keys].sort();
}

/**
 * Queue the sheets that are not in the TextureManager yet. Safe to call on
 * every battle: already-loaded strips are skipped, never re-queued.
 */
export function queueEnemySheets(loader, textures, level) {
  const keys = enemyTexturesForLevel(level);
  let queued = 0;
  for (const textureKey of keys) {
    const existing = textures.exists(textureKey) ? textures.get(textureKey) : null;
    // A single-frame texture under an enemy key is the BootScene placeholder
    // (TextureFactory draws one when the pack is absent). The real strip must
    // replace it — otherwise the clips have no frames to play.
    if (existing && existing.frameTotal > 1) continue;
    if (existing) textures.remove(textureKey);
    const type = enemyOwner(textureKey);
    const sheet = ENEMY_SHEETS[type];
    if (!sheet) continue;
    loader.spritesheet(textureKey, `assets/enemies/${textureKey}.png`, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
    queued += 1;
  }
  return { keys, queued };
}

/**
 * Register the idle / move / death clips for the given textures.
 *
 * One clip trio per direction row: rows `dir`, `3 + dir`, `6 + dir`; the bare
 * `-idle/-move/-death` keys alias the south row for call sites that predate the
 * direction split. Frame counts come from the manifest, never assumed.
 */
export function createEnemyAnims(scene, textureKeys) {
  const keys = textureKeys || Object.keys(scene.textures.list).filter((key) => OWNER.has(key));
  for (const textureKey of keys) {
    if (!scene.textures.exists(textureKey)) continue;
    const type = enemyOwner(textureKey);
    const sheet = ENEMY_SHEETS[type];
    if (!sheet) continue;
    const cols = scene.textures.get(textureKey).source[0].width / sheet.frameWidth;
    for (let direction = 0; direction < ENEMY_DIRECTIONS; direction += 1) {
      createClips(scene, textureKey, sheet, cols, direction);
    }
    createClips(scene, textureKey, sheet, cols, 0, '');
  }
}

function createClips(scene, textureKey, sheet, cols, direction, suffixOverride = null) {
  const suffix = suffixOverride === null ? `-d${direction}` : suffixOverride;
  const row = (index) => (index + direction) * cols;
  const clips = [
    ['idle', sheet.idle, row(0), 8, -1],
    ['move', sheet.move, row(3), 10, -1],
    ['death', sheet.death, row(6), 12, 0],
  ];
  for (const [clip, frames, start, frameRate, repeat] of clips) {
    if (frames <= 1) continue;
    const key = `${textureKey}${suffix}-${clip}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(textureKey, { start, end: start + frames - 1 }),
      frameRate,
      repeat,
    });
  }
}
