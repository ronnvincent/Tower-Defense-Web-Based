import { TILE_SIZE, MAP_COLS, MAP_ROWS, STARTING_COINS, STARTING_BASE_HEALTH, SCORE, WAVE_CLEAR_COINS, MAX_FRAME_DELTA } from '../config/gameConfig.js';
import { parseMap, TILE } from '../data/mapData.js';
import { WAVES } from '../data/waveData.js';
import { getBuildDefinition } from '../data/towerData.js';
import { PathfindingSystem } from '../systems/PathfindingSystem.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { GameStateManager, STATUS } from '../systems/GameStateManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { PlacementSystem, PLACEMENT_ERRORS } from '../systems/PlacementSystem.js';
import { Leaderboard } from '../systems/Leaderboard.js';
import { Enemy } from '../entities/Enemy.js';
import { Tower } from '../entities/Tower.js';
import { compactInPlace } from '../utils/arrayUtils.js';
import { audio } from '../rendering/AudioSynth.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.scale;

    // 1. Initialize Systems & Managers
    this.map = parseMap();
    this.pathfinding = new PathfindingSystem(this.map);
    this.pathfinding.computeMainPath();

    this.economy = new EconomyManager(STARTING_COINS);
    this.gameState = new GameStateManager(STARTING_BASE_HEALTH);
    this.placement = new PlacementSystem(this.map);
    this.leaderboard = new Leaderboard();

    this.activeEnemies = [];
    this.activeTowers = [];
    this.activeProjectiles = [];

    this.waveManager = new WaveManager(WAVES, {
      onSpawn: (type, waveNumber) => this.spawnEnemy(type, waveNumber),
    });

    // Speed & simulation controls
    this.simSpeed = 1;
    this.selectedBuildKey = null;
    this.selectedTower = null;
    this.hoverTile = { row: -1, col: -1 };
    this.isVisualizingBFS = false;

    // 2. Render Environment Graphics
    this.renderBattlefieldMap();
    this.createParticleSystems();
    this.createPortalAndBase();

    // Visual overlay graphics
    this.ghostGraphics = this.add.graphics().setDepth(30);
    this.bfsVisualizerGraphics = this.add.graphics().setDepth(8);

    this.activeBoss = null;

    // 3. Connect UI
    this.hud = window.gameHUD;
    if (this.hud) {
      this.hud.callbacks = {
        onStartWave: () => this.handleStartWave(),
        onToggleSpeed: () => this.handleToggleSpeed(),
        onTogglePause: () => this.handleTogglePause(),
        onOpenCodex: () => this.handleOpenCodex(),
        onOpenMenu: () => this.handleOpenMenu(),
        onSelectBuild: (key) => this.handleSelectBuild(key),
        onUpgradeTower: (t, choiceKey) => this.handleUpgradeTower(t, choiceKey),
        onSellTower: (t) => this.handleSellTower(t),
        onDeselectTower: () => this.handleDeselectTower(),
      };
      this.syncHUD();
    }

    // 4. Input Events
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerdown', (pointer) => this.handlePointerDown(pointer));
    this.bindKeyboardShortcuts();
  }

  createParticleSystems() {
    if (this.textures.exists('spark')) {
      this.particleEmitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 30, max: 90 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 380,
        emitting: false,
      });
      this.particleEmitter.setDepth(45);
    }
  }

  renderBattlefieldMap() {
    const tilesGraphics = this.add.graphics().setDepth(3);
    const isRoadCell = (r, c) =>
      r >= 0 &&
      r < this.map.rows &&
      c >= 0 &&
      c < this.map.cols &&
      (this.map.tiles[r][c] === TILE.ROAD ||
        this.map.tiles[r][c] === TILE.SPAWN ||
        this.map.tiles[r][c] === TILE.BASE);

    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const type = this.map.tiles[r][c];
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;

        // Every cell starts as grass — the Spire road tiles carry their own
        // ragged grass edges, so a single draw call per tile is enough.
        if (this.textures.exists('tile-grass')) {
          this.add.image(cx, cy, 'tile-grass').setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
        } else {
          tilesGraphics.fillStyle((r + c) % 2 === 0 ? 0x1c3a33 : 0x1f4038);
          tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }

        if (type === TILE.ROAD || type === TILE.SPAWN || type === TILE.BASE) {
          // 4-bit neighbour mask -> one of 16 pre-baked road tiles.
          const mask =
            (isRoadCell(r - 1, c) ? 1 : 0) |
            (isRoadCell(r, c + 1) ? 2 : 0) |
            (isRoadCell(r + 1, c) ? 4 : 0) |
            (isRoadCell(r, c - 1) ? 8 : 0);
          const key = `tile-road-${mask}`;
          this.add
            .image(cx, cy, this.textures.exists(key) ? key : 'tile-road-15')
            .setDisplaySize(TILE_SIZE, TILE_SIZE)
            .setDepth(1);
        } else if (type === TILE.ROCK) {
          if (this.textures.exists('tile-rock')) {
            this.add.image(cx, cy, 'tile-rock').setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(2);
          } else {
            tilesGraphics.fillStyle(0x15302a);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (type === TILE.WATER) {
          if (this.textures.exists('tile-water')) {
            this.add.image(cx, cy, 'tile-water').setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
          } else {
            tilesGraphics.fillStyle(0x133854, 1);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (type === TILE.GRASS) {
          // Natural environmental foliage
          if ((r * 11 + c * 17) % 5 === 0 && this.textures.exists('tile-foliage')) {
            this.add
              .image(cx + (r % 3 - 1) * 8, cy + (c % 3 - 1) * 8, 'tile-foliage')
              .setScale(0.9)
              .setAlpha(0.95)
              .setDepth(2);
          }
        }
      }
    }

    // Subtle tactical grid lines (kept so placement stays readable)
    tilesGraphics.lineStyle(1, 0x1b2838, 0.18);
    for (let c = 0; c <= this.map.cols; c++) {
      tilesGraphics.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, this.map.rows * TILE_SIZE);
    }
    for (let r = 0; r <= this.map.rows; r++) {
      tilesGraphics.lineBetween(0, r * TILE_SIZE, this.map.cols * TILE_SIZE, r * TILE_SIZE);
    }
  }

  createPortalAndBase() {
    const { spawn, base } = this.map;

    // Spawn Portal
    const spawnX = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    this.portalSprite = this.add.image(spawnX, spawnY, 'portal').setDepth(10);
    this.tweens.add({
      targets: this.portalSprite,
      rotation: Math.PI * 2,
      duration: 7000,
      repeat: -1,
    });

    // Base Monolith
    const baseX = base.col * TILE_SIZE + TILE_SIZE / 2;
    const baseY = base.row * TILE_SIZE + TILE_SIZE / 2;
    this.basePlatform = this.add.image(baseX, baseY, 'base-platform').setDepth(10);
    this.baseCrystal = this.add.image(baseX, baseY - 12, 'base-crystal').setDepth(11);

    this.tweens.add({
      targets: this.baseCrystal,
      y: baseY - 20,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  spawnEnemy(typeKey, waveNumber) {
    const enemy = new Enemy(this, typeKey, waveNumber, this.pathfinding.mainPath, {
      onReachedBase: (e) => this.handleEnemyReachedBase(e),
      onDefeated: (e) => this.handleEnemyDefeated(e),
      onBossSpawn: (e) => {
        this.activeBoss = e;
        this.hud?.showBossBar(e);
        audio.playWarning();
        this.hud?.showToast(`⚠️ BOSS APPROACHING: ${e.def.name}!`, 'warning');
      },
      onBossPhaseChange: (e, phase) => {
        this.hud?.updateBossBar(e);
        this.cameras.main.shake(300, 0.012);
        audio.playWarning();
        this.hud?.showToast(`⚡ ${e.def.name} Phase Shift: ${phase.name}!`, 'warning');
      },
      onBossDefeated: (e) => {
        if (this.activeBoss === e) {
          this.activeBoss = null;
          this.hud?.hideBossBar();
        }
        audio.playVictory();
        this.hud?.showToast(`🏆 BOSS DEFEATED: ${e.def.name}!`, 'success');
      },
      onSummonMinions: (typeKey, count) => {
        for (let k = 0; k < count; k++) {
          this.time.delayedCall(k * 320, () => {
            if (!this.gameState.isOver()) {
              this.spawnEnemy(typeKey, this.waveManager.waveNumber);
            }
          });
        }
      },
    });
    this.activeEnemies.push(enemy);
    this.gameState.counters.enemiesSpawned++;
  }

  handleEnemyReachedBase(enemy) {
    audio.playDefeat();
    this.cameras.main.shake(160, 0.007);
    const destroyed = this.gameState.damageBase(enemy.baseDamage);
    this.gameState.counters.enemiesEscaped++;

    if (this.activeBoss === enemy) {
      this.activeBoss = null;
      this.hud?.hideBossBar();
    }

    if (destroyed) {
      this.handleGameOver();
    }
    this.syncHUD();
  }

  handleEnemyDefeated(enemy) {
    audio.playCoin();
    this.economy.earn(enemy.reward);
    this.economy.addScore(enemy.score);
    this.gameState.counters.enemiesDefeated++;

    if (this.activeBoss === enemy) {
      this.activeBoss = null;
      this.hud?.hideBossBar();
    }

    this.syncHUD();
  }

  handleStartWave() {
    if (!this.waveManager.canStartNextWave()) return;
    audio.playWaveStart();
    const started = this.waveManager.startNextWave();
    if (started) {
      this.hud?.showToast(`Wave ${this.waveManager.waveNumber}: ${this.waveManager.currentWave.name}!`, 'info');
    }
    this.syncHUD();
  }

  handleToggleSpeed() {
    this.simSpeed = this.simSpeed === 1 ? 2 : 1;
    return this.simSpeed;
  }

  handleTogglePause() {
    if (this.gameState.isPaused()) {
      this.gameState.resume();
    } else {
      this.gameState.pause();
    }
    return this.gameState.isPaused();
  }

  handleOpenCodex() {
    if (window.gameCodex) {
      window.gameCodex.show();
    }
  }

  handleOpenMenu() {
    this.scene.start('MenuScene');
  }

  handleSelectBuild(key) {
    this.selectedBuildKey = key;
    if (key && this.selectedTower) {
      this.handleDeselectTower();
    }
    this.updateGhostGraphics();
  }

  handleUpgradeTower(tower, choiceKey = null) {
    if (tower.upgrade(choiceKey)) {
      this.hud?.inspectTower(tower);
      this.syncHUD();
    }
  }

  handleSellTower(tower) {
    const refund = tower.sellRefund;
    this.economy.earn(refund);
    this.placement.release(tower.row, tower.col);

    if (tower.isBarricade) {
      // Barricade sold: restore graph node and reroute live enemies
      const enemyStarts = this.activeEnemies.map((e) => ({ id: e.id, startKey: e.getNextCellKey() }));
      const newPaths = this.pathfinding.unblockCell(`${tower.row},${tower.col}`, enemyStarts);
      for (const enemy of this.activeEnemies) {
        if (newPaths.has(enemy.id)) {
          enemy.reroute(newPaths.get(enemy.id));
        }
      }
      this.gameState.counters.towersSold++;
    } else {
      this.gameState.counters.towersSold++;
    }

    const idx = this.activeTowers.indexOf(tower);
    if (idx !== -1) this.activeTowers.splice(idx, 1);
    tower.destroy();

    this.selectedTower = null;
    this.syncHUD();
    if (this.isVisualizingBFS) this.drawBFSVisualization();
  }

  handleDeselectTower() {
    if (this.selectedTower) {
      this.selectedTower.setSelected(false);
      this.selectedTower = null;
    }
  }

  handlePointerMove(pointer) {
    const col = Math.floor(pointer.x / TILE_SIZE);
    const row = Math.floor(pointer.y / TILE_SIZE);

    if (row !== this.hoverTile.row || col !== this.hoverTile.col) {
      this.hoverTile = { row, col };
      this.updateGhostGraphics();
    }
  }

  handlePointerDown(pointer) {
    const col = Math.floor(pointer.x / TILE_SIZE);
    const row = Math.floor(pointer.y / TILE_SIZE);

    if (!this.placement.inBounds(row, col)) return;

    // 1. If building a tower/barricade
    if (this.selectedBuildKey) {
      this.attemptBuild(this.selectedBuildKey, row, col);
      return;
    }

    // 2. Otherwise inspect an existing occupant on this tile
    const occupant = this.placement.getOccupant(row, col);
    if (occupant) {
      audio.playClick();
      this.handleDeselectTower();
      this.selectedTower = occupant;
      this.selectedTower.setSelected(true);
      this.hud?.inspectTower(occupant);
    } else {
      this.handleDeselectTower();
      this.hud?.closeInspector();
    }
  }

  attemptBuild(typeKey, row, col) {
    const def = getBuildDefinition(typeKey);
    const validation = this.placement.validate(def, row, col, this.economy.coins);

    if (!validation.ok) {
      audio.playError();
      const errMsg = PLACEMENT_ERRORS[validation.reason] || 'Invalid location';
      this.hud?.showToast(errMsg, 'error');
      return;
    }

    // Additional path feasibility check for Barricades
    if (typeKey === 'barricade') {
      const cell = `${row},${col}`;
      const enemyStarts = this.activeEnemies.map((e) => ({ id: e.id, startKey: e.getNextCellKey() }));
      const blockResult = this.pathfinding.tryBlockCell(cell, enemyStarts);

      if (!blockResult.ok) {
        audio.playError();
        this.gameState.counters.barricadesRejected++;
        const errMsg = PLACEMENT_ERRORS[blockResult.reason] || 'Cannot place barricade here';
        this.hud?.showToast(errMsg, 'error');
        return;
      }

      // Barricade accepted: deduct coins and reroute enemies
      this.economy.spend(def.cost);
      const barricade = new Tower(this, typeKey, row, col, {
        economy: this.economy,
        gameState: this.gameState,
        activeEnemies: this.activeEnemies,
        activeProjectiles: this.activeProjectiles,
      });
      this.placement.occupy(row, col, barricade);
      this.activeTowers.push(barricade);
      this.gameState.counters.barricadesPlaced++;
      audio.playPlace();

      // Apply new routes to living enemies
      for (const enemy of this.activeEnemies) {
        if (blockResult.enemyPaths.has(enemy.id)) {
          enemy.reroute(blockResult.enemyPaths.get(enemy.id));
        }
      }

      this.hud?.showToast('Barricade placed! Enemies rerouting via BFS...', 'info');
    } else {
      // Normal Tower placement
      this.economy.spend(def.cost);
      const tower = new Tower(this, typeKey, row, col, {
        economy: this.economy,
        gameState: this.gameState,
        activeEnemies: this.activeEnemies,
        activeProjectiles: this.activeProjectiles,
      });
      this.placement.occupy(row, col, tower);
      this.activeTowers.push(tower);
      this.gameState.counters.towersPlaced++;
      audio.playPlace();
    }

    this.syncHUD();
    this.updateGhostGraphics();
    if (this.isVisualizingBFS) this.drawBFSVisualization();
  }

  updateGhostGraphics() {
    this.ghostGraphics.clear();
    if (!this.selectedBuildKey) return;

    const { row, col } = this.hoverTile;
    if (!this.placement.inBounds(row, col)) return;

    const def = getBuildDefinition(this.selectedBuildKey);
    const valid = this.placement.validate(def, row, col, this.economy.coins).ok;

    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    const color = valid ? 0x5cf2a6 : 0xff5470;

    // Tile outline box
    this.ghostGraphics.lineStyle(2, color, 0.9);
    this.ghostGraphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
    this.ghostGraphics.fillStyle(color, 0.15);
    this.ghostGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Attack Range circle preview
    if (def.levels && def.levels[0]) {
      const centerX = x + TILE_SIZE / 2;
      const centerY = y + TILE_SIZE / 2;
      const range = def.levels[0].range;
      this.ghostGraphics.lineStyle(2, color, 0.65);
      this.ghostGraphics.fillStyle(color, 0.05);
      this.ghostGraphics.strokeCircle(centerX, centerY, range);
      this.ghostGraphics.fillCircle(centerX, centerY, range);
    }
  }

  toggleBFSVisualizer(enabled) {
    this.isVisualizingBFS = enabled;
    if (enabled) {
      this.drawBFSVisualization();
    } else {
      this.bfsVisualizerGraphics.clear();
    }
  }

  drawBFSVisualization() {
    this.bfsVisualizerGraphics.clear();
    const result = this.pathfinding.lastMainResult;
    if (!result || !result.path) return;

    // Draw active shortest path in glowing gold
    this.bfsVisualizerGraphics.lineStyle(5, 0xf5c451, 0.85);
    this.bfsVisualizerGraphics.beginPath();
    for (let i = 0; i < result.path.length; i++) {
      const [r, c] = result.path[i].split(',').map(Number);
      const px = c * TILE_SIZE + TILE_SIZE / 2;
      const py = r * TILE_SIZE + TILE_SIZE / 2;
      if (i === 0) this.bfsVisualizerGraphics.moveTo(px, py);
      else this.bfsVisualizerGraphics.lineTo(px, py);

      // Node dot
      this.bfsVisualizerGraphics.fillStyle(0xffffff, 0.9);
      this.bfsVisualizerGraphics.fillCircle(px, py, 4);
    }
    this.bfsVisualizerGraphics.stroke();
  }

  handleGameOver() {
    this.gameState.end(STATUS.GAME_OVER);
    this.hud?.hideBossBar();
    audio.playDefeat();
    if (window.gameLeaderboardUI) {
      window.gameLeaderboardUI.show({
        status: 'defeat',
        score: this.economy.score,
        waves: this.waveManager.wavesCompleted,
        timeMs: this.gameState.elapsedMs,
      });
    }
  }

  handleVictory() {
    this.gameState.end(STATUS.VICTORY);
    this.hud?.hideBossBar();
    // Base health survival score bonus
    this.economy.addScore(this.gameState.baseHealth * SCORE.victoryPerBaseHp);
    audio.playVictory();
    if (window.gameLeaderboardUI) {
      window.gameLeaderboardUI.show({
        status: 'victory',
        score: this.economy.score,
        waves: this.waveManager.wavesCompleted,
        timeMs: this.gameState.elapsedMs,
      });
    }
  }

  syncHUD() {
    if (!this.hud) return;
    this.hud.update({
      baseHealth: this.gameState.baseHealth,
      maxBaseHealth: this.gameState.maxBaseHealth,
      coins: this.economy.coins,
      score: this.economy.score,
      waveNumber: Math.max(1, this.waveManager.waveNumber),
      totalWaves: this.waveManager.totalWaves,
      enemiesRemaining: this.activeEnemies.length + this.waveManager.pendingSpawns(),
      canStartWave: this.waveManager.canStartNextWave(),
      isSpawning: this.waveManager.state === 'spawning',
    });
  }

  bindKeyboardShortcuts() {
    this.input.keyboard.on('keydown', (event) => {
      if (event.key === '1') this.hud?.toggleBuildSelection('archer');
      else if (event.key === '2') this.hud?.toggleBuildSelection('cannon');
      else if (event.key === '3') this.hud?.toggleBuildSelection('frost');
      else if (event.key === '4') this.hud?.toggleBuildSelection('barricade');
      else if (event.key === 'Escape') {
        this.hud?.clearBuildSelection();
        this.handleDeselectTower();
      } else if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (this.waveManager.canStartNextWave()) {
          this.handleStartWave();
        } else {
          this.handleTogglePause();
        }
      } else if (event.key.toLowerCase() === 'c') {
        this.handleOpenCodex();
      } else if (event.key.toLowerCase() === 'l') {
        window.gameLeaderboardUI?.show();
      }
    });
  }

  update(time, rawDelta) {
    if (this.gameState.isPaused() || this.gameState.isOver()) return;

    // Cap delta to prevent huge jumps after backgrounding tab
    const clampedDelta = Math.min(rawDelta, MAX_FRAME_DELTA) * this.simSpeed;

    this.gameState.tick(clampedDelta);

    // 1. Wave Manager Update
    const waveEvent = this.waveManager.update(clampedDelta, this.activeEnemies.length);
    if (waveEvent && waveEvent.type === 'waveComplete') {
      audio.playWaveStart();
      const bonusCoins = WAVE_CLEAR_COINS.base + WAVE_CLEAR_COINS.perWave * waveEvent.waveNumber;
      const bonusScore = SCORE.waveClearBase * waveEvent.waveNumber;
      this.economy.earn(bonusCoins);
      this.economy.addScore(bonusScore);
      this.hud?.showToast(`Wave ${waveEvent.waveNumber} Cleared! (+🪙${bonusCoins}, +${bonusScore} pts)`, 'info');

      if (waveEvent.isFinal) {
        this.handleVictory();
      }
      this.syncHUD();
    }

    // 2. Active Enemies Update
    for (let i = 0; i < this.activeEnemies.length; i++) {
      this.activeEnemies[i].update(clampedDelta);
    }
    // In-place O(n) array compaction
    compactInPlace(this.activeEnemies, (e) => !e.isDead && !e.reachedBase);

    // 3. Active Towers Update
    for (let i = 0; i < this.activeTowers.length; i++) {
      this.activeTowers[i].update(clampedDelta);
    }

    // 4. Active Projectiles Update
    for (let i = 0; i < this.activeProjectiles.length; i++) {
      this.activeProjectiles[i].update(clampedDelta);
    }
    compactInPlace(this.activeProjectiles, (p) => !p.isDead);

    // 5. Boss Status HUD Update
    if (this.activeBoss) {
      if (this.activeBoss.isDead || this.activeBoss.reachedBase) {
        this.activeBoss = null;
        this.hud?.hideBossBar();
      } else {
        this.hud?.updateBossBar(this.activeBoss);
      }
    }

    // Synchronize HUD
    this.syncHUD();
  }
}
