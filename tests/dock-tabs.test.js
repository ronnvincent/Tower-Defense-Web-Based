// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { BUILD_OPTIONS, BUILD_GROUPS, groupForBuild } from '../src/data/towerData.js';

/**
 * The dock is paged into two tabs because twelve cards in one strip shrank to
 * unreadable thumbnails on a phone. These tests pin the contract the layout
 * depends on: exactly one tab's cards are visible, the choice survives a
 * reload, and a hotkey fired from the *other* tab still opens the right page.
 */

const DOCK_GROUP_KEY = 'td-dsalgo:dock-group:v1';

function mountHud() {
  document.body.innerHTML = `
    <div id="app">
      <div id="hud-container"></div>
      <div id="hud-bottom-dock">
        <div id="dock-tabs"></div>
        <div id="dock-cards-container"></div>
      </div>
    </div>`;
  return new HUD(document.getElementById('hud-container'), {});
}

const cards = () => [...document.querySelectorAll('.build-card')];
const tabs = () => [...document.querySelectorAll('.dock-tab')];
const visibleCards = () => cards().filter((card) => !card.classList.contains('tab-hidden'));

describe('dock tabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('draws one card per build option and one tab per group', () => {
    mountHud();
    expect(cards()).toHaveLength(BUILD_OPTIONS.length);
    expect(tabs()).toHaveLength(BUILD_GROUPS.length);
    const tallied = cards().reduce((totals, card) => {
      totals[card.dataset.group] = (totals[card.dataset.group] || 0) + 1;
      return totals;
    }, {});
    for (const group of BUILD_GROUPS) expect(tallied[group.key]).toBe(group.lines.length);
  });

  it('shows only the active tab, and the visible cards cover every option exactly once', () => {
    const hud = mountHud();
    for (const group of BUILD_GROUPS) {
      hud.setDockGroup(group.key);
      const shown = visibleCards();
      expect(shown).toHaveLength(group.lines.length);
      expect(shown.every((card) => card.dataset.group === group.key)).toBe(true);
      // Hidden cards are also hidden from assistive tech, not just from the eye.
      for (const card of cards()) {
        if (card.classList.contains('tab-hidden')) expect(card.getAttribute('aria-hidden')).toBe('true');
        else expect(card.hasAttribute('aria-hidden')).toBe(false);
      }
    }
  });

  it('defaults to the keeps tab on a cold start', () => {
    mountHud();
    expect(visibleCards().every((card) => card.dataset.group === BUILD_GROUPS[0].key)).toBe(true);
    expect(document.getElementById('hud-bottom-dock').dataset.group).toBe(BUILD_GROUPS[0].key);
  });

  it('remembers the tab across a reload', () => {
    const hud = mountHud();
    const engineer = BUILD_GROUPS[1];
    hud.setDockGroup(engineer.key);
    expect(window.localStorage.getItem(DOCK_GROUP_KEY)).toBe(engineer.key);

    // Simulate a reload: a brand-new HUD reading the same storage.
    document.body.innerHTML = '';
    mountHud();
    expect(visibleCards().every((card) => card.dataset.group === engineer.key)).toBe(true);
    expect(tabs().find((tab) => tab.classList.contains('active')).dataset.group).toBe(engineer.key);
  });

  it('ignores a stored tab that no longer exists', () => {
    window.localStorage.setItem(DOCK_GROUP_KEY, 'a-tab-we-deleted');
    mountHud();
    expect(document.getElementById('hud-bottom-dock').dataset.group).toBe(BUILD_GROUPS[0].key);
  });

  it('survives storage being disabled', () => {
    const getItem = window.localStorage.getItem;
    const setItem = window.localStorage.setItem;
    window.localStorage.getItem = () => {
      throw new Error('denied');
    };
    window.localStorage.setItem = () => {
      throw new Error('denied');
    };
    try {
      const hud = mountHud();
      expect(() => hud.setDockGroup(BUILD_GROUPS[1].key)).not.toThrow();
      expect(visibleCards().every((card) => card.dataset.group === BUILD_GROUPS[1].key)).toBe(true);
    } finally {
      window.localStorage.getItem = getItem;
      window.localStorage.setItem = setItem;
    }
  });

  it('clicking a tab flips the page and marks it selected', () => {
    mountHud();
    const engineer = tabs().find((tab) => tab.dataset.group === BUILD_GROUPS[1].key);
    engineer.click();
    expect(visibleCards().every((card) => card.dataset.group === BUILD_GROUPS[1].key)).toBe(true);
    expect(engineer.classList.contains('active')).toBe(true);
    expect(engineer.getAttribute('aria-selected')).toBe('true');
    expect(engineer.tabIndex).toBe(0);
    for (const other of tabs()) {
      if (other === engineer) continue;
      expect(other.getAttribute('aria-selected')).toBe('false');
      expect(other.tabIndex).toBe(-1);
    }
  });

  it('revealBuildKey opens the tab that owns the hotkey', () => {
    const hud = mountHud();
    // Start on the keeps, then aim at each engineer line in turn.
    hud.setDockGroup(BUILD_GROUPS[0].key);
    for (const key of BUILD_GROUPS[1].lines) {
      hud.setDockGroup(BUILD_GROUPS[0].key);
      hud.revealBuildKey(key);
      expect(hud.dockGroup).toBe(groupForBuild(key).key);
      expect(document.getElementById(`card-${key}`).classList.contains('tab-hidden')).toBe(false);
    }
  });

  it('revealBuildKey never flips a tab that already owns the key', () => {
    const hud = mountHud();
    const key = BUILD_GROUPS[0].lines[0];
    let flips = 0;
    const original = hud.setDockGroup.bind(hud);
    hud.setDockGroup = (next, opts) => {
      flips += 1;
      return original(next, opts);
    };
    hud.revealBuildKey(key);
    expect(flips).toBe(0);
  });

  it('setDockGroup rejects an unknown page without disturbing the current one', () => {
    const hud = mountHud();
    const before = hud.dockGroup;
    expect(hud.setDockGroup('nope')).toBe(false);
    expect(hud.dockGroup).toBe(before);
  });

  it('every build option belongs to exactly one group, and no card is orphaned', () => {
    mountHud();
    for (const key of BUILD_OPTIONS) {
      const card = document.getElementById(`card-${key}`);
      expect(card).toBeTruthy();
      const matching = BUILD_GROUPS.filter((group) => group.lines.includes(key));
      expect(matching).toHaveLength(1);
    }
  });
});
