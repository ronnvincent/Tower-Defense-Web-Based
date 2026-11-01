// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

/**
 * Forge dock fold.
 *
 * The dock is where the player builds, and on a phone in landscape seven cards
 * plus the wave button own the bottom of the screen. The title is also a button:
 * it folds the cards away into a slim labelled strip and back again, without
 * pausing, and the choice survives a reload. These tests pin the DOM contract
 * the scene and the layout observer depend on.
 */

const $ = (id) => document.getElementById(id);

function mount() {
  document.body.innerHTML = '<div id="hud-root"></div>';
  const callbacks = {
    onSelectBuild: vi.fn(),
    onStartWave: vi.fn(),
    onTogglePause: vi.fn(),
  };
  const hud = new HUD($('hud-root'), callbacks);
  return { hud, callbacks };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.cssText = '';
});

describe('forge dock fold', () => {
  it('ships an open dock with a labelled toggle handle', () => {
    const { hud } = mount();
    const dock = $('hud-bottom-dock');
    const btn = $('btn-toggle-dock');

    expect(dock.classList.contains('collapsed')).toBe(false);
    expect(hud.dockCollapsed).toBe(false);
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe('dock-cards-container');
    // The handle carries the dock's name, so a folded dock still explains itself.
    expect($('dock-title').textContent).toBe('FORGE DEFENSES');
    expect(btn.textContent).toContain('FORGE DEFENSES');
  });

  it('folds the cards away and opens them again from the same tap target', () => {
    const { hud } = mount();
    const dock = $('hud-bottom-dock');
    const btn = $('btn-toggle-dock');

    btn.click();
    expect(hud.dockCollapsed).toBe(true);
    expect(dock.classList.contains('collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('title')).toMatch(/show the forge/i);
    // Cards stay in the DOM — the fold is CSS, so nothing has to be re-rendered.
    expect($('dock-cards-container').querySelectorAll('.build-card').length).toBeGreaterThan(0);

    btn.click();
    expect(hud.dockCollapsed).toBe(false);
    expect(dock.classList.contains('collapsed')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('cancels an armed defence instead of hiding it', () => {
    const { hud, callbacks } = mount();
    hud.toggleBuildSelection('archer');
    expect(hud.selectedBuildKey).toBe('archer');
    callbacks.onSelectBuild.mockClear();

    hud.setDockCollapsed(true);
    expect(hud.selectedBuildKey).toBeNull();
    expect(callbacks.onSelectBuild).toHaveBeenCalledWith(null);
    expect($('placement-hint').classList.contains('hidden')).toBe(true);
  });

  it('opens itself when a build hotkey arms a card', () => {
    const { hud } = mount();
    hud.setDockCollapsed(true);
    hud.toggleBuildSelection('cannon');
    expect(hud.dockCollapsed).toBe(false);
    expect(hud.selectedBuildKey).toBe('cannon');
  });

  it('remembers the fold across battles and reloads', () => {
    const { hud } = mount();
    hud.setDockCollapsed(true);
    expect(window.localStorage.getItem('td-dsalgo:dock-collapsed:v1')).toBe('1');

    // A fresh HUD (new battle / reload) restores the fold before the first frame.
    const second = mount();
    expect(second.hud.dockCollapsed).toBe(true);
    expect($('hud-bottom-dock').classList.contains('collapsed')).toBe(true);

    second.hud.setDockCollapsed(false);
    expect(window.localStorage.getItem('td-dsalgo:dock-collapsed:v1')).toBe('0');
  });

  it('survives a browser that refuses storage', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { hud } = mount();
    expect(hud.dockCollapsed).toBe(false);
    expect(() => hud.setDockCollapsed(true)).not.toThrow();

    spy.mockRestore();
    setSpy.mockRestore();
  });

  it('re-measures the dock so the floating controls follow it', () => {
    const { hud } = mount();
    const schedule = vi.spyOn(hud.layout, 'schedule');

    hud.setDockCollapsed(true);
    expect(schedule).toHaveBeenCalled();
  });

  it('restores the campaign label after a duel renamed the dock', () => {
    const { hud } = mount();
    hud.setMatchLabel('DUEL · FORGE DEFENCES');
    expect($('dock-title').textContent).toBe('DUEL · FORGE DEFENCES');

    hud.reset();
    expect($('dock-title').textContent).toBe('FORGE DEFENSES');
  });
});
