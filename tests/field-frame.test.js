// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { battleFrame } from '../src/camera/battleFrame.js';
import { mountScreen, unmountScreen } from '../src/ui/screenHost.js';

/**
 * Request 66 — "parang may frame talaga na nakapalibot sa mapa".
 *
 * Three things made a battlefield look framed, and this file pins all three:
 *
 *   the band      the camera used to start under the top rail, so a strip of
 *                 *page* sat above the field. A strip of page around a board is
 *                 a frame, however well its grass is matched: the band starts at
 *                 the top of the canvas and the rail's torn 15 % band is what
 *                 separates the readings from the field.
 *   the dock      the forge's own 15 % strip was a second black band, and while
 *                 folded it spilled a rectangle out of a 95 px BUILD chip.
 *   the flicker   every overlay re-mounts its root to re-render, and the root is
 *                 animated from `opacity: 0`: switching a companion in the
 *                 Muster Hall flashed the dark menu through the screen.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

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

function lastRuleBody(selector) {
  const all = allRuleBodies(selector);
  return all.length ? all[all.length - 1] : '';
}

describe('the band starts at the top of the canvas', () => {
  it('does not reserve a strip for the top rail', () => {
    const frame = battleFrame({ canvasHeight: 768, topBarBottom: 0, dockTop: 667 });
    expect(frame.top).toBe(0);
    expect(frame.height).toBe(661);
    // Nothing above the field for the page to show through.
    expect(frame.top).toBe(0);
  });

  it('still keeps a gap under a rail that is really there', () => {
    // Callers that do pass a rail (duels, the arena) keep their breathing room.
    const frame = battleFrame({ canvasHeight: 768, topBarBottom: 62, dockTop: 667, gap: 6 });
    expect(frame.top).toBe(68);
  });

  it('keeps the forge out of the board', () => {
    const frame = battleFrame({ canvasHeight: 768, topBarBottom: 0, dockTop: 667, gap: 6 });
    expect(frame.bottom).toBe(661);
    expect(frame.fitted).toBe(true);
  });
});

describe('the forge paints no band of its own', () => {
  it('switches both of the dock bands off', () => {
    const body = lastRuleBody('.hud-dock::before,\n.hud-dock::after');
    expect(body).not.toBe('');
    expect(body).toMatch(/content:\s*none/);
    expect(body).toMatch(/display:\s*none/);
  });

  it('leaves the top rail its torn 15 % band', () => {
    const band = lastRuleBody('.hud-topbar::before');
    expect(band).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.15\)/);
    expect(band).toMatch(/mask-image:\s*url\('\/assets\/ui-kit\/band-tear-bottom\.png'\)/);
  });
});

describe('the page strip is drawn like the board, not like a blur', () => {
  it('uses nearest-neighbour and the board grid', () => {
    const body = lastRuleBody('body.is-battle #app');
    expect(body).toMatch(/image-rendering:\s*pixelated/);
    expect(body).toMatch(/background-position:\s*var\(--field-x,\s*0px\)\s*var\(--field-y,\s*0px\)/);
    expect(body).toMatch(/background-size:\s*var\(--field-tile,\s*48px\)\s*var\(--field-tile,\s*48px\)/);
  });

  it('gives a phone a full-bleed stage so no page shows beside the canvas', () => {
    // The 1.25 × 5/3 cap would leave a 16 px column of page down each side of an
    // 844×390 phone; the compact query lifts it.
    expect(CSS).toMatch(
      /@media \(max-width: 900px\), \(max-height: 560px\) \{[\s\S]{0,900}?:root \{\s*--stage-width: 100vw;/
    );
  });
});

describe('a re-rendered screen does not fade in again', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const markup = '<div id="screen-x" class="overlay-screen">one</div>';

  it('plays the entrance the first time', () => {
    const node = mountScreen(container, 'screen-x', markup);
    expect(node.classList.contains('no-enter')).toBe(false);
  });

  it('skips it when the screen swaps its own contents', () => {
    mountScreen(container, 'screen-x', markup);
    const second = mountScreen(container, 'screen-x', '<div id="screen-x" class="overlay-screen">two</div>');
    expect(second.classList.contains('no-enter')).toBe(true);
    // Still exactly one screen in the layer.
    expect(container.querySelectorAll('#screen-x')).toHaveLength(1);
    expect(second.textContent).toBe('two');
  });

  it('plays it again after the screen is closed and reopened', () => {
    mountScreen(container, 'screen-x', markup);
    mountScreen(container, 'screen-x', markup);
    unmountScreen(container, 'screen-x');
    // Opening a screen is an entrance again: `no-enter` only ever decorates the
    // node that replaced one still in the layer, and a closed screen is gone.
    const reopened = mountScreen(container, 'screen-x', markup);
    expect(reopened.classList.contains('no-enter')).toBe(false);
  });

  it('silences the animation in the stylesheet', () => {
    expect(CSS).toMatch(/\.overlay-screen\.no-enter \{\s*animation:\s*none;/);
    // And the entrance it suppresses is still the one every screen uses.
    expect(CSS).toMatch(/\.overlay-screen \{[\s\S]*?animation: screenIn/);
  });
});
