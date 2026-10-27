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
import { continueCue } from './ui/menuCue.js';
import { ResultScreenUI } from './ui/ResultScreenUI.js';
import { PvpLobbyUI } from './ui/PvpLobbyUI.js';
import { DuelResultUI } from './ui/DuelResultUI.js';
import { ModesUI } from './ui/ModesUI.js';
import { DraftPanel } from './ui/DraftPanel.js';
import { ProgressStore } from './systems/Progression.js';
import { AchievementsUI } from './ui/AchievementsUI.js';
import { ForgeUI } from './ui/ForgeUI.js';
import { PetShopUI } from './ui/PetShopUI.js';
import { BlessingsUI } from './ui/BlessingsUI.js';
import { DailyStore, dailyRun } from './systems/DailyChallenge.js';
import { getNextLevel, getLevel } from './data/levelData.js';
import { MODES, MODE_KINDS } from './data/modeData.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { audio } from './rendering/AudioSynth.js';
import { audioDirector } from './rendering/audioDirector.js';
import { SettingsUI } from './ui/SettingsUI.js';
import { QualityManager } from './systems/QualityManager.js';
import { DifficultyStore, DEFAULT_DIFFICULTY } from './systems/Difficulty.js';
import { soundIcon } from './ui/soundIcon.js';
import { FullscreenController } from './system/FullscreenController.js';
import { OrientationGate } from './system/OrientationGate.js';
import { DisplayGateUI } from './ui/DisplayGateUI.js';
import { GATE_MODE, gateBlocksGameplay } from './system/displayMode.js';
import { lockViewport } from './system/viewportLock.js';
import { CloudSave } from './systems/CloudSave.js';
import { resolveSupabaseConfig, createSupabaseClient } from './net/supabaseClient.js';
import { NameGateUI } from './ui/NameGateUI.js';

// 1. Instantiate shared systems for UI
const globalLeaderboard = new Leaderboard();

// Before the first frame: the graphics profile owns a `data-quality` attribute
// on <html>, and CSS reads it (blur, parallax, ambience). Applying it after the
// menu paints would flash the expensive version on the devices that cannot
// afford it.
window.gameQuality = new QualityManager({
  // A cheaper profile also means fewer ambience beds, so the audio layer has
  // to re-read the budget the moment the choice changes.
  onChange: () => audioDirector.sync?.(),
});

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
// The scene handle is what the automated probes drive (hero check, viewport
// matrix, balance runs). In dev it is always on; in a production bundle it is
// opt-in with `?probe=1` so a built artifact can still be smoke-tested without
// shipping a permanent global hook to every player.
const probeRequested = (() => {
  try {
    return new URLSearchParams(window.location.search).has('probe');
  } catch {
    return false;
  }
})();
if (import.meta.env?.DEV || probeRequested) window.game = game;

// Campaign progress outlives any single battle: GameScene.init() reads it for
// the level definition, the unlock graph and the saved star ratings.
window.gameProgress = new ProgressStore();

// The realm ledger. `ProgressStore` stays the source of truth (localStorage,
// offline, always); this mirrors every save into Supabase so the ranking and a
// second device can read it. With no project configured the client reports the
// cloud as off and the game runs exactly as it did before.
const supabaseConfig = resolveSupabaseConfig();
const cloudClient = createSupabaseClient(supabaseConfig);
cloudClient.source = supabaseConfig.source;
window.gameCloud = new CloudSave({ client: cloudClient, store: window.gameProgress });
// One choice, one store: the briefing writes it, the battle scene reads it, and
// the next launch remembers it.
window.gameDifficulty = new DifficultyStore();
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
  cloud: window.gameCloud,
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
  if (refresh) refreshRealmLedger();
  menuOverlay()?.classList.remove('hidden');
  window.gameWorldMap?.hide?.();
  hudLayer()?.classList.add('hidden');
}

/** Reveal the main menu without touching the ledger or the map. */
function revealMainMenu() {
  const overlay = menuOverlay();
  if (!overlay) return;
  overlay.classList.remove('hidden', 'is-leaving');
  hudLayer()?.classList.add('hidden');
  window.gameWorldMap?.hide?.();
}

/* ----------------------------------------------------------- the name gate
 *
 * A commander name is required before the menu: it is the key the shared
 * ranking and the save mirror are built on. The gate presents; `CloudSave`
 * decides. `MenuScene.create()` leaves the menu down while
 * `window.gameCloud.needsName` is true, so there is no frame where the menu is
 * visible but unusable.
 */
const nameGate = new NameGateUI(document.getElementById('name-gate'), {
  cloud: window.gameCloud,
  onAccepted: () => {
    revealMainMenu();
    refreshContinueCue();
  },
});
window.gameNameGate = nameGate;

// A conflict means the ledger now has this name under a different device (a
// reset project, a restored backup). The local save is kept, the name is not:
// the gate comes back and asks for another one.
window.gameCloud.subscribe((snap) => {
  if (snap.status === 'conflict' && snap.statusReason === 'taken' && !nameGate.isOpen) {
    window.gameCloud.releaseIdentity();
    nameGate.reopen('taken');
  }
});

window.gameCloud.start().then((snap) => {
  if (snap.hasIdentity) {
    revealMainMenu();
    refreshContinueCue();
  } else {
    nameGate.open({ focus: false });
  }
});

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
  audioDirector.setScene('realm');
  audioDirector.setLocation(null);
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
  audioDirector.setScene('battle');
  audioDirector.setLocation('battle');
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
    // The preset travels with the launch so a restart cannot read a newer
    // choice than the one the player made when they pressed DEPLOY.
    difficulty: window.gameDifficulty?.id || DEFAULT_DIFFICULTY,
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
 * Today's real daily run, read from the calendar and the save file.
 *
 * The main menu no longer carries a daily button, so this is the single reader
 * for the shrine on the world map (and for the map's own shrine panel, which
 * computes the same thing from the same module).
 */
function dailyRunForToday() {
  const daily = window.gameDaily;
  if (!daily) return null;
  const run = dailyRun({
    unlockedIds: window.gameProgress ? window.gameProgress.profile.unlocked : ['level-1'],
  });
  return { ...run, streak: daily.currentStreak(run.key), won: daily.isWon(run.key) };
}

/**
 * Start today's run. Recording the play is what keeps the streak alive; the
 * gems pay out on the win, in GameScene, exactly as they always have.
 */
function launchDaily() {
  const run = dailyRunForToday();
  if (!run) return null;
  window.gameDaily?.recordPlay(run.key);
  startLevel(run.levelId, { dailyKey: run.key, dailyModifier: run.modifier });
  return run;
}

/**
 * Re-read the ledger on the world map. Every screen that can change gold, gems,
 * stars or medals calls this on the way out, so the realm never shows a stale
 * number (the Forge used to repaint the menu's three chips; those chips now
 * live on the map).
 */
function refreshRealmLedger() {
  window.gameWorldMap?.refresh?.();
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
  audioDirector.setScene('menu');
  audioDirector.setLocation(null);
  navReturn = 'menu';
  refreshRealmLedger();
  syncSoundButtons();
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
  refreshContinueCue();
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
  onPurchase: () => refreshRealmLedger(),
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

// The Muster Hall: the Vanguard's rank ladder and the five companions, bought
// with banked gold. It lives on the world map, never in a battle, so a purchase
// is always a decision made between fights.
window.gamePets = new PetShopUI(screenContainer, window.gameProgress, {
  onClose: () => restoreAfterPanel(),
  onPurchase: () => refreshRealmLedger(),
  onPromote: () => refreshRealmLedger(),
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
    difficulty: window.gameDifficulty,
    onDifficulty: (id) => window.gameDifficulty?.set(id),
    // Champions' Hall reads the same board the LeaderboardUI shows. A getter,
    // so a run finished after the map was built is on the wall when you look.
    records: () => globalLeaderboard.getTop(3),
    onDeploy: (levelId) => startLevel(levelId),
    onDaily: () => launchDaily(),
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
        pets: () => window.gamePets?.show(),
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
    onSound: () => {
      const muted = audio.toggleMute();
      syncSoundButtons();
      return muted;
    },
    onFullscreen: () => void fullscreen.toggle(),
    onSettings: () => window.gameSettings?.show(),
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
  // The board a run belongs on is decided from the run itself, so the mode and
  // the level travel with the numbers. Without them every run would be filed as
  // unfiled and the per-mode boards would stay empty.
  onLeaderboard: (result) =>
    window.gameLeaderboardUI.show({
      status: result.outcome,
      mode: result.mode ?? null,
      level: result.level ?? null,
      pvp: Boolean(result.pvp),
      coop: Boolean(result.coop || result.level?.coop),
      score: result.score,
      waves: result.waves,
      totalWaves: result.totalWaves ?? null,
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

// The world map owns the ledger now; paint it once the save is loaded so the
// first reveal of the realm is already right.
refreshRealmLedger();
syncSoundButtons();
refreshContinueCue();

// ---------------------------------------------------------------- main menu
//
// The menu is title + PLAY CAMPAIGN + two utility keys. Every other
// destination (daily, duel, war room, forge, medals, champions, codex, manual,
// credits) moved onto the world map, so there is exactly one navigation layer
// and no second copy of a feature.

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Paint both sound keys (menu + map) from the one AudioSynth singleton. */
function syncSoundButtons() {
  const muted = Boolean(audio.muted);
  for (const [btnId, imgId] of [
    ['menu-btn-sound', 'menu-sound-img'],
    ['wm-sound', 'wm-sound-img'],
  ]) {
    const btn = document.getElementById(btnId);
    const img = document.getElementById(imgId);
    if (btn) btn.setAttribute('aria-pressed', String(muted));
    if (img) {
      const next = soundIcon(muted);
      if (!img.getAttribute('src')?.endsWith(next.split('/').pop())) img.setAttribute('src', next);
    }
  }
}

/**
 * The plate's second line: where the next march actually goes.
 *
 * This is the continue cue — the only piece of live save data left on the menu,
 * and it exists because "PLAY CAMPAIGN" alone cannot tell a returning keeper
 * whether they are resuming or starting over. It reads the same
 * `currentObjective()` the map's beacon and the castle panel use, so the menu,
 * the map marker and the objective card can never disagree.
 */
function refreshContinueCue() {
  const el = document.getElementById('menu-play-sub');
  if (el) el.textContent = continueCue(window.gameProgress);
}

let menuLeaving = false;

/** Fade the menu out, then reveal the realm behind it. */
function enterRealm() {
  if (menuLeaving) return;
  const overlay = menuOverlay();
  // PLAY opens the world map; the map is where a level is actually chosen.
  if (!overlay || prefersReducedMotion()) {
    showLevelSelect();
    return;
  }
  menuLeaving = true;
  overlay.classList.add('is-leaving');
  setTimeout(() => {
    overlay.classList.remove('is-leaving');
    menuLeaving = false;
    showLevelSelect();
  }, 240);
}

document.getElementById('menu-btn-play')?.addEventListener('click', () => {
  // Must happen synchronously inside the click handler to count as a gesture.
  void fullscreen.request();
  audio.playClick();
  enterRealm();
});

document.getElementById('menu-btn-sound')?.addEventListener('click', () => {
  audio.toggleMute();
  audio.playClick();
  syncSoundButtons();
});

// The faders live behind this key. Mute stays on the speaker, because muting
// has to be one tap; everything else is a decision you open.
document.getElementById('menu-btn-settings')?.addEventListener('click', () => {
  audio.playClick();
  window.gameSettings?.show();
});

document.getElementById('menu-btn-fullscreen')?.addEventListener('click', () => {
  audio.playClick();
  void fullscreen.toggle();
});

document.getElementById('btn-close-how')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('instructions-modal')?.classList.add('hidden');
});
document.getElementById('btn-done-how')?.addEventListener('click', () => {
  audio.playClick();
  document.getElementById('instructions-modal')?.classList.add('hidden');
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

// Music and ambience start on the first real gesture (browser policy) and then
// follow the screens. `arm()` owns those listeners; nothing autoplays.
window.gameSettings = new SettingsUI({
  audio,
  quality: window.gameQuality,
  onChange: () => syncSoundButtons(),
});
audioDirector.arm();
// Debug handles: the editor console and the browser checks read the live mixer
// and the scene the director thinks it is playing.
window.gameAudio = audio;
window.gameAudioDirector = audioDirector;
