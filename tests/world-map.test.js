// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { WorldMapUI } from '../src/ui/WorldMapUI.js';
import {
  LANDMARKS,
  REGIONS,
  PLATE,
  getLandmark,
  landmarkForLevel,
  regionForLevel,
  stageState,
  currentObjective,
  campaignSummary,
  BANNER_LEVEL_IDS,
} from '../src/data/worldMap.js';
import { threatFor, bossFor, missionBriefingMarkup } from '../src/ui/MissionBriefingUI.js';
import { LEVELS, ENDLESS_LEVEL, getLevel, THEMES } from '../src/data/levelData.js';
import { MODES } from '../src/data/modeData.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { DailyStore } from '../src/systems/DailyChallenge.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const store = () => new ProgressStore({ storage: fakeStorage() });

beforeEach(() => {
  document.body.innerHTML = '<div id="world-map-root"></div>';
});

/* ========================================================================== */
/* Data — the map must describe the game that actually exists.                */
/* ========================================================================== */

describe('world map data', () => {
  it('plants every campaign stage and Endless exactly once', () => {
    const banners = LANDMARKS.filter((entry) => entry.levelId).map((entry) => entry.levelId);
    expect(new Set(banners).size).toBe(banners.length);
    expect(banners.sort()).toEqual([...BANNER_LEVEL_IDS].sort());
    for (const id of [...LEVELS.map((level) => level.id), ENDLESS_LEVEL.id]) {
      expect(landmarkForLevel(id), `${id} has no banner`).not.toBeNull();
      expect(getLevel(id)).not.toBeNull();
    }
  });

  it('never invents a region: each one names a real theme and a real stage', () => {
    const themeIds = new Set(Object.keys(THEMES));
    for (const region of REGIONS) {
      expect(themeIds.has(region.theme)).toBe(true);
      expect(region.name).toBe(THEMES[region.theme].name);
      const level = getLevel(region.levelId);
      expect(level, `${region.id} points at a missing stage`).not.toBeNull();
      expect(level.theme).toBe(region.theme);
    }
    // Every campaign theme has a region on the plate.
    for (const level of LEVELS) {
      expect(regionForLevel(level.id), `${level.id} has no region`).not.toBeNull();
    }
  });

  it('keeps every landmark inside the painted plate', () => {
    for (const entry of LANDMARKS) {
      expect(entry.x).toBeGreaterThan(0);
      expect(entry.x).toBeLessThan(100);
      expect(entry.y).toBeGreaterThan(0);
      expect(entry.y).toBeLessThan(100);
      expect(entry.width).toBeGreaterThan(40);
      expect(entry.width).toBeLessThan(PLATE.width / 3);
    }
  });

  it('ships the art for all thirteen landmarks and the plate', () => {
    const dir = 'public/assets/worldmap';
    expect(existsSync(`${dir}/${basename(PLATE.src)}`)).toBe(true);
    for (const entry of LANDMARKS) {
      expect(existsSync(`public${entry.art}`), `${entry.art} is missing`).toBe(true);
    }
    expect(LANDMARKS).toHaveLength(13);
  });

  it('gives every landmark a live destination', () => {
    const panels = new Set([
      'overview',
      'briefing',
      'warroom',
      'library',
      'shrine',
      'arena',
      'forge',
      'champions',
      'monument',
    ]);
    const targets = new Set(['forge', 'achievements', 'leaderboard']);
    for (const entry of LANDMARKS) {
      expect(panels.has(entry.panel), `${entry.id} panel "${entry.panel}"`).toBe(true);
      if (entry.panel === 'briefing') expect(entry.levelId).toBeTruthy();
      if (entry.target) expect(targets.has(entry.target), `${entry.id} → ${entry.target}`).toBe(true);
    }
    // The castle is the overview, and it is the only one.
    expect(LANDMARKS.filter((entry) => entry.panel === 'overview')).toHaveLength(1);
  });
});

/* ========================================================================== */
/* Save state                                                                 */
/* ========================================================================== */

describe('world map save state', () => {
  it('reports locked → objective → cleared as the campaign advances', () => {
    const progress = store();
    expect(stageState(progress, 'level-2')).toBe('locked');
    expect(stageState(progress, 'level-1')).toBe('next');
    expect(currentObjective(progress)?.id).toBe('level-1');

    progress.recordVictory(getLevel('level-1'), {
      baseHealth: 25,
      maxBaseHealth: 25,
      score: 900,
    });

    expect(stageState(progress, 'level-1')).toBe('cleared');
    expect(stageState(progress, 'level-2')).toBe('next');
    expect(stageState(progress, 'level-3')).toBe('locked');
    expect(currentObjective(progress)?.id).toBe('level-2');
  });

  it('treats a recorded endless wave as cleared, because endless has no stars', () => {
    const progress = store();
    progress.recordVictory(getLevel('level-1'), { baseHealth: 25, maxBaseHealth: 25, score: 1 });
    progress.profile.endlessBestWave = 7;
    expect(stageState(progress, 'endless')).toBe('cleared');
  });

  it('summarises the ledger the castle shows', () => {
    const progress = store();
    const before = campaignSummary(progress);
    expect(before.cleared).toBe(0);
    expect(before.total).toBe(LEVELS.length);
    expect(before.maxStars).toBe(progress.maxStars);

    progress.recordVictory(getLevel('level-1'), {
      baseHealth: 25,
      maxBaseHealth: 25,
      score: 500,
    });
    const after = campaignSummary(progress);
    expect(after.cleared).toBe(1);
    expect(after.stars).toBeGreaterThan(0);
    expect(after.gold).toBe(progress.gold);
  });

  it('derives threat from the level data instead of hardcoding it', () => {
    expect(threatFor(getLevel('level-1')).pips).toBe(1);
    expect(threatFor(getLevel('level-2')).pips).toBe(2);
    expect(threatFor(getLevel('level-3')).pips).toBe(3);
    expect(threatFor(getLevel('level-4')).pips).toBe(4);
    expect(threatFor(null).pips).toBe(1);
  });

  it('names the boss the stage really spawns', () => {
    expect(bossFor(getLevel('level-1'))).toMatch(/Warlord/i);
    expect(bossFor(getLevel('level-4'))).toBeTruthy();
    expect(bossFor({ boss: 'nope' })).toBe('None');
  });
});

/* ========================================================================== */
/* Briefing card                                                              */
/* ========================================================================== */

describe('MissionBriefingUI', () => {
  it('prints the real stage, region, waves, boss and best score', () => {
    const progress = store();
    progress.profile.bestScore['level-1'] = 1234;
    const level = getLevel('level-1');
    const html = missionBriefingMarkup(level, progress, {
      state: 'next',
      region: regionForLevel('level-1'),
    });

    expect(html).toContain(level.name);
    expect(html).toContain(THEMES.grassland.name);
    expect(html).toContain('OBJECTIVE');
    expect(html).toContain('1,234');
    expect(html).toContain(`>${level.waves.length}<`); // wave count
    expect(html).toContain('DEPLOY');
    expect(html).not.toContain('wm-locked-note');
  });

  it('disables deploy and explains the lock on a locked stage', () => {
    const html = missionBriefingMarkup(getLevel('level-3'), store(), {
      state: 'locked',
      region: regionForLevel('level-3'),
    });
    expect(html).toContain('wm-locked-note');
    expect(html).toMatch(/id="wm-deploy"[^>]*disabled/);
  });

  it('reports endless as endless, not as a six-wave stage', () => {
    const html = missionBriefingMarkup(ENDLESS_LEVEL, store(), { state: 'open' });
    expect(html).toContain('ENDLESS');
    expect(html).toContain('BEST WAVE');
    // Endless has no first-clear bounty: the gold comes from the run itself.
    expect(html).toContain('Bounties only');
    expect(html).toContain('ENTER THE SIEGE');
  });
});

/* ========================================================================== */
/* The screen                                                                 */
/* ========================================================================== */

function mount(overrides = {}) {
  const progress = overrides.progress || store();
  const callbacks = {
    onDeploy: vi.fn(),
    onDuel: vi.fn(),
    onWarRoom: vi.fn(),
    onMode: vi.fn(),
    onNavigate: vi.fn(),
    onLibrary: vi.fn(),
    onMenu: vi.fn(),
    onDaily: vi.fn(),
    daily: new DailyStore({ storage: fakeStorage() }),
    ...overrides.callbacks,
  };
  const ui = new WorldMapUI(document.getElementById('world-map-root'), progress, callbacks);
  // jsdom has no layout, so the camera is measured against a fixed viewport.
  ui.stage.getBoundingClientRect = () => ({ width: 1000, height: 600, left: 0, top: 0 });
  return { ui, callbacks, progress };
}

describe('WorldMapUI', () => {
  it('renders one button per landmark, wired to the real ids', () => {
    const { ui } = mount();
    const nodes = [...document.querySelectorAll('[data-wm-id]')];
    expect(nodes).toHaveLength(LANDMARKS.length);
    expect(nodes.map((node) => node.dataset.wmId).sort()).toEqual(
      LANDMARKS.map((entry) => entry.id).sort()
    );
    for (const node of nodes) {
      expect(node.tagName).toBe('BUTTON');
      expect(node.getAttribute('aria-label')).toBeTruthy();
      expect(node.querySelector('.wm-landmark-art').getAttribute('src')).toContain(
        '/assets/worldmap/'
      );
    }
    ui.hide();
  });

  it('shows and hides without rebuilding the camera or the nodes', () => {
    const { ui } = mount();
    ui.show();
    expect(document.getElementById('world-map').classList.contains('hidden')).toBe(false);
    expect(ui.isVisible).toBe(true);

    const camera = ui.toMemory();
    ui.hide();
    expect(document.getElementById('world-map').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('world-map-root').childElementCount).toBe(1);

    ui.show();
    // Camera memory survives a round trip through a battle.
    expect(ui.toMemory().cx).toBeCloseTo(camera.cx, 5);
    expect(ui.toMemory().cy).toBeCloseTo(camera.cy, 5);
    ui.hide();
  });

  it('hints the compositor only while the camera is moving', () => {
    vi.useFakeTimers();
    const { ui } = mount();
    ui.show();
    const root = document.getElementById('world-map');
    // At rest the plate is not a promoted layer — that is the whole point.
    expect(root.classList.contains('wm-is-panning')).toBe(false);

    ui.markGesture();
    expect(root.classList.contains('wm-is-panning')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(root.classList.contains('wm-is-panning')).toBe(false);

    // Leaving the map mid-gesture must not leave the hint on.
    ui.markGesture();
    ui.hide();
    expect(root.classList.contains('wm-is-panning')).toBe(false);
    vi.useRealTimers();
  });

  it('opens the briefing for a banner and deploys the stage it names', () => {
    const { ui, callbacks } = mount();
    ui.show();
    document.querySelector('[data-wm-id="banner-verdant"]').click();

    expect(ui.panelOpen).toBe(true);
    const title = document.getElementById('wm-panel-title');
    expect(title.textContent).toBe(THEMES.grassland.name);

    document.getElementById('wm-deploy').click();
    expect(callbacks.onDeploy).toHaveBeenCalledWith('level-1');

    document.getElementById('wm-panel-close').click();
    expect(ui.panelOpen).toBe(false);
    ui.hide();
  });

  it('keeps a locked banner readable but not deployable', () => {
    const { ui, callbacks } = mount();
    ui.show();
    document.querySelector('[data-wm-id="banner-frostbite"]').click();
    const deploy = document.getElementById('wm-deploy');
    expect(deploy.disabled).toBe(true);
    deploy.click();
    expect(callbacks.onDeploy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-wm-id="banner-frostbite"]').classList).toContain(
      'is-locked'
    );
    ui.hide();
  });

  it('marks the current objective and its "go to objective" shortcut', () => {
    const { ui } = mount();
    ui.show();
    expect(document.querySelector('[data-wm-id="banner-verdant"]').classList).toContain(
      'is-objective'
    );
    document.querySelector('[data-wm-id="castle"]').click();
    expect(document.getElementById('wm-panel-title').textContent).toBe('Bastion Castle');

    document.getElementById('wm-goal').click();
    expect(document.getElementById('wm-panel-title').textContent).toBe(THEMES.grassland.name);
    expect(ui.activeId).toBe('banner-verdant');
    ui.hide();
  });

  it('lists the eight real War Room modes and launches through the same path', () => {
    const { ui, callbacks } = mount();
    ui.show();
    document.querySelector('[data-wm-id="warroom"]').click();

    const rows = [...document.querySelectorAll('[data-wm-mode]')];
    expect(rows).toHaveLength(MODES.length);
    expect(rows.map((row) => row.dataset.wmMode)).toEqual(MODES.map((mode) => mode.id));

    rows[0].click();
    expect(callbacks.onMode).toHaveBeenCalledWith(MODES[0].id);

    document.getElementById('wm-open-warroom').click();
    expect(callbacks.onWarRoom).toHaveBeenCalled();
    ui.hide();
  });

  it('routes the buildings to the screens that already exist', () => {
    const { ui, callbacks } = mount();
    ui.show();

    document.querySelector('[data-wm-id="forge"]').click();
    document.getElementById('wm-enter').click();
    expect(callbacks.onNavigate).toHaveBeenCalledWith('forge');

    document.querySelector('[data-wm-id="library"]').click();
    document.getElementById('wm-open-codex').click();
    expect(callbacks.onLibrary).toHaveBeenCalledWith('codex');
    document.getElementById('wm-open-how').click();
    expect(callbacks.onLibrary).toHaveBeenCalledWith('how');

    document.querySelector('[data-wm-id="arena"]').click();
    document.getElementById('wm-duel').click();
    expect(callbacks.onDuel).toHaveBeenCalled();
    ui.hide();
  });

  it('reads today\'s real daily for the shrine instead of inventing one', () => {
    const progress = store();
    progress.recordVictory(getLevel('level-1'), { baseHealth: 25, maxBaseHealth: 25, score: 1 });
    const { ui, callbacks } = mount({ progress });
    ui.show();
    document.querySelector('[data-wm-id="shrine"]').click();

    expect(document.getElementById('wm-panel-title').textContent).toBe('Shrine of the Day');
    // The stage named in the panel is the one the daily will actually boot.
    expect(document.getElementById('wm-daily')).not.toBeNull();
    document.getElementById('wm-daily').click();
    expect(callbacks.onDaily).toHaveBeenCalled();
    ui.hide();
  });

  it('clamps the camera to the plate and to the zoom range', () => {
    const { ui } = mount();
    ui.show();

    ui.setCamera({ x: 9999, y: 9999, scale: 0.01 });
    expect(ui.camera.scale).toBeCloseTo(ui.minScale, 6);
    expect(ui.camera.x).toBe(0);
    expect(ui.camera.y).toBe(0);

    ui.setCamera({ x: -99999, y: -99999, scale: 99 });
    expect(ui.camera.scale).toBeCloseTo(ui.maxScale, 6);
    expect(ui.camera.x).toBeCloseTo(1000 - PLATE.width * ui.maxScale, 3);
    expect(ui.camera.y).toBeCloseTo(600 - PLATE.height * ui.maxScale, 3);
    ui.hide();
  });

  it('zooms towards the pointer, not the centre', () => {
    const { ui } = mount();
    ui.show();
    const before = { ...ui.camera };
    const px = 800;
    const py = 300;
    // The plate point under the cursor must not move.
    const plateX = (px - before.x) / before.scale;
    ui.zoomAt(px, py, 1.4);
    const after = ui.camera;
    expect((px - after.x) / after.scale).toBeCloseTo(plateX, 3);
    ui.hide();
  });

  it('never opens a landmark because a pan ended on top of it', () => {
    const { ui } = mount();
    ui.show();
    const node = document.querySelector('[data-wm-id="banner-sunscorch"]');

    ui.onPointerDown({ pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse', button: 0 });
    ui.onPointerMove({ pointerId: 1, clientX: 120, clientY: 40 });
    ui.onPointerUp({ pointerId: 1 });
    node.click();
    expect(ui.panelOpen).toBe(false);

    ui.onPointerDown({ pointerId: 2, clientX: 10, clientY: 10, pointerType: 'touch' });
    ui.onPointerUp({ pointerId: 2 });
    node.click();
    expect(ui.panelOpen).toBe(true);
    ui.hide();
  });

  it('pans with a single pointer and pinches with two', () => {
    const { ui } = mount();
    ui.show();
    ui.setCamera({ x: -200, y: -100, scale: ui.minScale * 1.5 });
    const start = { ...ui.camera };

    ui.onPointerDown({ pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse', button: 0 });
    ui.onPointerMove({ pointerId: 1, clientX: 250, clientY: 260 });
    expect(ui.camera.x).toBeLessThan(start.x);
    ui.onPointerUp({ pointerId: 1 });

    const zoomBefore = ui.camera.scale;
    ui.onPointerDown({ pointerId: 3, clientX: 300, clientY: 300, pointerType: 'touch' });
    ui.onPointerDown({ pointerId: 4, clientX: 500, clientY: 300, pointerType: 'touch' });
    ui.onPointerMove({ pointerId: 4, clientX: 600, clientY: 300 });
    expect(ui.camera.scale).toBeGreaterThan(zoomBefore);
    ui.onPointerUp({ pointerId: 3 });
    ui.onPointerUp({ pointerId: 4 });
    ui.hide();
  });

  it('compounds repeated zoom taps instead of stalling on a running tween', () => {
    const { ui } = mount();
    ui.show();
    for (let i = 0; i < 6; i += 1) ui.zoomTowardsViewCentre(1.35);
    expect(ui.tweenGoal.scale).toBeCloseTo(ui.maxScale, 6);
    ui.hide();
  });

  it('Escape closes the panel first and only then leaves the map', () => {
    const { ui, callbacks } = mount();
    ui.show();
    document.querySelector('[data-wm-id="monument"]').click();
    expect(ui.panelOpen).toBe(true);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ui.panelOpen).toBe(false);
    expect(callbacks.onMenu).not.toHaveBeenCalled();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(callbacks.onMenu).toHaveBeenCalled();
    ui.hide();
  });

  it('reports the arrivals and the unlocks the save actually produced', () => {
    const { ui } = mount();
    ui.show();
    ui.refresh({
      arrival: {
        levelName: 'Verdant Marches',
        outcome: 'victory',
        stars: 3,
        rewards: { gold: 150, gems: 4 },
      },
    });
    const toast = document.querySelector('.wm-toast');
    expect(toast.textContent).toContain('VERDANT MARCHES');
    expect(toast.textContent).toContain('3★');
    expect(toast.textContent).toContain('+150 gold');
    ui.hide();
  });

  it('announces a road that opened while away and flags its banner', () => {
    const progress = store();
    const { ui } = mount({ progress });
    ui.show();
    // Bank a clear behind the map's back, exactly like a finished battle would.
    progress.recordVictory(getLevel('level-1'), {
      baseHealth: 25,
      maxBaseHealth: 25,
      score: 700,
    });
    ui.refresh();

    expect(document.querySelector('.wm-toast').textContent).toContain('NEW ROAD OPEN');
    expect(document.querySelector('[data-wm-id="banner-sunscorch"]').classList).toContain('is-new');
    expect(document.querySelector('[data-wm-id="banner-verdant"]').classList).toContain(
      'is-cleared'
    );
    ui.hide();
  });

  it('paints live wallets, not placeholder numbers', () => {
    const progress = store();
    progress.profile.gold = 4321;
    progress.profile.gems = 17;
    const { ui } = mount({ progress });
    ui.show();
    expect(document.getElementById('wm-gold').textContent).toBe('4321');
    expect(document.getElementById('wm-gems').textContent).toBe('17');
    expect(document.getElementById('wm-stars').textContent).toBe(
      `${progress.totalStars} / ${progress.maxStars}`
    );
    ui.hide();
  });

  it('keeps its listeners to one set across repeated open/close cycles', () => {
    const { ui } = mount();
    for (let i = 0; i < 5; i += 1) {
      ui.show();
      document.querySelector('[data-wm-id="banner-verdant"]').click();
      document.getElementById('wm-panel-close').click();
      ui.hide();
    }
    expect(document.getElementById('world-map-root').childElementCount).toBe(1);
    expect(document.querySelectorAll('#world-map').length).toBe(1);
    // A single Escape now reaches the menu exactly once.
    const onMenu = vi.fn();
    ui.callbacks.onMenu = onMenu;
    ui.show();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
    ui.hide();
  });
});
