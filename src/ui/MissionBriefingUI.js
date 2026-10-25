/**
 * MissionBriefingUI.js — the card that stands between the map and a battle.
 *
 * It is deliberately *not* a second level-select screen: the map is the place
 * you choose a stage, and this is the read-out for the one you tapped. Every
 * number on it comes from the same data the battle boots with (`levelData`,
 * `Progression`), so a briefing can never promise a reward the run will not pay
 * or a boss the wave list does not spawn.
 *
 * Pure markup + two small pure helpers, so the whole thing is unit-testable
 * without a DOM.
 */

import { ENEMY_TYPES } from '../data/enemyData.js';
import { THEMES } from '../data/levelData.js';
import { STAR_MAX } from '../systems/Progression.js';

/**
 * Threat is *derived*, never invented: the campaign raises enemy health from
 * 1.0 to 1.45 across its four stages, so the same number that makes stage 4
 * hurt is what the pips report.
 */
export const THREAT_TIERS = Object.freeze([
  { max: 1.1, pips: 1, label: 'Light' },
  { max: 1.25, pips: 2, label: 'Steady' },
  { max: 1.4, pips: 3, label: 'Harsh' },
  { max: Infinity, pips: 4, label: 'Savage' },
]);

/** @returns {{ pips:number, label:string }} */
export function threatFor(level) {
  const scale = Number(level?.enemyHealthScale ?? 1);
  return THREAT_TIERS.find((tier) => scale < tier.max) || THREAT_TIERS[THREAT_TIERS.length - 1];
}

/** "Abyssal Warlord" from the enemy table — the boss this stage really spawns. */
export function bossFor(level) {
  const key = typeof level?.boss === 'string' ? level.boss : level?.boss?.key;
  return (key && ENEMY_TYPES[key]?.name) || 'None';
}

/** Human label for a stage state, used by the chip on the map and in the card. */
export function stateLabel(state) {
  switch (state) {
    case 'cleared':
      return 'CLEARED';
    case 'next':
      return 'OBJECTIVE';
    case 'open':
      return 'OPEN';
    default:
      return 'LOCKED';
  }
}

function starMarkup(stars, max = STAR_MAX) {
  let html = '<span class="wm-stars" aria-hidden="true">';
  for (let i = 0; i < max; i += 1) {
    html += `<img class="wm-star ${i < stars ? 'is-earned' : ''}" src="/assets/ui/star_${
      i < stars ? 'gold' : 'empty'
    }.png" alt="" />`;
  }
  html += '</span>';
  return `${html}<span class="sr-only">${stars} of ${max} stars</span>`;
}

/**
 * @param {object} level  a `levelData` entry
 * @param {import('../systems/Progression.js').ProgressStore} progress
 * @param {{ state:string, region?:object }} context
 * @returns {string} panel HTML
 */
export function missionBriefingMarkup(level, progress, { state = 'open', region = null } = {}) {
  const theme = THEMES[level?.theme] || THEMES.grassland;
  const endless = Boolean(level?.endless);
  const threat = threatFor(level);
  const stars = endless ? 0 : progress?.starsFor(level.id) || 0;
  const bestScore = progress?.bestScoreFor(level.id) || 0;
  const bestWave = progress?.profile?.endlessBestWave || 0;
  const reward = level?.reward || { gold: 0, gems: 0 };
  const locked = state === 'locked';

  const pips = Array.from(
    { length: 4 },
    (_, index) => `<i class="${index < threat.pips ? 'is-on' : ''}"></i>`
  ).join('');
  const stageLabel = endless ? 'ENDLESS' : `STAGE ${level?.index ?? 1}`;
  const waves = endless ? '∞' : String(level?.waves?.length ?? 0);
  const clearLine = endless
    ? '<span class="wm-fact-value muted">Bounties only</span>'
    : `${reward.gold || 0} gold · ${reward.gems || 0} gems`;

  return `
    <header class="wm-card-head" style="--wm-accent:${theme.accent}">
      <p class="wm-eyebrow">${region?.name || theme.name} · ${stageLabel}</p>
      <h2 class="wm-card-title" id="wm-panel-title">${level?.name || 'Stage'}</h2>
      <span class="wm-state wm-state--${state}">${stateLabel(state)}</span>
    </header>

    <p class="wm-card-blurb">${level?.blurb || theme.blurb}</p>

    <dl class="wm-facts">
      <div class="wm-fact"><dt>WAVES</dt><dd>${waves}</dd></div>
      <div class="wm-fact"><dt>BOSS</dt><dd>${bossFor(level)}</dd></div>
      <div class="wm-fact"><dt>THREAT</dt><dd><span class="wm-pips" data-pips="${threat.pips}" aria-hidden="true">${pips}</span> ${threat.label}</dd></div>
      <div class="wm-fact"><dt>FIRST CLEAR</dt><dd>${clearLine}</dd></div>
      <div class="wm-fact"><dt>BEST SCORE</dt><dd>${bestScore ? bestScore.toLocaleString('en-US') : '<span class="wm-fact-value muted">—</span>'}</dd></div>
      <div class="wm-fact"><dt>${endless ? 'BEST WAVE' : 'STARS'}</dt><dd>${
        endless ? bestWave || '<span class="wm-fact-value muted">—</span>' : starMarkup(stars)
      }</dd></div>
    </dl>

    ${
      locked
        ? `<p class="wm-locked-note">Clear the stage before this one to open this road.</p>`
        : ''
    }

    <footer class="wm-card-actions">
      <button id="wm-deploy" class="wm-btn wm-btn--primary" type="button"${
        locked ? ' disabled aria-disabled="true"' : ''
      }>${endless ? 'ENTER THE SIEGE' : 'DEPLOY'}</button>
      <button id="wm-panel-close" class="wm-btn" type="button">BACK</button>
    </footer>
  `;
}
