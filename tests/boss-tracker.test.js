// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { BossTracker } from '../src/systems/BossTracker.js';

/**
 * Multi-boss panel contract.
 *
 * Endless cycle 3 spawns a titan next to the anchor boss and cycle 8 spawns both
 * titans, so the single `activeBoss` slot the scene used to keep could not answer
 * "which bar am I looking at?". The tracker is that answer, and `syncBossPanel()`
 * is the only place the HUD is told about it.
 */

const boss = (name, maxHealth, maxShield = 0, extra = {}) => ({
  def: { name },
  maxHealth,
  maxShield,
  health: maxHealth,
  isDead: false,
  reachedBase: false,
  currentPhaseIndex: 0,
  bossPhases: [{ phase: 1, name: 'Engaged' }],
  ...extra,
});

describe('boss roster', () => {
  it('shows the deadliest boss in a mixed wave', () => {
    const roster = new BossTracker();
    const anchor = boss('Magma Lord', 3500);
    const titan = boss('Void Herald', 7800, 600);

    // `add` answers with whoever owns the strip at that moment — first the
    // anchor, then the titan once it walks in.
    expect(roster.add(anchor)).toBe(anchor);
    expect(roster.add(titan)).toBe(titan);
    // The titan outranks the anchor by total pool, not by spawn order.
    expect(roster.current).toBe(titan);
    expect(roster.alive).toBe(2);
    expect(roster.extras).toBe(1);
  });

  it('counts a phase shield as part of the threat pool', () => {
    const roster = new BossTracker();
    const shielded = boss('Obsidian Behemoth', 9000, 400);
    const raw = boss('Anchor', 9100);
    roster.add(shielded);
    roster.add(raw);

    // 9400 > 9100 — the shielded titan keeps the strip.
    expect(roster.current).toBe(shielded);
  });

  it('hands the strip to the next boss instead of hiding it', () => {
    const roster = new BossTracker();
    const strong = boss('Void Herald', 7800);
    const weak = boss('Anchor', 3000);
    roster.add(weak);
    roster.add(strong);
    expect(roster.current).toBe(strong);

    // The tracked boss dies first: this is the case the old single slot got
    // wrong — it cleared the reference and hid the bar while the anchor lived.
    strong.isDead = true;
    const next = roster.prune();
    expect(next).toBe(weak);
    expect(roster.alive).toBe(1);
    expect(roster.extras).toBe(0);
  });

  it('drops bosses that reached the core without a defeat callback', () => {
    const roster = new BossTracker();
    const leaker = boss('Leaker', 5000);
    const other = boss('Other', 4000);
    roster.add(leaker);
    roster.add(other);
    expect(roster.current).toBe(leaker);

    leaker.reachedBase = true;
    expect(roster.prune()).toBe(other);
    expect(roster.alive).toBe(1);
  });

  it('returns null once the lane is clear', () => {
    const roster = new BossTracker();
    const only = boss('Solo', 1600);
    roster.add(only);
    expect(roster.remove(only)).toBeNull();
    expect(roster.current).toBeNull();
    expect(roster.extras).toBe(0);
  });

  it('never registers the same boss twice', () => {
    const roster = new BossTracker();
    const one = boss('Solo', 1600);
    roster.add(one);
    roster.add(one);
    expect(roster.alive).toBe(1);
    expect(roster.extras).toBe(0);
  });

  it('ignores empty slots without throwing', () => {
    const roster = new BossTracker();
    expect(() => roster.add(null)).not.toThrow();
    expect(roster.current).toBeNull();
    expect(new BossTracker([undefined, null]).alive).toBe(0);
  });
});

/**
 * GameScene extends Phaser.Scene, so the engine has to exist before the module
 * is evaluated. `syncBossPanel()` only reads `activeBoss`, the roster and the
 * HUD, which makes it the cheapest proof that the scene routes the roster to the
 * one strip.
 */
let GameScene;
beforeAll(async () => {
  vi.stubGlobal(
    'Phaser',
    new Proxy(
      { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
      { get: (target, key) => (key in target ? target[key] : { Scene: target.Scene }[key]) }
    )
  );
  ({ GameScene } = await import('../src/scenes/GameScene.js'));
});

function panelFor(activeBoss, extras = 0) {
  const calls = [];
  const hud = {
    showBossBar: (...args) => calls.push(['show', ...args]),
    updateBossPhase: (...args) => calls.push(['phase', ...args]),
    hideBossBar: () => calls.push(['hide']),
  };
  GameScene.prototype.syncBossPanel.call({ activeBoss, bossRoster: { extras }, hud });
  return calls;
}

describe('boss panel routing', () => {
  it('shows the tracked boss with the overflow count and its current phase', () => {
    const tracked = boss('Void Herald', 7800);
    tracked.currentPhaseIndex = 1;
    tracked.bossPhases = [{ phase: 1, name: 'Null Field' }, { phase: 2, name: 'Collapse' }];

    const calls = panelFor(tracked, 2);
    expect(calls[0]).toEqual(['show', tracked, 2]);
    expect(calls[1]).toEqual(['phase', tracked, { phase: 2, name: 'Collapse' }]);
    expect(calls.some(([kind]) => kind === 'hide')).toBe(false);
  });

  it('hides the strip when the roster is empty', () => {
    expect(panelFor(null)).toEqual([['hide']]);
  });
});
