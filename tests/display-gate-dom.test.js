// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DisplayGateUI } from '../src/ui/DisplayGateUI.js';
import { HUD } from '../src/ui/HUD.js';
import { GATE_MODE } from '../src/system/displayMode.js';

/**
 * The gates live in index.html (outside #app) so they can cover the whole
 * screen. These tests load the real markup so an id rename in the HTML is
 * caught here rather than silently leaving a player stuck behind a blank
 * overlay.
 */

const html = readFileSync('index.html', 'utf8');

function mountFromIndex() {
  const start = html.indexOf('<body>');
  const end = html.indexOf('</body>');
  const body = html.slice(start + 6, end).replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

const $ = (id) => document.getElementById(id);
const isHidden = (el) => el.classList.contains('hidden');

beforeEach(() => {
  mountFromIndex();
});

describe('index.html display gate markup', () => {
  it('ships both gates hidden and inert', () => {
    for (const id of ['rotate-hint', 'fullscreen-gate']) {
      const el = $(id);
      expect(el, `${id} is missing from index.html`).toBeTruthy();
      expect(el.classList.contains('display-gate')).toBe(true);
      expect(isHidden(el)).toBe(true);
      expect(el.hasAttribute('inert')).toBe(true);
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('gates are siblings of #app, not children', () => {
    // position: fixed is not enough if an ancestor creates a containing block;
    // keeping them outside #app guarantees full-screen coverage.
    expect($('app').contains($('rotate-hint'))).toBe(false);
    expect($('app').contains($('fullscreen-gate'))).toBe(false);
  });

  it('exposes the buttons and copy the controller drives', () => {
    expect($('btn-enter-fullscreen')).toBeTruthy();
    expect($('btn-skip-fullscreen')).toBeTruthy();
    expect($('rotate-gate-title').textContent).toMatch(/rotate/i);
    expect($('fullscreen-gate-title').textContent).toMatch(/fullscreen/i);

    const text = $('rotate-hint').textContent.toLowerCase();
    expect(text).toContain('rotate');
    expect(text).toContain('paused');
  });

  it('declares a landscape web-app manifest and safe-area viewport', () => {
    const viewport = html.match(/name="viewport"\s*\n?\s*content="([^"]+)"/)?.[1] || '';
    expect(viewport).toContain('viewport-fit=cover');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-mobile-web-app-capable');

    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});

describe('DisplayGateUI', () => {
  it('opens the portrait gate and blocks the page behind it', () => {
    const ui = new DisplayGateUI();
    ui.apply({ mode: GATE_MODE.ROTATE, orientation: 'portrait' });

    expect(isHidden($('rotate-hint'))).toBe(false);
    expect(isHidden($('fullscreen-gate'))).toBe(true);
    expect($('rotate-hint').hasAttribute('inert')).toBe(false);
    expect(document.body.classList.contains('gameplay-blocked')).toBe(true);
    expect(document.body.classList.contains('gate-portrait')).toBe(true);
  });

  it('switches to the fullscreen gate on rotation', () => {
    const ui = new DisplayGateUI();
    ui.apply({ mode: GATE_MODE.ROTATE, orientation: 'portrait' });
    ui.apply({ mode: GATE_MODE.FULLSCREEN, orientation: 'landscape' });

    expect(isHidden($('rotate-hint'))).toBe(true);
    expect(isHidden($('fullscreen-gate'))).toBe(false);
    expect($('rotate-hint').hasAttribute('inert')).toBe(true);
    expect(document.body.classList.contains('gate-portrait')).toBe(false);
    expect(document.body.classList.contains('gate-fullscreen')).toBe(true);
    expect(document.body.dataset.orientation).toBe('landscape');
  });

  it('closes both gates and unblocks the page', () => {
    const ui = new DisplayGateUI();
    ui.apply({ mode: GATE_MODE.FULLSCREEN, orientation: 'landscape' });
    ui.apply({ mode: GATE_MODE.NONE, orientation: 'landscape' });

    expect(isHidden($('rotate-hint'))).toBe(true);
    expect(isHidden($('fullscreen-gate'))).toBe(true);
    expect(document.body.classList.contains('gameplay-blocked')).toBe(false);
    expect($('fullscreen-gate').getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards both gate buttons', () => {
    const onEnterFullscreen = vi.fn();
    const onSkipFullscreen = vi.fn();
    new DisplayGateUI({ onEnterFullscreen, onSkipFullscreen });

    $('btn-enter-fullscreen').click();
    $('btn-skip-fullscreen').click();

    expect(onEnterFullscreen).toHaveBeenCalledTimes(1);
    expect(onSkipFullscreen).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on destroy', () => {
    const onEnterFullscreen = vi.fn();
    const ui = new DisplayGateUI({ onEnterFullscreen });
    ui.destroy();

    $('btn-enter-fullscreen').click();
    expect(onEnterFullscreen).not.toHaveBeenCalled();
  });

  it('moves focus to the actionable control', () => {
    const ui = new DisplayGateUI();
    ui.apply({ mode: GATE_MODE.FULLSCREEN, orientation: 'landscape' });
    expect(document.activeElement).toBe($('btn-enter-fullscreen'));
  });
});

describe('HUD fullscreen toggle', () => {
  let hud;

  beforeEach(() => {
    document.body.innerHTML = '<div id="hud-root"></div>';
    hud = new HUD($('hud-root'));
  });

  it('renders a fullscreen button in the top bar', () => {
    const btn = $('btn-fullscreen');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('mirrors the fullscreen state', () => {
    hud.setFullscreenState({ supported: true, active: true });
    const btn = $('btn-fullscreen');
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen');

    hud.setFullscreenState({ active: false });
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Enter fullscreen');
  });

  it('hides the button when the browser cannot do fullscreen', () => {
    hud.setFullscreenState({ supported: false, active: false });
    expect(isHidden($('btn-fullscreen'))).toBe(true);
  });

  it('delegates clicks to window.gameFullscreen', () => {
    const toggle = vi.fn();
    window.gameFullscreen = { toggle };
    try {
      $('btn-fullscreen').click();
      expect(toggle).toHaveBeenCalledTimes(1);
    } finally {
      delete window.gameFullscreen;
    }
  });
});
