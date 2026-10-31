import { describe, it, expect } from 'vitest';
import {
  COACH_STEPS,
  FIRST_RUN_KEY,
  completeCoachStep,
  createCoach,
  nextCoachStep,
  readFirstRun,
  shouldCoach,
  writeFirstRun,
} from '../src/systems/FirstRun.js';

/**
 * The first battle's coach marks.
 *
 * Three sentences, shown once, each retired by the action it describes. The
 * important contracts are the ones a player would notice: nothing shows twice,
 * nothing shows on stage 2, nothing shows after the first run, and a broken
 * store costs hints rather than the battle.
 */

function fakeStorage(initial = null) {
  const map = new Map();
  if (initial != null) map.set(FIRST_RUN_KEY, initial);
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const level = { id: 'level-1' };

describe('coach steps', () => {
  it('is three steps, each retired by the action it describes', () => {
    expect(COACH_STEPS).toHaveLength(3);
    expect(COACH_STEPS.map((step) => step.done)).toEqual(['place', 'upgrade', 'wave']);
    for (const step of COACH_STEPS) {
      expect(step.text.length).toBeGreaterThan(20);
      expect(step.textMobile.length).toBeGreaterThan(20);
      // A hint that renders as an empty box is worse than no hint.
      expect(step.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('offers the first unseen step and then nothing', () => {
    expect(nextCoachStep({ steps: [] }).id).toBe('place');
    expect(nextCoachStep({ steps: ['place'] }).id).toBe('upgrade');
    expect(nextCoachStep({ steps: ['place', 'upgrade', 'wave'] })).toBe(null);
  });

  it('marks the run done when the last step is retired', () => {
    const first = completeCoachStep({ steps: [] }, 'place');
    expect(first.state).toEqual({ done: false, steps: ['place'] });
    expect(first.next.id).toBe('upgrade');

    const last = completeCoachStep({ steps: ['place', 'upgrade'] }, 'wave');
    expect(last.state.done).toBe(true);
    expect(last.next).toBe(null);
  });

  it('never repeats a step that was already retired', () => {
    const twice = completeCoachStep({ steps: ['place'] }, 'place');
    expect(twice.state.steps).toEqual(['place']);
  });
});

describe('who gets coached', () => {
  it('only stage 1, and only until the run is done', () => {
    expect(shouldCoach(level, { done: false })).toBe(true);
    expect(shouldCoach(level, { done: true })).toBe(false);
    expect(shouldCoach({ id: 'level-2' }, { done: false })).toBe(false);
    expect(shouldCoach(null, { done: false })).toBe(false);
  });
});

describe('the stored state', () => {
  it('reads an empty store as a fresh player', () => {
    expect(readFirstRun(fakeStorage())).toEqual({ done: false, steps: [] });
  });

  it('survives corrupt JSON instead of taking the battle down with it', () => {
    expect(readFirstRun(fakeStorage('{not json'))).toEqual({ done: false, steps: [] });
    expect(readFirstRun(fakeStorage('{"steps":"place"}'))).toEqual({ done: false, steps: [] });
  });

  it('drops junk step ids on the way in', () => {
    const state = readFirstRun(fakeStorage('{"done":false,"steps":["place",42,null,"wave"]}'));
    expect(state.steps).toEqual(['place', 'wave']);
  });

  it('reports a storage that refuses to write', () => {
    const locked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(writeFirstRun({ done: true, steps: [] }, locked)).toBe(false);
    expect(readFirstRun(locked)).toEqual({ done: false, steps: [] });
  });
});

describe('the coach the scene drives', () => {
  it('starts on the first step for stage 1', () => {
    const coach = createCoach({ storage: fakeStorage(), level });
    expect(coach.active).toBe(true);
    expect(coach.start().id).toBe('place');
  });

  it('starts on nothing for a later stage', () => {
    const coach = createCoach({ storage: fakeStorage(), level: { id: 'level-3' } });
    expect(coach.active).toBe(false);
    expect(coach.start()).toBe(null);
  });

  it('advances only on the action the step asked for', () => {
    const coach = createCoach({ storage: fakeStorage(), level });
    // Upgrading before placing must not skip the placement step.
    expect(coach.report('upgrade').id).toBe('place');
    expect(coach.report('place').id).toBe('upgrade');
    expect(coach.report('place').id).toBe('upgrade');
    expect(coach.report('upgrade').id).toBe('wave');
    expect(coach.report('wave')).toBe(null);
    expect(coach.done).toBe(true);
  });

  it('writes progress through, so a reload does not repeat the lesson', () => {
    const storage = fakeStorage();
    const first = createCoach({ storage, level });
    first.report('place');
    first.report('upgrade');
    expect(first.report('wave')).toBe(null);

    const reloaded = createCoach({ storage, level });
    expect(reloaded.active).toBe(false);
    expect(reloaded.start()).toBe(null);
  });

  it('goes quiet for good once every step is seen', () => {
    const storage = fakeStorage(JSON.stringify({ done: true, steps: ['place', 'upgrade', 'wave'] }));
    const coach = createCoach({ storage, level });
    expect(coach.start()).toBe(null);
    expect(coach.report('place')).toBe(null);
  });
});
