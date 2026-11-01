import { describe, it, expect } from 'vitest';
import { MOODS, moodForWave, moodVars } from '../src/systems/Mood.js';

/**
 * Phase 5 — the light of a run.
 *
 * Three moods walk in order: daylight, golden hour, dusk. These tests pin the
 * ramp (so a six-wave run really does cross-fade through all three) and the
 * one rule that overrides the number: a boss wave is always dusk.
 */

describe('Mood: the ramp', () => {
  it('opens in daylight', () => {
    expect(moodForWave(1, 6).key).toBe('day');
    expect(moodForWave(2, 6).key).toBe('day');
  });

  it('reaches golden hour in the middle of the run', () => {
    expect(moodForWave(3, 6).key).toBe('golden');
    expect(moodForWave(4, 6).key).toBe('golden');
  });

  it('closes at dusk', () => {
    expect(moodForWave(6, 6).key).toBe('dusk');
  });

  it('walks the whole ramp even on a three-wave run', () => {
    expect(moodForWave(1, 3).key).toBe('day');
    expect(moodForWave(2, 3).key).toBe('golden');
    expect(moodForWave(3, 3).key).toBe('dusk');
  });

  it('a boss wave is dusk whatever its number', () => {
    expect(moodForWave(1, 6, { boss: true }).key).toBe('dusk');
    expect(moodForWave(5, 6, { boss: true }).key).toBe('dusk');
  });
});

describe('Mood: robustness', () => {
  it('clamps a wave number outside the run', () => {
    expect(moodForWave(0, 6).key).toBe('day');
    expect(moodForWave(99, 6).key).toBe('dusk');
  });

  it('treats a missing total as a one-wave run instead of dividing by zero', () => {
    expect(Number.isFinite(Number(moodVars(moodForWave(1, 0))['--battle-vignette']))).toBe(true);
    expect(moodForWave(1, undefined).key).toBe('day');
  });

  it('returns the same frozen object every time (no allocation per wave)', () => {
    expect(moodForWave(1, 6)).toBe(MOODS.day);
    expect(moodForWave(6, 6)).toBe(MOODS.dusk);
  });
});

describe('Mood: the CSS contract', () => {
  it('hands the layer the two properties it reads', () => {
    const vars = moodVars(MOODS.golden);
    expect(vars['--battle-light']).toMatch(/rgba\(/);
    expect(vars['--battle-fog']).toMatch(/rgba\(/);
    expect(vars['data-mood']).toBe('golden');
  });

  it('dusk is darker at the rim than daylight', () => {
    expect(Number(moodVars(MOODS.dusk)['--battle-vignette'])).toBeGreaterThan(
      Number(moodVars(MOODS.day)['--battle-vignette'])
    );
  });

  it('falls back to daylight for a mood it does not know', () => {
    expect(moodVars({ key: 'nonsense' })['data-mood']).toBe('day');
    expect(moodVars(null)['data-mood']).toBe('day');
  });
});
