/**
 * Presentation data for the Spire art set.
 *
 * Gameplay numbers live in `towerData.js` and are NOT touched here — this file
 * only says which sprite belongs to which slot and how the two halves of a tower
 * (static base + rotating weapon) line up.
 *
 * Geometry conventions
 * --------------------
 *   base    drawn with origin (0.5, 1) at the bottom edge of its tile, so the
 *           stone steps always meet the ground line.
 *   weapon  a horizontal animation sheet. It is drawn with its origin on the
 *           weapon's mechanical pivot (the mast foot of the ballista, the
 *           pedestal of the orb staff, the cradle of the ice crystal), which is
 *           also the point Phaser rotates the sprite around.
 *   mount   height of that pivot above the tile's bottom edge, in pixels. These
 *           values were calibrated by compositing each weapon onto its base (see
 *           docs/asset-design.md).
 *
 * Everything is authored at 64 px per tile, the same density as `mapData.js`,
 * so no sprite is ever scaled.
 */

export const SLOTS = ['lvl1', 'lvl2', 'spec-a', 'spec-b'];

/** Build the four visual variants of one tower line. */
function line(typeKey, entries) {
  const out = {};
  SLOTS.forEach((slot, i) => {
    const suffix = { lvl1: '', lvl2: '-lvl2', 'spec-a': '-spec-a', 'spec-b': '-spec-b' }[slot];
    out[slot] = {
      ...entries[i],
      baseKey: `tower-base-${typeKey}${suffix}`,
      weaponKey: `tower-top-${typeKey}${suffix}`,
    };
  });
  return out;
}

export const TOWER_VISUALS = {
  archer: line('archer', [
    { file: 'archer', base: 'base_archer.png', weapon: 'weapon_archer.png', fw: 96, fh: 96, frames: 6, px: 48, py: 70, mount: 59 },
    { file: 'archer-lvl2', base: 'base_archer-lvl2.png', weapon: 'weapon_archer-lvl2.png', fw: 96, fh: 96, frames: 6, px: 48, py: 70, mount: 70 },
    { file: 'archer-spec-a', base: 'base_archer-spec-a.png', weapon: 'weapon_archer-spec-a.png', fw: 96, fh: 96, frames: 6, px: 48, py: 63, mount: 73 },
    { file: 'archer-spec-b', base: 'base_archer-spec-b.png', weapon: 'weapon_archer-spec-b.png', fw: 96, fh: 96, frames: 6, px: 48, py: 70, mount: 70 },
  ]),

  cannon: line('cannon', [
    { file: 'cannon', base: 'base_cannon.png', weapon: 'weapon_cannon.png', fw: 96, fh: 96, frames: 8, px: 48, py: 66, mount: 58 },
    { file: 'cannon-lvl2', base: 'base_cannon-lvl2.png', weapon: 'weapon_cannon-lvl2.png', fw: 96, fh: 96, frames: 8, px: 48, py: 66, mount: 71 },
    { file: 'cannon-spec-a', base: 'base_cannon-spec-a.png', weapon: 'weapon_cannon-spec-a.png', fw: 96, fh: 96, frames: 8, px: 48, py: 70, mount: 77 },
    { file: 'cannon-spec-b', base: 'base_cannon-spec-b.png', weapon: 'weapon_cannon-spec-b.png', fw: 128, fh: 128, frames: 17, px: 64, py: 116, mount: 69, slotTexture: 'proj-hammer', slotImpact: 'impact-cannon-2' },
  ]),

  frost: line('frost', [
    { file: 'frost', base: 'base_frost.png', weapon: 'weapon_frost.png', fw: 48, fh: 96, frames: 16, px: 24, py: 48, mount: 72, slotTexture: 'proj-frost' },
    { file: 'frost-lvl2', base: 'base_frost-lvl2.png', weapon: 'weapon_frost-lvl2.png', fw: 64, fh: 128, frames: 17, px: 32, py: 64, mount: 77, slotTexture: 'proj-frost-2' },
    { file: 'frost-spec-a', base: 'base_frost-spec-a.png', weapon: 'weapon_frost-spec-a.png', fw: 64, fh: 128, frames: 20, px: 32, py: 64, mount: 83, slotTexture: 'proj-frost-3' },
    { file: 'frost-spec-b', base: 'base_frost-spec-b.png', weapon: 'weapon_frost-spec-b.png', fw: 96, fh: 96, frames: 29, px: 48, py: 61, mount: 92 },
  ]),
};

/**
 * Frost floors keep their crystal bobbing (the original game's frost tower never
 * rotates) — the shard simply hovers over its cradle.
 */
export const NON_ROTATING_TYPES = new Set(['frost']);

/** Where each weapon's projectile leaves the art, relative to the pivot. */
export const MUZZLE_OFFSET = {
  archer: { x: 26, y: -26 },
  'archer-lvl2': { x: 26, y: -32 },
  'archer-spec-a': { x: 24, y: -26 },
  'archer-spec-b': { x: 28, y: -28 },
  cannon: { x: 8, y: -34 },
  'cannon-lvl2': { x: 10, y: -38 },
  'cannon-spec-a': { x: 10, y: -42 },
  'cannon-spec-b': { x: 6, y: -46 },
  frost: { x: 0, y: -12 },
  'frost-lvl2': { x: 0, y: -18 },
  'frost-spec-a': { x: 0, y: -24 },
  'frost-spec-b': { x: 0, y: -30 },
};

/** Barricade art (level 1 fence bay, level 2 palisade gate). */
export const BARRICADE_VISUALS = {
  1: { key: 'barricade', file: 'barricade.png', w: 60, h: 72, offsetY: 2 },
  2: { key: 'barricade-lvl2', file: 'barricade_lvl2.png', w: 60, h: 72, offsetY: 2 },
};

/** Projectile texture per projectile type used in `towerData.js`. */
export const PROJECTILE_TEXTURES = {
  arrow: 'proj-arrow',
  rapid: 'proj-rapid',
  sniper: 'proj-sniper',
  cannonball: 'proj-cannonball',
  frost: 'proj-frost',
  lightning: 'proj-lightning',
};

/** Impact puff spawned on hit, chosen from the damage family. */
export const IMPACT_TEXTURES = {
  arrow: 'impact-arrow',
  rapid: 'impact-rapid',
  sniper: 'impact-arrow',
  cannonball: 'impact-cannon',
  frost: 'impact-frost',
  lightning: 'impact-lightning',
};
