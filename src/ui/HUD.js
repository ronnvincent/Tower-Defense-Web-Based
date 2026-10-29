import { BUILD_OPTIONS, BUILD_GROUPS, getBuildDefinition, groupForBuild, SUPPORT_LINES } from '../data/towerData.js';
import { TARGETING_LABELS, TARGETING_MODE, TARGETING_SHORT } from '../entities/TowerTargeting.js';
import { TOWER_VISUALS } from '../data/towerVisuals.js';
import { MAX_LEVEL, dps } from '../data/towerAscension.js';
import { STARTING_COINS, STARTING_BASE_HEALTH } from '../config/gameConfig.js';
import { audio } from '../rendering/AudioSynth.js';
import { soundIcon } from './soundIcon.js';
import { clampPanel, placeInspector } from './panelPlacement.js';
import { HudLayout } from './hudLayout.js';
import { ENEMY_TYPES } from '../data/enemyData.js';
import { COMBO_WINDOW_MS } from '../systems/ComboMeter.js';
import { formatPrepClock } from '../systems/WavePrep.js';
import { BASTION_STATE, bastionState } from '../systems/Bastion.js';
import { focusReadout } from '../systems/FocusTarget.js';
import { applyShell, readShellOverride, resolveShell } from './shellMode.js';
import { haptics } from '../systems/Haptics.js';
import { targetBadge, targetLabel } from '../systems/TargetCategories.js';

/** "1.25" / "2" — never "1.50", which reads like a precision bug. */
function formatMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '1';
  return String(Number(n.toFixed(2)));
}

const PAN_HINT_KEY = 'td-dsalgo:camera-hint:v1';
/** Remember whether the player folded the forge dock away. */
const DOCK_STATE_KEY = 'td-dsalgo:dock-collapsed:v1';
/** Remember which defence tab the player last used. */
const DOCK_GROUP_KEY = 'td-dsalgo:dock-group:v1';

/**
 * Mode ids (`GameScene#runModeLabel`) → the brass cap printed on the run rail.
 *
 * Kept here rather than in each mode's data because the HUD only ever gets the
 * id: a rail that reads "ROGUE-SIEGE" is a debug string, "ROGUE SIEGE" is UI.
 */
const RUN_MODE_LABELS = Object.freeze({
  rogue: 'ROGUE SIEGE',
  titan: 'TITAN RUSH',
  blueprint: 'BLUEPRINT',
  puzzle: 'BLUEPRINT',
  coop: 'CO-OP SIEGE',
});

const TARGETING_MODES = [
  { mode: 'first', label: 'FIRST', title: 'Target the enemy furthest along the path' },
  { mode: 'strongest', label: 'STRONG', title: 'Target the enemy with the highest current health' },
  { mode: 'nearest', label: 'NEAR', title: 'Target the enemy closest to this tower' },
  { mode: 'last', label: 'LAST', title: 'Target the enemy nearest the spawn portal' },
];

export class HUD {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks || {};
    this.selectedBuildKey = null;
    this.inspectedTower = null;
    // Handles for the two feedback timers (see bumpGold / flashBaseHit); kept
    // so a second event can cancel the first instead of stacking timers.
    this.goldBumpTimer = null;
    this.waveClearTimer = null;
    this.nudgeAt = 0;
    this.nudgeKey = null;
    this.vignetteTimer = null;
    this.baseHitTimer = null;
    this.toastTimer = null;
    this.hintTimer = null;
    this.inspectorPinned = false;
    this.inspectorCollapsed = false;
    this.inspectorAnchorRatio = null;
    this.contractSignature = null;
    this.setContracts?.([]);
    this.setRunStatus?.({ chips: [] });
    this.lastToast = '';
    this.zoomState = { zoom: 1, min: 1, max: 3, atFit: true, canZoomIn: true, canZoomOut: false };
    this.coins = 0;
    this.earlyCallAvailable = false;
    // The auto-start window currently on screen (see `updatePrepClock`).
    this.prepActive = false;
    this.prepBaseText = '';
    this.comboActive = false;
    this.comboTimer = null;
    this.fullscreenState = { supported: true, active: false };
    this.dockCollapsed = false;
    // Which dock tab is open. Persisted with the fold state so a phone player who
    // lives in the engineer tab does not re-open on the keeps every battle.
    this.dockGroup = this.readDockGroup();
    // Which of the two HUD layouts this device gets. Applied to <html> before
    // the markup exists so the first paint is already the right layout instead
    // of the desktop bands flashing on a phone.
    this.shell = this.resolveShellMode();
    applyShell(document, this.shell);

    this.initDOM();
    this.bindEvents();
    // Restore the player's dock preference before the first frame so the
    // measured --dock-clearance is right from the start. The phone shell always
    // starts folded: the fold *is* the layout there (one BUILD button), and a
    // sheet that opens itself over the lane on every battle would be the exact
    // problem this layout exists to fix.
    this.setDockCollapsed(this.shell === 'mobile' ? true : this.readDockCollapsed(), { persist: false });
    this.syncDockScrim();
    this.bindInspectorDrag();
    this.bindFamilyMenu();
    this.bindBuildTips();
    this.bindViewport();

    // Publish the real dock / top-bar heights as CSS variables so the floating
    // controls (camera pill, camera hint, toast) can never overlap them.
    this.layout = new HudLayout().observe();
  }

  /**
   * Hero panel.
   *
   * Called from the scene's simulation tick (throttled to ~8 Hz), so it writes
   * text and one width per update and never touches layout in between. A downed
   * hero keeps the panel up — the point of the down state is that the player can
   * see why the Vanguard stopped answering.
   *
   * @param {{health:number,maxHealth:number,down:boolean,strikeReady:boolean,strikeCooldownMs:number,strikeCooldownMax:number,moving:boolean}|null} hero
   * @param {{armed?:boolean}} [options]
   */
  /* ================================================================= SHELL */

  /**
   * Decide the shell from the pointer and the viewport, letting `?hud=mobile`
   * or `?hud=desktop` win. Re-run on resize so rotating a tablet, plugging in a
   * mouse or a browser window growing past the tablet width lands on a layout
   * that fits.
   */
  resolveShellMode() {
    const win = typeof window === 'undefined' ? null : window;
    let coarse = false;
    try {
      coarse = Boolean(win?.matchMedia?.('(pointer: coarse)')?.matches);
    } catch {
      coarse = false;
    }
    return resolveShell({
      coarse,
      width: win?.innerWidth || 0,
      height: win?.innerHeight || 0,
      override: readShellOverride(win?.location?.search || ''),
    });
  }

  /** True while the corner layout is live. */
  get isMobileShell() {
    return this.shell === 'mobile';
  }

  /**
   * Re-resolve on resize / rotation. Changing shell is rare (the game is locked
   * to landscape), so this only has to restore the defaults of the shell it
   * lands on: the phone shell folds the forge, drops a pinned inspector and
   * lets CSS own the inspector box again.
   */
  syncShell() {
    const next = this.resolveShellMode();
    const changed = next !== this.shell;
    this.shell = next;
    applyShell(document, next);
    this.syncShellChrome();
    this.syncTopBarMetric();
    if (changed) {
      if (next === 'mobile') {
        this.setDockCollapsed(true, { persist: false, clearSelection: false });
        this.inspectorPinned = false;
        this.clearInspectorBox();
      } else {
        this.syncDockScrim();
        this.layout?.schedule?.();
      }
    }
    return next;
  }

  /**
   * Publish the measured height of the top bar as `--hud-topbar-h`.
   *
   * The bar's height is content-driven — clamped type sizes plus the wave
   * strip inside it — so its bottom edge lands at 93 px on a 1920 screen and at
   * 52 px on an 844x390 phone. Panels hanging off the top-right corner used a
   * fixed 60 px offset, which put the hero card over the bar on desktop. The
   * measured number is the only anchor that survives every viewport.
   */
  /**
   * One scale factor for the whole HUD, plus a compact tier.
   *
   * The DOM layer is laid out in viewport pixels while the canvas is a
   * FIT-scaled 1280×768 stage, so at 1024×640 the HUD used to stay exactly as
   * big as it is at 1280 and *feel* bigger — the same bar, the same dock, a
   * smaller battlefield. `--ui-scale` is the ratio between the fitted stage
   * width and the authored one, floored at 0.84 so 14 px text never drops under
   * 12 px on the narrowest supported window.
   *
   * `data-density="compact"` is the second lever: below 1100 px wide (or 640 px
   * tall) the bar drops its secondary labels and the dock tightens its gaps.
   * It is a *density*, not a third shell — the phone shell still wins when the
   * pointer is coarse.
   */
  syncDensity() {
    const win = typeof window === 'undefined' ? null : window;
    if (!win?.document?.documentElement) return;
    const width = win.innerWidth || 1280;
    const height = win.innerHeight || 768;
    // Mirrors `--stage-width: min(100vw, 100dvh * 25 / 12)`.
    const stage = Math.min(width, (height * 25) / 12);
    const scale = Math.max(0.84, Math.min(1, stage / 1280));
    const root = win.document.documentElement;
    const next = scale.toFixed(3);
    if (this.uiScale !== next) {
      this.uiScale = next;
      root.style.setProperty('--ui-scale', next);
    }
    const density = width <= 1100 || height <= 640 ? 'compact' : 'normal';
    if (root.dataset.density !== density) root.dataset.density = density;
  }

  /**
   * The family switcher.
   *
   * One button, one popover. Outside-click and Escape close it; picking a tab
   * closes it through `setDockGroup`. The four `.dock-tab` buttons inside are
   * the same nodes, ids and handlers the tab strip had, so the roving tabindex,
   * the arrow keys and the storage key all still work.
   */
  bindFamilyMenu() {
    const button = document.getElementById('dock-family-btn');
    const tabs = document.getElementById('dock-tabs');
    if (!button || !tabs) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setFamilyMenuOpen(!tabs.classList.contains('is-open'));
    });
    tabs.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.setFamilyMenuOpen(false);
        button.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!tabs.classList.contains('is-open')) return;
      if (tabs.contains(event.target) || button.contains(event.target)) return;
      this.setFamilyMenuOpen(false);
    });
  }

  setFamilyMenuOpen(open) {
    const tabs = document.getElementById('dock-tabs');
    const button = document.getElementById('dock-family-btn');
    if (!tabs || !button) return;
    tabs.classList.toggle('is-open', Boolean(open));
    button.setAttribute('aria-expanded', String(Boolean(open)));
  }

  /**
   * The build card's hover / focus card.
   *
   * A 76 px card has room for an icon, a hotkey and a price. Damage, range,
   * rate, target category and the description live here, and they open on
   * keyboard focus as well as on hover — a tooltip that only answers a mouse is
   * a feature half the players cannot use.
   */
  bindBuildTips() {
    const dock = document.getElementById('hud-bottom-dock');
    if (!dock) return;
    dock.addEventListener('pointerover', (event) => {
      const card = event.target?.closest?.('.build-card');
      if (card) this.showBuildTip(card);
    });
    dock.addEventListener('pointerout', (event) => {
      const card = event.target?.closest?.('.build-card');
      if (!card) return;
      if (card.contains(event.relatedTarget)) return;
      this.hideBuildTip();
    });
    dock.addEventListener('focusin', (event) => {
      const card = event.target?.closest?.('.build-card');
      if (card) this.showBuildTip(card);
    });
    dock.addEventListener('focusout', (event) => {
      const card = event.target?.closest?.('.build-card');
      if (!card) return;
      if (card.contains(event.relatedTarget)) return;
      this.hideBuildTip();
    });
  }

  showBuildTip(card) {
    const tip = document.getElementById('build-tip');
    const dock = document.getElementById('hud-bottom-dock');
    if (!tip || !dock || !card) return;
    const def = getBuildDefinition(card.dataset.key);
    if (!def) return;
    const level = def.levels?.[0] || {};
    const stats = [];
    if (Number.isFinite(level.damage)) stats.push(`<span>DMG <b>${level.damage}</b></span>`);
    if (Number.isFinite(level.range)) stats.push(`<span>RNG <b>${level.range}</b></span>`);
    if (Number.isFinite(level.cooldown) && level.cooldown > 0) {
      stats.push(`<span>RATE <b>${(1000 / level.cooldown).toFixed(1)}/s</b></span>`);
    }
    tip.innerHTML = `
      <span class="build-tip-name">${def.name}</span>
      ${stats.length ? `<span class="build-tip-stats">${stats.join('')}</span>` : ''}
      <span class="build-tip-desc">${def.description || ''}</span>
      <span class="build-tip-price">${def.cost} gold · hits ${targetLabel(def).toLowerCase()} creeps</span>
    `;
    tip.hidden = false;
    // Centre the card on the card that owns it, clamped inside the dock so it
    // can never poke off the edge on the last card in the row.
    const half = 124;
    const width = dock.clientWidth || 0;
    const centre = (card.offsetLeft || 0) + (card.offsetWidth || 0) / 2;
    const clamped = Math.min(Math.max(centre, half), Math.max(half, width - half));
    tip.style.setProperty('--tip-x', `${Math.round(clamped)}px`);
  }

  hideBuildTip() {
    const tip = document.getElementById('build-tip');
    if (tip) tip.hidden = true;
  }

  syncTopBarMetric() {
    const bar = document.getElementById('hud-top-bar');
    if (!bar) return;
    const height = Math.round(bar.getBoundingClientRect().height);
    if (height > 0) this.container.style.setProperty('--hud-topbar-h', `${height}px`);
  }

  /* ================================================================ MARKUP */

  initDOM() {
    this.container.innerHTML = `
      <div id="hud-top-bar" class="hud-panel hud-topbar">
        <div class="hud-stat-group">
          <!-- Left zone: the three numbers that decide the run. Each is an iron
               socket with a 14 px label over its value; the base-integrity one
               also carries a 3 px fill along its bottom edge, which is the only
               part of the bar that moves on damage. -->
          <div class="hud-stat hud-stat-hp" id="stat-base-hp" title="Base integrity — if this hits 0 the realm falls" role="img" aria-label="Base integrity">
            <img class="hud-icon-img heart-pulse" src="/assets/ui/icon_heart.svg" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">BASE</span>
              <span class="hud-value" id="val-base-hp">${STARTING_BASE_HEALTH} / ${STARTING_BASE_HEALTH}</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-coins" title="Treasury — spend gold on defences" role="img" aria-label="Treasury">
            <img class="hud-icon-img gold-coin" src="/assets/ui/icon_coin.png" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">GOLD</span>
              <span class="hud-value gold-text" id="val-coins">${STARTING_COINS}</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-score" title="Total score" role="img" aria-label="Score">
            <img class="hud-icon-img" src="/assets/ui/icon_trophy.png" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">SCORE</span>
              <span class="hud-value" id="val-score">0</span>
            </div>
          </div>
        </div>

        <div class="hud-stat-group hud-center-group">
          <!-- Center zone: ONE line — WAVE 1 / 6 · 10 left — with the
               enemies-remaining meter as a rule along the bottom edge. -->
          <div class="hud-wave-badge" title="Current wave">
            <span class="hud-wave-label">WAVE</span>
            <span class="hud-wave-number" id="val-wave">1 / 6</span>
            <span class="hud-wave-sub" id="val-enemies-left">10 left</span>
            <span class="hud-wave-best hidden" id="val-endless-best">BEST 0</span>
            <span class="hud-wave-meter" aria-hidden="true"><i id="wave-meter-fill"></i></span>
          </div>
          <div class="hud-wave-stack">
            <button id="btn-start-wave" class="game-btn game-btn-primary game-btn-pulse" title="Start the next wave (Space)">
              <span class="btn-glow"></span>
              <span class="btn-text">START WAVE</span>
              <span class="btn-sub" id="start-wave-sub"></span>
            </button>
          </div>
          <div id="combo-chip" class="hud-combo hidden" aria-live="polite">
            <span class="hud-combo-mult" id="combo-mult">×1.25</span>
            <span class="hud-combo-chain" id="combo-chain">3 KILL CHAIN</span>
            <span class="hud-combo-bar"><i id="combo-bar-fill"></i></span>
          </div>
        </div>

        <div class="hud-stat-group hud-controls-group">
          <button id="btn-speed" class="game-btn game-btn-icon" title="Simulation speed (toggle 1× / 2×)" aria-label="Simulation speed">1×</button>
          <button id="btn-pause" class="game-btn game-btn-icon" title="Pause / resume the battle" aria-label="Pause">
            <img id="img-pause" class="btn-icon-img" src="/assets/ui/icon_pause.png" alt="" />
          </button>
          <button id="btn-mute" class="game-btn game-btn-icon" title="Toggle sound" aria-label="Toggle sound">
            <img id="img-mute" class="btn-icon-img" src="/assets/ui/icon_audio_on.png" alt="" />
          </button>
          <button
            id="btn-fullscreen"
            class="game-btn game-btn-icon fs-toggle"
            title="Enter fullscreen (F)"
            aria-label="Toggle fullscreen"
            aria-pressed="false"
          >
            <svg class="fs-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>

        <div id="run-strip" class="run-strip hidden">
          <span class="run-strip-cap hidden" id="run-strip-cap"></span>
          <span class="run-status hidden" id="run-status" aria-live="polite"></span>
        </div>
      </div>

      <div id="wave-preview" class="wave-preview hidden" aria-live="polite"></div>

      <div id="hud-level-chip" class="hud-panel hud-level-chip" aria-live="polite">
        <span class="hud-level-name" id="hud-level-name">VERDANT MARCHES</span>
      </div>

      <button id="focus-chip" class="focus-chip hud-panel hidden" title="Release the focus target (Esc)" aria-live="polite">
        <span class="focus-chip-ring" aria-hidden="true"></span>
        <span class="focus-chip-body">
          <span class="focus-chip-name" id="focus-name">SHAMAN</span>
          <span class="focus-chip-hp" id="focus-hp">240 / 480</span>
        </span>
        <span class="focus-chip-x" aria-hidden="true">✕</span>
      </button>

      <div id="pause-overlay" class="pause-overlay hidden" role="dialog" aria-label="Battle paused">
        <div class="pause-card">
          <p class="pause-title">SIMULATION PAUSED</p>
          <div class="pause-actions">
            <button id="btn-resume" class="game-btn game-btn-primary">RESUME</button>
            <button id="btn-restart" class="game-btn game-btn-gold" title="Start this level again from wave 1">RESTART</button>
            <button id="btn-pause-settings" class="game-btn game-btn-gold" title="Sound, graphics, shake, damage numbers">SETTINGS</button>
            <button id="btn-reset-view" class="game-btn game-btn-gold" title="Fit the whole map (0)">RESET VIEW</button>
            <button id="btn-blessings" class="game-btn game-btn-gold" title="Spend gold on a blessing for this battle">BLESSINGS</button>
            <button id="btn-codex" class="game-btn game-btn-gold" title="Algorithm codex (C)">CODEX</button>
            <button id="btn-menu" class="game-btn game-btn-danger">LEAVE BATTLE</button>
          </div>
          <p id="restart-warning" class="pause-warning hidden">
            Restarting discards this battle — tap again to confirm.
          </p>
          <p id="pause-status" class="pause-status" aria-live="polite"></p>
          <div id="pause-contracts" class="pause-contracts hidden" aria-live="polite"></div>
          <p id="quit-warning" class="pause-warning hidden">
            Leaving now discards this battle — tap again to confirm.
          </p>
        </div>
      </div>

      <div id="pause-chip" class="pause-chip hidden">SIMULATION PAUSED</div>

      <div id="boss-banner" class="boss-panel hud-panel hidden">
        <div class="boss-title-row">
          <span class="boss-tag">BOSS</span>
          <span id="boss-name" class="boss-name">STONE COLOSSUS</span>
          <span id="boss-phase-badge" class="boss-phase-badge">PHASE 1</span>
          <span id="boss-extra" class="boss-phase-badge boss-extra hidden">+1</span>
        </div>
        <div class="boss-bar-frame">
          <div id="boss-shield-bar" class="boss-shield-bar"></div>
          <div id="boss-hp-bar" class="boss-hp-bar"></div>
        </div>
        <div class="boss-hp-values">
          <span id="boss-hp-text">1600 / 1600 HP</span>
          <span id="boss-ability-text" class="boss-ability-text">Hardened Carapace</span>
        </div>
      </div>

      <div id="toast-banner" class="toast-banner hidden" role="status" aria-live="polite"></div>

      <div id="camera-hint" class="camera-hint hidden">
        <span class="camera-hint-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16M12 4l-3 3M12 4l3 3M12 20l-3-3M12 20l3-3M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" /></svg>
        </span>
        <span id="camera-hint-text"><strong>Drag</strong> to pan · <strong>Scroll</strong> or <strong>pinch</strong> to zoom · <strong>Tap a creep</strong> to focus fire</span>
        <button id="btn-dismiss-hint" class="camera-hint-dismiss" aria-label="Dismiss camera hint">✕</button>
      </div>

      <div id="camera-cluster" class="hud-panel camera-cluster" role="group" aria-label="Camera controls">
        <button id="btn-zoom-out" class="cam-btn" title="Zoom out (−)" aria-label="Zoom out">−</button>
        <span id="zoom-readout" class="cam-zoom-value" title="Drag the map to pan. Press 0 to reset.">100%</span>
        <button id="btn-zoom-in" class="cam-btn" title="Zoom in (+)" aria-label="Zoom in">+</button>
        <span class="cam-divider" aria-hidden="true"></span>
        <button id="btn-zoom-fit" class="cam-btn cam-btn-fit" title="Fit the whole map (0)" aria-label="Reset view">⤢</button>
      </div>

      <div id="tower-inspector" class="hud-panel hud-inspector hidden" role="dialog" aria-label="Tower inspector">
        <div class="inspector-shell">
          <div class="inspector-header" id="inspector-drag-handle" title="Drag to move this panel">
            <div class="inspector-title-group">
              <span class="inspector-grip" aria-hidden="true">⠿</span>
              <span class="inspector-name" id="inspect-name">Archer Tower</span>
              <span class="inspector-level" id="inspect-level">★ Level 1</span>
              <!-- What this defence can hit, in the title row: the answer must
                   not be two scrolls away from the question. -->
              <span class="inspector-targets" id="inspect-targets">GROUND + AIR</span>
            </div>
            <div class="inspector-header-btns">
              <button id="btn-collapse-inspect" class="inspector-chip-btn" title="Collapse panel" aria-label="Collapse panel">▾</button>
              <button id="btn-close-inspect" class="btn-close" title="Close inspector" aria-label="Close inspector">✕</button>
            </div>
          </div>

          <div class="inspector-body" id="inspector-body">
            <div id="inspect-targeting" class="inspector-targeting-group">
              <span class="lbl">TARGETING PRIORITY</span>
              <div class="targeting-buttons">
                ${TARGETING_MODES.map(
                  (t, i) =>
                    `<button class="target-btn ${i === 0 ? 'active' : ''}" data-mode="${t.mode}" title="${t.title}">${t.label}</button>`
                ).join('')}
              </div>
            </div>

            <div id="inspect-stats" class="inspector-stats-grid"></div>
          </div>

          <!-- Upgrade and sell sit OUTSIDE the scrolling body: they are the two
               things the panel exists for, and a level-2 tower's stat sheet is
               tall enough to push them below the fold on a 640 px window. -->
          <div id="inspector-actions-container" class="inspector-actions"></div>
        </div>
      </div>

      <div id="hud-rival" class="hud-panel hud-rival hidden" aria-live="polite">
        <span class="rival-tag">RIVAL</span>
        <span class="rival-name" id="rival-name">CHALLENGER</span>
        <span class="rival-stat"><b id="rival-wave">0</b>/<span id="rival-waves">8</span> waves</span>
        <span class="rival-stat rival-score"><b id="rival-score">0</b> pts</span>
        <span class="rival-core" title="Rival core integrity"><i id="rival-core-fill"></i></span>
        <span class="rival-state" id="rival-state">LIVE</span>
      </div>

      <div id="powerup-rail" class="hud-panel powerup-rail" role="group" aria-label="Powerups"></div>

      <div id="dock-scrim" class="dock-scrim hidden" aria-hidden="true"></div>

      <!--
        THE FORGE — one 84 px band, left to right: fold handle · family
        switcher · cards · build-point budget.

        The family pages used to be a 30 px tab strip inside the band, which
        cost 34 px of height for a control that only ever picked a filter. The
        four tabs still exist with the same ids and handlers; they now open as
        a popover from the family button.
      -->
      <div id="hud-bottom-dock" class="hud-panel hud-dock">
        <div id="placement-hint" class="placement-hint hidden">
          <span id="placement-hint-text">Placing defence…</span>
          <button id="btn-cancel-placement" class="placement-hint-cancel" aria-label="Cancel placement">ESC</button>
        </div>
        <!-- Hover / focus card: the stats the 68 px card face has no room for. -->
        <div id="build-tip" class="build-tip" role="tooltip" hidden></div>
        <div class="dock-head">
          <button id="btn-toggle-dock" class="dock-toggle" type="button" aria-expanded="true"
                  aria-controls="dock-cards-container" title="Hide or show the forge (H)">
            <span class="dock-toggle-glyph" aria-hidden="true"></span>
            <span class="dock-title" id="dock-title">FORGE DEFENSES</span>
            <span class="dock-title-short" id="dock-title-short">BUILD</span>
            <span class="dock-toggle-chevron" aria-hidden="true">▾</span>
          </button>
        </div>
        <div class="dock-family" id="dock-family">
          <button id="dock-family-btn" class="dock-family-btn" type="button"
                  aria-haspopup="true" aria-expanded="false" aria-controls="dock-tabs"
                  title="Switch defence family">
            <span class="dock-family-name" id="dock-family-name">KEEPS</span>
            <span class="dock-family-count" id="dock-family-count">5</span>
            <span class="dock-family-caret" aria-hidden="true">▾</span>
          </button>
          <div class="dock-tabs" id="dock-tabs" role="tablist" aria-label="Defence families"></div>
        </div>
        <div class="dock-cards" id="dock-cards-container"></div>
        <!-- Build-point budget. Only stages that cap keeps (stage 1: eight)
             show it; everywhere else setBuildPoints hides it again. -->
        <span id="dock-points" class="dock-points hidden" aria-live="polite"></span>
      </div>
      <!-- The gate taking a hit, seen from the edge of the screen. One element,
           driven by two CSS custom properties, so a leak costs no node. -->
      <div id="damage-vignette" class="damage-vignette" aria-hidden="true"></div>
    `;

    this.renderBuildCards();
    this.setZoomState(this.zoomState);
    this.syncShellChrome();
  }

  /**
   * Labels that depend on which shell is live.
   *
   * A `✕` is the phone's cancel key; `ESC` is the desktop's. Same button, same
   * handler — only the promise on its face changes.
   */
  syncShellChrome() {
    const cancel = document.getElementById('btn-cancel-placement');
    if (cancel) cancel.textContent = this.isMobileShell ? '✕' : 'ESC';
  }

  /**
   * Powerup rail.
   *
   * Three circular buttons stacked above the dock. The cooldown is a conic
   * gradient driven by `--charge`, so the sweep is CSS-only and the per-frame
   * cost is one style write per button instead of a redraw.
   */
  setPowerups(list) {
    const rail = document.getElementById('powerup-rail');
    if (!rail || !Array.isArray(list)) return;
    if (rail.dataset.built !== '1') {
      rail.innerHTML = list
        .map(
          (powerup) => `
          <button class="powerup-btn" data-powerup="${powerup.key}" title="${powerup.description}"
                  aria-label="${powerup.name} (${powerup.hotkey})">
            <span class="powerup-plate">
              <span class="powerup-well" aria-hidden="true"></span>
              <img class="powerup-icon" src="${powerup.icon}" alt="" draggable="false" />
              <span class="powerup-timer"></span>
            </span>
            <span class="powerup-key" aria-hidden="true">${powerup.hotkey}</span>
          </button>`
        )
        .join('');
      rail.dataset.built = '1';
      rail.querySelectorAll('.powerup-btn').forEach((button) => {
        button.addEventListener('click', () => {
          this.callbacks.onPowerup?.(button.dataset.powerup);
        });
      });
    }
    this.powerupReady = this.powerupReady || {};
    this.powerupFlash = this.powerupFlash || {};
    for (const powerup of list) {
      const button = rail.querySelector(`[data-powerup="${powerup.key}"]`);
      if (!button) continue;
      const ready = Boolean(powerup.ready);
      button.classList.toggle('ready', ready);
      button.classList.toggle('targeting', Boolean(powerup.targeting && ready));
      button.style.setProperty('--charge', String(Math.max(0, Math.min(1, powerup.progress))));
      button.style.setProperty('--accent', powerup.accent || '#f5c451');
      const timer = button.querySelector('.powerup-timer');
      const seconds = Math.ceil((powerup.remainingMs || 0) / 1000);
      // The timer only exists while there is something to count: an empty
      // strip under the sigil read as a broken glyph.
      if (timer) timer.textContent = ready || seconds <= 0 ? '' : `${seconds}s`;

      // Coming off cooldown is a single flash, not a permanent glow. Three
      // buttons breathing forever is the eye-strain the effect pass banned.
      if (ready && this.powerupReady[powerup.key] === false) {
        button.classList.add('just-ready');
        clearTimeout(this.powerupFlash[powerup.key]);
        this.powerupFlash[powerup.key] = setTimeout(() => button.classList.remove('just-ready'), 950);
      }
      this.powerupReady[powerup.key] = ready;
    }
  }

  /**
   * The one badge a dock card may show.
   *
   * A support building has no attack, so "AIR" (what `targetBadge` returns for
   * a definition that declares neither category) would be a lie in the shop.
   * These three override it; everything else keeps the shared helper.
   */
  badgeFor(def) {
    if (def?.supportOnly) return 'SUPPORT';
    if (def?.trap) return 'TRAP';
    return targetBadge(def);
  }

  badgeTitle(def) {
    if (def?.supportOnly) return 'No attack — this building buffs or repairs nearby defences';
    if (def?.trap) return 'Triggered by ground creeps that walk onto it';
    return `Can hit ${targetLabel(def).toLowerCase()} creeps`;
  }

  /**
   * The priority row for one tower.
   *
   * The classic four modes stay exactly as they were. A royal battery declares
   * its own list (boss first, fastest, …) and, where the choice matters, a
   * category filter underneath. Both are rendered from the tower's data, so
   * adding a line never means editing this file.
   */
  renderTargetingGroup(tower) {
    const group = document.getElementById('inspect-targeting');
    if (!group) return;
    if (tower.def?.supportOnly || tower.def?.trap) {
      group.style.display = 'none';
      return;
    }
    group.style.display = 'block';
    const def = tower.def || {};
    const modes = def.targeting?.modes?.length
      ? def.targeting.modes.map((mode) => ({
          mode,
          label: TARGETING_SHORT[mode] || String(mode).toUpperCase(),
          title: TARGETING_LABELS[mode] || mode,
        }))
      : TARGETING_MODES;
    const categories = def.targeting?.categories || ['both'];
    const categoryRow = categories.length > 1
      ? `
        <div class="targeting-categories" role="group" aria-label="Target category">
          ${categories
            .map(
              (cat) =>
                `<button class="category-btn ${tower.targetCategory === cat ? 'active' : ''}" data-category="${cat}" aria-pressed="${tower.targetCategory === cat}">${
                  cat === 'both' ? 'BOTH' : cat.toUpperCase()
                }</button>`
            )
            .join('')}
        </div>`
      : '';
    const note = def.targeting?.note
      ? `<span class="targeting-note">${def.targeting.note}</span>`
      : '';
    group.innerHTML = `
      <span class="lbl">TARGETING PRIORITY</span>
      <div class="targeting-buttons">
        ${modes
          .map(
            (t) =>
              `<button class="target-btn ${tower.targetingMode === t.mode ? 'active' : ''}" data-mode="${t.mode}" title="${t.title}" aria-pressed="${tower.targetingMode === t.mode}">${t.label}</button>`
          )
          .join('')}
      </div>
      ${categoryRow}
      ${note}
    `;
  }

  /**
   * The word printed on a 76 px card face.
   *
   * `def.name` is a full name ("Ballista Tower", "Boulder Sling") that does not
   * fit a 70 px label at the 14 px minimum, and truncating it to "Ballista To…"
   * was the ugliest thing in the dock. The first word is a real word, not a
   * fragment; the full name is in `title`, in the aria-label, in the hover card
   * and in the placement hint the moment the card is armed.
   */
  cardLabel(def) {
    return String(def?.name || '').trim().split(/\s+/)[0] || String(def?.key || '');
  }

  /**
   * Draw the dock.
   *
   * Twelve defences in one strip was the "masikip" layout: the cards shrank to
   * unreadable thumbnails on a phone. The roster is paged by family instead —
   * two tabs, seven and five cards — so every card keeps a legible icon and a
   * 44 px tap target at every breakpoint.
   */
  /**
   * A finished build puts the phone's forge away.
   *
   * The sheet is opened to pick a card; once the tower is standing, the panel
   * is covering the one thing the player now wants to watch. Desktop keeps its
   * dock (it lives in the letterbox band); the phone folds it back to the
   * single BUILD button in the thumb corner.
   */
  collapseDockAfterBuild() {
    if (!this.isMobileShell || this.dockCollapsed) return;
    this.setDockCollapsed(true, { persist: false });
  }

  /**
   * The hover card for a creep: what it is, how tough, how fast, what hurts it.
   *
   * Anchored to the pointer's *screen* position, clamped to the viewport, and
   * written only when the hovered creep changes (see `GameScene`), so a moving
   * horde costs no DOM writes per frame.
   *
   * @param {null | { name:string, hp:number, max:number, pct:number, speed:number,
   *   armor:number, traits:string[], resistance:{text:string,tone:string},
   *   boss:boolean, flying:boolean, shielded:boolean }} card
   * @param {{ x:number, y:number }} [at] pointer position in CSS pixels
   */
  showEnemyCard(card, at = null) {
    let el = document.getElementById('enemy-card');
    if (!card) {
      el?.classList.remove('is-shown');
      return null;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'enemy-card';
      el.className = 'enemy-card';
      el.setAttribute('aria-hidden', 'true');
      this.container?.appendChild(el);
    }
    const traits = (card.traits || []).length
      ? `<p class="enemy-card-traits">${card.traits.join(' · ')}</p>`
      : '';
    el.innerHTML = `
      <p class="enemy-card-name${card.boss ? ' is-boss' : ''}">${card.name}${
        card.flying ? '<span class="enemy-card-tag">AIR</span>' : ''
      }${card.shielded ? '<span class="enemy-card-tag">SHIELD</span>' : ''}</p>
      <div class="enemy-card-bar"><span style="width:${Math.max(0, Math.min(100, card.pct))}%"></span></div>
      <p class="enemy-card-hp">${card.hp} / ${card.max}</p>
      <p class="enemy-card-stats">
        <span><b>${card.speed}</b> tiles/s</span>
        <span><b>${card.armor}</b> armour</span>
      </p>
      <p class="enemy-card-resist is-${card.resistance?.tone || 'none'}">${card.resistance?.text || ''}</p>
      ${traits}`;
    el.classList.add('is-shown');
    if (at) {
      // Keep the card off the right and bottom edges: a card half under the
      // screen edge is worse than no card.
      const width = el.offsetWidth || 200;
      const height = el.offsetHeight || 96;
      const x = Math.min(Math.max(8, at.x + 16), Math.max(8, window.innerWidth - width - 8));
      const y = Math.min(Math.max(8, at.y + 16), Math.max(8, window.innerHeight - height - 8));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    return el;
  }

  /**
   * The wave is over: a short summary card under the rail.
   *
   * Three numbers and a stamp, gone in 2.6 s. It is deliberately a *card* and
   * not a modal: the next wave is usually already walking, and a player who has
   * to dismiss something to keep playing will stop reading it after the first
   * wave. `flawless` is the only badge — a zero-leak wave is the thing worth
   * being told about.
   *
   * @param {{ wave:number, kills:number, leaks:number, gold:number, ms:number, flawless?:boolean }} summary
   */
  showWaveClear({ wave = 0, kills = 0, leaks = 0, gold = 0, ms = 0, flawless = false } = {}) {
    let card = document.getElementById('wave-clear');
    if (!card) {
      card = document.createElement('div');
      card.id = 'wave-clear';
      card.className = 'wave-clear';
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');
      this.container?.appendChild(card);
    }
    const seconds = Math.max(1, Math.round(ms / 1000));
    const clean = flawless || leaks === 0;
    card.innerHTML = `
      <p class="wave-clear-title">WAVE ${wave} CLEARED</p>
      ${clean ? '<p class="wave-clear-stamp">FLAWLESS</p>' : ''}
      <div class="wave-clear-stats">
        <span><b>${kills}</b> slain</span>
        <span><b>${leaks}</b> leaked</span>
        <span><b>${seconds}s</b></span>
        <span class="wave-clear-gold">+${Math.round(gold)} gold</span>
      </div>`;
    card.classList.remove('is-shown');
    // Restart the keyframes even when two waves land back to back.
    void card.offsetWidth;
    card.classList.add('is-shown', ...(clean ? ['is-flawless'] : []));
    clearTimeout(this.waveClearTimer);
    this.waveClearTimer = setTimeout(() => card.classList.remove('is-shown'), 2600);
  }

  /**
   * A quiet nudge when the player has gold and nothing to do with it.
   *
   * Fires at most once every 30 s, never while a modal is open, never during the
   * opening, and never twice for the same condition — a hint that repeats is a
   * hint the player learns to ignore.
   *
   * @param {string} text one line, imperative
   * @param {string} key an id so the same nudge is not repeated
   */
  showNudge(text, key = 'default') {
    if (!text) return false;
    const now = Date.now();
    if (this.nudgeKey === key && now - (this.nudgeAt || 0) < 45000) return false;
    if (now - (this.nudgeAt || 0) < 30000) return false;
    if (document.body.classList.contains('modal-open')) return false;
    this.nudgeKey = key;
    this.nudgeAt = now;
    this.showToast(text, 'info');
    return true;
  }

  /**
   * The treasury just changed: bounce the counter, once.
   *
   * Driven by a class rather than an inline transform so `prefers-reduced-
   * motion` can switch the bounce off in CSS, and so the animation is a
   * compositor job instead of a per-frame DOM write.
   */
  bumpGold() {
    const stat = document.getElementById('stat-coins');
    if (!stat) return;
    stat.classList.remove('is-bumped');
    // Reading offsetWidth restarts the keyframes; without it a second kill in
    // the same frame would leave the first animation running and the second
    // invisible.
    void stat.offsetWidth;
    stat.classList.add('is-bumped');
    clearTimeout(this.goldBumpTimer);
    this.goldBumpTimer = setTimeout(() => stat.classList.remove('is-bumped'), 420);
  }

  /**
   * A creep got through: red at the edges, and the heart takes the blow.
   *
   * @param {number} intensity 0.12–1 from `leakIntensity`
   */
  flashBaseHit(intensity = 0.5) {
    const vignette = document.getElementById('damage-vignette');
    const stat = document.getElementById('stat-base-hp');
    const strength = Math.max(0.12, Math.min(1, Number(intensity) || 0.12));
    if (vignette) {
      vignette.style.setProperty('--hit', String(strength));
      vignette.classList.remove('is-hit');
      void vignette.offsetWidth;
      vignette.classList.add('is-hit');
      clearTimeout(this.vignetteTimer);
      this.vignetteTimer = setTimeout(() => vignette.classList.remove('is-hit'), 520);
    }
    if (stat) {
      stat.classList.remove('is-hit');
      void stat.offsetWidth;
      stat.classList.add('is-hit');
      clearTimeout(this.baseHitTimer);
      this.baseHitTimer = setTimeout(() => stat.classList.remove('is-hit'), 520);
    }
  }

  /**
   * The line the pause card shows above LEAVE BATTLE.
   *
   * During the opening that line was "Leaving now discards this battle", which
   * is true of a campaign run and a half-truth here: leaving ends the story for
   * this keeper. `null` restores the default.
   */
  setQuitWarning(text) {
    const el = document.getElementById('quit-warning');
    if (!el) return;
    this.defaultQuitWarning ||= el.textContent;
    el.textContent = text || this.defaultQuitWarning;
  }

  /**
   * Light up the control the opening is waiting for.
   *
   * A tutorial step is a gate: the script will not move until the player does
   * the thing. A gate is only fair if the thing is findable, so the scene tells
   * the HUD which control it is waiting on and the HUD keeps it glowing until
   * the beat retires. `null` clears every mark.
   */
  setTutorialHint(hint) {
    this.tutorialHint = hint || null;
    this.applyTutorialHint();
  }

  /** Paint the current hint. Safe to call after any re-render. */
  applyTutorialHint() {
    for (const el of document.querySelectorAll('.is-tutorial-target')) {
      el.classList.remove('is-tutorial-target');
    }
    const hint = this.tutorialHint;
    if (!hint) return;
    const mark = (el) => el?.classList.add('is-tutorial-target');
    if (hint.card) mark(document.querySelector(`#hud-bottom-dock .build-card[data-key="${hint.card}"]`));
    if (hint.upgrade) {
      // The single next tier is a `.spec-card`; the level-2 fork is a row of
      // `.btn-upgrade-choice` cards. Both are "the upgrade", so both light up.
      for (const el of document.querySelectorAll(
        '#btn-upgrade-tower, #inspector-actions-container .btn-upgrade-choice'
      )) {
        mark(el);
      }
    }
    if (hint.wave) mark(document.getElementById('btn-start-wave'));
  }

  renderBuildCards() {
    const container = document.getElementById('dock-cards-container');
    const tabs = document.getElementById('dock-tabs');
    if (!container) return;

    if (tabs) {
      tabs.innerHTML = BUILD_GROUPS.map(
        (group) => `
        <button class="dock-tab" type="button" role="tab" data-group="${group.key}"
                id="dock-tab-${group.key}" aria-controls="dock-cards-container"
                title="${group.hint}">
          <span class="dock-tab-label">${group.label}</span>
          <span class="dock-tab-count">${group.lines.length}</span>
        </button>
      `
      ).join('');
      tabs.querySelectorAll('.dock-tab').forEach((tab) => {
        tab.addEventListener('click', () => this.setDockGroup(tab.dataset.group));
      });
      // Roving tabindex: only the selected tab is in the Tab order, so the
      // arrows are the only way to reach the other page from the keyboard.
      // Without this the ENGINEER roster was keyboard-unreachable as well as
      // pointer-unreachable (the handlers existed, the elements just could not
      // be focused or hit).
      if (!tabs.dataset.bound) {
        tabs.dataset.bound = '1';
        tabs.addEventListener('keydown', (event) => {
          const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          const all = [...tabs.querySelectorAll('.dock-tab')];
          if (!all.length) return;
          const current = Math.max(0, all.indexOf(document.activeElement));
          const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          const next =
            event.key === 'Home'
              ? all[0]
              : event.key === 'End'
                ? all[all.length - 1]
                : all[(current + step + all.length) % all.length];
          event.preventDefault();
          this.setDockGroup(next.dataset.group);
          next.focus();
        });
      }
    }

    container.innerHTML = BUILD_OPTIONS.map((key) => {
      const def = getBuildDefinition(key);
      const isBarricade = key === 'barricade';
      const group = groupForBuild(key);
      return `
        <button class="build-card ${isBarricade ? 'barricade-card' : ''}" data-key="${key}" data-group="${group.key}" id="card-${key}"
                title="${def.description}" aria-label="Build ${def.name} for ${def.cost} gold. Hits ${targetLabel(def).toLowerCase()} creeps">
          <div class="card-hotkey" aria-hidden="true">${def.hotkey}</div>
          <div class="card-icon-frame">
            <div class="card-sprite sprite-${key}"></div>
          </div>
          <!-- Price sits on the card itself, not inside the clipped info box:
               that box is hidden the screen-reader way, which would hide the
               price with it. -->
          <span class="card-cost"><img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> ${def.cost}</span>
          <div class="card-info">
            <span class="card-name">${this.cardLabel(def)}</span>
            <span class="card-target target-${this.badgeFor(def).toLowerCase().replace(/[^a-z]/g, '')}" title="${this.badgeTitle(def)}">${this.badgeFor(def)}</span>
          </div>
        </button>
      `;
    }).join('');

    this.applyDockGroup();
    this.applyTutorialHint();
  }

  /** Read the remembered tab (falls back to the keeps). */
  readDockGroup() {
    try {
      const stored = window.localStorage.getItem(DOCK_GROUP_KEY);
      if (stored && BUILD_GROUPS.some((group) => group.key === stored)) return stored;
    } catch {
      /* storage disabled — the keeps tab is a fine default */
    }
    return BUILD_GROUPS[0].key;
  }

  /**
   * Switch tabs. Cost is one class on the dock plus an aria update; the cards
   * themselves are never re-rendered, so an armed defence survives a tab flip.
   */
  setDockGroup(key, { persist = true } = {}) {
    const group = BUILD_GROUPS.find((entry) => entry.key === key);
    if (!group) return false;
    const changed = this.dockGroup !== group.key;
    this.dockGroup = group.key;
    if (changed) audio.playClick();
    this.applyDockGroup();
    this.setFamilyMenuOpen(false);
    if (persist) {
      try {
        window.localStorage.setItem(DOCK_GROUP_KEY, group.key);
      } catch {
        /* storage disabled — the tab just will not persist */
      }
    }
    return changed;
  }

  /** Push `dockGroup` into the DOM (cards + tabs + the dock's data attribute). */
  applyDockGroup() {
    const dock = document.getElementById('hud-bottom-dock');
    if (dock) dock.dataset.group = this.dockGroup;
    const group = BUILD_GROUPS.find((entry) => entry.key === this.dockGroup) || BUILD_GROUPS[0];
    const familyName = document.getElementById('dock-family-name');
    const familyCount = document.getElementById('dock-family-count');
    if (familyName) familyName.textContent = group.label;
    if (familyCount) familyCount.textContent = String(group.lines.length);
    document.querySelectorAll('.build-card').forEach((card) => {
      const visible = card.dataset.group === this.dockGroup;
      card.classList.toggle('tab-hidden', !visible);
      if (visible) card.removeAttribute('aria-hidden');
      else card.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.dock-tab').forEach((tab) => {
      const active = tab.dataset.group === this.dockGroup;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  /** Open the tab that owns `key` (hotkeys work from either tab). */
  revealBuildKey(key) {
    const group = groupForBuild(key);
    if (group.key !== this.dockGroup) this.setDockGroup(group.key);
  }

  /** Shows the "drag to pan" tip once per browser, when the battle starts. */
  showCameraHintOnce() {
    let seen = true;
    try {
      seen = window.localStorage.getItem(PAN_HINT_KEY) === '1';
    } catch {
      seen = true;
    }
    if (!seen) this.showCameraHint();
  }

  showCameraHint(durationMs = 7000) {
    const hint = document.getElementById('camera-hint');
    if (!hint) return;
    // A phone has no scroll wheel and no wheel-zoom, and the forge is folded:
    // the first thing a new player needs to find is the BUILD button.
    const body = document.getElementById('camera-hint-text');
    if (body) {
      body.innerHTML = this.isMobileShell
        ? '<strong>Tap BUILD</strong> to place a defence · <strong>drag</strong> to pan · <strong>pinch</strong> to zoom'
        : '<strong>Drag</strong> to pan · <strong>Scroll</strong> or <strong>pinch</strong> to zoom · <strong>Tap a creep</strong> to focus fire';
    }
    hint.classList.remove('hidden');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hideCameraHint(), durationMs);
  }

  /**
   * The first battle's coach mark.
   *
   * It borrows the camera hint's bar — same plate, same dismiss button, same
   * place on screen — because a second hint style would read as a second
   * system. The difference is the contract: a coach step has no timer. It
   * stays until the player does the thing it asks, so it can never disappear
   * mid-read and leave them without the sentence they needed.
   *
   * @param {{text?:string, textMobile?:string}} step
   */
  showCoachStep(step) {
    const hint = document.getElementById('camera-hint');
    if (!hint || !step) return;
    const body = document.getElementById('camera-hint-text');
    if (body) {
      // Plain text, not markup: the step's wording lives in one data file and
      // is never assembled from anything the player typed.
      body.textContent = (this.isMobileShell && step.textMobile) || step.text || '';
    }
    hint.classList.add('is-coach');
    hint.classList.remove('hidden');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
  }

  /** Retire the coach bar. The camera hint keeps its own seen-flag untouched. */
  hideCoachStep() {
    const hint = document.getElementById('camera-hint');
    if (!hint) return;
    hint.classList.remove('is-coach');
    hint.classList.add('hidden');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
  }

  hideCameraHint() {
    const hint = document.getElementById('camera-hint');
    if (!hint) return;
    hint.classList.add('hidden');
    try {
      window.localStorage.setItem(PAN_HINT_KEY, '1');
    } catch {
      /* storage disabled — show the hint again next session, harmless */
    }
  }

  /**
   * Wipe every transient state before a new battle starts. The HUD instance is
   * persistent across scene restarts, so a stale inspector pointing at a
   * destroyed tower used to be able to call upgrade() on it.
   */
  reset() {
    this.setText('hud-level-name', 'VERDANT MARCHES');
    // A duel renames the dock ("DUEL · FORGE DEFENCES"); a campaign battle must
    // never inherit that label.
    this.setMatchLabel('FORGE DEFENSES');
    // Keep the player's fold preference, but start every battle from a known
    // state instead of whatever the last scene left behind. No selection to
    // clear here: `reset()` is called before the new scene installs its
    // callbacks, so firing one now would reach into a dead scene.
    this.setDockCollapsed(this.isMobileShell ? true : Boolean(this.dockCollapsed), {
      persist: false,
      clearSelection: false,
    });
    this.inspectedTower = null;
    this.selectedBuildKey = null;
    this.inspectorPinned = false;
    this.inspectorCollapsed = false;
    this.inspectorAnchorRatio = null;
    this.contractSignature = null;
    this.setContracts?.([]);
    this.lastToast = '';
    if (this.toastTimer) clearTimeout(this.toastTimer);

    const inspector = document.getElementById('tower-inspector');
    inspector?.classList.add('hidden');
    inspector?.classList.remove('collapsed', 'dragging');
    document.getElementById('toast-banner')?.classList.add('hidden');
    document.getElementById('boss-banner')?.classList.add('hidden');
    this.setRivalState(null);
    this.setPausedUI(false);
    document.getElementById('placement-hint')?.classList.add('hidden');
    this.hideFocus();

    document.querySelectorAll('.build-card').forEach((card) => {
      card.classList.remove('selected', 'disabled');
      card.setAttribute('aria-pressed', 'false');
    });

    const speed = document.getElementById('btn-speed');
    if (speed) {
      speed.textContent = '1×';
      speed.classList.remove('active');
    }
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.classList.remove('active');
    const pauseImg = document.getElementById('img-pause');
    if (pauseImg) pauseImg.src = '/assets/ui/icon_pause.png';
  }

  /* ================================================================= DUEL */

  /**
   * Show (or hide) the rival strip for a mirrored duel.
   *
   * This is the answer to "can I see what the other player is doing?": beside
   * the pan-and-zoom camera that can pull back to the whole arena, the strip
   * carries the rival's wave, points, core HP and whether they are still alive.
   * `null` hides it, which is what the campaign does.
   */
  setRivalState(state) {
    const strip = document.getElementById('hud-rival');
    if (!strip) return;
    if (!state) {
      strip.classList.add('hidden');
      strip.classList.remove('rival-down', 'rival-done');
      this.rivalSignature = null;
      return;
    }

    const waves = Math.max(1, Number(state.totalWaves) || 8);
    const wave = Math.max(0, Number(state.wave) || 0);
    const score = Number(state.score || 0).toLocaleString();
    const hp = Number.isFinite(state.coreHp) ? Math.max(0, Number(state.coreHp)) : waves;
    const maxHp = Math.max(1, Number(state.maxCoreHp) || 25);

    // The strip is fed at 2 Hz; a caller on the frame loop must not be able to
    // turn that into 60 style writes a second. Bail out before touching the DOM
    // when nothing the strip shows has moved.
    const signature = `${state.name}|${wave}|${waves}|${score}|${hp}|${maxHp}|${state.outcome || ''}`;
    if (this.rivalSignature === signature && !strip.classList.contains('hidden')) return;
    this.rivalSignature = signature;

    strip.classList.remove('hidden');
    this.setText('rival-name', String(state.name || 'CHALLENGER').toUpperCase().slice(0, 16));
    this.setText('rival-wave', String(wave));
    this.setText('rival-waves', String(waves));
    this.setText('rival-score', score);
    const fill = document.getElementById('rival-core-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`;
    strip.classList.toggle('rival-down', hp <= 0);
    strip.classList.toggle('rival-done', state.outcome === 'cleared');
    this.setText('rival-state', hp <= 0 ? 'KNOCKED OUT' : state.outcome === 'cleared' ? 'FINISHED' : 'LIVE');
  }

  /**
   * A duel has no blessings and no powerups: one seat's meteor would be a
   * private advantage the rival cannot answer, which is the opposite of what a
   * mirrored arena is for. Hiding the controls is not enough on its own — the
   * scene also refuses to build the state — but leaving a dead button on screen
   * is worse than hiding it.
   */
  setDuelRules(active) {
    this.duelRules = Boolean(active);
    document.getElementById('hud-container')?.classList.toggle('duel-rules', this.duelRules);
    return this.duelRules;
  }

  /**
   * The duel's side contracts: three shared goals that pay score, never gold.
   *
   * Repainted only when something actually moved — this is called from the
   * HUD sync, which runs on every coin and wave event.
   */
  setContracts(rows) {
    const box = document.getElementById('pause-contracts');
    if (!box) return;
    const list = Array.isArray(rows) ? rows : [];
    const signature = list.map((row) => `${row.id}:${row.current}`).join('|');
    if (this.contractSignature === signature) return;
    this.contractSignature = signature;
    box.classList.toggle('hidden', list.length === 0);
    if (!list.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `
      <p class="pause-contracts-title">CONTRACTS</p>
      ${list
        .map(
          (row) => `
        <div class="contract-row ${row.done ? 'is-done' : ''}">
          <span class="contract-mark" aria-hidden="true">${row.done ? '✓' : '○'}</span>
          <span class="contract-name">${row.name}</span>
          <span class="contract-goal">${row.goal}</span>
          <span class="contract-value">${row.done ? `+${row.reward}` : `${Math.min(row.current, row.target)}/${row.target}`}</span>
        </div>`
        )
        .join('')}
    `;
  }

  /** Rename the dock for a duel so the build list never reads as a campaign. */
  /**
   * Paint the run's rule chips (the draft stack).
   *
   * Called on build, on every card pick and at the top of every wave — never
   * per frame, because it rewrites DOM.
   *
   * @param {{chips?:string[], mode?:string|null}} status
   */
  setRunStatus(status = {}) {
    const el = document.getElementById('run-status');
    if (!el) return;
    const chips = Array.isArray(status.chips) ? status.chips : [];
    const parts = [];
    for (const chip of chips.slice(0, 4)) parts.push(`<span class="run-chip">${escapeStatus(chip)}</span>`);
    el.innerHTML = parts.join('');
    el.classList.toggle('hidden', parts.length === 0);

    const cap = document.getElementById('run-strip-cap');
    if (cap) {
      const label = RUN_MODE_LABELS[status.mode] || '';
      cap.textContent = label;
      cap.classList.toggle('hidden', !label);
    }

    this.runSignature = chips.join(',');
    // The rail hangs under the top bar and is inert, so it only earns its plate
    // while it has a cap or a chip to show.
    this.syncRunStrip();
  }

  /**
   * Show the run rail only while it has something to say.
   *
   * The rail hangs under the top bar and is inert (`pointer-events: none`), so
   * an empty one would still leave a stray brass plate over the map.
   */
  syncRunStrip() {
    const strip = document.getElementById('run-strip');
    if (!strip) return;
    const status = document.getElementById('run-status');
    const cap = document.getElementById('run-strip-cap');
    const hasChips = Boolean(status && !status.classList.contains('hidden'));
    const hasCap = Boolean(cap && !cap.classList.contains('hidden'));
    const visible = hasChips || hasCap;
    strip.classList.toggle('hidden', !visible);
    // The rail is an overhang: the scout report has to duck under it, and the
    // toast lane needs re-measuring so nothing lands across the chips.
    document.documentElement.classList.toggle('has-run-rail', visible);
    this.layout?.schedule?.();
  }

  /**
   * Build-point readout in the forge header.
   *
   * A cap the player cannot see is a bug report waiting to happen, so the
   * counter appears the moment a level declares `maxTowers` and turns amber
   * when the budget is gone. `Infinity` hides it — that is every mode, duel
   * and later campaign stage, where placement stays free.
   */
  setBuildPoints(used, max) {
    const el = document.getElementById('dock-points');
    if (!el) return;
    const capped = Number.isFinite(max);
    if (!capped) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    const count = Math.min(Math.max(0, used | 0), max);
    el.classList.remove('hidden');
    el.textContent = `${count}/${max} BUILDS`;
    el.classList.toggle('is-full', count >= max);
    el.setAttribute('aria-label', `${count} of ${max} build points used`);
  }

  setMatchLabel(text) {
    const title = document.getElementById('dock-title') || document.querySelector('.dock-title');
    if (title && text) title.textContent = text;
  }

  /* ================================================================= DOCK */

  /**
   * Fold the forge dock into a slim handle.
   *
   * On a phone in landscape the seven build cards plus the wave button own the
   * bottom third of the screen, and the player often wants to watch the horde
   * (or the rival's half in a duel) without the dock in the way. Collapsing
   * hides the cards but keeps a labelled handle, so the forge is always one tap
   * away — nothing is lost and the battle never pauses.
   *
   * The choice is remembered between battles, and {@link HudLayout} re-measures
   * the dock so the camera pill and the toast slide back down with it.
   */
  setDockCollapsed(collapsed, { persist = true, clearSelection = true } = {}) {
    const next = Boolean(collapsed);
    const dock = document.getElementById('hud-bottom-dock');
    const btn = document.getElementById('btn-toggle-dock');
    this.dockCollapsed = next;
    dock?.classList.toggle('collapsed', next);
    if (btn) {
      btn.setAttribute('aria-expanded', String(!next));
      btn.setAttribute('title', next ? 'Show the forge (H)' : 'Hide the forge (H)');
    }
    // A folded dock cannot show which card is armed, so drop the selection.
    if (next && clearSelection) this.clearBuildSelection();
    if (persist) this.writeDockCollapsed(next);
    this.syncDockScrim();
    this.layout?.schedule?.();
    return next;
  }

  /**
   * Dim the battlefield behind the forge sheet.
   *
   * Only the phone shell opens a sheet over the lane, so only the phone shell
   * gets the scrim. It is also the way out: the sheet is not a modal with a
   * close button, it is a drawer you can dismiss anywhere outside it, which is
   * what a thumb expects.
   */
  syncDockScrim() {
    const scrim = document.getElementById('dock-scrim');
    if (!scrim) return;
    const open = this.isMobileShell && !this.dockCollapsed;
    scrim.classList.toggle('hidden', !open);
    scrim.setAttribute('aria-hidden', String(!open));
    // The powerup rail is a live control that paints above the scrim; leaving
    // it up over a dimmed map meant a tap meant to dismiss the sheet could
    // fire a meteor instead. The sheet owns the corner while it is open.
    this.container?.classList.toggle('dock-open', open);
  }

  /** Flip the dock between folded and open. */
  toggleDock() {
    return this.setDockCollapsed(!this.dockCollapsed);
  }

  /** Open the dock if it is folded — used by the build hotkeys. */
  expandDock() {
    return this.dockCollapsed ? this.setDockCollapsed(false) : false;
  }

  readDockCollapsed() {
    try {
      return window.localStorage.getItem(DOCK_STATE_KEY) === '1';
    } catch {
      return false;
    }
  }

  writeDockCollapsed(collapsed) {
    try {
      window.localStorage.setItem(DOCK_STATE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode: the preference just does not survive the reload */
    }
  }

  /* ================================================================ EVENTS */

  /**
   * Mirror the paused state on the pause chip and the pause card. The chip is
   * hidden by CSS while the card is open, so a gate-driven pause still shows
   * the passive pill without ever offering the quit button.
   */
  setPausedUI(isPaused) {
    document.getElementById('pause-overlay')?.classList.toggle('hidden', !isPaused);
    document.getElementById('pause-chip')?.classList.toggle('hidden', !isPaused);
    if (isPaused) this.updatePauseStatus();
    else this.disarmQuit();
  }

  /**
   * The pause card carries the numbers the phone rail does not.
   *
   * The mobile rail is three small capsules, so the score, the map name and the
   * run mode live here instead of being deleted: pausing is the moment a player
   * actually wants them.
   */
  updatePauseStatus() {
    const el = document.getElementById('pause-status');
    if (!el) return;
    const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
    const level = text('hud-level-name');
    const wave = text('val-wave');
    const score = text('val-score');
    const best = document.getElementById('val-endless-best');
    const bestText = best && !best.classList.contains('hidden') ? ` · ${best.textContent.trim()}` : '';
    el.textContent = [level, `WAVE ${wave}`, `SCORE ${score}${bestText}`].filter(Boolean).join(' · ');
  }

  /** Drop the "tap again" caution back to its safe state. */
  disarmQuit() {
    clearTimeout(this.quitDisarmTimer);
    document.getElementById('btn-menu')?.classList.remove('armed');
    document.getElementById('quit-warning')?.classList.add('hidden');
    clearTimeout(this.restartDisarmTimer);
    document.getElementById('btn-restart')?.classList.remove('armed');
    document.getElementById('restart-warning')?.classList.add('hidden');
  }

  bindEvents() {
    document.querySelectorAll('.build-card').forEach((card) => {
      card.addEventListener('click', () => {
        // An unaffordable card still arms: the ghost and the range ring are how
        // a player learns what they are saving for, and refusing the selection
        // would take that preview away. The price shakes and the denied tick
        // plays instead, and the placement hint already says NEED X GOLD.
        const def = getBuildDefinition(card.dataset.key);
        if (def && (Number(this.coins) || 0) < def.cost && this.selectedBuildKey !== card.dataset.key) {
          this.flashUnaffordable(card);
        }
        this.toggleBuildSelection(card.dataset.key);
      });
    });

    document.getElementById('btn-start-wave')?.addEventListener('click', () => {
      audio.playConfirm();
      if (this.earlyCallAvailable) this.callbacks.onCallWaveEarly?.();
      else this.callbacks.onStartWave?.();
    });

    const speedBtn = document.getElementById('btn-speed');
    speedBtn?.addEventListener('click', () => {
      audio.playClick();
      const newSpeed = this.callbacks.onToggleSpeed?.() ?? 1;
      speedBtn.textContent = `${newSpeed}×`;
      speedBtn.classList.toggle('active', newSpeed > 1);
      speedBtn.setAttribute('aria-label', `Simulation speed ${newSpeed}x`);
    });

    // Pause is reachable from the top bar and from the pause card itself, so
    // both routes share one toggle that keeps every bit of UI in step.
    const togglePause = () => {
      const isPaused = Boolean(this.callbacks.onTogglePause?.());
      const pauseBtn = document.getElementById('btn-pause');
      const pauseImg = document.getElementById('img-pause');
      if (pauseImg) pauseImg.src = isPaused ? '/assets/ui/icon_speed.png' : '/assets/ui/icon_pause.png';
      pauseBtn?.classList.toggle('active', isPaused);
      pauseBtn?.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause');
      this.setPausedUI(isPaused);
      return isPaused;
    };
    this.togglePause = togglePause;

    document.getElementById('btn-blessings')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onOpenBlessings?.();
    });

    document.getElementById('btn-pause')?.addEventListener('click', () => {
      audio.playClick();
      togglePause();
    });
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      audio.playClick();
      togglePause();
    });

    document.getElementById('btn-codex')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onOpenCodex?.();
    });

    document.getElementById('btn-toggle-dock')?.addEventListener('click', () => {
      audio.playClick();
      this.toggleDock();
    });

    document.getElementById('dock-scrim')?.addEventListener('click', () => {
      audio.playClick();
      this.setDockCollapsed(true, { persist: false });
    });

    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onZoomReset?.();
    });

    // One delegated tick for every control in the HUD.
    //
    // Per-handler calls would have had to be added to thirty buttons and would
    // still miss the next one; a pointerdown on the container finds whichever
    // control was pressed. Disabled controls are skipped on purpose — a button
    // that cannot act must not feel like it acted.
    this.container?.addEventListener(
      'pointerdown',
      (event) => {
        const control = event.target.closest?.('button, [role="button"]');
        if (!control || control.disabled) return;
        haptics.tap('tap');
      },
      { passive: true }
    );

    document.getElementById('focus-chip')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks?.onClearFocus?.();
      this.hideFocus();
    });

    // Leaving a battle is destructive (the run is not saved), so it takes a
    // deliberate second tap. The armed state times out on its own.
    const quitBtn = document.getElementById('btn-menu');
    const quitWarning = document.getElementById('quit-warning');
    quitBtn?.addEventListener('click', () => {
      audio.playClick();
      if (!quitBtn.classList.contains('armed')) {
        quitBtn.classList.add('armed');
        quitWarning?.classList.remove('hidden');
        clearTimeout(this.quitDisarmTimer);
        this.quitDisarmTimer = setTimeout(() => this.disarmQuit(), 4000);
        return;
      }
      clearTimeout(this.quitDisarmTimer);
      this.disarmQuit();
      this.callbacks.onOpenMenu?.();
    });

    // Restarting is destructive in the same way leaving is — the wave, the
    // keeps and the gold all go — so it arms exactly like LEAVE BATTLE does.
    const restartBtn = document.getElementById('btn-restart');
    const restartWarning = document.getElementById('restart-warning');
    restartBtn?.addEventListener('click', () => {
      audio.playClick();
      if (!restartBtn.classList.contains('armed')) {
        restartBtn.classList.add('armed');
        restartWarning?.classList.remove('hidden');
        clearTimeout(this.restartDisarmTimer);
        this.restartDisarmTimer = setTimeout(() => this.disarmQuit(), 4000);
        return;
      }
      this.disarmQuit();
      this.callbacks.onRestart?.();
    });

    // Settings open *over* a paused battle. The card is not dismissed first:
    // the player closes the panel and is back exactly where they left off.
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onOpenSettings?.();
    });

    const muteBtn = document.getElementById('btn-mute');
    const muteImg = document.getElementById('img-mute');
    if (muteImg) muteImg.src = soundIcon(audio.muted);
    muteBtn?.addEventListener('click', () => {
      const muted = audio.toggleMute();
      if (muteImg) muteImg.src = soundIcon(muted);
      muteBtn.setAttribute('aria-pressed', String(muted));
    });

    // Fullscreen is owned by main.js (window.gameFullscreen); the HUD only
    // asks it to toggle and mirrors the resulting state.
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      audio.playClick();
      window.gameFullscreen?.toggle?.();
    });

    // Camera controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onZoomIn?.();
    });
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onZoomOut?.();
    });
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onZoomReset?.();
    });

    document.getElementById('btn-dismiss-hint')?.addEventListener('click', (event) => {
      event.stopPropagation();
      audio.playClick();
      // Dismissing the coach retires the bar, not the run: the next event
      // still brings the next step, and the camera hint keeps its own flag.
      if (document.getElementById('camera-hint')?.classList.contains('is-coach')) {
        this.hideCoachStep();
        return;
      }
      this.hideCameraHint();
    });
    document.getElementById('camera-hint')?.addEventListener('click', () => this.hideCameraHint());

    document.getElementById('btn-cancel-placement')?.addEventListener('click', () => {
      audio.playClick();
      this.clearBuildSelection();
    });
    document.getElementById('placement-hint')?.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      this.clearBuildSelection();
    });

    document.getElementById('btn-close-inspect')?.addEventListener('click', () => {
      audio.playClick();
      this.closeInspector();
    });
    document.getElementById('btn-collapse-inspect')?.addEventListener('click', () => {
      audio.playClick();
      this.toggleInspectorCollapsed();
    });

    // Delegated: the priority row is re-rendered per tower (a royal battery
    // offers six modes, an archer four), so binding the buttons themselves
    // would leave a dead row after the first selection.
    document.getElementById('inspect-targeting')?.addEventListener('click', (event) => {
      const tower = this.inspectedTower;
      if (!tower) return;
      const modeBtn = event.target.closest('.target-btn');
      if (modeBtn) {
        tower.setTargetingMode(modeBtn.dataset.mode);
        this.updateTargetingUI(modeBtn.dataset.mode);
        return;
      }
      const catBtn = event.target.closest('.category-btn');
      if (catBtn && tower.setTargetCategory) {
        if (tower.setTargetCategory(catBtn.dataset.category)) {
          document.querySelectorAll('#inspect-targeting .category-btn').forEach((b) => {
            const active = b.dataset.category === tower.targetCategory;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
          });
          this.callbacks.onTargetCategoryChanged?.(tower);
        }
      }
    });

    // Double-clicking the drag handle resets the panel to its anchored spot.
    const handle = document.getElementById('inspector-drag-handle');
    handle?.addEventListener('dblclick', () => {
      this.inspectorPinned = false;
      this.repositionInspector(true);
    });
  }

  bindViewport() {
    this._onResize = () => {
      this.syncShell();
      this.syncDensity();
      this.repositionInspector();
      this.syncInspectorScroll();
    };
    this.syncDensity();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    // The phone sheet scrolls; the fade at its bottom edge says so. Listening to
    // the one element keeps the affordance honest — a panel that fits needs no
    // "there is more" shading, and the shading lifts at the end of the list.
    document
      .getElementById('inspector-body')
      ?.addEventListener('scroll', () => this.syncInspectorScroll(), { passive: true });
  }

  /**
   * Mark the inspector when its body has more content than it can show.
   *
   * The phone sheet is 226 px tall on a 390 px landscape screen, and the stat
   * grid is taller than that. Without this the last visible row is sliced by the
   * panel edge, which reads as a rendering bug rather than as "scroll me" (the
   * same complaint the leaderboard roll got). `is-scrollable` paints a fade on
   * the frame edge; `is-scroll-end` lifts it once the list is spent.
   */
  syncInspectorScroll() {
    const body = document.getElementById('inspector-body');
    const panel = document.getElementById('tower-inspector');
    if (!body || !panel) return;
    const max = body.scrollHeight - body.clientHeight;
    const room = max > 4;
    panel.classList.toggle('is-scrollable', room);
    panel.classList.toggle('is-scroll-end', !room || body.scrollTop >= max - 4);
  }

  /* ============================================================== INSPECTOR */

  bindInspectorDrag() {
    const handle = document.getElementById('inspector-drag-handle');
    const panel = document.getElementById('tower-inspector');
    if (!handle || !panel) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      // A draggable panel over the lane is a desktop idea; the phone inspector
      // is a sheet, so the grip must not start a drag that CSS cannot express.
      if (this.isMobileShell) return;
      const host = this.hostRect();
      const rect = panel.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      this.inspectorPinned = true;
      panel.classList.add('dragging');
      handle.setPointerCapture?.(event.pointerId);
      // Store the current spot as left/top so the panel does not jump.
      panel.style.left = `${rect.left - host.left}px`;
      panel.style.top = `${rect.top - host.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const host = this.hostRect();
      const rect = { width: panel.offsetWidth, height: panel.offsetHeight };
      const next = clampPanel(
        { left: event.clientX - host.left - offsetX, top: event.clientY - host.top - offsetY },
        rect,
        { width: host.width, height: host.height }
      );
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', endDrag);
  }

  hostRect() {
    // #hud-container fills the viewport, and every HUD panel is a child of it,
    // so its box is the coordinate space the panels are positioned in.
    const host = this.container;
    const rect = host.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  viewportSize() {
    const host = this.container;
    return { width: host.clientWidth || window.innerWidth, height: host.clientHeight || window.innerHeight };
  }

  /** Re-anchor the inspector to its tower (called on select/resize/rotate). */
  repositionInspector(force = false) {
    const panel = document.getElementById('tower-inspector');
    if (!panel || panel.classList.contains('hidden')) return;
    // The phone inspector is a bottom sheet: CSS owns its box, and a floating
    // panel anchored to the tower would be the thing this layout removed.
    if (this.isMobileShell) {
      this.clearInspectorBox();
      return;
    }
    if (this.inspectorPinned && !force) return;

    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    const viewport = this.viewportSize();
    const ratio = this.inspectorAnchorRatio || { x: 0.74, y: 0.55 };
    const anchor = { x: ratio.x * viewport.width, y: ratio.y * viewport.height };
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const spot = placeInspector(anchor, size, viewport);
    panel.style.left = `${spot.left}px`;
    panel.style.top = `${spot.top}px`;
    panel.dataset.side = spot.side;
  }

  /** Drop inline geometry so the stylesheet can place the panel again. */
  clearInspectorBox() {
    const panel = document.getElementById('tower-inspector');
    if (!panel) return;
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.classList.remove('dragging');
    delete panel.dataset.side;
  }

  inspectTower(tower, anchorRatio = null) {
    this.inspectedTower = tower;
    if (this.selectedBuildKey) this.clearBuildSelection();

    const panel = document.getElementById('tower-inspector');
    if (!panel) return;
    panel.classList.remove('hidden');

    // The badge shows the real tier: since levels 4 and 5 exist, a hard-coded
    // ★3 would have labelled a maxed tower as a fresh specialisation. It says
    // the level only — the title next to it already carries the ascension name,
    // and "SIEGE BALLISTA ★5 Siege Ballista" was the same words twice.
    const titleStr = tower.def?.royal
      ? `★${tower.level} · ${String(tower.stats?.title || '').toUpperCase()}`
      : tower.specialization
      ? tower.level >= MAX_LEVEL
        ? `★${tower.level} · MAX`
        : `★${tower.level}`
      : tower.isBarricade
        ? `★${tower.level} · ${String(tower.def?.levels?.[tower.level - 1]?.title || 'WALL').toUpperCase()}`
        : `★ Level ${tower.level}`;

    document.getElementById('inspect-name').textContent = tower.stats?.title || tower.def.name;
    document.getElementById('inspect-level').textContent = titleStr;
    const targetChip = document.getElementById('inspect-targets');
    if (targetChip) {
      // A palisade damages only what walks into it; a battery that fires at the
      // sky says so. Same helper as the dock card, so the two can never disagree.
      const label = targetLabel(tower.def);
      targetChip.textContent = label;
      targetChip.className = `inspector-targets target-${targetBadge(tower.def).toLowerCase().replace(/[^a-z]/g, '')}`;
      targetChip.title = `Can hit ${label.toLowerCase()} creeps`;
    }

    const statsGrid = document.getElementById('inspect-stats');
    const targetingGroup = document.getElementById('inspect-targeting');

    if (tower.isBarricade) {
      targetingGroup.style.display = 'none';
      const thorns = tower.stats?.thornsDamage || 0;
      const hp = Math.max(0, Math.round(tower.health ?? tower.stats?.health ?? 0));
      const maxHp = Math.max(1, Math.round(tower.maxHealth ?? tower.stats?.health ?? 1));
      const pct = Math.round((hp / maxHp) * 100);
      const tierName = tower.def?.levels?.[tower.level - 1]?.title || 'Wall';
      const nextTier = tower.nextUpgrades?.[0] || null;
      statsGrid.innerHTML = `
        <div class="stat-cell"><span class="lbl">TIER</span><span class="val">${tower.level} / ${tower.def?.levels?.length || 5}</span></div>
        <div class="stat-cell"><span class="lbl">MATERIAL</span><span class="val">${tierName}</span></div>
        <div class="stat-cell full-width">
          <span class="lbl">STRUCTURE</span>
          <span class="val" id="inspect-structure-hp">${hp} / ${maxHp} HP (${pct}%)</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">THORNS RETALIATION</span>
          <span class="val">${thorns > 0 ? `${thorns} damage per second to attackers` : 'None at level 1'}</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">BLOCKS</span>
          <span class="val">Ground creeps must break it — flyers pass over</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">NEXT TIER</span>
          <span class="val">${nextTier ? `${nextTier.title} · ${nextTier.health} HP · ${nextTier.upgradeCost} gold` : 'Fully upgraded'}</span>
        </div>
      `;
    } else if (tower.def?.supportOnly || tower.def?.trap) {
      // No gun, so a DAMAGE / DPS sheet would report zeroes and say nothing.
      this.renderTargetingGroup(tower);
      statsGrid.innerHTML = this.supportStats(tower);
    } else {
      this.renderTargetingGroup(tower);
      const s = tower.stats;
      const special = this.describeSpecial(s);
      // What the next tier would pay. Only when the next step is a single
      // option: at level 2 the player is choosing between two specialisations,
      // and one green arrow next to two different futures is a lie.
      const next = tower.nextUpgrades?.length === 1 ? tower.nextUpgrades[0] : null;
      const delta = (current, incoming, unit = '') => {
        if (!next || !Number.isFinite(incoming) || incoming === current) return '';
        const worse = incoming < current && unit !== 's';
        return ` <span class="stat-delta${worse ? ' is-down' : ''}">→ ${incoming}${unit}</span>`;
      };
      const nextDps = next && Number.isFinite(next.damage) && Number.isFinite(next.cooldown)
        ? Math.round(dps(next))
        : null;
      const nextRate = next && Number.isFinite(next.cooldown) ? next.cooldown : null;
      statsGrid.innerHTML = `
        <div class="stat-cell"><span class="lbl">DAMAGE</span><span class="val">${s.damage}${delta(s.damage, next?.damage)}</span></div>
        <div class="stat-cell"><span class="lbl">RANGE</span><span class="val">${s.range}px${delta(s.range, next?.range, 'px')}</span></div>
        <div class="stat-cell"><span class="lbl">ATTACK SPEED</span><span class="val">${(s.cooldown / 1000).toFixed(2)}s${
          nextRate ? ` <span class="stat-delta">→ ${(nextRate / 1000).toFixed(2)}s</span>` : ''
        }</span></div>
        <div class="stat-cell"><span class="lbl">DPS</span><span class="val">${this.describeDps(s)}${
          nextDps ? ` <span class="stat-delta">→ ${nextDps}</span>` : ''
        }</span></div>
        <div class="stat-cell"><span class="lbl">DAMAGE TYPE</span><span class="val">${(s.damageType || 'Physical').toUpperCase()}</span></div>
        <div class="stat-cell"><span class="lbl">TARGETS</span><span class="val targets-${targetBadge(tower.def).toLowerCase().replace(/[^a-z]/g, '')}">${targetLabel(tower.def)}</span></div>
        <div class="stat-cell full-width"><span class="lbl">SPECIAL PERK</span><span class="val">${special}</span></div>
        <div class="stat-cell full-width"><span class="lbl">SIGNATURE</span><span class="val">${this.describeAbility(s)}</span></div>
        <div class="stat-cell full-width"><span class="lbl">STRUCTURE</span><span class="val" id="inspect-structure-hp">${Math.max(0, Math.round(tower.health ?? 0))} / ${Math.max(1, Math.round(tower.maxHealth ?? 1))} HP</span></div>
      `;
    }

    const actionsContainer = document.getElementById('inspector-actions-container');
    actionsContainer.innerHTML = this.renderUpgradeActions(tower);
    this.bindUpgradeActions(tower);
    // The panel is rebuilt from scratch here, so a tutorial mark on its
    // UPGRADE button has to be repainted whenever it opens.
    this.applyTutorialHint();
    this.updateActionAffordability(tower);
    // A fresh tower means a fresh (shorter) body: start at the top, where the
    // action lives, and re-measure the fade from there.
    const body = document.getElementById('inspector-body');
    if (body) body.scrollTop = 0;
    this.syncInspectorScroll();

    if (anchorRatio) this.inspectorAnchorRatio = anchorRatio;
    this.repositionInspector();
  }

  /**
   * Throughput in one number, plus the burn/poison share when there is one.
   *
   * Twelve lines cannot be compared on damage and cooldown alone: an 8-damage
   * repeater out-damages a 75-damage harpoon, and a siphon's damage is mostly in
   * the fire it leaves behind. The inspector states the direct rate and, for a
   * DoT line, the extra damage per second its shot keeps ticking while lit.
   */
  describeDps(s) {
    if (!s) return '—';
    // One formula for DPS in the whole project: `towerAscension.dps()` is what
    // the balance model and the balance report use, so the number under the
    // tower's name cannot drift away from the number the tests assert on.
    const direct = Math.round(dps(s));
    if (!s.dot?.damage || !s.dot?.tickMs) return `${direct}`;
    const kind = s.dot.kind === 'poison' ? 'poison' : 'burn';
    const dotRate = Math.round(s.dot.damage / (Math.max(100, s.dot.tickMs) / 1000));
    return `${direct} <span class="dps-extra">+${dotRate} ${kind}</span>`;
  }

  /**
   * The stat sheet for a building that does not shoot.
   *
   * A workshop is judged by the fire rate it adds and the HP it puts back; an
   * obelisk by the mitigation it strips; a trap by its damage per activation
   * and how often it can fire. Printing DPS 0 for all three would be true and
   * useless.
   */
  supportStats(tower) {
    const s = tower.stats || {};
    const hp = Math.max(0, Math.round(tower.health ?? 0));
    const maxHp = Math.max(1, Math.round(tower.maxHealth ?? 1));
    const structure = `<div class="stat-cell full-width"><span class="lbl">STRUCTURE</span><span class="val" id="inspect-structure-hp">${hp} / ${maxHp} HP</span></div>`;

    if (tower.def?.trap) {
      const dmg = s.damage || 0;
      const cd = (s.trapCooldown || 0) / 1000;
      return `
        <div class="stat-cell"><span class="lbl">TRIGGER DAMAGE</span><span class="val">${dmg}</span></div>
        <div class="stat-cell"><span class="lbl">RADIUS</span><span class="val">${s.trapRadius || 0}px</span></div>
        <div class="stat-cell"><span class="lbl">RE-ARM</span><span class="val">${cd.toFixed(1)}s</span></div>
        <div class="stat-cell"><span class="lbl">DAMAGE / s</span><span class="val">${cd > 0 ? Math.round(dmg / cd) : 0}</span></div>
        <div class="stat-cell full-width"><span class="lbl">TRIGGERS ON</span><span class="val">Ground creeps only — flyers pass over</span></div>
        ${structure}
      `;
    }

    if (s.debuff) {
      return `
        <div class="stat-cell"><span class="lbl">ARMOUR BREAK</span><span class="val">−${Math.round(s.debuff.armorBreak || 0)}</span></div>
        <div class="stat-cell"><span class="lbl">RESIST BREAK</span><span class="val">−${Math.round((s.debuff.resistanceBreak || 0) * 100)}%</span></div>
        <div class="stat-cell"><span class="lbl">FIELD RADIUS</span><span class="val">${s.debuff.radius || 0}px</span></div>
        <div class="stat-cell"><span class="lbl">DIRECT DAMAGE</span><span class="val">none</span></div>
        <div class="stat-cell full-width"><span class="lbl">EFFECT</span><span class="val">Every creep in the field takes more damage from every source; the debuff lapses 1.4s after it leaves. Strongest single obelisk applies — no stacking.</span></div>
        ${structure}
      `;
    }

    const aura = s.aura || {};
    const repair = s.repair;
    return `
      <div class="stat-cell"><span class="lbl">FIRE RATE AURA</span><span class="val">+${Math.round((aura.fireRateBonus || 0) * 100)}%</span></div>
      <div class="stat-cell"><span class="lbl">RANGE AURA</span><span class="val">+${Math.round((aura.rangeBonus || 0) * 100)}%</span></div>
      <div class="stat-cell"><span class="lbl">AURA RADIUS</span><span class="val">${aura.radius || 0}px</span></div>
      <div class="stat-cell"><span class="lbl">REPAIRS</span><span class="val">${repair ? `${repair.perSecond} HP/s` : 'unlocks at L3'}</span></div>
      <div class="stat-cell full-width"><span class="lbl">REPAIR FIELD</span><span class="val">${
        repair
          ? `${repair.radius}px · one structure at a time · half rate under fire`
          : 'Level 3 adds a repair crew'
      }</span></div>
      ${structure}
    `;
  }

  describeSpecial(s) {
    if (s.aura?.radius) {
      const bits = [];
      if (s.aura.damageBonus) bits.push(`+${Math.round(s.aura.damageBonus * 100)}% damage`);
      if (s.aura.rangeBonus) bits.push(`+${Math.round(s.aura.rangeBonus * 100)}% range`);
      if (s.aura.fireRateBonus) bits.push(`+${Math.round(s.aura.fireRateBonus * 100)}% fire rate`);
      if (s.aura.coinPerKill) bits.push(`+${s.aura.coinPerKill} gold per kill`);
      return `Aura ${s.aura.radius}px · ${bits.join(', ')}`;
    }
    // Burn and poison are the identity of the flame and venom lines, so they win
    // over the generic splash line even when the shot also explodes.
    if (s.dot) {
      const kind = s.dot.kind === 'poison' ? 'Poison' : 'Burn';
      const total = Math.round((s.dot.damage / s.dot.tickMs) * s.dot.durationMs);
      const splash = s.splash ? ` · ${s.splash}px pool` : '';
      return `${kind} ${s.dot.damage}/tick for ${(s.dot.durationMs / 1000).toFixed(1)}s (≈${total})${splash}`;
    }
    // Frost's identity is the combination: a chill *and* a splash. Reporting
    // only the splash would hide the control the player is paying for.
    if (s.slow && s.splash) {
      return `Slows ${Math.round(s.slow * 100)}% for ${(s.slowMs / 1000).toFixed(1)}s · ${s.splash}px chill splash`;
    }
    // A chain that keeps 75 % of its damage per hop is a different weapon from
    // one that keeps 55 %, and the panel should say which one you own.
    if (s.chainTargets > 0) {
      const fall = Math.round((s.chainFalloff ?? 0.75) * 100);
      return `Chain lightning · ${s.chainTargets} extra targets · ${fall}% carried per hop`;
    }
    if (s.debuff) return `Field: −${s.debuff.armorBreak || 0} armour, −${Math.round((s.debuff.resistanceBreak || 0) * 100)}% resistance in ${s.debuff.radius}px`;
    if (s.repair) return `Repairs ${s.repair.perSecond} HP/s within ${s.repair.radius}px`;
    if (s.stunMs) return `Stuns ${(s.stunMs / 1000).toFixed(1)}s on hit`;
    if (s.bossBonus) return `+${Math.round(s.bossBonus * 100)}% damage to bosses`;
    if (s.splash) return `Area splash · ${s.splash}px radius`;
    if (s.slow) return `Slows ${Math.round(s.slow * 100)}% for ${(s.slowMs / 1000).toFixed(1)}s`;
    if (s.armorBreak) return `Armour break −${s.armorBreak} for ${(s.armorBreakMs / 1000).toFixed(1)}s`;
    if (s.armorPenetration) return `Armour penetration ${Math.round(s.armorPenetration * 100)}%`;
    if (s.chainTargets > 1) return `Chain lightning · ${s.chainTargets} targets`;
    return '—';
  }

  /**
   * Signature ability line for the inspector.
   *
   * Levels 4 and 5 add a named ability ("Frost Nova", "Twin Volley"); showing
   * the name next to the numbers is what tells the player the upgrade they just
   * bought is a new behaviour, not a +10 damage.
   */
  describeAbility(s) {
    const ability = s?.ability;
    if (!ability) return '—';
    const bits = [];
    if (ability.shots > 1) bits.push(`${ability.shots} shots per attack`);
    if (ability.nova) bits.push(`${ability.nova}px frost nova on hit`);
    return bits.length ? `${ability.label} · ${bits.join(', ')}` : ability.label;
  }

  /**
   * What a specialisation is *for*, in one or two words.
   *
   * The card used to be a name, a price and a sentence. A player at wave 9 has
   * no time to parse a sentence, and the two branches of a line often read as
   * interchangeable ("fast" vs "strong"). The role label is derived from the
   * stats themselves, so it cannot drift from what the tower actually does: a
   * branch only says CONTROL if it carries a slow or a stun.
   */
  describeRole(s) {
    if (!s) return '—';
    // Strongest identity first. A stun is checked last so a boss-killer that
    // also stuns ("Siege Harpoon") is not filed under control, which is the
    // branch's *side effect*, not its job.
    if (s.aura) return 'SUPPORT';
    if (s.dot) return s.dot.kind === 'poison' ? 'VENOM' : 'BURN';
    if (s.bossBonus) return 'BOSS HUNTER';
    if (s.armorBreak) return 'ARMOUR BREAK';
    // A branch that fires several bolts a volley is defined by the volley, not
    // by the blast radius of one shell: the salvo battery and the cluster
    // battery are both "two shells", and the badge has to say so.
    if ((s.ability?.shots || 1) > 1) return 'VOLLEY';
    if (s.splash) return 'CROWD CLEAR';
    if (s.chainTargets > 1) return 'CHAIN';
    if (s.stunMs || s.slow) return 'CONTROL';
    if (s.armorPenetration) return 'PIERCE';
    if (s.cooldown <= 320) return 'RAPID FIRE';
    if (s.range >= 240) return 'LONG RANGE';
    return 'SINGLE TARGET';
  }

  /**
   * The building the player is about to buy.
   *
   * Every line already ships art for each branch — showing it turns the choice
   * from two paragraphs into two towers, which is what the player is actually
   * deciding between. Falls back to nothing when a line has no art, so the card
   * still renders.
   */
  upgradeArt(tower, slot) {
    if (!slot) return null;
    const line = TOWER_VISUALS[tower?.typeKey];
    const visual = line?.[slot];
    return visual?.base ? `/assets/towers/${visual.base}` : null;
  }

  /** Slot name for the "one option" upgrades (level 2 and the ascension tiers). */
  nextSlot(tower) {
    if (!tower) return null;
    // The preview is the real base PNG the tower will wear, so it can never
    // show a recolour the engine does not ship. A royal branch resolves to its
    // own ladder (`spec-a2` / `spec-b2`) like every other line.
    if (tower.level === 1) return 'lvl2';
    if (!tower.specialization) return null;
    const branch = tower.def?.specializations?.[tower.specialization]?.branch === 'spec-b'
      ? 'spec-b'
      : 'spec-a';
    if (tower.level >= 4) return `${branch}3`;
    return `${branch}2`;
  }

  /**
   * The before/after numbers, as chips.
   *
   * A specialisation that trades damage for rate is a real choice, and the
   * player should be able to see the trade without doing arithmetic. DPS uses
   * the same `dps()` the balance suite uses, so the preview cannot promise
   * something the tower will not deliver.
   */
  statChips(now, next) {
    if (!next) return '';
    const chips = [];
    const chip = (label, before, after, format = (v) => v) => {
      // Never print a number that is not one: the palisade has no cooldown, and
      // its upgrade card used to promise "RATE NaN → NaN".
      if (!Number.isFinite(before) || !Number.isFinite(after)) return;
      if (before === after) return;
      const dir = after > before ? 'up' : 'down';
      chips.push(
        `<span class="spec-chip spec-chip-${dir}">${label} <b>${format(before)}</b>` +
          `<i>→</i><b>${format(after)}</b></span>`
      );
    };
    const rate = (s) =>
      Number.isFinite(s?.cooldown) && s.cooldown > 0
        ? Math.round((1000 / s.cooldown) * 10) / 10
        : NaN;
    const attacks = (s) => Number.isFinite(s?.cooldown) && s.cooldown > 0;
    if (now) {
      if (attacks(now) && attacks(next)) {
        chip('DPS', Math.round(dps(now)), Math.round(dps(next)));
        chip('RATE', rate(now), rate(next), (v) => v.toFixed(1));
        chip('RANGE', now.range ?? 0, next.range ?? 0);
      } else {
        // A wall upgrades on the two numbers it actually has.
        chip('HP', now.health ?? 0, next.health ?? 0);
        chip('THORNS', now.thornsDamage ?? 0, next.thornsDamage ?? 0);
      }
    } else if (attacks(next)) {
      chips.push(`<span class="spec-chip spec-chip-flat">DPS <b>${Math.round(dps(next))}</b></span>`);
      chips.push(`<span class="spec-chip spec-chip-flat">RATE <b>${rate(next).toFixed(1)}</b>/s</span>`);
    }
    return `<span class="spec-card-chips">${chips.join('')}</span>`;
  }

  /** Attribute-safe text: descriptions are data, and `"` would end the title. */
  static escAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /** One specialisation, as a card. */
  specCard(opt, tower) {
    const lane = opt.branch === 'spec-b' ? 'b' : 'a';
    const art = this.upgradeArt(tower, opt.branch);
    const artHtml = art
      ? `<img class="spec-card-art" src="${art}" alt="" draggable="false" />`
      : '<span class="spec-card-art spec-card-art-blank" aria-hidden="true">◆</span>';
    return `
      <button class="spec-card spec-lane-${lane} btn-upgrade-choice" data-choice="${opt.key}" title="${HUD.escAttr(opt.description)}">
        <span class="spec-card-top">
          ${artHtml}
          <span class="spec-card-ident">
            <span class="spec-card-path">PATH ${lane === 'a' ? 'I' : 'II'}</span>
            <span class="spec-card-title">${opt.title}</span>
            <span class="spec-card-role">${this.describeRole(opt)}</span>
          </span>
        </span>
        <span class="spec-card-pitch">${opt.description}</span>
        ${this.statChips(tower.stats, opt)}
        <span class="spec-card-cta">
          <img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" />
          <b>${opt.upgradeCost}</b><em>UNLOCK</em>
        </span>
      </button>
    `;
  }

  renderUpgradeActions(tower) {
    const opts = tower.nextUpgrades;
    let html = '';

    if (opts.length === 1) {
      const opt = opts[0];
      const art = this.upgradeArt(tower, this.nextSlot(tower));
      const artHtml = art
        ? `<img class="spec-card-art" src="${art}" alt="" draggable="false" />`
        : '<span class="spec-card-art spec-card-art-blank" aria-hidden="true">▲</span>';
      const ability = opt.ability?.label
        ? `<span class="spec-card-role spec-card-role-next">${opt.ability.label.toUpperCase()}</span>`
        : `<span class="spec-card-role spec-card-role-next">★${Math.min(5, tower.level + 1)}</span>`;
      html = `
        <button id="btn-upgrade-tower" class="spec-card spec-card-wide" data-choice="${opt.key}">
          <span class="spec-card-top">
            ${artHtml}
            <span class="spec-card-ident">
              <span class="spec-card-path">NEXT TIER</span>
              <span class="spec-card-title">${opt.title || tower.def?.name || 'Upgrade'}</span>
              ${ability}
            </span>
          </span>
          ${this.statChips(tower.stats, opt)}
          <span class="spec-card-cta">
            <img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" />
            <b><span id="inspect-upgrade-cost">${opt.upgradeCost}</span></b><em>UPGRADE</em>
          </span>
        </button>
      `;
    } else if (opts.length > 1) {
      html = `
        <div class="spec-selection-block">
          <div class="spec-choice-title">
            <span>CHOOSE A SPECIALISATION</span>
            <span class="spec-choice-hint">one path · rest of the run</span>
          </div>
          <div class="spec-cards-row">
            ${opts.map((opt) => this.specCard(opt, tower)).join('')}
          </div>
        </div>
      `;
    } else {
      html = `<div class="max-spec-badge"><span class="max-spec-stars">★★★★★</span><span>FULLY UPGRADED</span></div>`;
    }

    html += `
      <button id="btn-sell-tower" class="game-btn game-btn-sell">
        SELL · +<img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> <span id="inspect-sell-refund">${tower.sellRefund}</span>
      </button>
    `;
    return html;
  }

  bindUpgradeActions(tower) {
    const single = document.getElementById('btn-upgrade-tower');
    single?.addEventListener('click', () => {
      this.callbacks.onUpgradeTower?.(this.inspectedTower, single.dataset.choice);
    });

    document.querySelectorAll('.btn-upgrade-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUpgradeTower?.(this.inspectedTower, btn.dataset.choice);
      });
    });

    const sellBtn = document.getElementById('btn-sell-tower');
    sellBtn?.addEventListener('click', () => {
      audio.playCoin();
      this.callbacks.onSellTower?.(this.inspectedTower);
      this.closeInspector();
    });
  }

  updateActionAffordability(tower) {
    if (!tower) return;
    const single = document.getElementById('btn-upgrade-tower');
    if (single) single.disabled = !tower.canUpgrade(single.dataset.choice);
    document.querySelectorAll('.btn-upgrade-choice').forEach((btn) => {
      btn.disabled = !tower.canUpgrade(btn.dataset.choice);
    });
  }

  updateTargetingUI(activeMode) {
    document.querySelectorAll('.target-btn').forEach((b) => {
      const active = b.dataset.mode === activeMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  toggleInspectorCollapsed() {
    const panel = document.getElementById('tower-inspector');
    if (!panel) return;
    this.inspectorCollapsed = !this.inspectorCollapsed;
    panel.classList.toggle('collapsed', this.inspectorCollapsed);
    const btn = document.getElementById('btn-collapse-inspect');
    if (btn) {
      btn.textContent = this.inspectorCollapsed ? '▸' : '▾';
      btn.setAttribute('aria-label', this.inspectorCollapsed ? 'Expand panel' : 'Collapse panel');
    }
    this.repositionInspector(true);
  }

  closeInspector() {
    this.inspectedTower = null;
    this.inspectorAnchorRatio = null;
    const panel = document.getElementById('tower-inspector');
    if (panel) panel.classList.add('hidden');
    this.callbacks.onDeselectTower?.();
  }

  /* ============================================================== SELECTION */

  toggleBuildSelection(key) {
    audio.playClick();
    haptics.tap('tap');
    // A hotkey can arm a defence while the dock is folded, or while the other
    // tab is open: open the dock and page to the card so the player can see
    // which defence is live. The phone shell does the opposite — the card drops
    // the sheet the moment it is picked, because the next thing the player
    // needs to see is the map they are about to build on.
    if (!this.isMobileShell) this.expandDock();
    this.revealBuildKey(key);
    if (this.selectedBuildKey === key) {
      this.clearBuildSelection();
      return;
    }
    this.selectedBuildKey = key;
    document.querySelectorAll('.build-card').forEach((c) => {
      const active = c.dataset.key === key;
      c.classList.toggle('selected', active);
      c.setAttribute('aria-pressed', String(active));
    });
    if (this.inspectedTower) this.closeInspector();
    this.setPlacementHint(key);
    if (this.isMobileShell) this.setDockCollapsed(true, { persist: false, clearSelection: false });
    this.callbacks.onSelectBuild?.(key);
  }

  clearBuildSelection(silent = false) {
    const had = Boolean(this.selectedBuildKey);
    this.selectedBuildKey = null;
    document.querySelectorAll('.build-card').forEach((c) => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
    this.setPlacementHint(null);
    if (had && !silent) this.callbacks.onSelectBuild?.(null);
  }

  /** Shake the price tag of a card the treasury cannot pay for yet. */
  flashUnaffordable(card) {
    audio.playError();
    const cost = card?.querySelector?.('.card-cost');
    if (!cost) return;
    cost.classList.remove('denied');
    // Reading `offsetWidth` restarts the animation on a second tap.
    void cost.offsetWidth;
    cost.classList.add('denied');
    clearTimeout(this.denyTimer);
    this.denyTimer = setTimeout(() => cost.classList.remove('denied'), 320);
  }

  setPlacementHint(key) {
    const hint = document.getElementById('placement-hint');
    const text = document.getElementById('placement-hint-text');
    if (!hint || !text) return;
    if (!key) {
      hint.classList.add('hidden');
      return;
    }
    const def = getBuildDefinition(key);
    // Coins come from the last update() call — never parsed back out of the DOM.
    const coins = Number(this.coins) || 0;
    const affordable = coins >= def.cost;
    const where = key === 'barricade' ? 'a road tile' : 'a grass tile';
    const role = key === 'barricade' ? ' · enemies must break it' : '';
    // A phone taps and has no Esc key; the pill's own ✕ is the way out there.
    const verb = this.isMobileShell ? 'tap' : 'click';
    const cancel = this.isMobileShell ? '✕ to cancel' : 'ESC to cancel';
    text.textContent = affordable
      ? `PLACING ${def.name.toUpperCase()} · ${def.cost} gold${role} — ${verb} ${where} · ${cancel}`
      : `NEED ${def.cost} GOLD FOR ${def.name.toUpperCase()} · kill enemies to earn more`;
    hint.classList.toggle('unaffordable', !affordable);
    hint.classList.remove('hidden');
  }

  /* ================================================================== FOCUS */

  /**
   * Show the marked creep under the top bar.
   *
   * The reticle on the battlefield says *where*; this chip says *who* and how
   * much health is left, and doubles as the visible way out of the mode on a
   * touch device that has no Esc key.
   */
  showFocus(enemy) {
    const chip = document.getElementById('focus-chip');
    const readout = focusReadout(enemy);
    if (!chip) return;
    if (!readout) {
      this.hideFocus();
      return;
    }
    chip.classList.remove('hidden');
    chip.classList.toggle('focus-chip-boss', readout.boss);
    this.updateFocus(enemy);
  }

  updateFocus(enemy) {
    const readout = focusReadout(enemy);
    if (!readout) {
      this.hideFocus();
      return;
    }
    const chip = document.getElementById('focus-chip');
    const name = document.getElementById('focus-name');
    const hp = document.getElementById('focus-hp');
    if (name) name.textContent = readout.name;
    if (hp) hp.textContent = `${readout.hp} / ${readout.max}`;
    chip?.style.setProperty('--focus-hp', `${readout.pct}%`);
  }

  hideFocus() {
    document.getElementById('focus-chip')?.classList.add('hidden');
  }

  /* ================================================================= TOASTS */

  showToast(message, type = 'info') {
    const banner = document.getElementById('toast-banner');
    if (!banner) return;
    if (message === this.lastToast && !banner.classList.contains('hidden')) return;
    this.lastToast = message;
    // A refusal is the one toast the player may not be looking at, because
    // their thumb is on the plot they just tapped: buzz it.
    haptics.tap(type === 'error' ? 'deny' : type === 'success' ? 'build' : 'tap');

    banner.textContent = message;
    banner.className = `toast-banner toast-${type}`;
    banner.classList.remove('hidden');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      banner.classList.add('hidden');
      this.lastToast = '';
    }, 2800);
  }

  /* ============================================================ CAMERA STATE */

  setZoomState(state) {
    this.zoomState = { ...this.zoomState, ...state };
    const readout = document.getElementById('zoom-readout');
    if (readout) readout.textContent = `${Math.round(this.zoomState.zoom * 100)}%`;
    const zoomIn = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');
    if (zoomIn) zoomIn.disabled = !this.zoomState.canZoomIn;
    if (zoomOut) zoomOut.disabled = !this.zoomState.canZoomOut;
    const fit = document.getElementById('btn-zoom-fit');
    if (fit) {
      fit.classList.toggle('active', Boolean(this.zoomState.atFit));
      fit.setAttribute('aria-pressed', String(Boolean(this.zoomState.atFit)));
    }
  }

  /* ============================================================ FULLSCREEN */

  /**
   * Mirror the browser fullscreen state in the HUD.
   * @param {{supported?:boolean, active?:boolean}} state
   */
  setFullscreenState(state = {}) {
    this.fullscreenState = { ...this.fullscreenState, ...state };
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;
    const supported = this.fullscreenState.supported !== false;
    btn.classList.toggle('hidden', !supported);
    const active = Boolean(this.fullscreenState.active);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    btn.title = active ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)';
  }

  /* ================================================================== BOSS */

  /**
   * Reveal the boss banner.
   *
   * This MUST stay in sync with GameScene's `onBossSpawn` callback, which calls
   * `hud.showBossBar(enemy)`. A missing method here throws inside Phaser's
   * step(), which cancels the next requestAnimationFrame and freezes the whole
   * game the instant the first boss spawns (wave 3). tests/ui-contracts.test.js
   * now pins every HUD method GameScene calls.
   */
  showBossBar(boss, extras = 0) {
    const banner = document.getElementById('boss-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    const nameEl = document.getElementById('boss-name');
    if (nameEl) nameEl.textContent = (boss?.def?.name || 'BOSS').toUpperCase();
    this.updateBossPhase(boss, boss?.bossPhases?.[0] || { phase: 1, name: 'Engaged' });
    this.setBossOverflow(extras);
    this.updateBossBar(boss);
  }

  /**
   * Show the number of bosses the strip cannot display.
   *
   * Endless can field three at once (anchor + both titans); the panel keeps
   * tracking the deadliest one and this badge tells the player the rest are
   * still out there, instead of silently hiding them.
   */
  setBossOverflow(count) {
    const extra = document.getElementById('boss-extra');
    if (!extra) return;
    const others = Math.max(0, Math.floor(Number(count) || 0));
    extra.textContent = `+${others} BOSS${others === 1 ? '' : 'ES'}`;
    extra.classList.toggle('hidden', others === 0);
  }

  /** @deprecated Kept for older call sites — use {@link HUD#showBossBar}. */
  showBossBanner(boss) {
    this.showBossBar(boss);
  }

  updateBossPhase(boss, phase) {
    const badge = document.getElementById('boss-phase-badge');
    const abilityText = document.getElementById('boss-ability-text');
    if (badge) badge.textContent = `PHASE ${phase.phase || 1}`;
    if (abilityText) abilityText.textContent = phase.name || 'Encounter Active';
  }

  updateBossBar(boss) {
    const banner = document.getElementById('boss-banner');
    if (!banner || banner.classList.contains('hidden')) return;

    const hpBar = document.getElementById('boss-hp-bar');
    const shieldBar = document.getElementById('boss-shield-bar');
    const hpText = document.getElementById('boss-hp-text');

    // Defensive maths: a boss mid-spawn may not have its stats yet, and NaN%
    // would silently break the bar widths.
    const health = Number(boss?.health) || 0;
    const maxHealth = Number(boss?.maxHealth) || 0;
    const shield = Number(boss?.shield) || 0;
    const maxShield = Number(boss?.maxShield) || 0;

    const hpPct = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0;
    if (hpBar) hpBar.style.width = `${hpPct}%`;

    if (maxShield > 0) {
      const shieldPct = Math.max(0, Math.min(100, (shield / maxShield) * 100));
      if (shieldBar) {
        shieldBar.style.width = `${shieldPct}%`;
        shieldBar.style.display = shield > 0 ? 'block' : 'none';
      }
      if (hpText) {
        hpText.textContent =
          shield > 0 ? `${health} / ${maxHealth} HP · shield ${shield}` : `${health} / ${maxHealth} HP`;
      }
    } else {
      if (shieldBar) shieldBar.style.display = 'none';
      if (hpText) hpText.textContent = `${health} / ${maxHealth} HP`;
    }
  }

  hideBossBar() {
    document.getElementById('boss-banner')?.classList.add('hidden');
    this.setBossOverflow(0);
  }

  hideBossBanner() {
    this.hideBossBar();
  }

  /* ================================================================= UPDATE */

  update(state) {
    const {
      levelName,
      endless,
      baseHealth,
      maxBaseHealth,
      coins,
      score,
      waveNumber,
      totalWaves,
      enemiesRemaining,
      canStartWave,
      isSpawning,
      isPaused,
      earlyCall,
      nextWave,
      bestWave,
      schedule,
      prep,
    } = state;

    this.coins = coins;
    this.setText('val-base-hp', `${baseHealth} / ${maxBaseHealth}`);
    this.setText('val-coins', coins);
    this.setText('val-score', score);
    // The three stat sockets announce their whole sentence: on the compact
    // density the visible label is clipped to the icon, and "GOLD 300" as two
    // separate text nodes reads as "300" to a screen reader.
    document.getElementById('stat-coins')?.setAttribute('aria-label', `Treasury ${coins} gold`);
    document.getElementById('stat-score')?.setAttribute('aria-label', `Score ${score}`);
    this.setText('val-wave', endless ? `${waveNumber}` : `${waveNumber} / ${totalWaves}`);
    if (levelName) {
      this.setText('hud-level-name', String(levelName).toUpperCase());
      document.getElementById('hud-level-chip')?.classList.toggle('endless', Boolean(endless));
    }
    // The auto-start window lands on the wave badge, not on the button's
    // sub-line: `.btn-sub` is a mobile-only second line, so a countdown written
    // there is invisible on desktop (measured — the text was in the DOM and not
    // on screen). The badge line is visible on every shell.
    this.prepActive = Boolean(prep?.active);
    const badge = document.querySelector('.hud-wave-badge');
    badge?.classList.toggle('prepping', this.prepActive);
    this.setText(
      'val-enemies-left',
      this.prepActive
        ? `IN ${formatPrepClock(prep.remainingMs)}`
        : isSpawning
          ? `${enemiesRemaining} spawning…`
          : `${enemiesRemaining} left`
    );

    // The enemies-remaining rule under the wave pill. `enemiesRemaining` falls
    // all wave long, so the bar needs the wave's own peak to mean anything; it
    // is captured when the wave number changes and never guessed from the data
    // (a wave's composition is the wave manager's business, not the HUD's).
    const remaining = Number(enemiesRemaining);
    const waveId = `${waveNumber}/${totalWaves}`;
    if (this.waveIdShown !== waveId) {
      this.waveIdShown = waveId;
      this.wavePeak = Number.isFinite(remaining) ? Math.max(1, remaining) : 1;
    }
    if (Number.isFinite(remaining) && remaining > (this.wavePeak || 0)) this.wavePeak = remaining;
    const leftRatio = this.wavePeak > 0 && Number.isFinite(remaining)
      ? Math.max(0, Math.min(1, remaining / this.wavePeak))
      : 0;
    const leftRounded = Math.round(leftRatio * 100) / 100;
    if (this.waveLeftShown !== leftRounded) {
      this.waveLeftShown = leftRounded;
      badge?.style.setProperty('--wave-left', String(leftRounded));
    }

    // Endless only: the personal best sits under the wave number, and turns
    // gold the moment the run passes it.
    const bestEl = document.getElementById('val-endless-best');
    if (bestEl) {
      const best = Number(bestWave) || 0;
      const show = Boolean(endless) && best > 0;
      bestEl.classList.toggle('hidden', !show);
      if (show) {
        const passed = Number(waveNumber) > best;
        bestEl.textContent = passed ? `NEW BEST · ${waveNumber}` : `BEST ${best}`;
        bestEl.classList.toggle('record', passed);
      }
    }

    const hpStat = document.getElementById('stat-base-hp');
    if (hpStat) {
      // One rule, shared with the scene's crystal reaction (systems/Bastion.js).
      const state = bastionState(baseHealth, maxBaseHealth);
      const critical = state === BASTION_STATE.CRITICAL || state === BASTION_STATE.FALLEN;
      hpStat.classList.toggle('critical', critical);
      hpStat.classList.toggle('warning', state === BASTION_STATE.WARNING);
      // 3 px fill along the pill's bottom edge. One custom property, written
      // only when the ratio actually changes — this runs at 8 Hz.
      const max = Number(maxBaseHealth);
      const hp = Number(baseHealth);
      const ratio = max > 0 && Number.isFinite(hp) ? Math.max(0, Math.min(1, hp / max)) : 0;
      const rounded = Math.round(ratio * 100) / 100;
      if (this.hpRatioShown !== rounded) {
        this.hpRatioShown = rounded;
        hpStat.style.setProperty('--hp-ratio', String(rounded));
        hpStat.style.setProperty(
          '--hp-tone',
          rounded <= 0.25 ? 'var(--hp-bad)' : rounded <= 0.5 ? 'var(--hp-warn)' : 'var(--hp-good)'
        );
      }
      hpStat.setAttribute('aria-label', `Base integrity ${hp} of ${max}`);
    }

    const startBtn = document.getElementById('btn-start-wave');
    this.earlyCallAvailable = Boolean(earlyCall?.available);
    if (startBtn) {
      // One button, two jobs: start the next wave, or call it in early on top
      // of the leftovers for a gold bonus that scales with the risk.
      const canAct = canStartWave || this.earlyCallAvailable;
      startBtn.disabled = !canAct;
      startBtn.classList.toggle('game-btn-pulse', canAct);
      startBtn.classList.toggle('game-btn-early', this.earlyCallAvailable);
      startBtn.title = this.earlyCallAvailable
        ? `Call wave ${earlyCall.wave} now for +${earlyCall.bonus} gold (Space)`
        : 'Start the next wave (Space)';
      const label = startBtn.querySelector('.btn-text');
      if (label) {
        if (this.earlyCallAvailable) label.textContent = `CALL EARLY · +${earlyCall.bonus}g`;
        else label.textContent = canStartWave ? 'START WAVE' : isSpawning ? 'WAVE ACTIVE' : 'IN PROGRESS';
      }
    }

    // A duel opens its own waves. The button stops being a button and becomes
    // the countdown: players need the number, not a control they must not use.
    if (schedule && startBtn) {
      startBtn.disabled = true;
      startBtn.classList.remove('game-btn-pulse', 'game-btn-early');
      startBtn.classList.add('game-btn-scheduled');
      startBtn.title = 'The arena opens every wave itself';
      const label = startBtn.querySelector('.btn-text');
      if (label && label.textContent !== schedule.label) label.textContent = schedule.label;
    } else {
      startBtn?.classList.remove('game-btn-scheduled');
    }

    // Second line under the wave label: on a phone the hover preview has no
    // hover, so the composition of the next wave rides on the button itself
    // instead of in a popover parked over the lane.
    const sub = document.getElementById('start-wave-sub');
    if (sub) {
      const count = Number(nextWave?.total) || 0;
      const ready = Boolean(canStartWave || this.earlyCallAvailable);
      const subText = schedule
        ? schedule.hint || ''
        : ready && count > 0
          ? `${count} ${count === 1 ? 'CREEP' : 'CREEPS'}${nextWave.boss ? ' · BOSS' : ''}`
          : '';
      // The mobile sub-line keeps the scout report; the clock lives on the wave
      // badge above (see `updatePrepClock`).
      this.prepBaseText = subText;
      const text = subText;
      if (sub.textContent !== text) sub.textContent = text;
    }

    this.setWavePreview(nextWave, canStartWave);

    document.querySelectorAll('.build-card').forEach((card) => {
      const def = getBuildDefinition(card.dataset.key);
      const unaffordable = coins < def.cost;
      card.classList.toggle('disabled', unaffordable);
      card.setAttribute('aria-disabled', String(unaffordable));
    });

    if (isPaused !== undefined) {
      this.setPausedUI(isPaused);
    }

    if (this.inspectedTower) {
      this.updateActionAffordability(this.inspectedTower);
      const refund = document.getElementById('inspect-sell-refund');
      if (refund) refund.textContent = this.inspectedTower.sellRefund;
      // Live structure HP: the panel must read the same number as the bar over
      // the wall, or a player watching a wall crumble sees two different truths.
      const hpCell = document.getElementById('inspect-structure-hp');
      if (hpCell) {
        const tower = this.inspectedTower;
        const hp = Math.max(0, Math.round(tower.health ?? 0));
        const maxHp = Math.max(1, Math.round(tower.maxHealth ?? 1));
        const pct = Math.round((hp / maxHp) * 100);
        hpCell.textContent = tower.isBarricade ? `${hp} / ${maxHp} HP (${pct}%)` : `${hp} / ${maxHp} HP`;
      }
    }
    if (this.selectedBuildKey) this.setPlacementHint(this.selectedBuildKey);
  }

  /**
   * Repaint just the countdown line.
   *
   * The battle loop calls this at most once per displayed second (the scene
   * only syncs when the ceil of the remaining time changes), so the HUD is not
   * rewritten every frame to show a clock that has not moved.
   */
  updatePrepClock(remainingMs) {
    if (!this.prepActive) return false;
    this.setText('val-enemies-left', `IN ${formatPrepClock(remainingMs)}`);
    // `.btn-sub` is display:none on desktop, but on a phone it is the line a
    // thumb covers the battlefield with — keep it in step when it is shown.
    const sub = document.getElementById('start-wave-sub');
    if (sub) {
      const text = prepLine(remainingMs, this.prepBaseText);
      if (sub.textContent !== text) sub.textContent = text;
    }
    return true;
  }

  /* ------------------------------------------------------- wave preview */

  /**
   * Prep-phase scout report under the wave button: who is coming next, how
   * many, and whether a boss is in the pack. Hidden while a wave is running so
   * the top bar stays quiet mid-fight.
   */
  setWavePreview(nextWave, canStartWave) {
    const el = document.getElementById('wave-preview');
    if (!el) return;
    // One strip at a time: a live combo owns the slot, because that is the
    // number the player is chasing mid-fight.
    const show = Boolean(nextWave) && Boolean(canStartWave || this.earlyCallAvailable) && !this.comboActive;
    el.classList.toggle('hidden', !show);
    if (!show) {
      if (this.lastPreviewKey) {
        el.textContent = '';
        this.lastPreviewKey = null;
      }
      return;
    }

    const key = `${nextWave.number}:${nextWave.total}:${nextWave.boss}:${nextWave.groups
      .map((g) => `${g.type}${g.count}${ENEMY_TYPES[g.type]?.flying ? 'a' : 'g'}`)
      .join(',')}`;
    if (key === this.lastPreviewKey) return;
    this.lastPreviewKey = key;

    // A wave that carries flyers is a different problem from one that does not:
    // a dock of Boulder Slings and Flame Keeps will watch it pass. The scout
    // strip names the flyers and heads the report with AIR so the prep
    // countdown is spent buying the answer, not discovering the question.
    let air = 0;
    const chips = nextWave.groups
      .map((group) => {
        const name = ENEMY_TYPES[group.type]?.name || group.type;
        const boss = ENEMY_TYPES[group.type]?.isBoss;
        const flies = Boolean(ENEMY_TYPES[group.type]?.flying);
        if (flies) air += group.count;
        return `<span class="wave-preview-chip${boss ? ' boss' : ''}${flies ? ' air' : ''}" title="${name}${flies ? ' — flying' : ''}">
          <b>${group.count}</b> ${name.replace(/^(Goblin|Iron|Shadow|Plague|Aegis|Stone|Abyssal|Crystal)\s+/i, '')}
        </span>`;
      })
      .join('');

    const flags = [air > 0 ? 'AIR' : '', nextWave.boss ? 'BOSS' : ''].filter(Boolean).join(' · ');
    el.innerHTML = `<span class="wave-preview-head">NEXT IN ${nextWave.number}${flags ? ` · ${flags}` : ''}</span>${chips}`;
  }

  /* ------------------------------------------------------------- combo */

  /** Show / refresh the kill-chain chip while a chain is running. */
  showCombo({ chain = 0, multiplier = 1, tier = 0, bonus = 0 } = {}) {
    const chip = document.getElementById('combo-chip');
    if (!chip) return;
    chip.classList.remove('hidden');
    chip.dataset.tier = String(tier);
    this.comboActive = true;
    document.getElementById('wave-preview')?.classList.add('hidden');
    chip.classList.remove('pop');
    // restart the pop animation
    void chip.offsetWidth;
    chip.classList.add('pop');
    this.setText('combo-mult', `×${formatMultiplier(multiplier)}`);
    this.setText('combo-chain', `${chain} KILL CHAIN${bonus > 0 ? ` · +${bonus}g` : ''}`);
    this.updateComboTimer(COMBO_WINDOW_MS);
  }

  hideCombo() {
    document.getElementById('combo-chip')?.classList.add('hidden');
    this.comboActive = false;
  }

  updateComboTimer(remainingMs) {
    const fill = document.getElementById('combo-bar-fill');
    if (!fill) return;
    const ratio = Math.max(0, Math.min(1, remainingMs / COMBO_WINDOW_MS));
    fill.style.transform = `scaleX(${Number(ratio.toFixed(3))})`;
  }

  setText(id, value) {
    const el = document.getElementById(id);
    // textContent (not innerText) so the values are also readable in jsdom,
    // where innerText is not implemented.
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }
}


/** Run chips are plain text, but they come from data — never trust them raw. */
function escapeStatus(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * One line under the wave button: the auto-start clock, then what the scout
 * report says is coming. Kept as a function so `update()` and the per-second
 * `updatePrepClock()` cannot drift apart.
 */
function prepLine(remainingMs, baseText) {
  const clock = formatPrepClock(remainingMs);
  return baseText ? `⏱ ${clock} · ${baseText}` : `⏱ ${clock}`;
}
