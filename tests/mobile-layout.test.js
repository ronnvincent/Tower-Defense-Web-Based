// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dockClearance, topClearance, HudLayout, HUD_GAP_PX } from '../src/ui/hudLayout.js';

/**
 * Mobile layout contract:
 *   1. the placement hint is a flow child of the dock (it can never cover cards)
 *   2. floating HUD elements are positioned from *measured* panel heights
 *   3. the stage covers the viewport instead of leaving bands on a phone
 *   4. the page cannot be pinch-zoomed by the browser
 */

const css = readFileSync('src/style.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const hudSource = readFileSync('src/ui/HUD.js', 'utf8');

/** Return the body of the first CSS rule whose selector matches. */
function rule(source, selector, occurrence = 1) {
  let start = -1;
  let from = 0;
  for (let i = 0; i < occurrence; i += 1) {
    start = source.indexOf(`${selector} {`, from);
    if (start === -1) return '';
    from = start + selector.length;
  }
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

function stubRect(el, rect) {
  el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect });
}

describe('Clearance maths', () => {
  it('measures the gap between the dock top and the bottom of the screen', () => {
    // 800 px viewport, dock top at 690, dock is 90 px tall: 110 px + the gap.
    expect(dockClearance({ top: 690, height: 90 }, 800)).toBe(110 + HUD_GAP_PX);
  });

  it('never returns a negative clearance when the dock overflows', () => {
    expect(dockClearance({ top: 900, height: 90 }, 800)).toBe(0);
  });

  it('returns null until a panel has been laid out', () => {
    expect(dockClearance(null, 800)).toBeNull();
    expect(dockClearance({ top: 690, height: 0 }, 800)).toBeNull();
    expect(dockClearance({ top: 690, height: 90 }, NaN)).toBeNull();
  });

  it('measures the top bar the same way', () => {
    expect(topClearance({ bottom: 72, height: 72 })).toBe(82);
    expect(topClearance({ bottom: 0, height: 0 })).toBeNull();
  });
});

describe('HudLayout', () => {
  let dock;
  let topbar;

  beforeEach(() => {
    document.documentElement.style.cssText = '';
    document.body.innerHTML = `
      <div id="hud-top-bar"></div>
      <div id="hud-bottom-dock"><span id="placement-hint"></span></div>`;
    dock = document.getElementById('hud-bottom-dock');
    topbar = document.getElementById('hud-top-bar');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('publishes the measured heights as custom properties', () => {
    stubRect(dock, { top: 640, height: 120 });
    stubRect(topbar, { bottom: 68, height: 68 });

    const layout = new HudLayout();
    layout.sync();

    // bottom of the viewport - dock top + gap
    const expected = `${window.innerHeight - 640 + HUD_GAP_PX}px`;
    expect(document.documentElement.style.getPropertyValue('--dock-clearance')).toBe(expected);
    // top bar bottom + gap
    expect(document.documentElement.style.getPropertyValue('--topbar-clearance')).toBe('78px');
  });

  it('leaves the CSS seeds alone while the panels are unmeasured', () => {
    const layout = new HudLayout();
    layout.sync();
    expect(document.documentElement.style.getPropertyValue('--dock-clearance')).toBe('');
  });

  it('grows the clearance when the placement hint makes the dock taller', () => {
    stubRect(dock, { top: 640, height: 120 });
    const layout = new HudLayout();
    layout.sync();
    const before = document.documentElement.style.getPropertyValue('--dock-clearance');

    stubRect(dock, { top: 596, height: 164 });
    layout.sync();
    const after = document.documentElement.style.getPropertyValue('--dock-clearance');

    expect(parseInt(after, 10)).toBeGreaterThan(parseInt(before, 10));
  });

  it('detaches cleanly', () => {
    const layout = new HudLayout();
    layout.observe();
    expect(() => layout.disconnect()).not.toThrow();
    expect(layout.observer).toBeNull();
    expect(layout.onResize).toBeNull();
  });
});

describe('Placement hint cannot cover the dock', () => {
  it('is a flow child of the dock, not an absolute overlay', () => {
    expect(hudSource).toMatch(/<div id="hud-bottom-dock"[\s\S]*?<div id="placement-hint"/);
    const block = rule(css, '.placement-hint');
    expect(block).toContain('position: static');
    expect(block).not.toContain('position: absolute');
    expect(block).not.toContain('bottom: calc(100%');
  });

  it('stacks above the cards with a margin', () => {
    const block = rule(css, '.placement-hint');
    expect(block).toMatch(/margin:\s*0 auto 8px/);
    expect(block).toContain('max-width: 100%');
  });
});

describe('Viewport and stage sizing', () => {
  it('uses exactly the requested viewport meta', () => {
    expect(html).toContain(
      'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"'
    );
  });

  it('locks the page against scroll, bounce and pinch', () => {
    const htmlBlock = rule(css, 'html');
    expect(htmlBlock).toContain('touch-action: none');
    expect(htmlBlock).toContain('overscroll-behavior: none');
    // html/body share the sizing rule, which also stops mobile text inflation.
    expect(rule(css, 'body')).toContain('text-size-adjust: 100%');

    // The 2nd `body {` is the standalone rule (the 1st shares a selector list
    // with `html` and only carries the sizing).
    const bodyBlock = rule(css, 'body', 2);
    expect(bodyBlock).toContain('touch-action: none');
    expect(bodyBlock).toContain('overscroll-behavior: none');
  });

  it('pins the app shell to the viewport', () => {
    const app = rule(css, '#app');
    expect(app).toContain('width: 100vw');
    expect(app).toContain('height: 100vh');
    expect(app).toContain('overflow: hidden');
  });

  it('scales the 5:3 stage to the full width of the viewport', () => {
    const stage = rule(css, '#game-container');
    expect(stage).toContain('width: var(--stage-width)');
    expect(stage).toContain('height: calc(var(--stage-width) * 3 / 5)');
    expect(stage).toContain('translate(-50%, -50%)');

    // Full-bleed width, with the vertical crop capped at 1.25 × the viewport.
    const root = css.slice(css.indexOf(':root'), css.indexOf(':root') + 4000);
    expect(root).toContain('--stage-width: min(100vw, calc(100vh * 25 / 12))');
  });

  it('anchors the HUD and the dock inside the viewport, not the stage', () => {
    const hud = rule(css, '#hud-container');
    expect(hud).toContain('position: absolute');
    expect(hud).toContain('inset: 0');

    const dock = rule(css, '.hud-dock');
    expect(dock).toContain('bottom:');
    expect(dock).toContain('max-width: calc(100vw');
  });

  it('keeps the floating camera controls on the measured dock clearance', () => {
    expect(rule(css, '.camera-cluster')).toContain('bottom: var(--dock-clearance)');
    expect(rule(css, '.toast-banner')).toContain('top: var(--topbar-clearance)');
    // The boss warning sits below the toast lane, not on top of it.
    expect(rule(css, '#boss-banner')).toContain('top: calc(var(--topbar-clearance) + 46px)');
  });

  it('keeps the top bar on a single row on short landscape screens', () => {
    const short = css.slice(css.indexOf('@media (max-height: 460px)'));
    expect(short).toContain('flex-wrap: nowrap');
    expect(short).toMatch(/\.hud-center-group\s*\{[^}]*order: 2/);
    expect(short).toMatch(/\.hud-controls-group\s*\{[^}]*order: 3/);
  });

  it('hides the zoom pill on touch devices but keeps reset', () => {
    expect(css).toMatch(/#btn-zoom-in,\s*#btn-zoom-out\s*\{\s*display: none;/);
    expect(css).not.toMatch(/#btn-zoom-fit\s*\{\s*display: none;/);
  });
});
