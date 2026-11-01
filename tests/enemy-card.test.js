// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enemyCard, resistanceLine, DAMAGE_LABELS } from '../src/systems/EnemyCard.js';
import { HUD } from '../src/ui/HUD.js';

/**
 * Phase 6 — the creep hover card and the wave-clear record.
 *
 * Both are *readouts*: they must quote the numbers the simulation already uses,
 * and they must not invent a stat when the data is missing.
 */

const creep = (over = {}) => ({
  typeKey: 'grunt',
  def: { name: 'Grunt', resistances: null },
  health: 60,
  maxHealth: 100,
  speed: 64,
  armor: 3,
  traits: {},
  shield: 0,
  flying: false,
  isBoss: false,
  isDead: false,
  reachedBase: false,
  ...over,
});

describe('EnemyCard: the numbers', () => {
  it('prints speed in tiles a second, not pixels', () => {
    // 64 px/s on 64 px tiles is one tile a second.
    expect(enemyCard(creep(), 64).speed).toBe(1);
    // The same creep on the same board, but twice as fast.
    expect(enemyCard(creep({ speed: 128 }), 64).speed).toBe(2);
  });

  it('rounds health the way the bar does', () => {
    const card = enemyCard(creep({ health: 59.6 }), 64);
    expect(card.hp).toBe(60);
    expect(card.max).toBe(100);
    expect(card.pct).toBe(60);
  });

  it('reports an honest "no special armour" instead of guessing', () => {
    expect(resistanceLine(creep())).toEqual({ text: 'No special armour', tone: 'none' });
    expect(resistanceLine({})).toEqual({ text: 'No special armour', tone: 'none' });
  });

  it('reads resistances as the share of damage ignored', () => {
    const line = resistanceLine(creep({ def: { name: 'Iron', resistances: { physical: 0.35, piercing: 0.2 } } }));
    expect(line.tone).toBe('resist');
    expect(line.text).toContain('Physical 35%');
    expect(line.text).toContain('Piercing 20%');
  });

  it('a negative resistance is a weakness, and wins the line', () => {
    const line = resistanceLine(creep({ def: { name: 'Ice', resistances: { frost: -0.5, physical: 0.2 } } }));
    expect(line.tone).toBe('weak');
    expect(line.text).toBe('Weak to Frost 50%');
  });

  it('ignores zeroed entries', () => {
    const line = resistanceLine(creep({ def: { name: 'Plain', resistances: { physical: 0, magic: 0 } } }));
    expect(line.tone).toBe('none');
  });

  it('has a label for every damage type the calculator resolves', () => {
    for (const type of ['physical', 'piercing', 'magic', 'lightning', 'frost']) {
      expect(DAMAGE_LABELS[type]).toBeTruthy();
    }
  });

  it('shows nothing for a corpse or a creep that already reached the gate', () => {
    expect(enemyCard(creep({ isDead: true }))).toBeNull();
    expect(enemyCard(creep({ reachedBase: true }))).toBeNull();
    expect(enemyCard(null)).toBeNull();
  });

  it('carries the traits a player can act on', () => {
    const card = enemyCard(creep({ traits: { phalanx: { radius: 64 }, adaptive: {} } }), 64);
    expect(card.traits).toContain('Phalanx');
    expect(card.traits).toContain('Adaptive plate');
  });

  it('marks a boss and a shielded creep', () => {
    const card = enemyCard(creep({ isBoss: true, shield: 40 }), 64);
    expect(card.boss).toBe(true);
    expect(card.shielded).toBe(true);
    expect(card.traits).toContain('Boss');
  });
});

describe('HUD: wave clear and the creep card', () => {
  let hud;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
    hud = new HUD(document.getElementById('hud-container'), {});
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('a clean wave earns the stamp', () => {
    hud.showWaveClear({ wave: 3, kills: 12, leaks: 0, gold: 40, ms: 42000 });
    const card = document.getElementById('wave-clear');
    expect(card.classList.contains('is-flawless')).toBe(true);
    expect(card.textContent).toContain('FLAWLESS');
    expect(card.textContent).toContain('12');
    expect(card.textContent).toContain('42s');
    expect(card.textContent).toContain('+40 gold');
  });

  it('a leaked wave gets the numbers without the stamp', () => {
    hud.showWaveClear({ wave: 3, kills: 9, leaks: 2, gold: 40, ms: 50000 });
    const card = document.getElementById('wave-clear');
    expect(card.classList.contains('is-flawless')).toBe(false);
    expect(card.textContent).not.toContain('FLAWLESS');
    expect(card.textContent).toContain('2');
  });

  it('clears itself instead of stacking up', () => {
    hud.showWaveClear({ wave: 1, kills: 3, leaks: 0, gold: 10, ms: 9000 });
    const card = document.getElementById('wave-clear');
    expect(card.classList.contains('is-shown')).toBe(true);
    vi.advanceTimersByTime(2700);
    expect(card.classList.contains('is-shown')).toBe(false);
  });

  it('the creep card is hidden by default and clamped to the viewport', () => {
    expect(document.getElementById('enemy-card')).toBeNull();
    hud.showEnemyCard({ name: 'GRUNT', hp: 60, max: 100, pct: 60, speed: 1.2, armor: 3, traits: [], resistance: { text: 'No special armour', tone: 'none' } }, { x: 99999, y: 99999 });
    const card = document.getElementById('enemy-card');
    expect(card.classList.contains('is-shown')).toBe(true);
    expect(card.textContent).toContain('GRUNT');
    // The transform is clamped, so the card is never off screen.
    expect(card.style.transform).toMatch(/translate\(/);
    hud.showEnemyCard(null);
    expect(card.classList.contains('is-shown')).toBe(false);
  });

  it('a nudge does not repeat itself within the window', () => {
    const first = hud.showNudge('UPGRADE SOMETHING', 'upgrade');
    const second = hud.showNudge('UPGRADE SOMETHING', 'upgrade');
    expect(first).toBe(true);
    expect(second).toBe(false);
    vi.advanceTimersByTime(46000);
    expect(hud.showNudge('UPGRADE SOMETHING', 'upgrade')).toBe(true);
  });

  it('a nudge never interrupts an open modal', () => {
    document.body.classList.add('modal-open');
    expect(hud.showNudge('UPGRADE SOMETHING', 'upgrade')).toBe(false);
    document.body.classList.remove('modal-open');
  });
});
