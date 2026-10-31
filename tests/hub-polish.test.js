// @vitest-environment jsdom
// Request 71 — the hub's second pass.
//
// The review of the Muster Hall grab found four things: region names sinking
// into the terrain, one crowded strip across the top-right, locked banners that
// only looked grey without ever saying *why*, and chrome that read modern
// instead of forged. Each fix has a machine-checkable half:
//
//   * the badge conditions are data (`systems/HubBadges.js`), so they are
//     tested against a real save and can never be lit by a decorative guess;
//   * the lock reason is derived from the stage order, so the menu and the
//     screen reader say the same thing the campaign does;
//   * the type and chrome rules are asserted against the stylesheet, the way
//     the HUD rail tests are, because "bigger" and "browned" are exactly the
//     declarations a later tidy-up deletes by accident.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldMapUI } from '../src/ui/WorldMapUI.js';
import { LANDMARKS } from '../src/data/worldMap.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { DailyStore } from '../src/systems/DailyChallenge.js';
import { hubBadges, hubBadgesForSave } from '../src/systems/HubBadges.js';
import { RELICS } from '../src/data/relics.js';

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** Body of the last `selector {` rule in the stylesheet. */
function lastRuleBody(selector) {
  const needle = `\n${selector} {`;
  const start = CSS.lastIndexOf(needle);
  if (start === -1) return '';
  const end = CSS.indexOf('}', start);
  return CSS.slice(start, end);
}

/** Body of the last rule whose selector list starts with `selector,` or
 *  `selector {` — for rules that share a declaration block with a sibling. */
function lastGroupedBody(selector) {
  const needle = `\n${selector},`;
  const at = CSS.lastIndexOf(needle);
  if (at === -1) return lastRuleBody(selector);
  return CSS.slice(at, CSS.indexOf('}', at));
}

/** The first `selector {` rule that contains `needle` in its body. */
function ruleWith(selector, needle) {
  const head = `\n${selector} {`;
  let at = CSS.indexOf(head);
  while (at !== -1) {
    const end = CSS.indexOf('}', at);
    const body = CSS.slice(at, end);
    if (body.includes(needle)) return body;
    at = CSS.indexOf(head, at + 1);
  }
  return '';
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const store = () => new ProgressStore({ storage: fakeStorage() });

function mount(overrides = {}) {
  const progress = overrides.progress || store();
  const callbacks = {
    onDeploy: vi.fn(),
    onDuel: vi.fn(),
    onWarRoom: vi.fn(),
    onMode: vi.fn(),
    onNavigate: vi.fn(),
    onLibrary: vi.fn(),
    onMenu: vi.fn(),
    onDaily: vi.fn(),
    daily: overrides.daily || new DailyStore({ storage: fakeStorage() }),
    ...overrides.callbacks,
  };
  const ui = new WorldMapUI(document.getElementById('world-map-root'), progress, callbacks);
  ui.stage.getBoundingClientRect = () => ({ width: 1000, height: 600, left: 0, top: 0 });
  return { ui, callbacks, progress };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="world-map-root"></div>';
});

/* ========================================================================== */
/* Badge data                                                                 */
/* ========================================================================== */

describe('hub badges', () => {
  it('lights nothing when nothing is waiting', () => {
    expect(hubBadges()).toEqual({});
    expect(hubBadges({ forgeReady: false, shrineReady: false })).toEqual({});
  });

  it('gives each building one word and one reason, keyed by landmark id', () => {
    const badges = hubBadges({ forgeReady: true, shrineReady: true });
    expect(Object.keys(badges).sort()).toEqual(['forge', 'shrine']);
    for (const [id, badge] of Object.entries(badges)) {
      expect(badge.id).toBe(id);
      expect(badge.text).toMatch(/^[A-Z]{3,6}$/);
      expect(badge.title.length).toBeGreaterThan(8);
    }
    // Both keys must name a real building on the plate, or the pip has nowhere
    // to hang.
    const ids = new Set(LANDMARKS.map((entry) => entry.id));
    for (const id of Object.keys(badges)) expect(ids.has(id)).toBe(true);
  });

  it('reads the forge off the same purse the panel does', () => {
    const progress = store();
    progress.profile.gems = 0;
    expect(hubBadgesForSave({ progress })).not.toHaveProperty('forge');

    // The cheapest relic is what a fresh purse is measured against.
    const cheapest = Math.min(...RELICS.map((relic) => relic.costs?.[0] ?? relic.cost ?? 0));
    progress.profile.gems = Math.max(cheapest, 1) * 2;
    expect(hubBadgesForSave({ progress })).toHaveProperty('forge');
  });

  it('drops the forge badge once every relic is maxed', () => {
    const progress = store();
    progress.profile.gems = 99999;
    progress.profile.relics = Object.fromEntries(
      RELICS.map((relic) => [relic.id, relic.maxLevel])
    );
    expect(hubBadgesForSave({ progress })).not.toHaveProperty('forge');
  });

  it("drops the shrine badge the moment today's rule is banked", () => {
    const progress = store();
    const daily = new DailyStore({ storage: fakeStorage() });
    expect(hubBadgesForSave({ progress, daily })).toHaveProperty('shrine');

    const run = daily.todayKey();
    daily.state.played[run] = { won: true, score: 1 };
    expect(hubBadgesForSave({ progress, daily })).not.toHaveProperty('shrine');
  });

  it('asks no questions of an absent save', () => {
    expect(hubBadgesForSave()).toEqual({});
    expect(hubBadgesForSave({ progress: null, daily: null })).toEqual({});
  });
});

/* ========================================================================== */
/* The screen                                                                 */
/* ========================================================================== */

describe('WorldMapUI · request 71', () => {
  it('hangs a badge slot on every building and fills only the live ones', () => {
    const { ui } = mount();
    ui.show();
    const pips = [...document.querySelectorAll('[data-wm-pip]')];
    expect(pips).toHaveLength(LANDMARKS.length);

    // Today's rule is unplayed on a fresh save, so the shrine is the one
    // building that has news — and a pip with nothing behind it stays shut.
    const lit = pips.filter((pip) => !pip.hidden);
    expect(lit).toHaveLength(1);
    expect(lit[0].closest('[data-wm-id]').dataset.wmId).toBe('shrine');
    expect(lit[0].textContent).toBe('TODAY');
    expect(lit[0].title).toMatch(/today/i);
    ui.hide();
  });

  it('lights the forge pip from the purse, not from a timer', () => {
    const progress = store();
    progress.profile.gems = 500;
    const { ui } = mount({ progress });
    ui.show();
    const forge = document.querySelector('[data-wm-id="forge"] [data-wm-pip]');
    expect(forge.hidden).toBe(false);
    expect(forge.textContent).toBe('READY');

    // Spending the purse puts it out again on the next refresh — no reload.
    progress.profile.gems = 0;
    ui.refresh();
    expect(forge.hidden).toBe(true);
    expect(forge.textContent).toBe('');
    ui.hide();
  });

  it('seals every locked banner and leaves open roads unsealed', () => {
    const { ui } = mount();
    ui.show();
    // Every building carries the seal node; the stylesheet only paints it on
    // `[data-state='locked']`, so the state attribute is the contract.
    const locks = [...document.querySelectorAll('.wm-landmark-lock')];
    expect(locks).toHaveLength(LANDMARKS.length);

    const sealed = locks
      .map((lock) => lock.closest('[data-wm-id]'))
      .filter((node) => node.dataset.state === 'locked')
      .map((node) => node.dataset.wmId);
    expect(sealed.length).toBe(5);
    // The one that opens the campaign is not one of them.
    expect(sealed).not.toContain('banner-verdant');
    ui.hide();
  });

  it('still spells LOCKED next to the seal, and says which road opens it', () => {
    const { ui } = mount();
    ui.show();
    const frost = document.querySelector('[data-wm-id="banner-frostbite"]');
    expect(frost.dataset.state).toBe('locked');
    expect(frost.querySelector('[data-wm-state]').textContent).toBe('LOCKED');
    expect(frost.querySelector('.wm-landmark-lock')).not.toBeNull();
    // Frostbite is stage III: stage II is what opens it, in the game's words.
    expect(frost.getAttribute('aria-label')).toContain('locked');
    expect(frost.getAttribute('aria-label')).toContain('Sunscorch Mesa');
    ui.hide();
  });

  it('explains a shut road in the bubble as well as in the name', () => {
    const { ui } = mount();
    ui.show();
    ui.showTip('banner-frostbite', null);
    const tip = document.querySelector('.wm-tip').textContent.replace(/\s+/g, ' ').trim();
    expect(tip).toContain('LOCKED');
    expect(tip).toContain('clear Sunscorch Mesa first');
    ui.hideTip();
    ui.hide();
  });

  it("puts a badge's news in the button name, not only on its plate", () => {
    const progress = store();
    progress.profile.gems = 500;
    const { ui } = mount({ progress });
    ui.show();
    const forge = document.querySelector('[data-wm-id="forge"]');
    expect(forge.getAttribute('aria-label')).toContain('A relic upgrade you can afford');
    ui.hide();
  });

  it('does not call an open road locked', () => {
    const { ui } = mount();
    ui.show();
    const verdant = document.querySelector('[data-wm-id="banner-verdant"]');
    expect(verdant.dataset.state).not.toBe('locked');
    expect(verdant.getAttribute('aria-label')).not.toMatch(/locked/i);
    ui.hide();
  });

  it('keeps one plate rank: the castle sits above the buildings it names', () => {
    const { ui } = mount();
    ui.show();
    const castle = document.querySelector('.wm-landmark--castle');
    expect(castle).not.toBeNull();
    expect(castle.querySelector('.wm-landmark-tag').textContent).toBe('THE BASTION');
    // The other landmarks never borrow the castle's kind class.
    const impostors = [...document.querySelectorAll('.wm-landmark--castle')];
    expect(impostors).toHaveLength(1);
    ui.hide();
  });
});

/* ========================================================================== */
/* The sheet                                                                  */
/* ========================================================================== */

describe('hub stylesheet · request 71', () => {
  it('lifts the region names out of the painting without boxing them in', () => {
    // Brightness lives in its own small rule after the first pass.
    expect(CSS).toMatch(/\.wm-region-label\s*{\s*opacity:\s*0\.94/);
    const body = ruleWith('.wm-region-label', 'color-mix(');
    // Still dyed in the region's own colour, lifted toward white so it clears
    // snow, sand and the snowfield's ice.
    expect(body).toMatch(/color:\s*color-mix\(in srgb, var\(--wm-tint/);
    // A soft painted smudge, never a plate: a radial gradient, no border.
    expect(body).toMatch(/radial-gradient/);
    expect(body).not.toMatch(/border:/);
    expect(body).toMatch(/text-shadow/);
  });

  it('sets THE BASTION a rank above the other plates', () => {
    const castleTag = lastRuleBody('.wm-landmark--castle .wm-landmark-tag');
    expect(castleTag).toMatch(/font-size:\s*13px/);
    expect(castleTag).toMatch(/border-color:\s*rgba\(245,\s*196,\s*81,\s*0\.62\)/);
    // Finials at both ends, drawn, not typed.
    const finials = lastGroupedBody('.wm-landmark--castle .wm-landmark-tag::before');
    expect(finials).toMatch(/transform:\s*rotate\(45deg\)/);
    // …one at each end, not two stacked on the same side.
    expect(lastRuleBody('.wm-landmark--castle .wm-landmark-tag::before')).toMatch(/left:/);
    expect(lastRuleBody('.wm-landmark--castle .wm-landmark-tag::after')).toMatch(/right:/);
    // A rank, not a bigger box on top of its neighbours.
    expect(lastRuleBody('.wm-landmark--castle')).toMatch(/z-index:\s*2/);
  });

  it('scales the purse icons up and out of the speck size', () => {
    const body = lastRuleBody('.wm-wallet img');
    const size = Number(body.match(/width:\s*(\d+)px/)?.[1] || 0);
    expect(size).toBeGreaterThanOrEqual(21); // 17 px + 25 %
    expect(size).toBeLessThanOrEqual(24); // …without turning into a medallion
    // The lane split: the ledger takes the brand's side, the controls the far
    // edge, and a bronze rule separates the machinery from the data.
    expect(lastRuleBody('.wm-wallets')).toMatch(/margin-right:\s*auto/);
    expect(lastRuleBody('.wm-tools')).toMatch(/border-left:\s*1px solid/);
    expect(lastRuleBody('.wm-brand')).not.toMatch(/margin-right:\s*auto/);
  });

  it('gives the map chrome a forged edge', () => {
    expect(lastRuleBody('.wm-icon::after')).toMatch(/inset:\s*2px/);
    expect(lastRuleBody('.wm-rail::before')).toMatch(/border-right:\s*0/);
    expect(lastRuleBody('.wm-rail::after')).toMatch(/border-left:\s*0/);
    // The fullscreen glyph had no rule at all and rendered as a black fill.
    expect(lastRuleBody('.wm-icon svg')).toMatch(/stroke:\s*#e6d8bb/);
  });

  it('ships a coin whose art fills its canvas', () => {
    // The asset was a 16 px coin inside a 64 px canvas, so every caller that
    // sized the canvas painted a speck. Nothing in CSS can fix that, so the
    // file itself is the contract (`scripts/normalize_icon_padding.py`).
    const png = readFileSync(resolve(process.cwd(), 'public/assets/ui/icon_coin.png'));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(16);
    expect(width).toBeLessThanOrEqual(24);
  });

  it('makes the credits line read as a door', () => {
    const link = lastRuleBody('.wm-link');
    expect(link).toMatch(/border:\s*1px solid/);
    expect(link).toMatch(/font-size:\s*10px/);
    expect(lastRuleBody('.wm-link::after')).toMatch(/rotate\(45deg\)/);
    expect(ruleWith('.wm-hint', 'font-size: 10px')).not.toBe('');
  });
});
