// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PetShopUI } from '../src/ui/PetShopUI.js';
import { PETS } from '../src/data/petData.js';
import { ProgressStore } from '../src/systems/Progression.js';

/**
 * The Muster Hall's state ribbon.
 *
 * Request 65: on a phone the "NOT RECRUITED" ribbon hung 28 px out of the 52 px
 * portrait on both sides and printed straight across the companion's name. The
 * ribbon is not a child of the art any more — it lives in the title block, sits
 * back over the art on a desktop card and becomes the header's third row on a
 * phone — so these tests pin the structure the two layouts are built on rather
 * than the pixels (a jsdom window has no layout).
 */

let container;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  const progress = new ProgressStore();
  const shop = new PetShopUI(container, progress, {});
  shop.show();
  return { shop, progress };
}

/**
 * Every render re-mounts the screen, so the node from `show()` is detached as
 * soon as anything changes — always look the current one up.
 */
function screen() {
  return document.getElementById('pets-screen');
}

beforeEach(() => {
  // ProgressStore persists to localStorage, and every test here mounts a fresh
  // one: without this a purchase in one case would be owned in the next.
  window.localStorage.clear();
  document.body.innerHTML = '';
  document.body.className = '';
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  document.body.innerHTML = '';
  container = null;
});

describe('the Muster Hall state ribbon', () => {
  it('lives in the title block, where a phone can give it a row of its own', () => {
    mount();
    const badge = screen().querySelector('.pets-detail .pet-level-badge');
    expect(badge).toBeTruthy();
    expect(screen().querySelector('.pets-detail-title .pet-level-badge')).toBe(badge);
    // The old markup put it inside the portrait span, which is what made it
    // hang out of a 52 px box.
    expect(screen().querySelector('.pet-hero-portrait .pet-level-badge')).toBeNull();
  });

  it('tells the stylesheet where the art column is, so the ribbon can sit on it', () => {
    mount();
    const head = screen().querySelector('.pets-detail-head');
    const portrait = screen().querySelector('.pets-detail .pet-hero-portrait');
    const width = head.style.getPropertyValue('--pet-portrait');
    expect(width).toMatch(/^\d+px$/);
    // The same number the portrait itself was drawn at.
    expect(portrait.style.width).toBe(width);
  });

  it('says NOT RECRUITED for a companion nobody has bought yet', () => {
    mount();
    const badge = screen().querySelector('.pets-detail .pet-level-badge');
    expect(badge.textContent.trim()).toBe('NOT RECRUITED');
    expect(badge.getAttribute('aria-hidden')).toBeNull();
  });

  it('switches to the level once the companion is owned', () => {
    const { shop, progress } = mount();
    progress.profile.gold = 999;
    progress.buyPet(PETS[0].id, PETS[0].price);
    shop.render();
    const badge = screen().querySelector('.pets-detail .pet-level-badge');
    expect(badge.textContent.trim()).toBe('LV 1');
    expect(screen().querySelector('.pets-detail-title .pet-level-badge')).toBe(badge);
  });

  it('carries the same ribbon on the Vanguard tab', () => {
    mount();
    screen().querySelector('[data-tab="vanguard"]').click();
    const badge = screen().querySelector('.pets-detail .pet-level-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toMatch(/^(RANK \d+ \/ \d+|NOT RECRUITED)$/);
    expect(screen().querySelector('.pets-detail-title .pet-level-badge')).toBe(badge);
  });

  it('keeps every stat label inside its own box', () => {
    mount();
    const labels = [...screen().querySelectorAll('.pets-detail .pet-stat-label')];
    expect(labels.length).toBeGreaterThan(0);
    // The stylesheet clips these labels; what matters here is that the card
    // still renders one label per stat and none of them is empty.
    for (const label of labels) expect(label.textContent.trim()).not.toBe('');
  });
});
