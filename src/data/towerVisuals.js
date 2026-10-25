import { ENGINEER_ART } from './engineerTowerArt.js';

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
 *           also the point Phaser rotates the sprite around. Every weapon is
 *           drawn pointing **up**, so the sprite's rotation is the screen aim
 *           angle + π/2 (see `src/systems/TurretAim.js`).
 *   mount   height of that pivot above the tile's bottom edge, in pixels. These
 *           values were calibrated by compositing each weapon onto its base (see
 *           docs/asset-design.md).
 *
 * Everything is authored at 64 px per tile, the same density as `mapData.js`,
 * so no sprite is ever scaled.
 */

/**
 * Eight visual slots per line.
 *
 *   lvl1 / lvl2        the two shop tiers
 *   spec-a / spec-b    the two level-3 branches
 *   spec-a2 / spec-a3  levels 4 and 5 of branch a
 *   spec-b2 / spec-b3  levels 4 and 5 of branch b
 *
 * The ascended slots reuse the branch's geometry (pivot, mount, muzzle) and
 * differ only in their textures, which the asset script re-grades into a hotter
 * palette and adds a power ring to. That keeps every measurement calibrated
 * once and still lets a maxed tower look like a different building.
 */
export const SLOTS = [
  'lvl1',
  'lvl2',
  'spec-a',
  'spec-b',
  'spec-a2',
  'spec-a3',
  'spec-b2',
  'spec-b3',
];

const SLOT_SUFFIX = {
  lvl1: '',
  lvl2: '-lvl2',
  'spec-a': '-spec-a',
  'spec-b': '-spec-b',
  'spec-a2': '-spec-a2',
  'spec-a3': '-spec-a3',
  'spec-b2': '-spec-b2',
  'spec-b3': '-spec-b3',
};

/** Build the eight visual variants of one tower line. */
function line(typeKey, entries) {
  const out = {};
  const [lvl1, lvl2, specA, specB] = entries;
  const base = { lvl1, lvl2, 'spec-a': specA, 'spec-b': specB };
  for (const slot of SLOTS) {
    const origin = base[slot] || (slot.startsWith('spec-a') ? specA : specB);
    const file = `${typeKey}${SLOT_SUFFIX[slot]}`;
    out[slot] = {
      ...origin,
      file,
      base: `base_${file}.png`,
      weapon: `weapon_${file}.png`,
      baseKey: `tower-base-${file}`,
      weaponKey: `tower-top-${file}`,
    };
  }
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

  /* ------------------------------------------------------------ forge lines */

  // T04 hammer keep. The two specialisations share the level-3 art; the Storm
  // tier is recoloured green → electric blue by the asset script so the two
  // branches still read differently on the battlefield.
  forge: line('forge', [
    { file: 'forge', base: 'base_forge.png', weapon: 'weapon_forge.png', fw: 128, fh: 128, frames: 17, px: 64, py: 108, mount: 57, slotTexture: 'proj-forge' },
    { file: 'forge-lvl2', base: 'base_forge-lvl2.png', weapon: 'weapon_forge-lvl2.png', fw: 128, fh: 128, frames: 17, px: 64, py: 108, mount: 66, slotTexture: 'proj-forge' },
    { file: 'forge-spec-a', base: 'base_forge-spec-a.png', weapon: 'weapon_forge-spec-a.png', fw: 128, fh: 128, frames: 17, px: 64, py: 116, mount: 69, slotTexture: 'proj-forge' },
    { file: 'forge-spec-b', base: 'base_forge-spec-b.png', weapon: 'weapon_forge-spec-b.png', fw: 128, fh: 128, frames: 17, px: 64, py: 116, mount: 69, slotTexture: 'proj-forge' },
  ]),

  // T05 obsidian rune keep with a floating orb staff.
  runes: line('runes', [
    { file: 'runes', base: 'base_runes.png', weapon: 'weapon_runes.png', fw: 96, fh: 96, frames: 29, px: 48, py: 61, mount: 88, slotTexture: 'proj-rune' },
    { file: 'runes-lvl2', base: 'base_runes-lvl2.png', weapon: 'weapon_runes-lvl2.png', fw: 96, fh: 96, frames: 29, px: 48, py: 61, mount: 96, slotTexture: 'proj-rune' },
    { file: 'runes-spec-a', base: 'base_runes-spec-a.png', weapon: 'weapon_runes-spec-a.png', fw: 96, fh: 96, frames: 29, px: 48, py: 61, mount: 104, slotTexture: 'proj-rune' },
    { file: 'runes-spec-b', base: 'base_runes-spec-b.png', weapon: 'weapon_runes-spec-b.png', fw: 96, fh: 96, frames: 29, px: 48, py: 61, mount: 104, slotTexture: 'proj-rune' },
  ]),

  // T06 limestone keep with banners. The pole is static (it is a banner, not a
  // turret), so the whole line is listed in NON_ROTATING_TYPES below.
  banner: line('banner', [
    { file: 'banner', base: 'base_banner.png', weapon: 'weapon_banner.png', fw: 64, fh: 64, frames: 6, px: 32, py: 45, mount: 100 },
    { file: 'banner-lvl2', base: 'base_banner-lvl2.png', weapon: 'weapon_banner-lvl2.png', fw: 96, fh: 96, frames: 6, px: 48, py: 66, mount: 106 },
    { file: 'banner-spec-a', base: 'base_banner-spec-a.png', weapon: 'weapon_banner-spec-a.png', fw: 96, fh: 96, frames: 6, px: 48, py: 63, mount: 114 },
    { file: 'banner-spec-b', base: 'base_banner-spec-b.png', weapon: 'weapon_banner-spec-b.png', fw: 96, fh: 96, frames: 6, px: 48, py: 63, mount: 114 },
  ]),
};

/**
 * Frost floors keep their crystal bobbing (the original game's frost tower never
 * rotates) — the shard simply hovers over its cradle.
 */
export const NON_ROTATING_TYPES = new Set(['frost', 'banner']);

/**
 * The five engineer lines.
 *
 * Their art is generated by `scripts/build_engineer_towers.py`, which measures
 * its own pivots and muzzle heights — every slot is a separate drawing, so the
 * canvas grows with the tier instead of inheriting a branch's geometry. The
 * entries are appended to `TOWER_VISUALS` below so the loader, the animation
 * builder and the HUD never need to know the lines exist.
 */
export const ENGINEER_VISUALS = Object.fromEntries(
  Object.entries(ENGINEER_ART).map(([line, slots]) => [
    line,
    Object.fromEntries(
      Object.entries(slots).map(([slot, art]) => {
        const file = `${line}${slot === 'lvl1' ? '' : `-${slot}`}`;
        return [
          slot,
          {
            ...art,
            file,
            baseKey: `tower-base-${file}`,
            weaponKey: `tower-top-${file}`,
          },
        ];
      })
    ),
  ])
);

/**
 * Where each weapon's projectile leaves the art, in the weapon's own frame.
 *
 * The art is drawn pointing up, so the muzzle of every rotating weapon sits
 * straight above its pivot and `y` is negative. Values were measured from the
 * first frame of each sheet (topmost ink rows, averaged) rather than eyeballed,
 * so a shot leaves the drawn barrel tip instead of drifting to one side.
 */
export const MUZZLE_OFFSET = {
  archer: { x: 0, y: -44 },
  'archer-lvl2': { x: 0, y: -44 },
  'archer-spec-a': { x: 0, y: -42 },
  'archer-spec-b': { x: 0, y: -44 },
  cannon: { x: 0, y: -36 },
  'cannon-lvl2': { x: 0, y: -36 },
  'cannon-spec-a': { x: 0, y: -41 },
  'cannon-spec-b': { x: 0, y: -82 },
  // The frost crystal never rotates, so its offset is used unrotated.
  frost: { x: 0, y: -38 },
  'frost-lvl2': { x: 0, y: -52 },
  'frost-spec-a': { x: 0, y: -58 },
  'frost-spec-b': { x: 0, y: -27 },
  // Hammer head sits at the top of the 128 px T04 sheets.
  forge: { x: 0, y: -74 },
  'forge-lvl2': { x: 0, y: -74 },
  'forge-spec-a': { x: 0, y: -82 },
  'forge-spec-b': { x: 0, y: -82 },
  // Orb floats just above the staff of the 96 px T05 sheets.
  runes: { x: 0, y: -27 },
  'runes-lvl2': { x: 0, y: -27 },
  'runes-spec-a': { x: 0, y: -27 },
  'runes-spec-b': { x: 0, y: -27 },
  // Banners do not rotate: the pennant's height is the launch point.
  banner: { x: 0, y: -32 },
  'banner-lvl2': { x: 0, y: -41 },
  'banner-spec-a': { x: 0, y: -42 },
  'banner-spec-b': { x: 0, y: -42 },
};

// Levels 4 and 5 are the same weapon mounted on a bigger plinth, so the muzzle
// keeps its offset from the branch it grew out of. Deriving them here means a
// new tower only has to be measured once, at the branch.
for (const [typeKey, slots] of Object.entries(TOWER_VISUALS)) {
  for (const [slot, suffix] of Object.entries(SLOT_SUFFIX)) {
    if (!suffix.endsWith('2') && !suffix.endsWith('3')) continue;
    const origin = slots[slot.startsWith('spec-a') ? 'spec-a' : 'spec-b'];
    const file = `${typeKey}${suffix}`;
    const branchFile = origin.file;
    if (!MUZZLE_OFFSET[file] && MUZZLE_OFFSET[branchFile]) {
      MUZZLE_OFFSET[file] = MUZZLE_OFFSET[branchFile];
    }
  }
}

// Engineer lines join the same map; their geometry is already per-slot, so the
// ascended-slot derivation above must not touch them (it only walks TOWER_VISUALS
// and those keys are added afterwards).
Object.assign(TOWER_VISUALS, ENGINEER_VISUALS);

// Muzzle offsets come straight from the generator: `muzzleY` is the distance
// from the pivot to the drawn tip, so a bigger tier fires from further out.
for (const [line, slots] of Object.entries(ENGINEER_VISUALS)) {
  for (const [slot, art] of Object.entries(slots)) {
    MUZZLE_OFFSET[`${line}${slot === 'lvl1' ? '' : `-${slot}`}`] = { x: 0, y: art.muzzleY };
  }
}

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
  hammer: 'proj-forge',
  rune: 'proj-rune',
  // Engineer lines. Every one has its own silhouette in flight.
  bolt: 'proj-bolt',
  'bolt-heavy': 'proj-bolt-heavy',
  bullet: 'proj-bullet',
  flame: 'proj-flame',
  acid: 'proj-acid',
  harpoon: 'proj-harpoon',
};

/** Impact puff spawned on hit, chosen from the damage family. */
export const IMPACT_TEXTURES = {
  arrow: 'impact-arrow',
  rapid: 'impact-rapid',
  sniper: 'impact-arrow',
  cannonball: 'impact-cannon',
  frost: 'impact-frost',
  lightning: 'impact-lightning',
  hammer: 'impact-hammer',
  rune: 'impact-lightning',
  // Spire fallback strips only. The real hits come from the Kenney library
  // (Vfx.impact picks by damage type, then by line), so these are the safety
  // net for a texture hiccup rather than the effect the player sees.
  bolt: 'impact-arrow',
  'bolt-heavy': 'impact-arrow',
  bullet: 'impact-rapid',
  flame: 'impact-cannon',
  acid: 'impact-frost',
  harpoon: 'impact-cannon',
};
