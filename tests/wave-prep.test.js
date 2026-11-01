import { describe, it, expect } from 'vitest';
import {
  PREP_PHASE,
  advanceWavePrep,
  armWavePrep,
  cancelWavePrep,
  createWavePrep,
  formatPrepClock,
  prepLabel,
  resolvePrepWindows,
} from '../src/systems/WavePrep.js';
import { WAVE_PREP } from '../src/config/gameConfig.js';
import { getLevel } from '../src/data/levelData.js';

/**
 * The preparation window.
 *
 * The rules that matter are all about *safety*, not about numbers: exactly one
 * window at a time, exactly one wave opened per window, no window left ticking
 * after the battle is over, and no window that can open a wave while the horde
 * is still on the road. Each of those is a bug a player would see immediately.
 */

const step = (prep, ms, state) => advanceWavePrep(prep, ms, state);

describe('preparation windows', () => {
  it('starts on the longer opening window and then uses the shorter one', () => {
    const prep = createWavePrep({});
    expect(prep.active).toBe(true);
    expect(prep.phase).toBe(PREP_PHASE.FIRST);
    expect(prep.remainingMs).toBe(WAVE_PREP.firstMs);

    cancelWavePrep(prep);
    armWavePrep(prep, PREP_PHASE.BETWEEN);
    expect(prep.remainingMs).toBe(WAVE_PREP.betweenMs);
  });

  it('lets a level set its own windows, and clamps bad data instead of trusting it', () => {
    expect(resolvePrepWindows({ wavePrep: { firstMs: 25000, betweenMs: 12000 } })).toEqual({
      firstMs: 25000,
      betweenMs: 12000,
    });
    const clamped = resolvePrepWindows({ wavePrep: { firstMs: 10, betweenMs: -400 } });
    expect(clamped.firstMs).toBe(WAVE_PREP.minMs);
    expect(clamped.betweenMs).toBe(WAVE_PREP.minMs);
  });

  it('can be created inert for the modes that pace themselves', () => {
    const prep = createWavePrep({}, { autoStart: false });
    expect(prep.active).toBe(false);
    expect(prep.phase).toBe(PREP_PHASE.OFF);
    expect(step(prep, 60000, { canStart: true }).open).toBe(false);
  });

  it('opens the wave exactly once, then stays inert', () => {
    // 1000 ms is below the floor on purpose: the clock clamps to 3 s, and the
    // window still opens exactly once when it runs out.
    const prep = createWavePrep({ wavePrep: { firstMs: 1000 } });
    expect(prep.remainingMs).toBe(WAVE_PREP.minMs);
    const first = step(prep, WAVE_PREP.minMs - 1, { canStart: true });
    expect(first.open).toBe(false);
    expect(prep.remainingMs).toBe(1);

    const second = step(prep, 1, { canStart: true });
    expect(second.open).toBe(true);
    expect(prep.opened).toBe(1);
    expect(prep.active).toBe(false);

    // Hundreds of extra frames cannot open the same wave again.
    for (let i = 0; i < 50; i += 1) expect(step(prep, 16, { canStart: true }).open).toBe(false);
    expect(prep.opened).toBe(1);
  });

  it('never runs down into an opening while the current wave is still alive', () => {
    const prep = createWavePrep({ wavePrep: { firstMs: WAVE_PREP.minMs } });
    // `canStart:false` is what the wave manager reports while enemies live.
    const result = step(prep, 5000, { canStart: false });
    expect(result.open).toBe(false);
    expect(prep.active).toBe(false);
    expect(prep.opened).toBe(0);
  });

  it('cancels on defeat/victory instead of leaving a timer running', () => {
    const prep = createWavePrep({});
    const result = step(prep, 16, { canStart: true, over: true });
    expect(result.open).toBe(false);
    expect(prep.active).toBe(false);
    expect(prep.remainingMs).toBe(0);
  });

  it('freezes while it is not advanced (a paused battle calls nothing)', () => {
    const prep = createWavePrep({ wavePrep: { firstMs: 5000 } });
    step(prep, 1000, { canStart: true });
    const frozen = prep.remainingMs;
    // A pause is the absence of a step, not a special state on the clock.
    for (let i = 0; i < 30; i += 1) {
      /* no tick */
    }
    expect(prep.remainingMs).toBe(frozen);
    step(prep, 1, { canStart: true });
    expect(prep.remainingMs).toBe(frozen - 1);
  });

  it('arms a fresh window every wave without stacking', () => {
    const prep = createWavePrep({});
    cancelWavePrep(prep);
    for (let wave = 1; wave <= 8; wave += 1) {
      armWavePrep(prep, PREP_PHASE.BETWEEN);
      expect(prep.remainingMs).toBe(WAVE_PREP.betweenMs);
      expect(step(prep, WAVE_PREP.betweenMs, { canStart: true }).open).toBe(true);
      expect(prep.opened).toBe(wave);
    }
  });

  it('formats a clock a player can read', () => {
    expect(formatPrepClock(0)).toBe('0:00');
    expect(formatPrepClock(1)).toBe('0:01');
    expect(formatPrepClock(9000)).toBe('0:09');
    expect(formatPrepClock(75000)).toBe('1:15');
    expect(formatPrepClock(-5)).toBe('0:00');
    expect(prepLabel(9000, PREP_PHASE.BETWEEN)).toBe('NEXT WAVE IN 0:09');
    expect(prepLabel(9000, PREP_PHASE.FIRST)).toBe('WAVE 1 IN 0:09');
  });
});

describe('the campaign stage opts into the clock', () => {
  it('gives stage 1 a 20 s opening window and a 10 s breather', () => {
    const level = getLevel('level-1');
    const windows = resolvePrepWindows(level);
    expect(windows).toEqual({ firstMs: 20000, betweenMs: 10000 });
    expect(createWavePrep(level).remainingMs).toBe(20000);
  });
});
