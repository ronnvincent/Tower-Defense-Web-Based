/**
 * PvpLobbyUI.js — create / join / ready-up / arena pick for a duel room.
 *
 * The panel is a thin view over {@link PvpRoom}: every interaction is an intent
 * ("host", "join", "ready", "pick this arena"), and every paint comes from the
 * room's `state` event, so the host and the challenger run exactly the same
 * code path. Nothing here knows whether the room is local (BroadcastChannel)
 * or relayed (WebSocket).
 *
 * Layout follows the Obsidian & Gold kit: panel plate, iron buttons, one gold
 * primary per screen. The room screen is a 2-up seat board with the arena
 * carousel underneath, sized to survive a 640×360 phone in landscape.
 */

import { PVP_ARENAS, getArena } from '../data/pvpArenas.js';
import { COUNTDOWN_MS, MAX_CLIENTS } from '../net/LobbyState.js';
import { PvpRoom, ROOM_EVENTS } from '../net/PvpRoom.js';
import { contractsFor } from '../systems/DuelContracts.js';
import { normaliseRoomCode } from '../net/lobbyProtocol.js';
import { ensureMounted } from './screenHost.js';
import { TRANSPORT, preferredMode } from '../net/transports.js';
import {
  normaliseRelayUrl,
  readStoredRelay,
  relayFromSearch,
  sameOriginRelay,
  writeStoredRelay,
} from '../net/relayAddress.js';

const NAME_KEY = 'td-duel-name';
const LINK_KEY = 'td-duel-link';

/** Transport status → the word printed in the link badge. */
const LINK_WORDS = {
  idle: 'READY',
  connecting: 'DIALING RELAY',
  reconnecting: 'RETRYING RELAY',
  linking: 'WAITING FOR HOST',
  open: 'LINKED',
  closed: 'LINK LOST',
  error: 'NO LINK',
};

export class PvpLobbyUI {
  /**
   * @param {HTMLElement} container  the overlay layer (same one the result screen uses)
   * @param {{ onLaunch?: (payload:object)=>void, onClose?: ()=>void }} [options]
   */
  constructor(container, { onLaunch, onClose } = {}) {
    this.container = container;
    this.onLaunch = onLaunch || (() => {});
    this.onClose = onClose || (() => {});
    this.room = null;
    this.roomListeners = [];
    this.screen = 'entry';
    /** Co-op Siege runs this same lobby; only the verdict differs. */
    this.coopMode = false;
    this.countdownTimer = null;
    this.lastFocus = null;
    /** 'relay' | 'local' — how the two devices reach each other. */
    this.linkMode = this.storedLinkMode();
    /**
     * An explicit relay address, for hosts that cannot proxy `/pvp` (Vercel,
     * Pages, S3). Saved from the field below, or handed over in `?relay=`.
     */
    this.relayOverride = readStoredRelay() || relayFromSearch(globalThis.location?.search);
    this.build();
  }

  /**
   * Co-op Siege borrows this whole lobby — seats, relay, countdown, arena
   * picker — and only relabels the promise. Reusing it is deliberate: a second
   * lobby would be a second thing to keep in sync with the relay protocol.
   */
  paintCoopMode() {
    const coop = Boolean(this.coopMode);
    const set = (id, text) => {
      const node = this.$(id);
      if (node) node.textContent = text;
    };
    set('pvp-eyebrow', coop ? 'ALLIED REALMS' : 'MIRROR ARENA');
    set('pvp-title', coop ? 'Co-op Siege' : 'Duel');
    set(
      'pvp-sub',
      coop
        ? 'One horde, two thrones. Every wave hits both arenas — if either core falls, the pact falls.'
        : 'Two realms, one horde. Same waves, same gold, same boss — first core down loses.'
    );
    this.el.classList.toggle('is-coop', coop);
  }

  /* ================================================================ MARKUP */

  build() {
    const el = document.createElement('div');
    el.id = 'pvp-lobby';
    el.className = 'overlay-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'pvp-title');
    el.innerHTML = `
      <div class="overlay-shell pvp-shell">
        <header class="pvp-head">
          <div class="pvp-head-text">
            <p class="overlay-eyebrow" id="pvp-eyebrow">MIRROR ARENA</p>
            <h2 id="pvp-title" class="overlay-title">Duel</h2>
            <p class="pvp-sub" id="pvp-sub">Two realms, one horde. Same waves, same gold, same boss — first core down loses.</p>
          </div>
          <button id="pvp-close" class="btn-close" type="button" aria-label="Close the duel lobby">✕</button>
        </header>

        <p id="pvp-error" class="pvp-error hidden" role="alert"></p>

        <div id="pvp-fallback" class="pvp-fallback hidden">
          <p class="pvp-fallback-text">
            No relay answered. Two tabs of this browser can still duel each other right now
            — or point the relay field at a running <code>server/pvp-relay.mjs</code>.
          </p>
          <button id="pvp-fallback-local" class="game-btn" type="button">PLAY IN THIS BROWSER</button>
        </div>

        <section id="pvp-entry" class="pvp-entry">
          <div class="pvp-link-row">
            <span class="pvp-link-label">ROOM LINK</span>
            <div class="pvp-link-chips" role="radiogroup" aria-label="How the two devices reach each other">
              <button id="pvp-link-relay" class="pvp-link-chip" type="button" role="radio" aria-checked="true"
                      data-link="relay" title="Cross a device boundary through the duel relay">
                <span class="pvp-link-chip-title">ONLINE</span>
                <span class="pvp-link-chip-note">Two devices · relay</span>
              </button>
              <button id="pvp-link-local" class="pvp-link-chip" type="button" role="radio" aria-checked="false"
                      data-link="local" title="Two tabs of this browser, no server involved">
                <span class="pvp-link-chip-title">THIS BROWSER</span>
                <span class="pvp-link-chip-note">Two tabs · no server</span>
              </button>
            </div>
            <p id="pvp-link" class="pvp-link" role="status"></p>
            <button id="pvp-relay-toggle" class="pvp-relay-toggle" type="button"
                    aria-expanded="false" aria-controls="pvp-relay-setup">CHANGE RELAY</button>
            <div id="pvp-relay-setup" class="pvp-relay-setup hidden">
              <label class="pvp-relay-field">
                <span>RELAY ADDRESS</span>
                <input id="pvp-relay-input" class="game-input" type="url" inputmode="url"
                       autocomplete="off" spellcheck="false" placeholder="wss://your-relay.example/pvp" />
              </label>
              <div class="pvp-relay-actions">
                <button id="pvp-relay-apply" class="game-btn game-btn-subtle" type="button">USE THIS RELAY</button>
                <button id="pvp-relay-reset" class="game-btn game-btn-subtle" type="button">RESET</button>
              </div>
              <p class="pvp-relay-note">
                A page served by Vite answers <code>/pvp</code> itself. A static host
                (Vercel, Pages) has no process to run the relay: host
                <code>server/pvp-relay.mjs</code> somewhere that stays up, then paste its
                <code>wss://…/pvp</code> address here.
              </p>
            </div>
          </div>
          <div class="pvp-col">
            <h3 class="pvp-h3">HOST A ROOM</h3>
            <p class="pvp-copy">You take seat I. Your rival joins with the code.</p>
            <button id="pvp-host" class="game-btn game-btn-primary" type="button">CREATE ROOM</button>
          </div>
          <div class="pvp-col">
            <h3 class="pvp-h3">JOIN A ROOM</h3>
            <label class="pvp-field">
              <span>ROOM CODE</span>
              <input id="pvp-code" class="game-input pvp-code-input" maxlength="5" inputmode="text"
                     autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" />
            </label>
            <label class="pvp-field">
              <span>YOUR NAME</span>
              <input id="pvp-name" class="game-input" maxlength="16" autocomplete="off" spellcheck="false" />
            </label>
            <button id="pvp-join" class="game-btn" type="button">JOIN ROOM</button>
          </div>
        </section>

        <section id="pvp-room" class="pvp-room hidden">
          <div class="pvp-room-top">
            <div class="pvp-code-block">
              <span class="pvp-code-label">ROOM CODE</span>
              <button id="pvp-code-value" class="pvp-code" type="button" title="Tap to copy the code">-----</button>
            </div>
            <div class="pvp-room-meta">
              <span id="pvp-link-badge" class="pvp-badge" data-state="idle">ONLINE · READY</span>
              <p id="pvp-room-status" class="pvp-room-status">WAITING FOR A CHALLENGER</p>
            </div>
          </div>

          <div class="pvp-seats">
            <article class="pvp-seat" id="pvp-seat-p1">
              <span class="pvp-seat-tag">SEAT I</span>
              <span class="pvp-seat-name" id="pvp-name-p1">HOST</span>
              <span class="pvp-seat-state" id="pvp-state-p1">NOT READY</span>
            </article>
            <div class="pvp-vs" aria-hidden="true">VS</div>
            <article class="pvp-seat" id="pvp-seat-p2">
              <span class="pvp-seat-tag">SEAT II</span>
              <span class="pvp-seat-name" id="pvp-name-p2">EMPTY</span>
              <span class="pvp-seat-state" id="pvp-state-p2">WAITING</span>
            </article>
          </div>

          <div class="pvp-arenas" id="pvp-arenas" role="radiogroup" aria-label="Arena"></div>

          <div class="pvp-contracts" id="pvp-contracts" aria-live="polite"></div>

          <div class="pvp-actions">
            <button id="pvp-ready" class="game-btn" type="button">READY</button>
            <button id="pvp-start" class="game-btn game-btn-primary" type="button" disabled>START DUEL</button>
            <button id="pvp-leave" class="game-btn game-btn-subtle" type="button">LEAVE</button>
          </div>
          <p id="pvp-hint" class="pvp-hint"></p>
        </section>

        <section id="pvp-countdown" class="pvp-countdown hidden" aria-live="assertive">
          <p class="pvp-countdown-label">GATES OPEN IN</p>
          <p class="pvp-countdown-value" id="pvp-countdown-value">3</p>
          <p class="pvp-countdown-sub" id="pvp-countdown-sub">Cinder Crown · identical horde</p>
        </section>
      </div>
    `;
    this.container.appendChild(el);
    this.el = el;
    this.$ = (id) => el.querySelector(`#${id}`);

    this.renderArenas();
    this.bind();
  }

  bind() {
    this.$('pvp-close').addEventListener('click', () => this.close());
    for (const chip of this.el.querySelectorAll('.pvp-link-chip')) {
      chip.addEventListener('click', () => this.setLinkMode(chip.dataset.link));
    }
    this.$('pvp-host').addEventListener('click', () => this.hostRoom());
    this.$('pvp-fallback-local').addEventListener('click', () => this.useLocalFallback());
    this.$('pvp-join').addEventListener('click', () => this.joinRoom());
    this.$('pvp-code-value').addEventListener('click', () => this.copyCode());
    this.$('pvp-leave').addEventListener('click', () => this.leaveRoom());
    this.$('pvp-ready').addEventListener('click', () => {
      const self = this.room?.view?.self;
      this.room?.setReady(!self?.ready);
    });
    this.$('pvp-start').addEventListener('click', () => this.room?.start());
    this.$('pvp-code').addEventListener('input', (event) => {
      const input = event.target;
      const clean = normaliseRoomCode(input.value);
      if (input.value !== clean) input.value = clean;
    });
    this.$('pvp-code').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.joinRoom();
    });
    this.$('pvp-relay-toggle').addEventListener('click', () => this.toggleRelaySetup());
    this.$('pvp-relay-apply').addEventListener('click', () => this.applyRelay());
    this.$('pvp-relay-reset').addEventListener('click', () => this.applyRelay(null));
    this.$('pvp-relay-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.applyRelay();
    });
    this.$('pvp-name').value = this.storedName();

    this.onKeydown = (event) => {
      if (event.key !== 'Escape' || !this.isOpen()) return;
      if (this.screen === 'countdown') return;
      this.close();
    };
    document.addEventListener('keydown', this.onKeydown);
  }

  /* ================================================================ SCREENS */

  isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /**
   * @param {{coop?:boolean}} [options]  open the same lobby as Co-op Siege
   */
  show({ coop = false } = {}) {
    this.coopMode = Boolean(coop);
    this.lastFocus = document.activeElement;
    // The lobby is built once at boot. If anything ever cleared the shared
    // overlay layer, the same element goes back in — never a detached copy that
    // `isOpen()` is happy to report as open.
    ensureMounted(this.container, this.el);
    this.el.classList.remove('hidden');
    this.paintCoopMode();
    this.setScreen('entry');
    this.ensureRoom();
    this.$('pvp-name').value = this.storedName();
    this.$('pvp-code').value = '';
    this.hideError();
    this.toggleRelaySetup(false);
    this.paintLink(null);
    setTimeout(() => this.$('pvp-code')?.focus({ preventScroll: true }), 30);
  }

  close() {
    if (this.screen === 'countdown') return;
    // Closing the panel always frees the seat: a relay room that nobody is
    // using should not sit there for its TTL.
    this.room?.leave();
    this.teardownRoom();
    this.el.classList.add('hidden');
    this.setScreen('entry');
    if (this.lastFocus?.focus) this.lastFocus.focus({ preventScroll: true });
    this.onClose();
  }

  hide() {
    this.el.classList.add('hidden');
    this.stopCountdown();
  }

  setScreen(screen) {
    this.screen = screen;
    this.$('pvp-entry').classList.toggle('hidden', screen !== 'entry');
    this.$('pvp-room').classList.toggle('hidden', screen !== 'room');
    this.$('pvp-countdown').classList.toggle('hidden', screen !== 'countdown');
    this.$('pvp-close').classList.toggle('hidden', screen === 'countdown');
  }

  /* ================================================================== ROOM */

  ensureRoom() {
    if (this.room) return this.room;
    // `mode` is the whole difference between a room in this browser and a room
    // two devices can share, so it is a first-class lobby choice, not a build
    // flag buried in the env.
    this.room = new PvpRoom({ mode: this.linkMode, relayUrl: this.relayOverride });
    window.gamePvp = this.room;

    this.roomListeners.push(
      this.room.on(ROOM_EVENTS.STATE, (view) => this.render(view)),
      this.room.on(ROOM_EVENTS.LAUNCH, (payload) => this.launch(payload)),
      this.room.on(ROOM_EVENTS.OVER, ({ resolved, view }) => this.finish(resolved, view)),
      this.room.on(ROOM_EVENTS.REMATCH_REQUEST, (request) =>
        window.gameDuelResult?.showRematchRequest?.(request)
      ),
      this.room.on(ROOM_EVENTS.ERROR, (message) => this.showError(message)),
      this.room.on(ROOM_EVENTS.STATUS, (status) => {
        this.paintLink(this.room?.view || null);
        if (this.screen === 'entry') {
          this.paintJoinProgress(status);
          // A dial that fails on a deploy with no local relay: put the fix in
          // front of the player instead of making them hunt for it.
          if (status === 'error' && !this.relayOverride) this.toggleRelaySetup(true, { focus: false });
        }
        if (status === 'closed' && this.room?.view?.status === 'lobby') {
          this.showError('The duel link dropped. Leave the room and open it again.');
        }
      })
    );
    return this.room;
  }

  teardownRoom() {
    for (const off of this.roomListeners) off?.();
    this.roomListeners = [];
    if (window.gamePvp === this.room) window.gamePvp = null;
    this.room = null;
    this.stopCountdown();
  }

  async hostRoom() {
    this.hideError();
    const room = this.ensureRoom();
    const button = this.$('pvp-host');
    button.disabled = true;
    button.textContent = this.linkMode === TRANSPORT.RELAY ? 'DIALING RELAY…' : 'OPENING ROOM…';
    try {
      const view = await room.host({ name: this.playerName(), coop: this.coopMode });
      if (this.room !== room) return;
      this.setScreen('room');
      this.render(view);
      this.startCountdownLoop();
    } catch (error) {
      this.showError(error?.message || 'Could not open a room');
      // A static host (Vercel, Pages) has no `/pvp` process, so the online
      // default fails on the first click. Offer the room that *can* open
      // instead of parking the player on an error they cannot act on.
      if (this.linkMode === TRANSPORT.RELAY) this.showFallback(() => this.hostRoom());
    } finally {
      button.disabled = false;
      button.textContent = 'CREATE ROOM';
    }
  }

  async joinRoom() {
    this.hideError();
    const code = this.$('pvp-code').value;
    if (code.length !== 5) {
      this.showError('Room codes are five characters');
      return;
    }
    const room = this.ensureRoom();
    const button = this.$('pvp-join');
    button.disabled = true;
    button.dataset.busy = '1';
    button.textContent = this.linkMode === TRANSPORT.RELAY ? 'DIALING RELAY…' : 'JOINING…';
    try {
      await room.join({ code, name: this.playerName() });
      if (this.room !== room) return;
      this.setScreen('room');
      this.render(room.view);
      this.startCountdownLoop();
    } catch (error) {
      this.showError(error?.message || 'Could not join that room');
      if (this.linkMode === TRANSPORT.RELAY) this.showFallback(() => this.joinRoom());
    } finally {
      delete button.dataset.busy;
      button.disabled = false;
      button.textContent = 'JOIN ROOM';
    }
  }

  leaveRoom() {
    const room = this.room;
    this.teardownRoom();
    room?.leave();
    this.setScreen('entry');
    this.hideError();
    this.hideFallback();
    this.toggleRelaySetup(false);
    this.paintLink(null);
  }

  /** Re-open the room board after a match, for the rematch path. */
  reopenAfterMatch() {
    // The battlefield behind this lobby is finished. Stop it here, while we
    // still know why: leaving it paused under a live HUD is what made a decided
    // duel look like a frozen game. The room survives, so REMATCH still works.
    window.gameFlow?.stopDuelScene?.();
    if (!this.room) {
      this.show();
      return;
    }
    this.el.classList.remove('hidden');
    this.setScreen('room');
    this.render(this.room.view);
    this.startCountdownLoop();
  }

  /* ================================================================= PAINT */

  render(view) {
    if (!view) return;
    this.$('pvp-code-value').textContent = view.roomCode;
    const status = view.status;
    const statusText = {
      lobby: view.connected >= MAX_CLIENTS ? 'BOTH SEATS FILLED · READY WHEN YOU ARE' : 'WAITING FOR A CHALLENGER',
      countdown: 'GATES OPENING…',
      live: 'DUEL IN PROGRESS',
      over: 'MATCH COMPLETE',
    }[status] || '';
    this.$('pvp-room-status').textContent = statusText;

    this.paintContracts(view);

    for (const seatId of ['p1', 'p2']) {
      const row = view.results.find((seat) => seat.id === seatId);
      const seatEl = this.$(`pvp-seat-${seatId}`);
      const nameEl = this.$(`pvp-name-${seatId}`);
      const stateEl = this.$(`pvp-state-${seatId}`);

      // A seat exists once a client is in it; p1 is the host.
      const present = seatId === 'p1' ? view.connected >= 1 : view.connected >= 2;
      const isMe = view.self?.id === seatId;
      const seatView = isMe ? view.self : view.rival?.id === seatId ? view.rival : null;
      const ready = Boolean(seatView?.ready);
      const progress = seatView?.progress;

      nameEl.textContent = present ? (row?.name || '').toUpperCase() || seatId.toUpperCase() : 'EMPTY';

      let label;
      if (!present) label = 'WAITING';
      else if (row?.result) label = row.result.outcome === 'ko' ? 'KNOCKED OUT' : 'FINISHED';
      else if (status === 'live' && progress) {
        label = `WAVE ${progress.wave}/${progress.totalWaves || 8} · ${progress.score} PTS`;
      } else label = ready ? 'READY' : 'NOT READY';

      stateEl.textContent = label;
      seatEl.classList.toggle('is-me', isMe);
      seatEl.classList.toggle('is-ready', label === 'READY');
      seatEl.classList.toggle('is-empty', !present);
      seatEl.classList.toggle('is-down', row?.result?.outcome === 'ko');
    }

    // Arena cards are host-only; the challenger sees the host's choice.
    for (const card of this.$('pvp-arenas').querySelectorAll('.pvp-arena')) {
      const selected = card.dataset.arena === view.arena.id;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-checked', String(selected));
      card.disabled = !view.isHost || status !== 'lobby';
    }

    const ready = Boolean(view.self?.ready);
    const readyBtn = this.$('pvp-ready');
    readyBtn.textContent = ready ? 'CANCEL READY' : 'READY';
    readyBtn.classList.toggle('game-btn-primary', !ready);
    readyBtn.disabled = view.connected < 2 || status !== 'lobby';

    const startBtn = this.$('pvp-start');
    startBtn.disabled = !view.canStart;
    startBtn.classList.toggle('hidden', !view.isHost);
    startBtn.title = view.isHost
      ? view.connected < 2
        ? 'Wait for a challenger'
        : view.rival?.ready
          ? 'Open the gates'
          : 'Your rival is not ready yet'
      : 'Only the host can start';

    this.$('pvp-hint').textContent = view.isHost
      ? 'You pick the arena. Both sides fight the same horde — mirror halves, mirrored gates.'
      : `Host picks the arena. ${getArena(view.arena.id).name} right now.`;

    this.paintLink(view);

    if (status === 'countdown') this.setScreen('countdown');
    else if (status === 'lobby') {
      // A rematch resets the room to the lobby; bring the board back for the
      // challenger too, instead of leaving them on a dead result card.
      if (!this.isOpen() && window.gameDuelResult?.isVisible) {
        window.gameDuelResult.hide();
        this.el.classList.remove('hidden');
      }
      this.setScreen('room');
    }
  }

  /* ================================================================== LINK */

  /** 'relay' | 'local', from storage, the URL (`?pvp=`) or the default. */
  storedLinkMode() {
    try {
      const saved = localStorage.getItem(LINK_KEY);
      if (saved === TRANSPORT.LOCAL || saved === TRANSPORT.RELAY) return saved;
    } catch {
      /* private mode */
    }
    return preferredMode();
  }

  setLinkMode(mode) {
    if (mode !== TRANSPORT.LOCAL && mode !== TRANSPORT.RELAY) return;
    if (mode === this.linkMode) return;
    const previous = this.room;
    this.teardownRoom();
    previous?.leave();
    this.linkMode = mode;
    try {
      localStorage.setItem(LINK_KEY, mode);
    } catch {
      /* private mode */
    }
    this.hideError();
    this.setScreen('entry');
    this.paintLink(null);
  }

  /** Paint the chips, the entry caption and the in-room badge. */
  paintLink(view) {
    const room = this.room;
    const mode = room?.kind || this.linkMode;
    for (const chip of this.el.querySelectorAll('.pvp-link-chip')) {
      const active = chip.dataset.link === mode;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-checked', String(active));
    }

    const status = room?.status || 'idle';
    const word = LINK_WORDS[status] || String(status).toUpperCase();
    const label = mode === TRANSPORT.LOCAL ? 'THIS BROWSER' : 'ONLINE';
    const badge = this.$('pvp-link-badge');
    if (badge) {
      badge.textContent = `${label} · ${word}`;
      badge.dataset.state = status;
      badge.classList.toggle('is-live', status === 'open');
      badge.classList.toggle('is-down', status === 'closed' || status === 'error');
    }

    const line = this.$('pvp-link');
    if (line) {
      if (mode === TRANSPORT.LOCAL) {
        line.textContent =
          'Two tabs of this browser only — a local room can never reach another device.';
      } else {
        const url = room?.linkUrl || this.relayTarget();
        line.textContent = url
          ? `Two devices through the relay at ${url}`
          : 'Two devices through the duel relay.';
        this.$('pvp-relay-toggle').textContent = this.relayOverride ? 'CHANGE RELAY · SAVED' : 'CHANGE RELAY';
      }
    }
    return view;
  }

  /** The address the ONLINE link will dial. */
  relayTarget() {
    return this.relayOverride || sameOriginRelay();
  }

  toggleRelaySetup(force, { focus = true } = {}) {
    const panel = this.$('pvp-relay-setup');
    const open = force === undefined ? panel.classList.contains('hidden') : Boolean(force);
    panel.classList.toggle('hidden', !open);
    this.$('pvp-relay-toggle').setAttribute('aria-expanded', String(open));
    if (!open) return;
    const input = this.$('pvp-relay-input');
    input.value = this.relayOverride || '';
    if (focus) setTimeout(() => input.focus({ preventScroll: true }), 20);
  }

  /**
   * Save (or clear, when `value` is null) the relay address. The room is torn
   * down because a socket already points at the old address.
   */
  applyRelay(value) {
    const clearing = value === null;
    const raw = clearing ? '' : String((value ?? this.$('pvp-relay-input').value) || '').trim();
    const url = clearing ? null : normaliseRelayUrl(raw);
    if (!clearing && raw && !url) {
      this.showError('That is not a relay address. Paste something like wss://relay.example/pvp.');
      return;
    }
    const previous = this.room;
    this.teardownRoom();
    previous?.leave();
    this.relayOverride = url;
    writeStoredRelay(url);
    this.hideError();
    this.setScreen('entry');
    this.paintLink(null);
    if (url) this.toggleRelaySetup(false);
  }

  /** Keep the join button honest while a dial is in flight. */
  paintJoinProgress(status) {
    const button = this.$('pvp-join');
    if (!button || button.dataset.busy !== '1') return;
    if (status === 'connecting') button.textContent = 'DIALING RELAY…';
    else if (status === 'reconnecting') button.textContent = 'RETRYING RELAY…';
    else if (status === 'linking') button.textContent = 'WAITING FOR HOST…';
  }

  renderArenas() {
    const host = this.$('pvp-arenas');
    host.innerHTML = PVP_ARENAS.map(
      (arena) => `
      <button class="pvp-arena" type="button" role="radio" aria-checked="false" data-arena="${arena.id}">
        <span class="pvp-arena-name">${arena.name}</span>
        <span class="pvp-arena-theme">${arena.theme.toUpperCase()}</span>
        <span class="pvp-arena-blurb">${arena.blurb}</span>
      </button>`
    ).join('');
    host.addEventListener('click', (event) => {
      const card = event.target.closest('.pvp-arena');
      if (!card || card.disabled) return;
      this.room?.pickArena(card.dataset.arena);
    });
  }

  /**
   * The three contracts both seats are playing for.
   *
   * They are drawn from the room seed, so this is a *view* of shared data, not
   * a setting: neither player can pick a private easier set.
   */
  paintContracts(view) {
    const box = this.$('pvp-contracts');
    if (!box) return;
    const list = contractsFor(view?.seed ?? 1);
    const signature = `${view?.seed}:${list.map((c) => c.id).join(',')}`;
    if (this.contractSignature === signature) return;
    this.contractSignature = signature;
    box.innerHTML = `
      <p class="pvp-contracts-title">DUEL CONTRACTS · SAME THREE FOR BOTH SEATS</p>
      <div class="pvp-contracts-list">
        ${list
          .map(
            (contract) => `
          <span class="pvp-contract" title="${contract.goal}">
            <strong>${contract.name}</strong>
            <em>${contract.goal}</em>
            <b>+${contract.reward}</b>
          </span>`
          )
          .join('')}
      </div>
    `;
  }

  /* ============================================================== COUNTDOWN */

  startCountdownLoop() {
    this.stopCountdown();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 120);
  }

  stopCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  tickCountdown() {
    const room = this.room;
    if (!room) return;
    // The host owns the clock; the challenger follows the synced snapshot.
    room.tick();
    const remaining = room.countdownRemaining();
    if (room.state?.status === 'countdown') {
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      this.$('pvp-countdown-value').textContent = String(seconds);
      const view = room.view;
      this.$('pvp-countdown-sub').textContent =
        `${view.arena.name} · ${view.arena.theme.toUpperCase()} · ${view.totalWaves || 10} waves · identical horde`;
    }
  }

  /* ================================================================ LAUNCH */

  launch(payload) {
    this.stopCountdown();
    this.hide();
    this.onLaunch(payload);
  }

  finish(resolved, view) {
    this.stopCountdown();
    // The arena is irrelevant now — freeze it behind the card instead of
    // letting a second horde march under a result the player cannot dismiss.
    window.gameFlow?.pauseBattle?.();
    window.gameDuelResult?.showFinal?.({
      resolved,
      view,
      selfSeat: this.room?.seat || null,
    });
  }

  /* ================================================================ HELPERS */

  playerName() {
    const value = this.$('pvp-name')?.value?.trim();
    const name = value || this.storedName();
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* private mode */
    }
    return name;
  }

  storedName() {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  }

  showError(message) {
    const el = this.$('pvp-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  hideError() {
    this.$('pvp-error')?.classList.add('hidden');
    this.hideFallback();
  }

  /** The relay is not there: offer the same-browser room, retrying what failed. */
  showFallback(retry) {
    this.retryAfterFallback = retry || null;
    // The fallback *is* the fix: leave the relay fields collapsed behind
    // CHANGE RELAY instead of stacking two answers to the same failure.
    this.toggleRelaySetup(false);
    this.$('pvp-fallback')?.classList.remove('hidden');
  }

  hideFallback() {
    this.retryAfterFallback = null;
    this.$('pvp-fallback')?.classList.add('hidden');
  }

  useLocalFallback() {
    const retry = this.retryAfterFallback;
    this.setLinkMode(TRANSPORT.LOCAL);
    this.toggleRelaySetup(false);
    if (retry) setTimeout(retry, 0);
  }

  async copyCode() {
    const code = this.room?.view?.roomCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.$('pvp-code-value').textContent = 'COPIED';
      setTimeout(() => {
        if (this.$('pvp-code-value')) this.$('pvp-code-value').textContent = code;
      }, 1100);
    } catch {
      this.showError(`Share this code: ${code}`);
    }
  }

  destroy() {
    document.removeEventListener('keydown', this.onKeydown);
    this.stopCountdown();
    this.teardownRoom();
    this.el.remove();
  }
}

export { COUNTDOWN_MS };
