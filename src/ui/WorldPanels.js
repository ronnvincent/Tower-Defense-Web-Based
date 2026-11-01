/**
 * WorldPanels.js — what a building on the map actually shows.
 *
 * The map used to answer every building with the same card: a blurb, an ENTER
 * button, CLOSE. That is a menu with pictures. These panels read the live save
 * instead, so walking up to a building tells you something you did not already
 * know, and every button opens a screen that exists:
 *
 *   Forge          real relic levels, the next price, what is affordable now
 *   Champions' Hall  the top three runs finished on this device
 *   Monument       medals earned vs locked, and which three came last
 *   Bastion        the objective the campaign is pointing at, plus recent medals
 *
 * Pure markup: no DOM, no store writes. WorldMapUI owns the click handling and
 * `ForgeUI` / `AchievementsUI` / `LeaderboardUI` stay the only places that can
 * spend gems or grant a medal.
 */

import { ACHIEVEMENTS } from '../data/achievements.js';
import { relicBoard, relicSummary } from '../systems/Relics.js';

const gem = '<img class="wm-inline-icon" src="/assets/ui/icon_gem.png" alt="" />';

function head(eyebrow, title, chip) {
  return `
    <header class="wm-card-head">
      <p class="wm-eyebrow">${eyebrow}</p>
      <h2 class="wm-card-title" id="wm-panel-title">${title}</h2>
      ${chip ? `<span class="wm-state wm-state--open">${chip}</span>` : ''}
    </header>`;
}

/** "12 / 18" style fraction with the unit spelled out. */
function fraction(value, max) {
  return `${value} <span class="wm-of">/ ${max}</span>`;
}

/* ---------------------------------------------------------------- the forge */

/**
 * @param {{ progress: object, landmark: object }} context
 */
export function forgeMarkup({ progress, landmark }) {
  const relics = progress?.profile?.relics || {};
  const gems = progress?.gems || 0;
  const board = relicBoard(relics, gems);
  const summary = relicSummary(relics);
  // What the player already owns comes first (that is the investment they are
  // building), then anything affordable, then the cheapest next step. Maxed
  // relics never crowd the list.
  const actionable = board
    .filter((relic) => !relic.maxed)
    .sort((a, b) => {
      const ownedA = a.level > 0 ? 0 : 1;
      const ownedB = b.level > 0 ? 0 : 1;
      if (ownedA !== ownedB) return ownedA - ownedB;
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      return (a.cost ?? 0) - (b.cost ?? 0);
    })
    .slice(0, 3);

  const rows = actionable
    .map(
      (relic) => `
      <li class="wm-relic${relic.affordable ? ' is-ready' : ''}">
        <span class="wm-relic-main">
          <b>${relic.name}<span class="wm-relic-level">LV ${relic.level} / ${relic.maxLevel}</span></b>
          <i>${relic.level > 0 ? `${relic.current} → ${relic.next}` : relic.next}</i>
        </span>
        <span class="wm-relic-side">
          <span class="wm-relic-cost">${gem}${relic.cost}</span>
          <span class="wm-relic-ready">${relic.affordable ? 'READY' : `${relic.cost - gems} SHORT`}</span>
        </span>
      </li>`
    )
    .join('');

  return `
    ${head('THE BASTION · RELIC WORKSHOP', landmark.name, `${gems} GEMS`)}
    <p class="wm-card-blurb">${landmark.blurb}</p>
    <dl class="wm-facts">
      <div class="wm-fact"><dt>RELICS OWNED</dt><dd>${fraction(summary.owned, summary.total)}</dd></div>
      <div class="wm-fact"><dt>LEVELS</dt><dd>${fraction(summary.levels, summary.maxLevels)}</dd></div>
      <div class="wm-fact"><dt>AFFORDABLE</dt><dd>${
        board.filter((relic) => relic.affordable).length
      } now</dd></div>
    </dl>
    ${
      actionable.length
        ? `<ul class="wm-relics">${rows}</ul>`
        : '<p class="wm-locked-note">Every relic is at its highest level. The Forge has nothing left to strike.</p>'
    }
    <footer class="wm-card-actions">
      <button id="wm-enter" class="wm-btn wm-btn--primary" type="button">ENTER THE WORKSHOP</button>
      <button id="wm-panel-close" class="wm-btn" type="button">BACK</button>
    </footer>`;
}

/* ------------------------------------------------------------ champions hall */

/**
 * @param {{ progress: object, records: object[], landmark: object }} context
 */
export function championsMarkup({ records = [], landmark }) {
  const top = records.slice(0, 3);
  const rows = top
    .map(
      (record, index) => `
      <li class="wm-board-row">
        <span class="wm-board-rank">${index + 1}</span>
        <span class="wm-board-name">${record.name}</span>
        <span class="wm-board-score">${Number(record.score || 0).toLocaleString('en-US')}</span>
        <span class="wm-board-waves">${record.waves || 0} waves</span>
      </li>`
    )
    .join('');

  return `
    ${head("THE BASTION · THE STANDINGS", landmark.name, `${records.length} RUNS`)}
    <p class="wm-card-blurb">${landmark.blurb}</p>
    ${
      top.length
        ? `<ol class="wm-board">${rows}</ol>`
        : `<p class="wm-locked-note">No run has finished on this device yet. The wall stays empty until one does.</p>`
    }
    <footer class="wm-card-actions">
      <button id="wm-enter" class="wm-btn wm-btn--primary" type="button">OPEN THE BOARD</button>
      <button id="wm-panel-close" class="wm-btn" type="button">BACK</button>
    </footer>`;
}

/* ----------------------------------------------------------------- monument */

/**
 * @param {{ progress: object, landmark: object }} context
 */
export function monumentMarkup({ progress, landmark }) {
  const earnedIds = new Set(progress?.profile?.achievements || []);
  const earned = ACHIEVEMENTS.filter((entry) => earnedIds.has(entry.id));
  const recent = earned.slice(-3).reverse();
  const gemsFromMedals = earned.reduce((sum, entry) => sum + (entry.gems || 0), 0);

  const rows = recent
    .map(
      (entry) => `
      <li class="wm-medal-row">
        <span class="wm-medal-name">${entry.name}</span>
        <span class="wm-medal-desc">${entry.desc}</span>
      </li>`
    )
    .join('');

  return `
    ${head('THE BASTION · CARVED DEEDS', landmark.name, `${earned.length} / ${ACHIEVEMENTS.length}`)}
    <p class="wm-card-blurb">${landmark.blurb}</p>
    <dl class="wm-facts">
      <div class="wm-fact"><dt>MEDALS</dt><dd>${fraction(earned.length, ACHIEVEMENTS.length)}</dd></div>
      <div class="wm-fact"><dt>STILL LOCKED</dt><dd>${ACHIEVEMENTS.length - earned.length}</dd></div>
      <div class="wm-fact"><dt>GEMS FROM MEDALS</dt><dd>${gemsFromMedals}</dd></div>
    </dl>
    ${
      recent.length
        ? `<ul class="wm-medals">${rows}</ul>`
        : '<p class="wm-locked-note">Nothing carved yet. Medals are struck by the run that earns them, never handed out here.</p>'
    }
    <footer class="wm-card-actions">
      <button id="wm-enter" class="wm-btn wm-btn--primary" type="button">OPEN THE MEDALS</button>
      <button id="wm-panel-close" class="wm-btn" type="button">BACK</button>
    </footer>`;
}

/* -------------------------------------------------------------- the bastion */

/**
 * The one line every commander wants: what do I do next, and why.
 *
 * "No objective" can mean two different things, so the caller passes the real
 * ledger: every stage cleared is *campaign complete*, while a save whose next
 * gate is still shut is *no open road*. Claiming completion off a null alone
 * would lie to a keeper sitting on 3 of 4 — the panel must read from the same
 * `campaignSummary()` the fact rows do.
 *
 * @param {object|null} objective a real level from `levelData`
 * @param {object} progress
 * @param {{cleared:number,total:number}|null} [summary]
 */
export function objectiveMarkup(objective, progress, summary = null) {
  if (!objective) {
    const complete = !summary || !(summary.total > 0) || summary.cleared >= summary.total;
    if (complete) {
      return `
      <div class="wm-objective wm-objective--done">
        <p class="wm-objective-kicker">CAMPAIGN COMPLETE</p>
        <p class="wm-objective-name">Every road is open</p>
        <p class="wm-objective-meta">The realm is held. Only the Endless Siege remains.</p>
      </div>`;
    }
    return `
      <div class="wm-objective wm-objective--sealed">
        <p class="wm-objective-kicker">NO OPEN ROAD</p>
        <p class="wm-objective-name">The next gate is sealed</p>
        <p class="wm-objective-meta">${summary.cleared} of ${summary.total} stages held. War Room modes and Endless need no road.</p>
      </div>`;
  }
  const waves = objective.endless ? 'Endless' : `${objective.waves?.length ?? 0} waves`;
  const stars = objective.endless ? 0 : progress?.starsFor(objective.id) || 0;
  return `
    <div class="wm-objective">
      <p class="wm-objective-kicker">NEXT OBJECTIVE</p>
      <p class="wm-objective-name">${objective.name}</p>
      <p class="wm-objective-meta">${waves} · ${
        objective.endless ? 'no last wave' : `${stars} / 3 stars`
      } · ${objective.startingCoins} starting gold</p>
      <button id="wm-goal" class="wm-btn wm-btn--primary" type="button">${
        objective.endless ? 'BEGIN THE SIEGE' : 'MARCH ON IT'
      }</button>
    </div>`;
}

/** Recent medals, for the keep's ledger. */
export function recentMedalsMarkup(progress, limit = 2) {
  const earnedIds = new Set(progress?.profile?.achievements || []);
  const earned = ACHIEVEMENTS.filter((entry) => earnedIds.has(entry.id)).slice(-limit).reverse();
  if (!earned.length) return '';
  return `
    <ul class="wm-medals wm-medals--compact">
      ${earned
        .map(
          (entry) => `
        <li class="wm-medal-row">
          <span class="wm-medal-name">${entry.name}</span>
          <span class="wm-medal-desc">${entry.desc}</span>
        </li>`
        )
        .join('')}
    </ul>`;
}
