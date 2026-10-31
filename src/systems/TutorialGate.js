/**
 * TutorialGate.js — the rule that the opening only lets you press what it points at.
 *
 * WHY THIS EXISTS
 * ---------------
 * The opening is a chain of gates: build a defence, raise it a tier, call the
 * wave. Each gate is drawn with a dimmed screen, one hole, and a hand on the
 * hole — but the dim was decoration only. Every other control on the screen was
 * still live, so a new player could (and did) press the wave button ahead of the
 * lesson, drop a tower somewhere else during a line of dialogue, or open the
 * forge mid-sentence. The step was then retired by the director's "already
 * performed" memory and the player skipped the thing the scene was teaching.
 *
 * The gate is the input side of that drawing: everything outside the hole
 * swallows the press, and the only keys that still work are the ones that do
 * what the step asks.
 *
 * Two pure helpers live here so both halves of the defence are testable without
 * a browser: `complementRects` (the geometry the DOM shield is cut from) and
 * `gateKeyVerdict` (what a key press means while a step is waiting).
 *
 * Rectangles are `{ left, top, right, bottom }` in **viewport** pixels, the same
 * space `getBoundingClientRect()` reports.
 */

/** A rectangle with a positive area. */
export function isRect(rect) {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.right) &&
      Number.isFinite(rect.bottom) &&
      rect.right - rect.left > 0.5 &&
      rect.bottom - rect.top > 0.5
  );
}

/**
 * `rect` minus `hole`, as up to four rectangles.
 *
 * The classic guillotine split: a slice above, a slice below, and the two
 * shoulders left and right of the hole in the band between them. Pieces never
 * overlap each other and never overlap the hole, so the shield they build is
 * honest — every pixel outside the hole is covered exactly once.
 */
export function subtractRect(rect, hole) {
  if (!isRect(rect)) return [];
  if (!isRect(hole)) return [rect];
  const top = Math.max(rect.top, hole.top);
  const bottom = Math.min(rect.bottom, hole.bottom);
  const left = Math.max(rect.left, hole.left);
  const right = Math.min(rect.right, hole.right);
  // No overlap at all: the hole is elsewhere.
  if (right <= left || bottom <= top) return [rect];

  const out = [];
  if (hole.top > rect.top) {
    out.push({ left: rect.left, top: rect.top, right: rect.right, bottom: hole.top });
  }
  if (hole.bottom < rect.bottom) {
    out.push({ left: rect.left, top: hole.bottom, right: rect.right, bottom: rect.bottom });
  }
  if (hole.left > rect.left) {
    out.push({ left: rect.left, top, right: hole.left, bottom });
  }
  if (hole.right < rect.right) {
    out.push({ left: hole.right, top, right: rect.right, bottom });
  }
  return out.filter(isRect);
}

/**
 * Everything in `area` that is not inside one of `holes`.
 *
 * Used to build the shield: the result is exactly the region that must be
 * blocked, so a hole the size of the pointed-at button really is a hole and the
 * rest of the screen really is inert.
 */
export function complementRects(area, holes = []) {
  let pieces = isRect(area) ? [area] : [];
  for (const hole of holes) {
    const next = [];
    for (const piece of pieces) next.push(...subtractRect(piece, hole));
    pieces = next;
  }
  return pieces;
}

/** Total area, in px². Used by the tests to prove the shield neither gaps nor doubles. */
export function rectArea(rect) {
  if (!isRect(rect)) return 0;
  return (rect.right - rect.left) * (rect.bottom - rect.top);
}

/** What a key press does while the opening is waiting. */
export const GATE_KEY = Object.freeze({
  ALLOW: 'allow',
  BLOCK: 'block',
  BUILD: 'build',
  WAVE: 'wave',
  CANCEL: 'cancel',
});

/**
 * Decide what one key press means for the beat on screen.
 *
 * - No step waiting → `allow`; the gate never touches free play.
 * - `Escape` → `cancel`: putting the card down again is not a bypass, it is how
 *   the player changes their mind, and the hand goes back to the card.
 * - `Space` → `wave` only on the wave step. Everywhere else it is `block`, which
 *   is what stops the opening being skipped with the space bar.
 * - A build hotkey → `build`, but only for the defence the hand is pointing at,
 *   and only while the step asks for one.
 * - Everything else → `block`.
 *
 * @param {object}  [input]
 * @param {object|null} [input.beat] the current script beat
 * @param {string}  [input.key]
 * @param {string}  [input.code]
 * @param {string|null} [input.buildKey] the defence this key would raise
 * @param {string|null} [input.allowedBuildKey] the defence the step points at
 */
export function gateKeyVerdict({
  beat = null,
  key = '',
  code = '',
  buildKey = null,
  allowedBuildKey = null,
} = {}) {
  if (!beat || beat.kind !== 'step') return GATE_KEY.ALLOW;
  if (key === 'Escape' || code === 'Escape') return GATE_KEY.CANCEL;
  if (key === ' ' || key === 'Spacebar' || code === 'Space') {
    return beat.event === 'wave' ? GATE_KEY.WAVE : GATE_KEY.BLOCK;
  }
  if (buildKey && buildKey === allowedBuildKey && beat.event === 'place') {
    return GATE_KEY.BUILD;
  }
  return GATE_KEY.BLOCK;
}
