import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config/gameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HUD } from './ui/HUD.js';
import { LeaderboardUI } from './ui/LeaderboardUI.js';
import { StatisticsPanel } from './ui/StatisticsPanel.js';
import { Leaderboard } from './systems/Leaderboard.js';
import { audio } from './rendering/AudioSynth.js';

// 1. Instantiate shared systems for UI
const globalLeaderboard = new Leaderboard();

// 2. Initialize Phaser Game
const phaserConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#080b12',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    // The game art is 64 px pixel art, so textures use nearest-neighbour
    // filtering and pixel-aligned drawing to stay crisp.
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  scene: [BootScene, MenuScene, GameScene],
};

const game = new Phaser.Game(phaserConfig);

// 3. Mount UI Layers into DOM
const hudContainer = document.getElementById('hud-container');
const modalContainer = document.getElementById('modal-container');

window.gameHUD = new HUD(hudContainer, {});
window.gameLeaderboardUI = new LeaderboardUI(modalContainer, globalLeaderboard, {
  onReturnToMenu: () => {
    const gameScene = game.scene.getScene('GameScene');
    if (gameScene && gameScene.scene.isActive()) {
      gameScene.scene.start('MenuScene');
    }
  },
});

// Setup Statistics Panel (Codex)
const getGameScene = () => game.scene.getScene('GameScene');

window.gameCodex = new StatisticsPanel(
  modalContainer,
  {
    get pathfinding() {
      return getGameScene()?.pathfinding || { lastRun: null, cumulative: { runs: 0, nodesVisited: 0 } };
    },
    get leaderboard() {
      return globalLeaderboard;
    },
    get gameState() {
      return getGameScene()?.gameState || { counters: {} };
    },
    get queue() {
      return getGameScene()?.waveManager?.spawnQueue || null;
    },
  },
  {
    onToggleBFSVisualizer: (enabled) => {
      getGameScene()?.toggleBFSVisualizer(enabled);
    },
  }
);

// 4. Bind Main Menu Actions
document.getElementById('menu-btn-play')?.addEventListener('click', () => {
  const menuScene = game.scene.getScene('MenuScene');
  if (menuScene && menuScene.scene.isActive()) {
    menuScene.startGame();
  }
});

document.getElementById('menu-btn-how-to-play')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('instructions-modal')?.classList.remove('hidden');
});

document.getElementById('btn-close-how')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('instructions-modal')?.classList.add('hidden');
});
document.getElementById('btn-done-how')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('instructions-modal')?.classList.add('hidden');
});

document.getElementById('menu-btn-leaderboard')?.addEventListener('click', () => {
  window.gameLeaderboardUI.show();
});

document.getElementById('menu-btn-codex')?.addEventListener('click', () => {
  window.gameCodex.show();
});

document.getElementById('menu-btn-credits')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('credits-modal')?.classList.remove('hidden');
});

document.getElementById('btn-close-credits')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('credits-modal')?.classList.add('hidden');
});
document.getElementById('btn-done-credits')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('credits-modal')?.classList.add('hidden');
});

// ---------------------------------------------------------------- a11y / UX

// Dismiss the portrait "rotate your device" hint for this session.
document.getElementById('btn-rotate-dismiss')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('rotate-hint')?.classList.add('dismissed');
});

// Clicking the dimmed backdrop (or pressing Escape) closes a dialog.
for (const id of ['instructions-modal', 'credits-modal']) {
  const overlay = document.getElementById(id);
  overlay?.addEventListener('click', (event) => {
    if (event.target !== overlay) return;
    audio.playClick();
    overlay.classList.add('hidden');
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  for (const id of ['instructions-modal', 'credits-modal']) {
    document.getElementById(id)?.classList.add('hidden');
  }
});

// Global user interaction listener to unlock Web Audio on first gesture
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
