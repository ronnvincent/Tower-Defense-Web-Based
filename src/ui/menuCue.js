/**
 * menuCue.js — the one live line on the main menu.
 *
 * "PLAY CAMPAIGN" cannot tell a returning keeper whether they are resuming a
 * run or starting one, so the plaque carries a second line. It is derived from
 * the save rather than stored, and it reads the *same* `currentObjective()` the
 * map's beacon, the castle overview and the campaign-complete banner use — the
 * menu can never point at a different stage than the realm does.
 *
 * Pure: no DOM, no storage. `main.js` paints whatever this returns.
 */

import { currentObjective } from '../data/worldMap.js';

/** @typedef {{ isUnlocked(id:string):boolean, starsFor(id:string):number,
 *              totalStars:number, profile?:{endlessBestWave?:number} }} ProgressLike */

/**
 * @param {ProgressLike|null} progress
 * @returns {string} uppercase line for the PLAY plaque
 */
export function continueCue(progress) {
  const next = currentObjective(progress);
  const stars = progress?.totalStars || 0;

  // No objective left means every campaign stage has a star on it (and Endless
  // has been played) — the campaign is genuinely finished.
  if (!next) return 'CAMPAIGN COMPLETE';
  // A save with no stars at all is a fresh keeper, even though `currentObjective`
  // happily returns level 1 for them.
  if (stars === 0) return 'BEGIN A NEW CAMPAIGN';
  return `CONTINUE · ${String(next.name || '').toUpperCase()}`;
}
