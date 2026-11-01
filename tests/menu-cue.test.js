/**
 * The main menu's continue cue.
 *
 * Request 14 stripped the menu down to a title, one plate and two utility keys.
 * That leaves exactly one place where the save can speak: the line under PLAY
 * CAMPAIGN. It has to be true — a fresh keeper must not be told to "continue",
 * and a finished campaign must not pretend there is a next stage — so the copy
 * is a pure function of the save and is tested as one here.
 */

import { describe, expect, it } from 'vitest';
import { continueCue } from '../src/ui/menuCue.js';
import { LEVELS, ENDLESS_LEVEL } from '../src/data/levelData.js';

/** A progress object shaped like ProgressStore, with no storage behind it. */
function fakeProgress({ stars = {}, unlocked = ['level-1'], endlessWave = 0 } = {}) {
  return {
    profile: { stars, unlocked, endlessBestWave: endlessWave },
    isUnlocked: (id) => unlocked.includes(id),
    starsFor: (id) => stars[id] || 0,
    get totalStars() {
      return LEVELS.reduce((sum, level) => sum + (stars[level.id] || 0), 0);
    },
    get maxStars() {
      return LEVELS.length * 3;
    },
  };
}

describe('Main menu — continue cue', () => {
  it('tells a fresh save to begin, not to continue', () => {
    expect(continueCue(fakeProgress())).toBe('BEGIN A NEW CAMPAIGN');
  });

  it('handles a missing profile without inventing an objective', () => {
    expect(continueCue(null)).toBe('BEGIN A NEW CAMPAIGN');
  });

  it('names the real next stage once a stage is cleared', () => {
    const progress = fakeProgress({
      stars: { 'level-1': 2 },
      unlocked: ['level-1', 'level-2'],
    });
    expect(continueCue(progress)).toBe(`CONTINUE · ${LEVELS[1].name.toUpperCase()}`);
  });

  it('sends a finished campaign to Endless, and a finished endless to the end', () => {
    const stars = Object.fromEntries(LEVELS.map((level) => [level.id, 3]));
    const unlocked = LEVELS.map((level) => level.id).concat([ENDLESS_LEVEL.id]);

    // Campaign done, Endless never played → the cue is the real Endless stage.
    expect(continueCue(fakeProgress({ stars, unlocked }))).toBe(
      `CONTINUE · ${ENDLESS_LEVEL.name.toUpperCase()}`
    );

    // Campaign done, Endless played → nothing left to continue.
    expect(continueCue(fakeProgress({ stars, unlocked, endlessWave: 17 }))).toBe(
      'CAMPAIGN COMPLETE'
    );
  });

  it('never returns an empty line', () => {
    for (const progress of [
      fakeProgress(),
      fakeProgress({ stars: { 'level-1': 1 }, unlocked: ['level-1', 'level-2'] }),
      null,
      undefined,
    ]) {
      const text = continueCue(progress);
      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).toBe(text.toUpperCase());
    }
  });
});
