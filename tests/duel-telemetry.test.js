/**
 * duel-telemetry.test.js — the duel HUD's work budget.
 *
 * The rival strip is a remote readout fed at 2 Hz. Painting it on the frame
 * loop used to allocate the whole lobby view and write styles 60 times a
 * second for text that could not have changed; this pins the budget so it
 * cannot creep back.
 */

import { describe, it, expect } from 'vitest';
import {
  PROGRESS_REPORT_MS,
  RIVAL_PAINT_MS,
  progressKey,
  telemetryPlan,
} from '../src/systems/DuelTelemetry.js';

/** Run `ms` of 60 fps frames through the planner, counting what fired. */
function simulate(ms, step = 1000 / 60) {
  let lastPaint = 0;
  let lastReport = 0;
  let paints = 0;
  let reports = 0;
  for (let now = 0; now <= ms; now += step) {
    const plan = telemetryPlan(now, { paint: lastPaint, report: lastReport });
    if (plan.paint) {
      paints += 1;
      lastPaint = now;
    }
    if (plan.report) {
      reports += 1;
      lastReport = now;
    }
  }
  return { paints, reports };
}

describe('duel telemetry budget', () => {
  it('waits its turn before the first paint', () => {
    expect(telemetryPlan(0, {})).toEqual({ paint: false, report: false });
    expect(telemetryPlan(RIVAL_PAINT_MS - 1, { paint: 0 }).paint).toBe(false);
    expect(telemetryPlan(RIVAL_PAINT_MS, { paint: 0 }).paint).toBe(true);
    expect(telemetryPlan(PROGRESS_REPORT_MS - 1, { report: 0 }).report).toBe(false);
    expect(telemetryPlan(PROGRESS_REPORT_MS, { report: 0 }).report).toBe(true);
  });

  it('turns a 60 fps loop into ~8 paints and 2 reports a second', () => {
    const { paints, reports } = simulate(1000);
    expect(paints).toBeLessThanOrEqual(9);
    expect(paints).toBeGreaterThanOrEqual(7);
    expect(reports).toBeLessThanOrEqual(2);
  });

  it('costs at most 9 paints over a 10 s wave instead of 600', () => {
    const { paints, reports } = simulate(10000);
    expect(paints).toBeLessThanOrEqual(84);
    expect(reports).toBeLessThanOrEqual(20);
    expect(paints).toBeLessThan(60 * 10 * 0.2);
  });

  it('treats an unchanged heartbeat as nothing to say', () => {
    const beat = { wave: 2, totalWaves: 8, score: 640, coreHp: 19, alive: true };
    expect(progressKey(beat)).toBe(progressKey({ ...beat }));
    expect(progressKey(beat)).not.toBe(progressKey({ ...beat, score: 641 }));
    expect(progressKey(beat)).not.toBe(progressKey({ ...beat, coreHp: 0 }));
    expect(progressKey(beat)).not.toBe(progressKey({ ...beat, alive: false }));
    expect(progressKey(beat)).not.toBe(progressKey({ ...beat, wave: 3 }));
  });

  it('survives a half-filled payload', () => {
    expect(progressKey()).toBe('0|0|0|x|1');
    expect(progressKey({ score: Number.NaN, coreHp: Number.NaN })).toBe('0|0|0|x|1');
    expect(progressKey({ score: 12.7 })).toBe('0|0|12|x|1');
  });
});
