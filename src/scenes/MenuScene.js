import { audio } from '../rendering/AudioSynth.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { width, height } = this.scale;

    // Dark fantasy atmospheric background with grid coordinates
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x080b12, 0x080b12, 0x141b2a, 0x141b2a, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle runic battle grid lines
    bg.lineStyle(1, 0x222d42, 0.4);
    for (let x = 0; x < width; x += 64) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 64) {
      bg.lineBetween(0, y, width, y);
    }

    // Drifting particle embers
    if (this.textures.exists('spark')) {
      const particles = this.add.particles(0, 0, 'spark', {
        x: { min: 0, max: width },
        y: { min: height - 100, max: height + 20 },
        speedY: { min: -40, max: -90 },
        speedX: { min: -15, max: 15 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 4000,
        frequency: 180,
        tint: [0xf5c451, 0xff7a59, 0x4ee1ff],
      });
      particles.setDepth(2);
    }

    // Mount or reveal the HTML main menu overlay
    const menuOverlay = document.getElementById('main-menu-overlay');
    if (menuOverlay) {
      menuOverlay.classList.remove('hidden');
    }

    // Hide the whole HUD layer while the menu is up (panels, camera
    // controls, floating inspector) so nothing shows through the overlay.
    document.getElementById('hud-container')?.classList.add('hidden');
    window.gameHUD?.reset?.();
  }

  startGame() {
    audio.playClick();
    const menuOverlay = document.getElementById('main-menu-overlay');
    if (menuOverlay) menuOverlay.classList.add('hidden');

    document.getElementById('hud-container')?.classList.remove('hidden');

    this.scene.start('GameScene');
  }
}
