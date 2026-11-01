// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { PowerupState, POWERUPS } from '../src/systems/Powerups.js';

function mountHud(callbacks = {}) {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  return new HUD(document.getElementById('hud-container'), callbacks);
}

describe('Powerup rail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders one button per powerup with its hotkey', () => {
    const hud = mountHud();
    hud.setPowerups(new PowerupState(0).snapshot());

    const rail = document.getElementById('powerup-rail');
    expect(rail).toBeTruthy();
    const buttons = rail.querySelectorAll('.powerup-btn');
    expect(buttons).toHaveLength(POWERUPS.length);
    for (const powerup of POWERUPS) {
      const button = rail.querySelector(`[data-powerup="${powerup.key}"]`);
      expect(button, `${powerup.key} has no button`).toBeTruthy();
      expect(button.querySelector('.powerup-key').textContent).toBe(powerup.hotkey);
    }
  });

  it('marks a cooling powerup and shows the seconds left', () => {
    const hud = mountHud();
    const state = new PowerupState(0);
    state.use('meteor');
    state.tick(1000);
    hud.setPowerups(state.snapshot());

    const meteor = document.querySelector('[data-powerup="meteor"]');
    expect(meteor.classList.contains('ready')).toBe(false);
    expect(meteor.querySelector('.powerup-timer').textContent).toMatch(/^\d+s$/);
    // A ready powerup carries no timer text and is flagged ready.
    const overcharge = document.querySelector('[data-powerup="overcharge"]');
    expect(overcharge.classList.contains('ready')).toBe(true);
    expect(overcharge.querySelector('.powerup-timer').textContent).toBe('');
  });

  it('drives the cooldown sweep through a CSS variable', () => {
    const hud = mountHud();
    const state = new PowerupState(0);
    state.use('fortify');
    hud.setPowerups(state.snapshot());
    const button = document.querySelector('[data-powerup="fortify"]');
    expect(Number(button.style.getPropertyValue('--charge'))).toBe(0);

    state.tick(21000); // half of the 42 s cooldown
    hud.setPowerups(state.snapshot());
    const mid = Number(button.style.getPropertyValue('--charge'));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('forwards a click to the scene callback', () => {
    const onPowerup = vi.fn();
    const hud = mountHud({ onPowerup });
    hud.setPowerups(new PowerupState(0).snapshot());

    document.querySelector('[data-powerup="overcharge"]').dispatchEvent(new Event('click'));
    expect(onPowerup).toHaveBeenCalledWith('overcharge');
  });

  it('does not rebuild the rail on every repaint', () => {
    const hud = mountHud();
    hud.setPowerups(new PowerupState(0).snapshot());
    const first = document.querySelector('[data-powerup="meteor"]');
    hud.setPowerups(new PowerupState(500).snapshot());
    const second = document.querySelector('[data-powerup="meteor"]');
    expect(second).toBe(first);
  });

  it('only rings the meteor as a targeting powerup', () => {
    const hud = mountHud();
    hud.setPowerups(new PowerupState(0).snapshot());
    expect(document.querySelector('[data-powerup="meteor"]').classList.contains('targeting')).toBe(true);
    expect(document.querySelector('[data-powerup="fortify"]').classList.contains('targeting')).toBe(false);
  });
});
