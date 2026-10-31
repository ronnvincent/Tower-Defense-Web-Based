/**
 * FirstRun.js — the first battle's three sentences.
 *
 * The game has thirteen destinations on the world map and four ways into the
 * War Room before a new player has placed a single tower, and the only help
 * the first battle offers is a camera hint. This module is the smallest thing
 * that fixes that without becoming a tutorial: three lines, shown once, on
 * level 1, each one advancing when the player has actually done the thing.
 *
 * It is deliberately *not* modal. Nothing is disabled, nothing is gated, and
 * the hint bar can be dismissed at any point — a player who already knows how
 * to play must never be slowed down. Every step is a plain object so the whole
 * thing is unit-tested without Phaser or a DOM.
 *
 * State is per device, like the camera hint: a new player on the same browser
 * is the same person, and the profile is for things the ledger should hold.
 */

export const FIRST_RUN_KEY = 'td-dsalgo:first-run:v1';

/** The level that owns the coach marks. Stage 2 should need none. */
export const FIRST_RUN_LEVEL = 'level-1';

/**
 * The three steps, in order.
 *
 * `done` is which event retires the step; the scene reports events by name, so
 * a wording change never touches the wiring and a new step is a data edit.
 */
export const COACH_STEPS = Object.freeze([
  {
    id: 'place',
    done: 'place',
    text: 'Pick a defence from the forge, then tap the ground to raise it',
    textMobile: 'Tap BUILD, pick a defence, then tap the ground to raise it',
  },
  {
    id: 'upgrade',
    done: 'upgrade',
    text: 'Tap a raised tower to upgrade it — or sell it back',
    textMobile: 'Tap a raised tower to upgrade it — or sell it back',
  },
  {
    id: 'wave',
    done: 'wave',
    text: 'START WAVE calls the horde early, and early calls pay bonus gold',
    textMobile: 'START WAVE calls the horde early for bonus gold',
  },
]);

/** Read the stored state: `{ done:boolean, steps:string[] }`. */
export function readFirstRun(storage = globalThis.localStorage) {
  const empty = { done: false, steps: [] };
  try {
    const raw = storage?.getItem?.(FIRST_RUN_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const steps = Array.isArray(parsed?.steps) ? parsed.steps.filter((id) => typeof id === 'string') : [];
    return { done: Boolean(parsed?.done), steps };
  } catch {
    // A corrupt or unreadable store must not break the first battle: the worst
    // case is three hints nobody needed.
    return empty;
  }
}

/** Persist the state. Storage failures are ignored on purpose. */
export function writeFirstRun(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(FIRST_RUN_KEY, JSON.stringify({ done: Boolean(state?.done), steps: state?.steps || [] }));
    return true;
  } catch {
    return false;
  }
}

/** Does this level get coach marks at all? */
export function shouldCoach(level, state = { done: false }) {
  if (!level || state?.done) return false;
  return level.id === FIRST_RUN_LEVEL;
}

/**
 * The step a player should be looking at right now, or null when the first run
 * has taught everything it has.
 */
export function nextCoachStep(state = {}) {
  const seen = new Set(state?.steps || []);
  return COACH_STEPS.find((step) => !seen.has(step.id)) || null;
}

/**
 * Retire one step. Returns the new state and the step that replaces it, so the
 * caller can repaint in a single call.
 */
export function completeCoachStep(state, doneId) {
  const steps = [...new Set([...(state?.steps || []), doneId])];
  const done = COACH_STEPS.every((step) => steps.includes(step.id));
  const next = { done, steps };
  return { state: next, next: done ? null : nextCoachStep(next) };
}

/**
 * The state machine the scene drives.
 *
 * `report(event)` is called with 'place', 'upgrade' and 'wave'; it returns the
 * next step to paint (or null). Events out of order are ignored rather than
 * replayed, so a player who upgrades before placing is not shown "place" again.
 */
export function createCoach({ storage = globalThis.localStorage, level } = {}) {
  let state = readFirstRun(storage);
  const active = shouldCoach(level, state);
  return {
    get active() {
      return active;
    },
    get done() {
      return state.done;
    },
    /** The step to paint on arrival, if this level is coached. */
    start() {
      return active ? nextCoachStep(state) : null;
    },
    report(event) {
      if (!active) return null;
      const step = nextCoachStep(state);
      if (!step || step.done !== event) return step;
      const result = completeCoachStep(state, step.id);
      state = result.state;
      writeFirstRun(state, storage);
      return result.next;
    },
  };
}
