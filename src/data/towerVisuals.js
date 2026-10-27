import { ENGINEER_ART } from './engineerTowerArt.js';
import { ROYAL_ART } from './royalTowerArt.js';

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
 * The ten royal lines: five authored tiers each (`lvl1`…`lvl5`).
 *
 * These are *linear* lines — there is no branch at level 3 — so the slot is a
 * straight function of the level and `Tower.visualSlot` asks for `lvl<n>`
 * directly. Geometry comes from the generator, which measures every tier's
 * pivot and muzzle from its own drawing.
 */
export const ROYAL_VISUALS = Object.fromEntries(
  Object.entries(ROYAL_ART).map(([line, tiers]) => [
    line,
    Object.fromEntries(
      Object.entries(tiers).map(([slot, art]) => [
        slot,
        {
          ...art,
          file: `${line}-l${slot.replace('lvl', '')}`,
          baseKey: `tower-base-${line}-l${slot.replace('lvl', '')}`,
          weaponKey: `tower-top-${line}-l${slot.replace('lvl', '')}`,
        },
      ])
    ),
  ])
);

Object.assign(TOWER_VISUALS, ROYAL_VISUALS);

/**
 * Frost floors keep their crystal bobbing (the original game's frost tower never
 * rotates) — the shard simply hovers over its cradle.
 *
 * The royal lines add three more static weapons: the rime crystal, the
 * workshop's hammer arm (it swings on its own pivot, it does not track a
 * target), the rune stone and the trap plate. Firing one of them must never spin
 * it toward an enemy it is not aiming at.
 */
export const NON_ROTATING_TYPES = new Set([
  'frost',
  'banner',
  'rimeTower',
  'workshop',
  'obelisk',
  'spikeTrap',
]);

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
  // Royal lines are linear and have no branch slots to derive from; they carry
  // their own measured muzzle for every tier (loop below).
  if (!slots['spec-a'] || !slots['spec-b']) continue;
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

// Every royal weapon is measured, so a shot leaves the drawn barrel tip even on
// a tier whose barrel is 40 % longer than the one below it. (This runs after the
// table above is declared — touching it earlier is a temporal-dead-zone error.)
for (const [line, tiers] of Object.entries(ROYAL_VISUALS)) {
  for (const [slot, art] of Object.entries(tiers)) {
    MUZZLE_OFFSET[art.file] = { x: 0, y: art.muzzleY };
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
/**
 * One procedural texture per wall tier (`TextureFactory.makeWalls`).
 *
 * `file` is deliberately absent: these are drawn at boot rather than loaded, so
 * a wall can never fall back to a missing PNG. The art is a different material
 * at every tier — stakes, banded planks, stone, fortification, imperial gold —
 * not the same sprite recoloured five times.
 */
export const BARRICADE_VISUALS = {
  1: { key: 'wall-t1', w: 64, h: 64, offsetY: 0 },
  2: { key: 'wall-t2', w: 64, h: 64, offsetY: 0 },
  3: { key: 'wall-t3', w: 64, h: 64, offsetY: 0 },
  4: { key: 'wall-t4', w: 64, h: 64, offsetY: 0 },
  5: { key: 'wall-t5', w: 64, h: 64, offsetY: 0 },
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
  // Royal lines. Each shot has its own silhouette; the siege gun's shell is
  // never printed on an archer's arrow.
  royalShell: 'proj-royal-royalArtillery',
  royalBolt: 'proj-royal-siegeBallista',
  arcaneLance: 'proj-royal-arcaneSniper',
  mortarShell: 'proj-royal-mortar',
  frostShard: 'proj-royal-rimeTower',
  teslaArc: 'proj-royal-tesla',
  skybreakerBolt: 'proj-royal-skybreaker',
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
  // Royal lines hit with their own strip (`fx-line-<line>-impact`), queued in
  // data/fxManifest.js; these are the fallback when an fx pack is missing.
  royalShell: 'impact-cannon-2',
  royalBolt: 'impact-arrow',
  arcaneLance: 'impact-lightning',
  mortarShell: 'impact-cannon-2',
  frostShard: 'impact-frost-3',
  teslaArc: 'impact-lightning',
  skybreakerBolt: 'impact-arrow',
};
