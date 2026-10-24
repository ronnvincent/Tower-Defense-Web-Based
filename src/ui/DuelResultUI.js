/**
 * DuelResultUI.js — the end-of-match card for a mirrored duel.
 *
 * Two moments share one panel:
 *   • `show(report)`      — your half is over (core down, or the script cleared)
 *                           while the rival is still fighting. This is the
 *                           "waiting" state, and it is why a duel never feels
 *                           like a dead end.
 *   • `showFinal(...)`    — the room has decided. Winner, reason, both score
 *                           lines and the rematch loop.
 *
 * It reuses the campaign result shell so a duel reads as part of the same game,
 * but it never writes progression: duels are scored, not banked.
 */

const REASON_COPY = {
  knockout: 'won by knockout',
  points: 'won on points',
  'core-hp': 'won on core integrity',
  time: 'won on clear time',
};

export class DuelResultUI {
  /**
   * @param {HTMLElement} container
   * @param {{ onRematch?:Function, onLobby?:Function, onMenu?:Function }} [handlers]
   */
  constructor(container, { onRematch, onLobby, onMenu } = {}) {
    this.onRematch = onRematch || (() => {});
    this.onLobby = onLobby || (() => {});
    this.onMenu = onMenu || (() => {});
    this.report = null;
    this.final = null;
    this.build(container);
  }

  build(container) {
    const el = document.createElement('div');
    el.id = 'duel-result';
    el.className = 'overlay-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'duel-result-title');
    el.innerHTML = `
      <div class="overlay-shell duel-shell">
        <p class="overlay-eyebrow" id="duel-result-eyebrow">MIRROR ARENA</p>
        <h2 id="duel-result-title" class="overlay-title duel-title">Duel</h2>
        <p class="duel-line" id="duel-result-line">Waiting for the room…</p>

        <div class="duel-scoreboard" id="duel-scoreboard" aria-live="polite"></div>

        <p class="duel-waiting hidden" id="duel-waiting">
          <span class="duel-waiting-dot" aria-hidden="true"></span>
          Your half is settled. The match closes when your rival finishes — the lower core or fewer points loses.
        </p>

        <div class="duel-actions">
          <button id="duel-rematch" class="game-btn game-btn-primary" type="button">REMATCH</button>
          <button id="duel-lobby" class="game-btn" type="button">BACK TO LOBBY</button>
          <button id="duel-menu" class="game-btn game-btn-subtle" type="button">MAIN MENU</button>
        </div>
      </div>
    `;
    container.appendChild(el);
    this.el = el;
    this.$ = (id) => el.querySelector(`#${id}`);

    this.$('duel-rematch').addEventListener('click', () => {
      this.hide();
      this.onRematch();
    });
    this.$('duel-lobby').addEventListener('click', () => {
      this.hide();
      this.onLobby();
    });
    this.$('duel-menu').addEventListener('click', () => {
      this.hide();
      this.onMenu();
    });
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }

  /** Your half finished; the room may still be live. */
  show(report) {
    this.report = report;
    this.final = null;
    this.el.classList.remove('hidden');
    this.$('duel-result-eyebrow').textContent = 'MIRROR ARENA';
    this.$('duel-result-title').textContent = report?.outcome === 'ko' ? 'Core Breached' : 'Sector Cleared';
    this.$('duel-result-title').className = `overlay-title duel-title ${report?.outcome === 'ko' ? 'is-loss' : 'is-win'}`;
    this.$('duel-result-line').textContent =
      report?.outcome === 'ko'
        ? 'Your core fell. If your rival falls too, points decide it.'
        : 'You finished the horde. Now the arena waits on your rival.';
    this.renderScoreboard([
      {
        name: 'YOU',
        score: report?.score || 0,
        waves: report?.waves || 0,
        coreHp: report?.coreHp ?? 0,
        outcome: report?.outcome || 'cleared',
        winner: false,
      },
    ]);
    this.$('duel-waiting').classList.remove('hidden');
    this.$('duel-rematch').disabled = true;
    this.$('duel-rematch').title = 'Available when the match is decided';
  }

  /** The room decided. */
  showFinal({ resolved, view, selfSeat } = {}) {
    if (!view) return;
    this.final = { resolved, view, selfSeat };
    this.el.classList.remove('hidden');
    this.$('duel-waiting').classList.add('hidden');

    const winnerSeat = resolved?.winner || null;
    const drew = Boolean(resolved?.draw);
    const iWon = winnerSeat && winnerSeat === selfSeat;

    const title = drew ? 'Draw' : iWon ? 'Victory' : 'Defeat';
    const titleEl = this.$('duel-result-title');
    titleEl.textContent = title;
    titleEl.className = `overlay-title duel-title ${drew ? 'is-draw' : iWon ? 'is-win' : 'is-loss'}`;

    const winnerName = view.results?.find((seat) => seat.id === winnerSeat)?.name || winnerSeat || 'Nobody';
    const reason = REASON_COPY[resolved?.reason] || 'takes the arena';
    this.$('duel-result-line').textContent = drew
      ? 'Both cores stand and both scores match. Nobody takes the arena.'
      : `${winnerName} ${reason}.`;

    const rows = (view.results || []).map((seat) => ({
      name: seat.name || seat.id,
      score: seat.result?.score || 0,
      waves: seat.result?.waves || 0,
      coreHp: seat.result?.coreHp || 0,
      outcome: seat.result?.outcome || 'dnf',
      winner: seat.id === winnerSeat,
      isMe: seat.id === selfSeat,
    }));
    this.renderScoreboard(rows);

    const rematch = this.$('duel-rematch');
    rematch.disabled = false;
    rematch.title = '';
    rematch.classList.toggle('hidden', !view.isHost);
  }

  renderScoreboard(rows) {
    this.$('duel-scoreboard').innerHTML = rows
      .map(
        (row) => `
        <div class="duel-row ${row.winner ? 'is-winner' : ''} ${row.isMe ? 'is-me' : ''}">
          <span class="duel-row-name">${escapeHtml(row.name)}${row.isMe ? ' <em>YOU</em>' : ''}</span>
          <span class="duel-row-score">${row.score.toLocaleString()}<small>pts</small></span>
          <span class="duel-row-waves">${row.waves} waves</span>
          <span class="duel-row-core">${row.outcome === 'ko' ? 'CORE DOWN' : `${row.coreHp} HP`}</span>
          <span class="duel-row-badge">${row.winner ? 'WINNER' : row.outcome === 'ko' ? 'KO' : ''}</span>
        </div>`
      )
      .join('');
  }

  hide() {
    this.el.classList.add('hidden');
    this.report = null;
    this.final = null;
  }
}

/** Names come from another player, so never interpolate them raw. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
