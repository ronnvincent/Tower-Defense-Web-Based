import { ALL_LEVELS, LEVELS, ENDLESS_LEVEL, THEMES } from '../data/levelData.js';
import { starSummary, STAR_MAX } from '../systems/Progression.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * LevelSelectUI — the world map.
 *
 * A row of stage nodes, one per level plus Endless Siege. Each node shows the
 * battlefield thumbnail, the level's stars, and a lock when it has not been
 * unlocked yet. The whole overlay is rendered from the same levelData the
 * GameScene reads, so adding a level is a data edit.
 */
export class LevelSelectUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{ onSelectLevel?: (id:string) => void, onClose?: () => void }} callbacks
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
    document.getElementById('level-select')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('level-select')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  starMarkup(stars, max = STAR_MAX) {
    let html = '<span class="star-row" aria-hidden="true">';
    for (let i = 0; i < max; i += 1) {
      html += `<img class="star ${i < stars ? 'earned' : ''}" src="/assets/ui/star_${i < stars ? 'gold' : 'empty'}.png" alt="" />`;
    }
    return `${html}</span><span class="sr-only">${stars} of ${max} stars</span>`;
  }

  nodeMarkup(level) {
    const unlocked = this.progress.isUnlocked(level.id);
    const stars = this.progress.starsFor(level.id);
    const theme = THEMES[level.theme] || THEMES.grassland;
    const isEndless = Boolean(level.endless);
    const best = level.endless ? this.progress.profile.endlessBestWave : 0;

    return `
      <button class="level-node ${unlocked ? '' : 'locked'} ${isEndless ? 'endless' : ''}"
              data-level="${level.id}" ${unlocked ? '' : 'disabled aria-disabled="true"'}
              style="--node-accent:${theme.accent}"
              aria-label="${level.name}">
        <span class="node-badge">${isEndless ? '∞' : level.index}</span>
        <span class="node-art" style="background-image:url('/assets/ui/map_${level.theme}.png')"></span>
        <span class="node-body">
          <span class="node-name">${level.name}</span>
          <span class="node-blurb">${level.blurb}</span>
          <span class="node-meta">
            ${isEndless
              ? `<span class="node-best">BEST: WAVE ${best || 0}</span>`
              : this.starMarkup(stars)}
            ${unlocked ? '' : '<img class="node-lock" src="/assets/ui/lock.png" alt="Locked" />'}
          </span>
        </span>
      </button>
    `;
  }

  render() {
    const campaign = LEVELS.map((level) => this.nodeMarkup(level)).join('');
    const endless = this.nodeMarkup(ENDLESS_LEVEL);

    this.container.innerHTML = `
      <div id="level-select" class="overlay-screen" role="dialog" aria-label="Level select">
        <div class="overlay-shell level-select-shell">
          <header class="overlay-header">
            <h1 class="overlay-title">CHOOSE YOUR BATTLE</h1>
            <p class="wallet-row">
              <span class="wallet"><img src="/assets/ui/icon_coin.png" alt="" /> ${this.progress.gold}</span>
              <span class="wallet"><img src="/assets/ui/icon_gem.png" alt="" /> ${this.progress.gems}</span>
              <span class="wallet"><img src="/assets/ui/star_gold.png" alt="" /> ${starSummary(this.progress)}</span>
            </p>
          </header>

          <div class="level-track">
            <div class="track-line" aria-hidden="true"></div>
            ${campaign}
            ${endless}
          </div>

          <p class="overlay-note">Clear a level to unlock the next one. Endless Siege opens with your first victory.</p>

          <footer class="overlay-actions">
            <button id="btn-level-back" class="game-btn">MAIN MENU</button>
          </footer>
        </div>
      </div>
    `;

    this.bind();
  }

  bind() {
    for (const node of this.container.querySelectorAll('.level-node')) {
      node.addEventListener('click', () => {
        if (node.disabled) return;
        audio.playClick();
        const id = node.dataset.level;
        this.callbacks.onSelectLevel?.(id);
      });
    }
    this.container.querySelector('#btn-level-back')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
      this.callbacks.onClose?.();
    });
  }
}

/** Exported for tests: every selectable node id, campaign first. */
export const SELECTABLE_LEVEL_IDS = ALL_LEVELS.map((level) => level.id);
