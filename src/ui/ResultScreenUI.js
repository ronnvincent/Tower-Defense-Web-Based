import { ALL_LEVELS, getNextLevel } from '../data/levelData.js';
import { STAR_MAX } from '../systems/Progression.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * ResultScreenUI — the victory / defeat / endless summary.
 *
 * Replaces the old "open the leaderboard and stop" flow. A win shows the star
 * rating it just earned, the meta rewards banked, and what it unlocked; a loss
 * shows how far the run got and offers a retry. The leaderboard is still one
 * tap away, so the merge-sort demo keeps its entry point.
 */
/** Human-readable name for a level id, for unlock announcements. */
function levelName(id) {
  if (id === 'endless') return 'Endless Siege';
  return ALL_LEVELS.find((level) => level.id === id)?.name || 'A new battle';
}

export class ResultScreenUI {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   onNext?: () => void,
   *   onReplay?: () => void,
   *   onMenu?: () => void,
   *   onLeaderboard?: (result:object) => void,
   * }} callbacks
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.result = null;
  }

  starMarkup(stars) {
    let html = '<div class="result-stars" aria-hidden="true">';
    for (let i = 0; i < STAR_MAX; i += 1) {
      const earned = i < stars;
      html += `<img class="result-star ${earned ? 'earned' : ''}" style="animation-delay:${i * 0.14}s"
                    src="/assets/ui/star_${earned ? 'gold' : 'empty'}.png" alt="" />`;
    }
    html += '</div>';
    return `${html}<p class="sr-only">${stars} of ${STAR_MAX} stars</p>`;
  }

  hide() {
    const screen = document.getElementById('result-screen');
    if (screen) screen.classList.add('hidden');
    this.container.innerHTML = '';
    this.result = null;
  }

  /**
   * @param {{
   *   outcome: 'victory'|'defeat',
   *   level: object,
   *   stars?: number,
   *   rewards?: { gold:number, gems:number },
   *   unlocked?: string|null,
   *   score: number,
   *   waves: number,
   *   totalWaves?: number,
   *   timeMs: number,
   *   wave?: number,
   *   bestWave?: number,
   *   newRecord?: boolean,
   * }} result
   */
  show(result) {
    this.result = result;
    const { outcome, level, stars = 0, rewards = { gold: 0, gems: 0 } } = result;
    const victory = outcome === 'victory';
    const endless = Boolean(level?.endless);

    const nextLevel = !endless && victory ? getNextLevel(level.id) : null;
    // One clear can open two doors at once (level 2 *and* Endless Siege), so
    // announce every id the store reported instead of only the first.
    const unlockedIds = Array.isArray(result.unlockedAll) && result.unlockedAll.length
      ? result.unlockedAll
      : result.unlocked
        ? [result.unlocked]
        : [];
    const campaignComplete = !endless && victory && level?.index === ALL_LEVELS.filter((l) => !l.endless).length;

    const statRows = endless
      ? `
        <div class="result-stat"><span class="lbl">WAVE REACHED</span><span class="val">${result.wave || 0}</span></div>
        <div class="result-stat"><span class="lbl">BEST WAVE</span><span class="val gold-text">${result.bestWave || 0}</span></div>
        <div class="result-stat"><span class="lbl">SCORE</span><span class="val">${result.score}</span></div>
      `
      : `
        <div class="result-stat"><span class="lbl">SCORE</span><span class="val gold-text">${result.score}</span></div>
        <div class="result-stat"><span class="lbl">WAVES</span><span class="val">${result.waves} / ${result.totalWaves ?? result.waves}</span></div>
        <div class="result-stat"><span class="lbl">TIME</span><span class="val">${(result.timeMs / 1000).toFixed(1)}s</span></div>
      `;

    const rewardRow = victory && (rewards.gold || rewards.gems)
      ? `<div class="result-rewards">
           ${rewards.gold ? `<span class="wallet reward"><img src="/assets/ui/icon_coin.png" alt="" /> +${rewards.gold}</span>` : ''}
           ${rewards.gems ? `<span class="wallet reward"><img src="/assets/ui/icon_gem.png" alt="" /> +${rewards.gems}</span>` : ''}
         </div>`
      : '';

    const unlockRow = unlockedIds.length
      ? unlockedIds
          .map((id) => `<p class="result-unlock">🔓 ${levelName(id).toUpperCase()} UNLOCKED</p>`)
          .join('')
      : campaignComplete
        ? '<p class="result-unlock">🏆 CAMPAIGN COMPLETE — ENDLESS SIEGE AWAITS</p>'
        : victory && !endless
          ? '<p class="result-unlock subtle">Replay for a better star rating.</p>'
          : outcome === 'defeat' && endless
            ? `<p class="result-unlock subtle">${result.newRecord ? 'NEW RECORD!' : 'The horde keeps coming.'}</p>`
            : '';

    const actions = [];
    if (victory && nextLevel) {
      actions.push('<button id="result-next" class="game-btn game-btn-primary">NEXT LEVEL ▶</button>');
    }
    actions.push(`<button id="result-replay" class="game-btn">${victory ? 'REPLAY' : 'RETRY'}</button>`);
    actions.push('<button id="result-board" class="game-btn">LEADERBOARD</button>');
    actions.push('<button id="result-menu" class="game-btn">MAIN MENU</button>');

    this.container.innerHTML = `
      <div id="result-screen" class="overlay-screen" role="dialog" aria-label="${victory ? 'Victory' : 'Defeat'}">
        <div class="overlay-shell result-shell ${victory ? 'is-victory' : 'is-defeat'}">
          <div class="result-ribbon">${victory ? (endless ? 'RUN OVER' : 'VICTORY') : 'DEFEAT'}</div>
          <h1 class="result-heading">${level?.name || 'Bastion'}</h1>
          ${victory && !endless ? this.starMarkup(stars) : '<div class="result-stars defeat-mark" aria-hidden="true">💀</div>'}
          <div class="result-stats">${statRows}</div>
          ${rewardRow}
          ${unlockRow}
          <div class="overlay-actions">${actions.join('')}</div>
        </div>
      </div>
    `;

    this.bind();
  }

  bind() {
    this.container.querySelector('#result-next')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onNext?.();
    });
    this.container.querySelector('#result-replay')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onReplay?.();
    });
    this.container.querySelector('#result-menu')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onMenu?.();
    });
    this.container.querySelector('#result-board')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onLeaderboard?.(this.result);
    });
  }
}
