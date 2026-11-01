// @vitest-environment jsdom
/**
 * duel-finish.test.js — what a player sees the moment a duel is decided.
 *
 * The reported bug: one phone lost its core and *both* phones stopped
 * responding — no verdict, no way back. The chain that has to work is
 *
 *   seat reports a knockout → room resolves → lobby hears 'over' → the board
 *   stops → the result card is on screen and its buttons are live
 *
 * Each test drives **one** device's UI (as a real phone does — one lobby, one
 * result card) while the rival is a headless room, so the assertions describe
 * what that player actually sees.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PvpLobbyUI } from '../src/ui/PvpLobbyUI.js';
import { DuelResultUI } from '../src/ui/DuelResultUI.js';
import { PvpRoom } from '../src/net/PvpRoom.js';
import { COUNTDOWN_MS } from '../src/net/LobbyState.js';

/** Resolve once `predicate()` is true; rejects instead of hanging forever. */
function waitFor(predicate, label = 'condition', timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      let ok = false;
      try {
        ok = predicate();
      } catch {
        ok = false;
      }
      if (ok) return resolve();
      if (Date.now() - started > timeout) return reject(new Error(`${label} never happened`));
      setTimeout(tick, 15);
    };
    tick();
  });
}

let container;
let uiLobby;
let room;
let result;
let pauseBattle;
let stopDuelScene;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  result = new DuelResultUI(container, {});
  window.gameDuelResult = result;
  pauseBattle = vi.fn();
  stopDuelScene = vi.fn();
  window.gameFlow = { pauseBattle, stopDuelScene };
});

afterEach(() => {
  uiLobby?.destroy();
  uiLobby = null;
  room?.leave?.();
  room = null;
  result?.hide();
  delete window.gameDuelResult;
  delete window.gameFlow;
  delete window.gamePvp;
});

/**
 * Seat two rooms and run them to `live`. One side (`withLobby`) owns the real
 * UI; the other is headless, the way the rival's phone is.
 */
async function seatedDuel({ withLobby }) {
  const uiRoom = withLobby
    ? (() => {
        uiLobby = new PvpLobbyUI(container, {});
        uiLobby.linkMode = 'local';
        return uiLobby.ensureRoom();
      })()
    : new PvpRoom({ mode: 'local' });
  const rivalRoom = new PvpRoom({ mode: 'local' });

  const host = withLobby ? uiRoom : rivalRoom;
  const guest = withLobby ? rivalRoom : uiRoom;

  const hosted = await host.host({ name: withLobby ? 'Ronn' : 'Kai' });
  await guest.join({ code: hosted.roomCode, name: withLobby ? 'Kai' : 'Ronn' });
  await waitFor(() => host.view.connected === 2 && guest.view.connected === 2, 'both seats');
  host.setReady(true);
  guest.setReady(true);
  await waitFor(() => host.view.canStart, 'host can start');
  host.start();
  await waitFor(() => guest.state.status === 'countdown', 'guest countdown');

  // Skip the pre-match countdown without waiting three real seconds.
  host.now = () => Date.now() + COUNTDOWN_MS + 10;
  host.tick();
  await waitFor(() => guest.state.status === 'live', 'live');
  host.now = () => Date.now();

  return { uiRoom, rivalRoom };
}

const KO = { outcome: 'ko', score: 120, coreHp: 0, waves: 2, timeMs: 41_000 };
const CLEARED = { outcome: 'cleared', score: 640, coreHp: 18, waves: 8, timeMs: 320_000 };

describe('a decided duel', () => {
  it('shows the winner their verdict the moment the rival is knocked out', async () => {
    const { uiRoom, rivalRoom } = await seatedDuel({ withLobby: true });
    expect(uiRoom.seat).toBe('p1');

    rivalRoom.reportSeat(KO);

    await waitFor(() => result.isVisible, 'result card visible');
    expect(result.$('duel-result-title').textContent).toBe('Victory');
    expect(result.$('duel-result-line').textContent).toContain('won by knockout');
    // The board is stopped — a paused arena is fine, a paused arena with no way
    // out is the bug this test exists for.
    expect(pauseBattle).toHaveBeenCalledTimes(1);
    expect(result.$('duel-rematch').disabled).toBe(false);
  });

  it('tells the loser they lost, in the same beat', async () => {
    const { uiRoom } = await seatedDuel({ withLobby: true });
    // This seat is the challenger, and it is the one that falls.
    uiRoom.reportSeat(KO);

    await waitFor(() => result.isVisible, 'result card visible');
    expect(result.$('duel-result-title').textContent).toBe('Defeat');
    expect(pauseBattle).toHaveBeenCalledTimes(1);
  });

  it('keeps the verdict when this seat finishes a beat later', async () => {
    // The freeze exactly as it shipped: `finishDuel` reported to the room
    // *before* painting its own card. The host resolves its own report
    // synchronously, so `showFinal` drew "Defeat" and then the half-time card
    // painted over it — a decided match frozen on "waiting for your rival".
    const { uiRoom } = await seatedDuel({ withLobby: true });
    uiRoom.reportSeat(KO);
    await waitFor(() => result.isVisible, 'verdict');

    result.show({ ...KO, totalWaves: 10, contracts: [] });

    expect(result.$('duel-result-title').textContent).toBe('Defeat');
    expect(result.$('duel-waiting').classList.contains('hidden')).toBe(true);
    expect(result.$('duel-rematch').disabled).toBe(false);
    for (const id of ['duel-lobby', 'duel-menu']) expect(result.$(id).disabled, id).toBe(false);
  });

  it('ends the match on a core-down heartbeat if the result packet is lost', async () => {
    // The last-resort backstop: the loser's RESULT frame never arrives, but the
    // heartbeat already said `coreHp: 0`. The room must still close, or the
    // winner waits forever on a card that can never resolve.
    const { uiRoom, rivalRoom } = await seatedDuel({ withLobby: true });
    expect(uiRoom.state.status).toBe('live');

    rivalRoom.reportProgress({ wave: 4, totalWaves: 10, score: 900, coreHp: 0, alive: false });

    await waitFor(() => result.isVisible, 'verdict from the heartbeat');
    expect(result.$('duel-result-title').textContent).toBe('Victory');
    expect(pauseBattle).toHaveBeenCalledTimes(1);
  });

  it('keeps every exit from the card live', async () => {
    const { uiRoom, rivalRoom } = await seatedDuel({ withLobby: true });
    rivalRoom.reportSeat(KO);
    await waitFor(() => result.isVisible, 'card visible');

    for (const id of ['duel-rematch', 'duel-lobby', 'duel-menu']) {
      const button = result.$(id);
      expect(button, id).toBeTruthy();
      expect(button.disabled, id).toBe(false);
    }
    expect(result.el.classList.contains('hidden')).toBe(false);
    expect(result.el.getAttribute('aria-modal')).toBe('true');
  });

  it('settles a walk-out as a forfeit instead of waiting forever', async () => {
    const { uiRoom, rivalRoom } = await seatedDuel({ withLobby: true });
    const over = vi.fn();
    uiRoom.on('over', over);

    rivalRoom.leave();

    await waitFor(() => over.mock.calls.length === 1, 'over after walk-out');
    expect(over.mock.calls[0][0].resolved.reason).toBe('forfeit');
    expect(over.mock.calls[0][0].resolved.winner).toBe(uiRoom.seat);
    await waitFor(() => result.isVisible, 'verdict shown');
    expect(result.$('duel-result-title').textContent).toBe('Victory');
  });

  it('tears the dead board down when the player leaves for the lobby', async () => {
    const { uiRoom, rivalRoom } = await seatedDuel({ withLobby: true });
    rivalRoom.reportSeat(KO);
    await waitFor(() => result.isVisible, 'card visible');

    // The card is up: the board is paused behind it, which is correct.
    expect(stopDuelScene).not.toHaveBeenCalled();

    // Going back to the lobby must stop that board. Leaving it paused under a
    // live HUD is what made a decided duel look like a frozen game.
    uiLobby.reopenAfterMatch();
    expect(stopDuelScene).toHaveBeenCalledTimes(1);
  });

  it('holds the card open while a cleared seat waits for its rival', async () => {
    const { uiRoom } = await seatedDuel({ withLobby: true });
    uiRoom.reportSeat(CLEARED);
    // GameScene.finishDuel paints the waiting card once its own half is done;
    // this is that call, without booting Phaser.
    result.show({ ...CLEARED, seat: uiRoom.seat });

    // A cleared seat cannot win yet — the rival still has a board. The card
    // must say so and stay dismissible instead of freezing the screen.
    await waitFor(() => result.isVisible, 'waiting card');
    expect(result.$('duel-waiting').classList.contains('hidden')).toBe(false);
    expect(result.$('duel-lobby').disabled).toBe(false);
    expect(result.$('duel-menu').disabled).toBe(false);
  });
});
