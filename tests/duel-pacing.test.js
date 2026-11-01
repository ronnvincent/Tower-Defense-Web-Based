/**
 * duel-pacing.test.js — the duel's wave clock.
 *
 * Two boards, one schedule: 10 seconds to place the opening defence, then the
 * arena opens each wave itself with a 5 second breather in between. Nobody taps
 * "start wave" in a duel, so this clock is the only thing that can move the
 * fight forward — which makes it worth testing on its own.
 */

import { describe, it, expect, vi } from 'vitest';

import { WaveManager } from '../src/systems/WaveManager.js';
import {
  DUEL_BREATHER_MS,
  DUEL_PREP_MS,
  PACING_PHASE,
  advanceDuelPacing,
  breathe,
  closePacing,
  createDuelPacing,
  manualStartAllowed,
  pacingHint,
  pacingLabel,
  pacingSeconds,
  tickPacing,
} from '../src/systems/DuelPacing.js';

/** A wave manager that is ready to open the next wave. */
function idleManager() {
  return { canStartNextWave: () => true, startNextWave: vi.fn(() => true) };
}

describe('prep before the first wave', () => {
  it('gives both players ten seconds to build', () => {
    const pacing = createDuelPacing();
    expect(pacing.phase).toBe(PACING_PHASE.PREP);
    expect(pacing.remainingMs).toBe(DUEL_PREP_MS);
    expect(DUEL_PREP_MS).toBe(10_000);
    expect(pacingLabel(pacing)).toBe('PREPARE · 10');
    expect(pacingHint(pacing)).toBe('PLACE YOUR DEFENCES');
  });

  it('counts down and opens the first wave exactly once', () => {
    const pacing = createDuelPacing();
    expect(tickPacing(pacing, 5_000).open).toBe(false);
    expect(pacingSeconds(pacing)).toBe(5);
    expect(tickPacing(pacing, 4_000).open).toBe(false);
    expect(pacingSeconds(pacing)).toBe(1);

    expect(tickPacing(pacing, 1_000).open).toBe(true);
    expect(pacing.phase).toBe(PACING_PHASE.LIVE);
    expect(tickPacing(pacing, 16).open).toBe(false); // never opens twice
  });

  it('holds at zero while a horde is still on the map', () => {
    const pacing = createDuelPacing();
    expect(tickPacing(pacing, 20_000, { waveIdle: false }).open).toBe(false);
    expect(pacing.remainingMs).toBe(0);
    // The wave manager finishes its horde; the next step opens the wave.
    expect(tickPacing(pacing, 16, { waveIdle: true }).open).toBe(true);
  });
});

describe('the breather between waves', () => {
  it('books five seconds after every clear', () => {
    const pacing = createDuelPacing();
    tickPacing(pacing, DUEL_PREP_MS);
    breathe(pacing);
    expect(pacing.phase).toBe(PACING_PHASE.BREATHER);
    expect(pacing.remainingMs).toBe(DUEL_BREATHER_MS);
    expect(pacingLabel(pacing, { waveNumber: 2 })).toBe('NEXT WAVE · 5');
    expect(pacingHint(pacing)).toBe('SPEND YOUR GOLD');
  });

  it('opens the next wave when the breather runs out', () => {
    const pacing = createDuelPacing();
    breathe(pacing);
    expect(tickPacing(pacing, 4_999).open).toBe(false);
    expect(tickPacing(pacing, 1).open).toBe(true);
  });

  it('stops at the final wave', () => {
    const pacing = createDuelPacing();
    closePacing(pacing);
    expect(pacing.phase).toBe(PACING_PHASE.DONE);
    expect(tickPacing(pacing, 60_000).open).toBe(false);
    expect(pacingLabel(pacing)).toBe('FINAL WAVE');
  });
});

describe('wiring a scene to the clock', () => {
  it('opens a wave only after the prep window elapses', () => {
    const pacing = createDuelPacing();
    const waveManager = idleManager();
    const gameState = { isOver: () => false };

    expect(advanceDuelPacing({ pacing, waveManager, gameState, deltaMs: 9_983 })).toBe(false);
    expect(waveManager.startNextWave).not.toHaveBeenCalled();
    expect(advanceDuelPacing({ pacing, waveManager, gameState, deltaMs: 17 })).toBe(true);
  });

  it('never opens a wave after the run is over', () => {
    const pacing = createDuelPacing();
    const waveManager = idleManager();
    expect(
      advanceDuelPacing({ pacing, waveManager, gameState: { isOver: () => true }, deltaMs: 60_000 })
    ).toBe(false);
  });

  it('does nothing without a duel clock', () => {
    expect(
      advanceDuelPacing({ pacing: null, waveManager: idleManager(), gameState: {}, deltaMs: 16 })
    ).toBe(false);
  });

  it('lets a campaign start its own waves and a duel not', () => {
    expect(manualStartAllowed(null)).toBe(true);
    expect(manualStartAllowed(createDuelPacing())).toBe(false);
  });
});

describe('the clock and the real wave manager', () => {
  /** Two waves of two creeps each, spawned 100 ms apart. */
  const waves = [
    { name: 'First', groups: [{ type: 'grunt', count: 2, interval: 100, delay: 0 }] },
    { name: 'Second', groups: [{ type: 'grunt', count: 2, interval: 100, delay: 0 }] },
  ];

  /** One frame of the duel loop: clock, then manager, then the breather. */
  function makeLoop() {
    let alive = 0;
    const spawned = [];
    const manager = new WaveManager(waves, {
      onSpawn: (type) => {
        spawned.push(type);
        alive += 1;
      },
    });
    const pacing = createDuelPacing();
    const gameState = { isOver: () => false };
    const step = (deltaMs, { clear = true } = {}) => {
      const open = advanceDuelPacing({ pacing, waveManager: manager, gameState, deltaMs });
      if (open) manager.startNextWave();
      const event = manager.update(deltaMs, alive);
      if (clear) alive = 0; // the tower kills everything between frames
      if (event?.type === 'waveComplete') {
        if (event.isFinal) closePacing(pacing);
        else breathe(pacing);
      }
      return event;
    };
    return { manager, pacing, step, spawned, get alive() { return alive; } };
  }

  it('waits ten seconds before the first wave, then never asks for a tap', () => {
    const loop = makeLoop();
    for (let ms = 0; ms < 9_900; ms += 100) loop.step(100);
    expect(loop.manager.waveNumber).toBe(0);
    expect(loop.manager.state).toBe('idle');

    loop.step(100); // 10 000 ms and change
    expect(loop.manager.waveNumber).toBe(1);
    expect(loop.pacing.phase).toBe(PACING_PHASE.LIVE);
  });

  it('opens wave two by itself after the clear and the breather', () => {
    const loop = makeLoop();
    for (let ms = 0; ms < 10_000; ms += 100) loop.step(100);
    expect(loop.manager.waveNumber).toBe(1);

    // Finish spawning and clearing wave one.
    let event = null;
    for (let i = 0; i < 10 && !event; i += 1) event = loop.step(100);
    expect(event?.type).toBe('waveComplete');
    expect(loop.pacing.phase).toBe(PACING_PHASE.BREATHER);
    expect(loop.manager.waveNumber).toBe(1);

    // Four seconds of breather must not open anything.
    for (let ms = 0; ms < 4_000; ms += 100) loop.step(100);
    expect(loop.manager.waveNumber).toBe(1);

    // …and the fifth second does.
    for (let ms = 0; ms < 1_100; ms += 100) loop.step(100);
    expect(loop.manager.waveNumber).toBe(2);
  });

  it('stops the clock on the final wave', () => {
    const loop = makeLoop();
    const events = [];
    const run = (ms) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 100) {
        const event = loop.step(100);
        if (event) events.push(event);
      }
    };

    run(10_000);   // prep
    run(1_000);    // wave one spawns and clears
    expect(events.map((e) => e.type)).toEqual(['waveComplete']);
    run(5_100);    // breather, then wave two
    expect(loop.manager.waveNumber).toBe(2);
    run(2_000);    // wave two spawns and clears

    expect(events).toHaveLength(2);
    expect(events[1].isFinal).toBe(true);
    expect(loop.pacing.phase).toBe(PACING_PHASE.DONE);

    // Nothing else opens, ever.
    run(6_000);
    expect(loop.manager.waveNumber).toBe(2);
    expect(events).toHaveLength(2);
  });
});
