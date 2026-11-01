/**
 * HubBadges.js — which buildings on the map are asking for something.
 *
 * WHY THIS EXISTS
 * ---------------
 * The hub has thirteen landmarks and, until now, no way to tell at a glance
 * which of them had something waiting: a relic the purse can finally pay for,
 * today's rule still unplayed. A player who has to open four panels to find out
 * stops opening them.
 *
 * The rule this module keeps is the one the rest of the project lives by: a
 * badge is a claim about the save, so it may only be lit by data that really
 * exists. There is no "come back later" pip, no decorative dot, and no badge on
 * a building with nothing to do — an always-on marker reads the same as no
 * marker at all.
 *
 * Pure functions in, records out: no DOM, no Phaser, so the conditions are
 * unit-tested directly (`tests/hub-polish.test.js`). The map only paints what
 * this file decides.
 */
import { relicBoard } from './Relics.js';
import { dailyRun } from './DailyChallenge.js';

/**
 * The badge each building is entitled to, keyed by landmark id, or `{}`.
 *
 * @param {object}  [input]
 * @param {boolean} [input.forgeReady] an unmaxed relic the purse can pay for
 * @param {boolean} [input.shrineReady] today's rule has not been cleared yet
 * @returns {{ forge?: object, shrine?: object }}
 */
export function hubBadges({ forgeReady = false, shrineReady = false } = {}) {
  const badges = {};
  if (forgeReady) {
    badges.forge = {
      id: 'forge',
      text: 'READY',
      title: 'A relic upgrade you can afford',
    };
  }
  if (shrineReady) {
    badges.shrine = {
      id: 'shrine',
      text: 'TODAY',
      title: "Today's rule is unplayed",
    };
  }
  return badges;
}

/**
 * Read the badge conditions straight off a save.
 *
 * Kept here rather than in the UI so a badge can never be lit by a stale field
 * the map happens to be holding: the answers are recomputed from the same
 * `Relics` / `DailyChallenge` modules the panels themselves use.
 *
 * @param {{ progress?: object, daily?: object }} [input]
 */
export function hubBadgesForSave({ progress = null, daily = null } = {}) {
  if (!progress) return {};

  const relics = progress.profile?.relics || {};
  const gems = progress.gems || 0;
  const forgeReady = relicBoard(relics, gems).some((relic) => !relic.maxed && relic.affordable);

  const unlockedIds = progress.profile?.unlocked || ['level-1'];
  const run = dailyRun({ unlockedIds });
  // A save that has not finished the opening still gets a shrine badge: the
  // daily exists whether or not the campaign has started.
  const shrineReady = !daily?.isWon?.(run.key);

  return hubBadges({ forgeReady, shrineReady });
}
