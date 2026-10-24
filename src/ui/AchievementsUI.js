import { achievementBoard, achievementSummary } from '../systems/Achievements.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * AchievementsUI — the checklist, grouped by category.
 *
 * One entry costs nothing to render: the board comes pre-joined with progress
 * (see `achievementBoard`), so the markup is a map over data. Locked entries
 * still show their progress bar, which is the whole point of a checklist —
 * "you are 3 kills from the next gem".
 */
export class AchievementsUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{ onClose?: () => void }} callbacks
   */
  constructor(container, progress, callbacks = {}) {
    this.container = container;
    this.progress = progress;
    this.callbacks = callbacks;
    this.visible = false;
  }

  show() {
    this.render();
    this.visible = true;
    document.getElementById('achievements-screen')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('achievements-screen')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  itemMarkup(item) {
    const pct = Math.round(item.ratio * 100);
    return `
      <li class="ach-item ${item.unlocked ? 'unlocked' : ''}" data-id="${item.id}">
        <span class="ach-icon" aria-hidden="true">${item.icon}</span>
        <span class="ach-body">
          <span class="ach-head">
            <span class="ach-name">${item.name}</span>
            <span class="ach-gems">+${item.gems}💎</span>
          </span>
          <span class="ach-desc">${item.desc}</span>
          <span class="ach-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${item.target}" aria-valuenow="${item.value}">
            <i style="width:${pct}%"></i>
          </span>
          <span class="ach-count">${Math.min(item.value, item.target)} / ${item.target}${item.unlocked ? ' · claimed' : ''}</span>
        </span>
      </li>
    `;
  }

  render() {
    const board = achievementBoard(this.progress.stats, this.progress.achievements);
    const summary = achievementSummary(this.progress.stats, this.progress.achievements);

    this.container.innerHTML = `
      <div id="achievements-screen" class="overlay-screen" role="dialog" aria-label="Achievements">
        <div class="overlay-shell achievements-shell">
          <header class="overlay-header">
            <h1 class="overlay-title">ACHIEVEMENTS</h1>
            <p class="ach-summary">
              <strong>${summary.unlocked} / ${summary.total}</strong> claimed ·
              ${summary.gemsEarned}💎 banked · ${summary.gemsRemaining}💎 still on the board
            </p>
          </header>
          <div class="ach-grid">
            ${board
              .map(
                (group) => `
              <section class="ach-group">
                <h2 class="ach-group-title">${group.category.toUpperCase()}</h2>
                <ul class="ach-list">${group.items.map((item) => this.itemMarkup(item)).join('')}</ul>
              </section>`
              )
              .join('')}
          </div>
          <footer class="overlay-actions">
            <button id="btn-achievements-back" class="game-btn">BACK</button>
          </footer>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-achievements-back')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
      this.callbacks.onClose?.();
    });
  }
}
