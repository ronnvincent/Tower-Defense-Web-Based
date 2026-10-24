import { buyRelic, relicBoard, relicSummary } from '../systems/Relics.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * ForgeUI — the gem sink.
 *
 * Relics are permanent, so the screen has to answer three questions at a
 * glance: what do I own, what does the next level do, and can I afford it. The
 * cards are rendered from `relicBoard` (data + prices + affordability) so the
 * UI never re-implements the purchase rules.
 */
export class ForgeUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{ onClose?: () => void, onPurchase?: (info:object) => void }} callbacks
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
    document.getElementById('forge-screen')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('forge-screen')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  cardMarkup(relic) {
    const pips = Array.from({ length: relic.maxLevel }, (_, i) => {
      const filled = i < relic.level;
      return `<i class="relic-pip ${filled ? 'filled' : ''}"></i>`;
    }).join('');

    const action = relic.maxed
      ? '<span class="relic-maxed">MASTERED</span>'
      : `<button class="game-btn forge-buy ${relic.affordable ? 'game-btn-primary' : ''}"
                 data-relic="${relic.id}" ${relic.affordable ? '' : 'disabled aria-disabled="true"'}>
           ${relic.level === 0 ? 'FORGE' : 'UPGRADE'} · ${relic.cost}💎
         </button>`;

    return `
      <li class="relic-card ${relic.level > 0 ? 'owned' : ''} ${relic.maxed ? 'maxed' : ''}"
          data-id="${relic.id}" style="--relic-accent:${relic.maxed ? '#ffd166' : '#9fe7ff'}">
        <span class="relic-icon" aria-hidden="true">${relic.icon}</span>
        <div class="relic-body">
          <div class="relic-head">
            <span class="relic-name">${relic.name}</span>
            <span class="relic-pips" aria-label="${relic.level} of ${relic.maxLevel}">${pips}</span>
          </div>
          <p class="relic-desc">${relic.desc}</p>
          <p class="relic-effect">
            ${relic.level > 0 ? `<span class="now">Now: ${relic.current}</span>` : ''}
            ${relic.next ? `<span class="next">Next: ${relic.next}</span>` : ''}
          </p>
        </div>
        <div class="relic-action">${action}</div>
      </li>
    `;
  }

  render() {
    const relics = this.progress.profile.relics || {};
    const board = relicBoard(relics, this.progress.gems);
    const summary = relicSummary(relics);

    this.container.innerHTML = `
      <div id="forge-screen" class="overlay-screen" role="dialog" aria-label="Forge">
        <div class="overlay-shell forge-shell">
          <header class="overlay-header">
            <h1 class="overlay-title">THE FORGE</h1>
            <p class="wallet-row">
              <span class="wallet"><img src="/assets/ui/icon_gem.png" alt="" /> ${this.progress.gems} gems</span>
              <span class="wallet">${summary.levels} / ${summary.maxLevels} relic levels</span>
              <span class="wallet">${summary.owned} / ${summary.total} relics owned</span>
            </p>
            <p class="forge-note">Relics are permanent and apply to every battle — campaign, endless and daily.</p>
          </header>

          <ul class="relic-grid">
            ${board.map((relic) => this.cardMarkup(relic)).join('')}
          </ul>

          <footer class="overlay-actions">
            <button id="btn-forge-back" class="game-btn">BACK</button>
          </footer>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.forge-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const info = buyRelic(
          this.progress.profile.relics || {},
          btn.dataset.relic,
          this.progress.gems
        );
        if (!info) {
          audio.playError();
          return;
        }
        this.progress.profile.relics = info.relics;
        this.progress.profile.gems -= info.cost;
        this.progress.save();
        audio.playVictory();
        this.callbacks.onPurchase?.({ id: info.id, level: info.level, cost: info.cost });
        this.render();
      });
    });

    this.container.querySelector('#btn-forge-back')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
      this.callbacks.onClose?.();
    });
  }
}
