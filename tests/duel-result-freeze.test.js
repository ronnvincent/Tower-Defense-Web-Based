// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DuelResultUI } from '../src/ui/DuelResultUI.js';

/**
 * End-of-duel card contract.
 *
 * The freeze both players reported came from one ordering bug: the host
 * resolves its own report **synchronously**, so the room's verdict (`showFinal`)
 * was painted first and then `show(report)` — the "your half is settled" card —
 * painted over it. A decided match ended up on screen as "waiting for the room",
 * forever, with a paused board behind it.
 *
 * These tests pin the ordering rules:
 *   1. a verdict is never overwritten by the half-time card,
 *   2. a knockout reads as a defeat immediately (it is decisive on its own),
 *   3. a room that never answers says so instead of waiting in silence.
 */

const view = (overrides = {}) => ({
  isHost: true,
  results: [
    { id: 'p1', name: 'Ronn', result: { outcome: 'cleared', score: 2000, coreHp: 20, waves: 10 } },
    { id: 'p2', name: 'Kai', result: { outcome: 'ko', score: 900, coreHp: 0, waves: 4 } },
  ],
  ...overrides,
});

let container;
let ui;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  ui = new DuelResultUI(container, {});
});

afterEach(() => {
  ui?.hide();
  vi.useRealTimers();
});

const $ = (id) => document.querySelector(`#${id}`);

describe('duel result card ordering', () => {
  it('never lets the half-time card overwrite a decided match', () => {
    ui.showFinal({
      resolved: { winner: 'p1', loser: 'p2', reason: 'knockout', draw: false },
      view: view(),
      selfSeat: 'p1',
    });
    expect($('duel-result-title').textContent).toBe('Victory');
    expect($('duel-rematch').disabled).toBe(false);

    // This is the exact sequence GameScene used to produce: report → verdict →
    // half-time card. The verdict must survive.
    ui.show({ outcome: 'cleared', score: 2000, coreHp: 20, waves: 10, contracts: [] });

    expect($('duel-result-title').textContent).toBe('Victory');
    expect($('duel-result-line').textContent).toBe('Ronn won by knockout.');
    expect($('duel-waiting').classList.contains('hidden')).toBe(true);
    expect($('duel-rematch').disabled).toBe(false);
  });

  it('keeps a defeat when the losing seat finishes last', () => {
    ui.showFinal({
      resolved: { winner: 'p2', loser: 'p1', reason: 'knockout', draw: false },
      view: view({ isHost: false }),
      selfSeat: 'p1',
    });
    expect($('duel-result-title').textContent).toBe('Defeat');
    ui.show({ outcome: 'ko', score: 900, coreHp: 0, waves: 4, contracts: [] });
    expect($('duel-result-title').textContent).toBe('Defeat');
    expect($('duel-waiting').classList.contains('hidden')).toBe(true);
  });

  it('treats a knockout as a verdict, not a wait', () => {
    ui.show({ outcome: 'ko', score: 640, coreHp: 0, waves: 3, contracts: [] });
    expect(document.querySelector('#duel-result').classList.contains('hidden')).toBe(false);
    expect($('duel-result-title').textContent).toBe('Defeat');
    expect($('duel-result-title').className).toContain('is-loss');
    expect($('duel-result-line').textContent).toContain('knockout');
    // The player is told the truth: this half is already lost.
    expect($('duel-waiting').textContent).toContain('already lost');
    expect($('duel-waiting').classList.contains('hidden')).toBe(false);
    // Rematch still waits on the room, but leaving is never blocked.
    expect($('duel-rematch').disabled).toBe(true);
  });

  it('still waits when only the horde was cleared', () => {
    ui.show({ outcome: 'cleared', score: 1820, coreHp: 19, waves: 10, contracts: [] });
    expect($('duel-result-title').textContent).toBe('Sector Cleared');
    expect($('duel-result-title').className).toContain('is-win');
    expect($('duel-result-line').textContent).toContain('waits on your rival');
  });

  it('stops pretending when the room never answers', () => {
    vi.useFakeTimers();
    ui.show({ outcome: 'ko', score: 640, coreHp: 0, waves: 3, contracts: [] });
    expect($('duel-waiting').textContent).toContain('Waiting for the room');

    vi.advanceTimersByTime(9000);

    expect($('duel-waiting').textContent).toContain('No answer from the room');
    expect($('duel-rematch').disabled).toBe(true);
  });

  it('cancels the watchdog once the room decides', () => {
    vi.useFakeTimers();
    ui.show({ outcome: 'ko', score: 640, coreHp: 0, waves: 3, contracts: [] });
    ui.showFinal({
      resolved: { winner: 'p2', loser: 'p1', reason: 'knockout', draw: false },
      view: view({ isHost: false }),
      selfSeat: 'p1',
    });
    vi.advanceTimersByTime(20_000);
    expect($('duel-waiting').classList.contains('hidden')).toBe(true);
    expect($('duel-result-line').textContent).toBe('Kai won by knockout.');
  });

  it('renders the verdict twice without changing it', () => {
    const payload = {
      resolved: { winner: 'p1', loser: 'p2', reason: 'points', draw: false },
      view: view({
        results: [
          { id: 'p1', name: 'Ronn', result: { outcome: 'cleared', score: 2000, coreHp: 20, waves: 10 } },
          { id: 'p2', name: 'Kai', result: { outcome: 'cleared', score: 1500, coreHp: 9, waves: 10 } },
        ],
      }),
      selfSeat: 'p1',
    };
    ui.showFinal(payload);
    const first = $('duel-result-line').textContent;
    ui.showFinal(payload);
    expect($('duel-result-line').textContent).toBe(first);
    expect($('duel-result-title').textContent).toBe('Victory');
  });

  it('starts a clean card again after it is dismissed', () => {
    ui.show({ outcome: 'ko', score: 640, coreHp: 0, waves: 3, contracts: [] });
    ui.hide();
    expect($('duel-result').classList.contains('hidden')).toBe(true);
    // hide() drops `final`, so the next match may report normally.
    ui.show({ outcome: 'cleared', score: 300, coreHp: 22, waves: 10, contracts: [] });
    expect($('duel-result-title').textContent).toBe('Sector Cleared');
  });
});
