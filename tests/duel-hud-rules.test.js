// @vitest-environment jsdom
/**
 * duel-hud-rules.test.js — what a duel's HUD must and must not show.
 *
 * A duel has no powerups and no blessings (the rival cannot answer either), and
 * it carries three shared contracts. Both are DOM facts, so they are tested in
 * the DOM: the rail and the blessings button disappear, the contract panel
 * paints only when something moved, and the result card lists what paid.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HUD } from '../src/ui/HUD.js';
import { DuelResultUI } from '../src/ui/DuelResultUI.js';

let hud;
let result;

beforeEach(() => {
  document.body.innerHTML = `<div id="app"><div id="hud-container"></div></div>`;
  hud = new HUD(document.getElementById('hud-container'), {});
  result = new DuelResultUI(document.getElementById('app'), {});
});

afterEach(() => {
  hud?.destroy?.();
  result?.hide();
  document.body.innerHTML = '';
});

describe('duel rules on the HUD', () => {
  it('hides the powerup rail and the blessings button', () => {
    const container = document.getElementById('hud-container');
    expect(document.getElementById('powerup-rail')).toBeTruthy();
    expect(document.getElementById('btn-blessings')).toBeTruthy();

    hud.setDuelRules(true);
    expect(container.classList.contains('duel-rules')).toBe(true);

    hud.setDuelRules(false);
    expect(container.classList.contains('duel-rules')).toBe(false);
  });
});

describe('the contract panel', () => {
  const rows = [
    { id: 'slayer', name: 'SLAYER', goal: 'Defeat 70 creeps', reward: 150, current: 12, target: 70, done: false },
    { id: 'bounty', name: 'BOUNTY HUNTER', goal: 'Clear both bounty waves', reward: 200, current: 2, target: 2, done: true },
  ];

  it('lists progress and marks the finished ones', () => {
    hud.setContracts(rows);
    const box = document.getElementById('pause-contracts');
    expect(box.classList.contains('hidden')).toBe(false);
    expect(box.textContent).toContain('SLAYER');
    expect(box.textContent).toContain('12/70');
    expect(box.textContent).toContain('+200');
    expect(box.querySelectorAll('.contract-row')).toHaveLength(2);
    expect(box.querySelectorAll('.contract-row.is-done')).toHaveLength(1);
  });

  it('does not repaint when nothing moved', () => {
    hud.setContracts(rows);
    const box = document.getElementById('pause-contracts');
    const probe = document.createElement('i');
    probe.dataset.probe = 'kept';
    box.appendChild(probe);

    hud.setContracts(rows);
    // A repaint would have replaced the children; the probe proves it did not.
    expect(box.querySelector('[data-probe]')).toBeTruthy();

    hud.setContracts([{ ...rows[0], current: 20 }]);
    expect(box.querySelector('[data-probe]')).toBeNull();
    expect(box.textContent).toContain('20/70');
  });

  it('hides itself outside a duel', () => {
    hud.setContracts(rows);
    hud.setContracts([]);
    expect(document.getElementById('pause-contracts').classList.contains('hidden')).toBe(true);
  });
});

describe('the result card', () => {
  const report = {
    outcome: 'cleared',
    score: 1240,
    coreHp: 18,
    waves: 10,
    totalWaves: 10,
    timeMs: 240_000,
    contracts: [
      { id: 'slayer', name: 'SLAYER', goal: 'Defeat 70 creeps', reward: 150, current: 82, target: 70, done: true },
      { id: 'unbroken', name: 'UNBROKEN', goal: 'Finish with 15+ core HP', reward: 150, current: 18, target: 15, done: true },
      { id: 'chain', name: 'CHAIN REACTION', goal: 'Reach a 12-kill chain', reward: 180, current: 9, target: 12, done: false },
    ],
    contractBonus: 300,
  };

  it('shows which contracts paid and which did not', () => {
    result.show(report);
    const box = document.getElementById('duel-contracts');
    expect(box.classList.contains('hidden')).toBe(false);
    expect(box.querySelectorAll('.duel-contract')).toHaveLength(3);
    expect(box.querySelectorAll('.duel-contract.is-done')).toHaveLength(2);
    expect(box.textContent).toContain('+150');
    expect(box.textContent).toContain('9/12');
  });

  it('stays out of the way when a duel has no contracts', () => {
    result.show({ ...report, contracts: null });
    expect(document.getElementById('duel-contracts').classList.contains('hidden')).toBe(true);
  });

  it('clears them when the card is dismissed', () => {
    result.show(report);
    result.hide();
    expect(document.getElementById('duel-contracts').classList.contains('hidden')).toBe(true);
  });
});
