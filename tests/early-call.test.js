import { describe, it, expect } from 'vitest';
import { WaveManager, WAVE_STATE, earlyCallBonus } from '../src/systems/WaveManager.js';
import { WAVES, countWaveEnemies } from '../src/data/waveData.js';

/**
 * Early wave call ("CALL EARLY").
 *
 * The greed mechanic: while the last stragglers of a wave are still walking,
 * the player may start the next wave on top of them for bonus gold. These tests
 * pin the guard rails — the bonus curve, the "only while clearing" rule (the
 * spawn queue is per-wave, so calling early mid-spawn would drop spawns) and the
 * bookkeeping that keeps wave counts and star ratings honest.
 */

const STEP = 50;

/** Run the spawn queue dry, leaving `aliveEnemies` on the map. */
function drainSpawns(manager, aliveEnemies = 3) {
  let frames = 0;
  while (manager.state === WAVE_STATE.SPAWNING) {
    manager.update(STEP, aliveEnemies);
    frames += 1;
    if (frames > 20000) throw new Error('spawn queue never drained');
  }
}

function managerWith(callbacks = {}) {
  return new WaveManager(WAVES, { onSpawn: () => {}, ...callbacks });
}

describe('earlyCallBonus: risk curve', () => {
  it('starts at 6 gold and climbs 3 per leftover', () => {
    expect(earlyCallBonus(0)).toBe(6);
    expect(earlyCallBonus(1)).toBe(9);
    expect(earlyCallBonus(4)).toBe(18);
    expect(earlyCallBonus(12)).toBe(42);
  });

  it('caps at 70 gold so a huge pile-up is not a jackpot', () => {
    expect(earlyCallBonus(21)).toBe(69);
    expect(earlyCallBonus(22)).toBe(70);
    expect(earlyCallBonus(500)).toBe(70);
  });

  it('treats junk as zero leftovers', () => {
    expect(earlyCallBonus(-3)).toBe(6);
    expect(earlyCallBonus(undefined)).toBe(6);
    expect(earlyCallBonus('2')).toBe(12);
  });
});

describe('early call: availability', () => {
  it('is unavailable before the first wave and during spawning', () => {
    const manager = managerWith();
    expect(manager.state).toBe(WAVE_STATE.IDLE);
    expect(manager.canCallEarly(5)).toBe(false);

    manager.startNextWave();
    expect(manager.state).toBe(WAVE_STATE.SPAWNING);
    // Mid-spawn the per-wave queue would lose entries, so it must stay off.
    expect(manager.canCallEarly(5)).toBe(false);
  });

  it('opens once the queue is empty and enemies are still alive', () => {
    const manager = managerWith();
    manager.startNextWave();
    drainSpawns(manager, 4);
    expect(manager.state).toBe(WAVE_STATE.CLEARING);
    expect(manager.canCallEarly(4)).toBe(true);
    expect(manager.canCallEarly(0)).toBe(false);
  });

  it('stays closed on the final wave of a fixed campaign', () => {
    const manager = managerWith();
    for (let i = 0; i < WAVES.length - 1; i += 1) {
      manager.startNextWave();
      drainSpawns(manager, 2);
      manager.update(STEP, 0); // clear it out
    }
    manager.startNextWave();
    drainSpawns(manager, 2);
    expect(manager.waveNumber).toBe(WAVES.length);
    expect(manager.canCallEarly(2)).toBe(false);
  });

  it('is always available in endless mode', () => {
    const waveFactory = (n) => ({ name: `Endless ${n}`, groups: [{ type: 'grunt', count: 4, interval: 100 }] });
    const manager = new WaveManager([], { onSpawn: () => {}, endless: true, waveFactory });
    manager.startNextWave();
    drainSpawns(manager, 2);
    expect(manager.canCallEarly(2)).toBe(true);
    for (let wave = 0; wave < 20; wave += 1) {
      const result = manager.callEarly(2);
      expect(result).not.toBeNull();
      drainSpawns(manager, 2);
    }
  });
});

describe('early call: outcome', () => {
  it('starts the next wave immediately and reports the payout', () => {
    const manager = managerWith();
    manager.startNextWave();
    drainSpawns(manager, 5);

    const result = manager.callEarly(5);
    expect(result).toEqual({ settledWave: 1, bonus: earlyCallBonus(5), wave: 2 });
    expect(manager.waveNumber).toBe(2);
    expect(manager.state).toBe(WAVE_STATE.SPAWNING);
    expect(manager.wavesCompleted).toBe(1);
  });

  it('counts the settled wave even though its enemies are still walking', () => {
    const manager = managerWith();
    manager.startNextWave();
    drainSpawns(manager, 3);
    manager.callEarly(3);

    // The leftovers keep the new wave alive; the settled wave is already banked.
    expect(manager.pendingSpawns()).toBeGreaterThan(0);
    expect(manager.wavesCompleted).toBe(1);
  });

  it('spawns the new wave from the top of its own queue', () => {
    const spawned = [];
    const manager = new WaveManager(WAVES, { onSpawn: (type, wave) => spawned.push({ type, wave }) });
    manager.startNextWave();
    drainSpawns(manager, 2);
    spawned.length = 0;

    manager.callEarly(2);
    expect(manager.state).toBe(WAVE_STATE.SPAWNING);
    // Nothing is released on the same tick — the timer restarts at zero.
    expect(spawned).toHaveLength(0);

    manager.update(1, 2);
    expect(spawned[0]).toEqual({ type: WAVES[1].groups[0].type, wave: 2 });
  });

  it('refuses to fire when the guard rails say no', () => {
    const manager = managerWith();
    expect(manager.callEarly(3)).toBeNull(); // idle
    manager.startNextWave();
    expect(manager.callEarly(3)).toBeNull(); // spawning
    drainSpawns(manager, 0);
    expect(manager.callEarly(0)).toBeNull(); // nothing alive
    expect(manager.waveNumber).toBe(1);
    expect(manager.wavesCompleted).toBe(0);
  });

  it('keeps the normal flow intact after an early call', () => {
    const manager = managerWith();
    manager.startNextWave();
    drainSpawns(manager, 2);
    manager.callEarly(2);
    drainSpawns(manager, 0);
    manager.update(STEP, 0);

    expect(manager.state).toBe(WAVE_STATE.IDLE);
    expect(manager.wavesCompleted).toBe(2);
    expect(manager.canStartNextWave()).toBe(true);
  });

  it('sizes the next wave correctly after a call', () => {
    const manager = managerWith();
    manager.startNextWave();
    drainSpawns(manager, 2);
    manager.callEarly(2);
    expect(manager.totalThisWave).toBe(countWaveEnemies(WAVES[1]));
    expect(manager.currentWave).toBe(WAVES[1]);
  });
});
