// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { BUILD_OPTIONS } from '../src/data/towerData.js';
import { StatisticsPanel } from '../src/ui/StatisticsPanel.js';

/* ============================================================ FIXTURES */

function makeTower(overrides = {}) {
  return {
    level: 1,
    specialization: null,
    isBarricade: false,
    targetingMode: 'first',
    def: { name: 'Ballista Tower' },
    stats: { title: 'Scout Ballista', damage: 15, range: 150, cooldown: 650, damageType: 'physical' },
    nextUpgrades: [{ key: 'lvl2', upgradeCost: 70, title: 'Twin Ballista', description: 'Two bolts' }],
    sellRefund: 42,
    setTargetingMode: vi.fn(),
    canUpgrade: () => true,
    ...overrides,
  };
}

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  const container = document.getElementById('hud-container');
  const hud = new HUD(container, callbacks);
  return hud;
}

const STATE = {
  baseHealth: 20,
  maxBaseHealth: 20,
  coins: 240,
  score: 0,
  waveNumber: 1,
  totalWaves: 6,
  enemiesRemaining: 10,
  canStartWave: true,
  isSpawning: false,
  isPaused: false,
};

/* ============================================================ HUD TESTS */

describe('HUD markup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders every control the game talks to', () => {
    mountHud();
    for (const id of [
      'hud-top-bar',
      'hud-bottom-dock',
      'btn-start-wave',
      'btn-speed',
      'btn-pause',
      'btn-codex',
      'btn-mute',
      'btn-menu',
      'camera-cluster',
      'btn-zoom-in',
      'btn-zoom-out',
      'btn-zoom-fit',
      'zoom-readout',
      'tower-inspector',
      'placement-hint',
      'toast-banner',
      'boss-banner',
      'pause-chip',
      'val-base-hp',
      'val-coins',
      'val-score',
      'val-wave',
      'val-enemies-left',
    ]) {
      expect(document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
    // 3 starter towers + palisade + the 3 forge lines + the 5 engineer lines.
    // Only the active tab's cards are visible, but every card stays in the DOM
    // so a hotkey from the other tab can arm it without a re-render.
    expect(document.querySelectorAll('.build-card')).toHaveLength(BUILD_OPTIONS.length);
    for (const key of ['archer', 'cannon', 'frost', 'barricade', 'forge', 'runes', 'banner']) {
      expect(document.getElementById(`card-${key}`), `missing #card-${key}`).toBeTruthy();
    }
  });

  it('keeps the destructive and secondary controls off the top bar', () => {
    mountHud();
    // Declutter: the bar carries only live battle controls now.
    expect(document.querySelector('#hud-top-bar #btn-codex')).toBeNull();
    expect(document.querySelector('#hud-top-bar #btn-menu')).toBeNull();
    for (const id of ['btn-speed', 'btn-pause', 'btn-mute', 'btn-fullscreen']) {
      expect(document.querySelector(`#hud-top-bar #${id}`), `missing #${id}`).toBeTruthy();
    }
    // They live on the pause card, which is closed until the player pauses.
    const card = document.getElementById('pause-overlay');
    expect(card.classList.contains('hidden')).toBe(true);
    expect(card.querySelector('#btn-codex')).toBeTruthy();
    expect(card.querySelector('#btn-menu')).toBeTruthy();
    expect(card.querySelector('#btn-resume')).toBeTruthy();
  });

  it('opens the pause card with the pause and closes it with resume', () => {
    const onTogglePause = vi.fn(() => true);
    mountHud({ onTogglePause });

    document.getElementById('btn-pause').click();
    expect(document.getElementById('pause-overlay').classList.contains('hidden')).toBe(false);

    onTogglePause.mockReturnValue(false);
    document.getElementById('btn-resume').click();
    expect(onTogglePause).toHaveBeenCalledTimes(2);
    expect(document.getElementById('pause-overlay').classList.contains('hidden')).toBe(true);
  });

  it('forwards the primary actions to the game scene', () => {
    const callbacks = {
      onStartWave: vi.fn(),
      onToggleSpeed: vi.fn(() => 2),
      onTogglePause: vi.fn(() => true),
      onOpenCodex: vi.fn(),
      onOpenMenu: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomReset: vi.fn(),
    };
    const hud = mountHud(callbacks);

    document.getElementById('btn-start-wave').click();
    expect(callbacks.onStartWave).toHaveBeenCalledTimes(1);

    document.getElementById('btn-speed').click();
    expect(document.getElementById('btn-speed').textContent).toBe('2×');

    document.getElementById('btn-pause').click();
    expect(callbacks.onTogglePause).toHaveBeenCalled();
    expect(document.getElementById('pause-chip').classList.contains('hidden')).toBe(false);

    document.getElementById('btn-codex').click();
    expect(callbacks.onOpenCodex).toHaveBeenCalledTimes(1);

    // Leaving a battle is destructive: one tap only arms the caution.
    const quit = document.getElementById('btn-menu');
    quit.click();
    expect(callbacks.onOpenMenu).not.toHaveBeenCalled();
    expect(quit.classList.contains('armed')).toBe(true);
    expect(document.getElementById('quit-warning').classList.contains('hidden')).toBe(false);
    quit.click();
    expect(callbacks.onOpenMenu).toHaveBeenCalledTimes(1);

    // At 1× the "zoom out" control is correctly disabled by setZoomState.
    expect(document.getElementById('btn-zoom-out').disabled).toBe(true);
    hud.setZoomState({ zoom: 2, min: 1, max: 3, atFit: false, canZoomIn: true, canZoomOut: true });

    document.getElementById('btn-zoom-in').click();
    document.getElementById('btn-zoom-out').click();
    document.getElementById('btn-zoom-fit').click();
    expect(callbacks.onZoomIn).toHaveBeenCalledTimes(1);
    expect(callbacks.onZoomOut).toHaveBeenCalledTimes(1);
    expect(callbacks.onZoomReset).toHaveBeenCalledTimes(1);
  });

  it('toggles build selection and reports it to the scene', () => {
    const onSelectBuild = vi.fn();
    mountHud({ onSelectBuild });
    const archer = document.getElementById('card-archer');

    archer.click();
    expect(archer.classList.contains('selected')).toBe(true);
    expect(onSelectBuild).toHaveBeenLastCalledWith('archer');

    archer.click();
    expect(archer.classList.contains('selected')).toBe(false);
    expect(onSelectBuild).toHaveBeenLastCalledWith(null);
  });

  it('updates HUD numbers, pause state and card affordability', () => {
    const hud = mountHud();
    hud.update({ ...STATE, coins: 40, baseHealth: 4, isPaused: true });

    expect(document.getElementById('val-coins').textContent).toBe('40');
    expect(document.getElementById('val-base-hp').textContent).toBe('4 / 20');
    expect(document.getElementById('val-wave').textContent).toBe('1 / 6');
    expect(document.getElementById('pause-chip').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('stat-base-hp').classList.contains('critical')).toBe(true);

    const cannon = document.getElementById('card-cannon');
    expect(cannon.classList.contains('disabled')).toBe(true);
    expect(document.getElementById('card-barricade').classList.contains('disabled')).toBe(false);
  });

  it('reflects camera zoom in the control cluster', () => {
    const hud = mountHud();
    hud.setZoomState({ zoom: 2, min: 1, max: 3, atFit: false, canZoomIn: true, canZoomOut: true });
    expect(document.getElementById('zoom-readout').textContent).toBe('200%');
    expect(document.getElementById('btn-zoom-out').disabled).toBe(false);
    expect(document.getElementById('btn-zoom-fit').classList.contains('active')).toBe(false);

    hud.setZoomState({ zoom: 1, min: 1, max: 3, atFit: true, canZoomIn: true, canZoomOut: false });
    expect(document.getElementById('zoom-readout').textContent).toBe('100%');
    expect(document.getElementById('btn-zoom-out').disabled).toBe(true);
    expect(document.getElementById('btn-zoom-fit').classList.contains('active')).toBe(true);
  });

  it('shows a placement hint that follows the selected defence', () => {
    const hud = mountHud();
    hud.update(STATE);
    hud.toggleBuildSelection('barricade');

    const hint = document.getElementById('placement-hint');
    expect(hint.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('placement-hint-text').textContent).toContain('WALL');
    expect(document.getElementById('placement-hint-text').textContent).toContain('40');

    hud.update({ ...STATE, coins: 5 });
    expect(hint.classList.contains('unaffordable')).toBe(true);

    hud.clearBuildSelection();
    expect(hint.classList.contains('hidden')).toBe(true);
  });

  it('inspector reports throughput, and names the burn share on a DoT line', () => {
    const hud = mountHud();
    // A crossbow: 34 damage every 0.95 s is ~36 DPS, no DoT share.
    hud.inspectTower(
      makeTower({ stats: { title: 'Iron Crossbow', damage: 34, range: 175, cooldown: 950, damageType: 'physical' } })
    );
    let stats = document.getElementById('inspect-stats').textContent;
    expect(stats).toContain('DPS');
    expect(stats).toContain('36');
    expect(stats).not.toContain('burn');

    // A siphon: the burn is part of the pitch, so it is named separately.
    hud.inspectTower(
      makeTower({
        stats: {
          title: 'Pitchfire Siphon',
          damage: 18,
          range: 105,
          cooldown: 900,
          damageType: 'fire',
          dot: { kind: 'burn', damage: 6, tickMs: 500, durationMs: 2500 },
        },
      })
    );
    stats = document.getElementById('inspect-stats').textContent;
    expect(stats).toContain('20');
    expect(stats).toContain('+12 burn');
  });

  it('adds the bonus shots of a capstone to the DPS line', () => {
    const hud = mountHud();
    hud.inspectTower(
      makeTower({
        stats: {
          title: 'Storm Repeater',
          damage: 10,
          range: 118,
          cooldown: 90,
          damageType: 'physical',
          ability: { label: 'Storm Volley', shots: 2 },
        },
      })
    );
    // 10 damage x 2 shots every 0.09 s would read as 111 DPS.
    expect(document.getElementById('inspect-stats').textContent).toContain('222');
  });

  it('inspector shows stats, upgrades and closes cleanly', () => {
    const onUpgradeTower = vi.fn();
    const onSellTower = vi.fn();
    const onDeselectTower = vi.fn();
    const hud = mountHud({ onUpgradeTower, onSellTower, onDeselectTower });

    const tower = makeTower();
    hud.inspectTower(tower, { x: 0.5, y: 0.5 });

    const panel = document.getElementById('tower-inspector');
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('inspect-name').textContent).toBe('Scout Ballista');
    expect(document.getElementById('inspect-level').textContent).toBe('★ Level 1');
    expect(document.getElementById('inspect-stats').textContent).toContain('150px');

    document.getElementById('btn-upgrade-tower').click();
    expect(onUpgradeTower).toHaveBeenCalledWith(tower, 'lvl2');

    document.getElementById('btn-sell-tower').click();
    expect(onSellTower).toHaveBeenCalledWith(tower);
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(onDeselectTower).toHaveBeenCalled();

    hud.inspectTower(tower);
    document.getElementById('btn-close-inspect').click();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('renders both specialisation cards at level 2', () => {
    const hud = mountHud();
    const tower = makeTower({
      level: 2,
      nextUpgrades: [
        { key: 'rapid', upgradeCost: 150, title: 'Rapid Ranger', description: 'Fast' },
        { key: 'sniper', upgradeCost: 130, title: 'Sniper Tower', description: 'Long range' },
      ],
    });
    hud.inspectTower(tower);
    const choices = document.querySelectorAll('.btn-upgrade-choice');
    expect(choices).toHaveLength(2);
    expect(document.querySelector('.spec-choice-title').textContent).toContain('SPECIALISATION');
  });

  it('shows a max-level badge when nothing is left to buy', () => {
    const hud = mountHud();
    hud.inspectTower(makeTower({ level: 3, nextUpgrades: [] }));
    expect(document.querySelector('.max-spec-badge').textContent).toContain('FULLY UPGRADED');
  });

  it('shows toasts and clears transient state on reset()', () => {
    const hud = mountHud();
    hud.update(STATE);
    hud.showToast('Wave cleared', 'success');
    const toast = document.getElementById('toast-banner');
    expect(toast.textContent).toBe('Wave cleared');
    expect(toast.className).toContain('toast-success');

    hud.toggleBuildSelection('frost');
    hud.inspectTower(makeTower());
    hud.reset();

    expect(toast.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('tower-inspector').classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.build-card.selected')).toHaveLength(0);
    expect(hud.selectedBuildKey).toBe(null);
    expect(hud.inspectedTower).toBe(null);
  });
});

/* ==================================================== STATISTICS DRAWER */

describe('Algorithm codex drawer (non-blocking)', () => {
  function mountPanel() {
    document.body.innerHTML = '<div id="app"><div id="modal-container"></div></div>';
    const container = document.getElementById('modal-container');
    const panel = new StatisticsPanel(
      container,
      {
        pathfinding: {
          lastRun: {
            purpose: 'Barricade feasibility',
            nodesVisited: 212,
            neighborChecks: 780,
            pathNodes: 24,
            pathEdges: 23,
            timeMs: 1.234,
          },
          cumulative: { runs: 7, nodesVisited: 1400 },
        },
        leaderboard: {
          records: [1, 2, 3],
          lastSortStats: { elements: 3, comparisons: 5, merges: 2, writes: 9, maxDepth: 2 },
          lastSearch: { comparisons: 3, n: 3 },
        },
        gameState: { counters: { enemiesSpawned: 11, enemiesDefeated: 9, towersPlaced: 4 } },
      },
      { onToggleBFSVisualizer: vi.fn() }
    );
    return panel;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens as a drawer instead of a full-screen modal', () => {
    const panel = mountPanel();
    panel.show();

    const drawer = document.getElementById('codex-drawer');
    expect(drawer).toBeTruthy();
    expect(drawer.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.codex-shell')).toBeTruthy();
    // No blocking scrim: the battlefield stays visible and playable.
    expect(document.querySelector('.modal-overlay')).toBe(null);
    expect(panel.isOpen()).toBe(true);
    panel.stopLive();
  });

  it('renders live telemetry from the running systems', () => {
    const panel = mountPanel();
    panel.show();
    expect(document.getElementById('live-bfs-visited').textContent).toBe('212 nodes');
    expect(document.getElementById('live-bfs-path').textContent).toBe('24 nodes · 23 steps');
    expect(document.getElementById('live-bfs-runs').textContent).toContain('7 searches');
    expect(document.getElementById('live-sort-merges').textContent).toBe('2');
    expect(document.getElementById('live-spawned').textContent).toBe('11');
    expect(document.getElementById('live-towers').textContent).toBe('4');
    panel.stopLive();
  });

  it('toggles the BFS overlay without closing the drawer', () => {
    const onToggleBFSVisualizer = vi.fn();
    const panel = new StatisticsPanel(
      (document.body.innerHTML = '<div id="app"><div id="modal-container"></div></div>',
      document.getElementById('modal-container')),
      { pathfinding: {}, leaderboard: null, gameState: { counters: {} } },
      { onToggleBFSVisualizer }
    );
    panel.show();
    document.getElementById('btn-toggle-bfs-vis').click();
    expect(onToggleBFSVisualizer).toHaveBeenCalledWith(true);
    expect(document.getElementById('btn-toggle-bfs-vis').textContent).toBe('HIDE BFS PATH');
    expect(panel.isOpen()).toBe(true);
    panel.stopLive();
  });

  it('survives a game that has not run a single search yet', () => {
    const panel = new StatisticsPanel(
      (document.body.innerHTML = '<div id="app"><div id="modal-container"></div></div>',
      document.getElementById('modal-container')),
      { pathfinding: {}, leaderboard: null, gameState: {} },
      {}
    );
    expect(() => panel.show()).not.toThrow();
    expect(document.getElementById('live-bfs-purpose').textContent).toBe('No search yet');
    panel.stopLive();
    panel.hide();
    expect(panel.isOpen()).toBe(false);
  });
});

/* ==================================================== TUTORIAL TARGETS */

describe('HUD tutorial targets', () => {
  it('marks exactly the control the opening is waiting for, and clears it', () => {
    const hud = mountHud({});
    hud.update(STATE);

    hud.setTutorialHint({ wave: true });
    expect(document.getElementById('btn-start-wave').classList.contains('is-tutorial-target')).toBe(true);

    // One target at a time: naming a new one takes the mark off the old one.
    hud.setTutorialHint({ card: BUILD_OPTIONS[0] });
    expect(document.getElementById('btn-start-wave').classList.contains('is-tutorial-target')).toBe(false);
    expect(document.querySelectorAll('.is-tutorial-target').length).toBe(1);

    hud.setTutorialHint(null);
    expect(document.querySelectorAll('.is-tutorial-target').length).toBe(0);
    hud.destroy?.();
  });

  it('marks the UPGRADE card when the inspector opens mid-step', () => {
    const hud = mountHud({ onUpgradeTower: vi.fn() });
    hud.update(STATE);
    hud.setTutorialHint({ upgrade: true });
    hud.inspectTower(makeTower());
    const upgrade = document.getElementById('btn-upgrade-tower');
    expect(upgrade).toBeTruthy();
    expect(upgrade.classList.contains('is-tutorial-target')).toBe(true);
    // SELL is never a tutorial target — selling the tower the script just asked
    // for would dead-end the step.
    expect(document.getElementById('btn-sell-tower').classList.contains('is-tutorial-target')).toBe(false);
    hud.destroy?.();
  });

  // The glow was the old answer and the request retired it: in an interface
  // where every control is gold, "the shiny one" is not a direction. The marker
  // class stays, but what the player actually sees is the veil with a hole in
  // it and a hand on the control.
  it('mounts the veil inside #app, and only turns it on over a real target', () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
    const hud = mountHud({});
    hud.update(STATE);

    hud.setTutorialHint({ wave: true });
    const veil = document.getElementById('tutorial-spotlight');
    expect(veil).toBeTruthy();
    // Body-level would paint over the opening's own cards (they live in #app,
    // which is a stacking context of its own).
    expect(veil.parentElement.id).toBe('app');
    expect(veil.querySelector('.tut-hole')).toBeTruthy();
    expect(veil.querySelector('.tut-hand')).toBeTruthy();

    hud.setTutorialHint(null);
    expect(veil.classList.contains('is-on')).toBe(false);
    hud.destroy?.();
  });

  it('keeps following the step while the inspector is still closed', () => {
    const hud = mountHud({ onUpgradeTower: vi.fn() });
    hud.update(STATE);
    // The upgrade step is set before the player taps the tower, so there is no
    // UPGRADE button yet — the veil must stay down, not go up with no hole.
    hud.setTutorialHint({ upgrade: true });
    const veil = document.getElementById('tutorial-spotlight');
    expect(veil.classList.contains('is-on')).toBe(false);

    hud.inspectTower(makeTower());
    // jsdom has no layout (every rect is 0×0), and the sampler refuses to
    // spotlight a 0 px target — that guard is the point of the test above.
    // Give the button the rect it has in a browser and the veil must come up.
    const upgrade = document.getElementById('btn-upgrade-tower');
    const rect = { left: 500, top: 400, width: 200, height: 60, right: 700, bottom: 460 };
    upgrade.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => rect });
    hud.syncTutorialSpotlight();
    expect(veil.classList.contains('is-on')).toBe(true);
    expect(veil.querySelector('.tut-hole').style.width).toBe('216px');
    hud.destroy?.();
  });

  // Request 63: a step is a chain, not one control. After the forge hands the
  // player a defence the next thing to press is a *place on the board*, and
  // after the tower exists it is the UPGRADE it unlocks. Neither is a DOM
  // element, so the scene hands over a getter and the veil follows it.
  it('can point at the board itself, and follows the spot when it moves', () => {
    const hud = mountHud({});
    hud.update(STATE);

    let rect = { left: 400, top: 300, width: 60, height: 60 };
    hud.setTutorialHint({ spot: () => rect });
    const veil = document.getElementById('tutorial-spotlight');
    hud.syncTutorialSpotlight();
    const hole = veil.querySelector('.tut-hole');
    expect(veil.classList.contains('is-on')).toBe(true);
    // The same 8 px of breathing room every control target gets.
    expect(hole.style.left).toBe('392px');
    expect(hole.style.width).toBe('76px');
    // No element carries the mark: the rect came from the scene.
    expect(document.querySelectorAll('.is-tutorial-target').length).toBe(0);

    // The player pans the board: the hole has to travel with the cell.
    rect = { left: 520, top: 260, width: 60, height: 60 };
    hud.syncTutorialSpotlight();
    expect(hole.style.left).toBe('512px');
    expect(hole.style.top).toBe('252px');

    // A spot that has been scrolled out of view takes the veil down instead of
    // pinning a hole to the edge of the screen.
    rect = { left: 5000, top: 300, width: 60, height: 60 };
    hud.syncTutorialSpotlight();
    expect(veil.classList.contains('is-on')).toBe(false);

    hud.setTutorialHint(null);
    hud.destroy?.();
  });
});
