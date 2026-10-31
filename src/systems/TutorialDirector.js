/**
 * TutorialDirector.js — the clock and the gates behind the opening scene.
 *
 * The scene graph knows how to walk a villager and draw a portrait; it does not
 * know that line seven is Bram's or that the third gate is the wave button.
 * Those live in `data/tutorialScript.js`. This module is the small machine in
 * between:
 *
 *   · it walks the beat list (a line waits `lineMs`, then advances itself);
 *   · a `step` beat does **not** advance on a timer — it waits for the event the
 *     tutorial is teaching (`place`, `upgrade`, `wave`) to be reported by the
 *     real game action;
 *   · an event that arrives *early* is remembered, so a player who builds during
 *     the opening lines is not forced to build a second tower later;
 *   · nothing here can be skipped. There is no `skip()`, no `stop()`, and no
 *     timeout that gives up — the only way out of a step is doing the thing.
 *
 * Pure data in, callbacks out: no Phaser, no DOM, so the whole flow is
 * unit-testable (see `tests/tutorial.test.js`).
 */
import { TUTORIAL_BEATS, TUTORIAL_LINE_MS, fillName } from '../data/tutorialScript.js';

/**
 * How long a line stays up, in milliseconds.
 *
 * The lines in this scene run from 44 to 100 characters, so one fixed dwell
 * either drags the short ones or cuts the long ones off mid-sentence. A line
 * is held long enough to read at ~17 characters a second, never less than the
 * script's floor and never so long that the scene stalls.
 */
export function lineDwell(text, { lineMs = TUTORIAL_LINE_MS, perChar = 60, maxMs = 7000 } = {}) {
  const length = String(text || '').length;
  return Math.min(maxMs, Math.max(lineMs, Math.round(length * perChar)));
}

/**
 * @param {object} [options]
 * @param {object[]} [options.beats]      the script
 * @param {number}   [options.lineMs]     how long a line holds before advancing
 * @param {string}   [options.name]       the commander name, for `{name}`
 * @param {(beat:object, index:number)=>void} [options.onBeat]
 * @param {()=>void} [options.onFinish]
 */
export function createTutorialDirector({
  beats = TUTORIAL_BEATS,
  lineMs = TUTORIAL_LINE_MS,
  name = '',
  onBeat = null,
  onFinish = null,
} = {}) {
  let index = -1;
  let elapsed = 0;
  let finished = false;
  /** Events the player has already performed while the director was elsewhere. */
  const performed = new Set();

  const current = () => (index >= 0 && index < beats.length ? beats[index] : null);

  const emit = () => {
    const beat = current();
    if (!beat) {
      finish();
      return;
    }
    if (typeof onBeat === 'function') onBeat(beat, index);
    // `end` is the last beat of the script: it is shown (so a scene can cue on
    // it) and the director is finished in the same frame. Without this the
    // machine parked on `end` forever and `onFinish` never ran.
    if (beat.kind === 'end') finish();
  };

  function finish() {
    if (finished) return;
    finished = true;
    if (typeof onFinish === 'function') onFinish();
  }

  /**
   * Move to the next beat. Steps are skipped when their event has already been
   * performed, so an eager builder never sees "raise a defence" twice.
   */
  function advance() {
    if (finished) return null;
    index += 1;
    elapsed = 0;
    let beat = current();
    while (beat && beat.kind === 'step' && performed.has(beat.event)) {
      index += 1;
      beat = current();
    }
    emit();
    return beat;
  }

  return {
    /** Begin at the first beat. Safe to call once from the scene's create(). */
    start() {
      if (index >= 0 || finished) return current();
      index = 0;
      elapsed = 0;
      emit();
      return current();
    },
    /** The beat on screen right now (null once finished). */
    get beat() {
      return finished ? null : current();
    },
    get index() {
      return index;
    },
    get finished() {
      return finished;
    },
    /** True while the game is waiting for the player to act. */
    get waiting() {
      const beat = current();
      return Boolean(beat && beat.kind === 'step');
    },
    /** True while a line is on screen (the scene keeps the sim frozen). */
    get speaking() {
      const beat = current();
      return Boolean(beat && beat.kind === 'line');
    },
    /** The line to display, with the commander's name substituted. */
    text() {
      const beat = current();
      return beat?.text ? fillName(beat.text, name) : '';
    },
    /** Advance the line timer. Called once per simulation tick. */
    tick(deltaMs) {
      if (finished) return;
      const beat = current();
      if (!beat || beat.kind !== 'line') return;
      elapsed += Math.max(0, Number(deltaMs) || 0);
      if (elapsed >= lineDwell(beat.text, { lineMs })) advance();
    },
    /** A tap on the dialogue card: advance the line. Ignored at a step gate. */
    tap() {
      if (finished) return null;
      const beat = current();
      if (!beat || beat.kind !== 'line') return beat;
      return advance();
    },
    /**
     * Report a real game action. Retires the matching step if it is on screen,
     * remembers it if it is not, and never rewinds.
     */
    report(event) {
      if (!event) return null;
      performed.add(event);
      if (finished) return null;
      const beat = current();
      if (beat?.kind === 'step' && beat.event === event) return advance();
      return beat;
    },
  };
}
