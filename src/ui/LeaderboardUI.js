import { audio } from '../rendering/AudioSynth.js';
import { mountScreen } from './screenHost.js';
import {
  ALL_CATEGORY,
  LEADERBOARD_CATEGORIES,
  categoryInfo,
  categoryLabel,
  resolveCategory,
} from '../data/leaderboardCategories.js';
import { LEADERBOARD_DISPLAY_LIMIT } from '../config/gameConfig.js';

/**
 * LeaderboardUI.js — the Champions' Hall.
 *
 * The ranking used to be one 860 px dialog with a table inside it: on a
 * landscape phone the table frame collapsed to a 51 px sliver and the whole
 * thing read as a spreadsheet pasted on wood. It is now a hall with four
 * separate frames, each owning one idea:
 *
 *   PODIUM     the top three, one card each, with the gold banner emblem.
 *   THE ROLL   every other commander, one row each, name in gold.
 *   STANDING   the player's own place, whether or not they are on the page.
 *   THIS DEVICE the local run history (merge-sorted), one board per mode of
 *              play, which still works with no ledger at all.
 *
 * The realm ledger ranks *careers* (power, level, stars, medals), so it has no
 * per-run boards to split; the device tab is where runs live and where the mode
 * categories belong. Every board keeps its own ranking, because an Endless run
 * at wave 60 and a Campaign clear at wave 5 are not the same achievement and
 * must never be sorted against each other.
 *
 * Nothing here invents a ranking: with no ledger the hall says so, and the
 * device tab is still there.
 */

const PODIUM_METALS = ['gold', 'silver', 'bronze'];

/* Rows a board prints. The same limit the board itself stores/ranks with, so
   the table and the "of N" numbers never disagree. */
const LEADERBOARD_ROWS = LEADERBOARD_DISPLAY_LIMIT;

/* The boards without the synthetic overview key. */
const categoryBoards = () => LEADERBOARD_CATEGORIES;

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
    // Which board the device tab is showing. 'all' is the overview; a finished
    // run switches it to that run's own board, so the player lands where their
    // score actually went.
    this.mode = 'all';
    this.tab = this.cloud ? 'realm' : 'device';
    this.realm = { state: 'idle', rows: [], total: 0, mine: null, reason: '' };
    this.loadingToken = 0;
    this._pendingResult = null;
  }

  get username() {
    return this.cloud?.identity?.username || '';
  }

  get root() {
    return document.getElementById('leaderboard-modal');
  }

  show(gameResult = null) {
    audio.playClick();
    this._pendingResult = gameResult;
    if (gameResult) {
      // A finished run is filed on THIS DEVICE, and its summary — the one with
      // RECORD THIS RUN — only exists on that tab. Opening the hall on the
      // realm tab (which the ledger's presence used to force) hid the run the
      // player had just played and gave them no way to record it.
      this.tab = 'device';
      const board = resolveCategory(gameResult);
      if (board && board !== 'unknown') this.mode = board;
    }
    this.render(gameResult);
    this.root?.classList.remove('hidden');
    if (this.tab === 'realm') void this.loadRealm();
  }

  hide() {
    audio.playClick();
    this.root?.classList.add('hidden');
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

  /* -------------------------------------------------------------- pieces */

  /** The top three, as cards. Missing places keep the frame and say so. */
  _podiumMarkup(rows) {
    const cards = [0, 1, 2].map((index) => {
      const metal = PODIUM_METALS[index];
      const row = rows[index];
      if (!row) {
        return `
          <li class="lb-champ lb-champ--${metal} is-vacant">
            <span class="lb-champ-emblem" aria-hidden="true"></span>
            <span class="lb-champ-medal">${index + 1}</span>
            <p class="lb-champ-name">AWAITING A CHAMPION</p>
            <p class="lb-champ-sub">No commander has taken this place yet.</p>
          </li>`;
      }
      const isMe = this._isMe(row.username);
      return `
        <li class="lb-champ lb-champ--${metal} ${isMe ? 'is-me' : ''}">
          <span class="lb-champ-emblem" aria-hidden="true"></span>
          <span class="lb-champ-medal">${index + 1}</span>
          <p class="lb-champ-name" title="${escapeHtml(row.username)}">
            ${escapeHtml(row.username)}${isMe ? ' <span class="lb-you">YOU</span>' : ''}
          </p>
          <p class="lb-champ-power">${formatNumber(row.power)} <small>POWER</small></p>
          <p class="lb-champ-sub">LV ${row.level} · ${row.stars}★ · ${row.achievements} MEDALS</p>
        </li>`;
    });

    return `<ol class="lb-podium" aria-label="The top three commanders">${cards.join('')}</ol>`;
  }

  _isMe(username) {
    const mine = (this.username || this.realm.mine?.username || '').toLowerCase();
    return Boolean(mine) && String(username).toLowerCase() === mine;
  }

  /** Every commander below the podium, one highlighted name per row. */
  _rollMarkup(rows) {
    const rest = rows.slice(3);
    if (!rest.length) {
      return `<div class="lb-roll-empty">
          <p class="lb-roll-empty-title">THE PODIUM IS THE WHOLE LEDGER</p>
          <p class="lb-roll-empty-note">Only ${rows.length} commander${rows.length === 1 ? ' has' : 's have'} carved a name so far. Finish a battle to join them.</p>
        </div>`;
    }

    const body = rest
      .map((row) => {
        const isMe = this._isMe(row.username);
        return `
          <tr class="rank-row ${isMe ? 'is-me' : ''}">
            <td class="col-rank">${rankChip(row.rank)}</td>
            <td class="col-name">${namePlate(row.username, isMe)}</td>
            <td class="col-power">${formatNumber(row.power)}</td>
            <td class="col-level">${row.level}</td>
            <td class="col-stars">${row.stars}</td>
            <td class="col-medals">${row.achievements}</td>
          </tr>`;
      })
      .join('');

    return `
      <div class="table-scroll-frame lb-roll-frame">
        <table class="game-table lb-table">
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
      </div>`;
  }

  /** The player's own standing, in its own frame. */
  _standingMarkup() {
    const { mine, state, total } = this.realm;

    if (state !== 'ready' || !mine) {
      return `
        <p class="lb-stand-eyebrow">YOUR STANDING</p>
        <p class="lb-stand-name">${escapeHtml(this.username || 'NO NAME YET')}</p>
        <p class="lb-stand-note">${escapeHtml(
          this.cloud?.identity
            ? 'Your row appears here once your save reaches the ledger.'
            : 'Claim a commander name to appear in the realm ranking.'
        )}</p>`;
    }

    const onPodium = mine.rank && mine.rank <= 3;
    return `
      <p class="lb-stand-eyebrow">YOUR STANDING</p>
      <p class="lb-stand-rank"><span>#</span>${mine.rank}<small>of ${total}</small></p>
      <p class="lb-stand-name">${escapeHtml(mine.username)}</p>
      <dl class="lb-stand-grid">
        <div><dt>POWER</dt><dd>${formatNumber(mine.power)}</dd></div>
        <div><dt>LEVEL</dt><dd>${mine.level}</dd></div>
        <div><dt>STARS</dt><dd>${mine.stars}★</dd></div>
        <div><dt>MEDALS</dt><dd>${mine.achievements}</dd></div>
        <div><dt>BEST SCORE</dt><dd>${formatNumber(mine.bestScore || 0)}</dd></div>
        <div><dt>WAVES</dt><dd>${mine.waves || 0}</dd></div>
      </dl>
      <p class="lb-stand-note">${onPodium
        ? 'You hold a place on the podium. Defend it.'
        : 'Climb by banking stars, medals and commander levels.'}</p>`;
  }

  /** Everything the realm tab puts in the body. */
  _realmBodyMarkup() {
    const { state, rows, total, reason } = this.realm;

    if (state === 'off') {
      return `<div class="lb-full-frame lb-notice">
          <p class="lb-roll-empty-title">NO LEDGER CONNECTED</p>
          <p class="lb-roll-empty-note">
            The realm ranking is stored in Supabase. This build has no ledger address, so only this
            device's runs are recorded. Set <code>VITE_SUPABASE_URL</code> and
            <code>VITE_SUPABASE_ANON_KEY</code> (see <code>supabase/README.md</code>).
          </p>
        </div>`;
    }

    if (state === 'loading' || state === 'idle') {
      return `<div class="lb-full-frame lb-notice">
          <p class="lb-roll-empty-title">READING THE LEDGER…</p>
          <p class="lb-roll-empty-note">The Hall is fetching every carved name.</p>
        </div>`;
    }

    if (state === 'error') {
      return `<div class="lb-full-frame lb-notice">
          <p class="lb-roll-empty-title">THE LEDGER DID NOT ANSWER</p>
          <p class="lb-roll-empty-note">${escapeHtml(
            reason === 'offline' || reason === 'timeout'
              ? 'The connection dropped. Your save is safe on this device and will be sent again when the ledger is reachable.'
              : `Reason: ${reason}`
          )}</p>
          <button class="game-btn" id="btn-retry-lb" type="button">TRY AGAIN</button>
        </div>`;
    }

    if (!rows.length) {
      return `<div class="lb-full-frame lb-notice">
          <p class="lb-roll-empty-title">NO COMMANDERS YET</p>
          <p class="lb-roll-empty-note">Be the first name in the ledger — finish a battle to bank your power.</p>
        </div>`;
    }

    return `
      <section class="lb-block lb-block--podium" aria-labelledby="lb-podium-title">
        <p class="lb-block-title" id="lb-podium-title">THE PODIUM</p>
        ${this._podiumMarkup(rows)}
      </section>
      <section class="lb-block lb-block--roll" aria-labelledby="lb-roll-title">
        <p class="lb-block-title" id="lb-roll-title">THE ROLL</p>
        ${this._rollMarkup(rows)}
      </section>
      <aside class="lb-block lb-block--stand" aria-label="Your standing">
        ${this._standingMarkup()}
      </aside>`;
  }

  /* -------------------------------------------------------------- device */

  /**
   * The category strip: one key per board, each with how many runs it holds.
   *
   * Empty boards still get a key (the point is to show every mode the game
   * plays, including the ones this player has not finished yet), dimmed, and
   * clicking one explains what fills it instead of showing a blank table. The
   * strip scrolls sideways rather than wrapping so it cannot squeeze the table
   * on a landscape phone.
   */
  _categoryStripMarkup(counts) {
    const keys = [ALL_CATEGORY, ...this._boardsWithRuns(counts)].map((category) => {
      const count = counts[category.id] || 0;
      const active = this.mode === category.id;
      return `<button class="lb-mode ${active ? 'is-active' : ''} ${count === 0 ? 'is-empty' : ''}"
          type="button" role="tab" aria-selected="${active}"
          data-lb-mode="${category.id}" title="${escapeHtml(category.title)}">
          <span class="lb-mode-label">${escapeHtml(category.label)}</span>
          <span class="lb-mode-count">${count}</span>
        </button>`;
    });
    return `<div class="lb-modes" role="tablist" aria-label="Mode category">${keys.join('')}</div>`;
  }

  /**
   * Every board, minus the legacy bucket when it is empty.
   *
   * "UNFILED" is real but it is not a mode of play: showing it to a player who
   * has no unfiled runs would read as a category they somehow missed.
   */
  _boardsWithRuns(counts) {
    return categoryBoards().filter((category) => !category.legacy || (counts[category.id] || 0) > 0);
  }

  _deviceBodyMarkup(gameResult) {
    const counts = this.leaderboard.getCounts();
    const board = this.mode;
    const topRecords = this.leaderboard.getTop(LEADERBOARD_ROWS, board);
    const sortStats = this.leaderboard.lastSortStats;

    const rowsHtml =
      topRecords.length === 0
        ? `<tr><td colspan="6" class="empty-table">${escapeHtml(
            board === 'all'
              ? 'No records carved in the stone yet. Defend the realm!'
              : categoryInfo(board).blurb
          )}</td></tr>`
        : topRecords
            .map((r, i) => {
              const rank = i + 1;
              const isHighlighted = rank === this.highlightRank;
              const isVic = r.result === 'victory';
              // On the overview the board is the one thing a row cannot imply,
              // so it is printed under the name rather than as a seventh column
              // that would strip the table of width on a phone.
              const tag =
                board === 'all'
                  ? `<span class="lb-run-mode">${escapeHtml(categoryLabel(r.mode))}</span>`
                  : '';
              return `
                <tr class="${isHighlighted ? 'highlight-row' : ''}">
                  <td class="col-rank">${rankChip(rank)}</td>
                  <td class="col-name">${namePlate(r.name, false)}${tag}</td>
                  <td class="col-power">${r.score}</td>
                  <td class="col-level">${r.waves}</td>
                  <td class="col-stars">${(r.timeMs / 1000).toFixed(1)}s</td>
                  <td class="col-medals"><span class="badge ${isVic ? 'badge-victory' : 'badge-defeat'}">${r.result.toUpperCase()}</span></td>
                </tr>`;
            })
            .join('');

    const statsNotice = sortStats
      ? `<div class="dsa-notice">
          <span><strong>Merge Sort Telemetry:</strong> ${sortStats.comparisons} comparisons &amp; ${sortStats.merges} merges performed on ${sortStats.elements} record${sortStats.elements === 1 ? '' : 's'}</span>
         </div>`
      : '';

    return `
      ${gameResult ? this._resultMarkup(gameResult) : ''}
      <section class="lb-block lb-block--device" aria-label="Records on this device">
        <div class="lb-device-head">
          <p class="lb-block-title">RECORDS ON THIS DEVICE</p>
          <p class="lb-board-note">${escapeHtml(board === 'all' ? ALL_CATEGORY.title : categoryInfo(board).title)} · ranked on this board alone</p>
        </div>
        ${this._categoryStripMarkup(counts)}
        <div class="table-scroll-frame lb-roll-frame">
          <table class="game-table lb-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>COMMANDER</th>
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
      </section>`;
  }

  /* --------------------------------------------------------------- render */

  render(gameResult = this._pendingResult) {
    this._pendingResult = gameResult;
    const isRealm = this.tab === 'realm';
    const chips = this.cloud?.identity
      ? `<span class="lb-chip">${escapeHtml(this.username)}</span>
         <span class="lb-chip lb-chip-mode">${escapeHtml(this.cloud.cloudLabel)}</span>`
      : `<span class="lb-chip lb-chip-mode">NO NAME</span>`;

    const sourceNote = isRealm
      ? `RANKED BY POWER → COMMANDER LEVEL → STARS · ${escapeHtml(this.cloud?.cloudLabel || 'LOCAL')} LEDGER`
      : 'RUNS ARE STORED ON THIS DEVICE ONLY';

    mountScreen(
      this.container,
      'leaderboard-modal',
      `
      <div id="leaderboard-modal" class="overlay-screen lb-screen" role="dialog" aria-modal="true" aria-label="Hall of Champions">
        <div class="lb-hall-art" aria-hidden="true"></div>
        <div class="lb-hall-scrim" aria-hidden="true"></div>
        <div class="overlay-shell lb-shell">
          <header class="lb-head">
            <div class="lb-head-title">
              <p class="lb-eyebrow">THE CHAMPIONS' HALL</p>
              <h1 class="overlay-title">HALL OF CHAMPIONS</h1>
            </div>
            <div class="lb-tabs" role="tablist" aria-label="Leaderboard source">
              <button class="lb-tab ${isRealm ? 'is-active' : ''}" type="button" role="tab" aria-selected="${isRealm}" data-lb-tab="realm">REALM</button>
              <button class="lb-tab ${!isRealm ? 'is-active' : ''}" type="button" role="tab" aria-selected="${!isRealm}" data-lb-tab="device">THIS DEVICE</button>
            </div>
            <div class="lb-chips">${chips}</div>
            <button id="btn-close-lb" class="btn-close" aria-label="Close the hall">✕</button>
          </header>

          <div class="lb-body" data-tab="${this.tab}">
            ${isRealm ? this._realmBodyMarkup() : this._deviceBodyMarkup(gameResult)}
          </div>

          <footer class="lb-foot">
            <p class="lb-source">${sourceNote}</p>
            <div class="lb-actions">
              ${!isRealm ? '<button id="btn-clear-lb" class="game-btn game-btn-danger" type="button">CLEAR THIS DEVICE</button>' : ''}
              <button id="btn-done-lb" class="game-btn game-btn-subtle" type="button">BACK TO MENU</button>
            </div>
          </footer>
        </div>
      </div>
    `
    );

    this._bindChrome(gameResult);
    this._markScrollableFrames();
    this.bindEvents(gameResult);
  }

  /** Re-render just the body after an async load. */
  _paint() {
    const body = this.root?.querySelector('.lb-body');
    if (!body) {
      this.render(this._pendingResult);
      return;
    }
    const gameResult = this._pendingResult || null;
    body.dataset.tab = this.tab;
    body.innerHTML =
      this.tab === 'realm' ? this._realmBodyMarkup() : this._deviceBodyMarkup(gameResult);
    this._markScrollableFrames();
    this.bindEvents(gameResult);
  }

  /**
   * Flag the frames that really overflow, in both directions.
   *
   * The bottom fade and the right-edge fade are the only things telling a
   * player that a list continues; drawn unconditionally they dim a two-row
   * board and a strip that already fits, which reads as a rendering fault.
   * Measured after paint, so it is true rather than guessed from the row count.
   */
  _markScrollableFrames() {
    for (const frame of this.container.querySelectorAll('.lb-roll-frame')) {
      const overflows = frame.scrollHeight - frame.clientHeight > 2;
      frame.classList.toggle('is-scrollable', overflows);
    }
    for (const strip of this.container.querySelectorAll('.lb-modes')) {
      const overflows = strip.scrollWidth - strip.clientWidth > 2;
      strip.classList.toggle('is-scrollable', overflows);
    }

    // The device column can scroll as a whole on a short window (the run
    // summary must stay reachable above the table), so the frame above is not
    // what overflows. The body carries its own fade while there is more below.
    const body = this.root?.querySelector('.lb-body');
    if (!body) return;
    const sync = () => {
      const overflows = body.scrollHeight - body.clientHeight > 2;
      const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
      body.classList.toggle('is-scrollable', overflows);
      body.classList.toggle('is-scroll-end', atEnd);
    };
    sync();
    if (body.dataset.scrollBound !== '1') {
      body.dataset.scrollBound = '1';
      body.addEventListener('scroll', sync, { passive: true });
    }
  }

  /** The run that just ended, recorded under the commander's name. */
  _resultMarkup(gameResult) {
    const isVictory = gameResult.status === 'victory';
    const name = this.username || this.leaderboard.getTop(1)[0]?.name || 'KEEPER';
    const board = categoryInfo(resolveCategory(gameResult));
    // Endless and every mode run have no wave total ("30 / 6" was a lie the old
    // card printed); a number with a total only when the mode has one.
    const totalWaves = Number(gameResult.totalWaves);
    const waves = Number.isFinite(totalWaves) && totalWaves > 0
      ? `${gameResult.waves} / ${totalWaves}`
      : String(gameResult.waves);
    return `
      <div class="result-summary-box ${isVictory ? 'victory-box' : 'defeat-box'}">
        <div class="lb-result-head">
          <h2 class="result-title">${isVictory ? 'VICTORY ACHIEVED' : 'BASE OVERRUN'}</h2>
          <p class="lb-result-board">FILED UNDER <strong>${escapeHtml(board.title)}</strong></p>
        </div>
        <div class="result-stats">
          <div><span class="lbl">FINAL SCORE</span><span class="val gold-text">${gameResult.score}</span></div>
          <div><span class="lbl">WAVES CLEARED</span><span class="val">${waves}</span></div>
          <div><span class="lbl">ELAPSED TIME</span><span class="val">${(gameResult.timeMs / 1000).toFixed(1)}s</span></div>
        </div>
        <div class="submit-form" id="submit-score-form">
          <p class="lb-record-as">RECORDED AS <strong>${escapeHtml(name)}</strong></p>
          <button id="btn-save-score" class="game-btn game-btn-primary" type="button">RECORD THIS RUN</button>
        </div>
      </div>
    `;
  }

  /**
   * Bind everything that lives outside `.lb-body`.
   *
   * These nodes are rebuilt by `render()` and untouched by `_paint()`, so they
   * are wired exactly once per render. Binding them from `_paint()` too stacked
   * a second backdrop listener on every load, which made one click on the dim
   * close the hall twice (and fire `onClose` twice with it).
   */
  _bindChrome(gameResult) {
    document.getElementById('btn-close-lb')?.addEventListener('click', () => this.hide());

    // Backdrop click closes the hall (the shell keeps its own clicks).
    const overlay = this.root;
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) this.hide();
    });
    document.getElementById('btn-done-lb')?.addEventListener('click', () => {
      this.hide();
      if (this.callbacks.onReturnToMenu) this.callbacks.onReturnToMenu();
    });

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
  }

  /** Bind the parts that `_paint()` replaces. */
  bindEvents(gameResult = null) {
    this._pendingResult = gameResult;

    // Category chips live inside the repainted body, so they are bound here
    // with the rest of the body and never from `_bindChrome` (that would stack
    // a second listener on every paint).
    for (const chip of this.container.querySelectorAll('[data-lb-mode]')) {
      chip.addEventListener('click', () => {
        const next = chip.dataset.lbMode;
        if (!next || next === this.mode) return;
        audio.playClick();
        this.mode = next;
        this.highlightRank = null;
        this._paint();
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
        const mode = resolveCategory(gameResult);
        const { rank, saved } = this.leaderboard.addRecord({
          name: name.slice(0, 16),
          score: gameResult.score,
          waves: gameResult.waves,
          timeMs: gameResult.timeMs,
          result: gameResult.status,
          mode,
        });
        if (saved) {
          // Land on the board the run was just filed on, with the new row lit.
          this.mode = mode;
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

/* The commander name is the thing a player scans for, so it is gold, spaced and
   set in the display face; the "YOU" mark is drawn, never an emoji. */
function namePlate(name, isMe) {
  return `<span class="lb-name${isMe ? ' is-me' : ''}" title="${escapeHtml(name)}">${escapeHtml(name)}${
    isMe ? ' <span class="lb-you">YOU</span>' : ''
  }</span>`;
}

/* Rank plates are drawn, never emoji: the first three get the metal of a
   tournament shield, the rest a plain numeral. Emoji rank glyphs fell back to
   tofu boxes on systems without a colour-emoji font, which read as damage. */
function rankChip(rank) {
  const tier = rank <= 3 ? ` rank-chip--${PODIUM_METALS[rank - 1]}` : '';
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
