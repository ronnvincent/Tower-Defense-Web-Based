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
   *   onMap?: (result:object) => void,
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
      // The burst blooms a beat after its star lands, so the card reads as
      // three separate hits instead of one three-star block appearing at once.
      html += `<span class="result-star-slot ${earned ? 'earned' : ''}"
                    style="--delay:${0.24 + i * 0.16}s">
                 ${earned ? '<i class="result-star-burst"></i>' : ''}
                 <img class="result-star ${earned ? 'earned' : ''}" style="animation-delay:${0.24 + i * 0.16}s"
                      src="/assets/ui/star_${earned ? 'gold' : 'empty'}.png" alt="" />
               </span>`;
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
    // A finished campaign means: the last campaign node, no NEXT node behind
    // it, and a normal campaign run. Mode levels (Titan Rush, Blueprints) also
    // have no NEXT node, and must not claim the campaign is over.
    const campaignComplete =
      !endless && victory && !result.mode && level?.id && !getNextLevel(level.id);
    // A replay that beats the saved rating is the one thing a returning player
    // wants to see; a first clear is already obvious from the stars themselves.
    const recordRun = victory && !endless && (result.previousStars ?? 0) > 0 && stars > (result.previousStars ?? 0);

    const statRows = endless
      ? `
        <div class="result-stat"><span class="lbl">WAVE REACHED</span><span class="val">${result.wave || 0}</span></div>
        <div class="result-stat"><span class="lbl">BEST WAVE</span><span class="val gold-text">${result.bestWave || 0}</span></div>
        <div class="result-stat"><span class="lbl">SCORE</span><span class="val">${result.score}</span></div>
      `
      : `
        <div class="result-stat"><span class="lbl">SCORE</span><span class="val gold-text" data-count="${result.score}">${result.score}</span></div>
        <div class="result-stat"><span class="lbl">WAVES</span><span class="val">${result.waves} / ${result.totalWaves ?? result.waves}</span></div>
        <div class="result-stat"><span class="lbl">TIME</span><span class="val" data-count="${(result.timeMs / 1000).toFixed(1)}" data-decimals="1" data-suffix="s">${(result.timeMs / 1000).toFixed(1)}s</span></div>
      `;

    const rewardRow = victory && (rewards.gold || rewards.gems)
      ? `<div class="result-rewards">
           ${rewards.gold ? `<span class="wallet reward"><img src="/assets/ui/icon_coin.png" alt="" /> +${rewards.gold}</span>` : ''}
           ${rewards.gems ? `<span class="wallet reward"><img src="/assets/ui/icon_gem.png" alt="" /> +${rewards.gems}</span>` : ''}
         </div>`
      : '';

    // Daily runs and achievement payouts are meta progress, so they sit below
    // the run numbers instead of competing with the star rating.
    // Kit sprites instead of emoji: the card must not depend on the browser
    // shipping a colour-emoji font (a headless Chromium renders those as boxes).
    const icon = (src) => `<img class="result-inline-icon" src="${src}" alt="" />`;
    const dailyRow = result.daily
      ? `<p class="result-daily">${icon('/assets/ui-kit/glyph_calendar.png')} DAILY · ${
          result.daily.modifier?.name || 'Challenge'
        }${result.daily.streak ? ` · ${icon('/assets/ui-kit/glyph_flame.png')} ${result.daily.streak}-day streak` : ''}${
          result.daily.gems ? ` · +${result.daily.gems}${icon('/assets/ui/icon_gem.png')}` : ''
        }</p>`
      : '';
    // A contract run's whole point is the three bets: print them on the card,
    // paid or not, so the player can see what the run actually earned.
    const contractRows = Array.isArray(result.contracts) ? result.contracts : [];
    const contractRow = contractRows.length
      ? `<div class="result-contracts">
           <p class="result-contracts-title">CONTRACTS · ${contractRows.filter((row) => row.done).length}/${contractRows.length}</p>
           ${contractRows
             .map(
               (row) =>
                 `<div class="result-contract ${row.done ? 'is-done' : ''}">
                    <span>${row.done ? '✓' : '○'} ${row.name}</span>
                    <em>${row.done ? `+${row.reward}${icon('/assets/ui/icon_coin.png')}` : `${Math.min(row.current, row.target)}/${row.target}`}</em>
                  </div>`
             )
             .join('')}
         </div>`
      : '';

    const achievementRow = Array.isArray(result.achievements) && result.achievements.length
      ? `<p class="result-achievements">${icon('/assets/ui-kit/glyph_medal.png')} ${result.achievements
          .map((a) => a.name)
          .join(' · ')}</p>`
      : '';

    const unlockRow = unlockedIds.length
      ? unlockedIds
          .map((id) => `<p class="result-unlock">${levelName(id).toUpperCase()} UNLOCKED</p>`)
          .join('')
      : campaignComplete
        ? '<p class="result-unlock">CAMPAIGN COMPLETE — ENDLESS SIEGE AWAITS</p>'
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
    // Straight back to the hub: the map is where the next stage is chosen, and
    // it reports the stars and rewards this run actually banked.
    actions.push('<button id="result-map" class="game-btn">WORLD MAP</button>');
    actions.push('<button id="result-board" class="game-btn">LEADERBOARD</button>');
    actions.push('<button id="result-menu" class="game-btn">MAIN MENU</button>');

    this.container.innerHTML = `
      <div id="result-screen" class="overlay-screen" role="dialog" aria-label="${victory ? 'Victory' : 'Defeat'}">
        <div class="overlay-shell result-shell ${victory ? 'is-victory' : 'is-defeat'}">
          <span class="result-shine" aria-hidden="true"></span>
          <div class="result-body">
          <div class="result-ribbon">${victory ? (endless ? 'RUN OVER' : 'VICTORY') : 'DEFEAT'}</div>
          <h1 class="result-heading">${level?.name || 'Bastion'}</h1>
          ${
            !victory
              ? '<div class="result-stars defeat-mark" aria-hidden="true"><img class="result-mark-icon" src="/assets/ui-kit/glyph_skull.png" alt="" /></div>'
              : endless || !stars
                ? '<div class="result-stars run-mark" aria-hidden="true"><img class="result-mark-icon" src="/assets/ui-kit/glyph_swords.png" alt="" /></div>'
                : this.starMarkup(stars)
          }
          ${recordRun ? `<p class="result-record">NEW BEST ${result.previousStars}★ → ${stars}★</p>` : ''}
          <div class="result-stats">${statRows}</div>
          ${rewardRow}
          ${contractRow}
          ${dailyRow}
          ${achievementRow}
          ${unlockRow}
          </div>
          <div class="overlay-actions result-actions">${actions.join('')}</div>
        </div>
      </div>
    `;

    this.bind();
    this.animateCounters();
  }

  /**
   * Count the score and the clock up from zero.
   *
   * The numbers are already in the markup, so this only ever *replaces* a value
   * with the same value at t=1; a browser without rAF, or a player who asked
   * for reduced motion, simply keeps the final figures.
   */
  animateCounters() {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce || typeof requestAnimationFrame !== 'function') return;
    const nodes = [...this.container.querySelectorAll('[data-count]')];
    if (!nodes.length) return;
    const duration = 760;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      for (const node of nodes) {
        if (!node.isConnected) return;
        const target = Number(node.dataset.count) || 0;
        const decimals = Number(node.dataset.decimals || 0);
        node.textContent = `${(target * eased).toFixed(decimals)}${node.dataset.suffix || ''}`;
      }
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
    this.container.querySelector('#result-map')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onMap?.(this.result);
    });
    this.container.querySelector('#result-board')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onLeaderboard?.(this.result);
    });
  }
}
