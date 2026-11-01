import { describe, it, expect } from 'vitest';
import {
  GATE_KEY,
  complementRects,
  gateKeyVerdict,
  rectArea,
  subtractRect,
} from '../src/systems/TutorialGate.js';
import { TUTORIAL_BEATS } from '../src/data/tutorialScript.js';

/**
 * The opening's press shield.
 *
 * The spotlight told the player *where* to press but left the whole screen live,
 * so the lesson could be walked around: call the wave early, drop a defence
 * somewhere else, or open another panel while the village was still talking.
 * These tests pin the two halves of the fix — the geometry that decides which
 * pixels stay live, and the key table that decides what a key press means.
 */

const step = (event) => TUTORIAL_BEATS.find((beat) => beat.kind === 'step' && beat.event === event);
const line = TUTORIAL_BEATS.find((beat) => beat.kind === 'line');
const AREA = { left: 0, top: 0, right: 1280, bottom: 768 };

const overlaps = (a, b) =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

describe('complementRects', () => {
  it('leaves exactly the hole uncovered, and covers the rest exactly once', () => {
    const hole = { left: 100, top: 100, right: 300, bottom: 160 };
    const pieces = complementRects(AREA, [hole]);
    expect(pieces.length).toBeGreaterThan(0);
    // Nothing overlaps the hole: that region has to stay clickable.
    for (const piece of pieces) expect(overlaps(piece, hole)).toBe(false);
    // And the pieces tile the rest of the screen — no gap to slip a press into,
    // no double box (which would be harmless but means the maths drifted).
    const covered = pieces.reduce((sum, piece) => sum + rectArea(piece), 0);
    expect(covered).toBe(rectArea(AREA) - rectArea(hole));
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        expect(overlaps(pieces[i], pieces[j])).toBe(false);
      }
    }
  });

  it('keeps every piece inside the screen', () => {
    const pieces = complementRects(AREA, [{ left: 0, top: 0, right: 200, bottom: 90 }]);
    for (const piece of pieces) {
      expect(piece.left).toBeGreaterThanOrEqual(0);
      expect(piece.top).toBeGreaterThanOrEqual(0);
      expect(piece.right).toBeLessThanOrEqual(AREA.right);
      expect(piece.bottom).toBeLessThanOrEqual(AREA.bottom);
    }
  });

  it('handles two holes — the UPGRADE button and its fork beside it', () => {
    const a = { left: 900, top: 400, right: 1080, bottom: 440 };
    const b = { left: 900, top: 450, right: 1080, bottom: 490 };
    const pieces = complementRects(AREA, [a, b]);
    for (const piece of pieces) {
      expect(overlaps(piece, a)).toBe(false);
      expect(overlaps(piece, b)).toBe(false);
    }
    expect(pieces.reduce((sum, piece) => sum + rectArea(piece), 0)).toBe(
      rectArea(AREA) - rectArea(a) - rectArea(b)
    );
  });

  it('a hole that misses the screen blocks everything', () => {
    const pieces = complementRects(AREA, [{ left: 2000, top: 10, right: 2100, bottom: 60 }]);
    expect(pieces).toEqual([AREA]);
  });

  it('a hole the size of the screen leaves nothing to block', () => {
    expect(complementRects(AREA, [AREA])).toEqual([]);
  });

  it('ignores a degenerate hole instead of cutting a line out of the shield', () => {
    expect(subtractRect(AREA, { left: 10, top: 10, right: 10, bottom: 40 })).toEqual([AREA]);
  });
});

describe('gateKeyVerdict', () => {
  it('never touches free play', () => {
    expect(gateKeyVerdict({ beat: null, key: '3' })).toBe(GATE_KEY.ALLOW);
    expect(gateKeyVerdict({ beat: line, key: ' ' })).toBe(GATE_KEY.ALLOW);
  });

  it('only lets the space bar call the wave on the wave step', () => {
    expect(gateKeyVerdict({ beat: step('wave'), key: ' ' })).toBe(GATE_KEY.WAVE);
    expect(gateKeyVerdict({ beat: step('wave'), code: 'Space' })).toBe(GATE_KEY.WAVE);
    // Everywhere else it is the button that skips the opening.
    expect(gateKeyVerdict({ beat: step('place'), key: ' ' })).toBe(GATE_KEY.BLOCK);
    expect(gateKeyVerdict({ beat: step('upgrade'), code: 'Space' })).toBe(GATE_KEY.BLOCK);
  });

  it('only lets the pointed card be raised by its hotkey', () => {
    const place = step('place');
    expect(
      gateKeyVerdict({ beat: place, key: '1', buildKey: 'crossbow', allowedBuildKey: 'crossbow' })
    ).toBe(GATE_KEY.BUILD);
    // Another card is another defence: blocked.
    expect(
      gateKeyVerdict({ beat: place, key: '7', buildKey: 'royalArtillery', allowedBuildKey: 'crossbow' })
    ).toBe(GATE_KEY.BLOCK);
    // And no build key at all on the steps that are not asking for one.
    expect(
      gateKeyVerdict({ beat: step('upgrade'), key: '1', buildKey: 'crossbow', allowedBuildKey: 'crossbow' })
    ).toBe(GATE_KEY.BLOCK);
    expect(gateKeyVerdict({ beat: step('wave'), buildKey: 'crossbow', allowedBuildKey: 'crossbow' }))
      .toBe(GATE_KEY.BLOCK);
  });

  it('lets Escape put the card down — that is not a bypass', () => {
    expect(gateKeyVerdict({ beat: step('place'), key: 'Escape' })).toBe(GATE_KEY.CANCEL);
  });

  it('blocks every other key — powerups, codex, dock, pause', () => {
    for (const key of ['q', 'e', 't', 'r', 'h', 'c', 'l', 'p', 'f', '7']) {
      expect(gateKeyVerdict({ beat: step('place'), key })).toBe(GATE_KEY.BLOCK);
    }
  });
});

describe('the script the gate is wired to', () => {
  it('has exactly the three steps the shield knows how to open', () => {
    const events = TUTORIAL_BEATS.filter((beat) => beat.kind === 'step').map((beat) => beat.event);
    expect(events).toEqual(['place', 'upgrade', 'wave']);
  });
});
