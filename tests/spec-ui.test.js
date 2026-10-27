// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HUD } from '../src/ui/HUD.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ENGINEER_LINES } from '../src/data/engineerDefenses.js';
import { dps } from '../src/data/towerAscension.js';

/**
 * The specialisation chooser had to become worth looking at.
 *
 * The user's note: "sa upgrade sa specialisation natin mas gandahan mo yung
 * hitsura para ganahan mag laro". The old panel was two stacked buttons — a
 * name, a price and a paragraph. Nothing on it showed the tower the player was
 * buying, the role it plays, or what the numbers would actually do, so the two
 * branches of a line read as interchangeable.
 *
 * These tests pin the parts of that redesign that can regress silently:
 *
 *   • every card shows the *art of the branch*, and that file exists;
 *   • every card states the role its stats really give it (so a "CONTROL"
 *     badge cannot survive a patch that removes the slow);
 *   • every card previews the change with the same `dps()` the balance suite
 *     uses, so the promise and the tower cannot drift apart;
 *   • the lane colours are on separate classes, and the markup still exposes
 *     `.btn-upgrade-choice` so affordability and clicks keep working.
 */

const TOWERS = path.resolve(process.cwd(), 'public/assets/towers');

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  return new HUD(document.getElementById('hud-container'), callbacks);
}

function specTower(typeKey = 'archer', overrides = {}) {
  const def = TOWER_TYPES[typeKey];
  return {
    typeKey,
    level: 2,
    specialization: null,
    isBarricade: false,
    targetingMode: 'first',
    def,
    stats: def.levels[1],
    nextUpgrades: Object.values(def.specializations).map((s) => ({ key: s.specKey, ...s })),
    sellRefund: 50,
    setTargetingMode: vi.fn(),
    canUpgrade: () => true,
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('specialisation cards', () => {
  it('shows each branch as its own building, with real art', () => {
    const hud = mountHud();
    hud.inspectTower(specTower('archer'));
    const cards = [...document.querySelectorAll('.spec-card.btn-upgrade-choice')];
    expect(cards).toHaveLength(2);

    for (const card of cards) {
      const img = card.querySelector('img.spec-card-art');
      expect(img, 'card has no art').toBeTruthy();
      const file = path.join(process.cwd(), 'public', img.getAttribute('src'));
      expect(existsSync(file), `${img.getAttribute('src')} is missing`).toBe(true);
    }
    // The two branches must not show the same building.
    const [a, b] = cards.map((card) => card.querySelector('img').getAttribute('src'));
    expect(a).not.toBe(b);
  });

  it('gives every engineer line a card for each branch', () => {
    const hud = mountHud();
    for (const line of ENGINEER_LINES) {
      hud.inspectTower(specTower(line));
      const srcs = [...document.querySelectorAll('.spec-card img.spec-card-art')].map((img) =>
        img.getAttribute('src')
      );
      expect(srcs, line).toHaveLength(2);
      for (const src of srcs) {
        expect(existsSync(path.join(process.cwd(), 'public', src)), `${line}: ${src}`).toBe(true);
      }
    }
  });

  it('labels each branch with its path and the role its stats give it', () => {
    const hud = mountHud();
    hud.inspectTower(specTower('archer'));
    const laneA = document.querySelector('.spec-lane-a');
    const laneB = document.querySelector('.spec-lane-b');
    expect(laneA).toBeTruthy();
    expect(laneB).toBeTruthy();
    expect(laneA.textContent).toContain('PATH I');
    expect(laneB.textContent).toContain('PATH II');
    // Archer: rapid is the fast shooter, sniper carries armour penetration.
    expect(laneA.querySelector('.spec-card-role').textContent).toBe('RAPID FIRE');
    expect(laneB.querySelector('.spec-card-role').textContent).toBe('PIERCE');
  });

  it('keeps the role label honest about control and support branches', () => {
    const hud = mountHud();
    const cases = [
      ['frost', 'CONTROL'],
      ['banner', 'SUPPORT'],
      ['flamer', 'BURN'],
      ['venom', 'VENOM'],
    ];
    for (const [line, role] of cases) {
      hud.inspectTower(specTower(line));
      const roles = [...document.querySelectorAll('.spec-card-role')].map((el) => el.textContent);
      expect(roles, line).toContain(role);
    }
  });

  it('previews the DPS change with the same formula the balance suite uses', () => {
    const hud = mountHud();
    const tower = specTower('archer');
    hud.inspectTower(tower);
    const now = Math.round(dps(tower.stats));
    const next = Math.round(dps(tower.def.specializations.rapid));
    const chip = document.querySelector('.spec-lane-a .spec-chip');
    expect(chip.textContent).toContain('DPS');
    expect(chip.textContent).toContain(String(now));
    expect(chip.textContent).toContain(String(next));
    expect(chip.className).toContain(next >= now ? 'spec-chip-up' : 'spec-chip-down');
  });

  it('still fires the upgrade callback and obeys affordability', () => {
    const onUpgradeTower = vi.fn();
    const hud = mountHud({ onUpgradeTower });
    const tower = specTower('archer');
    hud.inspectTower(tower);

    document.querySelector('.spec-lane-b').click();
    expect(onUpgradeTower).toHaveBeenCalledWith(tower, 'sniper');

    hud.inspectTower(specTower('archer', { canUpgrade: () => false }));
    for (const card of document.querySelectorAll('.btn-upgrade-choice')) {
      expect(card.disabled).toBe(true);
    }
  });

  it('shows the next tier as a tower, not just a price', () => {
    const def = TOWER_TYPES.archer;
    const hud = mountHud();
    hud.inspectTower({
      typeKey: 'archer',
      level: 1,
      specialization: null,
      isBarricade: false,
      targetingMode: 'first',
      def,
      stats: def.levels[0],
      nextUpgrades: [{ key: 'lvl2', ...def.levels[1] }],
      sellRefund: 30,
      setTargetingMode: vi.fn(),
      canUpgrade: () => true,
    });
    const button = document.getElementById('btn-upgrade-tower');
    expect(button).toBeTruthy();
    expect(button.querySelector('img.spec-card-art')).toBeTruthy();
    expect(document.getElementById('inspect-upgrade-cost').textContent).toBe(
      String(def.levels[1].upgradeCost)
    );
  });

  it('celebrates a maxed tower instead of showing an empty list', () => {
    const hud = mountHud();
    hud.inspectTower(specTower('archer', { level: 5, nextUpgrades: [] }));
    const badge = document.querySelector('.max-spec-badge');
    expect(badge.textContent).toContain('FULLY UPGRADED');
    expect(document.querySelectorAll('.spec-card')).toHaveLength(0);
  });
});
