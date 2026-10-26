import { audio } from '../rendering/AudioSynth.js';

/**
 * LeaderboardUI.js — two tables in one hall.
 *
 *   REALM RANKING   the shared ranking from the ledger: every commander ordered
 *                   by power, then commander level, then stars, because that is
 *                   what "ranking" means in this game. Read-only; the numbers
 *                   come from the save mirror, not from this screen.
 *   THIS DEVICE     the original local high-score table (one row per finished
 *                   run, merge-sorted) — it still works with the cloud off.
 *
 * The screen never invents a ranking: with no ledger it says so and shows the
 * device table instead of an empty "top 0" list.
 */

export class LeaderboardUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Leaderboard.js').Leaderboard} leaderboard
   * @param {object} callbacks  { onReturnToMenu, onClose, cloud }
   */
  constructor(container, leaderboard, callbacks = {}) {
    this.container = container;
    this.leaderboard = leaderboard;
    this.callbacks = callbacks;
    this.cloud = callbacks.cloud || null;
    this.highlightRank = null;
    this.tab = this.cloud ? 'realm' : 'device';
    this.realm = { state: 'idle', rows: [], total: 0, mine: null, reason: '' };
    this.loadingToken = 0;
  }

  get username() {
    return this.cloud?.identity?.username || '';
  }

  show(gameResult = null) {
    audio.playClick();
    this.render(gameResult);
    const modal = document.getElementById('leaderboard-modal');
    modal?.classList.remove('hidden');
    if (this.tab === 'realm') void this.loadRealm();
  }

  hide() {
    audio.playClick();
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.classList.add('hidden');
    this.highlightRank = null;
    if (this.callbacks.onClose) this.callbacks.onClose();
  }

  /* --------------------------------------------------------------- realm */

  /** Pull the ranking and this player's place in it. */
  async loadRealm() {
    const token = ++this.loadingToken;

    if (!this.cloud) {
      this.realm = { state: 'off', rows: [], total: 0, mine: null, reason: 'no-ledger' };
      this._paint();
      return;
    }

    this.realm = { ...this.realm, state: 'loading', reason: '' };
    this._paint();

    // Flush the pending save first so the ranking reflects the run that just
    // ended, not the one before it.
    if (this.cloud.isOnline) await this.cloud.push('leaderboard');
    const [board, mine] = await Promise.all([
      this.cloud.leaderboard({ limit: 25 }),
      this.cloud.myRank(),
    ]);
    if (token !== this.loadingToken) return; // a newer request won

    this.realm = board.ok
      ? { state: 'ready', rows: board.rows, total: board.total, mine, reason: '' }
      : { state: 'error', rows: [], total: 0, mine: null, reason: board.reason || 'offline' };
    this._paint();
  }

  _realmMarkup() {
    const { state, rows, mine, reason } = this.realm;

    if (state === 'off') {
      return `<div class="lb-empty">
          <p class="lb-empty-title">NO LEDGER CONNECTED</p>
          <p class="lb-empty-note">
            The realm ranking is stored in Supabase. This build has no ledger address, so only this
            device's runs are recorded. Set <code>VITE_SUPABASE_URL</code> and
            <code>VITE_SUPABASE_ANON_KEY</code> (see <code>supabase/README.md</code>).
          </p>
        </div>`;
    }

    if (state === 'loading' || state === 'idle') {
      return `<div class="lb-empty"><p class="lb-empty-title">READING THE LEDGER…</p></div>`;
    }

    if (state === 'error') {
      return `<div class="lb-empty">
          <p class="lb-empty-title">THE LEDGER DID NOT ANSWER</p>
          <p class="lb-empty-note">${escapeHtml(
            reason === 'offline' || reason === 'timeout'
              ? 'The connection dropped. Your save is safe on this device and will be sent again when the ledger is reachable.'
              : `Reason: ${reason}`
          )}</p>
          <button class="game-btn" id="btn-retry-lb" type="button">TRY AGAIN</button>
        </div>`;
    }

    if (!rows.length) {
      return `<div class="lb-empty">
          <p class="lb-empty-title">NO COMMANDERS YET</p>
          <p class="lb-empty-note">Be the first name in the ledger — finish a battle to bank your power.</p>
        </div>`;
    }

    const myName = (this.username || mine?.username || '').toLowerCase();
    const body = rows
      .map((row) => {
        const isMe = myName && row.username.toLowerCase() === myName;
        return `
          <tr class="rank-row ${isMe ? 'is-me' : ''}">
            <td class="col-rank">${rankChip(row.rank)}</td>
            <td class="col-name font-bold">${escapeHtml(row.username)}${isMe ? ' <span class="lb-you">YOU</span>' : ''}</td>
            <td class="col-power gold-text font-bold">${formatNumber(row.power)}</td>
            <td class="col-level">${row.level}</td>
            <td class="col-stars">${row.stars}</td>
            <td class="col-medals">${row.achievements}</td>
          </tr>`;
      })
      .join('');

    const mineLine =
      mine && mine.rank
        ? `<p class="lb-mine">YOU ARE <strong>#${mine.rank}</strong> OF ${mine.total} ·
             POWER ${formatNumber(mine.power)} · LEVEL ${mine.level} · ${mine.stars}★ · ${mine.achievements} MEDALS</p>`
        : this.cloud?.identity
          ? `<p class="lb-mine">Your row appears after your first save reaches the ledger.</p>`
          : '';

    return `
      <div class="table-scroll-frame">
        <table class="game-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>COMMANDER</th>
              <th>POWER</th>
              <th>LEVEL</th>
              <th>STARS</th>
              <th>MEDALS</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${mineLine}
      <p class="lb-source">RANKED BY POWER → COMMANDER LEVEL → STARS. ${this.cloud?.cloudLabel || 'LOCAL'} ledger · ${this.realm.total} commander${this.realm.total === 1 ? '' : 's'}</p>
    `;
  }

  /* -------------------------------------------------------------- device */

  _deviceMarkup(gameResult) {
    const topRecords = this.leaderboard.getTop();
    const sortStats = this.leaderboard.lastSortStats;

    const rowsHtml =
      topRecords.length === 0
        ? `<tr><td colspan="6" class="empty-table">No records carved in the stone yet. Defend the realm!</td></tr>`
        : topRecords
            .map((r, i) => {
              const rank = i + 1;
              const isHighlighted = rank === this.highlightRank;
              const isVic = r.result === 'victory';
              return `
                <tr class="${isHighlighted ? 'highlight-row' : ''}">
                  <td class="col-rank">${rankChip(rank)}</td>
                  <td class="col-name font-bold">${escapeHtml(r.name)}</td>
                  <td class="col-score gold-text font-bold">${r.score}</td>
                  <td class="col-waves">${r.waves}</td>
                  <td class="col-time">${(r.timeMs / 1000).toFixed(1)}s</td>
                  <td class="col-outcome"><span class="badge ${isVic ? 'badge-victory' : 'badge-defeat'}">${r.result.toUpperCase()}</span></td>
                </tr>
              `;
            })
            .join('');

    const statsNotice = sortStats
      ? `<div class="dsa-notice">
          <span>⚡ <strong>Merge Sort Telemetry:</strong> ${sortStats.comparisons} comparisons &amp; ${sortStats.merges} merges performed on ${sortStats.elements} records</span>
         </div>`
      : '';

    return `
      <div class="table-scroll-frame">
        <table class="game-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>NAME</th>
              <th>SCORE</th>
              <th>WAVES</th>
              <th>TIME</th>
              <th>OUTCOME</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${statsNotice}
      ${gameResult ? '' : ''}
    `;
  }

  /* --------------------------------------------------------------- render */

  render(gameResult = null) {
    const chips = this.cloud?.identity
      ? `<span class="lb-chip">${escapeHtml(this.username)}</span>
         <span class="lb-chip lb-chip-mode">${escapeHtml(this.cloud.cloudLabel)}</span>`
      : `<span class="lb-chip lb-chip-mode">NO NAME</span>`;

    this.container.innerHTML = `
      <div id="leaderboard-modal" class="modal-overlay">
        <div class="modal-card modal-large">
          <div class="modal-header">
            <h1 class="modal-title"><img class="modal-title-icon" src="/assets/ui/icon_trophy.png" alt="" /> HALL OF CHAMPIONS</h1>
            <button id="btn-close-lb" class="btn-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="lb-head">
              <div class="lb-tabs" role="tablist" aria-label="Leaderboard source">
                <button class="lb-tab ${this.tab === 'realm' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${this.tab === 'realm'}" data-lb-tab="realm">REALM RANKING</button>
                <button class="lb-tab ${this.tab === 'device' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${this.tab === 'device'}" data-lb-tab="device">THIS DEVICE</button>
              </div>
              <div class="lb-chips">${chips}</div>
            </div>
            ${gameResult ? this._resultMarkup(gameResult) : ''}
            ${this.tab === 'realm' ? this._realmMarkup() : this._deviceMarkup(gameResult)}
          </div>
          <div class="modal-footer">
            <button id="btn-clear-lb" class="game-btn game-btn-danger">CLEAR THIS DEVICE</button>
            <button id="btn-done-lb" class="game-btn game-btn-subtle">BACK TO MENU</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(gameResult);
  }

  /** Re-render just the body after an async load. */
  _paint() {
    const body = this.container.querySelector('.modal-body');
    const modal = document.getElementById('leaderboard-modal');
    if (!body || !modal) {
      this.render(null);
      return;
    }
    const gameResult = this._pendingResult || null;
    body.innerHTML = `
      <div class="lb-head">
        <div class="lb-tabs" role="tablist" aria-label="Leaderboard source">
          <button class="lb-tab ${this.tab === 'realm' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${this.tab === 'realm'}" data-lb-tab="realm">REALM RANKING</button>
          <button class="lb-tab ${this.tab === 'device' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${this.tab === 'device'}" data-lb-tab="device">THIS DEVICE</button>
        </div>
        <div class="lb-chips">
          ${this.cloud?.identity ? `<span class="lb-chip">${escapeHtml(this.username)}</span><span class="lb-chip lb-chip-mode">${escapeHtml(this.cloud.cloudLabel)}</span>` : '<span class="lb-chip lb-chip-mode">NO NAME</span>'}
        </div>
      </div>
      ${gameResult ? this._resultMarkup(gameResult) : ''}
      ${this.tab === 'realm' ? this._realmMarkup() : this._deviceMarkup(gameResult)}
    `;
    this.bindEvents(gameResult);
  }

  /** The run that just ended, recorded under the commander's name. */
  _resultMarkup(gameResult) {
    const isVictory = gameResult.status === 'victory';
    const name = this.username || this.leaderboard.getTop()[0]?.name || 'KEEPER';
    return `
      <div class="result-summary-box ${isVictory ? 'victory-box' : 'defeat-box'}">
        <h2 class="result-title">${isVictory ? 'VICTORY ACHIEVED' : 'BASE OVERRUN'}</h2>
        <div class="result-stats">
          <div><span class="lbl">FINAL SCORE</span><span class="val gold-text">${gameResult.score}</span></div>
          <div><span class="lbl">WAVES CLEARED</span><span class="val">${gameResult.waves} / 6</span></div>
          <div><span class="lbl">ELAPSED TIME</span><span class="val">${(gameResult.timeMs / 1000).toFixed(1)}s</span></div>
        </div>
        <div class="submit-form" id="submit-score-form">
          <p class="lb-record-as">RECORDED AS <strong>${escapeHtml(name)}</strong></p>
          <button id="btn-save-score" class="game-btn game-btn-primary">RECORD THIS RUN</button>
        </div>
      </div>
    `;
  }

  bindEvents(gameResult = null) {
    this._pendingResult = gameResult;

    document.getElementById('btn-close-lb')?.addEventListener('click', () => this.hide());

    // Backdrop click closes the dialog (the table inside keeps its clicks).
    const overlay = document.getElementById('leaderboard-modal');
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) this.hide();
    });
    document.getElementById('btn-done-lb')?.addEventListener('click', () => {
      this.hide();
      if (this.callbacks.onReturnToMenu) this.callbacks.onReturnToMenu();
    });

    // Tabs.
    for (const tab of this.container.querySelectorAll('[data-lb-tab]')) {
      tab.addEventListener('click', () => {
        const next = tab.dataset.lbTab;
        if (next === this.tab) return;
        audio.playClick();
        this.tab = next;
        this.render(gameResult);
        if (next === 'realm') void this.loadRealm();
      });
    }

    document.getElementById('btn-retry-lb')?.addEventListener('click', () => {
      audio.playClick();
      void this.loadRealm();
    });

    // Record the run under the commander name (no more initials prompt: the
    // name is chosen once, at the gate, and it is the one the ledger knows).
    const saveBtn = document.getElementById('btn-save-score');
    if (saveBtn && gameResult) {
      saveBtn.addEventListener('click', () => {
        const name = this.username || 'KEEPER';
        audio.playCoin();
        const { rank, saved } = this.leaderboard.addRecord({
          name: name.slice(0, 16),
          score: gameResult.score,
          waves: gameResult.waves,
          timeMs: gameResult.timeMs,
          result: gameResult.status,
        });
        if (saved) {
          this.highlightRank = rank;
          this._pendingResult = null;
          this.render(null);
          // The run is banked locally; the ledger copy follows the save mirror.
          void this.cloud?.push?.('run');
        }
      });
    }

    // Clear confirmation — device records only; the realm ranking is not ours
    // to clear from a browser.
    document.getElementById('btn-clear-lb')?.addEventListener('click', () => {
      if (this.tab === 'realm') {
        audio.playError();
        return;
      }
      if (confirm('Clear the runs saved on this device? The realm ranking is not affected.')) {
        audio.playClick();
        this.leaderboard.clear();
        this.render(null);
      }
    });
  }
}

function formatNumber(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('en-US');
}

/* Rank plates are drawn, never emoji: the first three get the metal of a
   tournament shield, the rest a plain numeral. Emoji rank glyphs fell back to
   tofu boxes on systems without a colour-emoji font, which read as damage. */
function rankChip(rank) {
  const tier = rank <= 3 ? ` rank-chip--${['gold', 'silver', 'bronze'][rank - 1]}` : '';
  return `<span class="rank-chip${tier}">${rank}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
