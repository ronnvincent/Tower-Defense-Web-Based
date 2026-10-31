// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Small-screen HUD rules.
 *
 * Two complaints from a phone in landscape:
 *   1. the boss health card was a 460 px slab (frame + three rows) parked over
 *      the lane — it read as "the boss bar covers the whole screen";
 *   2. the forge dock owned the bottom third of the battlefield with no way to
 *      get it out of the way.
 *
 * Both are CSS contracts, so this file reads `src/style.css` as text and pins
 * the rules that make the boss card a slim strip and the dock foldable.
 */

const css = readFileSync('src/style.css', 'utf8');

/** Body of the first rule whose selector matches. */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

/** Everything inside the first `@media <query> {` block (nested braces aware). */
function mediaBlock(source, query) {
  const start = source.indexOf(`@media ${query} {`);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return '';
}

const COMPACT = mediaBlock(css, '(max-width: 900px), (max-height: 560px)');
const SHORT = mediaBlock(css, '(max-height: 430px)');

describe('boss health card on a phone', () => {
  it('never stretches across the screen', () => {
    const banner = rule(css, '#boss-banner');
    expect(banner).toMatch(/width:\s*min\(460px,\s*86vw\)/);
    // No rule may pin it to the viewport width or to all four insets.
    const bossRules = css
      .split('}')
      .filter((chunk) => /(^|\n)\s*(#boss-banner|\.boss-panel)\s*\{/.test(chunk));
    for (const chunk of bossRules) {
      expect(chunk).not.toMatch(/width:\s*100vw/);
      expect(chunk).not.toMatch(/inset:\s*0;/);
    }
  });

  it('shrinks to a strip under the top bar on narrow or short screens', () => {
    expect(COMPACT).toBeTruthy();
    expect(rule(COMPACT, '  #boss-banner')).toMatch(/width:\s*min\(360px,\s*62vw\)/);
    // Thinner frame, shorter bar, smaller text — that is the height budget.
    expect(rule(COMPACT, '  .boss-panel')).toMatch(/border-image-width:\s*12px 10px/);
    expect(rule(COMPACT, '  .boss-panel')).toMatch(/padding:\s*5px 12px/);
    expect(rule(COMPACT, '  .boss-bar-frame')).toMatch(/height:\s*8px/);
    // A long boss name or trait is ellipsised instead of wrapping the card wider.
    expect(rule(COMPACT, '  .boss-name')).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(COMPACT, '  .boss-ability-text')).toMatch(/max-width:\s*55%/);
  });

  it('drops the trait line on short landscape phones', () => {
    expect(SHORT).toBeTruthy();
    expect(rule(SHORT, '  #boss-banner')).toMatch(/width:\s*min\(300px,\s*54vw\)/);
    expect(SHORT).toMatch(/\.boss-skull,\s*\n?\s*\.boss-ability-text\s*\{\s*display:\s*none;/);
    expect(rule(SHORT, '  .boss-bar-frame')).toMatch(/height:\s*6px/);
    expect(rule(SHORT, '  .boss-panel')).toMatch(/border-image-width:\s*8px/);
  });

  it('stays under the toast lane instead of covering the top bar', () => {
    // The base rule pins it below the measured top-bar height; the compact
    // rules must not move it up over the toast strip.
    expect(rule(css, '#boss-banner')).toMatch(/top:\s*calc\(var\(--topbar-clearance\) \+ 46px\)/);
    expect(COMPACT).not.toMatch(/#boss-banner\s*\{[^}]*\btop:/);
    expect(SHORT).not.toMatch(/#boss-banner\s*\{[^}]*\btop:/);
  });
});

describe('forge dock fold', () => {
  it('turns the dock title into a real toggle', () => {
    const toggle = rule(css, '.dock-toggle');
    expect(toggle).toMatch(/pointer-events:\s*auto/); // the dock itself is click-through
    expect(toggle).toMatch(/cursor:/);
    expect(css).toMatch(/\.dock-toggle:focus-visible\s*\{/);
  });

  it('hides the cards but keeps the handle when folded', () => {
    // The tab bar folds with the cards: paging cards nobody can see is a control
    // that is live but useless, and it was the first thing players tapped.
    expect(css).toMatch(
      /\.hud-dock\.collapsed \.dock-cards,\s*\n\s*\.hud-dock\.collapsed \.dock-tabs,\s*\n\s*\.hud-dock\.collapsed #placement-hint\s*\{\s*display:\s*none;/
    );
    // The handle is the only way back, so nothing may hide it.
    expect(css).not.toMatch(/\.hud-dock\.collapsed \.dock-head\s*\{\s*display:\s*none/);
    const folded = rule(css, '.hud-dock.collapsed');
    expect(folded).toMatch(/padding:/);
    // The open forge is one 84 px translucent band; folding it drops the band
    // to the handle's 56 px. (It used to be a 205 px plate whose 20/34 px
    // `border-image` was what made it tall, which is what this pinned before
    // the UI overhaul replaced the frame with a glass band.)
    expect(rule(css, '.hud-dock')).toMatch(/height:\s*var\(--hud-dock-h\)/);
    expect(folded).toMatch(/height:\s*56px/);
  });

  it('flips the chevron so the fold is legible', () => {
    expect(rule(css, '.hud-dock.collapsed .dock-toggle-chevron')).toMatch(/transform:\s*rotate\(180deg\)/);
  });
});
