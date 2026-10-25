import { BUILD_OPTIONS, BUILD_GROUPS, getBuildDefinition, groupForBuild } from '../data/towerData.js';
import { STARTING_COINS, STARTING_BASE_HEALTH } from '../config/gameConfig.js';
import { audio } from '../rendering/AudioSynth.js';
import { clampPanel, placeInspector } from './panelPlacement.js';
import { HudLayout } from './hudLayout.js';
import { ENEMY_TYPES } from '../data/enemyData.js';
import { COMBO_WINDOW_MS } from '../systems/ComboMeter.js';

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
    this.toastTimer = null;
    this.hintTimer = null;
    this.inspectorPinned = false;
    this.inspectorCollapsed = false;
    this.inspectorAnchorRatio = null;
    this.lastToast = '';
    this.zoomState = { zoom: 1, min: 1, max: 3, atFit: true, canZoomIn: true, canZoomOut: false };
    this.coins = 0;
    this.earlyCallAvailable = false;
    this.comboActive = false;
    this.comboTimer = null;
    this.fullscreenState = { supported: true, active: false };
    this.dockCollapsed = false;
    // Which dock tab is open. Persisted with the fold state so a phone player who
    // lives in the engineer tab does not re-open on the keeps every battle.
    this.dockGroup = this.readDockGroup();

    this.initDOM();
    this.bindEvents();
    // Restore the player's dock preference before the first frame so the
    // measured --dock-clearance is right from the start.
    this.setDockCollapsed(this.readDockCollapsed(), { persist: false });
    this.bindInspectorDrag();
    this.bindViewport();

    // Publish the real dock / top-bar heights as CSS variables so the floating
    // controls (camera pill, camera hint, toast) can never overlap them.
    this.layout = new HudLayout().observe();
  }

  /* ================================================================ MARKUP */

  initDOM() {
    this.container.innerHTML = `
      <div id="hud-top-bar" class="hud-panel hud-topbar">
        <div class="hud-stat-group">
          <div class="hud-stat" id="stat-base-hp" title="Base integrity — if this hits 0 the realm falls">
            <img class="hud-icon-img heart-pulse" src="/assets/ui/icon_heart.svg" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">BASE</span>
              <span class="hud-value" id="val-base-hp">${STARTING_BASE_HEALTH} / ${STARTING_BASE_HEALTH}</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-coins" title="Treasury — spend gold on defences">
            <img class="hud-icon-img gold-coin" src="/assets/ui/icon_coin.png" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">GOLD</span>
              <span class="hud-value gold-text" id="val-coins">${STARTING_COINS}</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-score" title="Total score">
            <img class="hud-icon-img" src="/assets/ui/icon_trophy.png" alt="" />
            <div class="hud-stat-meta">
              <span class="hud-label">SCORE</span>
              <span class="hud-value" id="val-score">0</span>
            </div>
          </div>
        </div>

        <div class="hud-stat-group hud-center-group">
          <div class="hud-wave-badge" title="Current wave">
            <span class="hud-wave-label">WAVE</span>
            <span class="hud-wave-number" id="val-wave">1 / 6</span>
            <span class="hud-wave-sub" id="val-enemies-left">10 Enemies</span>
            <span class="hud-wave-best hidden" id="val-endless-best">BEST 0</span>
          </div>
          <div class="hud-wave-stack">
            <button id="btn-start-wave" class="game-btn game-btn-primary game-btn-pulse" title="Start the next wave (Space)">
              <span class="btn-glow"></span>
              <span class="btn-text">START WAVE</span>
            </button>
            <div id="wave-preview" class="wave-preview hidden" aria-live="polite"></div>
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
      </div>

      <div id="hud-level-chip" class="hud-panel hud-level-chip" aria-live="polite">
        <span class="hud-level-name" id="hud-level-name">VERDANT MARCHES</span>
      </div>

      <div id="pause-overlay" class="pause-overlay hidden" role="dialog" aria-label="Battle paused">
        <div class="pause-card">
          <p class="pause-title">⏸ SIMULATION PAUSED</p>
          <div class="pause-actions">
            <button id="btn-resume" class="game-btn game-btn-primary">RESUME</button>
            <button id="btn-blessings" class="game-btn game-btn-gold" title="Spend gold on a blessing for this battle">BLESSINGS</button>
            <button id="btn-codex" class="game-btn game-btn-gold" title="Algorithm codex (C)">CODEX</button>
            <button id="btn-menu" class="game-btn game-btn-danger">LEAVE BATTLE</button>
          </div>
          <p id="quit-warning" class="pause-warning hidden">
            Leaving now discards this battle — tap again to confirm.
          </p>
        </div>
      </div>

      <div id="pause-chip" class="pause-chip hidden">⏸ SIMULATION PAUSED</div>

      <div id="boss-banner" class="boss-panel hud-panel hidden">
        <div class="boss-title-row">
          <span class="boss-skull">💀</span>
          <span id="boss-name" class="boss-name">STONE COLOSSUS</span>
          <span id="boss-phase-badge" class="boss-phase-badge">PHASE 1</span>
          <span id="boss-extra" class="boss-phase-badge boss-extra hidden">+1</span>
        </div>
        <div class="boss-bar-frame">
          <div id="boss-shield-bar" class="boss-shield-bar" style="width: 0%;"></div>
          <div id="boss-hp-bar" class="boss-hp-bar" style="width: 100%;"></div>
        </div>
        <div class="boss-hp-values">
          <span id="boss-hp-text">1600 / 1600 HP</span>
          <span id="boss-ability-text" class="boss-ability-text">Hardened Carapace</span>
        </div>
      </div>

      <div id="toast-banner" class="toast-banner hidden" role="status" aria-live="polite"></div>

      <div id="camera-hint" class="camera-hint hidden">
        <span class="camera-hint-icon">✥</span>
        <span><strong>Drag</strong> to pan · <strong>Scroll</strong> or <strong>pinch</strong> to zoom</span>
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

            <div id="inspector-actions-container" class="inspector-actions"></div>
          </div>
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

      <div id="hud-bottom-dock" class="hud-panel hud-dock">
        <div id="placement-hint" class="placement-hint hidden">
          <span id="placement-hint-text">Placing defence…</span>
          <button id="btn-cancel-placement" class="placement-hint-cancel">ESC</button>
        </div>
        <div class="dock-head">
          <button id="btn-toggle-dock" class="dock-toggle" type="button" aria-expanded="true"
                  aria-controls="dock-cards-container" title="Hide or show the forge (H)">
            <span class="dock-toggle-glyph" aria-hidden="true">⚒</span>
            <span class="dock-title" id="dock-title">FORGE DEFENSES</span>
            <span class="dock-toggle-chevron" aria-hidden="true">▾</span>
          </button>
        </div>
        <div class="dock-tabs" id="dock-tabs" role="tablist" aria-label="Defence families"></div>
        <div class="dock-cards" id="dock-cards-container"></div>
      </div>
    `;

    this.renderBuildCards();
    this.setZoomState(this.zoomState);
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
            <span class="powerup-glyph" aria-hidden="true">${powerup.glyph}</span>
            <span class="powerup-key">${powerup.hotkey}</span>
            <span class="powerup-sweep" aria-hidden="true"></span>
            <span class="powerup-timer"></span>
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
    for (const powerup of list) {
      const button = rail.querySelector(`[data-powerup="${powerup.key}"]`);
      if (!button) continue;
      button.classList.toggle('ready', Boolean(powerup.ready));
      button.classList.toggle('targeting', Boolean(powerup.targeting && powerup.ready));
      button.style.setProperty('--charge', String(Math.max(0, Math.min(1, powerup.progress))));
      button.style.setProperty('--accent', powerup.accent || '#f5c451');
      const timer = button.querySelector('.powerup-timer');
      if (timer) {
        timer.textContent = powerup.ready
          ? ''
          : `${Math.ceil((powerup.remainingMs || 0) / 1000)}s`;
      }
    }
  }

  /**
   * Draw the dock.
   *
   * Twelve defences in one strip was the "masikip" layout: the cards shrank to
   * unreadable thumbnails on a phone. The roster is paged by family instead —
   * two tabs, seven and five cards — so every card keeps a legible icon and a
   * 44 px tap target at every breakpoint.
   */
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
          <span class="dock-tab-count">${group.lines.length}</span>${group.label}
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
                title="${def.description}" aria-label="Build ${def.name} for ${def.cost} gold">
          <div class="card-hotkey" aria-hidden="true">${def.hotkey}</div>
          <div class="card-icon-frame">
            <div class="card-sprite sprite-${key}"></div>
          </div>
          <div class="card-info">
            <span class="card-name">${def.name}</span>
            <span class="card-cost"><img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> ${def.cost}</span>
          </div>
        </button>
      `;
    }).join('');

    this.applyDockGroup();
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
    hint.classList.remove('hidden');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hideCameraHint(), durationMs);
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
    this.setDockCollapsed(Boolean(this.dockCollapsed), { persist: false, clearSelection: false });
    this.inspectedTower = null;
    this.selectedBuildKey = null;
    this.inspectorPinned = false;
    this.inspectorCollapsed = false;
    this.inspectorAnchorRatio = null;
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
      return;
    }
    strip.classList.remove('hidden');
    const waves = Math.max(1, Number(state.totalWaves) || 8);
    const wave = Math.max(0, Number(state.wave) || 0);
    this.setText('rival-name', String(state.name || 'CHALLENGER').toUpperCase().slice(0, 16));
    this.setText('rival-wave', String(wave));
    this.setText('rival-waves', String(waves));
    this.setText('rival-score', Number(state.score || 0).toLocaleString());
    const hp = Number.isFinite(state.coreHp) ? Math.max(0, Number(state.coreHp)) : waves;
    const maxHp = Math.max(1, Number(state.maxCoreHp) || 25);
    const fill = document.getElementById('rival-core-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`;
    strip.classList.toggle('rival-down', hp <= 0);
    strip.classList.toggle('rival-done', state.outcome === 'cleared');
    this.setText('rival-state', hp <= 0 ? 'KNOCKED OUT' : state.outcome === 'cleared' ? 'FINISHED' : 'LIVE');
  }

  /** Rename the dock for a duel so the build list never reads as a campaign. */
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
    this.layout?.schedule?.();
    return next;
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
    if (!isPaused) this.disarmQuit();
  }

  /** Drop the "tap again" caution back to its safe state. */
  disarmQuit() {
    clearTimeout(this.quitDisarmTimer);
    document.getElementById('btn-menu')?.classList.remove('armed');
    document.getElementById('quit-warning')?.classList.add('hidden');
  }

  bindEvents() {
    document.querySelectorAll('.build-card').forEach((card) => {
      card.addEventListener('click', () => this.toggleBuildSelection(card.dataset.key));
    });

    document.getElementById('btn-start-wave')?.addEventListener('click', () => {
      audio.playClick();
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

    const muteBtn = document.getElementById('btn-mute');
    const muteImg = document.getElementById('img-mute');
    if (muteImg) muteImg.src = audio.muted ? '/assets/ui/icon_audio_off.png' : '/assets/ui/icon_audio_on.png';
    muteBtn?.addEventListener('click', () => {
      const muted = audio.toggleMute();
      if (muteImg) muteImg.src = muted ? '/assets/ui/icon_audio_off.png' : '/assets/ui/icon_audio_on.png';
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

    document.querySelectorAll('.target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.inspectedTower) return;
        this.inspectedTower.setTargetingMode(btn.dataset.mode);
        this.updateTargetingUI(btn.dataset.mode);
      });
    });

    // Double-clicking the drag handle resets the panel to its anchored spot.
    const handle = document.getElementById('inspector-drag-handle');
    handle?.addEventListener('dblclick', () => {
      this.inspectorPinned = false;
      this.repositionInspector(true);
    });
  }

  bindViewport() {
    this._onResize = () => this.repositionInspector();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
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

  inspectTower(tower, anchorRatio = null) {
    this.inspectedTower = tower;
    if (this.selectedBuildKey) this.clearBuildSelection();

    const panel = document.getElementById('tower-inspector');
    if (!panel) return;
    panel.classList.remove('hidden');

    // The badge shows the real tier: since levels 4 and 5 exist, a hard-coded
    // ★3 would have labelled a maxed tower as a fresh specialisation.
    const titleStr = tower.specialization
      ? `★${tower.level} ${tower.stats?.title || ''}`.trim()
      : tower.isBarricade
        ? tower.stats?.title || (tower.level === 2 ? 'Reinforced Palisade' : 'Wooden Palisade')
        : `★ Level ${tower.level}`;

    document.getElementById('inspect-name').textContent = tower.stats?.title || tower.def.name;
    document.getElementById('inspect-level').textContent = titleStr;

    const statsGrid = document.getElementById('inspect-stats');
    const targetingGroup = document.getElementById('inspect-targeting');

    if (tower.isBarricade) {
      targetingGroup.style.display = 'none';
      const thorns = tower.stats?.thornsDamage || 0;
      const hp = Math.max(0, Math.round(tower.health ?? tower.stats?.health ?? 0));
      const maxHp = Math.max(1, Math.round(tower.maxHealth ?? tower.stats?.health ?? 1));
      const pct = Math.round((hp / maxHp) * 100);
      statsGrid.innerHTML = `
        <div class="stat-cell full-width">
          <span class="lbl">ROLE</span>
          <span class="val">Solid wall — enemies stop and break it down</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">STRUCTURE</span>
          <span class="val">${hp} / ${maxHp} HP (${pct}%)</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">THORNS RETALIATION</span>
          <span class="val">${thorns > 0 ? `${thorns} damage per second to attackers` : 'None at level 1'}</span>
        </div>
      `;
    } else {
      targetingGroup.style.display = 'block';
      this.updateTargetingUI(tower.targetingMode);
      const s = tower.stats;
      const special = this.describeSpecial(s);
      statsGrid.innerHTML = `
        <div class="stat-cell"><span class="lbl">DAMAGE</span><span class="val">${s.damage}</span></div>
        <div class="stat-cell"><span class="lbl">RANGE</span><span class="val">${s.range}px</span></div>
        <div class="stat-cell"><span class="lbl">ATTACK SPEED</span><span class="val">${(s.cooldown / 1000).toFixed(2)}s</span></div>
        <div class="stat-cell"><span class="lbl">DPS</span><span class="val">${this.describeDps(s)}</span></div>
        <div class="stat-cell"><span class="lbl">DAMAGE TYPE</span><span class="val">${(s.damageType || 'Physical').toUpperCase()}</span></div>
        <div class="stat-cell full-width"><span class="lbl">SPECIAL PERK</span><span class="val">${special}</span></div>
        <div class="stat-cell full-width"><span class="lbl">SIGNATURE</span><span class="val">${this.describeAbility(s)}</span></div>
      `;
    }

    const actionsContainer = document.getElementById('inspector-actions-container');
    actionsContainer.innerHTML = this.renderUpgradeActions(tower);
    this.bindUpgradeActions(tower);
    this.updateActionAffordability(tower);

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
    const seconds = Math.max(0.06, (s.cooldown || 0) / 1000);
    const shots = Math.max(1, s.ability?.shots || 1);
    const direct = Math.round(((s.damage || 0) * shots) / seconds);
    if (!s.dot?.damage || !s.dot?.tickMs) return `${direct}`;
    const kind = s.dot.kind === 'poison' ? 'poison' : 'burn';
    const dotRate = Math.round(s.dot.damage / (Math.max(100, s.dot.tickMs) / 1000));
    return `${direct} <span class="dps-extra">+${dotRate} ${kind}</span>`;
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

  renderUpgradeActions(tower) {
    const opts = tower.nextUpgrades;
    let html = '';

    if (opts.length === 1) {
      const opt = opts[0];
      html = `
        <button id="btn-upgrade-tower" class="game-btn game-btn-upgrade" data-choice="${opt.key}">
          UPGRADE · <img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> <span id="inspect-upgrade-cost">${opt.upgradeCost}</span>
        </button>
      `;
    } else if (opts.length > 1) {
      html = `
        <div class="spec-selection-block">
          <div class="spec-choice-title">CHOOSE A SPECIALISATION</div>
          <div class="spec-cards-row">
            ${opts
              .map(
                (opt) => `
              <button class="game-btn game-btn-spec btn-upgrade-choice" data-choice="${opt.key}" title="${opt.description}">
                <span class="spec-btn-title">${opt.title}</span>
                <span class="spec-btn-cost"><img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> ${opt.upgradeCost}</span>
                <span class="spec-btn-desc">${opt.description}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    } else {
      html = `<div class="max-spec-badge">★ FULLY UPGRADED</div>`;
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
    // A hotkey can arm a defence while the dock is folded, or while the other
    // tab is open: open the dock and page to the card so the player can see
    // which defence is live.
    this.expandDock();
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
    text.textContent = affordable
      ? `PLACING ${def.name.toUpperCase()} · ${def.cost} gold${role} — click ${where} · ESC to cancel`
      : `NEED ${def.cost} GOLD FOR ${def.name.toUpperCase()} · kill enemies to earn more`;
    hint.classList.toggle('unaffordable', !affordable);
    hint.classList.remove('hidden');
  }

  /* ================================================================= TOASTS */

  showToast(message, type = 'info') {
    const banner = document.getElementById('toast-banner');
    if (!banner) return;
    if (message === this.lastToast && !banner.classList.contains('hidden')) return;
    this.lastToast = message;

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
    } = state;

    this.coins = coins;
    this.setText('val-base-hp', `${baseHealth} / ${maxBaseHealth}`);
    this.setText('val-coins', coins);
    this.setText('val-score', score);
    this.setText('val-wave', endless ? `${waveNumber}` : `${waveNumber} / ${totalWaves}`);
    if (levelName) {
      this.setText('hud-level-name', String(levelName).toUpperCase());
      document.getElementById('hud-level-chip')?.classList.toggle('endless', Boolean(endless));
    }
    this.setText(
      'val-enemies-left',
      isSpawning ? `${enemiesRemaining} spawning…` : `${enemiesRemaining} left`
    );

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
      const ratio = maxBaseHealth ? baseHealth / maxBaseHealth : 0;
      hpStat.classList.toggle('critical', ratio <= 0.3);
      hpStat.classList.toggle('warning', ratio > 0.3 && ratio <= 0.6);
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
    }
    if (this.selectedBuildKey) this.setPlacementHint(this.selectedBuildKey);
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
      .map((g) => `${g.type}${g.count}`)
      .join(',')}`;
    if (key === this.lastPreviewKey) return;
    this.lastPreviewKey = key;

    const chips = nextWave.groups
      .map((group) => {
        const name = ENEMY_TYPES[group.type]?.name || group.type;
        const boss = ENEMY_TYPES[group.type]?.isBoss;
        return `<span class="wave-preview-chip${boss ? ' boss' : ''}" title="${name}">
          <b>${group.count}</b> ${name.replace(/^(Goblin|Iron|Shadow|Plague|Aegis|Stone|Abyssal|Crystal)\s+/i, '')}
        </span>`;
      })
      .join('');

    el.innerHTML = `<span class="wave-preview-head">NEXT IN ${nextWave.number}${nextWave.boss ? ' · BOSS' : ''}</span>${chips}`;
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
