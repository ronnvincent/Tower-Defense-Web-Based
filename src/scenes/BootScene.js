import { generateAllTextures } from '../rendering/TextureFactory.js';
import { TOWER_VISUALS, BARRICADE_VISUALS, SLOTS } from '../data/towerVisuals.js';
import { ENEMY_SHEETS, IMPACT_SHEETS } from '../data/spireManifest.js';

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

    // 1. Terrain — 16-mask road autotile + grass / rock / water / foliage
    this.load.image('tile-grass', 'assets/tiles/grass.png');
    for (let mask = 0; mask < 16; mask++) {
      this.load.image(`tile-road-${mask}`, `assets/tiles/road_${mask}.png`);
    }
    this.load.image('tile-rock', 'assets/tiles/rock.png');
    this.load.image('tile-water', 'assets/tiles/water.png');
    this.load.image('tile-foliage', 'assets/tiles/foliage.png');

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

    // 4. Enemies — animated 9-row strips (idle / move / death x 3 palettes)
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      this.load.spritesheet(`enemy-${key}`, `assets/enemies/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
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
    ]) {
      this.load.image(key, `assets/projectiles/${key}.png`);
    }
    this.load.image('coin-sprite', 'assets/projectiles/coin.png');

    // 6. Impact animations
    for (const [key, sheet] of Object.entries(IMPACT_SHEETS)) {
      this.load.spritesheet(key, `assets/effects/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }

    // 7. Audio foley
    this.load.audio('sfx-click', 'assets/audio/click.ogg');
    this.load.audio('sfx-toggle', 'assets/audio/toggle.ogg');
    this.load.audio('sfx-wood', 'assets/audio/impact_wood.ogg');
    this.load.audio('sfx-metal', 'assets/audio/impact_metal.ogg');
    this.load.audio('sfx-glass', 'assets/audio/impact_glass.ogg');
    this.load.audio('sfx-coin', 'assets/audio/coin.ogg');
    this.load.audio('sfx-place', 'assets/audio/place.ogg');
  }

  create() {
    // Procedural fallbacks only fill keys the packs do not provide.
    generateAllTextures(this);
    this.createTowerAnimations();
    this.createEnemyAnimations();
    this.createImpactAnimations();
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

  /** Idle loop + walk loop + death clip for every enemy archetype. */
  createEnemyAnimations() {
    for (const [key, sheet] of Object.entries(ENEMY_SHEETS)) {
      const textureKey = `enemy-${key}`;
      if (!this.textures.exists(textureKey)) continue;
      const cols = this.textures.getTextureKeys
        ? this.textures.get(textureKey).source[0].width / sheet.frameWidth
        : sheet.idle;

      // Rows 0-2 are the three palette variants of the idle loop, 3-5 the walk,
      // 6-8 the death animation; variant 0 (row 0/3/6) is the default.
      if (sheet.idle > 1) {
        this.anims.create({
          key: `enemy-${key}-idle`,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: sheet.idle - 1 }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (sheet.move > 1) {
        this.anims.create({
          key: `enemy-${key}-move`,
          frames: this.anims.generateFrameNumbers(textureKey, {
            start: cols,
            end: cols + sheet.move - 1,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
      if (sheet.death > 1) {
        this.anims.create({
          key: `enemy-${key}-death`,
          frames: this.anims.generateFrameNumbers(textureKey, {
            start: cols * 2,
            end: cols * 2 + sheet.death - 1,
          }),
          frameRate: 12,
          repeat: 0,
        });
      }
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
