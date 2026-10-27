import { describe, it, expect } from 'vitest';
import {
  gateIndexForSpawn,
  gateSlotsForWave,
  gatesInPlay,
  waveGatePlan,
  waveProgress,
} from '../src/systems/SpawnGates.js';
import { SPAWN_GATES } from '../src/config/gameConfig.js';
import { LEVELS, makeEndlessWave } from '../src/data/levelData.js';
import { PVP_RULES } from '../src/data/pvpArenas.js';

/**
 * One wave, one road.
 *
 * The horde used to be dealt across every portal on every spawn, so a single
 * wave stepped out of three holes in the same second and the board read as one
 * undifferentiated blob. This is the rule that fixed it: a wave owns one gate
 * while the stage is teaching, two past the halfway mark, and the whole board
 * only at the end.
 */

const lanes = 3;

describe('how far into a stage a wave is', () => {
  it('runs 0 → 1 across a finite stage', () => {
    expect(waveProgress({ waveNumber: 1, totalWaves: 8 })).toBe(0);
    expect(waveProgress({ waveNumber: 8, totalWaves: 8 })).toBe(1);
    expect(waveProgress({ waveNumber: 5, totalWaves: 8 })).toBeCloseTo(4 / 7, 6);
  });

  it('clamps instead of dividing by zero on a one-wave stage', () => {
    expect(waveProgress({ waveNumber: 1, totalWaves: 1 })).toBe(0);
    expect(waveProgress({ waveNumber: 9, totalWaves: 1 })).toBe(0);
    expect(waveProgress({ waveNumber: 0, totalWaves: 0 })).toBe(0);
  });

  it('ramps an endless run over its own window and then stays open', () => {
    expect(waveProgress({ waveNumber: 1, totalWaves: Infinity, endless: true })).toBe(0);
    expect(waveProgress({ waveNumber: 7, totalWaves: Infinity, endless: true })).toBeCloseTo(0.5, 6);
    expect(waveProgress({ waveNumber: SPAWN_GATES.endlessRampWaves + 1, totalWaves: Infinity, endless: true })).toBe(1);
    expect(waveProgress({ waveNumber: 90, totalWaves: Infinity, endless: true })).toBe(1);
  });
});

describe('how many gates a wave may use', () => {
  it('never opens more than the board offers', () => {
    for (const laneCount of [1, 2, 3]) {
      for (const waveNumber of [1, 4, 8, 12]) {
        const gates = gatesInPlay({ waveNumber, totalWaves: 8, laneCount });
        expect(gates, `${laneCount} lanes, wave ${waveNumber}`).toBeLessThanOrEqual(Math.min(laneCount, SPAWN_GATES.maxGates));
        expect(gates).toBeGreaterThanOrEqual(1);
      }
    }
    // A fifth mouth does not turn one wave into five columns.
    expect(gatesInPlay({ waveNumber: 12, totalWaves: 12, laneCount: 5 })).toBe(SPAWN_GATES.maxGates);
  });

  it('opens one gate early, two at the halfway mark, all of them at the end', () => {
    const early = gatesInPlay({ waveNumber: 1, totalWaves: 10, laneCount: lanes });
    const middle = gatesInPlay({ waveNumber: 6, totalWaves: 10, laneCount: lanes });
    const late = gatesInPlay({ waveNumber: 10, totalWaves: 10, laneCount: lanes });
    expect([early, middle, late]).toEqual([1, 2, 3]);
    // The thresholds come from config, not from a magic number in this file.
    // An 11-wave stage lands on both thresholds exactly (progress = (w-1)/10).
    const at = (fraction) => 1 + fraction * 10;
    expect(gatesInPlay({ waveNumber: at(SPAWN_GATES.doubleAt), totalWaves: 11, laneCount: lanes })).toBe(2);
    expect(gatesInPlay({ waveNumber: at(SPAWN_GATES.doubleAt) - 1, totalWaves: 11, laneCount: lanes })).toBe(1);
    expect(gatesInPlay({ waveNumber: at(SPAWN_GATES.tripleAt), totalWaves: 11, laneCount: lanes })).toBe(3);
  });

  it('keeps every campaign stage single-gate at the start and open at the end', () => {
    for (const level of LEVELS) {
      const total = level.waves.length;
      expect(
        gatesInPlay({ waveNumber: 1, totalWaves: total, laneCount: lanes }),
        `${level.id} opens with a fan-out`
      ).toBe(1);
      expect(
        gatesInPlay({ waveNumber: total, totalWaves: total, laneCount: lanes }),
        `${level.id} ends on a single lane`
      ).toBe(3);
    }
  });

  it('treats a duel like any other ten-wave stage', () => {
    const total = PVP_RULES.waves;
    expect(gatesInPlay({ waveNumber: 1, totalWaves: total, laneCount: lanes })).toBe(1);
    expect(gatesInPlay({ waveNumber: total, totalWaves: total, laneCount: lanes })).toBe(3);
  });

  it('opens the endless board up once the run is warm', () => {
    const endlessWave = (n) => gatesInPlay({ waveNumber: n, totalWaves: Infinity, endless: true, laneCount: lanes });
    expect(endlessWave(1)).toBe(1);
    expect(endlessWave(5)).toBe(1);
    expect(endlessWave(7)).toBe(2); // progress 0.5
    expect(endlessWave(11)).toBe(3); // progress 0.83 — the board is fully open
    expect(endlessWave(30)).toBe(3);
    // The generator itself does not decide the gates — the scene does.
    expect(makeEndlessWave(30).groups.length).toBeGreaterThan(0);
  });
});

describe('which gate each enemy uses', () => {
  it('keeps a single-gate wave on one road, and rotates the next wave', () => {
    for (const wave of [1, 2, 3, 4]) {
      const slots = Array.from({ length: 12 }, (_, tick) => gateIndexForSpawn(tick, wave, lanes, 1));
      expect(new Set(slots).size, `wave ${wave}`).toBe(1);
      expect(slots[0]).toBe((wave - 1) % lanes);
    }
    // Four consecutive waves touch every road.
    expect([1, 2, 3].map((wave) => gateIndexForSpawn(0, wave, lanes, 1))).toEqual([0, 1, 2]);
  });

  it('splits a two-gate wave between two roads only', () => {
    const slots = Array.from({ length: 8 }, (_, tick) => gateIndexForSpawn(tick, 5, lanes, 2));
    expect(slots).toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
  });

  it('cycles the whole board when every gate is open', () => {
    const slots = gateSlotsForWave(7, lanes, 3);
    expect(slots).toEqual([0, 1, 2]);
    expect(new Set(Array.from({ length: 9 }, (_, tick) => gateIndexForSpawn(tick, 7, lanes, 3))).size).toBe(3);
  });

  it('is a pure function of the wave ordinal — two seats, one answer', () => {
    for (let wave = 1; wave <= 12; wave += 1) {
      const once = Array.from({ length: 10 }, (_, tick) => gateIndexForSpawn(tick, wave, lanes, 2));
      const again = Array.from({ length: 10 }, (_, tick) => gateIndexForSpawn(tick, wave, lanes, 2));
      expect(again).toEqual(once);
    }
  });

  it('survives bad input without returning NaN', () => {
    expect(gateIndexForSpawn(3, 2, 0)).toBe(0);
    expect(gateIndexForSpawn(undefined, undefined, 3, 1)).toBe(0);
    // Negative inputs collapse to the first enemy of the first wave, on one gate.
    expect(gateIndexForSpawn(-5, -2, 3, -1)).toBe(0);
    expect(gateSlotsForWave(1, 0)).toEqual([]);
    expect(Number.isFinite(gateIndexForSpawn(4.7, 3.2, 3, 1.6))).toBe(true);
  });
});

describe('the wave plan the scene reads', () => {
  it('bundles progress, gate count and slots together', () => {
    const opening = waveGatePlan({ waveNumber: 1, totalWaves: 8, laneCount: lanes });
    expect(opening).toEqual({ progress: 0, gates: 1, slots: [0], primary: 0 });
    const last = waveGatePlan({ waveNumber: 8, totalWaves: 8, laneCount: lanes });
    expect(last.gates).toBe(3);
    expect(last.slots).toEqual([1, 2, 0]);
    expect(last.primary).toBe(1);
  });

  it('never reports more slots than gates and never an empty slot list', () => {
    for (const waveNumber of [1, 2, 3, 4, 5, 6, 7, 8, 12, 40]) {
      const plan = waveGatePlan({ waveNumber, totalWaves: 8, laneCount: lanes });
      expect(plan.slots.length).toBe(plan.gates);
      expect(new Set(plan.slots).size).toBe(plan.gates);
      for (const slot of plan.slots) expect(slot).toBeGreaterThanOrEqual(0), expect(slot).toBeLessThan(lanes);
    }
  });
});
