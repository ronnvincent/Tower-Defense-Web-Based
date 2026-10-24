import { describe, it, expect } from 'vitest';
import {
  COMBO_MULTIPLIERS,
  COMBO_THRESHOLDS,
  COMBO_WINDOW_MS,
  comboBonus,
  comboMultiplier,
  comboTier,
  createComboState,
  registerKill,
  resetCombo,
  startNewWave,
  tickCombo,
  waveComboPayout,
} from '../src/systems/ComboMeter.js';

/**
 * Kill-chain rules.
 *
 * The combo is the "one more wave" hook: it turns routine clearing into a
 * score chase, so the windup (3 kills), the window (2.6 s) and the payout curve
 * are pinned here. A regression in any of them silently removes the reward for
 * playing aggressively.
 */

describe('ComboMeter: tier ladder', () => {
  it('starts at 1x with no chain and steps up at 3 / 6 / 10 kills', () => {
    expect(comboTier(0)).toBe(0);
    expect(comboTier(2)).toBe(0);
    expect(comboTier(COMBO_THRESHOLDS[0])).toBe(1);
    expect(comboTier(5)).toBe(1);
    expect(comboTier(COMBO_THRESHOLDS[1])).toBe(2);
    expect(comboTier(9)).toBe(2);
    expect(comboTier(COMBO_THRESHOLDS[2])).toBe(3);
    expect(comboTier(250)).toBe(3);
  });

  it('maps every tier to its multiplier', () => {
    expect(COMBO_MULTIPLIERS).toHaveLength(COMBO_THRESHOLDS.length + 1);
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(1.25);
    expect(comboMultiplier(6)).toBe(1.5);
    expect(comboMultiplier(10)).toBe(2);
  });

  it('treats garbage input as an empty chain', () => {
    expect(comboTier(undefined)).toBe(0);
    expect(comboTier(-4)).toBe(0);
    expect(comboTier('7')).toBe(2);
    expect(comboMultiplier(null)).toBe(1);
  });
});

describe('ComboMeter: kill window', () => {
  it('chains kills inside the window and reports the extension', () => {
    const state = createComboState();
    const first = registerKill(state, 1000);
    expect(first).toMatchObject({ chain: 1, extended: false, tier: 0 });

    const second = registerKill(state, 1000 + COMBO_WINDOW_MS);
    expect(second.chain).toBe(2);
    expect(second.extended).toBe(true);
  });

  it('restarts the chain when the window lapses', () => {
    const state = createComboState();
    registerKill(state, 0);
    registerKill(state, 100);
    const late = registerKill(state, 100 + COMBO_WINDOW_MS + 1);
    expect(late.chain).toBe(1);
    expect(late.extended).toBe(false);
  });

  it('keeps the best chain of the wave across a break', () => {
    const state = createComboState();
    for (let i = 0; i < 5; i += 1) registerKill(state, i * 100);
    expect(state.best).toBe(5);
    registerKill(state, 10_000);
    expect(state.best).toBe(5);
    expect(state.chain).toBe(1);
  });

  it('raises the multiplier mid-chain at the right kill', () => {
    const state = createComboState();
    const seen = [];
    for (let i = 0; i < 10; i += 1) seen.push(registerKill(state, i * 200).multiplier);
    expect(seen[1]).toBe(1);
    expect(seen[2]).toBe(1.25);
    expect(seen[5]).toBe(1.5);
    expect(seen[9]).toBe(2);
  });
});

describe('ComboMeter: decay', () => {
  it('counts down and expires exactly at the window edge', () => {
    const state = createComboState();
    registerKill(state, 1000);

    const mid = tickCombo(state, 1000 + COMBO_WINDOW_MS / 2);
    expect(mid.expired).toBe(false);
    expect(mid.remainingMs).toBe(COMBO_WINDOW_MS / 2);
    expect(mid.chain).toBe(1);

    const edge = tickCombo(state, 1000 + COMBO_WINDOW_MS);
    expect(edge.expired).toBe(true);
    expect(edge.chain).toBe(0);
  });

  it('never reports a negative remaining time', () => {
    const state = createComboState();
    registerKill(state, 0);
    expect(tickCombo(state, 999_999).remainingMs).toBe(0);
  });

  it('leaves an empty meter alone', () => {
    const state = createComboState();
    const tick = tickCombo(state, 5000);
    expect(tick.expired).toBe(false);
    expect(tick.remainingMs).toBe(0);
  });
});

describe('ComboMeter: resets', () => {
  it('resetCombo clears the live chain but remembers the best', () => {
    const state = createComboState();
    for (let i = 0; i < 4; i += 1) registerKill(state, i * 100);
    const result = resetCombo(state);
    expect(result).toMatchObject({ chain: 0, best: 4, multiplier: 1 });
    expect(state.chain).toBe(0);
    expect(state.best).toBe(4);
  });

  it('startNewWave clears the best chain too', () => {
    const state = createComboState();
    for (let i = 0; i < 6; i += 1) registerKill(state, i * 100);
    startNewWave(state);
    expect(state.chain).toBe(0);
    expect(state.best).toBe(0);
    // A fresh chain after the reset must not inherit the old timestamp.
    expect(registerKill(state, 50_000).extended).toBe(false);
  });
});

describe('ComboMeter: payouts', () => {
  it('pays only the extra the multiplier earned, rounded', () => {
    expect(comboBonus(10, 1)).toBe(0);
    expect(comboBonus(10, 1.25)).toBe(3); // 2.5 → 3
    expect(comboBonus(10, 1.5)).toBe(5);
    expect(comboBonus(10, 2)).toBe(10);
    expect(comboBonus(7, 1.25)).toBe(2); // 1.75 → 2
  });

  it('never subtracts gold for a bad multiplier', () => {
    expect(comboBonus(10, 0)).toBe(0);
    expect(comboBonus(10, -2)).toBe(0);
    expect(comboBonus(undefined, 2)).toBe(0);
  });

  it('pays a wave bonus only once a real chain happened', () => {
    expect(waveComboPayout(0)).toBe(0);
    expect(waveComboPayout(2)).toBe(0);
    expect(waveComboPayout(3)).toBe(4);
    expect(waveComboPayout(9)).toBe(28);
    expect(waveComboPayout(10)).toBe(32);
    expect(waveComboPayout(100)).toBe(90); // capped
  });
});
