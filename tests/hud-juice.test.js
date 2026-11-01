// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { COMBO_WINDOW_MS } from '../src/systems/ComboMeter.js';

/**
 * Sprint-1 HUD surface: the wave-preview scout strip, the kill-chain chip and
 * the two-mode wave button (START WAVE / CALL EARLY).
 *
 * These are the parts the player reads while fighting, so they are pinned in
 * the DOM rather than only through the systems that feed them.
 */

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  const container = document.getElementById('hud-container');
  return new HUD(container, callbacks);
}

const STATE = {
  baseHealth: 20,
  maxBaseHealth: 20,
  coins: 240,
  score: 0,
  waveNumber: 1,
  totalWaves: 6,
  enemiesRemaining: 10,
  canStartWave: true,
  isSpawning: false,
  isPaused: false,
};

const PREVIEW = {
  number: 2,
  name: 'Swift Infiltration',
  boss: false,
  total: 18,
  groups: [
    { type: 'grunt', count: 8 },
    { type: 'runner', count: 10 },
  ],
};

describe('HUD: wave button modes', () => {
  let hud;
  beforeEach(() => {
    vi.useFakeTimers();
    hud = mountHud({ onStartWave: vi.fn(), onCallWaveEarly: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const label = () => document.querySelector('#btn-start-wave .btn-text').textContent;

  it('reads START WAVE in the prep phase', () => {
    hud.update({ ...STATE });
    expect(label()).toBe('START WAVE');
    expect(document.getElementById('btn-start-wave').disabled).toBe(false);
  });

  it('switches to CALL EARLY with the gold bonus while the horde is alive', () => {
    hud.update({ ...STATE, canStartWave: false, earlyCall: { available: true, bonus: 18, wave: 2, alive: 4 } });
    expect(label()).toBe('CALL EARLY · +18g');
    expect(document.getElementById('btn-start-wave').disabled).toBe(false);
    expect(document.getElementById('btn-start-wave').title).toContain('+18 gold');
    expect(document.getElementById('btn-start-wave').classList.contains('game-btn-early')).toBe(true);
  });

  it('routes the tap to the early-call callback when it is armed', () => {
    const onCallWaveEarly = vi.fn();
    const onStartWave = vi.fn();
    hud = mountHud({ onStartWave, onCallWaveEarly });
    hud.update({ ...STATE, canStartWave: false, earlyCall: { available: true, bonus: 12, wave: 2, alive: 2 } });

    document.getElementById('btn-start-wave').click();
    expect(onCallWaveEarly).toHaveBeenCalledTimes(1);
    expect(onStartWave).not.toHaveBeenCalled();

    hud.update({ ...STATE, earlyCall: null });
    document.getElementById('btn-start-wave').click();
    expect(onStartWave).toHaveBeenCalledTimes(1);
    expect(onCallWaveEarly).toHaveBeenCalledTimes(1);
  });

  it('is disabled and labelled IN PROGRESS mid-wave', () => {
    hud.update({ ...STATE, canStartWave: false, earlyCall: null, isSpawning: false });
    expect(label()).toBe('IN PROGRESS');
    expect(document.getElementById('btn-start-wave').disabled).toBe(true);
  });
});

describe('HUD: wave preview', () => {
  let hud;
  beforeEach(() => {
    vi.useFakeTimers();
    hud = mountHud();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const preview = () => document.getElementById('wave-preview');

  it('hides when there is nothing to scout', () => {
    hud.update({ ...STATE, canStartWave: false, isSpawning: true, nextWave: null });
    expect(preview().classList.contains('hidden')).toBe(true);
  });

  it('lists the next wave composition in the prep phase', () => {
    hud.update({ ...STATE, nextWave: PREVIEW });
    const el = preview();
    expect(el.classList.contains('hidden')).toBe(false);
    expect(el.textContent).toContain('NEXT IN 2');
    expect(el.textContent).toContain('8');
    expect(el.textContent).toContain('10');
    expect(el.querySelectorAll('.wave-preview-chip')).toHaveLength(2);
  });

  it('flags a boss wave and does not duplicate the BOSS tag per chip group', () => {
    hud.update({ ...STATE, nextWave: { ...PREVIEW, boss: true, groups: [{ type: 'colossus', count: 1 }] } });
    const el = preview();
    expect(el.textContent).toContain('BOSS');
    expect(el.querySelectorAll('.wave-preview-chip.boss')).toHaveLength(1);
  });

  it('is visible during the early-call window even though the button is not in start mode', () => {
    hud.update({
      ...STATE,
      canStartWave: false,
      earlyCall: { available: true, bonus: 9, wave: 2, alive: 1 },
      nextWave: PREVIEW,
    });
    expect(preview().classList.contains('hidden')).toBe(false);
  });

  it('reuses the DOM when the same wave is re-reported', () => {
    hud.update({ ...STATE, nextWave: PREVIEW });
    const firstChild = preview().firstElementChild;
    hud.update({ ...STATE, nextWave: { ...PREVIEW } });
    expect(preview().firstElementChild).toBe(firstChild);
  });
});

describe('HUD: combo chip', () => {
  let hud;
  beforeEach(() => {
    vi.useFakeTimers();
    hud = mountHud();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const chip = () => document.getElementById('combo-chip');

  it('is hidden until a chain starts', () => {
    expect(chip().classList.contains('hidden')).toBe(true);
  });

  it('shows the multiplier, chain length and the bonus it just paid', () => {
    hud.showCombo({ chain: 6, multiplier: 1.5, tier: 2, bonus: 4 });
    expect(chip().classList.contains('hidden')).toBe(false);
    expect(document.getElementById('combo-mult').textContent).toBe('×1.5');
    expect(document.getElementById('combo-chain').textContent).toContain('6 KILL CHAIN');
    expect(document.getElementById('combo-chain').textContent).toContain('+4g');
    expect(chip().dataset.tier).toBe('2');
  });

  it('drains the timer bar as the window runs out', () => {
    hud.showCombo({ chain: 3, multiplier: 1.25, tier: 1, bonus: 2 });
    hud.updateComboTimer(COMBO_WINDOW_MS / 2);
    expect(document.getElementById('combo-bar-fill').style.transform).toBe('scaleX(0.5)');
    hud.updateComboTimer(0);
    expect(document.getElementById('combo-bar-fill').style.transform).toBe('scaleX(0)');
  });

  it('hides on demand', () => {
    hud.showCombo({ chain: 3, multiplier: 1.25, tier: 1, bonus: 2 });
    hud.hideCombo();
    expect(chip().classList.contains('hidden')).toBe(true);
  });
});
