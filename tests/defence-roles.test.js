// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFENCE_ROLE,
  ROLE_STYLE,
  defenceRole,
  roleClass,
  roleLabel,
  roleMap,
  roleStyleFor,
  roleTitle,
} from '../src/data/defenceRoles.js';
import { BUILD_OPTIONS, TOWER_TYPES, BARRICADE } from '../src/data/towerData.js';
import { ROYAL_TOWER_TYPES } from '../src/data/royalDefences.js';
import { ENGINEER_TOWER_TYPES } from '../src/data/engineerDefenses.js';
import { HUD } from '../src/ui/HUD.js';

/**
 * Defence roles — green ground, red air, blue support.
 *
 * The board has twenty-two lines and they all look like stone. The brief asks
 * for a colour marker on every defence that says, at a glance, whether it kills
 * what walks, what flies, or makes the rest of the line stronger. These tests
 * pin the three things that can silently rot:
 *
 *   • the classification (a ground-locked gun must never be filed as air);
 *   • the palette (green / red / blue, and a two-tone mark for "both");
 *   • the three surfaces that show it — the dock strip, the inspector chip and
 *     the gem the tower wears — all reading the same value.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  return new HUD(document.getElementById('hud-container'), callbacks);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('every defence has exactly one role', () => {
  it('files the ground-locked guns as ground, the flak as air, the wards as support', () => {
    expect(defenceRole(TOWER_TYPES.archer)).toBe(DEFENCE_ROLE.BOTH);
    expect(defenceRole(TOWER_TYPES.cannon)).toBe(DEFENCE_ROLE.GROUND);
    expect(defenceRole(TOWER_TYPES.frost)).toBe(DEFENCE_ROLE.BOTH);
    expect(defenceRole(TOWER_TYPES.forge)).toBe(DEFENCE_ROLE.GROUND);
    expect(defenceRole(BARRICADE)).toBe(DEFENCE_ROLE.GROUND);
    expect(defenceRole(TOWER_TYPES.banner)).toBe(DEFENCE_ROLE.SUPPORT);
    expect(defenceRole(ROYAL_TOWER_TYPES.skybreaker)).toBe(DEFENCE_ROLE.AIR);
    expect(defenceRole(ROYAL_TOWER_TYPES.workshop)).toBe(DEFENCE_ROLE.SUPPORT);
    expect(defenceRole(ROYAL_TOWER_TYPES.obelisk)).toBe(DEFENCE_ROLE.SUPPORT);
    expect(defenceRole(ROYAL_TOWER_TYPES.spikeTrap)).toBe(DEFENCE_ROLE.GROUND);
  });

  it('agrees with the targeting flags on every line in the roster', () => {
    const all = { ...TOWER_TYPES, ...ENGINEER_TOWER_TYPES, ...ROYAL_TOWER_TYPES };
    for (const [key, def] of Object.entries(all)) {
      const role = defenceRole(def);
      if (role === DEFENCE_ROLE.SUPPORT) continue;
      // A support line may shoot; a weapon may never be filed as support.
      expect(def.supportOnly, key).not.toBe(true);
      if (role === DEFENCE_ROLE.AIR) expect(def.targetsGround, key).toBe(false);
      if (role === DEFENCE_ROLE.GROUND) expect(def.targetsAir, key).toBe(false);
      if (role === DEFENCE_ROLE.BOTH) {
        expect(def.targetsGround, key).not.toBe(false);
        expect(def.targetsAir, key).not.toBe(false);
      }
    }
  });

  it('never leaves a dock card without a role', () => {
    const roles = roleMap({ ...TOWER_TYPES, ...ENGINEER_TOWER_TYPES, ...ROYAL_TOWER_TYPES });
    for (const key of BUILD_OPTIONS) {
      const role = roles[key] || defenceRole(key === 'barricade' ? BARRICADE : TOWER_TYPES[key]);
      expect(Object.values(DEFENCE_ROLE), key).toContain(role);
    }
  });
});

describe('the palette', () => {
  const channels = (css) => {
    const hex = css.replace('#', '');
    return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  };

  it('is green for ground, red for air and blue for support', () => {
    const [gr, gg, gb] = channels(ROLE_STYLE.ground.css);
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);

    const [ar, ag, ab] = channels(ROLE_STYLE.air.css);
    expect(ar).toBeGreaterThan(ag);
    expect(ar).toBeGreaterThan(ab);

    const [sr, sg, sb] = channels(ROLE_STYLE.support.css);
    expect(sb).toBeGreaterThan(sr);
    expect(sb).toBeGreaterThan(sg);
  });

  it('gives "both" two markers instead of a fourth colour', () => {
    const both = ROLE_STYLE.both.colours;
    expect(both).toHaveLength(2);
    expect(both[0]).toBe(ROLE_STYLE.ground.colours[0]);
    expect(both[1]).toBe(ROLE_STYLE.air.colours[0]);
  });

  it('declares the same hex values in the stylesheet the canvas uses', () => {
    // One palette, two runtimes: if the CSS drifts, the dock strip and the gem
    // start disagreeing about what "air" looks like.
    expect(CSS).toContain(`--role-a: ${ROLE_STYLE.ground.css}`);
    expect(CSS).toContain(`--role-a: ${ROLE_STYLE.air.css}`);
    expect(CSS).toContain(`--role-a: ${ROLE_STYLE.support.css}`);
    // Both: green above, red below.
    expect(CSS).toMatch(/\.role-both\s*\{[^}]*--role-a: #54c95f;[^}]*--role-b: #e8503f;/s);
  });

  it('speaks the role in words as well as in colour', () => {
    expect(roleLabel(TOWER_TYPES.archer)).toBe('GROUND + AIR');
    expect(roleLabel(TOWER_TYPES.cannon)).toBe('GROUND');
    expect(roleLabel(ROYAL_TOWER_TYPES.skybreaker)).toBe('AIR');
    expect(roleLabel(ROYAL_TOWER_TYPES.obelisk)).toBe('SUPPORT');
    expect(roleTitle(ROYAL_TOWER_TYPES.obelisk)).toMatch(/buffs or repairs/i);
  });
});

describe('the surfaces that show it', () => {
  it('marks every dock card with its role strip', () => {
    const hud = mountHud();
    hud.renderDock?.();
    const cards = [...document.querySelectorAll('.build-card')];
    expect(cards.length).toBe(BUILD_OPTIONS.length);
    for (const card of cards) {
      const role = card.dataset.role;
      expect(Object.values(DEFENCE_ROLE), card.dataset.key).toContain(role);
      const strip = card.querySelector('.card-role');
      expect(strip, card.dataset.key).toBeTruthy();
      expect(strip.classList.contains(`role-${role}`), card.dataset.key).toBe(true);
    }
    expect(document.querySelector('#card-archer').dataset.role).toBe('both');
    expect(document.querySelector('#card-cannon').dataset.role).toBe('ground');
    expect(document.querySelector('#card-obelisk').dataset.role).toBe('support');
    expect(document.querySelector('#card-skybreaker').dataset.role).toBe('air');
  });

  it('announces the role instead of claiming a support ward "hits" anything', () => {
    const hud = mountHud();
    const ward = document.querySelector('#card-obelisk');
    expect(ward.getAttribute('aria-label')).not.toMatch(/hits ground/i);
    expect(ward.getAttribute('aria-label')).toMatch(/buffs or repairs/i);
    expect(ward.getAttribute('title')).toMatch(/buffs or repairs/i);
  });

  it('colours the inspector chip with the role, not a fixed gold', () => {
    const hud = mountHud();
    const obelisk = ROYAL_TOWER_TYPES.obelisk;
    hud.inspectTower({
      typeKey: 'obelisk',
      level: 1,
      definition: obelisk,
      def: obelisk,
      stats: obelisk.levels[0],
      nextUpgrades: [],
      sellRefund: 40,
      targetingMode: 'first',
      targetCategory: 'both',
      canUpgrade: () => false,
      setTargetingMode: () => {},
    });
    const chip = document.getElementById('inspect-targets');
    expect(chip.textContent).toBe('SUPPORT');
    expect(chip.className).toContain('role-support');
    expect(chip.className).not.toContain('target-air');
  });

  it('lets the role class decide the chip colour through custom properties', () => {
    expect(CSS).toMatch(/\.inspector-targets\s*\{[^}]*color: var\(--role-ink/s);
    expect(CSS).toMatch(/\.val\.role-ground[\s\S]{0,120}color: var\(--role-ink\)/);
  });

  it('exposes a helper that turns a definition into the class the DOM needs', () => {
    expect(roleClass(TOWER_TYPES.cannon)).toBe('role-ground');
    expect(roleClass(ROYAL_TOWER_TYPES.skybreaker)).toBe('role-air');
    expect(roleStyleFor('support')).toBe(ROLE_STYLE.support);
    expect(roleStyleFor(TOWER_TYPES.cannon).label).toBe('GROUND');
  });
});
