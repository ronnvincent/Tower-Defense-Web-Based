// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { POWERUPS } from '../src/systems/Powerups.js';

/**
 * The powerup rail.
 *
 * It shipped as three perfect circles with a radial gradient, a font emoji and
 * a conic sweep — which is exactly the "AI slop" the rest of the HUD had
 * already been pulled away from. It is now the same object as everything else:
 * the kit's square plate, a 64 px pixel sigil, and a charge well that fills.
 *
 * `element.click()` ignores CSS, so the *look* is pinned as a stylesheet
 * contract in `tests/mobile-shell.test.js`. This file pins the DOM the CSS
 * hangs off, plus the two behaviours that live in JS: the countdown and the
 * single flash when a cooldown ends.
 */

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  const container = document.getElementById('hud-container');
  return { hud: new HUD(container, callbacks), container };
}

function snapshot(overrides = {}) {
  return POWERUPS.map((powerup) => ({
    key: powerup.key,
    name: powerup.name,
    icon: powerup.icon,
    hotkey: powerup.hotkey,
    accent: powerup.accent,
    targeting: powerup.targeting,
    description: powerup.description,
    ready: true,
    progress: 1,
    remainingMs: 0,
    ...(overrides[powerup.key] || {}),
  }));
}

describe('powerup rail markup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders a kit plate, a pixel sigil and a keycap for each powerup', () => {
    const { hud } = mountHud();
    hud.setPowerups(snapshot());

    const buttons = [...document.querySelectorAll('.powerup-btn')];
    expect(buttons).toHaveLength(4);

    for (const button of buttons) {
      // A real image from the interface kit — never a text glyph.
      const icon = button.querySelector('img.powerup-icon');
      expect(icon).toBeTruthy();
      expect(icon.getAttribute('src')).toMatch(/^\/assets\/ui-kit\/glyph_[a-z]+\.png$/);
      expect(icon.getAttribute('alt')).toBe('');
      // The plate the CSS 9-slices, and the well inside it.
      expect(button.querySelector('.powerup-plate .powerup-well')).toBeTruthy();
      // No leftover emoji anywhere in the button's own text.
      expect(button.textContent).not.toMatch(/[☄⚡✚]/);
      // Hotkey stays for the keyboard, on its own keycap.
      expect(button.querySelector('.powerup-key').textContent).toMatch(/^[QERT]$/);
    }
  });

  it('shows a countdown only while the sigil is cold', () => {
    const { hud } = mountHud();
    hud.setPowerups(
      snapshot({ meteor: { ready: false, progress: 0.25, remainingMs: 19_400 } })
    );

    const meteor = document.querySelector('[data-powerup="meteor"]');
    expect(meteor.classList.contains('ready')).toBe(false);
    expect(meteor.querySelector('.powerup-timer').textContent).toBe('20s');
    expect(meteor.style.getPropertyValue('--charge')).toBe('0.25');

    const overcharge = document.querySelector('[data-powerup="overcharge"]');
    expect(overcharge.classList.contains('ready')).toBe(true);
    // Ready: the well and the countdown both step aside for the sigil.
    expect(overcharge.querySelector('.powerup-timer').textContent).toBe('');
  });

  it('flashes once when a cooldown ends, not forever', () => {
    const { hud } = mountHud();
    hud.setPowerups(snapshot({ meteor: { ready: false, progress: 0.9, remainingMs: 1200 } }));
    const meteor = document.querySelector('[data-powerup="meteor"]');
    expect(meteor.classList.contains('just-ready')).toBe(false);

    hud.setPowerups(snapshot());
    expect(meteor.classList.contains('just-ready')).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(meteor.classList.contains('just-ready')).toBe(false);

    // A second ready snapshot must not re-flash.
    hud.setPowerups(snapshot());
    expect(meteor.classList.contains('just-ready')).toBe(false);
  });

  it('routes a tap to the scene', () => {
    const onPowerup = vi.fn();
    const { hud } = mountHud({ onPowerup });
    hud.setPowerups(snapshot());
    document.querySelector('[data-powerup="fortify"]').click();
    expect(onPowerup).toHaveBeenCalledWith('fortify');
  });
});
