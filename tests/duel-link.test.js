// @vitest-environment jsdom
/**
 * duel-link.test.js — the left half of the two-device bug: the lobby must say
 * *how* the two players are connected, and must never look idle after a failed
 * join. The right half (a real relay, real sockets) lives in
 * `tests/pvp-relay.test.js`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PvpLobbyUI } from '../src/ui/PvpLobbyUI.js';
import { applyIntent, createLobbyState, lobbyView } from '../src/net/LobbyState.js';
import { OP } from '../src/net/lobbyProtocol.js';
import { TRANSPORT } from '../src/net/transports.js';
import { RELAY_STORAGE_KEY, sameOriginRelay } from '../src/net/relayAddress.js';

let container;

function twoPlayerRoom() {
  const state = createLobbyState({ roomCode: 'ABCDE', selfId: 'host', name: 'Ronn', isHost: true, seed: 3 });
  applyIntent(state, { clientId: 'guest', op: OP.JOIN, payload: { name: 'Kai' } }, 10);
  return state;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('duel room link', () => {
  it('offers the relay first: two devices is the default', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();

    const chips = [...document.querySelectorAll('.pvp-link-chip')];
    expect(chips.map((chip) => chip.dataset.link)).toEqual([TRANSPORT.RELAY, TRANSPORT.LOCAL]);
    const active = document.querySelector('.pvp-link-chip.is-active');
    expect(active.dataset.link).toBe(TRANSPORT.RELAY);
    expect(active.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('#pvp-link').textContent).toMatch(/relay/i);
    ui.destroy();
  });

  it('switches to a same-browser room and says it cannot cross devices', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    document.querySelector('[data-link="local"]').click();

    expect(ui.linkMode).toBe(TRANSPORT.LOCAL);
    expect(document.querySelector('[data-link="local"]').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-link="relay"]').getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('#pvp-link').textContent).toMatch(/never reach another device/i);
    expect(localStorage.getItem('td-duel-link')).toBe(TRANSPORT.LOCAL);
    expect(ui.room).toBeNull();
    ui.destroy();
  });

  it('builds the room over the chosen link, not a hard-coded one', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    document.querySelector('[data-link="local"]').click();
    ui.ensureRoom();
    expect(ui.room.mode).toBe(TRANSPORT.LOCAL);
    ui.leaveRoom();
    document.querySelector('[data-link="relay"]').click();
    ui.ensureRoom();
    expect(ui.room.mode).toBe(TRANSPORT.RELAY);
    ui.destroy();
  });

  it('paints the transport and its live state on the room board', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.ensureRoom();
    const view = lobbyView(twoPlayerRoom());

    ui.render(view);
    expect(document.querySelector('#pvp-link-badge').textContent).toBe('ONLINE · READY');

    ui.room.status = 'open';
    ui.paintLink(view);
    const badge = document.querySelector('#pvp-link-badge');
    expect(badge.textContent).toBe('ONLINE · LINKED');
    expect(badge.classList.contains('is-live')).toBe(true);

    ui.room.status = 'closed';
    ui.paintLink(view);
    expect(badge.textContent).toBe('ONLINE · LINK LOST');
    expect(badge.classList.contains('is-down')).toBe(true);
    ui.destroy();
  });

  it('keeps the error line outside the entry screen so it shows mid-room', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    ui.setScreen('room');
    ui.showError('The duel link dropped. Leave the room and open it again.');
    const error = document.querySelector('#pvp-error');
    expect(document.querySelector('#pvp-entry #pvp-error')).toBeNull();
    expect(document.querySelector('.pvp-shell > #pvp-error')).toBeTruthy();
    expect(error.classList.contains('hidden')).toBe(false);
    expect(error.textContent).toMatch(/link dropped/i);
    ui.destroy();
  });

  it('spells out a join that is still dialling', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    const button = document.querySelector('#pvp-join');
    button.dataset.busy = '1';
    ui.paintJoinProgress('connecting');
    expect(button.textContent).toBe('DIALING RELAY…');
    ui.paintJoinProgress('linking');
    expect(button.textContent).toBe('WAITING FOR HOST…');
    delete button.dataset.busy;
    ui.paintJoinProgress('linking');
    expect(button.textContent).toBe('WAITING FOR HOST…');
    ui.destroy();
  });
});

describe('duel relay address', () => {
  it('shows the address it will dial, and lets a player change it', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();

    expect(document.querySelector('#pvp-link').textContent).toContain(sameOriginRelay());
    expect(document.querySelector('#pvp-relay-setup').classList.contains('hidden')).toBe(true);

    document.querySelector('#pvp-relay-toggle').click();
    const panel = document.querySelector('#pvp-relay-setup');
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#pvp-relay-toggle').getAttribute('aria-expanded')).toBe('true');

    document.querySelector('#pvp-relay-input').value = 'https://mirror-arena.onrender.com/pvp';
    document.querySelector('#pvp-relay-apply').click();

    expect(ui.relayOverride).toBe('wss://mirror-arena.onrender.com/pvp');
    expect(localStorage.getItem(RELAY_STORAGE_KEY)).toBe('wss://mirror-arena.onrender.com/pvp');
    expect(document.querySelector('#pvp-link').textContent).toContain('wss://mirror-arena.onrender.com/pvp');
    expect(panel.classList.contains('hidden')).toBe(true);
    ui.destroy();
  });

  it('builds the room against the saved address', () => {
    localStorage.setItem(RELAY_STORAGE_KEY, 'wss://mirror-arena.onrender.com/pvp');
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    expect(ui.relayOverride).toBe('wss://mirror-arena.onrender.com/pvp');
    expect(ui.room.relayUrl).toBe('wss://mirror-arena.onrender.com/pvp');
    ui.destroy();
  });

  it('refuses junk instead of saving it', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    document.querySelector('#pvp-relay-toggle').click();
    document.querySelector('#pvp-relay-input').value = 'not a url';
    document.querySelector('#pvp-relay-apply').click();

    expect(ui.relayOverride).toBe(null);
    expect(localStorage.getItem(RELAY_STORAGE_KEY)).toBe(null);
    expect(document.querySelector('#pvp-error').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#pvp-error').textContent).toMatch(/not a relay address/i);
    ui.destroy();
  });

  it('opens the relay field when a dial fails and nothing is saved', () => {
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    ui.ensureRoom();
    ui.room.emit('status', 'error');
    expect(document.querySelector('#pvp-relay-setup').classList.contains('hidden')).toBe(false);
    ui.destroy();
  });

  it('does not nag once a relay is saved', () => {
    localStorage.setItem(RELAY_STORAGE_KEY, 'wss://mirror-arena.onrender.com/pvp');
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    ui.ensureRoom();
    ui.room.emit('status', 'error');
    expect(document.querySelector('#pvp-relay-setup').classList.contains('hidden')).toBe(true);
    ui.destroy();
  });

  it('resets back to the page\'s own relay', () => {
    localStorage.setItem(RELAY_STORAGE_KEY, 'wss://mirror-arena.onrender.com/pvp');
    const ui = new PvpLobbyUI(container, {});
    ui.show();
    document.querySelector('#pvp-relay-toggle').click();
    document.querySelector('#pvp-relay-reset').click();

    expect(ui.relayOverride).toBe(null);
    expect(localStorage.getItem(RELAY_STORAGE_KEY)).toBe(null);
    expect(document.querySelector('#pvp-link').textContent).toContain(sameOriginRelay());
    ui.destroy();
  });
});
