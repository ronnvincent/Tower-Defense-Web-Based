/**
 * assetManifest.js — the licence ledger for every art file the build ships.
 *
 * `docs/asset-integration.md` explains *why* each pack was chosen; this module
 * is the machine-readable answer to "where did this file come from, under what
 * licence, and what can it actually animate?". `scripts/write_asset_manifest.mjs`
 * renders it into `docs/asset-manifest.md`, and `tests/asset-manifest.test.js`
 * checks every path below against the file on disk, plus the frame grid against
 * the real PNG header — so this table cannot quietly drift from the art.
 *
 * Animation availability is deliberately explicit about the negative: the Spire
 * creature strips ship idle / move / death only. There is no attack row and no
 * hit row, and this file says so with a zero rather than leaving the field out,
 * because an absent field reads as "nobody checked".
 */
import { ENEMY_SHEETS } from './spireManifest.js';
import { TOWER_VISUALS, PROJECTILE_TEXTURES, IMPACT_TEXTURES } from './towerVisuals.js';
import { FX_SHEETS } from './fxManifest.js';

/** Every third-party pack the shipped art is cut from. */
export const ASSET_PACKS = [
  {
    id: 'spire-towers-1',
    name: 'Spire Tower Pack 1',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-tower-pack-1',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Tower art by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'spire-towers-2',
    name: 'Spire Tower Pack 2',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-tower-pack-2',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Tower art by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'spire-towers-3',
    name: 'Spire Tower Pack 3',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-tower-pack-3',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Tower art by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'spire-enemies-1',
    name: 'Spire Enemy Pack 1 (flying)',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-enemy-pack-1',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Creature art by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'spire-enemies-2',
    name: 'Spire Enemy Pack 2 (ground)',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-enemy-pack-2',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Creature art by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'spire-tileset-1',
    name: 'Spire Tileset 1',
    author: 'David / chroma_dave, distributed by Foozle',
    url: 'https://foozlecc.itch.io/spire-tileset-1',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Tileset by Foozle (chroma_dave), CC0.”',
  },
  {
    id: 'kenney-explosion',
    name: 'Kenney Explosion Pack',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/explosion-pack',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Explosion effects by Kenney, CC0.”',
  },
  {
    id: 'kenney-particles',
    name: 'Kenney Particle Pack',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/particle-pack',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Particle effects by Kenney, CC0.”',
  },
  {
    id: 'oga-fortress',
    name: 'Fortress (OpenGameArt)',
    author: 'OpenGameArt “Fortress” submission',
    url: 'https://opengameart.org/content/fortress',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Bastion fortress art from OpenGameArt, CC0.”',
    note: 'Shipped as a vector (`art-source/arena/fortress.svg`) and rasterised at 420 px — no download needed at runtime.',
  },
  {
    id: 'tiny-swords',
    name: 'Tiny Swords (vanguard + pet sheets)',
    author: 'Pixel Frog',
    url: 'https://pixelfrog-assets.itch.io/tiny-swords',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'Voluntary credit: “Vanguard units by Pixel Frog (Tiny Swords), CC0.”',
    licenseFile: 'art-source/units/LICENSE-TinySwords-CC0.txt',
  },
  {
    id: 'cc0-foley',
    name: 'CC0 foley clips (click / toggle / coin / place / impacts)',
    author: 'not recorded in-repo',
    url: '',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    attribution: 'No attribution required.',
    note: 'Provenance gap: docs/audio.md records the licence but not the upstream pack page. Every other sound is synthesised at runtime.',
  },
  {
    id: 'project-original',
    name: 'Project-original art (UI, world map, key art, fonts)',
    author: 'generated for this project',
    url: '',
    license: 'Project-owned',
    licenseUrl: '',
    attributionRequired: false,
    attribution: 'No third-party obligation.',
    note: 'AI-generated and hand-assembled for this repository; see docs/interface-kit.md §5.',
  },
];

/** Pack ids used by more than one asset family, for quick lookup. */
export const PACK_BY_ID = Object.fromEntries(ASSET_PACKS.map((pack) => [pack.id, pack]));

/**
 * Creature sheets: idle / move / death × three facings.
 *
 * `rows` is the number of animation rows the *pack* ships (nine: three clips ×
 * three directions). `frames` is per clip, read from the generated manifest,
 * never guessed. `attack` and `hit` are zero for every creature — the packs do
 * not draw them, and the game plays a pose + effect instead of pretending.
 */
export function enemyAnimationReport() {
  return Object.entries(ENEMY_SHEETS).map(([key, sheet]) => ({
    key,
    file: `public/assets/enemies/enemy-${key}.png`,
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    rows: 9,
    facings: 3,
    clips: {
      idle: sheet.idle,
      move: sheet.move,
      attack: 0,
      hit: 0,
      death: sheet.death,
    },
  }));
}

/**
 * Towers: a **static base image** plus a **weapon strip**.
 *
 * Only the weapon animates — BootScene cuts `<key>-fire` from its frames and
 * `<key>-rest` from frame 0 (see `createTowerAnimations`), and `Tower.fire()`
 * plays the firing clip from the same call that resolves the shot. The base is
 * a single image, so claiming a "rest strip" for it would be a lie.
 */
export function towerAnimationReport() {
  const out = [];
  for (const [type, bySlot] of Object.entries(TOWER_VISUALS)) {
    for (const [slot, variant] of Object.entries(bySlot)) {
      if (!variant?.base || !variant?.weapon) continue;
      out.push({
        slot,
        type,
        file: variant.file,
        base: `public/assets/towers/${variant.base}`,
        weapon: `public/assets/towers/${variant.weapon}`,
        frameWidth: variant.fw,
        frameHeight: variant.fh,
        frames: variant.frames,
        baseStatic: true,
        clips: { rest: 1, fire: variant.frames },
      });
    }
  }
  return out;
}

/**
 * Projectile and impact textures.
 *
 * The tables in `towerVisuals.js` map a *damage family* to a texture key, not to
 * a filename (`hammer -> 'proj-forge'`), which is why the paths are built from
 * the key here. Several families deliberately share one impact strip.
 */
export function effectTextureReport() {
  return {
    projectiles: Object.entries(PROJECTILE_TEXTURES).map(([key, texture]) => ({
      key,
      texture,
      file: `public/assets/projectiles/${texture}.png`,
    })),
    impacts: Object.entries(IMPACT_TEXTURES).map(([key, texture]) => ({
      key,
      texture,
      file: `public/assets/effects/${texture}.png`,
    })),
    strips: Object.entries(FX_SHEETS).map(([key, sheet]) => ({
      key,
      file: `public/assets/fx/${sheet.file}`,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frames: sheet.frames,
    })),
  };
}

/**
 * The one-line answer to "can a creep swing yet?" — used by the docs generator
 * and by the report so the claim is never hand-typed.
 */
export function animationGapSummary() {
  const enemies = enemyAnimationReport();
  const missingAttack = enemies.filter((e) => e.clips.attack === 0).length;
  const missingHit = enemies.filter((e) => e.clips.hit === 0).length;
  return {
    creatures: enemies.length,
    withIdle: enemies.filter((e) => e.clips.idle > 0).length,
    withMove: enemies.filter((e) => e.clips.move > 0).length,
    withDeath: enemies.filter((e) => e.clips.death > 0).length,
    missingAttack,
    missingHit,
  };
}

export default { ASSET_PACKS, enemyAnimationReport, towerAnimationReport, effectTextureReport, animationGapSummary };
