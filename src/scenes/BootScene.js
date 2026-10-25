import { generateAllTextures } from '../rendering/TextureFactory.js';
import { TOWER_VISUALS, BARRICADE_VISUALS, SLOTS } from '../data/towerVisuals.js';
import { ENEMY_SHEETS, ENEMY_SKINS, ENEMY_PALETTES, IMPACT_SHEETS } from '../data/spireManifest.js';
import { FX_SHEETS, FX_PARTICLES } from '../data/fxManifest.js';
import { DECOR_ART } from '../data/towerDecor.js';
import { TIERED_PROJECTILES } from '../data/projectileArt.js';
import { THEMES } from '../data/levelData.js';

/** Ground tile variants per biome (grass, grass_2, grass_3). */
const GROUND_VARIANTS = ['', '_2', '_3'];
/** Scatter props drawn on empty grass. */
const DECOR_KINDS = ['tuft', 'bloom', 'shard'];

/**
 * BootScene — loads the Spire art set (CC0) and registers every animation.
 *
 * Towers are loaded as two pieces: a static base image and a weapon
 * *spritesheet* (the packs ship the attack animation as a horizontal strip).
 * Enemies and impact effects are loaded as spritesheets as well, so the real
 * pack animations run instead of placeholder tweens.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const { width, height } = this.scale;

    const bg = this.add.graphics();
    bg.fillStyle(0x080b12, 1);
    bg.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, height / 2 - 40, 'LOADING BASTION ASSETS...', {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '22px',
        color: '#f5c451',
      })
      .setOrigin(0.5);

    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x151b29, 0.8);
    progressBox.lineStyle(2, 0xc99834, 1);
    progressBox.strokeRoundedRect(width / 2 - 160, height / 2, 320, 24, 6);
    progressBox.fillRoundedRect(width / 2 - 160, height / 2, 320, 24, 6);

    const progressBar = this.add.graphics();
    this.load.on('progress', (value) => {
      progressBar.clear();
      progressBar.fillStyle(0xf5c451, 1);
      progressBar.fillRoundedRect(width / 2 - 156, height / 2 + 4, 312 * value, 16, 4);
    });

    // 1. Terrain — per-biome ground variants, 16-mask lane autotile, 16-mask
    // shoreline autotile, boulder clusters and scatter props. Every key exists
    // both bare (grassland) and with its biome suffix; tileTexture() asks for
    // `<key><tileSuffix>` and falls back to the bare art.
    // Suffixes come from the campaign themes, so a new battlefield is a data edit.
    const suffixes = [...new Set(Object.values(THEMES).map((theme) => theme.tileSuffix))];
    for (const suffix of suffixes) {
      for (const variant of GROUND_VARIANTS) {
        this.load.image(`tile-grass${variant}${suffix}`, `assets/tiles/grass${variant}${suffix}.png`);
      }
      for (let mask = 0; mask < 16; mask++) {
        this.load.image(`tile-road-${mask}${suffix}`, `assets/tiles/road_${mask}${suffix}.png`);
        this.load.image(`tile-water-${mask}${suffix}`, `assets/tiles/water_${mask}${suffix}.png`);
      }
      this.load.image(`tile-rock${suffix}`, `assets/tiles/rock${suffix}.png`);
      this.load.image(`tile-rock-2${suffix}`, `assets/tiles/rock_2${suffix}.png`);
      this.load.image(`tile-water${suffix}`, `assets/tiles/water${suffix}.png`);
      this.load.image(`tile-foliage${suffix}`, `assets/tiles/foliage${suffix}.png`);
      for (const kind of DECOR_KINDS) {
        this.load.image(`tile-decor-${kind}${suffix}`, `assets/tiles/decor_${kind}${suffix}.png`);
      }
    }

    // 2. Towers — static base + animated weapon sheet per upgrade slot
    for (const [typeKey, slots] of Object.entries(TOWER_VISUALS)) {
      for (const slot of SLOTS) {
        const v = slots[slot];
        this.load.image(v.baseKey, `assets/towers/${v.base}`);
        this.load.spritesheet(v.weaponKey, `assets/towers/${v.weapon}`, {
          frameWidth: v.fw,
          frameHeight: v.fh,
        });
      }
    }

    // 3. Barricade — two visual tiers
    for (const tier of Object.values(BARRICADE_VISUALS)) {
      this.load.image(tier.key, `assets/towers/${tier.file}`);
    }

    // 3b. Tower decorations — the per-tier parts that grow the silhouette.
    for (const [key, file] of Object.entries(DECOR_ART)) {
      this.load.image(key, `assets/towers/deco/${file}`);
    }

    // 4. Enemies — animated 9-row strips (idle / move / death x 3 palettes).
    // Every biome x wave-tier re-grade is a separate sheet: the base strip, the
    // elite strip and the champion strip, per battlefield. Texture keys come
    // straight from the manifest (`ENEMY_SKINS`), so no naming is guessed here.
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      const textures = new Set([`enemy-${key}`]);
      for (const tiers of Object.values(ENEMY_SKINS[key] || {})) {
        for (const textureKey of tiers) textures.add(textureKey);
      }
      for (const textureKey of textures) {
        this.load.spritesheet(textureKey, `assets/enemies/${textureKey}.png`, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      }
    }

    // 5. Projectiles
    for (const key of [
      'proj-arrow',
      'proj-rapid',
      'proj-sniper',
      'proj-cannonball',
      'proj-frost',
      'proj-frost-2',
      'proj-frost-3',
      'proj-lightning',
      'proj-hammer',
      'proj-forge',
      'proj-rune',
      // Per-line shot art (scripts/build_projectiles.py): the banner keeps fire
      // their own golden bolt, and every line upgrades its projectile at 4/5.
      'proj-banner',
      // Engineer shots (scripts/build_engineer_fx.py): bolt, slug, pitch,
      // acid and harpoon all have their own silhouette in flight.
      'proj-bolt',
      'proj-bolt-heavy',
      'proj-bullet',
      'proj-flame',
      'proj-acid',
      'proj-harpoon',
    ]) {
      this.load.image(key, `assets/projectiles/${key}.png`);
    }
    // Tier-4/5 shots live in the generated table so the loader cannot drift.
    for (const tiers of Object.values(TIERED_PROJECTILES)) {
      for (const key of Object.values(tiers)) {
        this.load.image(key, `assets/projectiles/${key}.png`);
      }
    }
    this.load.image('coin-sprite', 'assets/projectiles/coin.png');

    // 6. Impact animations
    for (const [key, sheet] of Object.entries(IMPACT_SHEETS)) {
      this.load.spritesheet(key, `assets/effects/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }

    // 6b. Kenney effect library (CC0): elemental impact strips, shockwave,
    // nova, ground blast, level-up burst and the particle singles the emitters
    // draw with. Missing art is tolerated — Vfx checks before it plays.
    for (const [key, sheet] of Object.entries(FX_SHEETS)) {
      if (sheet.frames > 1) {
        this.load.spritesheet(key, `assets/fx/${sheet.file}`, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      } else {
        this.load.image(key, `assets/fx/${sheet.file}`);
      }
    }
    for (const [key, file] of Object.entries(FX_PARTICLES)) {
      this.load.image(key, `assets/fx/${file}`);
    }

    // 7. Audio foley
    this.load.audio('sfx-click', 'assets/audio/click.ogg');
    this.load.audio('sfx-toggle', 'assets/audio/toggle.ogg');
    this.load.audio('sfx-wood', 'assets/audio/impact_wood.ogg');
    this.load.audio('sfx-metal', 'assets/audio/impact_metal.ogg');
    this.load.audio('sfx-glass', 'assets/audio/impact_glass.ogg');
    this.load.audio('sfx-coin', 'assets/audio/coin.ogg');
    this.load.audio('sfx-place', 'assets/audio/place.ogg');

    // 8. UI-kit FX. Optional by contract: every consumer guards on
    //    textures.exists(), so a missing file costs a shockwave, not the game.
    this.load.image('fx-ring', 'assets/ui-kit/fx_ring.png');
    this.load.image('fx-glow', 'assets/ui-kit/fx_glow.png');
  }

  create() {
    // Procedural fallbacks only fill keys the packs do not provide.
    generateAllTextures(this);
    this.createTowerAnimations();
    this.createEnemyAnimations();
    this.createImpactAnimations();
    this.createFxAnimations();
    this.scene.start('MenuScene');
  }

  /** One looping "idle" (resting pose) and one-shot "fire" clip per tower slot. */
  createTowerAnimations() {
    for (const [typeKey, slots] of Object.entries(TOWER_VISUALS)) {
      for (const slot of SLOTS) {
        const v = slots[slot];
        if (!this.textures.exists(v.weaponKey)) continue;
        const total = this.textures.get(v.weaponKey).frameTotal - 1;
        if (total > 1) {
          this.anims.create({
            key: `${v.weaponKey}-fire`,
            frames: this.anims.generateFrameNumbers(v.weaponKey, { start: 0, end: total - 1 }),
            frameRate: 16,
            repeat: 0,
          });
        }
        this.anims.create({
          key: `${v.weaponKey}-rest`,
          frames: [{ key: v.weaponKey, frame: 0 }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }
  }

  /**
   * Idle / walk / death clips for every enemy archetype, battlefield and wave
   * tier, in each of the strip's three palette variants.
   *
   * A Spire strip is 9 rows: 0-2 idle, 3-5 move, 6-8 death, each row a different
   * colour variant. Biome and tier pick the *texture*, the palette picks the row
   * inside it, so a wave 1 grunt and a wave 5 grunt differ by brood colouring,
   * contour and scale rather than by a barely-visible hue nudge.
   *
   * The bare `enemy-<key>-<clip>` keys are kept as aliases of palette 0 so any
   * older call site (and the headless tests) still resolves.
   */
  createEnemyAnimations() {
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      const biomeTextures = new Set([`enemy-${key}`]);
      for (const tiers of Object.values(ENEMY_SKINS[key] || {})) {
        for (const textureKey of tiers) biomeTextures.add(textureKey);
      }

      for (const textureKey of biomeTextures) {
        if (!this.textures.exists(textureKey)) continue;
        const cols = this.textures.get(textureKey).source[0].width / sheet.frameWidth;

        for (let palette = 0; palette < ENEMY_PALETTES; palette += 1) {
          this.createEnemyClips(textureKey, sheet, cols, palette);
        }
        // Legacy aliases -> palette 0.
        this.createEnemyClips(textureKey, sheet, cols, 0, '');
      }
    }
  }

  /**
   * One idle/move/death trio: rows `palette`, `3 + palette`, `6 + palette`.
   *
   * Measured against the shipped sheets: rows 0-2 are the idle strip in the
   * three palettes, rows 3-5 the walk strip, rows 6-8 the death strip. Frame
   * counts per row are taken from the manifest, not assumed.
   */
  createEnemyClips(textureKey, sheet, cols, palette, suffixOverride = null) {
    const suffix = suffixOverride === null ? `-v${palette}` : suffixOverride;
    const row = (index) => (index + palette) * cols;
    const clips = [
      ['idle', sheet.idle, row(0), 8, -1],
      ['move', sheet.move, row(3), 10, -1],
      ['death', sheet.death, row(6), 12, 0],
    ];
    for (const [clip, frames, start, frameRate, repeat] of clips) {
      if (frames <= 1) continue;
      const key = `${textureKey}${suffix}-${clip}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(textureKey, { start, end: start + frames - 1 }),
        frameRate,
        repeat,
      });
    }
  }

  /**
   * Register one `<key>-play` clip per effect strip.
   *
   * The frame rate comes from the manifest rather than a constant: a 9-frame
   * explosion that runs at 28 fps reads as a blast, while the same strip at
   * 18 fps reads as a smokescreen. The generated atlas keeps each element's
   * authored speed.
   */
  createFxAnimations() {
    for (const [key, sheet] of Object.entries(FX_SHEETS)) {
      if (!this.textures.exists(key) || sheet.frames <= 1) continue;
      if (this.anims.exists(`${key}-play`)) continue;
      this.anims.create({
        key: `${key}-play`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
        frameRate: sheet.frameRate || 26,
        repeat: 0,
      });
    }
  }

  createImpactAnimations() {
    for (const [key, sheet] of Object.entries(IMPACT_SHEETS)) {
      if (!this.textures.exists(key)) continue;
      this.anims.create({
        key: `${key}-burst`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
        frameRate: 18,
        repeat: 0,
      });
    }
  }
}
