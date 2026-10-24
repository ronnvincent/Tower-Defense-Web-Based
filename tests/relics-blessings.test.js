// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { RELICS, RELIC_GEM_TOTAL, getRelic } from '../src/data/relics.js';
import {
  buyRelic,
  canBuyRelic,
  nextRelicCost,
  relicBoard,
  relicBonuses,
  relicLevel,
  relicSummary,
} from '../src/systems/Relics.js';
import {
  BLESSINGS,
  blessingBoard,
  blessingBonuses,
  blessingCount,
  canBuyBlessing,
  getBlessing,
} from '../src/systems/Blessings.js';
import { GameStateManager } from '../src/systems/GameStateManager.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { ForgeUI } from '../src/ui/ForgeUI.js';
import { BlessingsUI } from '../src/ui/BlessingsUI.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function mount() {
  document.body.innerHTML = '<div id="screen-container"></div>';
  return document.getElementById('screen-container');
}

describe('Relics: data', () => {
  it('ships unique relics with one cost per level', () => {
    const ids = new Set(RELICS.map((r) => r.id));
    expect(ids.size).toBe(RELICS.length);
    for (const relic of RELICS) {
      expect(relic.costs).toHaveLength(relic.maxLevel);
      expect(relic.costs.every((c) => c > 0)).toBe(true);
      expect(relic.format(1)).not.toContain('NaN');
      expect(relic.format(relic.maxLevel)).not.toContain('NaN');
    }
    expect(RELIC_GEM_TOTAL).toBeGreaterThan(20);
  });

  it('looks up by id', () => {
    expect(getRelic('war-chest')?.name).toBe('War Chest');
    expect(getRelic('nope')).toBeNull();
  });
});

describe('Relics: purchase rules', () => {
  it('clamps a stored level to the relic maximum', () => {
    expect(relicLevel({}, 'war-chest')).toBe(0);
    expect(relicLevel({ 'war-chest': 2 }, 'war-chest')).toBe(2);
    expect(relicLevel({ 'war-chest': 99 }, 'war-chest')).toBe(3);
    expect(relicLevel({ 'war-chest': -4 }, 'war-chest')).toBe(0);
    expect(relicLevel({ nope: 5 }, 'nope')).toBe(0);
  });

  it('prices the next level and stops at the cap', () => {
    expect(nextRelicCost('war-chest', 0)).toBe(3);
    expect(nextRelicCost('war-chest', 2)).toBe(7);
    expect(nextRelicCost('war-chest', 3)).toBeNull();
    expect(nextRelicCost('nope', 0)).toBeNull();
  });

  it('blocks purchases without gems or at max level', () => {
    expect(canBuyRelic('war-chest', {}, 2)).toMatchObject({ ok: false, reason: 'gems', cost: 3 });
    expect(canBuyRelic('war-chest', {}, 3)).toMatchObject({ ok: true, cost: 3 });
    expect(canBuyRelic('war-chest', { 'war-chest': 3 }, 99)).toMatchObject({ ok: false, reason: 'maxed' });
    expect(canBuyRelic('nope', {}, 99).ok).toBe(false);
  });

  it('buys without mutating the input map', () => {
    const owned = { 'war-chest': 1 };
    const result = buyRelic(owned, 'war-chest', 10);
    expect(result).toMatchObject({ id: 'war-chest', level: 2, cost: 5 });
    expect(owned['war-chest']).toBe(1);
    expect(result.relics['war-chest']).toBe(2);
    expect(buyRelic(owned, 'war-chest', 1)).toBeNull();
  });
});

describe('Relics: aggregate bonuses', () => {
  it('is a no-op with an empty collection', () => {
    expect(relicBonuses({})).toEqual({
      startingGold: 0,
      baseHealth: 0,
      damage: 1,
      cooldown: 1,
      killGold: 1,
      sellRefund: 1,
    });
  });

  it('stacks levels additively for flat stats and multiplicatively for factors', () => {
    const bonuses = relicBonuses({ 'war-chest': 2, 'reinforced-core': 1, 'sharpened-blades': 2 });
    expect(bonuses.startingGold).toBe(100);
    expect(bonuses.baseHealth).toBe(5);
    expect(bonuses.damage).toBeCloseTo(1.16);
  });

  it('keeps cooldown inside a sane floor when every level is owned', () => {
    const all = Object.fromEntries(RELICS.map((r) => [r.id, r.maxLevel]));
    const bonuses = relicBonuses(all);
    expect(bonuses.cooldown).toBeGreaterThan(0.5);
    expect(bonuses.killGold).toBeGreaterThan(1);
    expect(bonuses.sellRefund).toBeGreaterThan(1);
  });

  it('ignores unknown relic ids', () => {
    expect(relicBonuses({ 'not-a-relic': 3 }).damage).toBe(1);
  });

  it('builds a board and a summary', () => {
    const board = relicBoard({ 'war-chest': 1 }, 4);
    const war = board.find((r) => r.id === 'war-chest');
    expect(war.level).toBe(1);
    expect(war.cost).toBe(5);
    expect(war.affordable).toBe(false);
    expect(war.current).toContain('+50');
    expect(war.next).toContain('+100');
    expect(relicSummary({ 'war-chest': 2, 'gilded-kills': 1 })).toMatchObject({
      levels: 3,
      owned: 2,
      total: RELICS.length,
    });
  });
});

describe('Blessings', () => {
  it('ships four distinct blessings with per-run caps', () => {
    const ids = new Set(BLESSINGS.map((b) => b.id));
    expect(ids.size).toBe(4);
    for (const blessing of BLESSINGS) {
      expect(blessing.max).toBeGreaterThan(0);
      expect(blessing.cost).toBeGreaterThan(0);
      expect(getBlessing(blessing.id)).toBe(blessing);
    }
  });

  it('clamps purchase counts to the cap', () => {
    expect(blessingCount({}, 'wrath')).toBe(0);
    expect(blessingCount({ wrath: 5 }, 'wrath')).toBe(1);
    expect(blessingCount({ mend: 1 }, 'mend')).toBe(1);
    expect(blessingCount({ nope: 3 }, 'nope')).toBe(0);
  });

  it('refuses when short on gold or sold out', () => {
    expect(canBuyBlessing('wrath', { gold: 10 })).toMatchObject({ ok: false, reason: 'gold' });
    expect(canBuyBlessing('wrath', { gold: 500 })).toMatchObject({ ok: true, cost: 120 });
    expect(canBuyBlessing('wrath', { gold: 500, purchased: { wrath: 1 } })).toMatchObject({
      ok: false,
      reason: 'maxed',
    });
    expect(canBuyBlessing('nope', { gold: 500 }).ok).toBe(false);
  });

  it('multiplies repeat purchases', () => {
    expect(blessingBonuses({})).toEqual({ damage: 1, killGold: 1, cooldown: 1 });
    const bonuses = blessingBonuses({ wrath: 1, haste: 2, plenty: 1 });
    expect(bonuses.damage).toBeCloseTo(1.2);
    expect(bonuses.cooldown).toBeCloseTo(0.92 * 0.92);
    expect(bonuses.killGold).toBeCloseTo(1.15);
  });

  it('marks the board sold out and unaffordable correctly', () => {
    const board = blessingBoard({ gold: 130, purchased: { plenty: 1 } });
    expect(board.find((b) => b.id === 'plenty')).toMatchObject({ remaining: 0, affordable: false });
    expect(board.find((b) => b.id === 'wrath').affordable).toBe(true);
    expect(board.find((b) => b.id === 'mend').affordable).toBe(false); // 150 > 130
  });

  it('heals the core without passing the maximum or reviving a finished match', () => {
    const state = new GameStateManager(20);
    state.damageBase(8);
    expect(state.healBase(5)).toBe(5);
    expect(state.baseHealth).toBe(17);
    expect(state.healBase(99)).toBe(3);
    expect(state.baseHealth).toBe(20);
    state.end('gameover');
    expect(state.healBase(5)).toBe(0);
  });
});

describe('ForgeUI', () => {
  it('renders every relic with prices, and buys one', () => {
    const container = mount();
    const progress = new ProgressStore({ storage: fakeStorage() });
    progress.profile.gems = 10;
    const onPurchase = vi.fn();
    const ui = new ForgeUI(container, progress, { onPurchase });
    ui.show();

    expect(container.querySelectorAll('.relic-card')).toHaveLength(RELICS.length);
    const buy = container.querySelector('[data-relic="war-chest"]');
    expect(buy.disabled).toBe(false);
    buy.click();

    expect(progress.profile.relics['war-chest']).toBe(1);
    expect(progress.gems).toBe(7);
    expect(onPurchase).toHaveBeenCalledWith({ id: 'war-chest', level: 1, cost: 3 });
    // Re-rendered: the next level now costs 5.
    expect(container.querySelector('[data-relic="war-chest"]').textContent).toContain('5');
  });

  it('disables a relic the player cannot afford and shows mastered ones', () => {
    const container = mount();
    const progress = new ProgressStore({ storage: fakeStorage() });
    progress.profile.gems = 0;
    progress.profile.relics = { 'war-chest': 3 };
    const ui = new ForgeUI(container, progress, {});
    ui.show();

    expect(container.querySelector('[data-relic="sharpened-blades"]').disabled).toBe(true);
    expect(container.querySelector('[data-id="war-chest"]').classList.contains('maxed')).toBe(true);
    expect(container.querySelector('[data-id="war-chest"]').textContent).toContain('MASTERED');
  });
});

describe('BlessingsUI', () => {
  it('lists blessings and buys through the provider', () => {
    const container = mount();
    let gold = 300;
    const purchased = {};
    const provider = {
      state: () => ({ gold, purchased }),
      buy: (id) => {
        const def = getBlessing(id);
        if (gold < def.cost) return { ok: false };
        gold -= def.cost;
        purchased[id] = (purchased[id] || 0) + 1;
        return { ok: true };
      },
    };
    const ui = new BlessingsUI(container, provider);
    ui.show();

    expect(container.querySelectorAll('.blessing-card')).toHaveLength(BLESSINGS.length);
    expect(container.textContent).toContain('300');
    container.querySelector('[data-blessing="wrath"]').click();
    expect(gold).toBe(180);
    expect(purchased.wrath).toBe(1);
    expect(container.textContent).toContain('180');
  });

  it('does not open without a live run', () => {
    const container = mount();
    const ui = new BlessingsUI(container, { state: () => null, buy: () => ({ ok: false }) });
    ui.show();
    expect(container.innerHTML).toBe('');
  });
});
