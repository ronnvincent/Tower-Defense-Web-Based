// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HP_BAR, hpBarWidths, hpBarColor, damageNumberStyle, goldFloatLabel } from '../src/systems/Juice.js';
import { HUD } from '../src/ui/HUD.js';

/**
 * Phase 4 — the feedback layer.
 *
 * The rule the phase is held to is "strong feedback for important events,
 * quiet for frequent ones", so these tests pin the two halves separately: the
 * arithmetic that decides *how* strong (pure, no canvas), and the DOM classes
 * that carry it (no per-frame writes, no timers left running).
 */

describe('Juice: health bars', () => {
  it('is a 6 px gauge with rounded ends and a dark rim', () => {
    expect(HP_BAR.height).toBe(6);
    expect(HP_BAR.radius).toBe(3);
    expect(HP_BAR.border).toBeGreaterThan(0);
  });

  it('a healthy creep wears no bar at all', () => {
    const bar = hpBarWidths({ barWidth: 40, health: 20, maxHealth: 20 });
    expect(bar.visible).toBe(false);
  });

  it('appears on the first point of damage', () => {
    const bar = hpBarWidths({ barWidth: 40, health: 19, maxHealth: 20 });
    expect(bar.visible).toBe(true);
    expect(bar.fill).toBeCloseTo(38);
    expect(bar.chip).toBeCloseTo(38);
  });

  it('the chip segment never sits inside the fill', () => {
    // Half health, but the bar was at 90% a moment ago.
    const bar = hpBarWidths({ barWidth: 100, health: 50, maxHealth: 100, chipPct: 0.9 });
    expect(bar.fill).toBeCloseTo(50);
    expect(bar.chip).toBeCloseTo(90);
    expect(bar.chip).toBeGreaterThan(bar.fill);
  });

  it('a heal that overshoots the chip snaps it forward', () => {
    const bar = hpBarWidths({ barWidth: 100, health: 90, maxHealth: 100, chipPct: 0.4 });
    expect(bar.chip).toBeCloseTo(90);
  });

  it('clamps nonsense health instead of painting outside the bar', () => {
    expect(hpBarWidths({ barWidth: 50, health: 99, maxHealth: 10 }).fill).toBeCloseTo(50);
    expect(hpBarWidths({ barWidth: 50, health: -5, maxHealth: 10 }).fill).toBe(0);
    // A zero max is treated as one point of health, not as a division by zero.
    expect(hpBarWidths({ barWidth: 50, health: 5, maxHealth: 0 }).pct).toBe(1);
  });

  it('still uses the bastion palette', () => {
    expect(hpBarColor(0.9)).toBe(0x5cf2a6);
    expect(hpBarColor(0.5)).toBe(0xf5c451);
    expect(hpBarColor(0.2)).toBe(0xff5470);
  });
});

describe('Juice: damage numbers', () => {
  it('keeps the firing line colour for an ordinary hit', () => {
    const style = damageNumberStyle({ damage: 9, raw: 10, maxHealth: 200, color: 0xff5470 });
    expect(style.color).toBe(0xff5470);
    expect(style.heavy).toBe(false);
    expect(style.armored).toBe(false);
    expect(style.size).toBe(15);
  });

  it('goes gold and large when the hit took a real share of the target', () => {
    const style = damageNumberStyle({ damage: 30, raw: 30, maxHealth: 120 });
    expect(style.heavy).toBe(true);
    expect(style.color).toBe(0xffd76a);
    expect(style.size).toBeGreaterThan(15);
  });

  it('goes grey and small when armour ate the hit', () => {
    const style = damageNumberStyle({ damage: 4, raw: 20, maxHealth: 300 });
    expect(style.armored).toBe(true);
    expect(style.heavy).toBe(false);
    expect(style.size).toBeLessThan(15);
  });

  it('never reports damage it was not given', () => {
    expect(damageNumberStyle({ damage: 0, raw: 10, maxHealth: 10 }).heavy).toBe(false);
    expect(damageNumberStyle().heavy).toBe(false);
    expect(damageNumberStyle({ damage: 0, raw: 0 }).armored).toBe(false);
  });
});

describe('Juice: gold float', () => {
  it('reads as a plus, not a minus', () => {
    expect(goldFloatLabel(8)).toBe('+8');
    expect(goldFloatLabel(0)).toBe('');
    expect(goldFloatLabel(-3)).toBe('');
  });

  it('shortens four figures so the label fits a lane', () => {
    expect(goldFloatLabel(1000)).toBe('+1k');
    expect(goldFloatLabel(1250)).toBe('+1.3k');
  });
});

describe('HUD: battle feedback classes', () => {
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

  it('ships an edge vignette that nobody can tap', () => {
    const vignette = document.getElementById('damage-vignette');
    expect(vignette).toBeTruthy();
    expect(vignette.getAttribute('aria-hidden')).toBe('true');
    // jsdom does not load the stylesheet, so the no-tap promise is checked
    // against the source the browser actually gets (see tests/style-contract.*).
    const css = readFileSync('src/style.css', 'utf8');
    const rule = css.match(/\.damage-vignette \{([\s\S]*?)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/pointer-events:\s*none/);
    expect(rule[1]).toMatch(/position:\s*fixed/);
  });

  it('bounces the treasury once and clears the class afterwards', () => {
    const stat = document.getElementById('stat-coins');
    hud.bumpGold();
    expect(stat.classList.contains('is-bumped')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(stat.classList.contains('is-bumped')).toBe(false);
  });

  it('re-arms the bounce on a second kill in the same window', () => {
    const stat = document.getElementById('stat-coins');
    hud.bumpGold();
    vi.advanceTimersByTime(200);
    hud.bumpGold();
    vi.advanceTimersByTime(300);
    // The first timer would have cleared it at 420 ms; the second one owns it.
    expect(stat.classList.contains('is-bumped')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(stat.classList.contains('is-bumped')).toBe(false);
  });

  it('flashes the edge and shakes the heart on a leak', () => {
    const vignette = document.getElementById('damage-vignette');
    const stat = document.getElementById('stat-base-hp');
    hud.flashBaseHit(0.8);
    expect(vignette.classList.contains('is-hit')).toBe(true);
    expect(stat.classList.contains('is-hit')).toBe(true);
    expect(Number(vignette.style.getPropertyValue('--hit'))).toBeCloseTo(0.8);
    vi.advanceTimersByTime(600);
    expect(vignette.classList.contains('is-hit')).toBe(false);
    expect(stat.classList.contains('is-hit')).toBe(false);
  });

  it('clamps a nonsense intensity instead of writing it to the DOM', () => {
    const vignette = document.getElementById('damage-vignette');
    hud.flashBaseHit(9);
    expect(Number(vignette.style.getPropertyValue('--hit'))).toBeLessThanOrEqual(1);
    hud.flashBaseHit(-4);
    expect(Number(vignette.style.getPropertyValue('--hit'))).toBeGreaterThan(0);
  });
});
