import { TILE_SIZE, STARTING_COINS, STARTING_BASE_HEALTH, SCORE, WAVE_CLEAR_COINS, MAX_FRAME_DELTA } from '../config/gameConfig.js';
import { parseMap, getMapLayout, getMapBiomes, TILE } from '../data/mapData.js';
import { getLevel, THEMES, makeEndlessWave } from '../data/levelData.js';
import { getPuzzle, puzzleLevel } from '../data/puzzles.js';
import {
  ENEMY_TYPES,
  endlessHealthScale,
  endlessBossHealthScale,
  endlessSpeedScale,
  endlessRewardScale,
} from '../data/enemyData.js';
import { getPvpLevel } from '../data/pvpArenas.js';
import {
  createRunMods,
  applyCard,
  applyAnomaly,
  clearAnomaly,
  ascend,
  hordeScaling,
  summariseMods,
} from '../systems/RunMods.js';
import { drawCards } from '../data/draftCards.js';
import { rollAnomaly } from '../data/anomalies.js';
import { getBuildDefinition } from '../data/towerData.js';
import { PathfindingSystem, laneIndexForWave } from '../systems/PathfindingSystem.js';
import { paintLaneHint, laneLabel, LANE_ARROW_DEPTH } from '../systems/LaneArrows.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { GameStateManager, STATUS } from '../systems/GameStateManager.js';
import { WaveManager, WAVE_STATE, earlyCallBonus } from '../systems/WaveManager.js';
import {
  comboBonus,
  createComboState,
  registerKill,
  resetCombo,
  startNewWave,
  tickCombo,
  waveComboPayout,
} from '../systems/ComboMeter.js';
import { PlacementSystem, PLACEMENT_ERRORS } from '../systems/PlacementSystem.js';
import { Vfx } from '../systems/Vfx.js';
import { PowerupState, POWERUPS, METEOR } from '../systems/Powerups.js';
import { Leaderboard } from '../systems/Leaderboard.js';
import { Enemy } from '../entities/Enemy.js';
import { Tower } from '../entities/Tower.js';
import { resolveSiegeSwing } from '../systems/BarricadeCombat.js';
import { BUILD_OPTIONS } from '../data/towerData.js';
import { compactInPlace } from '../utils/arrayUtils.js';
import { BossTracker } from '../systems/BossTracker.js';
import { enemyAt, focusReadout, isFocusable } from '../systems/FocusTarget.js';
import { audio } from '../rendering/AudioSynth.js';
import { audioDirector } from '../rendering/audioDirector.js';
import { createBattleFxAnims, hasBattleFxArt, queueBattleFxArt } from '../systems/BattleArt.js';
import { createEnemyAnims, enemyTexturesForLevel, queueEnemySheets } from '../systems/EnemyAssets.js';
import { applyDailyModifiers } from '../systems/DailyChallenge.js';
import { milestonesBetween, milestoneLabel } from '../systems/EndlessMilestones.js';
import { relicBonuses } from '../systems/Relics.js';
import { contractProgress, contractScore, contractsFor } from '../systems/DuelContracts.js';
import { telemetryPlan } from '../systems/DuelTelemetry.js';
import {
  advanceDuelPacing,
  breathe,
  closePacing,
  createDuelPacing,
  manualStartAllowed,
  pacingHint,
  pacingLabel,
  pacingSeconds,
} from '../systems/DuelPacing.js';
import { blessingBonuses, canBuyBlessing, getBlessing } from '../systems/Blessings.js';
import { CameraRig } from '../camera/CameraRig.js';
import { UpgradeBadges } from '../ui/UpgradeBadge.js';
import { ProgressStore } from '../systems/Progression.js';
import { waveAccent } from '../systems/EnemySkins.js';

/** Ground tile variants per biome (grass, grass_2, grass_3). */
const GROUND_VARIANT_KEYS = ['tile-grass', 'tile-grass_2', 'tile-grass_3'];
/** Scatter props drawn on empty grass. */
const DECOR_KINDS = ['tuft', 'bloom', 'shard'];

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
    // The previous draft hand, so the next offer can steer away from it.
    this.lastOffer = [];
    // A duel is a separate contract: the arena supplies the map, the horde and
    // the economy, and everything the player owns in the campaign is ignored.
    this.pvp = data?.pvp || null;
    if (this.pvp) {
      this.level = getPvpLevel(this.pvp.arenaId);
      this.levelId = this.level.id;
      this.dailyKey = null;
      this.dailyModifier = null;
      this.theme = THEMES[this.level.theme] || THEMES.grassland;
      this.progress = window.gameProgress || new ProgressStore();
      this.lastMilestoneWave = 0;
      // The arena is the equaliser: no relics, no blessings, no powerups, no
      // meta lead of any kind. Only the towers both players can build count.
      this.relicBonuses = relicBonuses({});
      this.blessingsBought = {};
      this.blessingBonuses = blessingBonuses({});
      this.contracts = contractsFor(this.pvp.seed ?? 1);
      // A co-op room runs the same arena twice; every solo mode is off.
      this.mode = { coop: Boolean(this.pvp.coop) };
      this.runSeed = Number(this.pvp.seed) || 1;
      return;
    }
    this.levelId = data?.levelId || 'level-1';
    // Blueprint puzzles are levels too, but they are authored as a separate
    // catalogue (`puzzle-<id>`) so the campaign map never lists them.
    const puzzleId = this.levelId.startsWith('puzzle-') ? this.levelId.slice('puzzle-'.length) : null;
    const puzzle = puzzleId ? getPuzzle(puzzleId) : null;
    const baseLevel = puzzle ? puzzleLevel(puzzle) : getLevel(this.levelId);
    this.levelId = baseLevel.id;
    // A daily run is the same level with a rule twist layered on top. The
    // modifier is applied to a copy, so the campaign data stays untouched.
    this.dailyKey = data?.dailyKey || null;
    this.dailyModifier = data?.dailyModifier || null;
    this.level = this.dailyModifier
      ? applyDailyModifiers(baseLevel, this.dailyModifier, this.dailyKey)
      : baseLevel;
    // getLevel() falls back to level 1 for an unknown id; adopt the resolved id
    // so a later restart / replay cannot carry the stale one forward.
    this.theme = THEMES[this.level.theme] || THEMES.grassland;
    this.progress = window.gameProgress || new ProgressStore();
    this.lastMilestoneWave = 0;
    // Permanent relics + this run's blessings fold into one bonus set, read by
    // the economy, the core HP and every tower's damage/cooldown.
    this.relicBonuses = relicBonuses(this.progress?.profile?.relics || {});
    this.blessingsBought = {};
    this.blessingBonuses = blessingBonuses({});
    // Modes are flags on the same scene, never a second scene: Rogue Siege is
    // Endless plus a card pick, Anomaly is Endless plus a per-wave rule. A
    // puzzle arrives as its own level object, so it needs no flag at all.
    this.mode = {
      rogue: Boolean(data?.rogue),
      anomaly: Boolean(data?.anomaly),
      ascension: Boolean(data?.ascension),
      contracts: Boolean(data?.contracts),
      puzzle: Boolean(this.level.puzzle),
      timeAttack: Boolean(this.level.timeLimitMs),
      coop: false,
    };
    this.runSeed =
      Math.floor(Number(data?.seed)) ||
      (Math.floor(Date.now() / 1000) % 2_147_483_647) ||
      1;
  }

  /** Fold an event into the lifetime stats (no-op without a progress store). */
  trackStats(patch, options) {
    // A duel is a private match: it must not farm campaign stats, medals or the
    // endless record, or two friends could boost each other's profile.
    if (this.level?.pvp) return;
    this.progress?.trackStats?.(patch, options);
  }

  /** Pay out any achievements the stats just satisfied, with a toast each. */
  syncAchievements() {
    if (this.level?.pvp) return [];
    const result = this.progress?.syncAchievements?.();
    if (!result?.unlocked?.length) return [];
    for (const def of result.unlocked) {
      this.hud?.showToast(`${def.icon || '🏅'} ACHIEVEMENT: ${def.name} · +${def.gems}💎`, 'success');
    }
    return result.unlocked;
  }

  /**
   * Enemy sheets for *this* battle only.
   *
   * BootScene used to load all 210 strips for every player, which is 184 MP of
   * decoded texture before a single wave spawns. The level knows exactly which
   * creatures it fields, so the download and the GPU upload happen here, behind
   * a real progress bar, and never twice for the same texture.
   */
  preload() {
    const keys = enemyTexturesForLevel(this.level);
    const needsEnemies = keys.some((key) => !this.textures.exists(key));
    const needsFx = !hasBattleFxArt(this.textures);
    if (!needsEnemies && !needsFx) return;

    const overlay = document.getElementById('battle-loading');
    const fill = document.getElementById('battle-loading-fill');
    const label = document.getElementById('battle-loading-label');
    if (overlay) overlay.classList.remove('hidden');
    if (label) {
      label.textContent = (
        needsEnemies ? `MUSTERING ${this.level?.name || 'THE HORDE'}` : 'PREPARING THE FIELD'
      ).toUpperCase();
    }
    if (fill) fill.style.width = '0%';
    this.load.on('progress', (value) => {
      if (fill) fill.style.width = `${Math.round(value * 100)}%`;
    });
    const done = () => overlay?.classList.add('hidden');
    this.load.once('complete', done);
    this.events.once('shutdown', done);

    if (needsEnemies) queueEnemySheets(this.load, this.textures, this.level);
    if (needsFx) queueBattleFxArt(this.load);
  }

  create() {
    const { width, height } = this.scale;

    // Auto graphics profile, measured rather than assumed: if the battle cannot
    // hold ~45 fps after four seconds, give up atmosphere once (never back).
    this.time.delayedCall(4000, () => {
      const quality = window.gameQuality;
      if (!quality || quality.setting !== 'auto') return;
      const fps = this.game?.loop?.actualFps;
      if (!Number.isFinite(fps) || fps >= 45) return;
      if (quality.degrade()) audioDirector.sync?.();
    });

    // Clips for the strips this battle loaded. Idempotent: a texture that was
    // already on the TextureManager from an earlier battle keeps its clips.
    createEnemyAnims(this, enemyTexturesForLevel(this.level));
    createBattleFxAnims(this);

    // 1. Initialize Systems & Managers — all scoped to the selected level.
    this.map = parseMap(this.level.mapLayout || getMapLayout(this.level.map));
    this.pathfinding = new PathfindingSystem(this.map);
    this.pathfinding.computeMainPath();
    // The horde does not walk one file: every battlefield is asked for up to
    // three loopless routes (Yen's k-shortest over the same road graph) and the
    // spawner deals enemies out across them — see `spawnEnemy`. A single wall
    // of palisades can no longer choke a whole wave.
    this.pathfinding.computeLanes();
    // Hash set of *every* cell the horde can march (row,col), so palisades and
    // build validation cover the side lanes too — see PlacementSystem.validate.
    this.routeCells = this.pathfinding.laneCells.size
      ? this.pathfinding.laneCells
      : new Set(this.pathfinding.mainPath);
    // Which lane the coming wave walks. One lane per wave, rotating — see
    // `laneIndexForWave` — so the whole horde files down the same road and the
    // next wave chooses another one.
    this.waveLaneIndex = 0;
    this.laneHintDrawn = false;
    this.duelReported = false;
    // Run-long rules (draft cards, anomalies, ascension). Neutral here, so the
    // campaign and the duel behave exactly as they did before modes existed.
    this.cardMods = createRunMods();
    this.runMods = this.cardMods;
    // While a card pick or an ascension prompt is open the simulation stops —
    // the same freeze a pause gets, without the pause overlay.
    this.modePaused = false;
    this.activeAnomaly = null;
    // A duel's contracts are dealt from the room seed (both seats get the same
    // three); a solo Contract Board deals its own from the run seed.
    this.contracts = this.mode?.contracts
      ? contractsFor(this.runSeed)
      : this.pvp
        ? contractsFor(this.pvp.seed ?? 1)
        : null;
    this.contractsBanked = 0;
    this.paidContracts = new Set();
    this.bountiesCleared = 0;
    this.cleanWaves = 0;
    this.lastAnomalyId = null;
    this.timeLeftMs = Number(this.level.timeLimitMs) || 0;
    this.twinBossSpawned = false;
    // Set the moment a mode run hands its result to the screen, so the two
    // doors into `finishModeRun` (victory and defeat) can never both fire.
    this.modeFinished = false;
    this.modeId = this.runModeLabel();

    // Relics are the meta-progression: a little more gold, a little more core.
    this.economy = new EconomyManager(this.level.startingCoins + this.relicBonuses.startingGold);
    this.gameState = new GameStateManager(this.level.baseHealth + this.relicBonuses.baseHealth);
    this.placement = new PlacementSystem(this.map);
    this.leaderboard = new Leaderboard();

    this.activeEnemies = [];
    this.activeTowers = [];
    this.activeProjectiles = [];

    this.combo = createComboState();
    this.waveManager = new WaveManager(this.level.endless ? [] : this.level.waves, {
      onSpawn: (type, waveNumber) => this.spawnEnemy(type, waveNumber),
      endless: Boolean(this.level.endless),
      waveFactory: (n) => makeEndlessWave(n),
    });

    // A duel runs on the arena's clock, not on a button: both seats get the
    // same 10 s to build and the same 5 s between waves, so neither board can
    // pull ahead of the other and the rival strip keeps comparing like with
    // like. Campaign and endless keep the manual start.
    this.duelPacing = this.level.pvp ? createDuelPacing() : null;

    // Speed & simulation controls
    this.simSpeed = 1;
    this.selectedBuildKey = null;
    this.selectedTower = null;
    this.hoverTile = { row: -1, col: -1 };
    this.isVisualizingBFS = false;
    // Focus fire: the creep every tower that can reach it must shoot first.
    // Survives `reset()` on purpose — a scene restart should not keep pointing
    // at an enemy that no longer exists, and `update()` prunes it.
    this.focusTarget = null;
    this.focusGraphics = this.add.graphics().setDepth(30);

    // 2. Render Environment Graphics
    this.renderBattlefieldMap();
    // Entrance hint: a beacon on the gate plus a few chevrons down the mouth of
    // *this wave's* lane, above the tiles (3) and under the portals and units
    // (10). One lane takes the whole wave, so the player needs to know which
    // gate mouth the push is coming out of — not a trail painted across the map.
    this.laneHintGraphics = this.add.graphics().setDepth(LANE_ARROW_DEPTH);
    this.drawLaneHint();
    this.tweens?.add?.({
      targets: this.laneHintGraphics,
      alpha: { from: 1, to: 0.45 },
      duration: 820,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.createParticleSystems();
    // Effects library: elemental impacts, muzzle flashes, novas and the
    // max-tier aura. Created after the particle systems so `spark` fallbacks
    // still exist if the Kenney atlases failed to load.
    this.vfx = new Vfx(this);
    // Three hand-played powerups (meteor / overcharge / fortify). State is pure
    // data; the HUD renders it and this scene executes the effects. A duel has
    // none: one seat's meteor would be a private advantage the rival cannot
    // match, which is exactly what a mirrored arena exists to prevent.
    this.powerups =
      this.level.rules?.powerups === false ? null : new PowerupState(this.time?.now || 0);
    this.pendingMeteor = false;
    this.createPortalAndBase();

    // Visual overlay graphics
    this.ghostGraphics = this.add.graphics().setDepth(30);
    this.bfsVisualizerGraphics = this.add.graphics().setDepth(8);

    // Endless can field a titan next to the anchor boss (cycle 3) and both
    // titans at once (cycle 8), so the panel tracks a roster and shows the
    // deadliest live boss instead of whichever one spawned last.
    this.bossRoster = new BossTracker();
    this.activeBoss = null;

    // 2b. Camera rig — drag to pan, wheel/pinch to zoom. Pointer → world
    // coordinates now always go through the rig (see handlePointerMove/Up).
    this.lastPointerScreen = null;
    // Camera bounds are the *map* in world pixels, not the canvas. A campaign
    // map happens to be canvas-sized, so nothing changes there; a duel arena is
    // bigger, and the rig can then pan and pull back to the rival half.
    this.cameraRig = new CameraRig(this, {
      bounds: { x: 0, y: 0, width: this.map.cols * TILE_SIZE, height: this.map.rows * TILE_SIZE },
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
      // A duel has no powerups and no blessings; the campaign gets them back
      // on its next create(), so this is a per-battle switch, not a mode flag.
      this.hud.setDuelRules?.(Boolean(this.level.pvp));
      this.hud.callbacks = {
        onStartWave: () => this.handleStartWave(),
        onCallWaveEarly: () => this.handleCallWaveEarly(),
        onOpenBlessings: () => window.gameBlessings?.show?.(),
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
        onPowerup: (key) => this.handlePowerup(key),
        onClearFocus: () => this.setFocusFire(null),
      };
      this.hud.setZoomState(this.cameraRig.zoomState());
      this.hud.showCameraHintOnce();
      if (this.level.pvp) {
        // Two facts a duel player must know before the first wave: this is a
        // mirror, and the arena is bigger than a campaign map (so: pull back).
        this.hud.setMatchLabel('DUEL · FORGE DEFENCES');
        this.hud.showToast(
          `${this.level.name.replace(' · DUEL', '').toUpperCase()} · IDENTICAL HORDE · FIRST CORE DOWN LOSES · PULL BACK TO WATCH YOUR RIVAL`,
          'info'
        );
        // The contracts are shared, so say so on the one screen where the
        // player is still reading rather than fighting.
        if (this.contracts?.length) {
          this.hud.showToast(
            `CONTRACTS · ${this.contracts.map((contract) => contract.name).join(' · ')} — pause to check progress`,
            'info'
          );
        }
      }
      // Solo mode chrome: contracts, the run's rule chips and the timer.
      if (!this.level.pvp && (this.contracts?.length || this.mode?.timeAttack)) {
        if (this.contracts?.length) {
          this.hud.showToast(
            `CONTRACTS · ${this.contracts.map((contract) => contract.name).join(' · ')} — pause to check progress`,
            'info'
          );
        }
        this.hud.setMatchLabel(
          this.mode?.timeAttack ? 'TIME ATTACK · 3:00' : 'CONTRACT BOARD · 3 BETS'
        );
      }
      this.syncHUD();
    }

    // 3b. Blueprint Mode: the board arrives with towers already standing.
    this.placePreplacedTowers();
    this.syncContracts();
    // Paint the run's rule chips (draft stack, anomaly) before the first wave,
    // so a card taken in an earlier run can never linger in the HUD.
    this.refreshRunMods();

    // 4. Input Events — the rig is installed first, so it can tell the scene
    // whether a pointerup was a tap or the end of a pan/pinch.
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
    this.bindKeyboardShortcuts();

    this.events.once('shutdown', () => {
      this.hud?.hideFocus?.();
      this.cameraRig?.destroy();
      this.badges?.clear();
      this.vfx?.destroy();
    });
  }

  createParticleSystems() {
    if (!this.textures.exists('spark')) return;
    this.particleEmitter = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 90 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 380,
      emitting: false,
    });
    this.particleEmitter.setDepth(45);

    // Dedicated spawn puff: slower, drifting outward from the portal and tinted
    // to the wave's brood colour by setBroodColour()/spawnEnemy().
    this.spawnEmitter = this.add.particles(0, 0, 'spark', {
      speed: { min: 20, max: 70 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 620,
      emitting: false,
    });
    this.spawnEmitter.setDepth(46);
  }

  /**
   * Theme-aware texture key with a graceful fallback to the base art.
   *
   * `themeId` overrides the level theme for one cell, which is how the endless
   * battlefield paints four biomes on one map: the renderer asks for the same
   * `tile-road-13` key under the ice, desert, volcanic or crystal suffix.
   */
  tileTexture(base, themeId = null) {
    const theme = (themeId && THEMES[themeId]) || this.theme;
    const themed = `${base}${theme?.tileSuffix || ''}`;
    if (this.textures.exists(themed)) return themed;
    return this.textures.exists(base) ? base : null;
  }

  /**
   * Paint the battlefield.
   *
   * Every cell is dressed from the biome's own generated set: one of three
   * seamless ground variants (chosen by a stable hash, so a cell never changes
   * look between visits), a lane texture picked from the 4-bit neighbour mask,
   * a shoreline mask for lakes, two boulder variants and scattered decor. The
   * hash-driven approach is what removes the "one grass tile repeated 240
   * times" grid the old renderer produced.
   */
  renderBattlefieldMap() {
    const tilesGraphics = this.add.graphics().setDepth(3);
    // Biome overlay: null on the campaign maps (they are one biome each), a
    // 2D theme-id grid on the endless battlefield. Cache the per-theme texture
    // key lists once — a 504-cell map must not re-resolve them per cell.
    this.biomeGrid = getMapBiomes(this.level.map);
    const themedCache = new Map();
    const themed = (base, themeId) => {
      const key = `${themeId || ''}|${base}`;
      if (!themedCache.has(key)) themedCache.set(key, this.tileTexture(base, themeId));
      return themedCache.get(key);
    };
    const themeOf = (r, c) => this.biomeGrid?.[r]?.[c] || null;
    const groundFor = (themeId) =>
      GROUND_VARIANT_KEYS.map((key) => themed(key, themeId)).filter(Boolean);

    const at = (r, c) => (r >= 0 && r < this.map.rows && c >= 0 && c < this.map.cols ? this.map.tiles[r][c] : -1);
    const isLane = (r, c) => {
      const t = at(r, c);
      return t === TILE.ROAD || t === TILE.SPAWN || t === TILE.BASE;
    };
    const isWater = (r, c) => at(r, c) === TILE.WATER;
    // A lane square with water on both sides of it is a bridge: paint the river
    // under the road so a crossing reads as construction, not as a puddle.
    const isBridge = (r, c) =>
      isLane(r, c) &&
      ((isWater(r, c - 1) && isWater(r, c + 1)) || (isWater(r - 1, c) && isWater(r + 1, c)));
    const maskAt = (predicate, r, c) =>
      (predicate(r - 1, c) ? 1 : 0) |
      (predicate(r, c + 1) ? 2 : 0) |
      (predicate(r + 1, c) ? 4 : 0) |
      (predicate(r, c - 1) ? 8 : 0);

    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const type = this.map.tiles[r][c];
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;
        const hash = (r * 73856093) ^ (c * 19349663);

        const themeId = themeOf(r, c);
        const groundKeys = groundFor(themeId);
        const rockKeys = [themed('tile-rock', themeId), themed('tile-rock-2', themeId)].filter(Boolean);
        const decorKeys = DECOR_KINDS.map((kind) => themed(`tile-decor-${kind}`, themeId)).filter(
          Boolean
        );
        const foliageKey = themed('tile-foliage', themeId);

        // 1. Ground: one of three variants per biome.
        if (groundKeys.length) {
          const key = groundKeys[Math.abs(hash) % groundKeys.length];
          this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
        } else {
          tilesGraphics.fillStyle((r + c) % 2 === 0 ? 0x1c3a33 : 0x1f4038);
          tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }

        // 2. Surface: lane, water, boulder — each with its own autotile mask.
        if (isLane(r, c)) {
          // The road is built, not grown: one paving material for the whole
          // battlefield, laid over whatever the ground happens to be. That is
          // also what keeps the lane legible across four biomes — a crystal
          // causeway turning lavender mid-run read as a rendering bug.
          const mask = maskAt(isLane, r, c);
          const key = themed(`tile-road-${mask}`, null) || themed('tile-road-15', null) || 'tile-road-15';
          if (isBridge(r, c)) {
            // A bridge: the river keeps flowing underneath, and the road is
            // drawn as a narrower deck with timber rails so the crossing reads
            // as construction instead of a suspiciously dry patch of water.
            const underMask = maskAt(isWater, r, c);
            const under =
              themed(`tile-water-${underMask}`, themeId) || themed('tile-water', themeId);
            if (under) {
              this.add.image(cx, cy, under).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
            }
            const horizontal = isWater(r, c - 1) && isWater(r, c + 1);
            const deck = this.add.image(cx, cy, key).setDepth(1);
            if (horizontal) deck.setDisplaySize(TILE_SIZE, TILE_SIZE * 0.6);
            else deck.setDisplaySize(TILE_SIZE * 0.6, TILE_SIZE).setAngle(90);
            tilesGraphics.lineStyle(2, 0x2a170c, 0.85);
            if (horizontal) {
              tilesGraphics.lineBetween(x, cy - TILE_SIZE * 0.3, x + TILE_SIZE, cy - TILE_SIZE * 0.3);
              tilesGraphics.lineBetween(x, cy + TILE_SIZE * 0.3, x + TILE_SIZE, cy + TILE_SIZE * 0.3);
            } else {
              tilesGraphics.lineBetween(cx - TILE_SIZE * 0.3, y, cx - TILE_SIZE * 0.3, y + TILE_SIZE);
              tilesGraphics.lineBetween(cx + TILE_SIZE * 0.3, y, cx + TILE_SIZE * 0.3, y + TILE_SIZE);
            }
            tilesGraphics.lineStyle(1, 0x0a0c12, 0.5);
            tilesGraphics.strokeRect(x + 1, cy - TILE_SIZE * 0.34, TILE_SIZE - 2, TILE_SIZE * 0.68);
          } else {
            this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
          }
        } else if (type === TILE.WATER) {
          const mask = maskAt(isWater, r, c);
          const key = themed(`tile-water-${mask}`, themeId) || themed('tile-water', themeId);
          if (key) {
            this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
          } else {
            tilesGraphics.fillStyle(0x133854, 1);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (type === TILE.ROCK) {
          if (rockKeys.length) {
            const key = rockKeys[(Math.abs(hash) >> 3) % rockKeys.length];
            this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(2);
          } else {
            tilesGraphics.fillStyle(0x15302a);
            tilesGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        }

        // 3b. Terrace lip: where this biome meets another one to the south, draw
        // a soft shadow across the seam. Four hard-edged biomes stacked on one
        // map read as a colour wheel; a shaded step reads as ground that falls
        // away, which is what the snowfield giving way to the dunes should look
        // like without a dedicated transition-tile set.
        if (themeId && this.biomeGrid) {
          const south = themeOf(r + 1, c);
          const north = themeOf(r - 1, c);
          if (south && south !== themeId) {
            tilesGraphics.fillStyle(0x05070c, 0.26);
            tilesGraphics.fillRect(x, y + TILE_SIZE - 7, TILE_SIZE, 7);
            tilesGraphics.fillStyle(0xffffff, 0.05);
            tilesGraphics.fillRect(x, y + TILE_SIZE - 9, TILE_SIZE, 2);
          }
          if (north && north !== themeId) {
            tilesGraphics.fillStyle(0xffffff, 0.07);
            tilesGraphics.fillRect(x, y, TILE_SIZE, 3);
          }
        }

        if (type === TILE.GRASS && decorKeys.length) {
          // 3. Scatter: trees are rare landmarks, props fill the meadow.
          const roll = Math.abs(hash) % 100;
          if (roll < 7 && foliageKey) {
            const jx = ((hash >> 5) % 13) - 6;
            const jy = ((hash >> 9) % 11) - 5;
            this.add.image(cx + jx, cy + jy, foliageKey).setScale(0.94).setAlpha(0.97).setDepth(2);
          } else if (roll < 42) {
            const key = decorKeys[(Math.abs(hash) >> 7) % decorKeys.length];
            const jx = ((hash >> 11) % 41) - 20;
            const jy = ((hash >> 13) % 41) - 20;
            this.add
              .image(cx + jx, cy + jy, key)
              .setDisplaySize(TILE_SIZE * 0.72, TILE_SIZE * 0.72)
              .setAlpha(0.94)
              .setDepth(2)
              .setFlipX(Boolean(hash & 1));
          }
        }
      }
    }

    // Subtle tactical grid lines (kept so placement stays readable)
    tilesGraphics.lineStyle(1, 0x1b2838, 0.16);
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

  /**
   * Difficulty knobs for one spawn.
   *
   * Campaign maps are a fixed six-wave script, so the level's own scale is the
   * whole story. Endless is the one mode that keeps accelerating: health follows
   * `endlessHealthScale` (uncapped), speed `endlessSpeedScale` (capped so the
   * horde stays readable) and the bounty tracks the HP ramp, or the player could
   * never afford the towers the next wave demands.
   */
  spawnScaling(waveNumber, typeKey = null) {
    const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    const base = this.level.enemyHealthScale || 1;
    // Cards and anomalies raise the horde as well as the towers — that trade is
    // the whole point of Rogue Siege, so it is applied to both ramps.
    const horde = hordeScaling(this.runMods);
    if (!this.level.endless) {
      return { healthScale: base * horde.health, speedScale: horde.speed, rewardScale: 1 };
    }
    // Bosses take the gentler, capped ramp: a titan is already a wall of HP, and
    // the creep curve would turn it into a ninety-thousand-HP timer.
    const isBoss = Boolean(ENEMY_TYPES[typeKey]?.isBoss);
    const health = isBoss ? endlessBossHealthScale(wave) : endlessHealthScale(wave);
    return {
      healthScale: base * health * horde.health,
      speedScale: endlessSpeedScale(wave) * horde.speed,
      rewardScale: endlessRewardScale(wave),
    };
  }

  /**
   * Which lane a wave walks.
   *
   * The horde files down **one** road per wave and the next wave takes the next
   * one: wave 1 lane 1, wave 2 lane 2, wave 3 lane 3, wave 4 lane 1 again. A
   * scatter inside a single wave spread every creep thin and made the map feel
   * like three quiet streets; a whole wave on one road is a push the player can
   * recognise and answer, and the rotation still forces every lane to be
   * defended by the end of the run.
   */
  laneIndexForWave(waveNumber) {
    return laneIndexForWave(waveNumber, this.pathfinding?.laneCount || 0);
  }

  spawnEnemy(typeKey, waveNumber) {
    // Every spawn of a wave — including a boss and the minions it summons —
    // joins the same lane, and the choice is the wave ordinal, never random, so
    // both duel seats send the same horde down the same road.
    const lane = this.pathfinding.laneAt(this.laneIndexForWave(waveNumber));

    // TWIN TITANS: one extra titan trails the boss by three seconds, once per
    // wave. Spawned through the same path so the escort, the boss panel and the
    // lane all come along for free.
    const isBoss = Boolean(ENEMY_TYPES[typeKey]?.isBoss);
    if (isBoss && this.runMods.twinBoss && !this.twinBossSpawned) {
      this.twinBossSpawned = true;
      this.time?.delayedCall?.(3000, () => {
        if (this.gameState?.isOver?.()) return;
        this.spawnEnemy(typeKey, waveNumber);
      });
    }

    const enemy = new Enemy(this, typeKey, waveNumber, lane, {
      onReachedBase: (e) => this.handleEnemyReachedBase(e),
      onDefeated: (e) => this.handleEnemyDefeated(e),
      onBossSpawn: (e) => {
        // `add` answers with the boss that owns the strip, which is not
        // necessarily the newcomer: an anchor arriving behind a titan must not
        // yank the panel (or reset its phase badge) away from the titan.
        this.activeBoss = this.bossRoster.add(e);
        this.syncBossPanel();
        audio.playWarning();
        this.hud?.showToast(`⚠️ BOSS APPROACHING: ${e.def.name}!`, 'warning');
        this.bossEntranceCinematic();
        this.shockwave(e.x, e.y, { from: 0.35, to: 2.2, tint: 0xff9d6b, duration: 620 });
      },
      onBossPhaseChange: (e, phase) => {
        // A phase change on an untracked boss must not overwrite the name of the
        // one the strip is showing.
        if (e === this.activeBoss) {
          this.hud?.updateBossPhase(e, phase);
          this.hud?.updateBossBar(e);
        }
        this.cameras.main.shake(300, 0.012);
        audio.playWarning();
        this.hud?.showToast(`⚡ ${e.def.name} Phase Shift: ${phase.name}!`, 'warning');
      },
      onBossDefeated: (e) => {
        // The roster hands the strip to the next live boss; hiding it outright
        // would drop the HP bar of an anchor still walking behind the titan.
        this.activeBoss = this.bossRoster.remove(e);
        this.syncBossPanel();
        audio.playVictory();
        this.hud?.showToast(`🏆 BOSS DEFEATED: ${e.def.name}!`, 'success');
        this.shockwave(e.x, e.y, { from: 0.5, to: 3.0, tint: 0xffe2a8, duration: 700 });
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
    }, { ...this.spawnScaling(waveNumber, typeKey), theme: this.theme?.id || this.level.theme });
    this.activeEnemies.push(enemy);
    this.gameState.counters.enemiesSpawned++;

    // A coloured puff at the gate: the brood's accent, so the wave's breed is
    // readable the instant it steps out of the portal.
    const emitter = this.spawnEmitter || this.particleEmitter;
    if (emitter && this.spawnAccent !== undefined) {
      try {
        if (typeof emitter.setParticleTint === 'function') emitter.setParticleTint(this.spawnAccent);
        emitter.explode(enemy.isBoss ? 26 : 5, enemy.x, enemy.y);
      } catch (error) {
        this.reportRuntimeError(error);
      }
    }
  }

  /**
   * Boss entrance: a short letterbox + camera punch.
   *
   * The boss banner alone could be missed mid-fight, so the frame itself reacts
   * — the bars close in, the camera kicks, and the HUD bar stays untouched.
   */
  bossEntranceCinematic() {
    if (!this.add?.rectangle || !this.cameras?.main) return;
    try {
      const cam = this.cameras.main;
      const { width, height } = cam;
      const barHeight = Math.max(24, height * 0.07);
      const bars = [0, 1].map((index) =>
        this.add
          .rectangle(index === 0 ? width / 2 : width / 2, index === 0 ? 0 : height, width, 0, 0x000000, 0.82)
          .setScrollFactor(0)
          .setDepth(58)
          .setOrigin(0.5, index === 0 ? 0 : 1)
      );
      const [topBar, bottomBar] = bars;
      this.tweens.add({
        targets: [topBar, bottomBar],
        height: barHeight,
        duration: 220,
        ease: 'Cubic.easeOut',
        hold: 760,
        yoyo: true,
        onComplete: () => bars.forEach((bar) => bar.destroy()),
      });
      cam.shake(420, 0.011);
      cam.flash(260, 255, 138, 60, false);
      // Screen centre -> world centre: the ring is a world-space image, so a
      // panned camera would otherwise pop it in the top-left quadrant.
      const mid = cam.midPoint || { x: cam.scrollX + width / 2, y: cam.scrollY + height / 2 };
      this.shockwave(mid.x, mid.y, { from: 0.6, to: 2.4, duration: 640, depth: 59 });
    } catch (error) {
      this.reportRuntimeError(error);
    }
  }

  /**
   * One-shot expanding shockwave drawn from the ui-kit ring art.
   *
   * The ring has a soft falloff, so a boss entrance or a tier-3 kill reads at a
   * glance without the hard vector outline a stroked circle leaves behind.
   * Guarded on the texture: if the kit is missing (or a test stubs `add`),
   * this quietly does nothing instead of breaking the fight.
   */
  shockwave(x, y, { from = 0.3, to = 1.6, tint = 0xffd8a0, alpha = 0.9, duration = 520, depth = 24 } = {}) {
    if (!this.textures?.exists?.('fx-ring') || !this.add?.image) return null;
    try {
      const ring = this.add
        .image(x, y, 'fx-ring')
        .setDepth(depth)
        .setAlpha(alpha)
        .setScale(from)
        .setBlendMode('ADD');
      if (typeof ring.setTint === 'function') ring.setTint(tint);
      this.tweens.add({
        targets: ring,
        scale: to,
        alpha: 0,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
      return ring;
    } catch (error) {
      this.reportRuntimeError(error);
      return null;
    }
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
    // A leak breaks the chain: the combo is a reward for clean clearing.
    if (this.combo.chain > 0) {
      resetCombo(this.combo);
      this.hud?.hideCombo();
    }
    const destroyed = this.gameState.damageBase(enemy.baseDamage);
    this.gameState.counters.enemiesEscaped++;
    this.leaksThisWave = (this.leaksThisWave || 0) + 1;

    if (enemy.isBoss) {
      this.activeBoss = this.bossRoster.remove(enemy);
      this.syncBossPanel();
    }

    if (destroyed) {
      this.handleGameOver();
    }
    this.syncHUD();
  }

  handleEnemyDefeated(enemy) {
    // Kill chain: each kill inside the window raises the payout multiplier.
    const kill = registerKill(this.combo, this.time?.now || 0);
    // Kill bounty first, then the relic / blessing gold multipliers, then the
    // chain bonus — so the chain always multiplies the number the player saw.
    // A bounty wave pays double gold per kill, which is the whole point of it:
    // the seat that can burst down a caravan buys its next tower first.
    const wave = this.waveManager.currentWave;
    const killGold = wave?.bounty ? Number(wave.bountyKillGold) || 2 : 1;
    const bounty = Math.round(
      enemy.reward * killGold * this.relicBonuses.killGold * this.blessingBonuses.killGold * this.runMods.killGold
    );
    const comboGold = comboBonus(bounty, kill.multiplier);
    const comboScore = comboBonus(enemy.score, kill.multiplier);

    audio.playCoin();
    if (kill.tier > 0) audio.playCombo(kill.tier);
    this.economy.earn(bounty + comboGold + this.rewardKillAuraBonus(enemy));
    this.addScore(enemy.score + comboScore);
    this.gameState.counters.enemiesDefeated++;
    if (this.contracts?.length) this.syncContracts();

    this.trackStats({ kills: 1, goldEarned: bounty + comboGold, bestChain: kill.chain }, { max: ['bestChain'] });
    if (enemy.isBoss) this.trackStats({ bossesKilled: 1 });

    this.spawnDeathBurst(enemy.x, enemy.y, kill.tier);
    if (kill.tier > 0) {
      this.hud?.showCombo({ chain: kill.chain, multiplier: kill.multiplier, tier: kill.tier, bonus: comboGold });
    }

    if (enemy.isBoss) {
      this.activeBoss = this.bossRoster.remove(enemy);
      this.syncBossPanel();
    }

    this.syncHUD();
  }

  /**
   * Point the boss strip at the deadliest live boss.
   *
   * Called whenever the roster changes. Re-showing the bar re-reads the name and
   * phase from the new boss, so the panel can never show one boss's health under
   * another boss's name — the failure mode of the old single-slot tracking.
   */
  syncBossPanel() {
    const boss = this.activeBoss;
    if (!boss) {
      this.hud?.hideBossBar();
      return;
    }
    const phase =
      boss.bossPhases?.[boss.currentPhaseIndex] || boss.bossPhases?.[0] || { phase: 1, name: 'Engaged' };
    this.hud?.showBossBar(boss, this.bossRoster?.extras ?? 0);
    this.hud?.updateBossPhase(boss, phase);
  }

  handleStartWave() {
    // A duel opens its waves itself. A manual start on one phone would let its
    // board run ahead of the rival's, and the two strips would stop being
    // comparable — which is the whole point of a mirrored arena.
    if (!manualStartAllowed(this.duelPacing)) return;
    this.openWave();
  }

  /** The arena opening a duel wave, with the same fanfare as a manual start. */
  tickDuelPacing(deltaMs) {
    const open = advanceDuelPacing({
      pacing: this.duelPacing,
      waveManager: this.waveManager,
      gameState: this.gameState,
      deltaMs,
    });
    if (!open) return;
    this.openWave();
  }

  /** Start the next wave and dress it up. Shared by the player and the clock. */
  openWave() {
    if (!this.waveManager.canStartNextWave()) return;
    // The wave's rule is settled *before* the first creep walks: an anomaly you
    // only notice mid-fight is a bug, not a twist.
    this.beginWaveRules(this.waveManager.waveNumber + 1);
    this.autoWaveDelay = 0;
    audio.playWaveStart();
    const started = this.waveManager.startNextWave();
    if (started) {
      startNewWave(this.combo);
      const wave = this.waveManager.waveNumber;
      // The whole wave walks one lane, so say it out loud and move the beacon.
      this.setWaveLane(wave);
      // One toast, not two: `showToast` replaces the banner, so a second call
      // would bury the wave name under the lane hint.
      const rule = this.activeAnomaly ? ` · ${this.activeAnomaly.name}` : '';
      this.hud?.showToast(
        `Wave ${wave}: ${this.waveManager.currentWave.name} · ⚑ ${this.laneName()}${rule}`,
        'info'
      );
      const bounty = Boolean(this.waveManager.currentWave.bounty);
      this.setBroodColour(wave, bounty ? 0xffc94a : null);
      if (bounty) {
        this.hud?.showToast(
          `🪙 BOUNTY WAVE — double gold per kill, +${this.waveManager.currentWave.bountyGold} on clear`,
          'success'
        );
      }
      this.flashWaveBanner(wave, this.waveManager.currentWave.name);
    }
    this.syncHUD();
  }


  /* ==================================================== RUN RULES (MODES) */

  /**
   * The effective rule bag: the run's permanent picks (cards, ascension) plus
   * whatever the current wave's anomaly adds. Recomputing from `cardMods`
   * instead of mutating the bag means an anomaly can never leak into the next
   * wave — the classic way a temporary buff becomes permanent.
   */
  refreshRunMods() {
    this.runMods = this.activeAnomaly ? applyAnomaly(this.cardMods, this.activeAnomaly) : this.cardMods;
    this.refreshTowerAuras();
    this.hud?.setRunStatus?.(this.runStatus());
    return this.runMods;
  }

  /**
   * Which *mode* this run is, in one word, or null for plain campaign/endless.
   *
   * Every surface that has to behave differently for a mode run — the result
   * card, the HUD chrome, the save path — asks this instead of re-deriving the
   * answer from four nullable fields.
   */
  runModeLabel() {
    if (this.level?.puzzle) return 'puzzle';
    if (this.level?.mode) return this.level.mode;
    if (this.level?.id === 'titan-rush') return 'titan';
    if (this.mode?.rogue) return 'rogue';
    if (this.mode?.anomaly) return 'anomaly';
    if (this.mode?.ascension) return 'ascension';
    if (this.mode?.contracts) return 'contracts';
    if (this.mode?.coop) return 'coop';
    return null;
  }

  /** Everything the HUD needs to describe the run in one line. */
  runStatus() {
    return {
      mode: this.modeId || null,
      chips: summariseMods(this.runMods || this.cardMods).map((row) => row.label),
      // Name only: the HUD prints its own label, and an emoji icon from the
      // data table renders as a hollow box in Chromium.
      anomaly: this.activeAnomaly ? this.activeAnomaly.name : null,
      clockMs: this.mode?.timeAttack ? this.timeLeftMs : null,
    };
  }

  /**
   * Settle the rules for the wave that is about to open.
   *
   * Runs before the first spawn so the banner, the HUD chip and the horde all
   * agree; also resets the once-per-wave guards (twin titan).
   */
  beginWaveRules(waveNumber) {
    this.activeAnomaly = null;
    this.twinBossSpawned = false;
    if (this.mode?.anomaly) {
      const rolled = rollAnomaly(this.runSeed, waveNumber, this.lastAnomalyId);
      this.lastAnomalyId = rolled.id;
      this.activeAnomaly = rolled;
      const instant = rolled.effect?.instant || {};
      if (instant.gold) this.economy.earn(instant.gold);
      if (instant.hp) this.gameState.healBase(instant.hp);
      this.hud?.showToast(`${rolled.icon} ${rolled.name} — ${rolled.blurb}`, 'warning');
    }
    this.refreshRunMods();
    return this.activeAnomaly;
  }

  /** Wave cleared: pay the run's per-wave effects, then offer the next choice. */
  afterWaveCleared(event) {
    const heal = Number(this.runMods?.healPerWave) || 0;
    if (heal > 0) this.gameState.healBase(heal);
    this.activeAnomaly = null;
    this.refreshRunMods();
    this.syncContracts();
    if (this.mode?.rogue) this.openDraft(event.waveNumber);
    else if (this.mode?.ascension && event.waveNumber % 10 === 0) this.openAscend(event.waveNumber);
  }

  /** Rogue Siege: three cards, one pick, for the rest of the run. */
  openDraft(waveNumber) {
    const panel = window.gameDraft;
    if (!panel?.showCards) return;
    this.modePaused = true;
    const cards = drawCards(this.runSeed, waveNumber, this.cardMods.cards, undefined, this.lastOffer);
    this.lastOffer = cards.map((card) => card.id);
    Promise.resolve(
      panel.showCards({
        cards,
        wave: waveNumber,
        title: `WAVE ${waveNumber} CLEARED`,
        subtitle: 'Pick one card — it lasts the rest of this run.',
      })
    )
      .then((card) => {
        this.modePaused = false;
        if (card) this.applyDraftCard(card);
      })
      .catch((error) => {
        // A broken panel must never leave the board frozen behind it.
        this.modePaused = false;
        this.reportRuntimeError?.(error);
      });
  }

  applyDraftCard(card) {
    if (!card) return;
    this.cardMods = applyCard(this.cardMods, card);
    const instant = card.effect?.instant || {};
    if (instant.gold) this.economy.earn(instant.gold);
    if (instant.hp) this.gameState.healBase(instant.hp);
    this.refreshRunMods();
    audio.playPlace?.();
    this.hud?.showToast(`${card.icon} ${card.name} — ${card.blurb}`, 'success');
    this.syncHUD();
  }

  /** Ascension: every tenth wave, climb or cash out. */
  openAscend(waveNumber) {
    const panel = window.gameDraft;
    if (!panel?.showChoice) return;
    this.modePaused = true;
    Promise.resolve(
      panel.showChoice({
        title: `WAVE ${waveNumber} CLEARED`,
        subtitle: `Ascension ${this.cardMods.ascension} · the horde grows with every step.`,
        options: [
          {
            id: 'ascend',
            name: 'ASCEND',
            art: '/assets/ui-kit/glyph_crown.png',
            blurb: 'Horde +25% HP, every point ×1.5, +120 gold. Keep climbing.',
          },
          {
            id: 'cash',
            name: 'CASH OUT',
            art: '/assets/ui/icon_gem.png',
            blurb: 'End the run here and bank this score.',
          },
        ],
      })
    )
      .then((choice) => {
        this.modePaused = false;
        if (!choice || choice.id === 'cash') return this.finishModeRun('victory');
        this.cardMods = ascend(this.cardMods);
        this.economy.earn(120);
        this.refreshRunMods();
        audio.playWaveStart?.();
        this.hud?.showToast(`ASCENSION ${this.cardMods.ascension} — the horde grows`, 'success');
        return null;
      })
      .catch((error) => {
        this.modePaused = false;
        this.reportRuntimeError?.(error);
      });
  }

  /**
   * Time Attack: the clock is the only wave button.
   *
   * Burns the budget, paints it, opens the next wave every 2.5 s, and ends the
   * run at zero. `MAX_FRAME_DELTA` is applied by the caller, so a background
   * tab cannot eat the whole clock in one frame.
   */
  tickTimeAttack(delta) {
    this.timeLeftMs = Math.max(0, this.timeLeftMs - delta);
    this.hud?.setRunClock?.(this.timeLeftMs);
    if (this.timeLeftMs <= 0) {
      this.finishModeRun('victory');
      return;
    }
    if (!this.waveManager?.canStartNextWave?.()) return;
    this.autoWaveDelay = (this.autoWaveDelay || 0) + delta;
    if (this.autoWaveDelay >= 2500) this.openWave();
  }

  /**
   * End a mode run: score only, never campaign stars.
   *
   * `handleVictory` and `handleGameOver` route here *after* they have closed the
   * game state, so guarding on `isOver()` would throw away every mode result
   * card. The guard is on the hand-off (`modeFinished`) instead: whichever door
   * the run goes out of, it goes out exactly once.
   */
  finishModeRun(outcome) {
    if (this.modeFinished) return null;
    this.modeFinished = true;
    // A draft or ascension prompt still on screen would sit on top of the
    // result card and swallow its buttons.
    this.modePaused = false;
    window.gameDraft?.close?.();
    if (!this.gameState.isOver()) {
      this.gameState.end(outcome === 'victory' ? STATUS.VICTORY : STATUS.GAME_OVER);
    }
    this.hud?.hideBossBar();
    this.hud?.setRunClock?.(null);
    window.gameCodex?.hide?.();
    if (outcome === 'victory') audio.playVictory();
    const score = this.economy.score;
    const waves = this.waveManager?.wavesCompleted || 0;
    const record = this.progress?.recordEndless?.({ wave: waves, score }) || null;
    const gems = this.bankSoloContracts(true);
    this.showResult({
      outcome,
      mode: this.modeId,
      level: this.level,
      score,
      waves,
      totalWaves: this.level?.endless ? null : this.waveManager?.totalWaves,
      timeMs: this.gameState.elapsedMs,
      wave: this.waveManager?.waveNumber || 0,
      bestWave: this.progress?.profile?.endlessBestWave,
      newRecord: Boolean(record?.isRecord),
      contractGems: gems,
      stars: this.runStars(outcome),
      contracts: this.contracts?.length
        ? contractProgress(this.contracts, this.contractStats())
        : null,
    });
  }

  /**
   * The star rating of a finite mode run (a Blueprint, Titan Rush).
   *
   * Same rule the campaign uses — core integrity at the end — but the
   * thresholds come from the level's own `stars: { two, three }`, so a puzzle
   * can demand a flawless board while a boss gauntlet is gentler. Endless-mode
   * runs have no end and therefore no stars.
   */
  runStars(outcome) {
    if (outcome !== 'victory' || this.level?.endless || !this.level?.stars) return 0;
    const max = this.gameState.maxBaseHealth || 0;
    const ratio = max > 0 ? this.gameState.baseHealth / max : 0;
    const { two = 0.5, three = 0.85 } = this.level.stars;
    if (ratio >= three) return 3;
    if (ratio >= two) return 2;
    return 1;
  }

  /* ================================================== CONTRACT BOARD */

  /** The numbers the contract pool reads, in its own vocabulary. */
  contractStats() {
    return {
      kills: this.gameState?.counters?.enemiesDefeated || 0,
      waves: this.waveManager?.wavesCompleted || 0,
      bestChain: this.combo?.best || 0,
      bounties: this.bountiesCleared || 0,
      cleanWaves: this.cleanWaves || 0,
      coreHp: this.gameState?.baseHealth || 0,
    };
  }

  /**
   * Keep the contract panel honest and pay a bet the moment it lands.
   *
   * Paying on completion (instead of at the end) is what makes a solo contract
   * feel like a goal: the gold arrives when you need it, not after the run.
   */
  syncContracts() {
    if (!this.contracts?.length) return [];
    this.paidContracts = this.paidContracts || new Set();
    const rows = contractProgress(this.contracts, this.contractStats());
    for (const row of rows) {
      if (!row.done || this.paidContracts.has(row.id)) continue;
      this.paidContracts.add(row.id);
      this.economy.earn(row.reward);
      this.contractsBanked = (this.contractsBanked || 0) + row.reward;
      this.hud?.showToast(`📜 CONTRACT PAID · ${row.name} +🪙${row.reward}`, 'success');
      audio.playVictory?.();
    }
    this.hud?.setContracts?.(rows);
    return rows;
  }

  /** A clean sweep of all three bets pays gems; anything less pays nothing. */
  bankSoloContracts(finish = false) {
    if (!this.contracts?.length) return 0;
    const rows = this.syncContracts();
    if (!finish) return 0;
    const sweep = rows.length > 0 && rows.every((row) => row.done);
    if (!sweep) return 0;
    const gems = 2;
    this.progress?.addGems?.(gems);
    this.hud?.showToast(`🏅 CONTRACT SWEEP · +${gems}💎`, 'success');
    return gems;
  }

  /**
   * Blueprint Mode: stand the towers up before the first wave.
   *
   * These are free (they are the puzzle's given), so they bypass the economy
   * but still go through `PlacementSystem` — a pre-placed tower on a road cell
   * would be an invalid board and is skipped rather than trusted.
   */
  placePreplacedTowers() {
    const list = this.level?.preplaced || [];
    if (!list.length) return 0;
    let placed = 0;
    for (const entry of list) {
      const def = getBuildDefinition(entry.key);
      if (!def) continue;
      const check = this.placement.validate(def, entry.row, entry.col, Infinity, {
        route: this.routeCells,
      });
      if (!check.ok) continue;
      const tower = new Tower(this, entry.key, entry.row, entry.col, {
        economy: this.economy,
        gameState: this.gameState,
        activeEnemies: this.activeEnemies,
        activeProjectiles: this.activeProjectiles,
        powerups: this.powerups,
      });
      this.placement.occupy(entry.row, entry.col, tower);
      this.activeTowers.push(tower);
      placed += 1;
    }
    if (placed) this.refreshTowerAuras();
    return placed;
  }

  /**
   * Call the next wave while the current horde is still on the map.
   *
   * The current wave is settled immediately (its clear bonus is paid now) and
   * the leftovers overlap with the new wave. The gold bonus scales with how many
   * enemies are still alive, so the greedy call is also the risky one.
   */
  handleCallWaveEarly() {
    // The arena owns the tempo in a duel: no seat may skip the breather.
    if (!manualStartAllowed(this.duelPacing)) return null;
    const alive = this.activeEnemies.length;
    const result = this.waveManager.callEarly(alive);
    if (!result) return;

    const clearCoins = WAVE_CLEAR_COINS.base + WAVE_CLEAR_COINS.perWave * result.settledWave;
    const clearScore = SCORE.waveClearBase * result.settledWave;
    // The settled wave never fires waveComplete, so its chain payout is paid
    // here — otherwise calling early would quietly forfeit the best chain.
    const comboPayout = waveComboPayout(this.combo.best);
    const payout = clearCoins + result.bonus + comboPayout;
    this.economy.earn(payout);
    this.addScore(clearScore);

    this.trackStats({ earlyCalls: 1 });
    audio.playCallEarly();
    startNewWave(this.combo);
    this.hud?.hideCombo();
    this.hud?.showToast(
      `Early call! +🪙${payout} · ${alive} leftover${alive === 1 ? '' : 's'} still marching`,
      'info'
    );
    this.setWaveLane(result.wave);
    this.setBroodColour(result.wave);
    this.flashWaveBanner(result.wave, this.waveManager.currentWave?.name || '');
    this.syncHUD();
  }

  /**
   * Tint the portal with the wave's brood colour. Each wave block uses one of
   * the three enemy palettes, so the gate visibly changes colour as the horde
   * changes breed.
   */
  setBroodColour(waveNumber, tint = null) {
    if (!this.theme) return;
    const base = this.theme.portalTint ?? 0xb388ff;
    const accent = tint ?? waveAccent(waveNumber);
    // 50/50 blend keeps the biome's identity while the brood still reads.
    const mixed =
      (((base >> 16 & 255) + (accent >> 16 & 255)) >> 1) << 16 |
      (((base >> 8 & 255) + (accent >> 8 & 255)) >> 1) << 8 |
      (((base & 255) + (accent & 255)) >> 1);
    this.portalSprite?.setTint(mixed);
    this.spawnAccent = accent;
  }

  /**
   * Death juice: a short, biome-tinted spark burst plus a bright flash ring.
   * Stronger chains (tier 0..3) pop harder, so a 10-kill chain *feels* different
   * from a single kill without changing any damage numbers.
   */
  spawnDeathBurst(x, y, tier = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.vfx?.death?.(x, y, 'physical', tier >= 2 ? 1.6 : 1);
    const tint = tier >= 3 ? 0xffd166 : tier >= 2 ? 0xff9d3c : (this.spawnAccent ?? this.theme?.portalTint ?? 0xb388ff);
    try {
      const emitter = this.particleEmitter;
      if (emitter) {
        emitter.setParticleTint?.(tint);
        emitter.explode(8 + tier * 5, x, y);
      }
      this.shockwave(x, y, {
        from: 0.18,
        to: 0.5 + tier * 0.22,
        tint,
        alpha: 0.55 + tier * 0.1,
        duration: 300 + tier * 70,
        depth: 44,
      });
      if (this.textures.exists('spark')) {
        const flash = this.add
          .image(x, y, 'spark')
          .setTint(tint)
          .setDepth(47)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(1.6 + tier * 0.35)
          .setAlpha(0.9);
        this.tweens.add({
          targets: flash,
          scale: 2.6 + tier * 0.5,
          alpha: 0,
          duration: 220 + tier * 40,
          ease: 'Cubic.easeOut',
          onComplete: () => flash.destroy(),
        });
      }
    } catch (error) {
      this.reportRuntimeError(error);
    }
  }

  /** Big, short-lived "WAVE 4 — DUNE SWARM" title over the battlefield. */
  flashWaveBanner(waveNumber, name = '') {
    if (!this.add?.text || !this.cameras?.main) return;
    try {
      const { width } = this.scale;
      const label = this.level?.endless ? `WAVE ${waveNumber}` : `WAVE ${waveNumber} / ${this.waveManager.totalWaves}`;
      const title = this.add
        .text(width / 2, 96, `${label}\n${String(name).toUpperCase()}`, {
          fontFamily: 'Cinzel, Georgia, serif',
          fontSize: '26px',
          color: '#f5c451',
          align: 'center',
          stroke: '#120d07',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(60)
        .setAlpha(0);

      this.tweens.add({ targets: title, alpha: 1, duration: 180, yoyo: true, hold: 900, onComplete: () => title.destroy() });
    } catch (error) {
      this.reportRuntimeError(error);
    }
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
    // Quitting a duel is a forfeit, not a trip to the campaign map.
    if (this.level?.pvp && window.gameFlow?.quitDuel) {
      window.gameFlow.quitDuel();
      return;
    }
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
      this.trackStats({ upgradesBought: 1 });
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
    const refund = Math.round(tower.sellRefund * this.relicBonuses.sellRefund);
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

    // 0a. A meteor waiting for a target: the next tap on the map spends it.
    if (this.pendingMeteor) {
      this.pendingMeteor = false;
      this.castMeteor(worldX, worldY);
      return;
    }

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

    // 0b. Focus fire: a tap on a creep marks it, a second tap releases it.
    //
    // Building takes priority (an armed card must place its defence), and a
    // defence under the cursor takes priority too — inspecting a tower must not
    // be blocked by a creep walking past it.
    if (!this.selectedBuildKey && !this.placement.getOccupant(row, col)) {
      const tapped = enemyAt(this.activeEnemies, worldX, worldY);
      if (tapped) {
        this.setFocusFire(tapped);
        return;
      }
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

  /**
   * Mark a creep so every tower that can reach it fires at it first.
   *
   * Passing the creep that is already marked releases the mark, so one tap is
   * the whole interaction: tap to focus, tap again to let the towers go back to
   * their own targeting mode. The mark changes *who* is shot, never how hard —
   * which is why no balance number moved when this was added.
   *
   * @param {object|null} enemy
   * @returns {object|null} the target after the toggle
   */
  setFocusFire(enemy) {
    const next = isFocusable(enemy) ? enemy : null;
    this.focusTarget = next && next !== this.focusTarget ? next : null;

    if (this.focusTarget) {
      const readout = focusReadout(this.focusTarget);
      audio.playClick();
      this.hud?.showFocus(this.focusTarget);
      this.hud?.showToast(
        `◎ FOCUS FIRE · ${readout.name} — tap it again or press ESC to release`,
        'info'
      );
    } else {
      this.hud?.hideFocus();
      this.focusGraphics?.clear();
    }
    return this.focusTarget;
  }

  /**
   * Keep the reticle glued to the marked creep and drop the mark when it dies.
   *
   * Called every simulation tick, after the enemy list has been compacted, so a
   * dead creep releases the mark in the same frame instead of leaving every
   * tower stuck on a target that no longer exists.
   */
  updateFocusFire() {
    const graphics = this.focusGraphics;
    if (!graphics) return;
    graphics.clear();

    const target = this.focusTarget;
    if (!target) return;

    if (!isFocusable(target) || !this.activeEnemies.includes(target)) {
      this.focusTarget = null;
      this.hud?.hideFocus();
      return;
    }

    const now = this.time?.now || 0;
    const pulse = (Math.sin(now / 260) + 1) / 2; // 0..1, ~1.6 s cycle
    const radius = 15 + pulse * 3;
    const { x, y } = target;

    // Four corner brackets, not a ring of fire: the mark has to stay readable
    // over a burning lane without adding another full-screen flash.
    graphics.lineStyle(2, 0xffd76a, 0.85);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      graphics.beginPath();
      graphics.moveTo(x + sx * radius, y + sy * radius * 0.45);
      graphics.lineTo(x + sx * radius, y + sy * radius);
      graphics.lineTo(x + sx * radius * 0.45, y + sy * radius);
      graphics.strokePath();
    }
    graphics.lineStyle(1, 0xffd76a, 0.22 + pulse * 0.18);
    graphics.strokeCircle(x, y, radius + 7);

    // The chip's health figure follows at a human rate, not 60 writes a second.
    if (now - (this.lastFocusHudAt || 0) > 180) {
      this.lastFocusHudAt = now;
      this.hud?.updateFocus(target);
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

    // BLACKOUT closes the palisade line for the wave — said out loud, because a
    // build that fails silently reads as a broken button.
    if (typeKey === 'barricade' && this.runMods?.noBarricades) {
      return { ok: false, reason: 'barricade-locked' };
    }
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
      // Overcharge is a global cooldown multiplier read by Tower.attackCooldown.
      powerups: this.powerups,
    });
    this.placement.occupy(row, col, tower);
    this.activeTowers.push(tower);

    if (tower.isBarricade) {
      this.gameState.counters.barricadesPlaced++;
      this.trackStats({ palisadesBuilt: 1 });
      this.hud?.showToast('Palisade raised! Enemies must break it down.', 'info');
    } else {
      this.gameState.counters.towersPlaced++;
      const standing = this.activeTowers.filter((t) => !t.isBarricade).length;
      this.trackStats({ towersBuilt: 1, maxTowersAtOnce: standing }, { max: ['maxTowersAtOnce'] });
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
      // Banner auras first, then the permanent relic and the run blessings.
      // Banner auras → relics → blessings → the run's card/anomaly stack. The
      // stack is read here rather than pushed into each tower, so a card picked
      // mid-run lands on every tower on the board at once.
      tower.setBuffs({
        damage: damage * this.relicBonuses.damage * this.blessingBonuses.damage * this.runMods.damage,
        range: range * this.runMods.range,
        cooldown: cooldown * this.relicBonuses.cooldown * this.blessingBonuses.cooldown * this.runMods.cooldown,
      });
    }
  }

  /**
   * Score goes through one door so Ascension (and any future scoring card) can
   * scale it without hunting down six call sites.
   */
  addScore(points) {
    const scaled = Math.max(0, Math.round((Number(points) || 0) * (this.runMods?.score || 1)));
    this.economy.addScore(scaled);
    return scaled;
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

  /**
   * Paint the entrance hint for the wave the player is waiting on.
   *
   * The geometry lives in `LaneArrows.js`; this owns the Phaser object and the
   * index. Called once at scene start and again whenever the pending wave
   * changes — never per frame.
   */
  drawLaneHint() {
    const graphics = this.laneHintGraphics;
    if (!graphics?.clear) return 0;
    graphics.clear();
    const lanes = this.pathfinding?.lanes || [];
    const lane = lanes[this.waveLaneIndex] || this.pathfinding?.mainPath;
    if (!lane?.length) return 0;
    return paintLaneHint(graphics, lane, TILE_SIZE);
  }

  /** Move the entrance hint onto the lane `waveNumber` will walk. */
  setWaveLane(waveNumber) {
    this.waveLaneIndex = this.laneIndexForWave(waveNumber);
    this.laneHintDrawn = true;
    this.drawLaneHint();
    return this.waveLaneIndex;
  }

  /**
   * Keep the hint pointing at the wave the player is about to face.
   *
   * Between waves the beacon belongs on the *next* lane, the one the push will
   * come out of; during a wave it stays on the lane that is marching. Called
   * from the paused branch of the frame loop, and it only repaints when the
   * index actually changes — never per frame.
   */
  syncLaneHint() {
    const manager = this.waveManager;
    if (!manager) return;
    let pending = manager.waveNumber;
    if (manager.state === WAVE_STATE.IDLE) pending = manager.waveNumber + 1;
    const index = this.laneIndexForWave(pending || 1);
    if (index === this.waveLaneIndex && this.laneHintDrawn) return;
    this.setWaveLane(pending || 1);
  }

  /** "UPPER LANE" / "CENTRE LANE" … for the wave toast and the pause card. */
  laneName(index = this.waveLaneIndex) {
    return `${laneLabel(this.pathfinding?.lanes, index)} LANE`;
  }

  toggleBFSVisualizer(enabled) {
    this.isVisualizingBFS = enabled;
    if (enabled) {
      this.drawBFSVisualization();
    } else {
      this.bfsVisualizerGraphics.clear();
    }
  }

  /** Trace one lane of cell keys into the BFS overlay. */
  strokeLane(graphics, lane, { width, color, alpha, dots = false }) {
    if (!graphics || !lane?.length) return;
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    lane.forEach((key, index) => {
      const [r, c] = key.split(',').map(Number);
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;
      if (index === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
      if (dots) {
        graphics.fillStyle(color, Math.min(1, alpha + 0.1));
        graphics.fillCircle(x, y, 3);
      }
    });
    graphics.stroke();
  }

  drawBFSVisualization() {
    this.bfsVisualizerGraphics.clear();
    const result = this.pathfinding.lastMainResult;
    if (!result || !result.path) return;

    // The side lanes first, each in its own tint: the horde splits, so an
    // overlay that only traced the shortest route would hide half the map.
    const tints = [0x7fe3ff, 0xff9d6b, 0xb8f2a8];
    (this.pathfinding.lanes || []).forEach((lane, index) => {
      if (index === 0) return;
      this.strokeLane(this.bfsVisualizerGraphics, lane, {
        width: 3,
        color: tints[(index - 1) % tints.length],
        alpha: 0.75,
      });
    });

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
    // In a duel a broken core is a knockout, not a campaign defeat: the room
    // scores the match and the lobby decides what happens next.
    if (this.level.pvp) return this.finishDuel('ko');
    // A mode run (and a puzzle) is scored, never starred: campaign progress is
    // earned on the campaign map only. `runModeLabel()` also catches Titan
    // Rush, which is a level rather than a flag.
    if (this.modeId) return this.finishModeRun('defeat');

    const score = this.economy.score;
    const record = this.progress.recordDefeat(this.level, {
      wave: this.waveManager.waveNumber,
      score,
    });

    this.showResult({
      outcome: 'defeat',
      achievements: record?.achievements || [],
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
    this.addScore(this.gameState.baseHealth * SCORE.victoryPerBaseHp);
    audio.playVictory();
    if (this.level.pvp) return this.finishDuel('cleared');
    if (this.modeId) return this.finishModeRun('victory');

    const record = this.progress.recordVictory(this.level, {
      baseHealth: this.gameState.baseHealth,
      maxBaseHealth: this.gameState.maxBaseHealth,
      score: this.economy.score,
    });
    // A daily clear is worth its modifier's gems once per day — the store, not
    // the scene, decides whether this is the first win of the day.
    let dailyResult = null;
    if (this.dailyKey && window.gameDaily) {
      dailyResult = window.gameDaily.recordWin(this.dailyKey, {
        score: this.economy.score,
        gems: this.dailyModifier?.gems || 0,
      });
      if (dailyResult.gems > 0) this.progress.addGems(dailyResult.gems);
      const stats = this.progress.profile.stats;
      if (dailyResult.firstWin) stats.dailyWins = (Number(stats.dailyWins) || 0) + 1;
      stats.dailyStreak = Math.max(Number(stats.dailyStreak) || 0, dailyResult.streak);
    }

    // `recordVictory` already paid the achievements it could see; this second
    // pass catches the daily-only ones (first daily, 7-day streak).
    const lateAchievements = this.syncAchievements();
    const newAchievements = [...(record.achievements || [])];
    for (const def of lateAchievements) {
      if (!newAchievements.some((a) => a.id === def.id)) newAchievements.push(def);
    }

    this.showResult({
      outcome: 'victory',
      level: this.level,
      stars: record.stars,
      previousStars: record.previousStars,
      improved: record.improved,
      rewards: record.rewards,
      daily: this.dailyKey
        ? { key: this.dailyKey, modifier: this.dailyModifier, gems: dailyResult?.gems || 0, streak: dailyResult?.streak || 0 }
        : null,
      achievements: newAchievements,
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
   * Report this half of a duel to the room.
   *
   * The scene never decides who won: it publishes its own terminal state
   * (cleared the script, or core destroyed) and the room compares the two
   * seats. That keeps both clients on one source of truth and means a PvP
   * match works the same whether the rival is on the same machine or across
   * the internet.
   */
  finishDuel(outcome) {
    // One report per match: a late enemy reaching the core while the card is up
    // must not file a second result (or re-open the card over a verdict).
    if (this.duelReported) return this.lastDuel;
    this.duelReported = true;
    // Contract score has to be in the number the room negotiates with.
    const payout = this.bankContracts();
    const report = {
      roomCode: this.pvp?.roomCode || null,
      arenaId: this.level.arenaId,
      seat: this.pvp?.seat ?? 0,
      outcome,
      score: this.economy.score,
      coreHp: this.gameState.baseHealth,
      maxCoreHp: this.gameState.maxBaseHealth,
      waves: this.waveManager.wavesCompleted,
      totalWaves: this.waveManager.totalWaves,
      timeMs: this.gameState.elapsedMs,
      contracts: this.contractRows(),
      contractBonus: payout.total,
      // Co-op rooms resolve cooperatively: the card says "pact", not "winner".
      coop: Boolean(this.mode?.coop),
    };
    this.lastDuel = report;
    // Terminal for this seat, either way: freeze the board behind the card
    // instead of leaving a dead horde marching under it (or, worse, an empty
    // board that still swallows taps meant for the card).
    window.gameFlow?.pauseBattle?.();
    // The card comes before the report on purpose. The host resolves its own
    // report *synchronously*, so reporting first meant `showFinal` drew the
    // verdict and then this half-time card painted "waiting for the room" over
    // it — a decided match with no winner on screen, which is the freeze the
    // players were hitting.
    if (window.gameDuelResult?.show) {
      window.gameDuelResult.show(report);
    } else {
      this.showResult({
        outcome: outcome === 'ko' ? 'defeat' : 'victory',
        pvp: true,
        level: this.level,
        score: report.score,
        waves: report.waves,
        totalWaves: report.totalWaves,
        timeMs: report.timeMs,
      });
    }
    // A dropped relay must never take the scene down with it: the verdict is
    // already on screen, so a failed send is only a missing confirmation.
    try {
      window.gamePvp?.reportSeat?.(report);
    } catch (error) {
      this.reportRuntimeError?.(error);
    }
    return report;
  }

  showResult(payload) {
    this.lastResult = payload;
    // The run is over: the battle bed stops and the sting takes the scene. The
    // result screens want no ambience at all (`AMBIENCE_FOR` maps both to an
    // empty bed), so the wind does not play under the defeat card.
    const mood = payload.outcome === 'victory' ? 'victory' : 'defeat';
    audioDirector.setScene(mood);
    audioDirector.setLocation(mood);
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

  /**
   * Buy a run blessing with in-run gold.
   *
   * Gold is spent immediately and the effect is folded into `blessingBonuses`
   * before tower auras are recomputed, so a damage blessing applies to the
   * very next shot rather than next wave.
   *
   * @returns {{ ok:boolean, reason?:string, healed?:number }}
   */
  buyBlessing(id) {
    // Same reason as the powerups: a blessing is gold spent on a private edge.
    if (this.level.rules?.blessings === false) return { ok: false, reason: 'duel' };
    const def = getBlessing(id);
    const check = canBuyBlessing(id, { gold: this.economy.coins, purchased: this.blessingsBought });
    if (!check.ok || !def) return { ok: false, reason: check.reason || 'unknown' };
    if (!this.economy.spend(def.cost)) return { ok: false, reason: 'gold' };

    this.blessingsBought[id] = (this.blessingsBought[id] || 0) + 1;
    this.blessingBonuses = blessingBonuses(this.blessingsBought);
    const healed = def.heal ? this.gameState.healBase(def.heal) : 0;
    this.refreshTowerAuras();
    audio.playVictory();
    this.hud?.showToast(
      `${def.icon} ${def.name}${healed ? ` · +${healed} core HP` : ''} · -${def.cost}g`,
      'success'
    );
    this.syncHUD();
    return { ok: true, healed };
  }

  /**
   * Pay the endless checkpoints crossed by the wave that just closed.
   *
   * `lastMilestoneWave` is the high-water mark already paid, so re-clearing a
   * wave (possible after an early call) cannot double-pay.
   */
  payEndlessMilestones(wave) {
    const crossed = milestonesBetween(this.lastMilestoneWave, wave);
    if (!crossed.length) return [];
    this.lastMilestoneWave = wave;
    let gold = 0;
    let gems = 0;
    for (const milestone of crossed) {
      gold += milestone.gold;
      gems += milestone.gems;
      this.hud?.showToast(`∞ MILESTONE · ${milestoneLabel(milestone)}`, 'success');
    }
    this.economy.earn(gold);
    this.progress?.addGems?.(gems);
    this.progress?.trackStats?.({ endlessBestWave: wave }, { max: ['endlessBestWave'] });
    this.progress?.save?.();
    audio.playVictory();
    return crossed;
  }

  /** Early-call availability + its gold bonus, or null when unavailable. */
  earlyCallInfo() {
    // Calling a wave early is a tempo decision; in a duel the arena owns the
    // tempo, so the button never offers it.
    if (this.duelPacing) return null;
    const alive = this.activeEnemies.length;
    if (!this.waveManager.canCallEarly(alive)) return null;
    return { available: true, bonus: earlyCallBonus(alive), wave: this.waveManager.waveNumber + 1, alive };
  }

  /**
   * Compact description of the upcoming wave for the HUD preview strip.
   *
   * Cached per wave number because the endless factory builds a fresh object on
   * every call, and syncHUD runs on each game event.
   */
  nextWavePreview() {
    if (!this.waveManager.canStartNextWave() && !this.waveManager.canCallEarly(this.activeEnemies.length)) {
      return null;
    }
    const number = this.waveManager.waveNumber + 1;
    if (this._previewCache?.number === number && this._previewCache.managerState === this.waveManager.state) {
      return this._previewCache.preview;
    }
    const wave = this.waveManager.nextWave;
    if (!wave) return null;
    const counts = new Map();
    for (const group of wave.groups) {
      counts.set(group.type, (counts.get(group.type) || 0) + group.count);
    }
    const preview = {
      number,
      name: wave.name || '',
      boss: Boolean(wave.bossWave || wave.bossKey),
      bossKey: wave.bossKey || null,
      total: [...counts.values()].reduce((sum, n) => sum + n, 0),
      groups: [...counts.entries()].map(([type, count]) => ({ type, count })),
    };
    this._previewCache = { number, managerState: this.waveManager.state, preview };
    return preview;
  }

  /** Everything the duel contracts read. Cheap: counters and one array length. */
  duelStats() {
    return {
      kills: this.gameState?.counters?.enemiesDefeated || 0,
      waves: this.waveManager?.wavesCompleted || 0,
      bestChain: this.combo?.best || 0,
      bounties: this.bountiesCleared || 0,
      cleanWaves: this.cleanWaves || 0,
      coreHp: this.gameState?.baseHealth || 0,
    };
  }

  /** Contract rows for the pause card. */
  contractRows() {
    return this.contracts ? contractProgress(this.contracts, this.duelStats()) : [];
  }

  /**
   * Cash the contracts in, once, before the seat reports its score.
   *
   * Order matters: the negotiated score is the one the room compares, so a
   * contract that pays after the report would be worth nothing.
   */
  bankContracts() {
    if (this.contractsBanked) return this.contractPayout || { total: 0, done: [] };
    this.contractsBanked = true;
    const stats = this.duelStats();
    const payout = contractScore(this.contracts, stats);
    this.contractPayout = payout;
    if (payout.total > 0) {
      this.addScore(payout.total);
      this.hud?.showToast(
        `CONTRACT PAID · +${payout.total} pts (${payout.done.length}/${this.contracts.length})`,
        'success'
      );
    }
    return payout;
  }

  /**
   * What the wave button should read while the arena drives the waves.
   *
   * `null` in campaign/endless, where the button is a real button.
   */
  duelScheduleInfo() {
    const pacing = this.duelPacing;
    if (!pacing) return null;
    return {
      phase: pacing.phase,
      seconds: pacingSeconds(pacing),
      label: pacingLabel(pacing, { waveNumber: Math.max(1, this.waveManager.waveNumber) }),
      hint: pacingHint(pacing),
    };
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
      earlyCall: this.earlyCallInfo(),
      nextWave: this.nextWavePreview(),
      bestWave: this.level.endless ? this.progress?.profile?.endlessBestWave || 0 : 0,
      schedule: this.duelScheduleInfo(),
    });
    this.badges?.sync(this.activeTowers, this.economy.coins);
    if (this.level.pvp) this.hud?.setContracts?.(this.contractRows());
    this.syncDuelTelemetry();
  }

  /**
   * Duel telemetry: paint the rival strip, and every 0.5 s push my own wave /
   * points / core HP to the room so the other player's strip stays live.
   *
   * The strip is a remote readout, so it is repainted on a budget rather than
   * every frame (see `DuelTelemetry`): reading `room.view` allocates the whole
   * lobby view, and a style write per frame is layout for text that cannot have
   * changed at 60 Hz. Progress is cosmetic — it never decides the match — so it
   * is throttled and dropped when the room is not connected.
   */
  syncDuelTelemetry() {
    if (!this.level?.pvp || !this.pvp) return;
    const now = this.time?.now || 0;
    const plan = telemetryPlan(now, { paint: this.lastRivalPaint, report: this.lastDuelReport });

    if (plan.paint) {
      this.lastRivalPaint = now;
      const rival = window.gamePvp?.view?.rival;
      if (rival) {
        this.hud?.setRivalState({
          name: rival.name,
          wave: rival.progress?.wave || 0,
          totalWaves: this.waveManager.totalWaves,
          score: rival.progress?.score || 0,
          coreHp: rival.progress?.coreHp,
          maxCoreHp: this.gameState.maxBaseHealth,
          outcome: rival.progress?.alive === false ? 'ko' : rival.result?.outcome,
        });
      }
    }

    if (!plan.report) return;
    this.lastDuelReport = now;
    window.gamePvp?.reportProgress?.({
      wave: this.waveManager.wavesCompleted,
      totalWaves: this.waveManager.totalWaves,
      score: this.economy.score,
      coreHp: this.gameState.baseHealth,
      alive: !this.gameState.isOver(),
    });
  }

  /**
   * Execute one of the three powerups.
   *
   * The state machine decides whether it is legal (cooldown), this method
   * decides what it *does*. Every branch is wrapped so a missing system in a
   * test harness cannot break the wave loop.
   */
  handlePowerup(key) {
    const powerup = POWERUPS.find((entry) => entry.key === key);
    if (!powerup) return false;
    // DEAD ZONE and duel rules both take the rail away; say so instead of
    // silently eating the tap.
    if (this.runMods?.noPowerups) {
      this.hud?.showToast('Powerups are offline this wave', 'error');
      return false;
    }
    if (!this.powerups?.use(key)) {
      audio.playError();
      return false;
    }

    if (key === 'meteor') {
      this.pendingMeteor = true;
      this.hud?.showToast('METEOR READY — tap a tile to call it down', 'info');
      audio.playWarning();
      return true;
    }

    if (key === 'overcharge') {
      this.hud?.showToast('OVERCHARGE — every tower fires 70% faster for 7s', 'info');
      audio.playCombo(3);
      this.tintTowers(0x9fe8ff, 0.3);
      return true;
    }

    if (key === 'fortify') {
      let healed = 0;
      for (const tower of this.activeTowers) {
        if (!tower.isBarricade || tower.isDestroyed) continue;
        tower.health = tower.maxHealth;
        tower.updateHealthBar?.();
        healed += 1;
      }
      this.gameState.healBase?.(40);
      this.hud?.showToast(`FORTIFY — ${healed} palisade(s) rebuilt, core +40`, 'info');
      audio.playPlace();
      return true;
    }
    return true;
  }

  /** Flash every tower in a colour for a beat (overcharge feedback). */
  tintTowers(colour, alpha = 0.4) {
    for (const tower of this.activeTowers) {
      if (!tower.topSprite?.setTint) continue;
      tower.topSprite.setTint(colour);
      this.time?.delayedCall?.(1200, () => tower.topSprite?.clearTint?.());
    }
    // No full-screen flash: the tower tints are the feedback. A white frame
    // across the board was the loudest part of the old juice pass.
    if (alpha > 0) this.cameras?.main?.shake?.(80, 0.0015);
  }

  /**
   * The meteor itself: a ground burst, a real damage number and a screen
   * shake. Damage falls off from the centre so a perfect drop is worth aiming.
   */
  castMeteor(x, y) {
    const { radius, damage } = METEOR;
    const element = 'explosive';
    this.vfx?.groundBlast?.(x, y, 1.6);
    this.vfx?.impact?.(x, y, element, { scale: 1.8, splash: radius });
    this.cameras?.main?.shake?.(220, 0.008);

    let hits = 0;
    for (const enemy of this.activeEnemies) {
      if (enemy.isDead || enemy.reachedBase) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance > radius) continue;
      const falloff = 1 - 0.45 * (distance / radius);
      const result = enemy.applyDamage(Math.round(damage * falloff), element, {
        distance,
        splashRadius: radius,
      });
      if (result?.finalDamage > 0) hits += 1;
    }
    audio.playExplosion();
    this.hud?.showToast(hits > 0 ? `METEOR — ${hits} hit` : 'METEOR — empty ground', 'info');
  }

  /** Push the current cooldowns into the HUD rail (cheap: 3 class writes). */
  refreshPowerupRail() {
    if (!this.hud?.setPowerups || !this.powerups) return;
    const now = this.time?.now || 0;
    if (this.lastPowerupPaint && now - this.lastPowerupPaint < 120) return;
    this.lastPowerupPaint = now;
    this.hud.setPowerups(this.powerups.snapshot());
  }

  bindKeyboardShortcuts() {
    this.input.keyboard.on('keydown', (event) => {
      // Hotkeys come from the tower data, so adding a defence to the dock
      // automatically gives it a working number key.
      const powerupKey = POWERUPS.find((entry) => entry.hotkey.toLowerCase() === event.key.toLowerCase());
      if (powerupKey && !event.ctrlKey && !event.metaKey) {
        this.handlePowerup(powerupKey.key);
        return;
      }
      const buildKey = BUILD_OPTIONS.find((key) => getBuildDefinition(key)?.hotkey === event.key);
      if (buildKey) this.hud?.toggleBuildSelection(buildKey);
      else if (event.key === 'Escape') {
        // Esc peels one layer at a time: the focus mark, then the armed card,
        // then the selected tower.
        if (this.focusTarget) {
          this.setFocusFire(null);
          return;
        }
        this.hud?.clearBuildSelection();
        this.handleDeselectTower();
      } else if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (this.waveManager.canStartNextWave()) {
          this.handleStartWave();
        } else if (this.waveManager.canCallEarly(this.activeEnemies.length)) {
          this.handleCallWaveEarly();
        } else {
          this.handleTogglePause();
        }
      } else if (event.key.toLowerCase() === 'h') {
        // Fold the forge dock away to see the whole battlefield, and back again.
        // (F is taken by fullscreen, C by the codex, L by the leaderboard.)
        this.hud?.toggleDock();
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
      this.syncLaneHint();

      if (this.gameState.isPaused() || this.gameState.isOver()) return;

      this.stepSimulation(rawDelta);
    } catch (error) {
      this.reportRuntimeError(error);
    }
  }

  /** One simulation tick: waves, enemies, towers, projectiles, boss HUD. */
  stepSimulation(rawDelta) {
    // A card pick or an ascension prompt freezes the board the same way the
    // pause card does — no creep moves, no wave clock, no powerup cooldown.
    if (this.modePaused) return;
    if (this.mode?.timeAttack) this.tickTimeAttack(Math.min(rawDelta, MAX_FRAME_DELTA));
    // Cap delta to prevent huge jumps after backgrounding tab
    const clampedDelta = Math.min(rawDelta, MAX_FRAME_DELTA) * this.simSpeed;

    this.gameState.tick(clampedDelta);

    // Kill chain decays on its own clock; the HUD bar follows it.
    const combo = tickCombo(this.combo, this.time?.now || 0);
    if (combo.expired) this.hud?.hideCombo();
    else if (combo.chain > 0) this.hud?.updateComboTimer(combo.remainingMs);

    // Powerup cooldowns run on the same clock as the simulation, so pausing the
    // game does not silently recharge the meteor.
    this.powerups?.tick(this.time?.now || 0);
    this.refreshPowerupRail();

    // 0. The duel's own clock — it opens waves without a button.
    this.tickDuelPacing(clampedDelta);

    // 1. Wave Manager Update
    const waveEvent = this.waveManager.update(clampedDelta, this.activeEnemies.length);
    if (waveEvent && waveEvent.type === 'waveComplete') {
      audio.playWaveStart();
      const bonusCoins = WAVE_CLEAR_COINS.base + WAVE_CLEAR_COINS.perWave * waveEvent.waveNumber;
      const bonusScore = SCORE.waveClearBase * waveEvent.waveNumber;
      const comboPayout = waveComboPayout(this.combo.best);
      this.trackStats({ wavesCleared: 1 });
      this.economy.earn(bonusCoins + comboPayout);
      this.addScore(bonusScore);
      if (waveEvent.bounty) {
        // The twin of the doubled kill gold: a lump sum for finishing the wave.
        this.economy.earn(waveEvent.bountyGold);
        this.addScore(waveEvent.bountyScore);
        this.bountiesCleared = (this.bountiesCleared || 0) + 1;
        this.hud?.showToast(
          `BOUNTY CLEARED · +🪙${waveEvent.bountyGold} · +${waveEvent.bountyScore} pts`,
          'success'
        );
      }
      // A wave that ends without a leak is what the BLOODLESS contract counts.
      if ((this.level.pvp || this.contracts) && (this.leaksThisWave || 0) === 0) {
        this.cleanWaves = (this.cleanWaves || 0) + 1;
      }
      this.leaksThisWave = 0;
      const comboNote = comboPayout > 0 ? ` · best chain ${this.combo.best} (+🪙${comboPayout})` : '';
      this.hud?.showToast(
        `Wave ${waveEvent.waveNumber} Cleared! (+🪙${bonusCoins + comboPayout}, +${bonusScore} pts)${comboNote}`,
        'info'
      );
      this.hud?.hideCombo();

      // Clearing a wave pays part of every cooldown back — the reward for
      // holding the line is the next trick, not just gold.
      this.powerups?.onWaveClear();
      this.refreshPowerupRail();
      if (this.level.endless) this.payEndlessMilestones(waveEvent.waveNumber);
      this.syncAchievements();

      if (!waveEvent.isFinal) this.afterWaveCleared(waveEvent);

      if (waveEvent.isFinal) {
        closePacing(this.duelPacing);
        this.handleVictory();
      } else if (this.duelPacing) {
        // Five seconds to spend the clear bonus before the next horde opens
        // itself. The countdown lives in the dock button, not in a modal.
        breathe(this.duelPacing);
      }
      this.syncHUD();
    }

    // 2. Active Enemies Update
    for (let i = 0; i < this.activeEnemies.length; i++) {
      this.activeEnemies[i].update(clampedDelta);
    }
    // In-place O(n) array compaction
    compactInPlace(this.activeEnemies, (e) => !e.isDead && !e.reachedBase);

    // The focus mark outlives a single frame but not a corpse: prune it here,
    // before the towers pick their targets.
    this.updateFocusFire();

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
    const tracked = this.bossRoster.prune();
    if (tracked !== this.activeBoss) {
      this.activeBoss = tracked;
      this.syncBossPanel();
    } else if (tracked) {
      this.hud?.updateBossBar(tracked);
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
