/**
 * draftCards.js — the Rogue Siege card pool and how an offer is drawn.
 *
 * Three cards are offered after every cleared wave, and the player keeps one
 * for the rest of the run. The pool is deliberately small and legible: every
 * card bends a number the player can already see (damage, fire rate, range,
 * gold, core HP), so a pick reads as a plan rather than a spreadsheet.
 *
 * Offers are **seeded**, never random: the same run seed and wave number draw
 * the same three cards on any device, which keeps a challenge run replayable
 * and lets the tests pin an exact offer.
 */

import { mulberry32 } from '../systems/DailyChallenge.js';

export const CARD_RARITY = Object.freeze({
  common: { id: 'common', label: 'COMMON', weight: 6, accent: '#9fb3c8' },
  uncommon: { id: 'uncommon', label: 'UNCOMMON', weight: 3, accent: '#7fd7ff' },
  rare: { id: 'rare', label: 'RARE', weight: 1, accent: '#ffd166' },
});

/**
 * The pool. `effect` is exactly what `RunMods.applyEffect` folds in:
 *   mods  multiply the run bag
 *   add   add to the run bag (crit chance, per-wave healing)
 *   flags turn a rule off for the rest of the run
 *   instant pays out immediately (gold / core HP) and is not part of the bag
 */
export const DRAFT_CARDS = Object.freeze([
  {
    id: 'whetstones',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'WHETSTONES',
    icon: '⚔',
    rarity: 'common',
    blurb: '+12% tower damage',
    effect: { mods: { damage: 1.12 } },
  },
  {
    id: 'drill',
    art: '/assets/ui-kit/glyph_overcharge.png',
    name: 'DRILL SERGEANTS',
    icon: '⏱',
    rarity: 'common',
    blurb: '+10% fire rate',
    effect: { mods: { cooldown: 0.9 } },
  },
  {
    id: 'spyglass',
    art: '/assets/ui-kit/glyph_expand.png',
    name: 'SPYGLASSES',
    icon: '🔭',
    rarity: 'common',
    blurb: '+10% tower range',
    effect: { mods: { range: 1.1 } },
  },
  {
    id: 'ledger',
    art: '/assets/ui-kit/glyph_medal.png',
    name: 'BOUNTY LEDGER',
    icon: '🪙',
    rarity: 'common',
    blurb: '+15% gold per kill',
    effect: { mods: { killGold: 1.15 } },
  },
  {
    id: 'reinforced',
    art: '/assets/ui-kit/glyph_fortify.png',
    name: 'REINFORCED CORE',
    icon: '🛡',
    rarity: 'common',
    blurb: '+4 core HP, right now',
    effect: { instant: { hp: 4 } },
  },
  {
    id: 'warchest',
    art: '/assets/ui-kit/glyph_crown.png',
    name: 'WAR CHEST',
    icon: '💰',
    rarity: 'common',
    blurb: '+80 gold, right now',
    effect: { instant: { gold: 80 } },
  },
  {
    id: 'zeal',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'ZEALOTRY',
    icon: '🔥',
    rarity: 'uncommon',
    blurb: '+20% damage, −8% fire rate',
    effect: { mods: { damage: 1.2, cooldown: 1.08 } },
  },
  {
    id: 'deadeye',
    art: '/assets/ui-kit/glyph_meteor.png',
    name: 'DEADEYE',
    icon: '🎯',
    rarity: 'uncommon',
    blurb: '+8% critical chance',
    effect: { add: { critChance: 0.08 } },
  },
  {
    id: 'quartermaster',
    art: '/assets/ui-kit/glyph_book.png',
    name: 'QUARTERMASTER',
    icon: '📦',
    rarity: 'uncommon',
    blurb: '+25% kill gold, −5% range',
    effect: { mods: { killGold: 1.25, range: 0.95 } },
  },
  {
    id: 'bulwark',
    art: '/assets/ui-kit/glyph_fortify.png',
    name: 'BULWARK',
    icon: '🩹',
    rarity: 'uncommon',
    blurb: '+1 core HP after every wave',
    effect: { add: { healPerWave: 1 } },
  },
  {
    id: 'titansbane',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'TITANSBANE',
    icon: '💥',
    rarity: 'rare',
    blurb: '+30% damage',
    effect: { mods: { damage: 1.3 } },
  },
  {
    id: 'goldrush',
    art: '/assets/ui-kit/glyph_meteor.png',
    name: 'GOLD RUSH',
    icon: '🤑',
    rarity: 'rare',
    blurb: '+35% kill gold — the horde gets 10% tougher',
    effect: { mods: { killGold: 1.35, enemyHealth: 1.1 } },
  },
  {
    id: 'clockwork',
    art: '/assets/ui-kit/glyph_overcharge.png',
    name: 'CLOCKWORK',
    icon: '⚙',
    rarity: 'rare',
    blurb: '+22% fire rate, −5% damage',
    effect: { mods: { cooldown: 0.78, damage: 0.95 } },
  },
  {
    id: 'banner',
    art: '/assets/ui-kit/glyph_crown.png',
    name: 'WARLORD’S BANNER',
    icon: '🏴',
    rarity: 'rare',
    blurb: '+15% damage and +12% range',
    effect: { mods: { damage: 1.15, range: 1.12 } },
  },
]);

/** Cards per offer. */
export const CARDS_PER_OFFER = 3;

const byId = new Map(DRAFT_CARDS.map((card) => [card.id, card]));

export function getCard(id) {
  return byId.get(id) || null;
}

/**
 * Weighted draw without replacement.
 *
 * `mulberry32` is shared with the Daily Challenge, so a seed means the same
 * thing everywhere in the game.
 *
 * @param {number} seed   run seed (stable for the whole run)
 * @param {number} wave   wave the offer follows
 * @param {string[]} [taken] card ids already owned (never offered twice)
 */
export function drawCards(seed, wave, taken = [], count = CARDS_PER_OFFER) {
  const random = mulberry32((Number(seed) || 1) * 2654435761 + (Number(wave) || 0) * 97);
  const owned = new Set(Array.isArray(taken) ? taken : []);
  // Rare cards are one-shot picks; commons may stack.
  const pool = DRAFT_CARDS.filter((card) => {
    if (!owned.has(card.id)) return true;
    return card.rarity === 'common';
  }).map((card) => ({ card, weight: CARD_RARITY[card.rarity]?.weight || 1 }));

  const picked = [];
  const want = Math.max(0, Math.min(count, pool.length));
  while (picked.length < want && pool.length) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index].card);
    pool.splice(index, 1);
  }
  return picked;
}
