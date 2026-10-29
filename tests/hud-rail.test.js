// The top rail draws no cards.
//
// The bar used to be a row of engraved plates: a 9-slice sprite frame on the
// bar itself, then another framed slot behind BASE, GOLD, SCORE, the wave pill
// and each of the four controls. The rail is now a black fade plus type, so
// what has to stay true is negative and easy to undo by accident: no frame, no
// plate, no chip. These assert the *last* declaration for each selector — the
// cascade's answer — not the first one the file happens to contain.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** Body of the last `selector {` rule in the stylesheet. */
function lastRuleBody(selector) {
  const needle = `\n${selector} {`;
  const start = CSS.lastIndexOf(needle);
  if (start === -1) return '';
  const end = CSS.indexOf('}', start);
  return CSS.slice(start, end);
}

/** Every body for a selector, oldest first. */
function allRuleBodies(selector) {
  const needle = `\n${selector} {`;
  const out = [];
  let at = CSS.indexOf(needle);
  while (at !== -1) {
    out.push(CSS.slice(at, CSS.indexOf('}', at)));
    at = CSS.indexOf(needle, at + 1);
  }
  return out;
}

describe('the top rail', () => {
  it('replaces the bar frame with a fade that can bleed past its own box', () => {
    const bar = lastRuleBody('.hud-topbar');
    expect(bar).toMatch(/border:\s*none/);
    expect(bar).toMatch(/border-image:\s*none/);
    expect(bar).toMatch(/background:\s*transparent/);

    const fade = lastRuleBody('.hud-topbar::before');
    expect(fade).toMatch(/linear-gradient/);
    expect(fade).toMatch(/mask-image/);
    // A pseudo-element, so the dissolve is not clipped to the bar's height.
    expect(fade).toMatch(/position:\s*absolute/);
    expect(fade).toMatch(/z-index:\s*-1/);
  });

  it('paints no plate behind the readings', () => {
    for (const selector of ['.hud-stat', '.hud-wave-badge']) {
      const body = lastRuleBody(selector);
      expect(body, selector).toMatch(/border:\s*none/);
      expect(body, selector).toMatch(/background:\s*transparent/);
    }
  });

  it('draws the four controls as glyphs, not chips', () => {
    const body = lastRuleBody('.hud-topbar .game-btn-icon');
    expect(body).toMatch(/border-width:\s*0/);
    expect(body).toMatch(/background:\s*none/);
    expect(body).toMatch(/box-shadow:\s*none/);
    // The 44 px box is the touch target and stays; only its paint goes.
    const base = allRuleBodies('.game-btn-icon')[0] || '';
    expect(base).toMatch(/width:\s*44px/);
    expect(base).toMatch(/height:\s*44px/);
  });

  it('makes START WAVE type on the fade instead of a gold plate', () => {
    const body = lastRuleBody('.hud-topbar #btn-start-wave');
    expect(body).toMatch(/border-width:\s*0/);
    expect(body).toMatch(/border-image:\s*none/);
    expect(body).toMatch(/background:\s*none/);
    expect(body).toMatch(/font-family:\s*var\(--font-display\)/);
    // Hierarchy has to survive the plate going: the call is bigger than the
    // labels around it (10 px) and carries a rule of its own.
    const size = /font-size:\s*(\d+)px/.exec(body);
    expect(Number(size?.[1])).toBeGreaterThan(14);
    expect(lastRuleBody('.hud-topbar #btn-start-wave::after')).toMatch(/linear-gradient/);
  });

  it('keeps the level name a caption', () => {
    const body = lastRuleBody('.hud-level-chip');
    expect(body).toMatch(/border:\s*none/);
    expect(body).toMatch(/background:\s*none/);
  });

  it('shrinks the call on the 44 px phone rail', () => {
    const mobile = lastRuleBody("[data-shell='mobile'] .hud-topbar #btn-start-wave");
    expect(mobile).toMatch(/min-width:\s*0/);
    const size = /font-size:\s*(\d+)px/.exec(mobile);
    expect(Number(size?.[1])).toBeLessThan(14);
    // The label is hidden on a phone by the shell contract; the rail must not
    // bring it back with a more specific rule.
    for (const body of allRuleBodies('.hud-topbar .hud-label')) {
      expect(body).not.toMatch(/display:\s*(block|inline)\b/);
    }
  });
});
