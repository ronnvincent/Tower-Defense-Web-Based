import { TILE_SIZE, MAP_COLS, MAP_ROWS, STARTING_COINS, STARTING_BASE_HEALTH, SCORE, WAVE_CLEAR_COINS, MAX_FRAME_DELTA } from '../config/gameConfig.js';
import { parseMap, getMapLayout, TILE } from '../data/mapData.js';
import { getLevel, THEMES, makeEndlessWave } from '../data/levelData.js';
import { getBuildDefinition } from '../data/towerData.js';
import { PathfindingSystem } from '../systems/PathfindingSystem.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { GameStateManager, STATUS } from '../systems/GameStateManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { PlacementSystem, PLACEMENT_ERRORS } from '../systems/PlacementSystem.js';
import { Leaderboard } from '../systems/Leaderboard.js';
import { Enemy } from '../entities/Enemy.js';
import { Tower } from '../entities/Tower.js';
import { resolveSiegeSwing } from '../systems/BarricadeCombat.js';
import { BUILD_OPTIONS } from '../data/towerData.js';
import { compactInPlace } from '../utils/arrayUtils.js';
import { audio } from '../rendering/AudioSynth.js';
import { CameraRig } from '../camera/CameraRig.js';
import { UpgradeBadges } from '../ui/UpgradeBadge.js';
import { ProgressStore } from '../systems/Progression.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Phaser calls init(data) before create(). `data.levelId` selects the
   * campaign node; everything else (map, waves, economy, theme, boss) is
   * derived from it, so a restart is just another `scene.start`.
   */
  init(data) {
    this.levelId = data?.levelId || 'level-1';
    this.level = getLevel(this.levelId);
    // getLevel() falls back to level 1 for an unknown id; adopt the resolved id
    // so a later restart / replay cannot carry the stale one forward.
    this.levelId = this.level.id;
    this.theme = THEMES[this.level.theme] || THEMES.grassland;
    this.progress = window.gameProgress || new ProgressStore();
  }

  create() {
    const { width, height } = this.scale;

    // 1. Initialize Systems & Managers — all scoped to the selected level.
    this.map = parseMap(getMapLayout(this.level.map));
    this.pathfinding = new PathfindingSystem(this.map);
    this.pathfinding.computeMainPath();
    // Hash set of the cells the horde marches (row,col). Palisades may only be
    // planted on this route — see PlacementSystem.validate.
    this.routeCells = new Set(this.pathfinding.mainPath);

    this.economy = new EconomyManager(this.level.startingCoins);
    this.gameState = new GameStateManager(this.level.baseHealth);
    this.placement = new PlacementSystem(this.map);
    this.leaderboard = new Leaderboard();

    this.activeEnemies = [];
    this.activeTowers = [];
    this.activeProjectiles = [];

    this.waveManager = new WaveManager(this.level.endless ? [] : this.level.waves, {
      onSpawn: (type, waveNumber) => this.spawnEnemy(type, waveNumber),
      endless: Boolean(this.level.endless),
      waveFactory: (n) => makeEndlessWave(n),
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

    // 2b. Camera rig — drag to pan, wheel/pinch to zoom. Pointer → world
    // coordinates now always go through the rig (see handlePointerMove/Up).
    this.lastPointerScreen = null;
    this.cameraRig = new CameraRig(this, {
      bounds: { x: 0, y: 0, width: this.scale.width, height: this.scale.height },
      onZoomChange: (state) => {
        this.hud?.setZoomState(state);
        this.refreshHoverFromLastPointer();
      },
    });
    this.cameraRig.install();

    // 2c. Floating upgrade badges above every defence.
    this.badges = new UpgradeBadges(this, {
      onActivate: (tower) => this.selectTower(tower),
    });

    // 3. Connect UI — the HUD layer ships hidden so it never flashes over the
    // menu; reveal it defensively in case the scene is started directly.
    document.getElementById('hud-container')?.classList.remove('hidden');
    this.hud = window.gameHUD;
    if (this.hud) {
      this.hud.reset();
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
        onZoomIn: () => this.cameraRig.zoomBy(1.25),
        onZoomOut: () => this.cameraRig.zoomBy(1 / 1.25),
        onZoomReset: () => this.cameraRig.reset(),
      };
      this.hud.setZoomState(this.cameraRig.zoomState());
      this.hud.showCameraHintOnce();
      this.syncHUD();
    }

    // 4. Input Events — the rig is installed first, so it can tell the scene
    // whether a pointerup was a tap or the end of a pan/pinch.
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
    this.bindKeyboardShortcuts();

    this.events.once('shutdown', () => {
      this.cameraRig?.destroy();
      this.badges?.clear();
    });
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

  /** Theme-aware texture key with a graceful fallback to the base art. */
  tileTexture(base) {
    const themed = `${base}${this.theme?.tileSuffix || ''}`;
    if (this.textures.exists(themed)) return themed;
    return this.textures.exists(base) ? base : null;
  }

  renderBattlefieldMap() {
    const tilesGraphics = this.add.graphics().setDepth(3);
    const grassKey = this.tileTexture('tile-grass');
    const rockKey = this.tileTexture('tile-rock');
    const waterKey = this.tileTexture('tile-water');
    const foliageKey = this.tileTexture('tile-foliage');
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
        if (grassKey) {
          this.add.image(cx, cy, grassKey).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
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
          const key = this.tileTexture(`tile-road-${mask}`) || 'tile-road-15';
          this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
        } else if (type === TILE.ROCK) {
          if (rockKey) {
            this.add.image(cx, cy, rockKey).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(2);
          } else {
            tilesGraphics.fillStyle(0x15302a);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (type === TILE.WATER) {
          if (waterKey) {
            this.add.image(cx, cy, waterKey).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
          } else {
            tilesGraphics.fillStyle(0x133854, 1);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (type === TILE.GRASS) {
          // Natural environmental foliage
          if ((r * 11 + c * 17) % 5 === 0 && foliageKey) {
            this.add
              .image(cx + (r % 3 - 1) * 8, cy + (c % 3 - 1) * 8, foliageKey)
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
    if (this.theme?.portalTint) this.portalSprite.setTint(this.theme.portalTint);
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
    if (this.theme?.baseTint) this.baseCrystal.setTint(this.theme.baseTint);

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
        this.hud?.updateBossPhase(e, phase);
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
      getBarricadeAt: (cellKey) => this.getBarricadeAt(cellKey),
      onBarricadeHit: (wall, damage) => this.damageBarricade(wall, damage),
      onSpeedAura: (boss, radius, multiplier, durationMs) =>
        this.handleBossSpeedAura(boss, radius, multiplier, durationMs),
      onDisableTowers: (boss, radius, durationMs) =>
        this.handleBossDisableTowers(boss, radius, durationMs),
      onSummonMinions: (typeKey, count) => {
        for (let k = 0; k < count; k++) {
          // Timers fire from Phaser's UPDATE event, outside update()'s guard —
          // so contain this spawn too rather than risk killing the game loop.
          this.time.delayedCall(k * 320, () => {
            try {
              if (!this.gameState.isOver()) {
                this.spawnEnemy(typeKey, this.waveManager.waveNumber);
              }
            } catch (error) {
              this.reportRuntimeError(error);
            }
          });
        }
      },
    }, { healthScale: this.level.enemyHealthScale });
    this.activeEnemies.push(enemy);
    this.gameState.counters.enemiesSpawned++;
  }

  /** Expanding ring used by boss pulses so the player can read the radius. */
  bossPulse(x, y, radius, color = 0xffb45c) {
    if (!this.add?.circle) return;
    const ring = this.add.circle(x, y, 12, color, 0.12).setDepth(24);
    ring.setStrokeStyle(3, color, 0.8);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sandstorm Aura: haste every other enemy inside the ring.
   * @returns {number} how many enemies were affected (test-visible)
   */
  handleBossSpeedAura(boss, radius, multiplier, durationMs) {
    if (!boss) return 0;
    let affected = 0;
    for (const enemy of this.activeEnemies) {
      if (enemy === boss || enemy.isDead || enemy.reachedBase) continue;
      if (Math.hypot(enemy.x - boss.x, enemy.y - boss.y) <= radius) {
        enemy.applySpeedBoost(multiplier, durationMs);
        affected += 1;
      }
    }
    this.bossPulse(boss.x, boss.y, radius, 0xffb45c);
    this.cameras.main.shake(160, 0.004);
    if (affected > 0) {
      this.hud?.showToast(`🌪️ ${boss.def.name}: ${affected} enemies hastened!`, 'warning');
    }
    return affected;
  }

  /**
   * Glacial Pulse: freeze every tower inside the ring for `durationMs`.
   * Palisades are structures and stay immune (see Tower.disable).
   * @returns {number} how many towers were frozen
   */
  handleBossDisableTowers(boss, radius, durationMs) {
    if (!boss) return 0;
    let affected = 0;
    for (const tower of this.activeTowers) {
      if (tower.isBarricade || tower.isDestroyed) continue;
      if (Math.hypot(tower.x - boss.x, tower.y - boss.y) <= radius) {
        if (tower.disable(durationMs)) affected += 1;
      }
    }
    this.bossPulse(boss.x, boss.y, radius, 0x7fd4ff);
    this.cameras.main.shake(160, 0.004);
    if (affected > 0) {
      // Frozen banners stop projecting their aura until they thaw.
      this.refreshTowerAuras();
      this.hud?.showToast(`❄️ ${boss.def.name}: ${affected} defences frozen!`, 'warning');
    }
    return affected;
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
    this.economy.earn(enemy.reward + this.rewardKillAuraBonus(enemy));
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

  /**
   * Pause / resume, from the HUD button or the space bar. The HUD is updated
   * here rather than only through the next syncHUD() so a keyboard pause shows
   * the pause card immediately — while paused, no simulation frame runs to
   * deliver that update.
   */
  handleTogglePause() {
    if (this.gameState.isOver()) return this.gameState.isPaused();
    if (this.gameState.isPaused()) {
      this.gameState.resume();
    } else {
      this.gameState.pause();
    }
    const isPaused = this.gameState.isPaused();
    this.hud?.setPausedUI?.(isPaused);
    this.syncHUD();
    return isPaused;
  }

  handleOpenCodex() {
    if (window.gameCodex) {
      window.gameCodex.show();
    }
  }

  /**
   * Leave the battle. The pause card has already asked for confirmation; the
   * world map is the destination so the player keeps their campaign context
   * instead of being dropped back at the title screen.
   */
  handleOpenMenu() {
    if (window.gameFlow?.quitToMap) {
      window.gameFlow.quitToMap();
      return;
    }
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
      if (this.selectedTower === tower) {
        this.hud?.inspectTower(tower, this.anchorRatioFor(tower));
      }
      this.badges?.pulse(tower);
      this.refreshTowerAuras();
      this.syncHUD();
      this.updateGhostGraphics();
    }
  }

  handleSellTower(tower) {
    const refund = tower.sellRefund;
    this.economy.earn(refund);
    this.placement.release(tower.row, tower.col);

    this.gameState.counters.towersSold++;

    const idx = this.activeTowers.indexOf(tower);
    if (idx !== -1) this.activeTowers.splice(idx, 1);
    tower.destroy();

    this.selectedTower = null;
    this.badges?.setSelected(null);
    // Removing a support tower must not leave stale buffs behind.
    this.refreshTowerAuras();
    this.syncHUD();
    if (this.isVisualizingBFS) this.drawBFSVisualization();
  }

  handleDeselectTower() {
    if (this.selectedTower) {
      this.selectedTower.setSelected(false);
      this.selectedTower = null;
    }
    this.badges?.setSelected(null);
  }

  /** Screen (canvas) px → tile row/col, honouring camera pan + zoom. */
  tileAtScreen(x, y) {
    const world = this.cameraRig ? this.cameraRig.screenToWorld(x, y) : { x, y };
    return {
      row: Math.floor(world.y / TILE_SIZE),
      col: Math.floor(world.x / TILE_SIZE),
      worldX: world.x,
      worldY: world.y,
    };
  }

  handlePointerMove(pointer) {
    this.lastPointerScreen = { x: pointer.x, y: pointer.y };
    this.refreshHoverFromLastPointer();
  }

  /**
   * Recompute the highlighted tile from the last known pointer position.
   * Called on every move *and* whenever the camera moves, so the build ghost
   * stays glued to the cursor while panning/zooming.
   */
  refreshHoverFromLastPointer() {
    if (!this.lastPointerScreen) return;
    if (this.cameraRig?.isDragging) {
      this.ghostGraphics?.clear();
      return;
    }
    const { x, y } = this.lastPointerScreen;
    const tile = this.tileAtScreen(x, y);
    if (tile.row !== this.hoverTile.row || tile.col !== this.hoverTile.col) {
      this.hoverTile = { row: tile.row, col: tile.col };
      this.updateGhostGraphics();
    }
  }

  handlePointerUp(pointer) {
    // A pan/pinch, a press that began on the HUD, or a right-click must never
    // build a tower or steal a selection.
    if (this.cameraRig && !this.cameraRig.consumeTap()) return;
    if (pointer.rightButtonReleased && pointer.rightButtonReleased()) return;

    const { row, col, worldX, worldY } = this.tileAtScreen(pointer.x, pointer.y);

    // 0. Upgrade badge above a defence?
    const badgeTower = this.badges?.hitTest(worldX, worldY);
    if (badgeTower) {
      audio.playClick();
      this.selectTower(badgeTower);
      return;
    }

    if (!this.placement.inBounds(row, col)) {
      // Tapping the void clears the current selection.
      this.handleDeselectTower();
      this.hud?.closeInspector();
      return;
    }

    // 1. If building a tower/barricade
    if (this.selectedBuildKey) {
      this.attemptBuild(this.selectedBuildKey, row, col);
      return;
    }

    // 2. Otherwise inspect an existing occupant on this tile
    const occupant = this.placement.getOccupant(row, col);
    if (occupant) {
      audio.playClick();
      this.selectTower(occupant);
    } else {
      this.handleDeselectTower();
      this.hud?.closeInspector();
    }
  }

  /** Select a tower, show its range, focus the camera if it is off-screen. */
  selectTower(tower) {
    if (!tower) return;
    if (this.selectedTower && this.selectedTower !== tower) {
      this.selectedTower.setSelected(false);
    }
    this.selectedTower = tower;
    tower.setSelected(true);
    this.badges?.setSelected(tower);
    this.ensureTowerVisible(tower);
    this.hud?.inspectTower(tower, this.anchorRatioFor(tower));
  }

  /** Tower position as a 0..1 fraction of the battlefield (zoom-safe). */
  anchorRatioFor(tower) {
    if (!this.cameraRig) {
      return { x: tower.x / this.scale.width, y: tower.y / this.scale.height };
    }
    const screen = this.cameraRig.worldToScreen(tower.x, tower.y);
    return {
      x: screen.x / this.scale.width,
      y: screen.y / this.scale.height,
    };
  }

  /** If the tower is outside the comfortable part of the view, pan to it. */
  ensureTowerVisible(tower) {
    if (!this.cameraRig) return;
    const screen = this.cameraRig.worldToScreen(tower.x, tower.y);
    const marginX = this.scale.width * 0.14;
    const marginY = this.scale.height * 0.18;
    if (
      screen.x < marginX ||
      screen.x > this.scale.width - marginX ||
      screen.y < marginY ||
      screen.y > this.scale.height - marginY
    ) {
      this.cameraRig.focus(tower.x, tower.y);
      this.hud?.setZoomState(this.cameraRig.zoomState());
    }
  }

  /**
   * Single source of truth for "can this be built here?".
   *
   * The build ghost and the actual build both call it, so the preview can never
   * promise a green tile that the click then rejects. (Barricades used to run a
   * second BFS feasibility pass *after* this check, which is exactly how the
   * ghost ended up lying.)
   *
   * @returns {{ok:boolean, reason:string|null}}
   */
  validateBuild(typeKey, row, col) {
    const def = getBuildDefinition(typeKey);
    if (!def) return { ok: false, reason: 'unknown-type' };

    const base = this.placement.validate(def, row, col, this.economy.coins, {
      route: this.routeCells,
    });
    if (!base.ok) return base;

    // A wall cannot be dropped on top of a living enemy (it would trap it
    // inside the stakes).
    if (typeKey === 'barricade' && this.isEnemyOnCell(row, col)) {
      return { ok: false, reason: 'enemy-on-tile' };
    }
    return { ok: true, reason: null };
  }

  /** Is a living enemy standing on (or stepping into) this cell? */
  isEnemyOnCell(row, col) {
    const key = `${row},${col}`;
    for (const enemy of this.activeEnemies) {
      if (enemy.isDead || enemy.reachedBase) continue;
      if (enemy.getCurrentCellKey?.() === key || enemy.getNextCellKey?.() === key) return true;
    }
    return false;
  }

  /** Palisade occupying a cell key, or null. O(1) via the placement hash map. */
  getBarricadeAt(cellKey) {
    const [row, col] = cellKey.split(',').map(Number);
    const occupant = this.placement.getOccupant(row, col);
    return occupant?.isBarricade ? occupant : null;
  }

  /**
   * A horde member swung at a palisade. Applies the damage and, when the wall
   * finally gives, runs the collapse flow.
   */
  damageBarricade(wall, amount) {
    if (!wall || wall.isDestroyed) return;
    const swing = resolveSiegeSwing(wall, amount);
    if (swing.dealt <= 0) return;
    wall.takeDamage(swing.dealt);

    if (this.particleEmitter) {
      this.particleEmitter.explode(3, wall.x, wall.y - TILE_SIZE * 0.5);
    }
    if (swing.destroyed) this.destroyBarricade(wall);
  }

  /** Collapse: free the tile, remove the wall and let the horde walk on. */
  destroyBarricade(wall) {
    const idx = this.activeTowers.indexOf(wall);
    if (idx !== -1) this.activeTowers.splice(idx, 1);
    this.placement.release(wall.row, wall.col);
    if (this.selectedTower === wall) {
      this.selectedTower = null;
      this.badges?.setSelected(null);
      this.hud?.closeInspector();
    }
    this.gameState.counters.barricadesDestroyed =
      (this.gameState.counters.barricadesDestroyed || 0) + 1;

    audio.playExplosion?.();
    this.cameras.main.shake(180, 0.006);
    if (this.particleEmitter) {
      this.particleEmitter.explode(14, wall.x, wall.y - TILE_SIZE * 0.4);
    }
    this.hud?.showToast('Palisade breached! The horde pushes through.', 'warning');
    wall.destroy();

    this.syncHUD();
    this.updateGhostGraphics();
  }

  attemptBuild(typeKey, row, col) {
    const def = getBuildDefinition(typeKey);
    const validation = this.validateBuild(typeKey, row, col);

    if (!validation.ok) {
      audio.playError();
      if (typeKey === 'barricade') this.gameState.counters.barricadesRejected++;
      const errMsg = PLACEMENT_ERRORS[validation.reason] || 'Invalid location';
      this.hud?.showToast(errMsg, 'error');
      return;
    }

    this.economy.spend(def.cost);
    const tower = new Tower(this, typeKey, row, col, {
      economy: this.economy,
      gameState: this.gameState,
      activeEnemies: this.activeEnemies,
      activeProjectiles: this.activeProjectiles,
    });
    this.placement.occupy(row, col, tower);
    this.activeTowers.push(tower);

    if (tower.isBarricade) {
      this.gameState.counters.barricadesPlaced++;
      this.hud?.showToast('Palisade raised! Enemies must break it down.', 'info');
    } else {
      this.gameState.counters.towersPlaced++;
    }
    audio.playPlace();

    this.refreshTowerAuras();
    this.syncHUD();
    this.updateGhostGraphics();
    if (this.isVisualizingBFS) this.drawBFSVisualization();
  }

  /**
   * Recompute Banner Keep buffs for every tower.
   *
   * Called on build / sell / upgrade instead of every frame: the auras only
   * change when the tower set changes, so the battlefield stays O(n²) once per
   * edit instead of 60 times a second.
   */
  refreshTowerAuras() {
    // A frozen Banner Keep stops projecting until it thaws.
    const banners = this.activeTowers.filter((t) => t.aura && !t.isDestroyed && !t.isDisabled);
    for (const tower of this.activeTowers) {
      let damage = 1;
      let range = 1;
      let cooldown = 1;
      for (const source of banners) {
        if (source === tower) continue;
        const aura = source.aura;
        const d = Math.hypot(tower.x - source.x, tower.y - source.y);
        if (d > aura.radius) continue;
        damage = Math.max(damage, 1 + (aura.damageBonus || 0));
        range = Math.max(range, 1 + (aura.rangeBonus || 0));
        cooldown = Math.min(cooldown, 1 - (aura.fireRateBonus || 0));
      }
      tower.setBuffs({ damage, range, cooldown });
    }
  }

  /** Extra gold from Muster Camps: +1 per kill inside their aura. */
  rewardKillAuraBonus(enemy) {
    let bonus = 0;
    for (const tower of this.activeTowers) {
      const aura = tower.aura;
      if (!aura?.coinPerKill || tower.isDestroyed || tower.isDisabled) continue;
      if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= aura.radius) {
        bonus += aura.coinPerKill;
      }
    }
    return bonus;
  }

  updateGhostGraphics() {
    this.ghostGraphics.clear();
    if (!this.selectedBuildKey) return;

    const { row, col } = this.hoverTile;
    if (!this.placement.inBounds(row, col)) return;

    const def = getBuildDefinition(this.selectedBuildKey);
    const valid = this.validateBuild(this.selectedBuildKey, row, col).ok;

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
    if (this.gameState.isOver()) return;
    this.gameState.end(STATUS.GAME_OVER);
    this.hud?.hideBossBar();
    window.gameCodex?.hide?.();
    audio.playDefeat();

    const score = this.economy.score;
    const record = this.progress.recordDefeat(this.level, {
      wave: this.waveManager.waveNumber,
      score,
    });

    this.showResult({
      outcome: 'defeat',
      level: this.level,
      score,
      waves: this.waveManager.wavesCompleted,
      totalWaves: this.level.endless ? null : this.waveManager.totalWaves,
      timeMs: this.gameState.elapsedMs,
      wave: this.waveManager.waveNumber,
      bestWave: this.progress.profile.endlessBestWave,
      newRecord: Boolean(record?.isRecord),
    });
  }

  handleVictory() {
    if (this.gameState.isOver()) return;
    this.gameState.end(STATUS.VICTORY);
    this.hud?.hideBossBar();
    window.gameCodex?.hide?.();
    // Base health survival score bonus
    this.economy.addScore(this.gameState.baseHealth * SCORE.victoryPerBaseHp);
    audio.playVictory();

    const record = this.progress.recordVictory(this.level, {
      baseHealth: this.gameState.baseHealth,
      maxBaseHealth: this.gameState.maxBaseHealth,
      score: this.economy.score,
    });

    this.showResult({
      outcome: 'victory',
      level: this.level,
      stars: record.stars,
      previousStars: record.previousStars,
      improved: record.improved,
      rewards: record.rewards,
      unlocked: record.unlocked,
      unlockedAll: record.unlockedAll,
      firstClear: record.firstClear,
      score: this.economy.score,
      waves: this.waveManager.wavesCompleted,
      totalWaves: this.waveManager.totalWaves,
      timeMs: this.gameState.elapsedMs,
    });
  }

  /**
   * Hand the run summary to the result screen. Falls back to the leaderboard
   * modal so a missing UI layer can never strand the player on a dead scene.
   */
  showResult(payload) {
    this.lastResult = payload;
    if (window.gameResultScreen?.show) {
      window.gameResultScreen.show(payload);
      return payload;
    }
    window.gameLeaderboardUI?.show?.({
      status: payload.outcome,
      score: payload.score,
      waves: payload.waves,
      timeMs: payload.timeMs,
    });
    return payload;
  }

  syncHUD() {
    if (!this.hud) return;
    this.hud.update({
      levelName: this.level.name,
      endless: Boolean(this.level.endless),
      baseHealth: this.gameState.baseHealth,
      maxBaseHealth: this.gameState.maxBaseHealth,
      coins: this.economy.coins,
      score: this.economy.score,
      waveNumber: Math.max(1, this.waveManager.waveNumber),
      totalWaves: this.waveManager.totalWaves,
      enemiesRemaining: this.activeEnemies.length + this.waveManager.pendingSpawns(),
      canStartWave: this.waveManager.canStartNextWave(),
      isSpawning: this.waveManager.state === 'spawning',
      isPaused: this.gameState.isPaused(),
    });
    this.badges?.sync(this.activeTowers, this.economy.coins);
  }

  bindKeyboardShortcuts() {
    this.input.keyboard.on('keydown', (event) => {
      // Hotkeys come from the tower data, so adding a defence to the dock
      // automatically gives it a working number key.
      const buildKey = BUILD_OPTIONS.find((key) => getBuildDefinition(key)?.hotkey === event.key);
      if (buildKey) this.hud?.toggleBuildSelection(buildKey);
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
    // Phaser's RequestAnimationFrame#step() schedules the NEXT frame *after*
    // invoking the game step, so any uncaught exception in here means no next
    // frame is ever requested and the whole game freezes permanently. Keep the
    // loop alive and make the fault loud instead of fatal.
    try {
      // Camera and badges keep working even while the simulation is paused, so
      // the player can inspect the battlefield before starting a wave.
      this.cameraRig?.update(rawDelta);
      this.badges?.update(this.cameras.main);

      if (this.gameState.isPaused() || this.gameState.isOver()) return;

      this.stepSimulation(rawDelta);
    } catch (error) {
      this.reportRuntimeError(error);
    }
  }

  /** One simulation tick: waves, enemies, towers, projectiles, boss HUD. */
  stepSimulation(rawDelta) {
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

  /**
   * Log a simulation fault once per unique message and tell the player, instead
   * of letting it kill the game loop. Mirrors the error into the console with a
   * full stack so it stays debuggable.
   */
  reportRuntimeError(error) {
    if (!this.reportedErrors) this.reportedErrors = new Set();
    const key = error?.message || String(error);
    if (this.reportedErrors.has(key)) return;
    this.reportedErrors.add(key);
    console.error('[GameScene] simulation error (game loop kept alive):', error);
    this.hud?.showToast?.('⚠️ Recovered from a script error — check the console', 'error');
  }
}
