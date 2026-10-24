import { generateAllTextures } from '../rendering/TextureFactory.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const { width, height } = this.scale;

    // Loading background & progress text
    const bg = this.add.graphics();
    bg.fillStyle(0x080b12, 1);
    bg.fillRect(0, 0, width, height);

    const title = this.add.text(width / 2, height / 2 - 40, 'LOADING BASTION ASSETS...', {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '22px',
      color: '#f5c451',
    }).setOrigin(0.5);

    // Progress bar frame
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

    // 1. Environment & Terrain Tiles
    this.load.image('tile-grass', 'assets/tiles/grass.png');
    this.load.image('tile-road', 'assets/tiles/road.png');
    this.load.image('tile-rock', 'assets/tiles/rock.png');
    this.load.image('tile-foliage', 'assets/tiles/foliage.png');
    this.load.image('base-platform', 'assets/tiles/base_platform.png');

    // 2. Towers & Upgrades (Levels 1-2 and Level 3 Branching Specializations)
    this.load.image('tower-base-archer', 'assets/towers/base_archer.png');
    this.load.image('tower-base-cannon', 'assets/towers/base_cannon.png');
    this.load.image('tower-base-frost', 'assets/towers/base_frost.png');

    this.load.image('tower-top-archer', 'assets/towers/tower_archer_lvl1.png');
    this.load.image('tower-top-archer-lvl2', 'assets/towers/tower_archer_lvl2.png');
    this.load.image('tower-top-archer-spec-a', 'assets/towers/tower_archer_spec_a.png'); // Rapid Ranger
    this.load.image('tower-top-archer-spec-b', 'assets/towers/tower_archer_spec_b.png'); // Sniper Tower

    this.load.image('tower-top-cannon', 'assets/towers/tower_cannon_lvl1.png');
    this.load.image('tower-top-cannon-lvl2', 'assets/towers/tower_cannon_lvl2.png');
    this.load.image('tower-top-cannon-spec-a', 'assets/towers/tower_cannon_spec_a.png'); // Siege Cannon
    this.load.image('tower-top-cannon-spec-b', 'assets/towers/tower_cannon_spec_b.png'); // Heavy Artillery

    this.load.image('tower-top-frost', 'assets/towers/tower_frost_lvl1.png');
    this.load.image('tower-top-frost-lvl2', 'assets/towers/tower_frost_lvl2.png');
    this.load.image('tower-top-frost-spec-a', 'assets/towers/tower_frost_spec_a.png'); // Blizzard Spire
    this.load.image('tower-top-frost-spec-b', 'assets/towers/tower_frost_spec_b.png'); // Lightning Conductor

    this.load.image('barricade', 'assets/towers/barricade.png');
    this.load.image('barricade-lvl2', 'assets/towers/barricade_lvl2.png');

    // 3. Enemies & Boss Encounters
    this.load.image('enemy-grunt', 'assets/enemies/enemy_grunt.png');
    this.load.image('enemy-runner', 'assets/enemies/enemy_runner.png');
    this.load.image('enemy-brute', 'assets/enemies/enemy_brute.png');
    this.load.image('enemy-swarm', 'assets/enemies/enemy_swarm.png');
    this.load.image('enemy-healer', 'assets/enemies/enemy_healer.png');
    this.load.image('enemy-shield', 'assets/enemies/enemy_shield.png');
    this.load.image('boss-colossus', 'assets/enemies/boss_colossus.png');
    this.load.image('boss-warlord', 'assets/enemies/boss_warlord.png');
    this.load.spritesheet('slime-sheet', 'assets/enemies/slime_spritesheet.png', {
      frameWidth: 24,
      frameHeight: 24,
    });

    // 4. Projectiles
    this.load.image('proj-arrow', 'assets/projectiles/proj_arrow.png');
    this.load.image('proj-cannonball', 'assets/projectiles/proj_cannonball.png');
    this.load.image('proj-frost', 'assets/projectiles/proj_frost.png');
    this.load.image('proj-rapid', 'assets/projectiles/proj_rapid.png');
    this.load.image('proj-sniper', 'assets/projectiles/proj_sniper.png');
    this.load.image('coin-sprite', 'assets/projectiles/coin.png');

    // 5. Effects & Particles
    this.load.image('spark', 'assets/effects/spark.png');
    this.load.image('smoke', 'assets/effects/smoke.png');
    this.load.image('flame', 'assets/effects/flame.png');
    this.load.image('magic', 'assets/effects/magic.png');
    this.load.image('muzzle', 'assets/effects/muzzle.png');
    this.load.image('lightning-beam', 'assets/effects/lightning_beam.png');
    this.load.image('heal-spark', 'assets/effects/heal_spark.png');
    this.load.image('shield-barrier', 'assets/effects/shield_barrier.png');

    // 6. Audio Foley
    this.load.audio('sfx-click', 'assets/audio/click.ogg');
    this.load.audio('sfx-toggle', 'assets/audio/toggle.ogg');
    this.load.audio('sfx-wood', 'assets/audio/impact_wood.ogg');
    this.load.audio('sfx-metal', 'assets/audio/impact_metal.ogg');
    this.load.audio('sfx-glass', 'assets/audio/impact_glass.ogg');
    this.load.audio('sfx-coin', 'assets/audio/coin.ogg');
    this.load.audio('sfx-place', 'assets/audio/place.ogg');
  }

  create() {
    // Generate procedural fallback textures for any missing keys
    generateAllTextures(this);

    // Create slime animations if spritesheet exists
    if (this.textures.exists('slime-sheet')) {
      this.anims.create({
        key: 'slime-bounce',
        frames: this.anims.generateFrameNumbers('slime-sheet', { start: 0, end: 5 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    // Transition smoothly to MenuScene
    this.scene.start('MenuScene');
  }
}
