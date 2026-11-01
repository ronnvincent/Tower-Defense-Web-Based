/**
 * VillageDressing.js — the cottages, fences and kitchen gardens of Havenbrook.
 *
 * The tile renderer paints ground, roads, water, rock and scatter. It has no
 * concept of "a building", because no other battlefield in the game has one.
 * The village is dressed here instead: a flat list of props with tile-unit
 * anchors, turned into sprites once, at board depth, under the units and under
 * the lane arrows.
 *
 * Two rules the data and this module both keep:
 *
 *   · **nothing is drawn in the build field.** Every prop is anchored on the
 *     horde's half or on the bottom rim, so a cottage can never stand where a
 *     tower may be built and no player ever loses a square to scenery;
 *   · **everything is a texture, never a shape.** Each key below is a real PNG
 *     in `public/assets/village/`, built by `scripts/build_village_props.py`
 *     from Tiny Swords (CC0) art or drawn there. A missing file is skipped, not
 *     faked with a rectangle.
 */
import { VILLAGE_PROPS } from '../data/tutorialScript.js';

/** Key -> file, for every prop the village can place. */
export const VILLAGE_PROP_ART = Object.freeze({
  house: 'assets/village/house.png',
  watchtower: 'assets/village/watchtower.png',
  mine: 'assets/village/mine.png',
  'tree-1': 'assets/village/tree-1.png',
  'tree-2': 'assets/village/tree-2.png',
  'tree-3': 'assets/village/tree-3.png',
  'tree-4': 'assets/village/tree-4.png',
  mushroom: 'assets/village/mushroom.png',
  'mushroom-big': 'assets/village/mushroom-big.png',
  bush: 'assets/village/bush.png',
  pumpkin: 'assets/village/pumpkin.png',
  'pumpkin-big': 'assets/village/pumpkin-big.png',
  sheep: 'assets/village/sheep.png',
  well: 'assets/village/well.png',
  fence: 'assets/village/fence.png',
  haystack: 'assets/village/haystack.png',
});

/** Texture key the scene asks for, so the loader and the painter cannot drift. */
export const villageTextureKey = (propKey) => `village-${propKey}`;

/**
 * The villager sheets, for the tutorial preload.
 *
 * These are **spritesheets**, not images: the scene plays two clips out of each
 * (idle on row 0, walk on row 1), so the loader has to cut the grid or Phaser
 * hands `play()` a single-frame texture and the clip has nothing to animate.
 * `frameWidth`/`frameHeight` are the cell size `scripts/build_npc_sheets.py`
 * writes — a 1152x384 sheet is 6 columns by 2 rows of 192 px.
 */
export const VILLAGER_ART = Object.freeze({
  'npc-mara': { path: 'assets/units/npc-mara.png', frameWidth: 192, frameHeight: 192 },
  'npc-doren': { path: 'assets/units/npc-doren.png', frameWidth: 192, frameHeight: 192 },
  'npc-pip': { path: 'assets/units/npc-pip.png', frameWidth: 192, frameHeight: 192 },
  'npc-hollis': { path: 'assets/units/npc-hollis.png', frameWidth: 192, frameHeight: 192 },
  'npc-bram': { path: 'assets/units/npc-bram.png', frameWidth: 192, frameHeight: 192 },
  // Doren's walking stick: a single still, so it rides along as an image.
  'npc-staff': { path: 'assets/units/npc-staff.png' },
});

/**
 * Queue the village art on a Phaser loader.
 *
 * Idempotent by texture key: a restart in the same page re-uses what is already
 * on the TextureManager instead of downloading the same eleven kilobytes twice.
 */
export function queueVillageArt(load, textures) {
  if (!load) return;
  for (const [key, path] of Object.entries(VILLAGE_PROP_ART)) {
    const texture = villageTextureKey(key);
    if (!textures?.exists?.(texture)) load.image(texture, path);
  }
  for (const [key, art] of Object.entries(VILLAGER_ART)) {
    if (textures?.exists?.(key)) continue;
    if (art.frameWidth) {
      load.spritesheet(key, art.path, { frameWidth: art.frameWidth, frameHeight: art.frameHeight });
    } else {
      load.image(key, art.path);
    }
  }
}

/**
 * Paint the set dressing onto a battlefield.
 *
 * Depth sits between the tiles (1-3) and the build pads (4): a cottage is
 * terrain, so it must never cover a pad, a lane arrow, a creep or a tower.
 * Returns the images it made so a test (or a restart) can find them again.
 *
 * @param {Phaser.Scene} scene
 * @param {{tileSize?:number, props?:object[], depth?:number}} [options]
 */
export function drawVillageDressing(scene, { tileSize = 64, props = VILLAGE_PROPS, depth = 3.4 } = {}) {
  if (!scene?.add?.image) return [];
  const made = [];
  const shadows = scene.add.graphics?.().setDepth(depth - 0.05);
  if (shadows) shadows.setName?.('village-shadows');

  props.forEach((prop, index) => {
    const texture = villageTextureKey(prop.key);
    if (!scene.textures?.exists?.(texture)) return;
    const x = prop.col * tileSize;
    const y = prop.row * tileSize;
    const image = scene.add
      .image(x, y, texture)
      .setOrigin(0.5, 1)
      .setDepth(depth + (prop.depth ?? 0))
      .setScale(prop.scale ?? 1);
    image.setName?.(`village-prop-${index}`);
    if (prop.flip) image.setFlipX(true);
    // A soft contact shadow is what makes a flat sprite sit on the ground
    // instead of float above it. Painted into one static graphics object, so a
    // village of thirty props costs one draw call, not thirty.
    if (shadows && typeof shadows.fillEllipse === 'function') {
      const width = image.displayWidth;
      const height = image.displayHeight;
      shadows.fillStyle(0x05070c, 0.2);
      shadows.fillEllipse(x, y - height * 0.02, Math.min(width * 0.9, tileSize * 1.7), Math.max(9, height * 0.11));
    }
    made.push(image);
  });
  return made;
}
