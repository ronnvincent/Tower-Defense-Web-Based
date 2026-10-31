// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HUD } from '../src/ui/HUD.js';

/**
 * Can the player actually hit the controls?
 *
 * `#hud-container` and every `.hud-panel` inside it are `pointer-events: none`
 * so that drags on empty HUD space fall through to the battlefield. Each real
 * control therefore has to opt back in with `pointer-events: auto`.
 *
 * The dock tabs did not. The ENGINEER page — crossbow, gatling, flamer, venom,
 * harpoon — was painted, styled, focusable in markup and wired to a working
 * click handler, so every DOM test passed (`element.click()` ignores CSS), and
 * yet the tab could not be clicked or tapped at all: it was the only control in
 * the HUD that inherited `none`. The five engineer defences were unreachable in
 * play while the hotkeys kept working.
 *
 * jsdom has no layout, so this suite does not measure pixels. It walks the real
 * DOM the HUD builds and resolves `pointer-events` through the real cascade —
 * first explicit declaration wins, nearest ancestor first. A control that
 * resolves to anything other than `auto` fails here, whether it is a tab, a
 * card or something that does not exist yet.
 */

// `import.meta.url` is a document URL under the jsdom environment, so the
// stylesheet is read from the project root instead.
const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** Every rule in the stylesheet that declares `pointer-events`, in source order. */
function pointerRules() {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2];
    const decl = body.match(/pointer-events\s*:\s*([a-z-]+)/);
    if (!decl) continue;
    for (const selector of match[1].split(',')) {
      const trimmed = selector.trim();
      // Keyframe stops and other at-rule fragments are not element selectors.
      if (!trimmed || trimmed.startsWith('@') || /^(from|to|\d+%)$/.test(trimmed)) continue;
      rules.push({ selector: trimmed, value: decl[1] });
    }
  }
  return rules;
}

const RULES = pointerRules();

/** Resolved `pointer-events` for an element, nearest declaration winning. */
function pointerEventsOf(element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const hits = RULES.filter((rule) => {
      try {
        return node.matches(rule.selector);
      } catch {
        return false;
      }
    });
    // A descendant combinator only matches when the whole path matches, so the
    // last (most specific/latest) hit on this node is the one that applies.
    if (hits.length) return hits[hits.length - 1].value;
  }
  return 'auto';
}

function mountHud() {
  document.body.innerHTML = `
    <div id="app">
      <div id="hud-container"></div>
      <div id="hud-bottom-dock">
        <div id="dock-tabs"></div>
        <div id="dock-cards-container"></div>
      </div>
    </div>`;
  return new HUD(document.getElementById('hud-container'), {});
}

describe('HUD hit areas', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('still parks the HUD shell on pointer-events: none', () => {
    // The whole contract depends on this: if the shell ever became clickable it
    // would eat battlefield drags, and if it stopped being `none` the opt-ins
    // below would be pointless.
    expect(RULES.some((rule) => rule.selector === '.hud-panel' && rule.value === 'none')).toBe(true);
  });

  it('gives every control in the dock a real hit area', () => {
    mountHud();
    const dock = document.getElementById('hud-bottom-dock');
    const controls = [...dock.querySelectorAll('button')];
    expect(controls.length).toBeGreaterThan(0);
    const dead = controls
      .filter((control) => pointerEventsOf(control) !== 'auto')
      .map((control) => control.className || control.id);
    expect(dead, 'these dock controls inherit pointer-events: none and cannot be clicked').toEqual([]);
  });

  it('every tab is clickable, not just the selected one', () => {
    mountHud();
    const tabs = [...document.querySelectorAll('.dock-tab')];
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      // The bug in one line: the inactive tab was the one that could not be hit.
      expect(pointerEventsOf(tab), `${tab.dataset.group} tab is not hittable`).toBe('auto');
    }
  });

  it('every button the HUD paints resolves to a hittable element', () => {
    mountHud();
    const dead = [...document.querySelectorAll('#hud-container button')]
      .filter((button) => pointerEventsOf(button) !== 'auto')
      .map((button) => button.className || button.id);
    expect(dead).toEqual([]);
  });
});

describe('dock tab keyboard access', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reaches the other page with the arrow keys', () => {
    mountHud();
    const tabs = [...document.querySelectorAll('.dock-tab')];
    const first = tabs[0];
    const second = tabs[1];
    first.focus();
    first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.getElementById('hud-bottom-dock').dataset.group).toBe(second.dataset.group);
    expect(document.activeElement).toBe(second);

    second.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.getElementById('hud-bottom-dock').dataset.group).toBe(first.dataset.group);
    expect(document.activeElement).toBe(first);
  });

  it('wraps around and honours Home / End', () => {
    mountHud();
    const tabs = [...document.querySelectorAll('.dock-tab')];
    const dock = document.getElementById('hud-bottom-dock');
    tabs[0].focus();
    tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(dock.dataset.group).toBe(tabs[tabs.length - 1].dataset.group);
    tabs[tabs.length - 1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(dock.dataset.group).toBe(tabs[0].dataset.group);
    tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(dock.dataset.group).toBe(tabs[tabs.length - 1].dataset.group);
  });
});
