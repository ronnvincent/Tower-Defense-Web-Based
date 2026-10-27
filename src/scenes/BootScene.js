import { generateAllTextures } from '../rendering/TextureFactory.js';
import { TOWER_VISUALS, BARRICADE_VISUALS } from '../data/towerVisuals.js';
import { ROYAL_TOWER_TYPES } from '../data/royalDefences.js';
import { DECOR_ART } from '../data/towerDecor.js';
import { TIERED_PROJECTILES } from '../data/projectileArt.js';
import { THEMES } from '../data/levelData.js';
import { ARENA_ART, PORTAL_ANIM } from '../data/arenaArt.js';

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
      // The crossing is its own sprite: planks, parapets and stone sills, drawn
      // per biome by scripts/build_bridges.py, so a bridge is never a squashed
      // road tile floating over the water.
      this.load.image(`tile-bridge${suffix}`, `assets/tiles/bridge${suffix}.png`);
      for (const kind of DECOR_KINDS) {
        this.load.image(`tile-decor-${kind}${suffix}`, `assets/tiles/decor_${kind}${suffix}.png`);
      }
    }

    // 2. Towers — static base + animated weapon sheet per upgrade slot
    // Iterating the data (not the fixed `SLOTS` list) is what lets the royal
    // lines carry five slots instead of the eight branch slots the older packs
    // use; a missing entry simply does not exist.
    for (const slots of Object.values(TOWER_VISUALS)) {
      for (const v of Object.values(slots)) {
        this.load.image(v.baseKey, `assets/towers/${v.base}`);
        this.load.spritesheet(v.weaponKey, `assets/towers/${v.weapon}`, {
          frameWidth: v.fw,
          frameHeight: v.fh,
        });
      }
    }

    // 3. Walls — the five tiers are drawn procedurally at boot (see
    //    `TextureFactory.makeWalls`), so only tiers with a `file` are loaded.
    for (const tier of Object.values(BARRICADE_VISUALS)) {
      if (tier.file) this.load.image(tier.key, `assets/towers/${tier.file}`);
    }

    // 3a2. Royal ruins — the wreck a fallen royal line leaves behind. One image
    // per line, so a destroyed battery does not look like a destroyed obelisk.
    for (const key of ROYAL_TOWER_TYPES ? Object.keys(ROYAL_TOWER_TYPES) : []) {
      this.load.image(`ruin-${key}`, `assets/towers/ruin_${key}.png`);
    }

    // 3b. Tower decorations — the per-tier parts that grow the silhouette.
    for (const [key, file] of Object.entries(DECOR_ART)) {
      this.load.image(key, `assets/towers/deco/${file}`);
    }

    // 4. Enemies are *not* loaded here. A battle queues only the creatures its
    // waves field, in the battlefield's biome — 24 to 80 strips instead of 210.
    // See systems/EnemyAssets.js and `GameScene.preload`.

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
      // Royal shots (scripts/build_royal_defences.py). L4/L5 variants live in
      // TIERED_PROJECTILES below, like every other line's tier art.
      'proj-royal-royalArtillery',
      'proj-royal-siegeBallista',
      'proj-royal-arcaneSniper',
      'proj-royal-mortar',
      'proj-royal-rimeTower',
      'proj-royal-tesla',
      'proj-royal-skybreaker',
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

    // 6. Battle effect art (impacts, fx strips, particles) is queued by
    //    GameScene.preload through systems/BattleArt — see that file for why.

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

    // 9. Arena landmarks: the painted portal gate, the painted bastion keep,
    //    and the 32-frame vortex spritesheet that plays inside the gate.
    this.load.image(ARENA_ART.bastion.key, ARENA_ART.bastion.path);
    this.load.image(ARENA_ART.portalArch.key, ARENA_ART.portalArch.path);
    this.load.image(ARENA_ART.riverFlow.key, ARENA_ART.riverFlow.path);
    this.load.spritesheet(ARENA_ART.portalVortex.key, ARENA_ART.portalVortex.path, {
      frameWidth: ARENA_ART.portalVortex.frameWidth,
      frameHeight: ARENA_ART.portalVortex.frameHeight,
    });
  }

  create() {
    // Procedural fallbacks only fill keys the packs do not provide.
    generateAllTextures(this);
    this.createTowerAnimations();
    this.createArenaAnimations();
    this.scene.start('MenuScene');
  }

  /** The portal vortex: one looping clip, 30 fps, so it breathes instead of spins. */
  createArenaAnimations() {
    if (!this.textures.exists(ARENA_ART.portalVortex.key)) return;
    if (this.anims.exists(PORTAL_ANIM)) return;
    const { frames } = ARENA_ART.portalVortex;
    this.anims.create({
      key: PORTAL_ANIM,
      frames: this.anims.generateFrameNumbers(ARENA_ART.portalVortex.key, { start: 0, end: frames - 1 }),
      frameRate: 30,
      repeat: -1,
    });
  }

  /** One looping "idle" (resting pose) and one-shot "fire" clip per tower slot. */
  createTowerAnimations() {
    for (const slots of Object.values(TOWER_VISUALS)) {
      for (const v of Object.values(slots)) {
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
}
