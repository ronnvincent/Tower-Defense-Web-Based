// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HUD } from '../src/ui/HUD.js';
import {
  MOBILE_SHELL_MAX_WIDTH,
  SHELL_ATTR,
  applyShell,
  readShellOverride,
  readShellPref,
  resolveShell,
  writeShellPref,
} from '../src/ui/shellMode.js';

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/* ============================================================ CSS HELPERS */

/** Body of the first `selector {` rule in the stylesheet. */
function ruleBody(selector, source = CSS) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

/* ================================================================ SHELL */

describe('shell detection', () => {
  it('gives a coarse landscape screen the corner layout', () => {
    expect(resolveShell({ coarse: true, width: 844, height: 390 })).toBe('mobile');
    expect(resolveShell({ coarse: true, width: 667, height: 375 })).toBe('mobile');
  });

  it('keeps the desktop bands for a mouse, a portrait phone and a big touch screen', () => {
    // A narrow browser window is still a pointer, not a thumb.
    expect(resolveShell({ coarse: false, width: 900, height: 500 })).toBe('desktop');
    // Portrait belongs to the rotate gate on both shells.
    expect(resolveShell({ coarse: true, width: 390, height: 844 })).toBe('desktop');
    // A touchscreen laptop or a wall-mounted display has room for the bands.
    expect(resolveShell({ coarse: true, width: MOBILE_SHELL_MAX_WIDTH + 1, height: 800 })).toBe('desktop');
  });

  it('lets the URL override the guess', () => {
    expect(readShellOverride('?hud=mobile')).toBe('mobile');
    expect(readShellOverride('?level=3&hud=desktop')).toBe('desktop');
    expect(readShellOverride('?hud=potato')).toBeNull();
    expect(readShellOverride('')).toBeNull();
    expect(resolveShell({ coarse: false, width: 1600, height: 900, override: 'mobile' })).toBe('mobile');
    expect(resolveShell({ coarse: true, width: 844, height: 390, override: 'desktop' })).toBe('desktop');
  });

  it('publishes the shell on the document root and stores a manual choice', () => {
    const doc = document.implementation.createHTMLDocument('shell');
    expect(applyShell(doc, 'mobile')).toBe('mobile');
    expect(doc.documentElement.getAttribute(SHELL_ATTR)).toBe('mobile');

    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(readShellPref(storage)).toBe('auto');
    expect(writeShellPref('mobile', storage)).toBe('mobile');
    expect(readShellPref(storage)).toBe('mobile');
    // Garbage falls back to auto rather than pinning the wrong layout.
    store.set('td-dsalgo:shell:v1', 'potato');
    expect(readShellPref(storage)).toBe('auto');
  });
});

/* ============================================================== HUD DOM */

function stubViewport({ width = 844, height = 390, coarse = true } = {}) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  window.matchMedia = (query) => ({
    matches: coarse && query.includes('coarse'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  const container = document.getElementById('hud-container');
  return { hud: new HUD(container, callbacks), container };
}

const ORIGINAL_W = window.innerWidth;
const ORIGINAL_H = window.innerHeight;
const ORIGINAL_MM = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: ORIGINAL_W, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: ORIGINAL_H, configurable: true });
  if (ORIGINAL_MM) window.matchMedia = ORIGINAL_MM;
  else delete window.matchMedia;
  document.documentElement.removeAttribute(SHELL_ATTR);
  vi.useRealTimers();
});

describe('HUD on the phone shell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubViewport();
  });

  it('starts folded, with the forge out of the way', () => {
    const { hud } = mountHud();
    expect(document.documentElement.getAttribute(SHELL_ATTR)).toBe('mobile');
    expect(hud.isMobileShell).toBe(true);
    expect(document.getElementById('hud-bottom-dock').classList.contains('collapsed')).toBe(true);
    // The scrim only exists while the sheet is open.
    expect(document.getElementById('dock-scrim').classList.contains('hidden')).toBe(true);
    // Nothing may cover the lane on the first frame.
    expect(document.getElementById('tower-inspector').classList.contains('hidden')).toBe(true);
  });

  it('dims the map behind the sheet and dismisses the sheet on a scrim tap', () => {
    const { hud } = mountHud();
    hud.setDockCollapsed(false);
    const scrim = document.getElementById('dock-scrim');
    expect(scrim.classList.contains('hidden')).toBe(false);
    expect(scrim.getAttribute('aria-hidden')).toBe('false');

    scrim.click();
    expect(document.getElementById('hud-bottom-dock').classList.contains('collapsed')).toBe(true);
    expect(scrim.classList.contains('hidden')).toBe(true);
  });

  it('drops the sheet the moment a defence is picked, keeping it armed', () => {
    const picked = [];
    const { hud } = mountHud({ onSelectBuild: (key) => picked.push(key) });
    hud.update({
      baseHealth: 20,
      maxBaseHealth: 20,
      coins: 240,
      score: 0,
      waveNumber: 1,
      totalWaves: 6,
      enemiesRemaining: 10,
      canStartWave: true,
      isSpawning: false,
    });
    hud.setDockCollapsed(false);
    const storedBefore = localStorage.getItem('td-dsalgo:dock-collapsed:v1');
    hud.toggleBuildSelection('archer');

    // Armed, but the map is visible again: the sheet did its job.
    expect(hud.selectedBuildKey).toBe('archer');
    expect(document.getElementById('hud-bottom-dock').classList.contains('collapsed')).toBe(true);
    expect(document.getElementById('placement-hint').classList.contains('hidden')).toBe(false);
    expect(picked).toEqual(['archer']);
    // Arming is an interaction, not a layout preference: the stored fold state
    // must not flip every time a phone player picks a tower.
    expect(localStorage.getItem('td-dsalgo:dock-collapsed:v1')).toBe(storedBefore);

    // The pill is now the only thing naming the armed defence, so it speaks
    // phone: tap, and an ✕, not click/Esc.
    const hint = document.getElementById('placement-hint-text').textContent;
    expect(hint).toContain('tap a grass tile');
    expect(hint).toContain('✕ to cancel');
    expect(document.getElementById('btn-cancel-placement').textContent).toBe('✕');
  });

  it('leaves the inspector a CSS-owned sheet instead of a floating panel', () => {
    const { hud } = mountHud();
    const tower = {
      level: 1,
      specialization: null,
      isBarricade: false,
      targetingMode: 'first',
      def: { name: 'Ballista Tower' },
      stats: { title: 'Scout Ballista', damage: 15, range: 150, cooldown: 650, damageType: 'physical' },
      nextUpgrades: [],
      sellRefund: 0,
      setTargetingMode: vi.fn(),
      canUpgrade: () => false,
    };
    hud.inspectTower(tower, { x: 0.7, y: 0.4 });

    const panel = document.getElementById('tower-inspector');
    expect(panel.classList.contains('hidden')).toBe(false);
    // No inline geometry: the sheet's box is the stylesheet's business.
    expect(panel.style.left).toBe('');
    expect(panel.style.top).toBe('');
  });

  it('keeps the wave composition on the button and the score in the pause card', () => {
    const { hud } = mountHud();
    hud.update({
      levelName: 'Ember Reach',
      baseHealth: 20,
      maxBaseHealth: 20,
      coins: 240,
      score: 1240,
      waveNumber: 3,
      totalWaves: 6,
      enemiesRemaining: 12,
      canStartWave: true,
      isSpawning: false,
      nextWave: { number: 4, total: 12, boss: true, groups: [] },
    });
    expect(document.getElementById('start-wave-sub').textContent).toBe('12 CREEPS · BOSS');

    hud.setPausedUI(true);
    expect(document.getElementById('pause-status').textContent).toContain('WAVE 3 / 6');
    expect(document.getElementById('pause-status').textContent).toContain('SCORE 1240');
  });
});

describe('HUD on the desktop shell', () => {
  it('keeps the bands, the un-scrimmed dock and the dock preference', () => {
    stubViewport({ width: 1440, height: 900, coarse: false });
    const { hud } = mountHud();
    expect(document.documentElement.getAttribute(SHELL_ATTR)).toBe('desktop');
    expect(hud.isMobileShell).toBe(false);

    hud.setDockCollapsed(false);
    // No scrim on a mouse: there is no thumb covering the map.
    expect(document.getElementById('dock-scrim').classList.contains('hidden')).toBe(true);
    expect(localStorage.getItem('td-dsalgo:dock-collapsed:v1')).toBe('0');
  });
});

/* ================================================================== CSS */

describe('the phone layout is a different layout, not a smaller one', () => {
  it('collapses the top bar into a 44 px rail', () => {
    expect(ruleBody('[data-shell="mobile"] .hud-topbar')).toMatch(/height:\s*var\(--hud-rail-h\)/);
    expect(ruleBody('[data-shell="mobile"] .hud-topbar')).toMatch(/min-height:\s*0/);
    expect(CSS).toMatch(/--hud-rail-h:\s*44px/);
    // The three labels and the two capsules that moved into the pause card.
    expect(ruleBody('[data-shell="mobile"] .hud-label')).toMatch(/display:\s*none/);
    expect(CSS).toMatch(/\[data-shell="mobile"\] #stat-score,\s*\n\[data-shell="mobile"\] \.hud-level-chip\s*\{\s*display:\s*none/);
  });

  it('keeps the lane empty: no camera pill, no preview popover, no combo chip', () => {
    expect(ruleBody('[data-shell="mobile"] .camera-cluster')).toMatch(/display:\s*none/);
    expect(ruleBody('[data-shell="mobile"] #wave-preview')).toMatch(/display:\s*none\s*!important/);
    expect(ruleBody('[data-shell="mobile"] .hud-combo')).toMatch(/display:\s*none/);
  });

  it('turns the forge into a corner button and a full-width sheet', () => {
    const folded = ruleBody('[data-shell="mobile"] .hud-dock');
    expect(folded).toMatch(/left:\s*calc\(8px \+ var\(--safe-left\)\)/);
    expect(folded).toMatch(/right:\s*auto/);
    expect(folded).toMatch(/bottom:\s*var\(--hud-corner\)/);
    expect(ruleBody('[data-shell="mobile"] .hud-dock:not(.collapsed)')).toMatch(/right:\s*calc\(6px \+ var\(--safe-right\)\)/);
    expect(ruleBody('.dock-title-short')).toMatch(/display:\s*none/);
    expect(ruleBody('[data-shell="mobile"] .dock-title-short')).toMatch(/display:\s*inline/);
  });

  it('gives the sheet a real dismissal target', () => {
    const scrim = ruleBody('.dock-scrim');
    expect(scrim).toMatch(/position:\s*absolute/);
    expect(scrim).toMatch(/inset:\s*0/);
    expect(scrim).toMatch(/pointer-events:\s*auto/);
    // Below the dock, above the canvas.
    expect(scrim).toMatch(/z-index:\s*98/);
  });

  it('anchors the inspector to the bottom as a sheet', () => {
    const sheet = ruleBody('[data-shell="mobile"] .hud-inspector');
    expect(sheet).toMatch(/position:\s*fixed/);
    expect(sheet).toMatch(/top:\s*auto/);
    expect(sheet).toMatch(/left:\s*calc\(6px \+ var\(--safe-left\)\)/);
    // 70vh: the sheet is the only thing on screen while it is open (the dock is
    // folded to a pill), and 58 % of a 390 px phone cut the last stat row in
    // half. Measured at 844x390 the body went 174 -> 221 px, which fits the
    // upgrade row, the targeting row and both lines of numbers above the fold.
    expect(sheet).toMatch(/max-height:\s*min\(70vh,\s*280px\)/);
    // The panel body scrolls instead of growing over the lane.
    expect(ruleBody('[data-shell="mobile"] .inspector-body')).toMatch(/overflow-y:\s*auto/);
    // And the drag grip is gone: a CSS-placed sheet cannot be dragged.
    expect(ruleBody('[data-shell="mobile"] .inspector-grip')).toMatch(/display:\s*none/);
  });

  it('pins every transient message to a single line under the rail', () => {
    const toast = ruleBody('[data-shell="mobile"] .toast-banner');
    expect(toast).toMatch(/white-space:\s*nowrap/);
    expect(toast).toMatch(/text-overflow:\s*ellipsis/);
    expect(toast).toMatch(/top:\s*calc\(var\(--topbar-clearance\) \+ 2px\)/);
    expect(toast).toMatch(/left:\s*calc\(8px \+ var\(--safe-left\)\)/);
    expect(toast).toMatch(/transparent|rgba\(9, 14, 18/);
    // Boss and rival share the right shoulder, so they can never stack.
    expect(ruleBody('[data-shell="mobile"] #boss-banner')).toMatch(/right:\s*calc\(8px \+ var\(--safe-right\)\)/);
    expect(ruleBody('[data-shell="mobile"] .hud-rival')).toMatch(/right:\s*calc\(8px \+ var\(--safe-right\)\)/);
  });

  it('keeps the placement pill alive while the sheet is folded', () => {
    // Folding is what happens immediately after a card is picked; the base
    // `.collapsed #placement-hint { display: none }` would hide the only label
    // that still says which defence is in hand.
    expect(ruleBody('[data-shell="mobile"] .hud-dock.collapsed #placement-hint')).toMatch(/display:\s*flex/);
    // And a scrollable panel has to hand its axis back to the browser, because
    // #hud-container is `touch-action: none`.
    expect(ruleBody('[data-shell="mobile"] .hud-dock:not(.collapsed) .dock-cards')).toMatch(/touch-action:\s*pan-x/);
    expect(ruleBody('[data-shell="mobile"] .inspector-body')).toMatch(/touch-action:\s*pan-y/);
  });

  it('moves the powers and the placement pill into the thumb zone', () => {
    // The rail clears whichever is taller: the BUILD button or the open sheet
    // (whose height HudLayout publishes as --dock-clearance). A fixed offset
    // put the three sigils right on the sheet's shoulder.
    const rail = ruleBody('[data-shell="mobile"] .powerup-rail');
    expect(rail).toMatch(/bottom:\s*max\(/);
    expect(rail).toMatch(/var\(--dock-clearance\)/);
    const hint = ruleBody('[data-shell="mobile"] #placement-hint');
    expect(hint).toMatch(/position:\s*fixed/);
    expect(hint).toMatch(/translateX\(-50%\)/);
  });

  it('takes the powerups off the screen while the forge sheet is open', () => {
    const hidden = ruleBody('#hud-container.dock-open .powerup-rail');
    expect(hidden).toMatch(/opacity:\s*0/);
    expect(hidden).toMatch(/pointer-events:\s*none/);
  });

  it('draws the powerups as kit plates with pixel sigils, not emoji', () => {
    const plate = ruleBody('.powerup-plate');
    expect(plate).toMatch(/border-image-source:\s*url\(\/assets\/ui-kit\/btn_square\.png\)/);
    expect(ruleBody('.powerup-icon')).toMatch(/image-rendering:\s*pixelated/);
    // The old circular button and its font glyph are gone for good.
    expect(CSS).not.toMatch(/\.powerup-glyph\s*\{/);
    expect(CSS).not.toMatch(/\.powerup-sweep\s*\{/);
    // Ready is a hairline rim; the charge is a well that fills.
    expect(ruleBody('.powerup-btn.ready .powerup-plate')).toMatch(/box-shadow:/);
    expect(ruleBody('.powerup-well')).toMatch(/height:\s*calc\(var\(--charge\) \* 100%\)/);
  });

  it('replaces the camera pill with a RESET VIEW action in the pause card', () => {
    // Hidden until the shell is known, then shown only on the phone.
    const base = CSS.slice(CSS.indexOf('#btn-reset-view {'));
    expect(base.slice(0, base.indexOf('}'))).toMatch(/display:\s*none/);
    expect(ruleBody('[data-shell="mobile"] #btn-reset-view')).toMatch(/display:\s*inline-flex/);
    expect(CSS).toMatch(/\[data-shell="mobile"\] \.pause-actions\s*\{/);
  });
});
