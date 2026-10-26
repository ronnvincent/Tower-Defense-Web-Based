/**
 * unitArt.js — the hero and companion animation sheets.
 *
 * The Vanguard used to be four frames of one painted pose: an idle and a bob.
 * Every creep on the board walks, and every creep dies, so a commander that only
 * bobbed read as a sticker. The art now comes from Tiny Swords (Pixel Frog,
 * CC0 1.0 — `art-source/units/LICENSE-TinySwords-CC0.txt`), re-packed by
 * `scripts/build_unit_sheets.sh` into one PNG per character:
 *
 *   row 0 = idle      row 1 = walk      row 2 = attack
 *
 * Phaser slices the sheet into 192 px cells (128 for the sheep, 64 for the
 * skull) and every clip is registered from the frame counts recorded here, not
 * guessed at runtime — a row whose last cells are empty must never be played.
 */

/** Clip name -> row in the composed sheet. */
export const UNIT_CLIP_ROWS = Object.freeze({ idle: 0, walk: 1, attack: 2, die: 0 });

/** Clip name -> playback rate, tuned per clip so the sword lands on the beat. */
export const UNIT_CLIP_FPS = Object.freeze({ idle: 7, walk: 11, attack: 16, die: 15 });

/**
 * Every sheet, with the numbers `build_unit_sheets.sh` printed when it wrote it.
 * `cols` is the widest clip in the sheet: the shorter clips keep one empty cell
 * at the end rather than a duplicated pose.
 */
export const UNIT_SHEETS = Object.freeze({
  'hero-vanguard': {
    path: 'assets/units/hero-vanguard.png',
    frame: 192,
    cols: 6,
    clips: { idle: 6, walk: 6, attack: 6 },
    body: { x: 63, y: 45, w: 78, h: 91 },
  },
  'hero-captain': {
    path: 'assets/units/hero-captain.png',
    frame: 192,
    cols: 6,
    clips: { idle: 6, walk: 6, attack: 6 },
    body: { x: 63, y: 45, w: 78, h: 91 },
  },
  'hero-warlord': {
    path: 'assets/units/hero-warlord.png',
    frame: 192,
    cols: 6,
    clips: { idle: 6, walk: 6, attack: 6 },
    body: { x: 63, y: 45, w: 78, h: 91 },
  },
  'pet-squire': {
    path: 'assets/units/pet-squire.png',
    frame: 192,
    cols: 6,
    clips: { idle: 6, walk: 6, attack: 6 },
    body: { x: 67, y: 69, w: 58, h: 59 },
  },
  'pet-fletch': {
    path: 'assets/units/pet-fletch.png',
    frame: 192,
    cols: 8,
    clips: { idle: 6, walk: 6, attack: 8 },
    body: { x: 68, y: 59, w: 62, h: 75 },
  },
  'pet-ember': {
    path: 'assets/units/pet-ember.png',
    frame: 192,
    cols: 7,
    clips: { idle: 7, walk: 6, attack: 6 },
    body: { x: 53, y: 54, w: 74, h: 79 },
  },
  'pet-boomer': {
    path: 'assets/units/pet-boomer.png',
    frame: 192,
    cols: 7,
    clips: { idle: 6, walk: 6, attack: 7 },
    body: { x: 58, y: 67, w: 86, h: 68 },
  },
  'pet-wool': {
    path: 'assets/units/pet-wool.png',
    frame: 128,
    cols: 8,
    clips: { idle: 8, walk: 6, attack: 6 },
    body: { x: 43, y: 48, w: 43, h: 38 },
  },
  'fx-skull': {
    path: 'assets/units/fx-skull.png',
    frame: 64,
    cols: 14,
    clips: { die: 14 },
  },
});

/**
 * The body of one unit inside its 192 px cell, measured from the art itself
 * (`convert … -trim`) rather than guessed.
 *
 * Every cell is padded: the warrior is 78x91 in a 192 cell, the sheep 43x38 in
 * a 128 one. Without these numbers a sprite has to be eyeballed — scale it up
 * and its feet float above the road, move the origin and the swing misses. With
 * them `unitMetrics` can place the feet exactly on the entity's ground point at
 * any display height, so the hero and the creeps share one ground line.
 *
 *   x, y   top-left of the body inside the cell
 *   w, h   its size in pixels
 */
export function unitBody(key) {
  const sheet = UNIT_SHEETS[key];
  return sheet?.body || null;
}

/**
 * Scale and origin for drawing `key` at `height` world pixels.
 *
 * `originY` is the feet — the point that touches the ground — and `originX` is
 * the middle of the body, so a unit faces the same way whichever cell it is in.
 *
 * @returns {{ scale:number, originX:number, originY:number, height:number, width:number }}
 */
export function unitMetrics(key, height) {
  const sheet = UNIT_SHEETS[key];
  const body = sheet?.body;
  if (!sheet || !body) {
    return { scale: 1, originX: 0.5, originY: 0.5, height: sheet?.frame || 0, width: sheet?.frame || 0 };
  }
  const scale = height ? height / body.h : 1;
  return {
    scale,
    originX: (body.x + body.w / 2) / sheet.frame,
    originY: (body.y + body.h) / sheet.frame,
    height: body.h * scale,
    width: body.w * scale,
  };
}

/**
 * The frame numbers of one clip, as `{ start, end }` in a Phaser spritesheet.
 * Empty for a clip the sheet does not carry.
 */
export function unitFrames(key, clip) {
  const sheet = UNIT_SHEETS[key];
  const frames = sheet?.clips?.[clip] || 0;
  if (!frames) return null;
  const row = UNIT_CLIP_ROWS[clip] ?? 0;
  const start = row * sheet.cols;
  return { start, end: start + frames - 1, frames };
}

/** Load every sheet that is not already in the texture manager. */
export function queueUnitSheets(loader, textures, keys = Object.keys(UNIT_SHEETS)) {
  let queued = 0;
  for (const key of keys) {
    const sheet = UNIT_SHEETS[key];
    if (!sheet || textures.exists(key)) continue;
    loader.spritesheet(key, sheet.path, { frameWidth: sheet.frame, frameHeight: sheet.frame });
    queued += 1;
  }
  return queued;
}

/**
 * Register `<key>-idle`, `<key>-walk`, `<key>-attack` (and `<key>-die` when the
 * sheet carries one). Safe to call on every battle: existing clips are skipped.
 */
export function registerUnitAnims(scene, keys = Object.keys(UNIT_SHEETS)) {
  let created = 0;
  for (const key of keys) {
    if (!scene?.anims || !scene.textures?.exists?.(key)) continue;
    const sheet = UNIT_SHEETS[key];
    if (!sheet) continue;
    for (const clip of Object.keys(sheet.clips)) {
      const animKey = `${key}-${clip}`;
      if (scene.anims.exists(animKey)) continue;
      const range = unitFrames(key, clip);
      if (!range || range.frames < 2) continue;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: range.start, end: range.end }),
        frameRate: UNIT_CLIP_FPS[clip] || 10,
        repeat: clip === 'die' ? 0 : -1,
      });
      created += 1;
    }
  }
  return created;
}
