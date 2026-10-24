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
import { normaliseRoomCode } from '../net/lobbyProtocol.js';

const NAME_KEY = 'td-duel-name';

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
    this.countdownTimer = null;
    this.lastFocus = null;
    this.build();
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
            <p class="overlay-eyebrow">MIRROR ARENA</p>
            <h2 id="pvp-title" class="overlay-title">Duel</h2>
            <p class="pvp-sub">Two realms, one horde. Same waves, same gold, same boss — first core down loses.</p>
          </div>
          <button id="pvp-close" class="btn-close" type="button" aria-label="Close the duel lobby">✕</button>
        </header>

        <section id="pvp-entry" class="pvp-entry">
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
          <p id="pvp-error" class="pvp-error hidden" role="alert"></p>
        </section>

        <section id="pvp-room" class="pvp-room hidden">
          <div class="pvp-room-top">
            <div class="pvp-code-block">
              <span class="pvp-code-label">ROOM CODE</span>
              <button id="pvp-code-value" class="pvp-code" type="button" title="Tap to copy the code">-----</button>
            </div>
            <p id="pvp-room-status" class="pvp-room-status">WAITING FOR A CHALLENGER</p>
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
          <p class="pvp-countdown-sub" id="pvp-countdown-sub">Cinder Crown · 8 waves · identical horde</p>
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
    this.$('pvp-host').addEventListener('click', () => this.hostRoom());
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

  show() {
    this.lastFocus = document.activeElement;
    this.el.classList.remove('hidden');
    this.setScreen('entry');
    this.ensureRoom();
    this.$('pvp-name').value = this.storedName();
    this.$('pvp-code').value = '';
    this.hideError();
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
    this.room = new PvpRoom();
    window.gamePvp = this.room;

    this.roomListeners.push(
      this.room.on(ROOM_EVENTS.STATE, (view) => this.render(view)),
      this.room.on(ROOM_EVENTS.LAUNCH, (payload) => this.launch(payload)),
      this.room.on(ROOM_EVENTS.OVER, ({ resolved, view }) => this.finish(resolved, view)),
      this.room.on(ROOM_EVENTS.ERROR, (message) => this.showError(message)),
      this.room.on(ROOM_EVENTS.STATUS, (status) => {
        if (status === 'closed' && this.room?.view?.status === 'lobby') {
          this.showError('Connection to the room was lost');
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
    try {
      const view = await room.host({ name: this.playerName() });
      this.setScreen('room');
      this.render(view);
      this.startCountdownLoop();
    } catch (error) {
      this.showError(error?.message || 'Could not open a room');
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
    try {
      await room.join({ code, name: this.playerName() });
      this.setScreen('room');
      this.startCountdownLoop();
    } catch (error) {
      this.showError(error?.message || 'Could not join that room');
    }
  }

  leaveRoom() {
    this.room?.leave();
    this.teardownRoom();
    this.setScreen('entry');
    this.hideError();
  }

  /** Re-open the room board after a match, for the rematch path. */
  reopenAfterMatch() {
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
      this.$('pvp-countdown-sub').textContent = `${view.arena.name} · ${view.arena.theme.toUpperCase()} · 8 waves · identical horde`;
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
