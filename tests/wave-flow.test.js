import { describe, it, expect } from 'vitest';
import { WaveManager, WAVE_STATE } from '../src/systems/WaveManager.js';
import { WAVES, countWaveEnemies } from '../src/data/waveData.js';

/**
 * End-to-end wave progression.
 *
 * The wave-3 freeze turned out to be a HUD API mismatch (see
 * tests/ui-contracts.test.js), not a spawning problem — but these tests pin the
 * whole 6-wave sequence so a genuine spawn stall (a queue that never drains, a
 * wave that never completes, wave 5's 35 entries overflowing the 32-slot
 * circular buffer) would be caught before it ever reaches a player.
 */

const STEP = 50; // ms of simulated time per frame

/** Advance the manager until the current wave reports completion. */
function runWave(manager) {
  const spawned = [];
  manager.onSpawn = (type, waveNumber) => spawned.push({ type, waveNumber });
  manager.startNextWave();

  let event = null;
  let frames = 0;
  while (!event) {
    event = manager.update(STEP, 0); // enemies are "instantly killed"
    frames += 1;
    if (frames > 20000) throw new Error('wave never completed — spawn stall');
  }
  return { spawned, event };
}

describe('WaveManager: full 6-wave campaign', () => {
  it('spawns every enemy of every wave, in order, and completes each one', () => {
    const manager = new WaveManager(WAVES, { onSpawn: () => {} });

    for (let index = 0; index < WAVES.length; index += 1) {
      expect(manager.canStartNextWave()).toBe(true);

      const { spawned, event } = runWave(manager);
      const expected = countWaveEnemies(WAVES[index]);

      expect(spawned).toHaveLength(expected);
      expect(spawned.every((entry) => entry.waveNumber === index + 1)).toBe(true);
      expect(event).toEqual({
        type: 'waveComplete',
        waveNumber: index + 1,
        isFinal: index === WAVES.length - 1,
        bounty: false,
        bountyGold: 0,
        bountyScore: 0,
      });
      expect(manager.pendingSpawns()).toBe(0);
      expect(manager.spawnedThisWave).toBe(expected);
    }

    expect(manager.state).toBe(WAVE_STATE.FINISHED);
    expect(manager.canStartNextWave()).toBe(false);
  });

  it('places each boss at the end of its wave, exactly once', () => {
    const manager = new WaveManager(WAVES, { onSpawn: () => {} });

    for (let index = 0; index < WAVES.length; index += 1) {
      const wave = WAVES[index];
      const { spawned } = runWave(manager);
      if (!wave.bossWave) {
        expect(spawned.some((entry) => entry.type === 'colossus' || entry.type === 'warlord')).toBe(
          false
        );
        continue;
      }

      expect(spawned.filter((entry) => entry.type === wave.bossKey)).toHaveLength(1);
      // Wave 3 ends with the colossus; wave 6 sends runners in behind the warlord.
      const bossIndex = spawned.findIndex((entry) => entry.type === wave.bossKey);
      const bossGroupIndex = wave.groups.findIndex((group) => group.type === wave.bossKey);
      const spawnsBeforeBoss = wave.groups
        .slice(0, bossGroupIndex)
        .reduce((total, group) => total + group.count, 0);
      expect(bossIndex).toBe(spawnsBeforeBoss);
    }
  });

  it('grows the 32-slot circular queue for wave 5 (35 entries) without losing spawns', () => {
    const manager = new WaveManager(WAVES, { onSpawn: () => {} });
    for (let index = 0; index < 4; index += 1) runWave(manager);

    expect(countWaveEnemies(WAVES[4])).toBeGreaterThan(32);
    const resizesBefore = manager.spawnQueue.stats.resizes;
    const { spawned } = runWave(manager);

    expect(manager.spawnQueue.stats.resizes).toBeGreaterThan(resizesBefore);
    expect(spawned).toHaveLength(countWaveEnemies(WAVES[4]));
    expect(new Set(spawned.map((entry) => entry.type))).toEqual(
      new Set(WAVES[4].groups.map((group) => group.type))
    );
  });

  it('spaces spawns of a group by at least its configured interval', () => {
    let now = 0;
    const spawnTimes = [];
    const manager = new WaveManager(WAVES, {
      onSpawn: (type) => spawnTimes.push({ type, at: now }),
    });
    manager.startNextWave();

    let event = null;
    let frames = 0;
    while (!event && frames < 20000) {
      event = manager.update(STEP, 0);
      now += STEP;
      frames += 1;
    }

    const wave = WAVES[0];
    expect(spawnTimes).toHaveLength(countWaveEnemies(wave));
    for (let i = 1; i < spawnTimes.length; i += 1) {
      // The first spawn lands on the first simulated frame, so allow one frame
      // of quantisation.
      expect(spawnTimes[i].at - spawnTimes[i - 1].at).toBeGreaterThanOrEqual(
        wave.groups[0].interval - STEP
      );
    }
  });

  it('only reports completion once no enemies are left alive', () => {
    const manager = new WaveManager(WAVES, { onSpawn: () => {} });
    manager.startNextWave();

    let frames = 0;
    while (manager.state === WAVE_STATE.SPAWNING && frames < 20000) {
      manager.update(STEP, 1); // one enemy standing in the way
      frames += 1;
    }

    expect(manager.state).toBe(WAVE_STATE.CLEARING);
    expect(manager.update(STEP, 1)).toBeNull();
    expect(manager.state).toBe(WAVE_STATE.CLEARING);

    const event = manager.update(STEP, 0); // last enemy dies
    expect(event?.type).toBe('waveComplete');
    expect(event?.isFinal).toBe(false);
  });
});

describe('WaveManager: endless mode', () => {
  const factory = (n) => ({
    name: `Endless wave ${n}`,
    groups: [{ type: 'grunt', count: 1, interval: 0 }],
  });

  it('never runs out of waves and never reports a final wave', () => {
    const manager = new WaveManager([], {
      onSpawn: () => {},
      endless: true,
      waveFactory: factory,
    });

    expect(manager.totalWaves).toBe(Infinity);
    expect(manager.canStartNextWave()).toBe(true);

    for (let wave = 1; wave <= 25; wave += 1) {
      const { spawned, event } = runWave(manager);
      expect(spawned).toHaveLength(1);
      expect(event.type).toBe('waveComplete');
      expect(event.isFinal).toBe(false);
      expect(manager.waveNumber).toBe(wave);
      expect(manager.canStartNextWave()).toBe(true);
    }
  });

  it('caches generated waves instead of mutating the level definition', () => {
    const levelWaves = [];
    const manager = new WaveManager(levelWaves, {
      onSpawn: () => {},
      endless: true,
      waveFactory: factory,
    });

    manager.startNextWave();
    expect(levelWaves).toHaveLength(0);
    expect(manager.currentWave.name).toBe('Endless wave 1');
    expect(manager.generated[0].name).toBe('Endless wave 1');
    expect(manager.nextWave.name).toBe('Endless wave 2');
  });
});
