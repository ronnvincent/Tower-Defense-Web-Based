import { TILE_SIZE, STARTING_COINS, STARTING_BASE_HEALTH, SCORE, WAVE_CLEAR_COINS, MAX_FRAME_DELTA } from '../config/gameConfig.js';
import { parseMap, getMapLayout, getMapBiomes, TILE } from '../data/mapData.js';
import { ARENA_ART, PORTAL_ANIM, KEEP_PAD_RATIO } from '../data/arenaArt.js';
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
  hordeScaling,
  summariseMods,
} from '../systems/RunMods.js';
import { drawCards } from '../data/draftCards.js';
import { createCoach } from '../systems/FirstRun.js';
import { createTutorialDirector } from '../systems/TutorialDirector.js';
import { TutorialUI } from '../ui/TutorialUI.js';
import {
  VILLAGE_PROP_ART,
  VILLAGER_ART,
  drawVillageDressing,
  queueVillageArt,
} from '../systems/VillageDressing.js';
import {
  TUTORIAL_BEATS,
  TUTORIAL_CAST,
  TUTORIAL_HOLD_QUIPS,
  VILLAGE_STAGE,
  VILLAGE_EXIT,
  SPEAKER_ACCENTS,
  speakerFor,
} from '../data/tutorialScript.js';
import { perfProbe } from '../system/perfProbe.js';
import { applyAtmosphereSkin, buildAtmosphere, clearAtmosphereSkin } from '../systems/Atmosphere.js';
import { getBuildDefinition } from '../data/towerData.js';
import { PathfindingSystem, laneIndexForWave } from '../systems/PathfindingSystem.js';
import { gateIndexForSpawn, waveGatePlan } from '../systems/SpawnGates.js';
import { buildAirRoutes } from '../systems/AirRoutes.js';
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
import { buildBounds } from '../systems/BuildZone.js';
import { RoyalSystems } from '../systems/RoyalSystems.js';
import { BASTION_STATE, bastionState, isBastionCritical, leakIntensity } from '../systems/Bastion.js';
import {
  PREP_PHASE,
  advanceWavePrep,
  armWavePrep,
  cancelWavePrep,
  createWavePrep,
} from '../systems/WavePrep.js';
import { Vfx } from '../systems/Vfx.js';
import { PowerupState, POWERUPS, METEOR, FROST, frostTargets } from '../systems/Powerups.js';
import { difficultyFor } from '../systems/Difficulty.js';
import { Leaderboard } from '../systems/Leaderboard.js';
import { Enemy } from '../entities/Enemy.js';
import { Hero, HERO, HERO_TEXTURE } from '../entities/Hero.js';
import { Pet } from '../entities/Pet.js';
import { getPet, PET_FOLLOW } from '../data/petData.js';
import { queueUnitSheets, registerUnitAnims, UNIT_SHEETS } from '../data/unitArt.js';
import { HERO_SKILLS, heroRank, skillStats } from '../data/heroData.js';
import { MAX_LEVEL } from '../data/towerAscension.js';
import { Tower } from '../entities/Tower.js';
import { resolveSiegeSwing, huntRadiusFor, pickDefenceInReach } from '../systems/BarricadeCombat.js';
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
import { battleFrame } from '../camera/battleFrame.js';
import { UpgradeBadges } from '../ui/UpgradeBadge.js';
import { ProgressStore } from '../systems/Progression.js';
import { waveAccent } from '../systems/EnemySkins.js';

/**
 * Which tile set the river row is painted with.
 *
 * `grassland` is the theme whose tile suffix is empty — the base sheet — so it
 * doubles as the neutral set. Themed water is still used for ponds (a caldera
 * pool is magma, a glacier hole is navy meltwater); the divider that splits the
 * board is water on every map, which is what the brief asks for.
 */
const RIVER_THEME = 'grassland';


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
    // The opening scene is rebuilt on every boot of the village; a restart must
    // never inherit the previous run's director, cast or finished flag.
    this.tutorialHold = false;
    this.tutorialCast = [];
    this.tutorialFinished = false;
    this.tutorialReported = new Set();
    // The battle band is per battle: a fresh stage measures the HUD again.
    this.battleFrame = null;
    this.battleFrameLocked = false;
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
      // A duel is symmetric by contract: no preset may tilt one seat, so the
      // arena always resolves to Normal regardless of the stored campaign pick.
      this.difficulty = difficultyFor('normal');
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
    // Difficulty is frozen for the attempt. The briefing writes the choice to
    // the store before DEPLOY, and a restart re-reads the same id, so a run can
    // never re-apply a multiplier it already paid for.
    this.difficulty = difficultyFor(
      data?.difficulty ?? window.gameDifficulty?.id ?? 'normal'
    );
    this.progress = window.gameProgress || new ProgressStore();
    this.lastMilestoneWave = 0;
    // Permanent relics + this run's blessings fold into one bonus set, read by
    // the economy, the core HP and every tower's damage/cooldown.
    this.relicBonuses = relicBonuses(this.progress?.profile?.relics || {});
    this.blessingsBought = {};
    this.blessingBonuses = blessingBonuses({});
    // Modes are flags on the same scene, never a second scene: Rogue Siege is
    // Endless plus a card pick. A puzzle arrives as its own level object, so it
    // needs no flag at all.
    this.mode = {
      rogue: Boolean(data?.rogue),
      puzzle: Boolean(this.level.puzzle),
      coop: false,
    };
    this.runSeed =
      Math.floor(Number(data?.seed)) ||
      (Math.floor(Date.now() / 1000) % 2_147_483_647) ||
      1;
  }

  /**
   * Post a finished daily run to the shared board.
   *
   * The daily is the one ranking where two players are genuinely comparable —
   * same seed, same twist, same day — so the run goes up the moment it ends,
   * win or loss. Fire-and-forget on purpose: the local save already holds the
   * result, and a ledger that does not answer must never cost a player the card
   * they are reading.
   */
  publishDailyRun(payload = {}) {
    if (!this.dailyKey) return;
    const cloud = window.gameCloud;
    if (!cloud?.submitDaily) return;
    try {
      void cloud.submitDaily({
        dayKey: this.dailyKey,
        levelId: this.levelId,
        seed: this.runSeed,
        score: payload.score ?? this.economy?.score ?? 0,
        waves: payload.waves ?? this.waveManager?.wavesCompleted ?? 0,
      });
    } catch (error) {
      this.reportRuntimeError?.(error);
    }
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
    // The Vanguard and the equipped companion are small sheets, loaded with the
    // first battle that needs them and reused afterwards — they never belong to
    // boot, because the realm screens do not draw either of them.
    const unitKeys = this.unitSheetKeys();
    const needsUnits = unitKeys.some((key) => !this.textures.exists(key));
    // The village's cottages and its five villagers are loaded with the one
    // battle that draws them, never at boot: the realm screens need no cottage.
    const needsVillage =
      Boolean(this.level?.tutorial) &&
      [...Object.keys(VILLAGE_PROP_ART), ...Object.keys(VILLAGER_ART)].some(
        (key) => !this.textures.exists(key.startsWith('npc-') ? key : `village-${key}`)
      );
    if (!needsEnemies && !needsFx && !needsUnits && !needsVillage) return;

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
    if (needsFx) queueBattleFxArt(this.load, this.textures);
    if (needsUnits) queueUnitSheets(this.load, this.textures, unitKeys);
    if (needsVillage) queueVillageArt(this.load, this.textures);
  }

  /**
   * Which unit sheets this battle needs: the Vanguard at the rank the player
   * bought, plus the equipped companion if there is one. Nothing else — nine
   * sheets would be 6 MB of decode for one sprite.
   */
  unitSheetKeys() {
    const keys = [];
    const rank = heroRank(this.progress?.heroClass, this.progress?.selectedRank || 1);
    if (UNIT_SHEETS[rank.texture]) keys.push(rank.texture);
    const pet = getPet(this.progress?.equippedPet);
    if (pet && UNIT_SHEETS[pet.texture]) keys.push(pet.texture);
    if (!keys.includes(HERO_TEXTURE)) keys.push(HERO_TEXTURE);
    // The death puff is a unit sheet too, and the only thing that draws it is
    // the Vanguard going down — load it with the hero, not on demand.
    if (UNIT_SHEETS['fx-skull']) keys.push('fx-skull');
    return Array.from(new Set(keys));
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
      if (quality.degrade()) {
        audioDirector.sync?.();
        // The motes and the wash follow the new profile; a demoted device must
        // not keep the weather the measurement just paid for.
        this.mountAtmosphere();
      }
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
    // The sky lanes. A flyer crosses the ponds, the river and the rocks; it does
    // not use a bridge and it cannot be stopped by a palisade. The lanes are
    // derived from the board (three mouths, one bend) so every stage already has
    // air routes without a hand-drawn table — see systems/AirRoutes.js.
    this.airRoutes = buildAirRoutes(this.map);
    // Which lane the coming wave walks. One lane per wave, rotating — see
    // `laneIndexForWave` — so the whole horde files down the same road and the
    // next wave chooses another one.
    this.waveLaneIndex = 0;
    this.laneHintDrawn = false;
    // The free-build field, straight off the board: five rows around the keep,
    // every grass tile in them a legal tower square. There are no designated
    // pads any more (see `systems/BuildZone.js`) — the rectangle is the rule,
    // and it is the same rectangle the overlay draws.
    this.buildBounds = buildBounds(this.map);
    // Which gates a wave uses. A wave walks one road while the stage is still
    // teaching and only splits over two or three gates deep into the run — see
    // `systems/SpawnGates.js`. Derived from the wave ordinal alone (memoised per
    // wave), so there is no counter to keep in sync and a replay or a duel seat
    // derives exactly the same gate.
    this.gatePlanCache = new Map();
    this.duelReported = false;
    // The Vanguard stands one road cell short of the core, so it starts inside
    // the fight instead of behind it. Created here — after the lane graph, before
    // the HUD — so both the panel and the first wave already know it exists.
    this.hero = null;
    this.pet = null;
    this.heroHudTimer = 0;
    // Clips are registered once per sheet, here — after the loader has the
    // textures and before the entities try to play them.
    registerUnitAnims(this, this.unitSheetKeys());
    this.spawnHero();
    // Run-long rules (the draft stack). Neutral here, so the campaign and the
    // duel behave exactly as they did before modes existed.
    this.cardMods = createRunMods();
    this.runMods = this.cardMods;
    // While a card pick is open the simulation stops — the same freeze a pause
    // gets, without the pause overlay.
    this.modePaused = false;
    // A duel's contracts are dealt from the room seed, so both seats get the
    // same three. Solo runs have no contracts any more: the Contract Board was
    // retired, and the duel's are the only ones left in the game.
    this.contracts = this.pvp ? contractsFor(this.pvp.seed ?? 1) : null;
    this.contractsBanked = 0;
    this.paidContracts = new Set();
    this.bountiesCleared = 0;
    this.cleanWaves = 0;
    this.twinBossSpawned = false;
    // Set the moment a mode run hands its result to the screen, so the two
    // doors into `finishModeRun` (victory and defeat) can never both fire.
    this.modeFinished = false;
    this.modeId = this.runModeLabel();

    // Relics are the meta-progression: a little more gold, a little more core.
    // Build points are a data field on the level (`maxTowers`). Only stage 1
    // caps them — the campaign's opening contract is "eight defences, spend
    // them well". Every other level, mode and duel leaves it undefined, which
    // reads as unlimited and keeps their existing placement rules untouched.
    this.maxTowers = Number.isFinite(this.level.maxTowers) ? this.level.maxTowers : Infinity;
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

    // The preparation window. Campaign, endless and the solo modes open the
    // next wave themselves when it runs out; a duel and Time Attack own their
    // cadence already, and a second clock opening the same wave is a bug.
    this.wavePrep = this.autoWavesEnabled() ? createWavePrep(this.level) : null;
    this.prepSecond = null;

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
    // The village's cottages, fences and gardens are dressing, not terrain: they
    // are painted once, between the tiles and the build pads, so they can never
    // cover a tower square, a lane arrow or a creep.
    if (this.level?.tutorial) {
      this.villageProps = drawVillageDressing(this, { tileSize: TILE_SIZE });
    }
    // Build pads sit just above the tiles and below every unit: a pad is
    // terrain, not an object standing on it.
    this.slotGraphics = this.add.graphics().setDepth(4);
    this.drawBuildSlots();
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
    this.pendingFrost = false;
    this.createPortalAndBase();

    // 3. Atmosphere — the biome's own weather and light.
    //
    // The graphics profile is read, not assumed: `weather` is 1 at high, a
    // fraction at balanced and 0 at performance, so the same code path either
    // paints drifting snow over the hollow or paints nothing at all. The CSS
    // half (`#battle-atmosphere`) carries the vignette and the sky wash and is
    // switched by the same `data-quality` attribute the settings screen writes.
    this.mountAtmosphere();

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
    // The board is framed inside the band the HUD leaves free (top bar →
    // forge dock), so the bastion's own row is never hidden behind the forge.
    // `battleFrame` is pure geometry; `measureBattleFrame` reads the real
    // rectangles, which the HUD keeps in two custom properties.
    this.cameraRig = new CameraRig(this, {
      bounds: { x: 0, y: 0, width: this.map.cols * TILE_SIZE, height: this.map.rows * TILE_SIZE },
      frame: this.measureBattleFrame(),
      onZoomChange: (state) => {
        this.hud?.setZoomState(state);
        this.refreshHoverFromLastPointer();
      },
    });
    this.cameraRig.install();
    // The fit zoom is set by install(); publish the letterbox it leaves so the
    // Vanguard card can move into it before the first frame is drawn.
    this.publishBoardGutter();
    this.onResizeFrame = () => this.reframeBattlefield(true);
    window.addEventListener('resize', this.onResizeFrame);
    window.addEventListener('orientationchange', this.onResizeFrame);
    this.events.once('shutdown', () => {
      if (this.battleFrameTimer) window.clearTimeout(this.battleFrameTimer);
      this.battleFrameTimer = null;
    });
    // The HUD announces every re-measure (a chip appearing, the forge folding).
    // Those must move the floating controls, not the camera: the battle band is
    // captured once the HUD has published its real numbers, then left alone.
    this.battleFrameLocked = false;
    this.onHudLayout = () => {
      if (this.battleFrameLocked) return;
      this.battleFrame = null;
      this.reframeBattlefield(true);
    };
    window.addEventListener('hud-layout-change', this.onHudLayout);
    // Lock shortly after the HUD has settled. A `window.setTimeout`, not the
    // scene clock: the Clock only processes events while the scene is running,
    // and a lock that silently never fires is worse than no lock at all (it was
    // the fold itself that ended up doing the one re-measure).
    this.battleFrameTimer = window.setTimeout(() => {
      this.battleFrameTimer = null;
      if (!this.scene?.isActive?.()) return;
      this.battleFrame = null;
      this.reframeBattlefield(true);
      this.battleFrameLocked = true;
    }, 900);

    // 2c. Floating upgrade badges above every defence.
    this.badges = new UpgradeBadges(this, {
      onActivate: (tower) => this.selectTower(tower),
    });

    // 2d. Royal field effects (obelisk ward, workshop repairs, spike trap).
    this.royalSystems = new RoyalSystems(this);

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
        // The inspector's category filter is a live combat setting, not a
        // cosmetic toggle: redraw the reach ring and re-run the aura pass so
        // the panel, the ring and the next acquisition agree.
        onTargetCategoryChanged: (t) => {
          t?.drawRangeCircle?.(0x4ee1ff);
          this.refreshTowerAuras?.();
          this.badges?.sync?.(this.activeTowers, this.economy.coins);
        },
        onDeselectTower: () => this.handleDeselectTower(),
        onZoomIn: () => this.cameraRig.zoomBy(1.25),
        onZoomOut: () => this.cameraRig.zoomBy(1 / 1.25),
        onZoomReset: () => this.cameraRig.reset(),
        onPowerup: (key) => this.handlePowerup(key),
        onClearFocus: () => this.setFocusFire(null),
      };
      this.hud.setZoomState(this.cameraRig.zoomState());
      // The first battle teaches three things; every battle after it gets the
      // camera hint instead. A coached run never shows both bars at once.
      // Havenbrook is the exception: its three lessons are spoken by the cast
      // and gated on the real action, so the hint bar would be a second voice.
      if (this.level?.tutorial) {
        this.coach = null;
      } else {
        this.coach = createCoach({ level: this.level });
        const coachStep = this.coach.start();
        if (coachStep) this.hud.showCoachStep(coachStep);
        else this.hud.showCameraHintOnce();
      }
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
      this.syncHUD();
    }

    // 3b. Blueprint Mode: the board arrives with towers already standing.
    this.placePreplacedTowers();
    this.syncContracts();
    // Paint the run's rule chips (the draft stack) before the first wave, so a
    // card taken in an earlier run can never linger in the HUD.
    this.refreshRunMods();

    // 3c. The opening scene. It runs on the real board with the real rules; the
    // only thing it takes away is the clock, so the villagers can talk.
    if (this.level?.tutorial) this.beginTutorial();

    // 4. Input Events — the rig is installed first, so it can tell the scene
    // whether a pointerup was a tap or the end of a pan/pinch.
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
    this.bindKeyboardShortcuts();

    this.events.once('shutdown', () => {
      // A quit during the opening must not leave the letterbox or a dimmed HUD
      // on the document after the scene is gone.
      this.endTutorialScene();
      this.hud?.hideFocus?.();
      window.removeEventListener('resize', this.onResizeFrame);
      window.removeEventListener('orientationchange', this.onResizeFrame);
      window.removeEventListener('hud-layout-change', this.onHudLayout);
      this.cameraRig?.destroy();
      this.badges?.clear();
      this.vfx?.destroy();
      this.pet?.destroy?.();
      this.pet = null;
      this.hero?.destroy?.();
      this.hero = null;
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
  /**
   * The band the battlefield may draw in, measured from the live HUD.
   *
   * `hudLayout` publishes the top bar's clearance and the forge's clearance as
   * custom properties on <html>, so the scene never has to guess a pixel value
   * — and the same numbers the CSS uses to place the pills are the numbers the
   * camera frames the board with.
   */
  measureBattleFrame({ force = false } = {}) {
    const scale = this.scale;
    const gameHeight = scale?.height || 768;
    const canvasHeight = scale?.displaySize?.height || window.innerHeight || 768;
    // The canvas is a FIT-scaled 1280x768 stage: one CSS pixel on screen is
    // `scaleFactor` game pixels, and the canvas itself may sit below the top of
    // the window. Both numbers are needed to turn a DOM rectangle into the
    // camera's coordinate space.
    const scaleFactor = canvasHeight > 0 ? canvasHeight / gameHeight : 1;
    const canvasTop = scale?.canvasBounds?.top || 0;
    const toGame = (cssY) => (cssY - canvasTop) / (scaleFactor || 1);

    const read = (name) => {
      const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
      return Number.isFinite(value) ? value : null;
    };
    // The HUD publishes its own clearance in CSS px, so the camera never guesses.
    const topbar = read('--topbar-clearance');
    const dock = read('--dock-clearance');
    const topBarBottom =
      topbar != null
        ? toGame(topbar)
        : toGame(document.getElementById('hud-top-bar')?.getBoundingClientRect?.().bottom ?? 0);
    const dockTop =
      dock != null
        ? toGame(canvasHeight + canvasTop - dock)
        : toGame(document.getElementById('hud-bottom-dock')?.getBoundingClientRect?.().top ?? canvasHeight);
    // The band is captured once per battle. The forge opens and folds while the
    // player is building, and every fold used to shorten or lengthen this band:
    // the rig re-fitted and the whole board changed size mid-fight. A battle
    // now keeps the frame it started with; only a real window resize (rotation,
    // fullscreen, a dragged page) re-measures it.
    if (!force && this.battleFrame) return this.battleFrame;
    this.battleFrame = battleFrame({ canvasHeight: gameHeight, topBarBottom, dockTop });
    return this.battleFrame;
  }

  /**
   * Publish how much empty canvas sits either side of the board.
   *
   * A 26×12 board fitted to the band is narrower than a 16:9 window, so the
   * game is letterboxed at fit zoom. That strip used to stay empty while the
   * Vanguard card sat on top of the battlefield's top-right corner. The scene
   * measures the board's screen rect and hands the right-hand gap to the HUD as
   * `--board-gutter-right`, which the stylesheet uses to shrink that card into
   * the gap. Only re-published on a re-frame, never per frame.
   */
  publishBoardGutter() {
    const cam = this.cameras?.main;
    const scale = this.scale;
    if (!cam || !scale || !this.map) return;
    const displayW = scale.displaySize?.width || window.innerWidth || 1280;
    const factor = displayW / (scale.width || 1280);
    const canvasLeft = scale.canvasBounds?.left || 0;
    const boardW = this.map.cols * TILE_SIZE;
    // `camera.worldView` and `getWorldPoint` are only refreshed during
    // preRender, so reading either right after `reset()` (boot, resize) measured
    // the *previous* view and the card never shrank. Scroll + zoom are the live
    // values: the camera's centre is `scrollX + width / 2` and the visible width
    // is `width / zoom`, so the left edge follows in one step.
    const viewLeft = cam.scrollX + cam.width / 2 - cam.width / (2 * cam.zoom);
    const left = (0 - viewLeft) * cam.zoom * factor + canvasLeft;
    const right = displayW - ((boardW - viewLeft) * cam.zoom * factor + canvasLeft);
    const root = document.documentElement;
    if (!root?.style) return;
    const gutter = Math.max(0, Math.round(right));
    root.style.setProperty('--board-gutter-right', `${gutter}px`);
  }

  /** Re-measure and re-fit after a rotation or a real window resize. */
  reframeBattlefield(force = false) {
    if (!this.cameraRig) return;
    const frame = this.measureBattleFrame({ force });
    const current = this.cameraRig.frame;
    // A few pixels are not a reason to reset the zoom. `setFrame()` re-fits and
    // re-centres, so a chip appearing in the top bar used to nudge the whole
    // board — the jump read as "the map got smaller". Only a real change (a
    // fold, a rotation, a fullscreen toggle) is worth the re-fit.
    if (
      current &&
      Math.abs(current.top - frame.top) <= 8 &&
      Math.abs(current.height - frame.height) <= 8
    ) {
      return;
    }
    this.cameraRig.setFrame(frame);
    this.publishBoardGutter();
  }

  /**
   * The river that splits the board, drawn as *moving* water.
   *
   * The rift row is the horizontal line between the enemy's ground and ours; a
   * still stripe of blue reads as a painted border, not as a river. One
   * TileSprite across the row is scrolled in `update()` — a single draw object,
   * so the animation costs a texture offset instead of a per-cell redraw.
   */
  createRiverFlow() {
    const river = this.map.riverRow;
    if (river == null) return null;
    const width = this.map.cols * TILE_SIZE;
    const height = TILE_SIZE;
    const x = width / 2;
    const y = river * TILE_SIZE + TILE_SIZE / 2;
    if (!this.textures?.exists?.('river-flow')) return null;
    const flow = this.add
      .tileSprite(x, y, width, height, 'river-flow')
      .setDepth(1)
      .setAlpha(0.42)
      .setBlendMode('ADD');
    // A second, slower sheet on top gives the water a cross-current instead of
    // one sliding wallpaper.
    const under = this.add
      .tileSprite(x, y, width, height, 'river-flow')
      .setDepth(1)
      .setAlpha(0.22)
      .setBlendMode('ADD')
      .setScale(1, -1);
    this.riverFlow = flow;
    this.riverUnder = under;
    return flow;
  }

  renderBattlefieldMap() {
    // The water layer is drawn first so every bridge deck lands on top of it.
    this.createRiverFlow();
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
    // Shorelines are drawn from this predicate, not from `isWater` alone. A
    // bridge is a lane laid *over* water, not a gap in it, so a water square
    // facing a bridge must keep its open edge instead of painting a beach where
    // the deck is. Without this the river visibly caps off at every crossing and
    // the deck reads as a hole in the water rather than as construction.
    const isWaterBed = (r, c) => isWater(r, c) || isBridge(r, c);
    const maskAt = (predicate, r, c) =>
      (predicate(r - 1, c) ? 1 : 0) |
      (predicate(r, c + 1) ? 2 : 0) |
      (predicate(r + 1, c) ? 4 : 0) |
      (predicate(r, c - 1) ? 8 : 0);


    // Contact shadows, drawn only at the top graphics profile: a soft pool of
    // dark under every prop, which is what makes a flat tile read as ground
    // with things standing on it. Painted once into the static board (depth
    // between the ground and the props), so it costs nothing per frame — and
    // never allocated at all on balanced or performance.
    const propShadows =
      (window.gameQuality?.detailLevel ?? 1) >= 1 ? this.add.graphics().setDepth(1.5) : null;
    const addPropShadow = (px, py, width, height) => {
      if (!propShadows) return;
      propShadows.fillStyle(0x05070c, 0.26);
      propShadows.fillEllipse(px, py, width, height);
    };

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
          // The road is built, not grown: one paving material per biome, laid
          // over whatever the ground happens to be. `themed(key, null)` resolves
          // to the level theme, so each battlefield paves with the palette that
          // scripts/terrain.py tuned and tests/terrain-contrast.test.js audits
          // against its own ground; the endless field passes a per-cell biome.
          const mask = maskAt(isLane, r, c);
          const key = themed(`tile-road-${mask}`, themeId) || themed('tile-road-15', themeId) || 'tile-road-15';
          if (isBridge(r, c)) {
            // A bridge is a lane laid *over* the river: the water keeps running
            // underneath and the deck is its own sprite, so the crossing reads
            // as construction instead of a dry patch of water.
            const underMask = maskAt(isWaterBed, r, c);
            const under =
              themed(`tile-water-${underMask}`, RIVER_THEME) || themed('tile-water', RIVER_THEME);
            if (under) {
              this.add.image(cx, cy, under).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
            }
            // The deck art is authored north-south (planks as rungs, parapets
            // left and right). Rotate a quarter turn when the water runs
            // north-south instead, i.e. when the lane itself runs east-west.
            const waterRunsEastWest = isWater(r, c - 1) && isWater(r, c + 1);
            const deckKey = themed('tile-bridge', themeId);
            if (deckKey) {
              const deck = this.add
                .image(cx, cy, deckKey)
                .setDisplaySize(TILE_SIZE, TILE_SIZE)
                .setDepth(2);
              if (!waterRunsEastWest) deck.setAngle(90);
            } else {
              // No bridge art for this biome (a data edit, not a crash): fall
              // back to a narrow painted causeway so the route stays readable.
              const deck = this.add.image(cx, cy, key).setDepth(2);
              if (waterRunsEastWest) deck.setDisplaySize(TILE_SIZE * 0.62, TILE_SIZE);
              else deck.setDisplaySize(TILE_SIZE, TILE_SIZE * 0.62);
              tilesGraphics.lineStyle(3, 0x3b2413, 0.95);
              const half = TILE_SIZE * 0.31;
              const rails = waterRunsEastWest
                ? [
                    [cx - half, y, cx - half, y + TILE_SIZE],
                    [cx + half, y, cx + half, y + TILE_SIZE],
                  ]
                : [
                    [x, cy - half, x + TILE_SIZE, cy - half],
                    [x, cy + half, x + TILE_SIZE, cy + half],
                  ];
              for (const [x1, y1, x2, y2] of rails) tilesGraphics.lineBetween(x1, y1, x2, y2);
            }
          } else {
            this.add.image(cx, cy, key).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
            // Two lanes often share neighbouring rows in the enemy half, and
            // without a joint the two roads merge into one wide band — the fork
            // the player is meant to read (one wave per lane) disappears. The
            // seam is drawn only where BOTH rows continue sideways, so corners,
            // junctions and single roads stay clean; the rows are painted top to
            // bottom, so the seam lands on the lower row's top edge and covers
            // nothing that comes after it.
            const sideways = (rr, cc) => isLane(rr, cc - 1) || isLane(rr, cc + 1);
            if (isLane(r - 1, c) && sideways(r, c) && sideways(r - 1, c)) {
              tilesGraphics.fillStyle(0x000000, 0.34);
              tilesGraphics.fillRect(x, y, TILE_SIZE, 3);
              tilesGraphics.fillStyle(0xffffff, 0.07);
              tilesGraphics.fillRect(x, y + 3, TILE_SIZE, 1);
            }
          }
        } else if (type === TILE.WATER) {
          const mask = maskAt(isWaterBed, r, c);
          // The river row is the board's divider, and the brief is explicit: it
          // is water on every map. Themed water still paints the ponds (a
          // caldera pool is magma, a glacier hole is navy meltwater), but the
          // line that splits the battlefield always asks for the neutral river
          // set, so nobody reads the divide as a lava flow. `null` would fall
          // back to the level theme, hence the explicit id.
          const waterTheme = r === this.map.riverRow ? RIVER_THEME : themeId;
          const key = themed(`tile-water-${mask}`, waterTheme) || themed('tile-water', waterTheme);
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
            addPropShadow(cx + jx, cy + jy + TILE_SIZE * 0.3, TILE_SIZE * 0.6, TILE_SIZE * 0.19);
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
            addPropShadow(cx + jx, cy + jy + TILE_SIZE * 0.24, TILE_SIZE * 0.42, TILE_SIZE * 0.14);
          }
        }
      }
    }

    // Arena halves. The top of the field belongs to the horde and the bottom
    // is the player's courtyard; the rift between them is the seam. Two flat
    // washes plus one glowing line, painted once per board, not per frame.
    const riftY = (this.map.tiles.findIndex((row) => row.every((t) => t === TILE.WATER))) * TILE_SIZE;
    if (riftY >= 0) {
      tilesGraphics.fillStyle(0x2c0f63, 0.24);
      tilesGraphics.fillRect(0, 0, this.map.cols * TILE_SIZE, riftY);
      tilesGraphics.fillStyle(0x0a1b2e, 0.12);
      tilesGraphics.fillRect(
        0,
        riftY + TILE_SIZE,
        this.map.cols * TILE_SIZE,
        (this.map.rows - 1) * TILE_SIZE - riftY
      );
      tilesGraphics.fillStyle(0x8b5cff, 0.16);
      tilesGraphics.fillRect(0, riftY - 2, this.map.cols * TILE_SIZE, 3);
      tilesGraphics.fillStyle(0x8b5cff, 0.1);
      tilesGraphics.fillRect(0, riftY + TILE_SIZE - 1, this.map.cols * TILE_SIZE, 3);
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

  /**
   * Weather + light for this battle, rebuilt whenever the profile changes.
   *
   * Separated from `create()` because the auto profile can demote mid-battle:
   * the settled screen must then lose its atmosphere instead of keeping motes
   * the device just said it could not afford.
   */
  mountAtmosphere() {
    const quality = window.gameQuality;
    this.atmosphere?.destroy?.();
    this.atmosphere = null;
    const density = quality?.weatherDensity ?? 1;
    applyAtmosphereSkin(document, this.theme);
    if (density > 0) {
      this.atmosphere = buildAtmosphere(this, {
        theme: this.theme,
        map: this.map,
        density,
        tileSize: TILE_SIZE,
      });
    }
    // One listener for the whole battle, even if `mountAtmosphere` runs twice
    // (auto-degrade calls it again after the first mount already registered).
    if (!this._atmosphereShutdown) {
      this._atmosphereShutdown = () => {
        this.atmosphere?.destroy?.();
        this.atmosphere = null;
        clearAtmosphereSkin(document);
      };
      this.events.once('shutdown', this._atmosphereShutdown);
    }
  }

  createPortalAndBase() {
    const { spawn, base } = this.map;

    /* ---------------------------------------------------------- the portals */
    // Every ground portal is its own set piece: a carved gate arch, an animated
    // vortex sheet playing inside it (`portal-vortex`, generated from the CC0
    // Kenney particle art), a ground sigil that turns under the arch, and a
    // light pool on the tiles. A base-defence board has three of them, and the
    // player has to see all three at once — being attacked from three
    // directions is the layout, not a detail of it.
    const spawns = Array.isArray(this.map.spawns) && this.map.spawns.length
      ? this.map.spawns
      : [spawn];
    const middleIndex = Math.floor((spawns.length - 1) / 2);
    this.portalSprites = [];
    this.portalGlows = [];
    spawns.forEach((mouth, index) => {
      const spawnX = mouth.col * TILE_SIZE + TILE_SIZE / 2;
      const spawnY = mouth.row * TILE_SIZE + TILE_SIZE / 2;
      // The middle gate is the tallest; the flanking ones sit a little smaller,
      // so the field reads as one main approach with two side ones.
      const scale = index === middleIndex ? 1 : 0.86;

      const floor = this.add
        .image(spawnX, spawnY + 6, 'fx-rune')
        .setDepth(6)
        .setScale(1.5 * scale)
        .setAlpha(0.5)
        .setTint(this.theme?.portalTint ?? 0xb07bff)
        .setBlendMode('ADD');
      this.tweens.add({ targets: floor, angle: 360, duration: 24000, repeat: -1 });
      this.tweens.add({
        targets: floor,
        alpha: { from: 0.35, to: 0.6 },
        duration: 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // The stone keeps its own warm colour — only the magic inside it is
      // tinted, which is what makes a purple gate in a green field read as an
      // intruder.
      const arch = this.add
        .image(spawnX, spawnY + 35 * scale, 'portal-arch')
        .setOrigin(0.5, 0.8)
        .setDepth(10)
        .setScale(0.48 * scale);

      let vortex;
      if (this.anims?.exists?.(PORTAL_ANIM)) {
        vortex = this.add
          .sprite(spawnX, spawnY - 4, 'portal-vortex')
          .setDepth(11)
          .setScale(0.52 * scale)
          .setBlendMode('ADD')
          .play(PORTAL_ANIM);
      } else {
        // Fallback: the old procedural texture, so a failed atlas load is a
        // smaller portal, never a missing one.
        vortex = this.add.image(spawnX, spawnY, 'portal').setDepth(11);
      }

      const glow = this.add
        .image(spawnX, spawnY + 14, 'fx-glow')
        .setDepth(9)
        .setScale(1.5 * scale)
        .setAlpha(0.28)
        .setTint(this.theme?.portalTint ?? 0xb07bff)
        .setBlendMode('ADD');
      this.tweens.add({
        targets: glow,
        scale: { from: 1.35 * scale, to: 1.65 * scale },
        alpha: { from: 0.22, to: 0.36 },
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.portalSprites.push(vortex);
      this.portalGlows.push(glow);
      if (index === 0) {
        this.portalFloor = floor;
        this.portalArch = arch;
        this.portalVortex = vortex;
        this.portalSprite = vortex;
        this.portalGlow = glow;
      }
    });

    // Sky gates: the openings cut into the side walls. Colder and smaller than
    // a ground portal, because nothing walks out of them — the flyers do.
    this.skyGates = (this.map.airGates || []).map((gate) => {
      const gx = gate.col <= 0 ? TILE_SIZE * 0.55 : this.map.cols * TILE_SIZE - TILE_SIZE * 0.55;
      const gy = gate.row * TILE_SIZE + TILE_SIZE / 2;
      const arch = this.add
        .image(gx, gy, 'portal-arch')
        .setOrigin(0.5, 0.8)
        .setDepth(10)
        .setScale(0.3)
        .setTint(0x9fc7ff)
        .setAlpha(0.95);
      const glow = this.add
        .image(gx, gy + 8, 'fx-glow')
        .setDepth(9)
        .setScale(0.9)
        .setAlpha(0.22)
        .setBlendMode('ADD')
        .setTint(0xa9d6ff);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.16, to: 0.3 },
        duration: 2100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return { arch, glow };
    });

    /* --------------------------------------------------------- the bastion */
    // The bastion is a keep, not a crystal on a plate: a painted fortress with
    // a glowing core in the gate, a shield ring that flares when it is hit, and
    // a health bar that lives in the world above the battlements.
    const baseX = base.col * TILE_SIZE + TILE_SIZE / 2;
    const baseY = base.row * TILE_SIZE + TILE_SIZE / 2;

    // The keep stands ON the bastion tile with its foot at the top of the
    // bottom margin row, so the two rows of grass and rock under it stay visible
    // — the brief asks for the keep at the very bottom *with a margin*, and a
    // keep anchored at the tile centre ate that margin with its own base.
    const keepScale = 0.44;
    // The foot lands *on* the bastion tile, not on a plinth below it.
    const keepFoot = baseY + TILE_SIZE * 0.55;

    // The keep is a hand-drawn fortress (OpenGameArt "Fortress", CC0,
    // rasterised from vector at 420 px). 0.44 → ~185 px wide: three tiles,
    // which still reads as the place being defended without towering over the
    // courtyard it stands in (0.54 was 227 px and swallowed two lanes).
    // The sheet is padded by a tenth of its height on every side, and the
    // builder paints the contact shadow *into* that bottom padding. Anchored at
    // origin 1 the whole padded texture sat on the ground, which left the walls
    // floating a shadow's width above the grass — the "lumulutang" read. Origin
    // 0.9 puts the building's own foot exactly on the ground line, with the
    // painted shadow falling onto the tiles in front of it.
    this.bastionKeep = this.add
      .image(baseX, keepFoot, ARENA_ART.bastion.key)
      .setOrigin(0.5, 1 - KEEP_PAD_RATIO)
      .setDepth(12)
      .setScale(keepScale);
    if (this.theme?.baseTint) this.bastionKeep.setTint(this.theme.baseTint);

    // The core crystal stays the "heart" of the keep: every existing reaction
    // (flash, pulse, shatter) targets it, so the new art inherits the juice.
    // The heart of the city: a floating core right at the gate, small enough to
    // read as a beacon on the building instead of a stone in front of it.
    this.baseCrystal = this.add
      .image(baseX, baseY + TILE_SIZE * 0.3, 'base-crystal')
      .setDepth(13)
      .setScale(0.46);
    if (this.theme?.baseTint) this.baseCrystal.setTint(this.theme.baseTint);

    this.tweens.add({
      targets: this.baseCrystal,
      y: baseY + TILE_SIZE * 0.2,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Shield ring: a single circle that is only re-drawn when the bastion is
    // hit or healed, never per frame.
    this.bastionShield = this.add
      .graphics()
      .setDepth(11)
      .setBlendMode('ADD');
    // The repaint guard is keyed on the HP string, and the scene instance is
    // reused across battles: without this reset a fresh bar would be skipped
    // whenever the next stage happens to start on the same HP (25/25), leaving
    // the world bar invisible for the whole battle.
    this.bastionBarShown = null;
    this.bastionBar = this.add.graphics().setDepth(24);
    // Anchor the bar above the *battlements*, not above the texture. The PNG is
    // the fortress plus a tenth of its height of transparent padding on each
    // side (scripts/build_arena_art.sh adds it for the contact shadow), so the
    // texture's top edge is empty air — anchoring to it floated the bar up into
    // the river. `KEEP_PAD_RATIO` is that padding as a fraction of the sheet.
    const keepTop = this.bastionKeep.getBounds().top;
    const keepVisibleTop = keepTop + this.bastionKeep.displayHeight * KEEP_PAD_RATIO;
    this.bastionBarY = keepVisibleTop - 20;
    this.bastionBarLabel = this.add
      .text(baseX, this.bastionBarY - 4, '', {
        fontFamily: 'Rajdhani, "Segoe UI", sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#f4f8ff',
        stroke: '#05070c',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(24);

    // Courtyard apron: the keep used to stand straight on the grass, which made
    // it read as a sticker on the field rather than a place being defended. A
    // soft two-tone ellipse under it (depth 5: above the tiles, below every
    // prop, tower, creep and bar) settles the building without hiding a tile.
    // Purely decorative — the placement rules keep their own `BASE_CLEARANCE`
    // and `BASTION_APRON` numbers and never read this graphic.
    this.bastionApron = this.add.graphics().setDepth(5);
    this.bastionApron.setBlendMode('NORMAL');
    this.bastionApron.fillStyle(0x0b1220, 0.16);
    this.bastionApron.fillEllipse(baseX, keepFoot - 6, TILE_SIZE * 4.6, TILE_SIZE * 1.5);
    this.bastionApron.fillStyle(Number.parseInt(String(this.theme?.accent || '#8fd694').replace('#', ''), 16), 0.09);
    this.bastionApron.fillEllipse(baseX, keepFoot - 10, TILE_SIZE * 3.5, TILE_SIZE * 1.05);
    this.bastionApron.lineStyle(1, 0xf0d9a8, 0.18);
    this.bastionApron.strokeEllipse(baseX, keepFoot - 6, TILE_SIZE * 4.6, TILE_SIZE * 1.5);

    this.bastionHome = { y: baseY - 4, tint: this.theme?.baseTint ?? 0xffffff };
    this.bastionPulse = null;
    this.bastionState = bastionState(this.gameState?.baseHealth, this.gameState?.maxBaseHealth);
    this.syncBastionBar();
  }

  /** World-space bastion health bar. Repainted only when the number moves. */
  syncBastionBar() {
    const bar = this.bastionBar;
    if (!bar?.clear) return;
    const hp = Math.max(0, this.gameState?.baseHealth ?? 0);
    const max = Math.max(1, this.gameState?.maxBaseHealth ?? 1);
    // The bar is a graphics repaint, so it is skipped unless the number moved.
    if (this.bastionBarShown === `${hp}/${max}`) return;
    this.bastionBarShown = `${hp}/${max}`;
    const ratio = Math.max(0, Math.min(1, hp / max));
    const width = TILE_SIZE * 3.1;
    const height = 10;
    const x = this.map.base.col * TILE_SIZE + TILE_SIZE / 2 - width / 2;
    const y = this.bastionBarY ?? this.map.base.row * TILE_SIZE - TILE_SIZE * 3.12;
    const state = bastionState(hp, max);
    const fill = state === 'critical' ? 0xff5a5a : state === 'warning' ? 0xffb648 : 0x67e8a6;

    bar.clear();
    bar.fillStyle(0x05070c, 0.78);
    bar.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
    bar.lineStyle(1.5, 0xc99834, 0.85);
    bar.strokeRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
    bar.fillStyle(fill, 1);
    bar.fillRoundedRect(x, y, Math.max(2, width * ratio), height, 4);
    // Notches every 25 % so the player can read the bar at a glance.
    bar.lineStyle(1, 0x05070c, 0.55);
    for (let i = 1; i < 4; i += 1) {
      const nx = x + (width / 4) * i;
      bar.lineBetween(nx, y + 1, nx, y + height - 1);
    }
    if (this.bastionBarLabel) {
      this.bastionBarLabel.setText(`${hp} / ${max}`);
      this.bastionBarLabel.setColor(state === 'critical' ? '#ff9a9a' : state === 'warning' ? '#ffd08a' : '#eaf7ff');
    }
    this.bastionShield?.clear?.();
    if (this.bastionShield) {
      this.bastionShield.lineStyle(3, fill, state === 'critical' ? 0.16 : 0.09);
      this.bastionShield.strokeCircle(
        this.map.base.col * TILE_SIZE + TILE_SIZE / 2,
        this.map.base.row * TILE_SIZE + TILE_SIZE / 2 + TILE_SIZE * 0.2,
        TILE_SIZE * 0.86
      );
    }
    this.bastionState = state;
    return ratio;
  }

  /**
   * Where the keep is, in world pixels.
   *
   * One definition, used by the creeps' assault ring, by every defence that
   * guards the gate, and by the leak effects — so the art, the hitbox and the
   * range check can never drift apart.
   *
   * @returns {{x: number, y: number}}
   */
  bastionPoint() {
    // Built once per scene: every defence asks for this on every frame, and the
    // keep does not move. Callers only read it.
    if (!this.bastionPointCache) {
      this.bastionPointCache = {
        x: this.map.base.col * TILE_SIZE + TILE_SIZE / 2,
        y: this.map.base.row * TILE_SIZE + TILE_SIZE / 2,
      };
    }
    return this.bastionPointCache;
  }

  /**
   * A creep reached the gates: the crystal takes the hit *visibly*.
   *
   * The camera shake that already existed stays, but its strength now follows
   * the share of the bar the hit removed, and the crystal itself flashes and
   * punches. Everything is a short tween with a fixed duration — no per-frame
   * work, no accumulation, so a burst of leaks cannot stack twenty loops.
   */
  flashBastion(leak) {
    const crystal = this.baseCrystal;
    if (!crystal) return;
    const intensity = leakIntensity(leak, this.gameState?.maxBaseHealth);
    this.tweens?.add?.({
      targets: crystal,
      scaleX: { from: 1 + 0.22 * intensity, to: 1 },
      scaleY: { from: 1 + 0.22 * intensity, to: 1 },
      duration: 260,
      ease: 'Quad.easeOut',
    });
    crystal.setTint?.(0xff6b6b);
    this.time?.delayedCall?.(190, () => {
      if (crystal.active) crystal.setTint?.(this.bastionHome?.tint ?? 0xffffff);
    });
    this.syncBastionPulse();
  }

  /**
   * Keep—or stop—the low-integrity pulse.
   *
   * One looping alpha tween at a time: the handle is kept so a heal, a restart
   * or a defeat can stop it instead of leaving a dead sprite pulsing forever.
   */
  syncBastionPulse() {
    const state = bastionState(this.gameState?.baseHealth, this.gameState?.maxBaseHealth);
    this.bastionState = state;
    const wants = isBastionCritical(state) && !this.gameState?.isOver();
    if (!wants) {
      this.bastionPulse?.stop?.();
      this.bastionPulse?.remove?.();
      this.bastionPulse = null;
      if (this.baseCrystal?.active) {
        this.baseCrystal.setAlpha?.(1);
        if (state !== BASTION_STATE.FALLEN) this.baseCrystal.setTint?.(this.bastionHome?.tint ?? 0xffffff);
      }
      return;
    }
    if (this.bastionPulse) return;
    this.bastionPulse = this.tweens?.add?.({
      targets: this.baseCrystal,
      alpha: { from: 1, to: 0.45 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Defeat: the bastion goes dark, then dark again (idempotent by design). */
  shatterBastion() {
    this.bastionPulse?.stop?.();
    this.bastionPulse?.remove?.();
    this.bastionPulse = null;
    const crystal = this.baseCrystal;
    if (!crystal) return;
    crystal.setTint?.(0x40455a);
    this.tweens?.add?.({
      targets: crystal,
      alpha: { from: 1, to: 0.28 },
      scaleX: { from: 1.16, to: 0.86 },
      scaleY: { from: 1.16, to: 0.86 },
      duration: 620,
      ease: 'Cubic.easeOut',
    });
  }

  /** Victory: the crystal holds its colour and gives one bright flare. */
  flareBastion() {
    const crystal = this.baseCrystal;
    if (!crystal) return;
    crystal.setTint?.(this.bastionHome?.tint ?? 0xffffff);
    this.tweens?.add?.({
      targets: crystal,
      scaleX: { from: 1, to: 1.14 },
      scaleY: { from: 1, to: 1.14 },
      duration: 420,
      yoyo: true,
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
    // The level's own ramp and the preset fold into one multiplier, so every
    // spawn path (wave, boss, summon, escort) takes the preset with it.
    const base = (this.level.enemyHealthScale || 1) * (this.difficulty?.healthScale ?? 1);
    // Draft cards raise the horde as well as the towers — that trade is the
    // whole point of Rogue Siege, so it is applied to both ramps.
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
   * Which lane a wave opens on.
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

  /**
   * The portal plan for one wave: how many gates it may use and which ones.
   *
   * Cached per wave ordinal because it is read on every spawn, and memoised by
   * ordinal alone — the same wave in the same stage always resolves the same
   * way, which is what keeps a duel and a replay deterministic.
   */
  gatePlanFor(waveNumber, gateCount) {
    const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    const lanes = Math.max(1, Math.floor(Number(gateCount) || 1));
    const cache = this.gatePlanCache || (this.gatePlanCache = new Map());
    const key = `${wave}:${lanes}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const plan = waveGatePlan({
      waveNumber: wave,
      totalWaves: this.waveManager?.totalWaves ?? this.level?.waves?.length ?? 0,
      endless: Boolean(this.waveManager?.endless),
      laneCount: lanes,
    });
    // Keep the newest entry only: waves move forward, so a two-entry cache is
    // enough and the map can never grow with the run.
    if (cache.size > 3) cache.clear();
    cache.set(key, plan);
    return plan;
  }

  /** Gate plan for the ground lanes — what the entrance hint paints. */
  currentGatePlan() {
    const manager = this.waveManager;
    const pending = manager && manager.state === WAVE_STATE.IDLE ? manager.waveNumber + 1 : manager?.waveNumber || 1;
    return this.gatePlanFor(Math.max(1, pending), this.pathfinding?.laneCount || 0);
  }

  spawnEnemy(typeKey, waveNumber, gateOverride = null) {
    // Every spawn of a wave — including a boss and the minions it summons —
    // joins the same lane, and the choice is the wave ordinal, never random, so
    // both duel seats send the same horde down the same road.
    // Ground creeps walk the road lanes; flyers take the sky lane for the same
    // wave ordinal, so a wave of wraiths arrives on the flank the ground wave
    // is *not* using and a dock of ground-only guns cannot cover both by
    // accident.
    const flies = Boolean(ENEMY_TYPES[typeKey]?.flying);
    // One wave, one road — until the stage is deep enough to open the board up.
    // `gateIndexForSpawn` deals the wave's enemies out across the gates the wave
    // owns, and a wave that owns a single gate sends every one of them down the
    // same road (wave 1 → road 0, wave 2 → road 1, …). The plan is a pure
    // function of the wave ordinal, so both duel seats and a replay produce
    // byte-identical spawns.
    const gateCount = flies
      ? Math.max(1, this.airRoutes?.laneCount || 0)
      : Math.max(1, this.pathfinding?.laneCount || 0);
    const plan = this.gatePlanFor(waveNumber, gateCount);
    // The index of this enemy *within its wave*. Boss summons spawn outside the
    // wave queue, so they reuse the current index — which keeps a summon on the
    // gate its boss walked out of instead of teleporting it to another road.
    const tick = Math.max(0, (this.waveManager?.spawnedThisWave || 1) - 1);
    // `null` must stay "no override": `Number(null)` is 0, which would quietly
    // pin every wave in the game to the first gate.
    const overrideRaw = gateOverride === null || gateOverride === undefined ? null : Number(gateOverride);
    const override = Number.isFinite(overrideRaw) ? Math.floor(overrideRaw) : null;
    const slot = override === null || override < 0 || override >= gateCount
      ? gateIndexForSpawn(tick, waveNumber, gateCount, plan.gates)
      : override;
    const lane = flies
      ? (this.airRoutes?.laneAt(slot)?.length ? this.airRoutes.laneAt(slot) : this.pathfinding.laneAt(slot))
      : this.pathfinding.laneAt(slot);

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
        // Request 44: a recorded boss horn under the warning, and the score
        // switches to the boss theme for as long as the boss is on the board.
        audio.playBossEnter();
        this.updateBattleMusic();
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
      getStructureAt: (cellKey) => this.getSiegeTarget(cellKey),
      // Defences first: the horde breaks what it can reach before it
      // touches the gate (see getDefenceInReach).
      getDefenceInReach: (enemy) => this.getDefenceInReach(enemy),
      onStructureHit: (structure, damage) => this.damageStructure(structure, damage),
      onSpeedAura: (boss, radius, multiplier, durationMs) =>
        this.handleBossSpeedAura(boss, radius, multiplier, durationMs),
      onDisableTowers: (boss, radius, durationMs) =>
        this.handleBossDisableTowers(boss, radius, durationMs),
      // The bastion is a target, not a doorway: creeps stop on a ring around it
      // and lay siege (see Enemy.updateBaseAssault). The scene owns the point,
      // so the art and the hitbox can never disagree.
      getBasePoint: () => this.bastionPoint(),
      onHitBase: (e, damage) => this.handleEnemyHitBase(e, damage),
      onSummonMinions: (typeKey, count, summoner) => {
        // The boss's own gate, so its brood files out behind it instead of
        // stepping out of a portal on the other side of the board.
        const summonGate = Number.isFinite(summoner?.gateSlot) ? summoner.gateSlot : null;
        for (let k = 0; k < count; k++) {
          // Timers fire from Phaser's UPDATE event, outside update()'s guard —
          // so contain this spawn too rather than risk killing the game loop.
          this.time.delayedCall(k * 320, () => {
            try {
              if (!this.gameState.isOver()) {
                this.spawnEnemy(typeKey, this.waveManager.waveNumber, summonGate);
              }
            } catch (error) {
              this.reportRuntimeError(error);
            }
          });
        }
      },
    }, { ...this.spawnScaling(waveNumber, typeKey), theme: this.theme?.id || this.level.theme });
    // Remember the mouth it came from: a boss that summons minions sends them
    // out of its own gate, not one three roads away.
    enemy.gateSlot = slot;
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
    // The caller (and the probe harness) gets the body it just created, so a
    // summon or a test can read the gate it walked out of.
    return enemy;
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

  /**
   * A creep landed a swing on the bastion.
   *
   * This is the single door through which base damage passes: the enemy never
   * touches `gameState.baseHealth` itself, and the world bar, the HUD, the
   * crystal flash and the defeat check are all driven from here. Called on
   * every swing (roughly every 1.5 s per attacker), never per frame.
   */
  handleEnemyHitBase(enemy, amount = 1) {
    if (this.gameState.isOver()) return;
    const damage = Math.max(1, Math.round((Number(amount) || 1) * (this.difficulty?.damageScale ?? 1)));
    const destroyed = this.gameState.damageBase(damage);
    // The bastion just lost health: re-read the danger threshold. This is the
    // only event that can cross it downward, so it is the only place the
    // intense bed needs to be considered.
    this.updateBattleMusic();
    this.gameState.counters.baseHits = (this.gameState.counters.baseHits || 0) + 1;
    this.leaksThisWave = (this.leaksThisWave || 0) + 1;

    // The gate answers: a short shake scaled to the share of the bar lost, a
    // spark burst at the wall, and the crystal's punch.
    const intensity = leakIntensity(damage, this.gameState.maxBaseHealth);
    this.cameras?.main?.shake?.(90 + 90 * intensity, 0.002 + 0.006 * intensity);
    this.flashBastion(damage);
    this.syncBastionBar();
    this.spawnDeathBurst?.(
      this.map.base.col * TILE_SIZE + TILE_SIZE / 2,
      this.map.base.row * TILE_SIZE + TILE_SIZE * 0.2,
      1
    );
    audio.playEnemyHit?.();

    if (this.combo.chain > 0) {
      resetCombo(this.combo);
      this.hud?.hideCombo();
    }
    if (destroyed) this.handleGameOver();
    this.syncHUD();
  }

  handleEnemyReachedBase(enemy) {
    audio.playDefeat();
    this.cameras.main.shake(160, 0.007);
    // A leak breaks the chain: the combo is a reward for clean clearing.
    if (this.combo.chain > 0) {
      resetCombo(this.combo);
      this.hud?.hideCombo();
    }
    const leak = Math.max(1, Math.round(enemy.baseDamage * (this.difficulty?.damageScale ?? 1)));
    const destroyed = this.gameState.damageBase(leak);
    // The hit lands on the crystal itself, not just on the number in the bar.
    this.flashBastion(leak);
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

  /**
   * Pick the music state from the battle that is actually happening.
   *
   * Request 44 asks for a score that reacts to real conditions, and the three
   * conditions that matter are already in the scene: whether a boss is on the
   * board, how much of the bastion is left, and whether the wave clock has
   * started. No new counters — `gameState.baseHealth` and `bossRoster` are the
   * same numbers the HUD and the boss strip read, so music can never disagree
   * with the health bar.
   *
   * Idempotent: `setScene` is a no-op for the state already playing, so calling
   * this on every hit costs nothing and never restarts the track.
   */
  updateBattleMusic() {
    if (this.gameState?.isOver?.()) return;
    if (this.lastResult) return;
    const maxBase = Math.max(1, this.gameState?.maxBaseHealth || 1);
    const ratio = (this.gameState?.baseHealth ?? maxBase) / maxBase;
    const bossAlive =
      (this.activeEnemies || []).some((enemy) => enemy?.isBoss && !enemy.isDead && !enemy.reachedBase) ||
      Boolean(this.activeBoss && !this.activeBoss.isDead);

    // A cleared wave on a level that waits for the player is a build phase, so
    // the calm bed comes back. With auto-waves the gap is only ~2.5 s and the
    // next wave starts by itself: crossfading out and straight back in would be
    // worse than letting the battle bed run, so that case stays on 'battle'.
    const waiting =
      (this.waveManager?.state === 'idle' || this.waveManager?.state === 'finished') &&
      (this.activeEnemies?.length || 0) === 0 &&
      !(this.autoWavesEnabled?.() ?? false);

    let mood;
    if (bossAlive) mood = 'boss';
    else if (ratio <= 0.35) mood = 'intense';
    else if ((this.waveManager?.waveNumber || 0) === 0 || waiting) mood = 'prep';
    else mood = 'battle';

    if (mood === this.battleMood) return;
    this.battleMood = mood;
    audioDirector.setScene(mood);
  }

  handleEnemyDefeated(enemy) {
    if (enemy?.isBoss) this.updateBattleMusic();
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
    audio.playEnemyDeath();
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

  /**
   * Does this run open its waves on a clock?
   *
   * A duel paces both seats itself (`tickDuelPacing`) and a puzzle is a fixed
   * board. A level may also switch the clock off with `rules.autoWaves === false`.
   */
  autoWavesEnabled() {
    if (this.level?.pvp) return false;
    if (this.level?.rules?.autoWaves === false) return false;
    return true;
  }

  /**
   * Advance the preparation countdown by one simulation step.
   *
   * Called from `stepSimulation`, so a paused game, an open draft card or a
   * finished match never ticks it — there is no second timer anywhere, and no
   * scene timer to leak. The window only opens when the wave manager says the
   * next wave is legal (`canStartNextWave`), so a countdown that runs out while
   * the horde is still on the road simply waits.
   */
  tickWavePrep(deltaMs) {
    const prep = this.wavePrep;
    if (!prep?.active) return;
    const next = advanceWavePrep(prep, deltaMs, {
      canStart: this.waveManager.canStartNextWave(),
      over: this.gameState.isOver(),
    });
    if (next.open) {
      this.prepSecond = null;
      this.openWave();
      return;
    }
    // Repaint the countdown once per displayed second, not once per frame.
    const second = Math.ceil(prep.remainingMs / 1000);
    if (second !== this.prepSecond) {
      this.prepSecond = second;
      this.hud?.updatePrepClock?.(prep.remainingMs);
    }
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
    // The opening owns the clock: the horde is called by the player at the step
    // that asks for it, and never before. Without this a tap on START WAVE
    // during the story would walk a raid into the middle of a sentence.
    if (this.level?.tutorial && this.tutorialDirector && !this.tutorialDirector.finished) {
      if (this.tutorialDirector.beat?.event !== 'wave') {
        this.hud?.showToast('THE VILLAGE IS STILL TALKING — LISTEN FIRST', 'info');
        return;
      }
    }
    // The wave's rule is settled *before* the first creep walks, so the banner,
    // the HUD chips and the horde can never disagree about it.
    this.beginWaveRules(this.waveManager.waveNumber + 1);
    this.autoWaveDelay = 0;
    audio.playWaveStart();
    const started = this.waveManager.startNextWave();
    if (started) {
      // Leaving the build phase: the restrained bed gives way to the battle one.
      // This has to run *after* the counter moves — reading it before the call
      // reported wave 0 and left the whole first wave on the preparation bed.
      this.updateBattleMusic();
      // The window is spent. Cancelling here (rather than when it closes) means
      // a manual early call and the clock can never both open the same wave.
      cancelWavePrep(this.wavePrep);
      this.prepSecond = null;
      startNewWave(this.combo);
      const wave = this.waveManager.waveNumber;
      // The whole wave walks one lane, so say it out loud and move the beacon.
      this.setWaveLane(wave);
      // One toast, not two: `showToast` replaces the banner, so a second call
      // would bury the wave name under the lane hint.
      const rule = this.activeAnomaly ? ` · ${this.activeAnomaly.name}` : '';
      this.hud?.showToast(
        `Wave ${wave}: ${this.waveManager.currentWave.name} · ⚑ ${this.gateLabel()}${rule}`,
        'info'
      );
      if (this.hero?.isDown) {
        this.hero.revive();
        this.hud?.showToast('VANGUARD BACK ON ITS FEET', 'success');
      }
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
    this.advanceCoach('wave');
    this.tutorialReport('wave');
  }


  /* ==================================================== RUN RULES (MODES) */

  /**
   * The effective rule bag: the run's permanent picks, i.e. the draft stack.
   *
   * Everything downstream (tower auras, the HUD chips, horde scaling) reads
   * `runMods`, never `cardMods`, so a future temporary rule has one place to
   * live and can never leak into the next wave.
   */
  refreshRunMods() {
    this.runMods = this.cardMods;
    this.refreshTowerAuras();
    this.hud?.setRunStatus?.(this.runStatus());
    return this.runMods;
  }

  /**
   * Which *mode* this run is, in one word, or null for plain campaign/endless.
   *
   * Every surface that has to behave differently for a mode run — the result
   * card, the HUD chrome, the save path — asks this instead of re-deriving the
   * answer from several nullable fields.
   */
  runModeLabel() {
    if (this.level?.puzzle) return 'puzzle';
    if (this.level?.mode) return this.level.mode;
    if (this.level?.id === 'titan-rush') return 'titan';
    if (this.mode?.rogue) return 'rogue';
    if (this.mode?.coop) return 'coop';
    return null;
  }

  /** Everything the HUD needs to describe the run in one line. */
  runStatus() {
    return {
      mode: this.modeId || null,
      chips: summariseMods(this.runMods || this.cardMods).map((row) => row.label),
    };
  }

  /**
   * Settle the rules for the wave that is about to open.
   *
   * Runs before the first spawn so the banner, the HUD chip and the horde all
   * agree; also resets the once-per-wave guards (twin titan).
   */
  beginWaveRules(waveNumber) {
    this.twinBossSpawned = false;
    this.refreshRunMods();
    return this.runMods;
  }

  /** Wave cleared: pay the run's per-wave effects, then offer the next choice. */
  afterWaveCleared(event) {
    const heal = Number(this.runMods?.healPerWave) || 0;
    if (heal > 0) {
      this.gameState.healBase(heal);
      // Repairs can lift the bastion back over the danger line.
      this.updateBattleMusic();
    }
    this.refreshRunMods();
    this.syncContracts();
    if (this.mode?.rogue) this.openDraft(event.waveNumber);
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
    // A draft prompt still on screen would sit on top of the result card and
    // swallow its buttons.
    this.modePaused = false;
    window.gameDraft?.close?.();
    if (!this.gameState.isOver()) {
      this.gameState.end(outcome === 'victory' ? STATUS.VICTORY : STATUS.GAME_OVER);
    }
    this.hud?.hideBossBar();
    window.gameCodex?.hide?.();
    if (outcome === 'victory') audio.playVictory();
    const score = this.economy.score;
    const waves = this.waveManager?.wavesCompleted || 0;
    const record = this.progress?.recordEndless?.({ wave: waves, score }) || null;
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

  /* ================================================ DUEL CONTRACTS */

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
   * The contracts are the duel's (dealt from the room seed); paying on
   * completion instead of at the end means the gold arrives when it is needed
   * rather than after the match is already decided.
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
        getBasePoint: () => this.bastionPoint(),
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
    for (const sprite of this.portalSprites || [this.portalSprite]) sprite?.setTint?.(mixed);
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
      audio.playToggle?.();
    } else {
      this.gameState.pause();
      audio.playToggle?.();
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
      // Request 44: only on the branch that actually spent the gold — a refused
      // upgrade already played the error tone. A palisade latches; a tower sings.
      audio.playUpgrade(tower.isBarricade ? 'wall' : 'tower');
      this.trackStats({ upgradesBought: 1 });
      // Tower Master fires on the upgrade that tops the line out, not on the
      // first purchase: the stat is the finished tower, not the habit.
      if (tower.level >= MAX_LEVEL) this.trackStats({ maxedTowers: 1 });
      if (this.selectedTower === tower) {
        this.hud?.inspectTower(tower, this.anchorRatioFor(tower));
      }
      this.badges?.pulse(tower);
      this.refreshTowerAuras();
      this.syncHUD();
      this.updateGhostGraphics();
      this.advanceCoach('upgrade');
      // The opening's second lesson is "feed it coin" — reported only on the
      // branch that really spent the gold.
      this.tutorialReport('upgrade');
    }
  }

  handleSellTower(tower) {
    const refund = Math.round(tower.sellRefund * this.relicBonuses.sellRefund);
    this.economy.earn(refund);
    this.placement.release(tower.row, tower.col);
    // The road the keep was blocking is open again.
    this.refreshLanes?.();

    this.gameState.counters.towersSold++;

    const idx = this.activeTowers.indexOf(tower);
    if (idx !== -1) this.activeTowers.splice(idx, 1);
    tower.destroy();

    this.selectedTower = null;
    this.badges?.setSelected(null);
    // Removing a support tower must not leave stale buffs behind.
    this.refreshTowerAuras();
    this.syncHUD();
    this.drawBuildSlots();
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
    // Nothing on the board is clickable while the villagers are talking: a stray
    // tap during the opening must never buy a tower or dismiss a line.
    if (this.tutorialHold) return;
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

    // 0b. Frost Surge aims the same way: tap the stretch of road to freeze.
    if (this.pendingFrost) {
      this.pendingFrost = false;
      this.castFrost(worldX, worldY);
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
   * Put the Bastion Vanguard on the field.
   *
   * The hero belongs at the bastion gate — the cell in front of the keep, where
   * the horde stops to assault the wall. It used to spawn on the last road cell
   * before the core, which the tall keep painting now covers completely; the
   * gate cell keeps the Vanguard visible and inside the fight. The walk bounds
   * are the map minus half a tile, so a move order cannot put it off the board.
   */
  spawnHero() {
    if (!this.hero && this.add && this.map) {
      const gate = this.heroGateCell();
      const x = gate.col * TILE_SIZE + TILE_SIZE / 2;
      const y = gate.row * TILE_SIZE + TILE_SIZE / 2;
      this.hero = new Hero(this, {
        x,
        y,
        // The roster decides *which* hero, the roster decides its rank: both
        // come from the same save the Muster Hall writes.
        classId: this.progress?.heroClass || undefined,
        tier: this.progress?.selectedRank || 1,
        // Autopilot on from the first frame: the brief is a Vanguard that is
        // useful to a player who does not want to give it orders, and a manual
        // move order simply suspends it for six seconds.
        auto: true,
        autoSkills: true,
        post: { x, y },
        bounds: {
          x0: TILE_SIZE / 2,
          y0: TILE_SIZE / 2,
          x1: this.map.cols * TILE_SIZE - TILE_SIZE / 2,
          y1: this.map.rows * TILE_SIZE - TILE_SIZE / 2,
        },
      });
      this.spawnPet();
    }
    return this.hero;
  }

  /**
   * Put the bought companion on the field, just behind the Vanguard.
   *
   * A companion is cosmetic to the lane: it never blocks a path and cannot be
   * targeted, so a pet can be added or removed without touching balance.
   */
  spawnPet() {
    if (this.pet || !this.hero) return this.pet;
    const definition = getPet(this.progress?.equippedPet);
    if (!definition || !this.textures.exists(definition.texture)) return null;
    this.pet = new Pet(this, definition, {
      x: this.hero.x - PET_FOLLOW.offsetX,
      y: this.hero.y + PET_FOLLOW.offsetY,
      // Bought levels are the numbers the companion fights with.
      level: this.progress?.petLevel?.(definition.id) ?? 1,
    });
    // Two figures stand at the gate now, and neither takes orders. Say which is
    // which once, at the start of the battle, so a companion is never mistaken
    // for a second hero.
    this.hud?.showToast?.(
      `${definition.name.toUpperCase()} JOINS THE VANGUARD — it fights on its own`,
      'info'
    );
    return this.pet;
  }

  /**
   * The open cell in front of the bastion gate. Falls back to the boss approach
   * (the last road cell before the core) and finally to the core tile itself,
   * so a map with a tighter courtyard still spawns the hero somewhere legal.
   */
  heroGateCell() {
    const { base } = this.map;
    const candidates = [
      { row: base.row + 1, col: base.col },
      { row: base.row + 1, col: base.col - 1 },
      { row: base.row + 1, col: base.col + 1 },
      { row: base.row, col: base.col - 1 },
      { row: base.row, col: base.col + 1 },
    ];
    for (const cell of candidates) {
      if (cell.row < 0 || cell.col < 0 || cell.row >= this.map.rows || cell.col >= this.map.cols) continue;
      const tile = this.map.tiles[cell.row][cell.col];
      if (tile === TILE.GRASS || tile === TILE.ROAD) return cell;
    }
    const path = this.pathfinding?.mainPath || [];
    const cell = path.length > 1 ? path[path.length - 2] : null;
    if (cell) {
      const [row, col] = String(cell).split(',').map(Number);
      return { row, col };
    }
    return { row: base.row, col: base.col };
  }

  /** The shared cast flourish. Auto-casts and manual casts look identical. */
  playHeroCast(id, info = null) {
    const hero = this.hero;
    if (!hero) return;
    const skill = HERO_SKILLS[id];
    const stats = skillStats(id, hero.tier) || {};
    const targets = info?.targets || [];
    const at = info?.at || null;

    if (id === 'strike') {
      audio.playEnemyHit?.();
      this.cameras.main.shake(140, 0.004);
      this.vfx?.impact?.(hero.x, hero.y, 'explosive', {
        scale: 1.05,
        splash: Math.min(hero.config.strike.radius, 120),
        shake: false,
      });
      return;
    }

    if (id === 'cleave') {
      // Wide and flat: a ground ring at the true radius, no camera shake — this
      // is a swing, not a bomb.
      audio.playShoot?.('forge');
      this.vfx?.shockwave?.(hero.x, hero.y, Math.max(0.8, (stats.radius || 100) / 90), 'physical');
      this.vfx?.impact?.(hero.x, hero.y, 'physical', {
        scale: 0.9,
        splash: Math.min(stats.radius || 100, 120),
        shake: false,
      });
      return;
    }

    if (id === 'volley') {
      // One arrow streak per target actually hit, so the volley is legible even
      // when the creeps are off to the side of the hero.
      audio.playShoot?.('archer');
      for (const target of targets.slice(0, 6)) {
        this.vfx?.muzzle?.(
          hero.x,
          hero.y - (hero.metrics?.height || 70) * 0.5,
          Math.atan2(target.y - hero.y, target.x - hero.x),
          'physical',
          'archer'
        );
        this.vfx?.impact?.(target.x, target.y, 'physical', { scale: 0.6, shake: false, line: 'archer' });
      }
      return;
    }

    if (id === 'snare') {
      this.vfx?.nova?.(hero.x, hero.y, 1.1);
      this.vfx?.shockwave?.(hero.x, hero.y, Math.max(1, (stats.radius || 160) / 120), 'frost');
      for (const target of targets.slice(0, 6)) {
        this.vfx?.impact?.(target.x, target.y, 'frost', { scale: 0.5, shake: false, line: 'frost' });
      }
      return;
    }

    if (id === 'ember') {
      this.vfx?.impact?.(hero.x, hero.y, 'fire', { scale: 1.0, splash: stats.radius || 110, shake: false });
      for (const target of targets.slice(0, 6)) {
        this.vfx?.impact?.(target.x, target.y, 'fire', { scale: 0.55, shake: false });
      }
      return;
    }

    if (id === 'warcry') {
      this.vfx?.nova?.(hero.x, hero.y, 1.0);
      this.vfx?.shockwave?.(hero.x, hero.y, 1.5, 'frost');
      audio.playWarning?.();
      return;
    }

    if (id === 'bulwark') {
      this.vfx?.nova?.(hero.x, hero.y, 0.85);
      return;
    }

    // Unknown skill: at least the position is right.
    if (skill && at) this.vfx?.nova?.(at.x, at.y, 0.6);
  }

  /** The Ranger's basic attack: an arrow from the bow to the target. */
  playHeroShot(target) {
    const hero = this.hero;
    if (!hero || !target) return;
    const from = { x: hero.x, y: hero.y - (hero.metrics?.height || 70) * 0.5 };
    audio.playShoot?.('archer');
    this.vfx?.muzzle?.(
      from.x,
      from.y,
      Math.atan2(target.y - from.y, target.x - from.x),
      'physical',
      'archer'
    );
    this.vfx?.impact?.(target.x, target.y, 'physical', { scale: 0.55, shake: false, line: 'archer' });
  }

  /** A skull puff over a Vanguard that just fell. */
  playHeroDownFx() {
    const hero = this.hero;
    if (!hero || !this.textures.exists('fx-skull')) return;
    const anim = 'fx-skull-die';
    if (!this.anims.exists(anim)) {
      registerUnitAnims(this, ['fx-skull']);
    }
    if (!this.anims.exists(anim)) {
      this.vfx?.impact?.(hero.x, hero.y, 'physical', { scale: 1.2, shake: false });
      return;
    }
    const skull = this.add.sprite(hero.x, hero.y - (hero.metrics?.height || 70) * 0.55, 'fx-skull', 0);
    skull.setDepth(48);
    skull.setScale(0.7);
    skull.play(anim);
    skull.once('animationcomplete', () => skull.destroy());
    this.cameras.main.shake(120, 0.003);
  }

  /** The companion's one flourish, matched to what its ability actually did. */
  playPetCast(cast) {
    if (!cast) return;
    const at = cast.at || this.pet;
    if (!at) return;
    // Every cast starts with a small ring on the companion itself: with the
    // unit standing still behind the hero, "who did that?" needs an answer on
    // the spot, not only at the target.
    if (this.pet) this.vfx?.nova?.(this.pet.x, this.pet.y, 0.6);
    if (cast.id === 'bomb') {
      this.vfx?.impact?.(cast.at.x, cast.at.y, 'explosive', { scale: 1.1, splash: 80, shake: false });
      return;
    }
    if (cast.id === 'burn') {
      this.vfx?.impact?.(at.x, at.y, 'fire', { scale: 0.8, shake: false });
      return;
    }
    if (cast.id === 'mend') {
      this.vfx?.nova?.(this.hero?.x ?? at.x, this.hero?.y ?? at.y, 0.7);
      return;
    }
    // shot and taunt: a small hit puff on the target (the archer gets the
    // arrow strip so the two read differently at a glance).
    const target = cast.targets?.[0];
    if (target) {
      this.vfx?.impact?.(target.x, target.y, 'physical', {
        scale: 0.75,
        shake: false,
        line: cast.id === 'shot' ? 'arrow' : null,
      });
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
    // Free placement: keeps stand on any solid ground outside the portal's
    // landing ring and the bastion plaza. The pads are a *hint*, not a rule —
    // see systems/BuildZone.js for the three sentences that replaced the old
    // half-map + designated-pad maze.
    const base = this.placement.validate(def, row, col, this.economy.coins, {
      route: this.routeCells,
    });
    if (!base.ok) return base;

    // A wall cannot be dropped on top of a living enemy (it would trap it
    // inside the stakes).
    if (typeKey === 'barricade' && this.isEnemyOnCell(row, col)) {
      return { ok: false, reason: 'enemy-on-tile' };
    }

    // Walls are consumables, not keeps: they do not eat a build point.
    // Counting them would let a wall-only opening lock the player out of the
    // towers the same gold was meant to buy.
    if (def.placement !== 'wall') {
      if (this.usedBuildPoints() >= this.maxTowers) {
        return { ok: false, reason: 'max-towers' };
      }
    }
    return { ok: true, reason: null };
  }

  /** Combat keeps standing right now (palisades excluded). */
  usedBuildPoints() {
    let used = 0;
    for (const tower of this.activeTowers || []) if (!tower.isBarricade) used += 1;
    return used;
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

  /** Any standing defence on a cell, or null. O(1) via the placement hash map. */
  getStructureAt(cellKey) {
    const [row, col] = cellKey.split(',').map(Number);
    const occupant = this.placement.getOccupant(row, col);
    if (!occupant || occupant.isDestroyed || occupant.health <= 0) return null;
    return occupant.isStructure ? occupant : null;
  }

  /**
   * The structure a ground creep should attack next, given the cell it is about
   * to step into.
   *
   * Priority is the rule the request asks for, in order:
   *   1. anything physically standing on the next waypoint — a wall across the
   *      lane, or a keep somebody dropped in the road;
   *   2. a structure hugging that waypoint (one cell, including diagonals), so
   *      a keep built right against the lane is in the horde's reach.
   * Anything further away is ignored: the horde is not a magnet for the whole
   * defence line, and a keep in the back of the field stays safe.
   */
  getSiegeTarget(cellKey) {
    const direct = this.getStructureAt(cellKey);
    if (direct) return direct;
    const [row, col] = cellKey.split(',').map(Number);
    let best = null;
    let bestDistance = Infinity;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const neighbour = this.getStructureAt(`${row + dr},${col + dc}`);
        if (!neighbour) continue;
        // A wall in reach outranks a keep: it is the thing in the way.
        const distance = Math.hypot(dr, dc) - (neighbour.isBarricade ? 0.5 : 0);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = neighbour;
        }
      }
    }
    return best;
  }

  /**
   * The defence an attacker should break before anything else, or null.
   *
   * Defences first, the gate last: a creep never walks past a standing defence
   * to hit the core. Two radii decide how far "in the way" reaches — a tight
   * one on the road, a wide one inside the ring that guards the bastion (see
   * `BarricadeCombat.huntRadiusFor`). Flyers are excluded by the caller.
   *
   * @param {{x:number, y:number}} enemy
   * @returns {object|null} standing structure
   */
  getDefenceInReach(enemy) {
    if (!enemy || !this.activeTowers?.length) return null;
    const radius = huntRadiusFor(enemy, this.bastionPoint());
    return pickDefenceInReach(enemy, this.activeTowers, radius);
  }

  /**
   * A horde member swung at a defence. Applies the damage and, when the
   * structure finally gives, runs the collapse flow.
   *
   * Walls go through the siege falloff table (`BarricadeCombat`); keeps take the
   * swing directly, because a keep is a smaller target than a wall section and
   * the table exists to stop a wall evaporating under a boss.
   */
  damageStructure(structure, amount) {
    if (!structure || structure.isDestroyed) return;
    const scaled = amount * (this.difficulty?.damageScale ?? 1);
    // Request 44. The material decides the sample: the palisade is timber and
    // every stronger structure is stonework. Played inside the branch that
    // actually applied damage, so a swing that dealt nothing is silent.
    const material = structure.isBarricade ? 'wood' : 'stone';
    if (structure.isBarricade) {
      const swing = resolveSiegeSwing(structure, scaled);
      if (swing.dealt <= 0) return;
      structure.takeDamage(swing.dealt);
      if (swing.destroyed) audio.playWallBreak(material);
      else audio.playWallHit(material);
      if (this.particleEmitter) {
        this.particleEmitter.explode(3, structure.x, structure.y - TILE_SIZE * 0.5);
      }
      if (swing.destroyed) this.destroyStructure(structure);
      return;
    }
    const dealt = structure.takeDamage(scaled);
    if (dealt <= 0) return;
    if (this.particleEmitter) this.particleEmitter.explode(2, structure.x, structure.y - TILE_SIZE * 0.4);
    if (structure.isDestroyed) audio.playWallBreak(material);
    else audio.playWallHit(material);
    if (structure.isDestroyed) this.destroyStructure(structure);
  }

  /** Collapse: free the tile, remove the structure and let the horde walk on. */
  destroyStructure(structure) {
    const idx = this.activeTowers.indexOf(structure);
    if (idx !== -1) this.activeTowers.splice(idx, 1);
    this.placement.release(structure.row, structure.col);
    if (this.selectedTower === structure) {
      this.selectedTower = null;
      this.badges?.setSelected(null);
      this.hud?.closeInspector();
    }
    const isWall = Boolean(structure.isBarricade);
    if (isWall) {
      this.gameState.counters.barricadesDestroyed =
        (this.gameState.counters.barricadesDestroyed || 0) + 1;
    } else {
      this.gameState.counters.towersDestroyed = (this.gameState.counters.towersDestroyed || 0) + 1;
    }

    audio.playExplosion?.();
    this.cameras.main.shake(180, 0.006);
    if (this.particleEmitter) {
      this.particleEmitter.explode(14, structure.x, structure.y - TILE_SIZE * 0.4);
    }
    this.hud?.showToast(
      isWall ? 'Wall breached! The horde pushes through.' : `${structure.def?.name || 'Defence'} destroyed!`,
      'warning'
    );
    // A fallen structure leaves its own wreck for a moment. The tile is already
    // free, so this is decoration only — it never blocks and never collides.
    // A royal line drops its own ruin; everything else keeps the wall rubble.
    if (isWall) this.spawnWallRubble(structure);
    else this.spawnStructureRuin(structure);
    // A fallen wall or keep stops blocking the lane immediately.
    this.refreshLanes();
    structure.destroy();

    this.syncHUD();
    this.drawBuildSlots();
    this.updateGhostGraphics();
  }

  /**
   * Wreck left behind by a fallen royal defence.
   *
   * Each of the ten lines ships its own `ruin_<line>.png`, so the player can see
   * which building was lost. Decoration only: it never blocks, never collides,
   * and removes itself.
   */
  spawnStructureRuin(structure) {
    // A branch-B building leaves the wreck of *its* machine; the branch-A
    // wreck is the fallback so an older save still drops something.
    const base = `ruin-${structure?.typeKey}`;
    const branchB = `${base}-b`;
    const branch = structure?.def?.specializations?.[structure?.specialization]?.branch;
    const key = branch === 'spec-b' && this.textures?.exists?.(branchB) ? branchB : base;
    if (!this.textures?.exists?.(key) || !this.add?.image) return null;
    try {
      const ruin = this.add
        .image(structure.x, structure.y + TILE_SIZE * 0.16, key)
        .setDepth(2)
        .setAlpha(0.95)
        .setOrigin(0.5, 1);
      this.tweens.add({
        targets: ruin,
        alpha: 0,
        delay: 1200,
        duration: 900,
        onComplete: () => ruin.destroy(),
      });
      return ruin;
    } catch (error) {
      this.reportRuntimeError?.(error);
      return null;
    }
  }

  /** Rubble left behind by a breached wall. Fades out; purely decorative. */
  spawnWallRubble(structure) {
    if (!this.textures?.exists?.('wall-rubble') || !this.add?.image) return null;
    const tierTints = [0xd8ae7a, 0xa9764a, 0xaab3c0, 0xc3ccda, 0xe6c07a];
    try {
      const rubble = this.add
        .image(structure.x, structure.y + TILE_SIZE * 0.12, 'wall-rubble')
        .setDepth(2)
        .setAlpha(0.95);
      if (typeof rubble.setTint === 'function') {
        rubble.setTint(tierTints[(structure.level || 1) - 1] ?? tierTints[0]);
      }
      this.tweens.add({
        targets: rubble,
        alpha: 0,
        delay: 1100,
        duration: 900,
        onComplete: () => rubble.destroy(),
      });
      return rubble;
    } catch (error) {
      this.reportRuntimeError?.(error);
      return null;
    }
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

    // Pre-flight: if this build would wall the horde out of the bastion, refuse
    // it now — before spending gold, before the tower exists. The check is one
    // BFS over the board (~0.3 ms), so it can run on every click.
    //
    // A wall *on the lane* is exempt on purpose: it does not reroute the horde,
    // it stops the horde, and breaking it is the point of the structure. A wall
    // on grass is a real blocker, so it is checked like a keep.
    const wallOnRoad = def.placement === 'wall' && this.map?.tiles?.[row]?.[col] === 'road';
    if (!wallOnRoad) {
      const blocked = this.blockedBuildCells();
      blocked.push(`${row},${col}`);
      this.pathfinding.setBlocked(blocked);
      const reachable = this.pathfinding.hasRoute();
      this.pathfinding.setBlocked(this.blockedBuildCells());
      if (!reachable) {
        audio.playError();
        this.hud?.showToast(PLACEMENT_ERRORS['no-route'], 'error');
        return false;
      }
    }

    this.economy.spend(def.cost);
    const tower = new Tower(this, typeKey, row, col, {
      economy: this.economy,
      gameState: this.gameState,
      activeEnemies: this.activeEnemies,
      activeProjectiles: this.activeProjectiles,
      // Overcharge is a global cooldown multiplier read by Tower.attackCooldown.
      powerups: this.powerups,
      // A defence that covers the gate answers the creeps hitting the gate.
      getBasePoint: () => this.bastionPoint(),
    });
    this.placement.occupy(row, col, tower);
    this.activeTowers.push(tower);

    // A structure on the horde's ground is a wall it walks around: re-run BFS
    // with the new footprint (pre-flighted above, so this always succeeds) and
    // hand any already-marching creep a detour from the cell it is standing on.
    // A wall on the lane is excluded — that one is meant to be broken, not
    // avoided.
    if (!tower.isBarricade || !wallOnRoad) this.refreshLanes();

    if (tower.isBarricade) {
      this.gameState.counters.barricadesPlaced++;
      this.trackStats({ palisadesBuilt: 1 });
      this.hud?.showToast(
        wallOnRoad
          ? 'Wall raised across the lane — enemies must break through.'
          : 'Wall raised. Enemies in reach will attack it.',
        'info'
      );
    } else {
      this.gameState.counters.towersPlaced++;
      const standing = this.activeTowers.filter((t) => !t.isBarricade).length;
      this.trackStats({ towersBuilt: 1, maxTowersAtOnce: standing }, { max: ['maxTowersAtOnce'] });
    }
    // Request 44: a palisade going up gets the timber sound, a tower the place tone.
    if (tower.isBarricade) audio.playWallBuild();
    else audio.playPlace();

    this.refreshTowerAuras();
    this.syncHUD();
    this.drawBuildSlots();
    this.updateGhostGraphics();
    if (this.isVisualizingBFS) this.drawBFSVisualization();
    this.advanceCoach('place');
    this.tutorialReport('place');
  }

  /**
   * Move the first battle's coach mark along.
   *
   * `createCoach` ignores events that do not match the step on screen and
   * returns null once everything has been taught, so this is safe to call from
   * anywhere. Only stage 1 has steps at all, and only until they are all seen.
   */
  advanceCoach(event) {
    const next = this.coach?.report(event);
    if (!this.coach?.active) return next;
    if (next) this.hud?.showCoachStep?.(next);
    else this.hud?.hideCoachStep?.();
    return next;
  }

  /* ------------------------------------------------------------ the opening
   *
   * Havenbrook is a normal battle that happens to be directed. The scene owns
   * the stage — villagers, bell, focus ring — and `TutorialDirector` owns the
   * script; nothing below knows what a line says. The only rule the scene
   * enforces is the one the brief asked for: **the simulation is held** while a
   * line is on screen, so the horde cannot arrive in the middle of a sentence.
   */

  /** Boot the scripted scene. Runs once per battle, from create(). */
  beginTutorial() {
    const ui = (window.gameTutorialUI ||= new TutorialUI());
    this.tutorialUI = ui;
    this.tutorialHold = true;
    this.tutorialCombatBegun = false;
    this.registerVillagerAnims();
    this.spawnVillagers();
    ui.mount();
    ui.onTap(() => this.tutorialTap());
    document.documentElement.classList.add('is-tutorial');
    // Leaving is allowed, but it has to say what it costs: the gate is
    // single-shot, so a player who quits mid-story does not meet it again.
    this.hud?.setQuitWarning?.(
      'Leaving now ends the opening for this keeper — the village will not call again.'
    );
    ui.open({ chapter: 'HAVENBROOK · DUSK' });
    this.tutorialDirector = createTutorialDirector({
      name: this.progress?.profile?.username || '',
      onBeat: (beat) => this.tutorialOnBeat(beat),
      // The script's own end is the moment the village stops talking and the
      // battle clock starts — see `endTutorialScene`.
      onFinish: () => this.endTutorialScene({ handOver: true }),
    });
    this.tutorialDirector.start();
  }

  /**
   * Register the villagers' two clips.
   *
   * The sheets are built two rows tall by `scripts/build_npc_sheets.py` — idle
   * on row 0, walk on row 1 — so the walk clip starts at `cols`, not at 0. The
   * frame counts come from the same data the loader used, never from a guess.
   */
  registerVillagerAnims() {
    for (const member of TUTORIAL_CAST) {
      if (!this.textures.exists(member.sheet)) continue;
      const idleKey = `${member.sheet}-idle`;
      const walkKey = `${member.sheet}-walk`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers(member.sheet, { start: 0, end: member.idle - 1 }),
          frameRate: 7,
          repeat: -1,
        });
      }
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers(member.sheet, {
            start: member.cols,
            end: member.cols + member.walk - 1,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }
  }

  /** Put the five villagers on the high street, transparent until they arrive. */
  spawnVillagers() {
    this.tutorialCast = [];
    for (const member of TUTORIAL_CAST) {
      const spot = VILLAGE_STAGE[member.id];
      if (!spot || !this.textures.exists(member.sheet)) continue;
      const sprite = this.add
        .sprite(spot.col * TILE_SIZE, spot.row * TILE_SIZE, member.sheet, 0)
        .setOrigin(0.5, 1)
        .setScale(member.scale)
        .setDepth(12)
        .setAlpha(0);
      sprite.setData('member', member);
      if (this.anims.exists(`${member.sheet}-idle`)) sprite.play(`${member.sheet}-idle`);
      this.tutorialCast.push(sprite);
      // Old Doren leans on a stick; it is a separate sprite so the walk clip
      // stays the pack's own art instead of a hand-edited every-frame patch.
      if (member.id === 'doren' && this.textures.exists('npc-staff')) {
        this.dorenStaff = this.add
          .image(spot.col * TILE_SIZE - 17 * member.scale, spot.row * TILE_SIZE, 'npc-staff')
          .setOrigin(0.5, 1)
          .setScale(member.scale)
          .setDepth(11.95)
          .setAlpha(0);
      }
    }
  }

  /** One beat from the director: speak it, or put a step on screen. */
  tutorialOnBeat(beat) {
    const ui = this.tutorialUI;
    if (!ui || !beat) return;
    if (beat.kind === 'line') {
      // Only the opening freezes the board. A line *after* the wave has started
      // is a toast, not a card — see TUTORIAL_HOLD_QUIPS.
      this.tutorialHold = !this.tutorialCombatBegun;
      // The HUD steps out of the way while somebody is talking (and comes back
      // for the guided steps — the player has to reach the forge). This rides on
      // <html> so the stylesheet can scope it to the one state it belongs to.
      document.documentElement.classList.toggle('is-line', !this.tutorialCombatBegun);
      const speaker = speakerFor(beat.who);
      this.highlightTutorialSpeaker(this.tutorialCombatBegun ? null : beat.who);
      ui.speak({
        who: beat.who,
        name: speaker?.name || '',
        role: speaker?.role || '',
        portrait: speaker?.portrait || '',
        accent: SPEAKER_ACCENTS[beat.who] || '#cbb994',
        text: this.tutorialDirector?.text?.() || '',
      });
      if (beat.cue) this.tutorialCue(beat.cue);
      return;
    }
    if (beat.kind === 'end') {
      // The script is over: hand the board back. `onFinish` also fires from the
      // director, so this only has to be harmless when it runs twice.
      this.endTutorialScene();
      return;
    }
    if (beat.kind === 'step') {
      this.tutorialHold = false;
      document.documentElement.classList.remove('is-line');
      this.highlightTutorialSpeaker(null);
      const steps = TUTORIAL_BEATS.filter((entry) => entry.kind === 'step');
      const active = Math.max(0, steps.findIndex((entry) => entry.event === beat.event));
      ui.ask({
        title: beat.title,
        text: this.hud?.isMobileShell && beat.textMobile ? beat.textMobile : beat.text,
        steps: steps.map((entry) => entry.event),
        active,
      });
      this.setTutorialTarget(beat);
    }
  }

  /**
   * Point at the thing this step is waiting for.
   *
   * The steps are gates: the script cannot move until the player performs the
   * action. A gate is only fair if the player can see which control opens it, so
   * each step lights up its own target — the cell to build on, the tower to
   * upgrade (and, once its panel is open, the UPGRADE button), the START WAVE
   * button — and the highlight is taken down the moment the action lands.
   */
  setTutorialTarget(beat) {
    if (!beat || beat.kind !== 'step') {
      this.focusTutorialCell(null);
      this.hud?.setTutorialHint?.(null);
      return;
    }
    if (beat.event === 'place') {
      this.focusTutorialCell(beat.focus || null, 'RAISE IT HERE');
      // The shelf is a dozen cards across three tabs; the first entry of the
      // roster is the one the opening's own copy describes.
      this.hud?.setTutorialHint?.({ card: BUILD_OPTIONS[0] });
      return;
    }
    if (beat.event === 'upgrade') {
      // The tower they just raised, wherever they raised it — not the cell the
      // script suggested, because they may have built somewhere else entirely.
      const tower = this.activeTowers?.[this.activeTowers.length - 1] || null;
      const cell = tower ? { col: tower.col, row: tower.row } : null;
      this.focusTutorialCell(cell, 'TAP THE TOWER');
      this.hud?.setTutorialHint?.({ upgrade: true });
      return;
    }
    if (beat.event === 'wave') {
      this.focusTutorialCell(null);
      this.hud?.setTutorialHint?.({ wave: true });
    }
  }

  /** Scene instructions attached to a beat. */
  tutorialCue(cue) {
    if (cue === 'arrive') {
      this.tutorialCast.forEach((sprite, index) => {
        const target = sprite.y;
        sprite.y = target + 10;
        this.tweens.add({
          targets: sprite,
          alpha: 1,
          y: target,
          duration: 340,
          delay: index * 90,
          ease: 'Cubic.easeOut',
        });
      });
      if (this.dorenStaff) {
        const base = this.dorenStaff.y;
        this.dorenStaff.y = base + 10;
        this.tweens.add({ targets: this.dorenStaff, alpha: 1, y: base, duration: 380, delay: 300 });
      }
      return;
    }
    if (cue === 'alarm') {
      this.tutorialUI?.flashAlarm?.();
      audio.playWarning?.();
      return;
    }
    if (cue === 'scatter') {
      // Everybody runs for the gutters: the meadow the player is about to build
      // on must be empty, and the village must look like it is taking cover.
      this.highlightTutorialSpeaker(null);
      this.tutorialCast.forEach((sprite) => {
        const member = sprite.getData('member');
        const exit = VILLAGE_EXIT[member?.id];
        if (!exit) return;
        if (this.anims.exists(`${member.sheet}-walk`)) sprite.play(`${member.sheet}-walk`);
        this.tweens.add({
          targets: sprite,
          x: exit.col * TILE_SIZE,
          y: exit.row * TILE_SIZE,
          duration: 1500,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (this.anims.exists(`${member.sheet}-idle`)) sprite.play(`${member.sheet}-idle`);
          },
        });
        if (member.id === 'doren' && this.dorenStaff) {
          this.tweens.add({
            targets: this.dorenStaff,
            x: exit.col * TILE_SIZE - 17 * member.scale,
            y: exit.row * TILE_SIZE,
            duration: 1500,
            ease: 'Sine.easeInOut',
          });
        }
      });
      return;
    }
    if (cue === 'cheer') {
      this.tutorialCast.forEach((sprite, index) => {
        this.tweens.add({
          targets: sprite,
          y: sprite.y - 9,
          duration: 170,
          yoyo: true,
          repeat: 1,
          delay: index * 70,
          ease: 'Quad.easeOut',
        });
      });
    }
  }

  /**
   * Report a real action to the director.
   *
   * The three calls below are the entire coupling between the battle and the
   * script: a tower raised, a tower upgraded, a wave called. If the player does
   * one of those before the script asks for it, the director remembers.
   */
  tutorialReport(event) {
    if (!this.level?.tutorial || !event) return;
    this.tutorialReported.add(event);
    if (event === 'wave') {
      this.tutorialCombatBegun = true;
      this.tutorialHold = false;
    }
    this.tutorialDirector?.report(event);
    if (event === 'upgrade') {
      this.focusTutorialCell(null);
      this.hud?.setTutorialHint?.(null);
    }
    if (event === 'place') {
      // The lesson moves from raising a defence to feeding it coin. Leaving the
      // forge armed would make the next tap try to build on the square that is
      // already occupied, and the player would read that as "the inspector is
      // broken" — so the card is put down as the step is retired.
      this.handleSelectBuild(null);
      this.focusTutorialCell(null);
    }
    if (event === 'wave') {
      this.hud?.setTutorialHint?.(null);
      this.fireTutorialQuips();
    }
  }

  /** The crowd's lines while the first wave walks. Toasts, never a card. */
  fireTutorialQuips() {
    TUTORIAL_HOLD_QUIPS.forEach((quip, index) => {
      window.setTimeout(() => {
        if (!this.scene?.isActive?.()) return;
        const speaker = speakerFor(quip.who);
        this.hud?.showToast?.(`${(speaker?.name || 'VILLAGER').toUpperCase()}: ${quip.text}`, 'info');
      }, 1200 + index * 4600);
    });
  }

  /** A tap on the dialogue card. */
  tutorialTap() {
    this.tutorialDirector?.tap();
  }

  /**
   * Light up whoever is talking.
   *
   * The villagers are one-tile pawns, so at battle zoom the only thing telling
   * the player which of the five just spoke is the name plate. A pool of the
   * speaker's own colour at their feet — and everybody else easing back to 72 %
   * — answers that without a marker arrow floating over the board.
   */
  highlightTutorialSpeaker(who) {
    this.tutorialSpeakerRing?.destroy?.();
    this.tutorialSpeakerRing = null;
    if (!this.tutorialCast?.length) return;
    const speaker = who ? this.tutorialCast.find((sprite) => sprite.getData('member')?.id === who) : null;
    for (const sprite of this.tutorialCast) {
      this.tweens.add({
        targets: sprite,
        alpha: speaker && sprite !== speaker ? 0.72 : 1,
        duration: 220,
        ease: 'Sine.easeOut',
      });
    }
    if (!speaker) return;
    const accent = parseInt(String(SPEAKER_ACCENTS[who] || '#cbb994').replace('#', ''), 16);
    const ring = this.add.graphics().setDepth(11.5);
    ring.fillStyle(accent, 0.18);
    ring.fillEllipse(speaker.x, speaker.y - 5, 48, 17);
    ring.lineStyle(2, accent, 0.85);
    ring.strokeEllipse(speaker.x, speaker.y - 5, 40, 14);
    this.tutorialSpeakerRing = ring;
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.55, to: 1 },
      duration: 820,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Ring the square a step is pointing at, or clear the ring. */
  focusTutorialCell(cell, label = '') {
    this.tutorialFocus?.destroy?.();
    this.tutorialFocus = null;
    if (!cell) return;
    const cx = cell.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = cell.row * TILE_SIZE + TILE_SIZE / 2;
    const half = TILE_SIZE / 2;
    const ring = this.add.graphics();
    ring.lineStyle(3, 0xffd479, 0.95);
    ring.strokeRoundedRect(-half + 6, -half + 6, TILE_SIZE - 12, TILE_SIZE - 12, 8);
    ring.lineStyle(1, 0xffffff, 0.4);
    ring.strokeRoundedRect(-half + 12, -half + 12, TILE_SIZE - 24, TILE_SIZE - 24, 6);
    const parts = [ring];
    // The ring alone said "somewhere around here"; a new player reads a glowing
    // square as decoration. The words ride on the cell, in the game's own face,
    // so the answer to "where?" is on the board and not in a paragraph above it.
    if (label) {
      const text = this.add
        .text(0, -half - 10, label, {
          fontFamily: 'Rajdhani, Segoe UI, sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffe6a3',
          stroke: '#120d06',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5, 1);
      parts.push(text);
    }
    this.tutorialFocus = this.add.container(cx, cy, parts).setDepth(6);
    this.tweens.add({
      targets: this.tutorialFocus,
      alpha: { from: 0.45, to: 1 },
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Advance the line clock. Called from the held simulation, so a pause is a pause. */
  tickTutorial(deltaMs) {
    if (!this.tutorialDirector || this.tutorialDirector.finished) return;
    this.tutorialDirector.tick(deltaMs);
  }

  /**
   * The scripted part is over: the battle is the player's again.
   *
   * `handOver` is the natural end of the script (as opposed to a scene
   * shutdown). That is the one moment the preparation clock is allowed to
   * start: from here Havenbrook runs on the same rhythm as every other
   * battlefield, so the second wave comes on its own instead of waiting on a
   * button the player has only just learned about.
   */
  endTutorialScene({ handOver = false } = {}) {
    this.tutorialHold = false;
    this.focusTutorialCell(null);
    this.highlightTutorialSpeaker(null);
    this.tutorialUI?.clear?.();
    this.tutorialUI?.close?.();
    this.hud?.setQuitWarning?.(null);
    this.hud?.setTutorialHint?.(null);
    document.documentElement.classList.remove('is-tutorial', 'is-line');
    if (handOver && !this.wavePrep && this.waveManager && !this.gameState?.isOver?.()) {
      this.wavePrep = createWavePrep(this.level);
      this.prepSecond = null;
    }
  }

  /**
   * Settle the opening battle.
   *
   * It is not a campaign clear: no stars, no reward, no campaign board. What it
   * does write is `profile.tutorialDone`, so the village is walked through once
   * per save and never again.
   */
  finishTutorial(outcome = 'victory') {
    if (this.tutorialFinished) return null;
    this.tutorialFinished = true;
    this.endTutorialScene();
    if (outcome === 'victory') this.progress?.completeTutorial?.();
    this.showResult({
      outcome,
      tutorial: true,
      level: this.level,
      score: this.economy?.score || 0,
      waves: this.waveManager?.wavesCompleted || 0,
      totalWaves: this.waveManager?.totalWaves || 0,
      timeMs: this.gameState?.elapsedMs || 0,
    });
    return this.lastResult;
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
      // Banner auras → relics → blessings → the run's draft stack. The stack is
      // read here rather than pushed into each tower, so a card picked mid-run
      // lands on every tower on the board at once.
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
    // A wall has no range, so an undefined radius would hand Phaser a NaN
    // circle. Ask for a real number, not just for a levels array.
    if (def.levels?.[0]?.range > 0) {
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
  /**
   * Draw the build field as a boundary, not as a set of pads.
   *
   * There are no designated build slots any more: **any** grass tile inside
   * this rectangle is a legal tower square (see `systems/BuildZone.js`). What
   * the overlay has to do, then, is answer the one question a player asks
   * before the first click — *where does my field start?* — so it draws the
   * edge: a line along the build row and a bracket down each flank. Nothing is
   * drawn inside, because inside everything is allowed.
   *
   * Only while a defence is armed: on a bare board the line would read as
   * scenery, and the field is meant to look like open ground. Drawn once per
   * board edit (build, sell, a breach), never per frame.
   *
   * @returns {number} cells the boundary encloses (0 when nothing is armed)
   */
  drawBuildSlots() {
    const graphics = this.slotGraphics;
    if (!graphics?.clear) return 0;
    graphics.clear();
    if (!this.selectedBuildKey) return 0;
    const bounds = this.buildBounds || buildBounds(this.map);
    const left = bounds.colMin * TILE_SIZE;
    const right = (bounds.colMax + 1) * TILE_SIZE;
    const top = bounds.rowMin * TILE_SIZE;
    const bottom = (bounds.rowMax + 1) * TILE_SIZE;

    // Two strokes: a dark halo so the line survives bright sand and pale ice,
    // then the parchment gold of the dock cards the player has just pressed.
    for (const [width, colour, alpha] of [[5, 0x0b1220, 0.34], [2, 0xf6e2ac, 0.7]]) {
      graphics.lineStyle(width, colour, alpha);
      graphics.beginPath();
      graphics.moveTo(left, top);
      graphics.lineTo(right, top);
      graphics.strokePath();
      // Flank brackets, not a closed box: the field is open toward the keep,
      // and the keep is the thing the field exists to protect.
      graphics.beginPath();
      graphics.moveTo(left, top);
      graphics.lineTo(left, bottom);
      graphics.strokePath();
      graphics.beginPath();
      graphics.moveTo(right, top);
      graphics.lineTo(right, bottom);
      graphics.strokePath();
    }

    return (bounds.colMax - bounds.colMin + 1) * (bounds.rowMax - bounds.rowMin + 1);
  }

  /**
   * Recompute the horde's lanes around whatever keeps are standing.
   *
   * Called after every build and sell — not per frame. Returns false when no
   * route from the portal to the bastion survives, which is the signal the
   * caller uses to undo the build. Active enemies whose remaining path is now
   * blocked are re-routed from the cell they are standing on, so a tower that
   * lands in front of a marching wave makes it walk around instead of through.
   */
  /**
   * Cells the horde must route around.
   *
   * Every standing keep counts. A wall counts **only when it stands on grass**:
   * a wall dropped on the lane is a deliberate roadblock, and the horde is meant
   * to stop and break it rather than take a detour — routing around that wall
   * would make the whole tier system pointless.
   */
  blockedBuildCells() {
    const blocked = [];
    for (const tower of this.activeTowers || []) {
      if (!tower || tower.isDestroyed) continue;
      if (tower.isBarricade) {
        if (this.map?.tiles?.[tower.row]?.[tower.col] === 'road') continue;
        blocked.push(`${tower.row},${tower.col}`);
        continue;
      }
      blocked.push(`${tower.row},${tower.col}`);
    }
    return blocked;
  }

  refreshLanes() {
    const blocked = this.blockedBuildCells();
    this.pathfinding.setBlocked(blocked);
    const lanes = this.pathfinding.computeLanes({ max: 3 });
    if (!lanes.length) return false;
    this.routeCells = this.pathfinding.laneCells.size
      ? this.pathfinding.laneCells
      : new Set(this.pathfinding.mainPath);

    const blockedSet = new Set(blocked);
    for (const enemy of this.activeEnemies || []) {
      if (enemy.isDead || enemy.reachedBase || enemy.assaulting) continue;
      const remaining = enemy.path?.slice(enemy.pathIndex) || [];
      if (!remaining.some((key) => blockedSet.has(key))) continue;
      const from = enemy.getCurrentCellKey?.();
      if (!from) continue;
      const route = this.pathfinding.pathToBase(from, 'enemy detour');
      if (route.found) enemy.setPath?.(route.path);
    }

    this.waveLaneIndex = this.laneIndexForWave(Math.max(1, this.waveManager?.waveNumber || 1));
    this.drawLaneHint();
    return true;
  }

  drawLaneHint() {
    const graphics = this.laneHintGraphics;
    if (!graphics?.clear) return 0;
    graphics.clear();
    const lanes = (this.pathfinding?.lanes || []).filter((lane) => lane?.length);
    if (!lanes.length) {
      return paintLaneHint(graphics, this.pathfinding?.mainPath || [], TILE_SIZE);
    }
    // Mark the gates the coming wave will actually use — one beacon for the
    // opening waves, two or three once the stage opens the board up. Painting
    // every road regardless was a hint that stopped being true the moment a wave
    // walked a single lane.
    const plan = this.currentGatePlan();
    const slots = plan.slots?.length ? plan.slots : [plan.primary || 0];
    let painted = 0;
    for (const slot of slots) {
      const lane = lanes[slot];
      if (lane?.length) painted += paintLaneHint(graphics, lane, TILE_SIZE);
    }
    return painted;
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

  /**
   * Where the wave is coming from, in words.
   *
   * A single-gate wave reads "LEFT LANE"; a split wave lists the roads it uses,
   * and a wave that opens every gate says so. The toast has to agree with the
   * beacons on the board — that is the whole point of the hint.
   */
  gateLabel() {
    const plan = this.currentGatePlan();
    const laneCount = Math.max(1, this.pathfinding?.laneCount || 1);
    if (!plan.slots?.length || plan.gates <= 1) return this.laneName(plan.primary || 0);
    if (plan.gates >= laneCount) return 'ALL LANES';
    const names = plan.slots.map((slot) => laneLabel(this.pathfinding?.lanes, slot));
    return `${names.join(' + ')} LANES`;
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
    // A finished match has no next wave to prepare for.
    cancelWavePrep(this.wavePrep);
    this.prepSecond = null;
    this.shatterBastion();
    this.hud?.hideBossBar();
    window.gameCodex?.hide?.();
    audio.playDefeat();
    // In a duel a broken core is a knockout, not a campaign defeat: the room
    // scores the match and the lobby decides what happens next.
    if (this.level.pvp) return this.finishDuel('ko');
    // Losing the village is a retry, not a campaign defeat: no stats, no board.
    if (this.level?.tutorial) return this.finishTutorial('defeat');
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
    // Nothing is left to prepare for: the last wave is dead and the bastion
    // stands. Cancelling here keeps the countdown out of the victory screen.
    cancelWavePrep(this.wavePrep);
    this.prepSecond = null;
    this.syncBastionPulse();
    this.flareBastion();
    this.hud?.hideBossBar();
    window.gameCodex?.hide?.();
    // Base health survival score bonus
    this.addScore(this.gameState.baseHealth * SCORE.victoryPerBaseHp);
    audio.playVictory();
    if (this.level.pvp) return this.finishDuel('cleared');
    // Havenbrook is scored as a story beat, not a campaign clear: no stars, no
    // reward, no board. It writes one flag and hands the player the realm.
    if (this.level?.tutorial) return this.finishTutorial('victory');
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
    this.publishDailyRun(payload);
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
    // The fallback card still files the run on the right board: the same
    // fields the result screen forwards, or every mode would land in UNFILED.
    window.gameLeaderboardUI?.show?.({
      status: payload.outcome,
      mode: payload.mode ?? null,
      level: payload.level ?? null,
      pvp: Boolean(payload.pvp || payload.level?.pvp),
      coop: Boolean(payload.coop),
      score: payload.score,
      waves: payload.waves,
      totalWaves: payload.totalWaves ?? null,
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
    if (healed) this.updateBattleMusic();
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
      prep: this.wavePrep
        ? {
            active: Boolean(this.wavePrep.active),
            remainingMs: this.wavePrep.remainingMs,
            phase: this.wavePrep.phase,
          }
        : null,
    });
    this.badges?.sync(this.activeTowers, this.economy.coins);
    // Heals (blessings, relics) go through the same bar as damage.
    this.syncBastionBar();
    this.hud?.setBuildPoints?.(this.usedBuildPoints(), this.maxTowers);
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

    if (key === 'frost') {
      this.pendingFrost = true;
      this.hud?.showToast('FROST SURGE — tap a stretch of road to freeze it', 'info');
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
    this.trackStats({ spellsCast: 1 });
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

  /**
   * Frost Surge: no damage, only time. Every ground enemy in the circle gets
   * the same slow, and `Enemy.applySlow` already keeps the strongest active
   * slow instead of multiplying them.
   */
  castFrost(x, y) {
    this.trackStats({ spellsCast: 1 });
    const { radius, slow, durationMs } = FROST;
    this.vfx?.impact?.(x, y, 'frost', { scale: 1.5, splash: radius, shake: false });
    this.vfx?.shockwave?.(x, y, radius / 60, 'frost');
    const hits = frostTargets(this.activeEnemies, x, y, radius);
    for (const enemy of hits) enemy.applySlow?.(slow, durationMs);
    audio.playPlace?.();
    this.hud?.showToast(
      hits.length > 0 ? `FROST SURGE — ${hits.length} slowed` : 'FROST SURGE — no ground in range',
      'info'
    );
    return hits.length;
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
    const span = perfProbe.begin('battle.update');
    try {
      // Camera and badges keep working even while the simulation is paused, so
      // the player can inspect the battlefield before starting a wave.
      this.cameraRig?.update(rawDelta);
      this.badges?.update(this.cameras.main);
      this.syncLaneHint();
      // Two texture offsets per frame — that is the whole cost of a flowing
      // river, and it keeps running while the battle is paused.
      if (this.riverFlow) this.riverFlow.tilePositionX += rawDelta * 0.055;
      if (this.riverUnder) this.riverUnder.tilePositionX -= rawDelta * 0.032;

      if (this.gameState.isPaused() || this.gameState.isOver()) return;

      this.stepSimulation(rawDelta);
    } catch (error) {
      this.reportRuntimeError(error);
    } finally {
      perfProbe.end('battle.update', span);
    }
  }

  /**
   * Run the support casters' clock.
   *
   * Each caster keeps its own `supportTimer` in milliseconds so two adepts that
   * spawned a second apart fire a second apart instead of pulsing in lockstep.
   * The pulse grants a barrier through `Enemy.grantShield`, which implements the
   * replace-only-if-stronger rule and returns the points actually added, so the
   * visual flourish only fires when a creep really gained a shield.
   */
  tickEnemySupport(deltaMs) {
    if (!this.activeEnemies?.length) return;
    const dt = Math.max(0, Number(deltaMs) || 0);
    if (!dt) return;
    for (const caster of this.activeEnemies) {
      const support = caster?.def?.support;
      if (!support || support.kind !== 'shield') continue;
      if (caster.isDead || caster.reachedBase) continue;
      caster.supportTimer = (caster.supportTimer || 0) + dt;
      if (caster.supportTimer < (support.intervalMs || 7000)) continue;
      caster.supportTimer = 0;
      this.pulseShieldWard(caster, support);
    }
  }

  /**
   * One ward pulse: shield every living creep inside the radius (air included —
   * the ward is magic, not a road effect; only the caster itself is skipped).
   */
  pulseShieldWard(caster, support) {
    const radius = Math.max(0, support.radius || 0);
    const amount = Math.max(0, support.amount || 0);
    if (!radius || !amount) return 0;
    let warded = 0;
    for (const ally of this.activeEnemies) {
      if (ally === caster || ally.isDead || ally.reachedBase) continue;
      if (Math.hypot((ally.x || 0) - (caster.x || 0), (ally.y || 0) - (caster.y || 0)) > radius) continue;
      if (ally.grantShield?.(amount) > 0) warded += 1;
    }
    if (warded > 0) {
      this.vfx?.impact?.(caster.x, caster.y, 'magic', { scale: 1.2 });
      this.vfx?.groundBlast?.(caster.x, caster.y, 1.1);
    }
    return warded;
  }

  /** One simulation tick: waves, enemies, towers, projectiles, boss HUD. */
  stepSimulation(rawDelta) {
    // A card pick freezes the board the same way the pause card does — no creep
    // moves, no wave clock, no powerup cooldown.
    if (this.modePaused) return;
    // The opening scene holds the board while a villager is talking. Only the
    // line clock runs, so the horde cannot walk into the middle of a sentence
    // and a line can never outlast the player's patience by accident.
    if (this.tutorialHold) {
      this.tickTutorial(rawDelta);
      return;
    }
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

    // 0a. The preparation window — campaign, endless and solo modes open the
    // next wave themselves once it runs out (see `tickWavePrep`).
    this.tickWavePrep(clampedDelta);

    // 0b. Enemy support. A Hex Adept wards its escort on its own clock, on the
    // same simulation time as everything else (so a pause or a 2x toggle moves
    // it correctly). Pure function body in `tickEnemySupport` so it is unit
    // testable without a live scene.
    this.tickEnemySupport(clampedDelta);

    // 1. Wave Manager Update
    const waveEvent = this.waveManager.update(clampedDelta, this.activeEnemies.length);
    if (waveEvent && waveEvent.type === 'waveComplete') {
      // A cleared wave gets its own short flourish, not the wave-start bong.
      audio.playWaveClear();
      this.updateBattleMusic();
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

      if (!waveEvent.isFinal) {
        this.afterWaveCleared(waveEvent);
        // Arm the next window *after* the clear bonus is paid, so the player is
        // never spending gold the toast has not announced yet.
        if (this.wavePrep) armWavePrep(this.wavePrep, PREP_PHASE.BETWEEN);
      }

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

    // 3b. Royal field effects: obelisk wards, workshop repairs and trap
    // triggers. One clock for all three (see systems/RoyalSystems.js) — they
    // are timer-driven on purpose, so a 60 fps wave does not rescan the enemy
    // list for every field every frame.
    this.royalSystems?.update(clampedDelta);

    // 4. Active Projectiles Update
    for (let i = 0; i < this.activeProjectiles.length; i++) {
      this.activeProjectiles[i].update(clampedDelta);
    }
    compactInPlace(this.activeProjectiles, (p) => !p.isDead);

    // 4b. The Vanguard walks, swings and takes contact damage on the same clock.
    if (this.hero) {
      const step = this.hero.update(clampedDelta, this.activeEnemies);
      for (const cast of step.casts) this.playHeroCast(cast, step.castInfo);
      // A ranged hero's ordinary attack is a shot: the arrow has to leave the
      // bow, or the Ranger reads as a melee unit that happens to hit far away.
      if (step.attacked && this.hero.isRanged) this.playHeroShot(step.attacked);
      // One skull, at the moment it actually goes down — the downed pose alone
      // is easy to miss in a busy lane.
      if (this.hero.isDown && !this.heroDownFx) {
        this.heroDownFx = true;
        this.playHeroDownFx();
      } else if (!this.hero.isDown) {
        this.heroDownFx = false;
      }
      this.heroHudTimer += clampedDelta;
      if (this.heroHudTimer >= 120) {
        this.heroHudTimer = 0;
      }
    }

    // 4c. The bought companion follows the Vanguard and fires on its own timer.
    if (this.pet) {
      const petStep = this.pet.update(clampedDelta, this.activeEnemies, this.hero);
      if (petStep.cast) this.playPetCast(petStep.cast);
    }

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
