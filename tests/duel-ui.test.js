// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PvpLobbyUI } from '../src/ui/PvpLobbyUI.js';
import { DuelResultUI } from '../src/ui/DuelResultUI.js';
import { applyIntent, createLobbyState, lobbyView } from '../src/net/LobbyState.js';
import { OP } from '../src/net/lobbyProtocol.js';

/** A two-player lobby in whatever state a test needs. */
function roomState({ ready = false, live = false, results = null } = {}) {
  const state = createLobbyState({ roomCode: 'ABCDE', selfId: 'host', name: 'Ronn', isHost: true, seed: 3 });
  applyIntent(state, { clientId: 'guest', op: OP.JOIN, payload: { name: 'Kai' } }, 10);
  if (ready) {
    applyIntent(state, { clientId: 'host', op: OP.READY, payload: { ready: true } }, 20);
    applyIntent(state, { clientId: 'guest', op: OP.READY, payload: { ready: true } }, 21);
  }
  if (live) {
    applyIntent(state, { clientId: 'host', op: OP.START }, 30);
    state.status = 'live';
    state.match.status = 'live';
  }
  if (results) {
    for (const report of results) applyIntent(state, { clientId: report.clientId, op: OP.RESULT, payload: report }, 40);
  }
  return state;
}

let container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  document.body.innerHTML = '';
});

describe('duel lobby panel', () => {
  it('mounts hidden and opens on the entry screen', () => {
    const ui = new PvpLobbyUI(container, {});
    const el = document.querySelector('#pvp-lobby');
    expect(el).toBeTruthy();
    expect(el.classList.contains('hidden')).toBe(true);
    ui.show();
    expect(el.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#pvp-entry').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#pvp-room').classList.contains('hidden')).toBe(true);
    ui.destroy();
  });

  it('renders three arena cards, each a radio', () => {
    const ui = new PvpLobbyUI(container, {});
    const cards = document.querySelectorAll('#pvp-arenas .pvp-arena');
    expect(cards).toHaveLength(3);
    expect([...cards].every((card) => card.getAttribute('role') === 'radio')).toBe(true);
    expect([...cards].map((card) => card.dataset.arena)).toEqual([
      'cinder-crown',
      'frostspine',
      'dust-meridian',
    ]);
    ui.destroy();
  });

  it('paints both seats and the host controls from room state', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    ui.render(lobbyView(roomState({ ready: true })));

    expect(document.querySelector('#pvp-code-value').textContent).toBe('ABCDE');
    expect(document.querySelector('#pvp-name-p1').textContent).toBe('RONN');
    expect(document.querySelector('#pvp-name-p2').textContent).toBe('KAI');
    expect(document.querySelector('#pvp-state-p1').textContent).toBe('READY');
    expect(document.querySelector('#pvp-state-p2').textContent).toBe('READY');
    expect(document.querySelector('#pvp-seat-p1').classList.contains('is-me')).toBe(true);
    expect(document.querySelector('#pvp-start').disabled).toBe(false);
    expect(document.querySelector('#pvp-ready').textContent).toBe('CANCEL READY');
    ui.destroy();
  });

  it('keeps start disabled until the rival is ready', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    ui.render(lobbyView(roomState({ ready: false })));
    expect(document.querySelector('#pvp-start').disabled).toBe(true);
    expect(document.querySelector('#pvp-state-p2').textContent).toBe('NOT READY');
    ui.destroy();
  });

  it('shows live progress instead of readiness mid-match', () => {
    const state = roomState({ ready: true, live: true });
    applyIntent(state, { clientId: 'guest', op: OP.PROGRESS, payload: { wave: 3, totalWaves: 8, score: 640, coreHp: 21 } }, 50);
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    ui.render(lobbyView(state));
    expect(document.querySelector('#pvp-state-p2').textContent).toBe('WAVE 3/8 · 640 PTS');
    ui.destroy();
  });

  it('locks the arena picker for the challenger', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    const view = lobbyView(roomState({ ready: false }));
    ui.render({ ...view, isHost: false });
    const cards = [...document.querySelectorAll('.pvp-arena')];
    expect(cards.every((card) => card.disabled)).toBe(true);
    ui.destroy();
  });

  it('highlights the selected arena', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    const state = roomState();
    applyIntent(state, { clientId: 'host', op: OP.ARENA, payload: { arenaId: 'frostspine' } }, 25);
    ui.render(lobbyView(state));
    const selected = document.querySelector('.pvp-arena.selected');
    expect(selected?.dataset.arena).toBe('frostspine');
    expect(selected?.getAttribute('aria-checked')).toBe('true');
    ui.destroy();
  });
});

describe('duel result card', () => {
  const waitingResult = { outcome: 'cleared', score: 1820, coreHp: 19, waves: 8, timeMs: 240000 };

  it('shows the waiting state while the rival is still fighting', () => {
    const ui = new DuelResultUI(container, {});
    ui.show(waitingResult);
    const el = document.querySelector('#duel-result');
    expect(el.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#duel-result-title').textContent).toBe('Sector Cleared');
    expect(document.querySelector('#duel-waiting').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#duel-rematch').disabled).toBe(true);
    expect(document.querySelector('.duel-row-score').textContent).toContain('1,820');
    ui.hide();
  });

  it('names a points win and marks the winner row', () => {
    const state = roomState({
      ready: true,
      live: true,
      results: [
        { clientId: 'host', outcome: 'cleared', score: 2000, coreHp: 20, waves: 8, timeMs: 200000 },
        { clientId: 'guest', outcome: 'cleared', score: 1500, coreHp: 14, waves: 8, timeMs: 210000 },
      ],
    });
    const final = roomState({
      ready: true,
      live: true,
      results: [
        { clientId: 'host', outcome: 'cleared', score: 2000, coreHp: 20, waves: 8, timeMs: 200000 },
        { clientId: 'guest', outcome: 'cleared', score: 1500, coreHp: 14, waves: 8, timeMs: 210000 },
      ],
    });
    const ui = new DuelResultUI(container, {});
    ui.showFinal({
      resolved: { winner: 'p1', loser: 'p2', reason: 'points', draw: false },
      view: lobbyView(final),
      selfSeat: 'p1',
    });

    expect(document.querySelector('#duel-result-title').textContent).toBe('Victory');
    expect(document.querySelector('#duel-result-line').textContent).toBe('Ronn won on points.');
    const rows = [...document.querySelectorAll('.duel-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('is-winner')).toBe(true);
    expect(rows[0].textContent).toContain('YOU');
    expect(rows[1].classList.contains('is-winner')).toBe(false);
    expect(document.querySelector('#duel-rematch').classList.contains('hidden')).toBe(false);
    expect(state.status).toBe('over');
  });

  it('reads as a defeat when the rival wins, and hides rematch from a guest', () => {
    const final = roomState({
      ready: true,
      live: true,
      results: [{ clientId: 'host', outcome: 'ko', score: 400, coreHp: 0, waves: 3, timeMs: 90000 }],
    });
    const ui = new DuelResultUI(container, {});
    ui.showFinal({
      resolved: { winner: 'p2', loser: 'p1', reason: 'knockout', draw: false },
      view: { ...lobbyView(final), isHost: false },
      selfSeat: 'p1',
    });
    expect(document.querySelector('#duel-result-title').textContent).toBe('Defeat');
    expect(document.querySelector('#duel-result-line').textContent).toBe('Kai won by knockout.');
    expect(document.querySelector('#duel-rematch').classList.contains('hidden')).toBe(true);
    // The guest cannot restart the room, but a winner can still ask for one.
    expect(document.querySelector('#duel-rematch-ask').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.duel-row').textContent).toContain('CORE DOWN');
  });

  it('relays a guest rematch request to the host card', () => {
    const final = roomState({
      ready: true,
      live: true,
      results: [{ clientId: 'host', outcome: 'ko', score: 400, coreHp: 0, waves: 3, timeMs: 90000 }],
    });
    const ui = new DuelResultUI(container, {});
    ui.showFinal({
      resolved: { winner: 'p2', loser: 'p1', reason: 'knockout', draw: false },
      view: { ...lobbyView(final), isHost: true, selfSeat: 'p1' },
      selfSeat: 'p1',
    });
    const note = document.querySelector('#duel-rematch-note');
    expect(note.classList.contains('hidden')).toBe(true);
    ui.showRematchRequest({ name: 'Kai' });
    expect(note.classList.contains('hidden')).toBe(false);
    expect(note.textContent).toContain('Kai');
    expect(document.querySelector('#duel-rematch').classList.contains('pulse')).toBe(true);
    expect(document.querySelector('#duel-rematch-ask').classList.contains('hidden')).toBe(true);
  });

  it('escapes a hostile player name', () => {
    const state = createLobbyState({ roomCode: 'ABCDE', selfId: 'host', name: 'Ronn', isHost: true });
    applyIntent(state, { clientId: 'evil', op: OP.JOIN, payload: { name: '<img src=x>' } }, 5);
    const final = roomState({ ready: true, live: true });
    const ui = new DuelResultUI(container, {});
    ui.showFinal({
      resolved: { winner: 'p1', reason: 'points', draw: false },
      view: { ...lobbyView(state), results: [{ id: 'p2', name: '<img src=x>', result: null }], isHost: true },
      selfSeat: 'p1',
    });
    expect(final.status).toBe('live');
    expect(document.querySelectorAll('.duel-row-name img')).toHaveLength(0);
    expect(document.querySelector('.duel-row-name').textContent).toContain('<img src=x>');
  });
});
