// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

/**
 * The opening's press shield, in the DOM.
 *
 * `setTutorialHint` paints the hole; `setTutorialLock` closes everything else.
 * These tests drive the real HUD and read the boxes it lays out, because the
 * whole point of the fix is that the shield lands on *pixels* — the geometry is
 * the behaviour.
 */

const W = 1280;
const H = 768;

function mount() {
  document.body.innerHTML = '<div id="hud-root"></div>';
  const hud = new HUD(document.getElementById('hud-root'), {
    onSelectBuild: vi.fn(),
    onStartWave: vi.fn(),
    onTogglePause: vi.fn(),
  });
  return hud;
}

const gateEls = () => [...document.querySelectorAll('#tutorial-gate .tut-blocker')]
  .filter((box) => box.style.display !== 'none')
  .map((box) => ({
    left: parseFloat(box.style.left),
    top: parseFloat(box.style.top),
    right: parseFloat(box.style.left) + parseFloat(box.style.width),
    bottom: parseFloat(box.style.top) + parseFloat(box.style.height),
  }));

const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
const overlaps = (a, b) =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.cssText = '';
  Object.defineProperty(window, 'innerWidth', { value: W, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: H, configurable: true });
});

describe('the shield', () => {
  it('is not mounted during ordinary play', () => {
    mount();
    expect(document.getElementById('tutorial-gate')).toBeNull();
  });

  it('leaves the pointed control pressable and nothing else', () => {
    const hud = mount();
    const spot = { left: 420, top: 300, width: 160, height: 90 };
    hud.setTutorialHint({ spot: () => spot });
    hud.setTutorialLock(true);

    const gate = document.getElementById('tutorial-gate');
    expect(gate).toBeTruthy();
    expect(gate.classList.contains('hidden')).toBe(false);

    const boxes = gateEls();
    expect(boxes.length).toBeGreaterThan(0);
    // The hole (spot padded by 8, as the veil is) is the only live region.
    const hole = { left: 412, top: 292, right: 588, bottom: 398 };
    for (const box of boxes) expect(overlaps(box, hole)).toBe(false);
    // Everything outside it is covered.
    expect(boxes.reduce((sum, box) => sum + area(box), 0)).toBe(W * H - area(hole));
  });

  it('closes the whole screen while a line of dialogue is up', () => {
    const hud = mount();
    hud.setTutorialLock(true);
    hud.setTutorialHint(null);
    const boxes = gateEls();
    expect(boxes.length).toBe(1);
    expect(boxes[0]).toEqual({ left: 0, top: 0, right: W, bottom: H });
  });

  it('does not trap the player when the control has not been laid out yet', () => {
    const hud = mount();
    hud.setTutorialLock(true);
    // A step whose target is not on screen (the inspector is still opening).
    hud.setTutorialHint({ spot: () => ({ left: 0, top: 0, width: 0, height: 0 }) });
    const gate = document.getElementById('tutorial-gate');
    expect(gate?.classList.contains('hidden')).toBe(true);
  });

  it('hands the screen back the moment the lock is lifted', () => {
    const hud = mount();
    hud.setTutorialHint({ spot: () => ({ left: 100, top: 100, width: 80, height: 40 }) });
    hud.setTutorialLock(true);
    expect(gateEls().length).toBeGreaterThan(0);
    hud.setTutorialLock(false);
    expect(gateEls().length).toBe(0);
    expect(document.getElementById('tutorial-gate').classList.contains('hidden')).toBe(true);
  });

  it('swallows a press that lands on it, and flashes the hole instead', () => {
    const hud = mount();
    hud.setTutorialHint({ spot: () => ({ left: 100, top: 100, width: 80, height: 40 }) });
    hud.setTutorialLock(true);
    const box = document.querySelector('#tutorial-gate .tut-blocker');
    expect(box).toBeTruthy();
    const leaked = vi.fn();
    document.addEventListener('click', leaked);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    box.dispatchEvent(event);
    expect(leaked).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    // And the player is told where the press should have gone.
    expect(document.getElementById('tutorial-spotlight').classList.contains('is-nudge')).toBe(true);
    document.removeEventListener('click', leaked);
  });

  it('stops Enter on a HUD button from acting as a click', () => {
    const hud = mount();
    hud.setTutorialHint({ spot: () => ({ left: 100, top: 100, width: 80, height: 40 }) });
    hud.setTutorialLock(true);
    document.body.insertAdjacentHTML('beforeend', '<button id="not-the-target" type="button">wave</button>');
    const button = document.getElementById('not-the-target');
    button.addEventListener('click', () => {});
    const event = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets the keyboard through once the lock is lifted', () => {
    const hud = mount();
    hud.setTutorialLock(true);
    hud.setTutorialLock(false);
    document.body.insertAdjacentHTML('beforeend', '<button id="after" type="button">wave</button>');
    const event = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.getElementById('after').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
