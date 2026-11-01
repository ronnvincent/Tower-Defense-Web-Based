// @vitest-environment jsdom
/**
 * duel-wave-button.test.js — the wave control while the arena owns the clock.
 *
 * A duel opens its own waves, so the button stops being a button and becomes the
 * countdown. It must still be *visible* (the player needs the number) but it must
 * not be tappable, and a campaign run must be completely unaffected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HUD } from '../src/ui/HUD.js';

let hud;

function base(overrides = {}) {
  return {
    levelName: 'Mirror Arena',
    endless: false,
    baseHealth: 25,
    maxBaseHealth: 25,
    coins: 120,
    score: 0,
    waveNumber: 1,
    totalWaves: 8,
    enemiesRemaining: 0,
    canStartWave: true,
    isSpawning: false,
    isPaused: false,
    earlyCall: null,
    nextWave: null,
    bestWave: 0,
    schedule: null,
    ...overrides,
  };
}

const button = () => document.getElementById('btn-start-wave');
const label = () => button()?.querySelector('.btn-text')?.textContent;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="hud-container"></div>
    <div id="hud-bottom-dock"><div id="dock-tabs"></div><div id="dock-cards-container"></div></div>`;
  hud = new HUD(document.getElementById('hud-container'), {});
});

afterEach(() => {
  hud?.destroy?.();
  document.body.innerHTML = '';
});

describe('the wave control', () => {
  it('is a real button in a campaign', () => {
    hud.update(base());
    expect(button()).toBeTruthy();
    expect(button().disabled).toBe(false);
    expect(button().classList.contains('game-btn-scheduled')).toBe(false);
    expect(label()).toBe('START WAVE');
  });

  it('becomes a countdown during the duel prep window', () => {
    hud.update(
      base({
        canStartWave: false,
        schedule: { phase: 'prep', seconds: 8, label: 'PREPARE · 8', hint: 'PLACE YOUR DEFENCES' },
      })
    );
    expect(button().disabled).toBe(true);
    expect(button().classList.contains('game-btn-scheduled')).toBe(true);
    expect(label()).toBe('PREPARE · 8');
  });

  it('counts the breather between duel waves', () => {
    hud.update(
      base({
        canStartWave: false,
        schedule: { phase: 'breather', seconds: 4, label: 'NEXT WAVE · 4', hint: 'SPEND YOUR GOLD' },
      })
    );
    expect(label()).toBe('NEXT WAVE · 4');
    expect(button().classList.contains('game-btn-pulse')).toBe(false);
  });

  it('goes back to a button when the duel ends', () => {
    hud.update(
      base({ canStartWave: false, schedule: { phase: 'prep', seconds: 3, label: 'PREPARE · 3', hint: '' } })
    );
    expect(button().classList.contains('game-btn-scheduled')).toBe(true);
    hud.update(base());
    expect(button().classList.contains('game-btn-scheduled')).toBe(false);
    expect(button().disabled).toBe(false);
  });

  it('never offers an early call in a duel', () => {
    hud.update(
      base({
        earlyCall: null,
        schedule: { phase: 'live', seconds: 0, label: 'WAVE 2 · AUTO', hint: '' },
      })
    );
    expect(button().classList.contains('game-btn-early')).toBe(false);
    expect(label()).toBe('WAVE 2 · AUTO');
  });
});
