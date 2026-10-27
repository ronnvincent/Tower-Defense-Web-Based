import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  POWERUPS,
  PowerupState,
  METEOR,
  FROST,
  frostTargets,
  OVERCHARGE,
  WAVE_CLEAR_REFUND_MS,
} from '../src/systems/Powerups.js';

describe('Powerup catalogue', () => {
  it('offers four distinct, hot-keyed tricks', () => {
    expect(POWERUPS).toHaveLength(4);
    expect(new Set(POWERUPS.map((p) => p.key)).size).toBe(4);
    expect(new Set(POWERUPS.map((p) => p.hotkey)).size).toBe(4);
    for (const powerup of POWERUPS) {
      expect(powerup.name).toBeTruthy();
      expect(powerup.cooldownMs).toBeGreaterThan(1000);
      expect(powerup.description.length).toBeGreaterThan(20);
    }
  });

  it('gives every powerup its own sigil, and the sigil exists on disk', () => {
    // These are the kit's 64 px pixel glyphs — not font emoji, which render
    // differently on every platform and were the reason the rail read as a
    // generic mobile-game button.
    const icons = POWERUPS.map((powerup) => powerup.icon);
    expect(new Set(icons).size).toBe(POWERUPS.length);
    for (const icon of icons) {
      expect(icon).toMatch(/^\/assets\/ui-kit\/glyph_[a-z]+\.png$/);
      expect(existsSync(resolve(process.cwd(), 'public', icon.replace(/^\//, '')))).toBe(true);
    }
  });

  it('only the aimed spells need a target', () => {
    const targeting = POWERUPS.filter((p) => p.targeting).map((p) => p.key);
    expect(targeting).toEqual(['meteor', 'frost']);
  });

  it('Frost Surge buys time instead of damage', () => {
    const frost = POWERUPS.find((p) => p.key === 'frost');
    expect(frost.cooldownMs).toBe(20000);
    expect(FROST).toMatchObject({ radius: 100, slow: 0.4, durationMs: 3000 });
    // A slow that also nuked would make the meteor pointless.
    expect(FROST.damage).toBeUndefined();
  });

  it('frost targets only living ground enemies inside the circle', () => {
    const mk = (x, y, extra = {}) => ({ x, y, isDead: false, reachedBase: false, ...extra });
    const inside = mk(110, 100);
    const outside = mk(260, 100);
    const dead = mk(100, 100, { isDead: true });
    const escaped = mk(100, 100, { reachedBase: true });
    const flier = mk(100, 100, { flying: true });
    const flierByDef = mk(100, 100, { def: { flying: true } });
    const hits = frostTargets([inside, outside, dead, escaped, flier, flierByDef], 100, 100);
    expect(hits).toEqual([inside]);
    expect(frostTargets(undefined, 0, 0)).toEqual([]);
  });
});

describe('PowerupState', () => {
  it('starts ready and spends on use', () => {
    const state = new PowerupState(0);
    for (const powerup of POWERUPS) expect(state.ready(powerup.key)).toBe(true);

    expect(state.use('meteor')).toBe(true);
    expect(state.ready('meteor')).toBe(false);
    // Spending one does not touch the others.
    expect(state.ready('overcharge')).toBe(true);
  });

  it('refuses a second use while cooling down', () => {
    const state = new PowerupState(0);
    expect(state.use('fortify')).toBe(true);
    expect(state.use('fortify')).toBe(false);
    // …and the failed attempt must not extend the cooldown.
    const first = state.remaining('fortify');
    expect(state.use('fortify')).toBe(false);
    expect(state.remaining('fortify')).toBe(first);
  });

  it('recharges exactly when the cooldown ends', () => {
    const powerup = POWERUPS.find((p) => p.key === 'meteor');
    const state = new PowerupState(0);
    state.use('meteor');
    state.tick(powerup.cooldownMs - 1);
    expect(state.ready('meteor')).toBe(false);
    expect(state.progress('meteor')).toBeGreaterThan(0.98);
    state.tick(powerup.cooldownMs);
    expect(state.ready('meteor')).toBe(true);
    expect(state.progress('meteor')).toBe(1);
  });

  it('never runs the clock backwards', () => {
    const state = new PowerupState(5000);
    state.tick(1000);
    expect(state.now).toBe(5000);
  });

  it('overcharge speeds every tower up for its window only', () => {
    const state = new PowerupState(0);
    expect(state.cooldownScale).toBe(1);
    expect(state.overcharged).toBe(false);

    state.use('overcharge');
    expect(state.overcharged).toBe(true);
    expect(state.cooldownScale).toBe(OVERCHARGE.cooldownScale);
    expect(OVERCHARGE.cooldownScale).toBeLessThan(0.7);

    state.tick(OVERCHARGE.durationMs - 1);
    expect(state.cooldownScale).toBe(OVERCHARGE.cooldownScale);

    state.tick(OVERCHARGE.durationMs);
    expect(state.overcharged).toBe(false);
    expect(state.cooldownScale).toBe(1);
  });

  it('pays cooldowns back when a wave is cleared', () => {
    const state = new PowerupState(0);
    state.use('meteor');
    const before = state.remaining('meteor');
    state.tick(1000).onWaveClear();
    expect(state.remaining('meteor')).toBe(before - 1000 - WAVE_CLEAR_REFUND_MS);
    // A ready powerup never goes negative.
    const fresh = new PowerupState(0);
    fresh.onWaveClear();
    for (const powerup of POWERUPS) expect(fresh.ready(powerup.key)).toBe(true);
  });

  it('snapshots without leaking mutable state', () => {
    const state = new PowerupState(0);
    state.use('meteor');
    const [first] = state.snapshot();
    expect(first.key).toBe('meteor');
    expect(first.ready).toBe(false);
    expect(first.progress).toBe(0);
    expect(first.icon).toMatch(/^\/assets\/ui-kit\/glyph_/);
    expect(first.remainingMs).toBeGreaterThan(0);
    // Mutating the snapshot must not touch the live state.
    first.ready = true;
    expect(state.ready('meteor')).toBe(false);
  });

  it('keeps the meteor blast meaningful', () => {
    expect(METEOR.radius).toBeGreaterThan(80);
    expect(METEOR.damage).toBeGreaterThan(300);
  });
});
