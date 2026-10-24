import { audio } from '../rendering/AudioSynth.js';

export class LeaderboardUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Leaderboard.js').Leaderboard} leaderboard
   * @param {object} callbacks
   */
  constructor(container, leaderboard, callbacks) {
    this.container = container;
    this.leaderboard = leaderboard;
    this.callbacks = callbacks;
    this.highlightRank = null;
  }

  show(gameResult = null) {
    audio.playClick();
    this.render(gameResult);
    const modal = document.getElementById('leaderboard-modal');
    modal.classList.remove('hidden');
  }

  hide() {
    audio.playClick();
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.classList.add('hidden');
    this.highlightRank = null;
    if (this.callbacks.onClose) this.callbacks.onClose();
  }

  render(gameResult = null) {
    const topRecords = this.leaderboard.getTop();
    const sortStats = this.leaderboard.lastSortStats;

    let submitSection = '';
    if (gameResult) {
      const isVictory = gameResult.status === 'victory';
      submitSection = `
        <div class="result-summary-box ${isVictory ? 'victory-box' : 'defeat-box'}">
          <h2 class="result-title">${isVictory ? '🎉 VICTORY ACHIEVED!' : '💀 BASE OVERRUN'}</h2>
          <div class="result-stats">
            <div><span class="lbl">FINAL SCORE</span><span class="val gold-text">${gameResult.score}</span></div>
            <div><span class="lbl">WAVES CLEARED</span><span class="val">${gameResult.waves} / 6</span></div>
            <div><span class="lbl">ELAPSED TIME</span><span class="val">${(gameResult.timeMs / 1000).toFixed(1)}s</span></div>
          </div>
          <div class="submit-form" id="submit-score-form">
            <input type="text" id="player-name-input" maxlength="14" placeholder="ENTER YOUR INITIALS" class="game-input" autofocus />
            <button id="btn-save-score" class="game-btn game-btn-primary">RECORD TO LEADERBOARD</button>
          </div>
        </div>
      `;
    }

    const rowsHtml = topRecords.length === 0
      ? `<tr><td colspan="6" class="empty-table">No records carved in the stone yet. Defend the realm!</td></tr>`
      : topRecords.map((r, i) => {
          const rank = i + 1;
          const isHighlighted = rank === this.highlightRank;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
          const isVic = r.result === 'victory';
          return `
            <tr class="${isHighlighted ? 'highlight-row' : ''}">
              <td class="col-rank">${medal}</td>
              <td class="col-name font-bold">${escapeHtml(r.name)}</td>
              <td class="col-score gold-text font-bold">${r.score}</td>
              <td class="col-waves">${r.waves}</td>
              <td class="col-time">${(r.timeMs / 1000).toFixed(1)}s</td>
              <td class="col-outcome"><span class="badge ${isVic ? 'badge-victory' : 'badge-defeat'}">${r.result.toUpperCase()}</span></td>
            </tr>
          `;
        }).join('');

    const statsNotice = sortStats
      ? `<div class="dsa-notice">
          <span>⚡ <strong>Merge Sort Telemetry:</strong> ${sortStats.comparisons} comparisons &amp; ${sortStats.merges} merges performed on ${sortStats.elements} records</span>
         </div>`
      : '';

    this.container.innerHTML = `
      <div id="leaderboard-modal" class="modal-overlay">
        <div class="modal-card modal-large">
          <div class="modal-header">
            <h1 class="modal-title"><img class="modal-title-icon" src="/assets/ui/icon_trophy.png" alt="" /> HALL OF CHAMPIONS (LOCAL LEADERBOARD)</h1>
            <button id="btn-close-lb" class="btn-close">✕</button>
          </div>
          <div class="modal-body">
            ${submitSection}
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
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
            ${statsNotice}
          </div>
          <div class="modal-footer">
            <button id="btn-clear-lb" class="game-btn game-btn-danger">CLEAR DATA</button>
            <button id="btn-done-lb" class="game-btn game-btn-subtle">BACK TO MENU</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(gameResult);
  }

  bindEvents(gameResult) {
    document.getElementById('btn-close-lb')?.addEventListener('click', () => this.hide());
    document.getElementById('btn-done-lb')?.addEventListener('click', () => {
      this.hide();
      if (this.callbacks.onReturnToMenu) this.callbacks.onReturnToMenu();
    });

    // Save score submit
    const saveBtn = document.getElementById('btn-save-score');
    const nameInput = document.getElementById('player-name-input');
    if (saveBtn && nameInput && gameResult) {
      const handleSave = () => {
        const name = nameInput.value.trim() || 'Hero';
        audio.playCoin();
        const { rank, saved } = this.leaderboard.addRecord({
          name,
          score: gameResult.score,
          waves: gameResult.waves,
          timeMs: gameResult.timeMs,
          result: gameResult.status,
        });
        if (saved) {
          this.highlightRank = rank;
          this.render(null); // re-render table with highlight and form removed
        }
      };

      saveBtn.addEventListener('click', handleSave);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSave();
      });
    }

    // Clear confirmation
    document.getElementById('btn-clear-lb')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all stored leaderboard records? This cannot be undone.')) {
        audio.playClick();
        this.leaderboard.clear();
        this.render(null);
      }
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
