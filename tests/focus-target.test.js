// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { Tower } from '../src/entities/Tower.js';
import { enemyAt, focusReadout, isFocusable, FOCUS_TAP_RADIUS } from '../src/systems/FocusTarget.js';
import { makeCombatScene, makeCombatContext } from './helpers/combat.js';

/**
 * Focus fire: the player's answer to "why is nobody killing the healer?".
 *
 * Every defence has a targeting *mode* (first / last / strongest / nearest), but
 * a mode is a rule set once and then left alone. A summoner, a healer or a boss
 * walking through the pack cannot be singled out with a rule — the player has to
 * be able to point at it.
 *
 * The mark is deliberately not a stat: it changes which enemy takes the damage,
 * never how much. These tests pin exactly that:
 *
 *   • hit-testing picks the creep the player tapped, not the first in the array;
 *   • a marked creep outranks the tower's targeting mode while it is in range;
 *   • out of range, or dead, the tower silently goes back to its own job, so a
 *     stale mark can never switch a defence off;
 *   • the HUD chip reports the mark, follows its health and can be dismissed.
 */

/* ============================================================ FIXTURES */

let nextId = 1;

function creep(overrides = {}) {
  return {
    id: nextId++,
    x: 100,
    y: 100,
    health: 100,
    maxHealth: 100,
    distanceTraveled: 0,
    isDead: false,
    reachedBase: false,
    def: { name: 'Grunt' },
    ...overrides,
  };
}

function towerAt(context, cells = {}) {
  const scene = makeCombatScene();
  const ctx = context || makeCombatContext(scene);
  const tower = new Tower(scene, 'archer', cells.row ?? 3, cells.col ?? 10, ctx);
  tower.cooldownTimer = 0;
  return { tower, scene, context: ctx };
}

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  return new HUD(document.getElementById('hud-container'), callbacks);
}

/* ============================================================ HIT TESTING */

describe('picking the creep the player tapped', () => {
  it('takes the nearest live creep inside the tap radius', () => {
    const near = creep({ x: 30, y: 0 });
    const nearer = creep({ x: 6, y: 0 });
    const far = creep({ x: 200, y: 0 });
    expect(enemyAt([far, near, nearer], 0, 0)).toBe(nearer);
  });

  it('ignores corpses, escapers and enemies outside the radius', () => {
    const dead = creep({ x: 4, y: 0, isDead: true });
    const escaped = creep({ x: 5, y: 0, reachedBase: true });
    const empty = creep({ x: 6, y: 0, health: 0 });
    const outside = creep({ x: FOCUS_TAP_RADIUS + 12, y: 0 });
    expect(enemyAt([dead, escaped, empty, outside], 0, 0)).toBe(null);
  });

  it('survives a missing or empty enemy list', () => {
    expect(enemyAt(undefined, 0, 0)).toBe(null);
    expect(enemyAt([], 0, 0)).toBe(null);
  });

  it('reports a dead mark as un-focusable', () => {
    expect(isFocusable(creep())).toBe(true);
    expect(isFocusable(creep({ isDead: true }))).toBe(false);
    expect(isFocusable(creep({ health: 0 }))).toBe(false);
    expect(isFocusable(null)).toBe(false);
  });

  it('builds the chip readout from the enemy, not from a guess', () => {
    const shaman = creep({ health: 120, maxHealth: 480, def: { name: 'Grave Shaman' }, isBoss: true });
    expect(focusReadout(shaman)).toEqual({
      name: 'GRAVE SHAMAN',
      hp: 120,
      max: 480,
      pct: 25,
      boss: true,
    });
    expect(focusReadout(creep({ isDead: true }))).toBe(null);
  });
});

/* ============================================================ TARGETING */

describe('the mark outranks the targeting mode', () => {
  it('shoots the marked creep even when another is closer to the core', () => {
    const { tower, context } = towerAt();
    const leader = creep({ x: tower.x + 10, y: tower.y, distanceTraveled: 900 });
    const marked = creep({ x: tower.x + 40, y: tower.y, distanceTraveled: 10 });
    context.activeEnemies = [leader, marked];
    context.focusTarget = marked;

    tower.acquireTarget();
    expect(tower.currentTarget).toBe(marked);

    // Without the mark the same tower follows its mode.
    context.focusTarget = null;
    tower.acquireTarget();
    expect(tower.currentTarget).toBe(leader);
  });

  it('falls back to its own mode when the marked creep is out of range', () => {
    const { tower, context } = towerAt();
    const leader = creep({ x: tower.x + 20, y: tower.y, distanceTraveled: 500 });
    const farAway = creep({ x: tower.x + 4000, y: tower.y, distanceTraveled: 1 });
    context.activeEnemies = [leader, farAway];
    context.focusTarget = farAway;

    tower.acquireTarget();
    expect(tower.currentTarget).toBe(leader);
  });

  it('releases the mark when the creep dies instead of going quiet', () => {
    const { tower, context } = towerAt();
    const marked = creep({ x: tower.x + 30, y: tower.y });
    const other = creep({ x: tower.x + 60, y: tower.y, distanceTraveled: 20 });
    context.activeEnemies = [marked, other];

    marked.isDead = true;
    context.focusTarget = marked;
    tower.acquireTarget();
    expect(tower.currentTarget).toBe(other);
  });
});

/* ============================================================ HUD CHIP */

describe('the focus chip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports the name and health of the marked creep', () => {
    const hud = mountHud();
    hud.showFocus(creep({ health: 60, maxHealth: 240, def: { name: 'Bone Archer' } }));

    const chip = document.getElementById('focus-chip');
    expect(chip.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('focus-name').textContent).toBe('BONE ARCHER');
    expect(document.getElementById('focus-hp').textContent).toBe('60 / 240');
    expect(chip.style.getPropertyValue('--focus-hp')).toBe('25%');
  });

  it('marks a boss differently and follows its health down', () => {
    const hud = mountHud();
    const boss = creep({ health: 5000, maxHealth: 5000, def: { name: 'Stone Colossus' }, isBoss: true });
    hud.showFocus(boss);
    const chip = document.getElementById('focus-chip');
    expect(chip.classList.contains('focus-chip-boss')).toBe(true);

    boss.health = 2500;
    hud.updateFocus(boss);
    expect(document.getElementById('focus-hp').textContent).toBe('2500 / 5000');
    expect(chip.style.getPropertyValue('--focus-hp')).toBe('50%');
  });

  it('hides itself when the mark dies, and on reset', () => {
    const hud = mountHud();
    const target = creep();
    hud.showFocus(target);
    target.isDead = true;
    hud.updateFocus(target);
    expect(document.getElementById('focus-chip').classList.contains('hidden')).toBe(true);

    hud.showFocus(creep());
    expect(document.getElementById('focus-chip').classList.contains('hidden')).toBe(false);
    hud.reset();
    expect(document.getElementById('focus-chip').classList.contains('hidden')).toBe(true);
  });

  it('is a way out of the mode for a device with no keyboard', () => {
    const onClearFocus = vi.fn();
    const hud = mountHud({ onClearFocus });
    hud.showFocus(creep());
    document.getElementById('focus-chip').click();
    expect(onClearFocus).toHaveBeenCalledTimes(1);
    expect(document.getElementById('focus-chip').classList.contains('hidden')).toBe(true);
  });
});
