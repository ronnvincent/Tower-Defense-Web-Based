// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HUD } from '../src/ui/HUD.js';

/**
 * The phone upgrade sheet.
 *
 * What this file protects is the fix, not the marking-up: the upgrade (or the
 * path choice) has to be the first thing in the sheet's body, because measured
 * at 844×390 the old order put it at y=409 on a 390 px screen — 224 px of
 * scrolling below a panel whose whole reason for existing is that button.
 *
 * The ordering itself lives in the stylesheet (`display: contents` lets the two
 * action children join the body's flow), so the contract that matters here is
 * the CSS: the selectors and the `order` numbers. The DOM half of the file
 * covers what JS owns — the scroll affordance and the numbers printed on the
 * button.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** Body of the first rule whose selector is exactly `selector`. */
function ruleBody(selector, source = CSS) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

/** The whole block that starts with a selector-group line (ends at its `}`). */
function blockAt(needle, source = CSS) {
  const start = source.indexOf(needle);
  if (start === -1) return '';
  return source.slice(start, source.indexOf('}', start));
}

/** A tower fixture, shaped like the real `Tower` where the inspector reads it. */
function makeTower(overrides = {}) {
  return {
    level: 1,
    specialization: null,
    isBarricade: false,
    targetingMode: 'first',
    def: { name: 'Ballista Tower' },
    stats: { title: 'Scout Ballista', damage: 15, range: 150, cooldown: 650, damageType: 'physical' },
    nextUpgrades: [
      {
        key: 'lvl2',
        upgradeCost: 50,
        title: 'Twin Ballista',
        description: 'Two bolts',
        damage: 26,
        range: 155,
        cooldown: 650,
      },
    ],
    sellRefund: 30,
    setTargetingMode: vi.fn(),
    canUpgrade: () => true,
    ...overrides,
  };
}

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  const hud = new HUD(document.getElementById('hud-container'), callbacks);
  return hud;
}

/* ======================================================= ORDER ON THE PHONE */

describe('phone sheet puts the action first', () => {
  it('dissolves the action wrapper so its children join the body flow', () => {
    expect(ruleBody('[data-shell="mobile"] .inspector-actions')).toContain('display: contents');
  });

  it('makes the body a column, so `order` has something to order', () => {
    const body = ruleBody('[data-shell="mobile"] .inspector-body');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
  });

  it('puts the upgrade, the path choice and the maxed badge at the top', () => {
    const group = blockAt('[data-shell="mobile"] #btn-upgrade-tower,');
    expect(group).toContain('order: -1');
    // The same block carries all three selectors of the group.
    expect(group).toContain('.spec-selection-block');
    expect(group).toContain('.max-spec-badge');
  });

  it('sends SELL to the end of the sheet', () => {
    const sell = ruleBody('[data-shell="mobile"] #btn-sell-tower');
    expect(sell).toContain('order: 10');
  });

  it('shows both paths side by side instead of a hidden horizontal scroller', () => {
    const row = ruleBody('[data-shell="mobile"] .spec-cards-row');
    expect(row).toContain('grid');
    expect(row).toContain('repeat(2, minmax(0, 1fr))');
    expect(row).not.toContain('overflow-x: auto');
    expect(ruleBody('[data-shell="mobile"] .spec-card')).toContain('min-width: 0');
  });

  it('turns the single upgrade into a one-line bar', () => {
    const card = ruleBody('[data-shell="mobile"] #btn-upgrade-tower');
    expect(card).toContain('flex-direction: row');
    expect(card).toContain('min-height: 44px'); // a real tap target
  });
});

/* ======================================================== SCROLL AFFORDANCE */

describe('scroll affordance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fades the frame edge only while the body overflows', () => {
    const hud = mountHud();
    hud.inspectTower(makeTower());
    const panel = document.getElementById('tower-inspector');
    const body = document.getElementById('inspector-body');

    // jsdom has no layout: hand the panel the numbers a phone would report.
    Object.defineProperty(body, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 150, configurable: true });
    let scrollTop = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => {
        scrollTop = v;
      },
    });

    hud.syncInspectorScroll();
    expect(panel.classList.contains('is-scrollable')).toBe(true);
    expect(panel.classList.contains('is-scroll-end')).toBe(false);

    body.scrollTop = 350;
    hud.syncInspectorScroll();
    expect(panel.classList.contains('is-scroll-end')).toBe(true);

    // A panel that fits never claims there is more.
    Object.defineProperty(body, 'scrollHeight', { value: 140, configurable: true });
    hud.syncInspectorScroll();
    expect(panel.classList.contains('is-scrollable')).toBe(false);
  });

  it('is driven by the body scroll and by a resize', () => {
    const hud = mountHud();
    const body = document.getElementById('inspector-body');
    Object.defineProperty(body, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(body, 'scrollTop', { value: 300, writable: true, configurable: true });
    body.dispatchEvent(new window.Event('scroll'));
    expect(document.getElementById('tower-inspector').classList.contains('is-scroll-end')).toBe(true);
    window.dispatchEvent(new window.Event('resize'));
    expect(document.getElementById('tower-inspector').classList.contains('is-scrollable')).toBe(true);
    hud.closeInspector();
  });

  it('starts a freshly inspected tower at the top of the sheet', () => {
    const hud = mountHud();
    const body = document.getElementById('inspector-body');
    Object.defineProperty(body, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 100, configurable: true });
    let scrollTop = 260;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => {
        scrollTop = v;
      },
    });
    hud.inspectTower(makeTower());
    expect(body.scrollTop).toBe(0);
  });
});

/* ================================================================ NUMBERS */

describe('what the upgrade bar promises', () => {
  it('prints the before → after a shooter really gets', () => {
    mountHud().inspectTower(makeTower());
    const chips = (document.querySelector('.spec-card-chips')?.textContent || '').replace(/\s+/g, '');
    expect(chips).toContain('DPS');
    expect(chips).toContain('RANGE150→155');
    expect(chips).not.toContain('NaN');
  });

  it('gives a wall the two numbers it has instead of a NaN attack rate', () => {
    mountHud().inspectTower(
      makeTower({
        isBarricade: true,
        stats: { title: 'Wooden Palisade', health: 420, thornsDamage: 0 },
        nextUpgrades: [
          { key: 'lvl2', upgradeCost: 35, title: 'Reinforced Palisade', health: 900, thornsDamage: 20 },
        ],
      })
    );
    const chips = (document.querySelector('.spec-card-chips')?.textContent || '').replace(/\s+/g, '');
    expect(chips).toContain('HP420→900');
    expect(chips).toContain('THORNS0→20');
    expect(chips).not.toContain('NaN');
    expect(chips).not.toContain('RATE');
  });

  it('prints no NaN anywhere in a wall\'s panel', () => {
    mountHud().inspectTower(
      makeTower({
        isBarricade: true,
        stats: { title: 'Wooden Palisade', health: 420, thornsDamage: 0 },
        nextUpgrades: [
          { key: 'lvl2', upgradeCost: 35, title: 'Reinforced Palisade', health: 900, thornsDamage: 20 },
        ],
      })
    );
    expect(document.getElementById('inspect-stats').textContent).not.toContain('NaN');
    expect(document.getElementById('inspector-actions-container').textContent).not.toContain('NaN');
  });

  it('says the level once, not the tower name twice', () => {
    const hud = mountHud();
    hud.inspectTower(makeTower({ specialization: 'sniper', level: 3, stats: { title: 'Sniper Tower', cooldown: 900, range: 260, damage: 48 } }));
    expect(document.getElementById('inspect-level').textContent).toBe('★3');

    hud.inspectTower(makeTower({ specialization: 'sniper', level: 5, stats: { title: 'Siege Ballista', cooldown: 900, range: 280, damage: 190 } }));
    expect(document.getElementById('inspect-level').textContent).toBe('★5 · MAX');
    expect(document.getElementById('inspect-level').textContent).not.toContain('Siege Ballista');

    hud.inspectTower(
      makeTower({
        isBarricade: true,
        level: 2,
        stats: { title: 'Reinforced Palisade', health: 900, thornsDamage: 20 },
        nextUpgrades: [],
      })
    );
    expect(document.getElementById('inspect-level').textContent).toBe('★2 · REINFORCED');
    expect(document.getElementById('inspect-name').textContent).toBe('Reinforced Palisade');
  });
});
