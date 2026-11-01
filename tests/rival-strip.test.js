// @vitest-environment jsdom
/**
 * rival-strip.test.js — the duel strip must be cheap to keep on screen.
 *
 * `GameScene` asks for a repaint on the frame loop. The strip answers only when
 * something it shows has actually moved: a style write per frame is layout work
 * for a readout that is fed at 2 Hz.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

function mountStrip() {
  document.body.innerHTML = `
    <div id="hud-rival" class="hud-panel">
      <span id="rival-name"></span>
      <span id="rival-wave"></span>
      <span id="rival-waves"></span>
      <span id="rival-score"></span>
      <div id="rival-core-fill"></div>
      <span id="rival-state"></span>
    </div>`;
}

/** The HUD's DOM methods without building the whole panel. */
const hud = Object.create(HUD.prototype);

const state = {
  name: 'kai',
  wave: 3,
  totalWaves: 8,
  score: 640,
  coreHp: 19,
  maxCoreHp: 25,
  outcome: null,
};

beforeEach(() => {
  mountStrip();
  hud.rivalSignature = null;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rival strip', () => {
  it('paints the rival once, then stays quiet while nothing changes', () => {
    hud.setRivalState(state);
    expect(document.querySelector('#rival-name').textContent).toBe('KAI');
    expect(document.querySelector('#rival-wave').textContent).toBe('3');
    expect(document.querySelector('#rival-score').textContent).toBe('640');
    expect(document.querySelector('#rival-state').textContent).toBe('LIVE');
    expect(document.querySelector('#rival-core-fill').style.width).toBe('76%');

    // If a repeat call touched the DOM, this manual edit would be overwritten.
    document.querySelector('#rival-wave').textContent = 'X';
    for (let i = 0; i < 30; i++) hud.setRivalState({ ...state });
    expect(document.querySelector('#rival-wave').textContent).toBe('X');
  });

  it('paints again the moment a number moves', () => {
    hud.setRivalState(state);
    document.querySelector('#rival-wave').textContent = 'X';
    hud.setRivalState({ ...state, wave: 4, score: 900 });
    expect(document.querySelector('#rival-wave').textContent).toBe('4');
    expect(document.querySelector('#rival-score').textContent).toBe('900');
  });

  it('reacts to a knockout even when the numbers are frozen', () => {
    hud.setRivalState(state);
    hud.setRivalState({ ...state, coreHp: 0, outcome: 'ko' });
    expect(document.querySelector('#rival-state').textContent).toBe('KNOCKED OUT');
    expect(document.querySelector('#hud-rival').classList.contains('rival-down')).toBe(true);
    expect(document.querySelector('#rival-core-fill').style.width).toBe('0%');
  });

  it('hides cleanly and paints from scratch when it comes back', () => {
    hud.setRivalState(state);
    hud.setRivalState(null);
    const strip = document.querySelector('#hud-rival');
    expect(strip.classList.contains('hidden')).toBe(true);
    expect(hud.rivalSignature).toBe(null);

    hud.setRivalState(state);
    expect(strip.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#rival-name').textContent).toBe('KAI');
  });
});
