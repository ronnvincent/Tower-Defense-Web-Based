import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config/gameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HUD } from './ui/HUD.js';
import { LeaderboardUI } from './ui/LeaderboardUI.js';
import { StatisticsPanel } from './ui/StatisticsPanel.js';
import { Leaderboard } from './systems/Leaderboard.js';
import { WorldMapUI } from './ui/WorldMapUI.js';
import { ResultScreenUI } from './ui/ResultScreenUI.js';
import { PvpLobbyUI } from './ui/PvpLobbyUI.js';
import { DuelResultUI } from './ui/DuelResultUI.js';
import { ModesUI } from './ui/ModesUI.js';
import { DraftPanel } from './ui/DraftPanel.js';
import { ProgressStore } from './systems/Progression.js';
import { AchievementsUI } from './ui/AchievementsUI.js';
import { ForgeUI } from './ui/ForgeUI.js';
import { BlessingsUI } from './ui/BlessingsUI.js';
import { DailyStore, dailyRun } from './systems/DailyChallenge.js';
import { getNextLevel, getLevel } from './data/levelData.js';
import { MODES, MODE_KINDS } from './data/modeData.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { audio } from './rendering/AudioSynth.js';
import { FullscreenController } from './system/FullscreenController.js';
import { OrientationGate } from './system/OrientationGate.js';
import { DisplayGateUI } from './ui/DisplayGateUI.js';
import { GATE_MODE, gateBlocksGameplay } from './system/displayMode.js';
import { lockViewport } from './system/viewportLock.js';

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

// Dev-only handle for QA: the battle scene is otherwise unreachable from the
// console, which made "the monsters look wrong on screen" impossible to diagnose
// without guessing. Never exposed in a production build.
if (import.meta.env?.DEV) window.game = game;

// Campaign progress outlives any single battle: GameScene.init() reads it for
// the level definition, the unlock graph and the saved star ratings.
window.gameProgress = new ProgressStore();
// The daily is a second save file: it owns the calendar, the streak and which
// days are already paid, so it stays independent of campaign progress.
window.gameDaily = new DailyStore();

// 3. Mount UI Layers into DOM
const hudContainer = document.getElementById('hud-container');
const modalContainer = document.getElementById('modal-container');
// The world map / result screens get their own layer: LeaderboardUI and the
// codex replace `modalContainer.innerHTML`, which used to wipe the very screen
// the player was reading.
const screenContainer = document.getElementById('screen-container') || modalContainer;

window.gameHUD = new HUD(hudContainer, {});

// The viewport meta already asks mobile browsers not to zoom the page, but
// iOS Safari ignores `user-scalable=no` and Chrome honours "force enable zoom".
// This cancels the page-level pinch / ctrl-wheel / zoom-shortcut fallbacks so a
// two-finger gesture always zooms the battlefield instead of the HUD.
lockViewport();
window.gameLeaderboardUI = new LeaderboardUI(modalContainer, globalLeaderboard, {
  onReturnToMenu: () => {
    const gameScene = game.scene.getScene('GameScene');
    if (gameScene && gameScene.scene.isActive()) {
      gameScene.scene.start('MenuScene');
    }
  },
  onClose: () => {
    if (navReturn === 'map') restoreAfterPanel();
  },
});

// ---------------------------------------------------------------------------
// 3b. CAMPAIGN FLOW — world map ⇄ battlefield
// ---------------------------------------------------------------------------
// One owner for "where are we now": MenuScene, the world map and the result
// screen all route through these three helpers, so a missing overlay can never
// strand the player on a dead scene.

const menuOverlay = () => document.getElementById('main-menu-overlay');
const hudLayer = () => document.getElementById('hud-container');

/**
 * Where a sub-screen should return to when it closes.
 *
 * The Forge, the Codex, the Monument and the Champions' Hall are all reachable
 * from two places — the main menu and the world map — and each has to hand the
 * player *back* to where they came from. One string, set by whoever opened the
 * screen, read by every close handler.
 */
let navReturn = 'menu';

/** Close a sub-screen: back to the map, or back to the main menu. */
function restoreAfterPanel({ refresh = true } = {}) {
  if (navReturn === 'map') {
    navReturn = 'menu';
    if (refresh) refreshMapAndShow();
    return;
  }
  if (refresh) {
    refreshDailyButton();
    refreshMenuSummary();
  }
  menuOverlay()?.classList.remove('hidden');
  hudLayer()?.classList.add('hidden');
}

/** Reveal the map with whatever the save now says. */
function refreshMapAndShow() {
  window.gameResultScreen?.hide?.();
  menuOverlay()?.classList.add('hidden');
  hudLayer()?.classList.add('hidden');
  window.gameCodex?.hide?.();
  window.gameLeaderboardUI?.hide?.();
  window.gameWorldMap?.show();
}

/**
 * What the last battle was launched with.
 *
 * A mode run is a level *plus* flags — Rogue Siege is Endless with `rogue`, a
 * Blueprint is `puzzle-<id>`. Replay and Retry re-launch this payload verbatim,
 * otherwise a replay would silently drop the player into plain Endless.
 */
let lastLaunch = null;

/**
 * Reveal the world map and clear every other layer.
 *
 * `arrival` is what the battle that just ended did — the map reports those real
 * stars and rewards instead of replaying its intro like nothing happened.
 */
function showLevelSelect({ arrival = null } = {}) {
  navReturn = 'menu';
  window.gameResultScreen?.hide?.();
  menuOverlay()?.classList.add('hidden');
  hudLayer()?.classList.add('hidden');
  // A finished or abandoned run leaves a board behind the map. Stop it and park
  // on the menu scene, so the map never animates on top of a live simulation
  // (and so Deploy always boots through the same `MenuScene -> GameScene` path).
  if (battleSceneIsUp()) game.scene.getScene('GameScene')?.scene?.start?.('MenuScene');
  window.gameWorldMap?.show({ arrival });
}

function openLevelSelect() {
  refreshDailyButton();
  audio.playClick();
  showLevelSelect();
}

/**
 * Abandon a running battle and return to the world map. Nothing from the run is
 * banked (stars and rewards only come from a finished level) — the pause card
 * warns about exactly this before the second tap.
 */
function quitToMap() {
  const gameScene = game.scene.getScene('GameScene');
  if (gameScene?.scene?.isActive()) gameScene.scene.stop();
  showLevelSelect();
}

/**
 * Enter a battle. `init()` receives `{ levelId }`, and a running battle is
 * restarted in place so Next / Replay never stack scenes.
 */
function startLevel(levelId = 'level-1', options = {}) {
  navReturn = 'menu';
  window.gameResultScreen?.hide?.();
  window.gameWorldMap?.hide?.();
  window.gameAchievements?.hide?.();
  window.gameDuelResult?.hide?.();
  menuOverlay()?.classList.add('hidden');
  hudLayer()?.classList.remove('hidden');
  // A campaign run must never inherit a duel room; a duel must never inherit
  // campaign progression. Whoever starts the scene says which one it is.
  if (!options.pvp) leaveDuelRoom();

  const gameScene = game.scene.getScene('GameScene');
  const menuScene = game.scene.getScene('MenuScene');
  // A daily run rides on the same scene contract: `dailyKey` + `dailyModifier`
  // (see GameScene.init). Everything else is the normal level boot.
  // Mode flags (`rogue`, `anomaly`, `ascension`, `contracts`, `seed`) are spread
  // through untouched, so adding a mode never means editing this function.
  const { dailyKey = null, dailyModifier = null, pvp = null, ...modeOptions } = options || {};
  const payload = {
    levelId,
    dailyKey,
    dailyModifier,
    pvp,
    ...modeOptions,
  };
  // Replay / Retry must land back in the *same* mode, not the bare level.
  lastLaunch = { levelId, options: { ...payload } };

  if (gameScene?.scene?.isActive()) {
    // Next / Replay / a new node picked after a battle: restart in place.
    gameScene.scene.restart(payload);
  } else if (menuScene?.scene?.isActive()) {
    // ScenePlugin.start() stops the menu first, so its backdrop and embers do
    // not keep rendering underneath the battlefield.
    menuScene.scene.start('GameScene', payload);
  } else {
    game.scene.start('GameScene', payload);
  }
}

/**
 * Refresh the Daily Challenge button: streak flame, today's modifier and
 * whether the day is already claimed. Called on boot and whenever the menu is
 * shown, because midnight can pass while the tab is open.
 */
function refreshDailyButton() {
  const daily = window.gameDaily;
  const btn = document.getElementById('menu-btn-daily');
  if (!daily || !btn) return null;
  const run = dailyRun({
    unlockedIds: window.gameProgress ? window.gameProgress.profile.unlocked : ['level-1'],
  });
  const streak = daily.currentStreak(run.key);
  const won = daily.isWon(run.key);
  const label = document.getElementById('menu-daily-label');
  const badge = document.getElementById('menu-daily-streak');
  // The kicker ("DAILY CHALLENGE") is static markup, so the label only carries
  // today's rule — no more "DAILY: DAILY: MIDAS RUSH" on a two-line button.
  if (label) label.textContent = won ? 'CLEARED TODAY' : run.modifier.name.toUpperCase();
  // The flame is the .menu-badge::before mark, not an emoji: the badge is a
  // struck amber tag and emoji render as full-colour glyphs inside it.
  if (badge) {
    badge.textContent = streak > 0 ? String(streak) : '';
    badge.classList.toggle('hidden', streak <= 0);
  }
  btn.classList.toggle('daily-claimed', won);
  btn.title = won
    ? `${run.modifier.name} — cleared today. Replays pay no extra gems.`
    : `${run.modifier.name}: ${run.modifier.blurb}`;
  btn.dataset.level = run.levelId;
  return run;
}

/**
 * Paint the menu's save summary (stars / gems / medals). Idempotent and cheap:
 * the menu re-reads it every time it is revealed, so a victory that just
 * banked stars is already reflected when the card drops in.
 */
function refreshMenuSummary() {
  const progress = window.gameProgress;
  if (!progress) return;
  const stars = document.getElementById('menu-stat-stars');
  const gems = document.getElementById('menu-stat-gems');
  const medals = document.getElementById('menu-stat-medals');
  if (stars) stars.textContent = `${progress.totalStars}/${progress.maxStars}`;
  if (gems) gems.textContent = String(progress.gems);
  if (medals) medals.textContent = `${progress.profile.achievements?.length || 0}/${ACHIEVEMENTS.length}`;
}

/**
 * Leave a live duel from the pause card. That is a forfeit: report a knockout
 * so the room closes immediately and the result card explains why, rather than
 * stranding the rival in a match nobody is fighting.
 */
function quitDuel() {
  const scene = game.scene.getScene('GameScene');
  const room = window.gamePvp;
  if (room?.state?.status === 'live') {
    room.reportSeat({
      outcome: 'ko',
      score: scene?.economy?.score || 0,
      coreHp: 0,
      waves: scene?.waveManager?.wavesCompleted || 0,
      timeMs: scene?.gameState?.elapsedMs || 0,
    });
  }
  if (scene?.scene?.isActive()) scene.scene.pause();
  if (!room) window.gamePvpLobby?.reopenAfterMatch?.();
}

/**
 * Freeze the battlefield behind a duel result card.
 *
 * A knockout calls this from inside the scene's own update, so it must stay a
 * one-liner: pause the scene, leave the card on top, and let the player choose
 * rematch, lobby or menu.
 */
/** Is a battle scene on screen — running, or paused behind a result card? */
function battleSceneIsUp() {
  const scene = game.scene.getScene('GameScene');
  return Boolean(scene && (scene.scene?.isActive?.() || scene.scene?.isPaused?.()));
}

function pauseBattle() {
  const scene = game.scene.getScene('GameScene');
  if (scene?.scene?.isActive()) scene.scene.pause();
}

/**
 * Tear down a finished duel's battlefield **without** dropping the room.
 *
 * A decided duel used to leave the scene paused with the HUD still live
 * underneath. Close the result card and back to the lobby, and the player was
 * left on a dead board whose buttons all still looked pressable — the freeze
 * both players reported. Rematch needs the socket, so only the scene goes.
 */
function stopDuelScene() {
  const scene = game.scene.getScene('GameScene');
  const menu = game.scene.getScene('MenuScene');
  // A finished duel leaves the scene *paused*, and `isActive()` is false for a
  // paused scene — check both, or the dead board survives behind the menu.
  if (battleSceneIsUp()) {
    if (menu?.scene?.isActive()) scene.scene.stop();
    else scene.scene.start('MenuScene'); // stops the battle, then boots the menu
  }
  hudLayer()?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');
  window.gameDuelResult?.hide?.();
  window.gameResultScreen?.hide?.();
  menuOverlay()?.classList.remove('hidden');
}

/** Drop the socket/room if a duel is still holding one. */
function leaveDuelRoom() {
  if (!window.gamePvp) return;
  try {
    window.gamePvp.leave();
  } catch {
    /* already closed */
  }
  window.gamePvp = null;
  window.gamePvpLobby?.hide?.();
}

function openMainMenu() {
  navReturn = 'menu';
  refreshDailyButton();
  refreshMenuSummary();
  window.gameResultScreen?.hide?.();
  window.gameWorldMap?.hide?.();
  hudLayer()?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');
  window.gameDuelResult?.hide?.();
  leaveDuelRoom();
  // The overlay is revealed here, not by MenuScene.create(): the world map
  // hides it, and if the menu scene is still parked behind the map then
  // create() never runs again and the player would land on a black stage.
  menuOverlay()?.classList.remove('hidden');
  const gameScene = game.scene.getScene('GameScene');
  if (gameScene?.scene?.isActive()) {
    gameScene.scene.start('MenuScene'); // stops the battle, then boots the menu
  } else if (!game.scene.getScene('MenuScene')?.scene?.isActive()) {
    game.scene.start('MenuScene');
  }
  // else: the menu is already up — the overlay reveal in MenuScene.create() is
  // not needed because the menu was never torn down.
}

window.gameFlow = {
  openLevelSelect,
  openWorldMap: (options = {}) => showLevelSelect(options),
  startLevel,
  openMainMenu,
  quitToMap,
  quitDuel,
  leaveDuelRoom,
  pauseBattle,
  stopDuelScene,
  openModes: () => window.gameModes?.show(),
  /** What the last battle was launched with — Replay reads it. */
  get lastLaunch() {
    return lastLaunch;
  },
};

window.gameForge = new ForgeUI(screenContainer, window.gameProgress, {
  // The Forge is reachable from the menu *and* the map; the close handler has
  // to hand the player back to whichever one opened it.
  onClose: () => restoreAfterPanel(),
  onPurchase: () => refreshMenuSummary(),
});

// The blessings panel is in-battle UI: it reads the live scene rather than a
// snapshot, so gold and the per-run purchase counters are always current.
window.gameBlessings = new BlessingsUI(modalContainer, {
  state: () => {
    const scene = game.scene.getScene('GameScene');
    if (!scene || !scene.economy || !scene.scene?.isActive?.()) return null;
    return { gold: scene.economy.coins, purchased: scene.blessingsBought || {} };
  },
  buy: (id) => {
    const scene = game.scene.getScene('GameScene');
    if (!scene?.buyBlessing) return { ok: false, reason: 'no-run' };
    const result = scene.buyBlessing(id);
    // Buying from the paused panel must not leave the HUD showing old numbers.
    scene.syncHUD?.();
    return result;
  },
});

window.gameAchievements = new AchievementsUI(screenContainer, window.gameProgress, {
  onClose: () => restoreAfterPanel(),
});

/**
 * The world map: the hub every inner screen hangs off.
 *
 * Its callbacks are deliberately thin — each one routes to a screen that
 * already existed, so the map adds navigation, not a second copy of the game.
 */
window.gameWorldMap = new WorldMapUI(
  document.getElementById('world-map-root') || screenContainer,
  window.gameProgress,
  {
    daily: window.gameDaily,
    onDeploy: (levelId) => startLevel(levelId),
    onDaily: () => {
      const run = refreshDailyButton();
      if (!run) return;
      window.gameDaily?.recordPlay(run.key);
      startLevel(run.levelId, { dailyKey: run.key, dailyModifier: run.modifier });
    },
    onDuel: () => window.gamePvpLobby?.show(),
    onWarRoom: () => window.gameModes?.show(),
    onMode: (modeId) => launchModeFromMap(modeId),
    onLibrary: (target) => {
      if (target === 'codex') {
        window.gameCodex?.show();
        return;
      }
      document.getElementById('instructions-modal')?.classList.remove('hidden');
    },
    onNavigate: (target) => {
      // One table, so a landmark can only ever open a screen that exists.
      const open = {
        forge: () => window.gameForge?.show(),
        achievements: () => window.gameAchievements?.show(),
        leaderboard: () => window.gameLeaderboardUI?.show(),
        codex: () => window.gameCodex?.show(),
      }[target];
      if (!open) return; // unknown target: stay on the map rather than strand
      navReturn = 'map';
      window.gameWorldMap?.hide();
      open();
    },
    onMenu: () => openMainMenu(),
    onCredits: () => document.getElementById('credits-modal')?.classList.remove('hidden'),
    onSound: () => audio.toggleMute(),
    onFullscreen: () => void fullscreen.toggle(),
  }
);

/**
 * Launch one War Room mode from the map.
 *
 * Blueprint and Co-op own a picker (nine boards / the duel lobby), and those
 * pickers live inside the War Room, so those two open it and let it take over.
 * Every other mode is a straight launch, through the same `ModesUI.launch`
 * the War Room itself uses — one code path, so the map can never drift from
 * the War Room's behaviour (rogue cards, anomaly seeds, contract boards).
 */
function launchModeFromMap(modeId) {
  const mode = MODES.find((entry) => entry.id === modeId);
  if (!mode) return;
  window.gameWorldMap?.hide();
  if (mode.kind === MODE_KINDS.PUZZLE || mode.kind === MODE_KINDS.COOP) {
    window.gameModes?.show();
    window.gameModes?.launch(modeId);
    return;
  }
  window.gameModes?.launch(modeId);
}

window.gameResultScreen = new ResultScreenUI(screenContainer, {
  onNext: () => {
    const level = window.gameResultScreen?.result?.level;
    startLevel(getNextLevel(level?.id)?.id || 'level-1');
  },
  onReplay: () => {
    const levelId = window.gameResultScreen?.result?.level?.id || 'level-1';
    // Same level as the run just finished → replay the run, flags and all.
    if (lastLaunch?.levelId === levelId) {
      const { levelId: _id, ...options } = lastLaunch.options;
      startLevel(levelId, options);
      return;
    }
    startLevel(levelId);
  },
  onMenu: () => openMainMenu(),
  onMap: (result) =>
    showLevelSelect({
      arrival: result
        ? {
            levelName: result.level?.name,
            outcome: result.outcome,
            stars: result.stars,
            rewards: result.rewards,
          }
        : null,
    }),
  onLeaderboard: (result) =>
    window.gameLeaderboardUI.show({
      status: result.outcome,
      score: result.score,
      waves: result.waves,
      timeMs: result.timeMs,
    }),
});

/**
 * Duel surfaces. The lobby owns the room (and hands it to `window.gamePvp`, the
 * handle GameScene reports through); the result card only paints the outcome.
 */
window.gameDuelResult = new DuelResultUI(screenContainer, {
  onRematch: () => {
    const room = window.gamePvp;
    if (!room) {
      openMainMenu();
      return;
    }
    room.rematch();
    window.gamePvpLobby?.reopenAfterMatch?.();
  },
  onLobby: () => {
    window.gamePvpLobby?.reopenAfterMatch?.();
  },
  onMenu: () => openMainMenu(),
});

window.gamePvpLobby = new PvpLobbyUI(screenContainer, {
  onLaunch: ({ pvp }) => {
    audio.playVictory();
    startLevel('pvp', { pvp });
  },
  onClose: () => {
    // Closing the lobby over a decided duel must leave a live menu behind it,
    // never a paused battlefield with a HUD that answers to nobody.
    if (window.gamePvp?.state?.status !== 'over') return;
    if (!battleSceneIsUp()) return;
    stopDuelScene();
  },
});

/**
 * The War Room: the six non-campaign modes plus the Blueprint picker.
 * `onCoop` reuses the duel lobby — same room, same relay, different verdict.
 */
window.gameModes = new ModesUI(modalContainer, {
  onLaunch: (mode) => {
    audio.playVictory();
    startLevel(mode.levelId, mode.options || {});
  },
  onPuzzle: (puzzleId) => {
    audio.playVictory();
    startLevel(`puzzle-${puzzleId}`);
  },
  onCoop: () => {
    audio.playClick();
    window.gamePvpLobby?.show({ coop: true });
  },
});

// Rogue Siege card picks and the Ascension fork. Lives in the modal layer so it
// paints over the HUD without moving it.
window.gameDraft = new DraftPanel(modalContainer);

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
    // Opened from the map it must come back to the map; opened from a battle
    // (the HUD codex chip) it must simply close and leave the fight alone.
    onClose: () => {
      if (navReturn === 'map') restoreAfterPanel();
    },
  }
);

// ---------------------------------------------------------------------------
// 4. DISPLAY MODE — fullscreen + landscape enforcement
// ---------------------------------------------------------------------------
// Rules live in src/system/displayMode.js; the two controllers below only own
// the browser side effects. Both gates are blocking overlays, and both pause
// the simulation so the player never loses a wave while the screen is unusable.

let gate = null;
let pausedByGate = false;

/**
 * Freeze / unfreeze the running battle. Only the GameScene is paused (the
 * canvas keeps its last frame visible); we remember that *we* paused it so a
 * manual pause is never cancelled by a rotation.
 */
function setGameplayPaused(blocked) {
  const gameScene = game.scene?.getScene?.('GameScene');
  const plugin = gameScene?.scene;
  if (!plugin) return;

  if (blocked) {
    if (plugin.isActive() && !plugin.isPaused()) {
      plugin.pause();
      pausedByGate = true;
    }
  } else if (pausedByGate) {
    if (plugin.isPaused()) plugin.resume();
    pausedByGate = false;
  }
}

const menuFullscreenBtn = document.getElementById('menu-btn-fullscreen');
const menuFullscreenLabel = document.getElementById('menu-fullscreen-label');

function applyFullscreenState(state) {
  window.gameHUD?.setFullscreenState?.(state);
  document.body.classList.toggle('is-fullscreen', Boolean(state.active));

  // Entering/leaving fullscreen changes the viewport size; ask Phaser's scale
  // manager to re-fit the canvas now rather than waiting for the next resize.
  if (game?.scale && typeof game.scale.refresh === 'function') {
    requestAnimationFrame(() => {
      try {
        game.scale.refresh();
      } catch {
        /* scene booting */
      }
    });
  }

  if (!menuFullscreenBtn) return;
  menuFullscreenBtn.classList.toggle('hidden', !state.supported);
  menuFullscreenBtn.setAttribute('aria-pressed', String(Boolean(state.active)));
  if (menuFullscreenLabel) {
    menuFullscreenLabel.textContent = state.active ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN';
  }
}

let wasFullscreen = false;

const fullscreen = new FullscreenController({
  onChange: (state) => {
    applyFullscreenState(state);

    if (state.active) {
      document.body.classList.add('is-fullscreen');
      // Android: pin the screen to landscape while we own it. Silently
      // unsupported on iOS/Firefox.
      void fullscreen.lockOrientation('landscape');
    } else {
      document.body.classList.remove('is-fullscreen');
      fullscreen.unlockOrientation();
      // Leaving fullscreen on purpose (Esc / system gesture) must not trap the
      // player behind the gate again during this landscape phase.
      if (wasFullscreen) gate?.noteFullscreenExit?.();
    }

    wasFullscreen = state.active;
    gate?.refresh();
  },
});
fullscreen.bind();
window.gameFullscreen = fullscreen;
applyFullscreenState({ supported: fullscreen.supported, active: fullscreen.active });

const gateUI = new DisplayGateUI({
  onEnterFullscreen: async () => {
    const entered = await fullscreen.request();
    // Never trap the player: if the browser refuses even on a real tap
    // (iOS Safari, restrictive policies), let them play without it.
    if (!entered) gate?.skipFullscreen();
  },
  onSkipFullscreen: () => gate?.skipFullscreen(),
});

// One automatic fullscreen attempt per landscape phase. If the browser refuses,
// the player still has the gate button; retrying on every state refresh would
// just spam rejected promises.
let autoFullscreenTried = false;

gate = new OrientationGate({
  fullscreen,
  onChange: (state) => {
    gateUI.apply(state);
    setGameplayPaused(gateBlocksGameplay(state.mode));

    if (state.mode === GATE_MODE.ROTATE) {
      autoFullscreenTried = false; // re-arm for the next rotation
    } else if (state.mode === GATE_MODE.FULLSCREEN && !autoFullscreenTried) {
      autoFullscreenTried = true;
      // Rotation is not a user gesture, so this usually rejects — but some
      // browsers keep transient activation briefly after the last tap, in
      // which case the game really does enter fullscreen automatically.
      void fullscreen.request();
    }
  },
});
gate.start();
window.gameOrientationGate = gate;

// Desktop: the first click or key press anywhere grants the transient
// activation the Fullscreen API requires, so the game launches fullscreen.
if (!gate.handheld) fullscreen.requestOnFirstGesture();

// A battle started while the gate is up (e.g. the player rotated during a
// restart) must not run unpaused behind the overlay. Re-apply the gate on every
// GameScene create, not just the first one.
function bindGateToGameScene() {
  const gameScene = game.scene?.getScene?.('GameScene');
  if (!gameScene || gameScene.__gateBound) return;
  gameScene.__gateBound = true;
  gameScene.events.on('create', () => {
    pausedByGate = false;
    if (gate && gateBlocksGameplay(gate.state?.mode)) {
      // Scene pause is queued by Phaser, so let the create tick finish first.
      setTimeout(() => setGameplayPaused(true), 0);
    }
  });
}

// Scenes exist as soon as the game has booted; if boot is still pending, wait
// for the READY event.
bindGateToGameScene();
game.events.once('ready', bindGateToGameScene);

// Paint the daily button and the save summary once at boot; both depend on the
// calendar and the save file, which are ready by now.
refreshDailyButton();
refreshMenuSummary();

// 5. Bind Main Menu Actions
document.getElementById('menu-btn-play')?.addEventListener('click', () => {
  // Must happen synchronously inside the click handler to count as a gesture.
  void fullscreen.request();
  // PLAY opens the world map; the map is where a level is actually chosen.
  openLevelSelect();
});

document.getElementById('menu-btn-fullscreen')?.addEventListener('click', () => {
  audio.playClick();
  void fullscreen.toggle();
});

document.getElementById('menu-btn-daily')?.addEventListener('click', () => {
  audio.playClick();
  // Must happen inside the gesture, like PLAY.
  void fullscreen.request();
  const run = refreshDailyButton();
  if (!run) return;
  // Starting the run is what keeps the streak alive — winning pays the gems.
  window.gameDaily?.recordPlay(run.key);
  startLevel(run.levelId, { dailyKey: run.key, dailyModifier: run.modifier });
});

document.getElementById('menu-btn-duel')?.addEventListener('click', () => {
  audio.playClick();
  window.gamePvpLobby?.show();
});

document.getElementById('menu-btn-modes')?.addEventListener('click', () => {
  audio.playClick();
  window.gameModes?.show();
});

document.getElementById('menu-btn-achievements')?.addEventListener('click', () => {
  audio.playClick();
  menuOverlay()?.classList.add('hidden');
  hudLayer()?.classList.add('hidden');
  window.gameAchievements?.show();
});

document.getElementById('menu-btn-forge')?.addEventListener('click', () => {
  audio.playClick();
  menuOverlay()?.classList.add('hidden');
  hudLayer()?.classList.add('hidden');
  window.gameForge?.show();
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
  // F toggles native fullscreen everywhere (menu, battle, codex).
  if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.target?.isContentEditable) return;
    event.preventDefault();
    void fullscreen.toggle();
    return;
  }

  if (event.key !== 'Escape') return;
  for (const id of ['instructions-modal', 'credits-modal']) {
    document.getElementById(id)?.classList.add('hidden');
  }
});

// Global user interaction listener to unlock Web Audio on first gesture
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
