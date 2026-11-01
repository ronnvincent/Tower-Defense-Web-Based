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
 * and lets the tests pin an exact offer. The run seed itself comes from the
 * clock, so two runs never deal the same opening hand.
 *
 * Offers also steer away from the hand they just showed. A pool of twenty-six
 * weighted by rarity would otherwise keep re-dealing the same two commons, and
 * a draft that shows the same cards every wave is not a draft. Cards in the
 * previous offer are demoted, not banned: with a thin endgame pool they can
 * still come back, they just cannot dominate.
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
  /* ------------------------------------------------------------- common ---
     Twelve small, always-useful picks. Commons may be taken more than once;
     `RunMods.applyCard` trims each repeat (see DIMINISH there), so a stack is
     worth having without ever turning one tower into a win button. */
  {
    id: 'whetstones',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'WHETSTONES',
    rarity: 'common',
    blurb: '+10% tower damage',
    effect: { mods: { damage: 1.1 } },
  },
  {
    id: 'drill',
    art: '/assets/ui-kit/glyph_overcharge.png',
    name: 'DRILL SERGEANTS',
    rarity: 'common',
    blurb: '+8% fire rate',
    effect: { mods: { cooldown: 0.92 } },
  },
  {
    id: 'spyglass',
    art: '/assets/ui-kit/glyph_expand.png',
    name: 'SPYGLASSES',
    rarity: 'common',
    blurb: '+8% tower range',
    effect: { mods: { range: 1.08 } },
  },
  {
    id: 'ledger',
    art: '/assets/ui-kit/glyph_medal.png',
    name: 'BOUNTY LEDGER',
    rarity: 'common',
    blurb: '+12% gold per kill',
    effect: { mods: { killGold: 1.12 } },
  },
  {
    id: 'reinforced',
    art: '/assets/ui-kit/glyph_fortify.png',
    name: 'REINFORCED CORE',
    rarity: 'common',
    blurb: '+3 core HP, right now',
    effect: { instant: { hp: 3 } },
  },
  {
    id: 'warchest',
    art: '/assets/ui-kit/glyph_crown.png',
    name: 'WAR CHEST',
    rarity: 'common',
    blurb: '+70 gold, right now',
    effect: { instant: { gold: 70 } },
  },
  {
    id: 'tithe',
    art: '/assets/ui-kit/glyph_scroll.png',
    name: 'THE TITHE',
    rarity: 'common',
    blurb: '+8% score on every kill',
    effect: { mods: { score: 1.08 } },
  },
  {
    id: 'musket',
    art: '/assets/ui-kit/glyph_gear.png',
    name: 'MUSKET BALLS',
    rarity: 'common',
    blurb: '+6% damage, +4% range',
    effect: { mods: { damage: 1.06, range: 1.04 } },
  },
  {
    id: 'rations',
    art: '/assets/ui-kit/glyph_calendar.png',
    name: 'FIELD RATIONS',
    rarity: 'common',
    blurb: '+2 core HP now, +5% kill gold',
    effect: { instant: { hp: 2 }, mods: { killGold: 1.05 } },
  },
  {
    id: 'levy',
    art: '/assets/ui-kit/glyph_anvil.png',
    name: 'THE LEVY',
    rarity: 'common',
    blurb: '+45 gold now, +4% fire rate',
    effect: { instant: { gold: 45 }, mods: { cooldown: 0.96 } },
  },
  {
    id: 'ballast',
    art: '/assets/ui-kit/glyph_expand.png',
    name: 'BALLAST STONES',
    rarity: 'common',
    blurb: '+7% range, +3% score',
    effect: { mods: { range: 1.07, score: 1.03 } },
  },
  {
    id: 'standards',
    art: '/assets/ui-kit/glyph_book.png',
    name: 'THE STANDARDS',
    rarity: 'common',
    blurb: '+6% score, +4% damage',
    effect: { mods: { score: 1.06, damage: 1.04 } },
  },

  /* ----------------------------------------------------------- uncommon ---
     Eight picks with a trade. Every one of them gives something up, which is
     what keeps the offer a decision instead of a power curve. */
  {
    id: 'zeal',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'ZEALOTRY',
    rarity: 'uncommon',
    blurb: '+18% damage, −8% fire rate',
    effect: { mods: { damage: 1.18, cooldown: 1.08 } },
  },
  {
    id: 'deadeye',
    art: '/assets/ui-kit/glyph_meteor.png',
    name: 'DEADEYE',
    rarity: 'uncommon',
    blurb: '+7% critical chance',
    effect: { add: { critChance: 0.07 } },
  },
  {
    id: 'quartermaster',
    art: '/assets/ui-kit/glyph_book.png',
    name: 'QUARTERMASTER',
    rarity: 'uncommon',
    blurb: '+20% kill gold, −5% range',
    effect: { mods: { killGold: 1.2, range: 0.95 } },
  },
  {
    id: 'bulwark',
    art: '/assets/ui-kit/glyph_fortify.png',
    name: 'BULWARK',
    rarity: 'uncommon',
    blurb: '+1 core HP after every wave',
    effect: { add: { healPerWave: 1 } },
  },
  {
    id: 'bloodpact',
    art: '/assets/ui-kit/glyph_meteor.png',
    name: 'BLOOD PACT',
    rarity: 'uncommon',
    blurb: '+22% damage — the horde gets 6% tougher',
    effect: { mods: { damage: 1.22, enemyHealth: 1.06 } },
  },
  {
    id: 'alacrity',
    art: '/assets/ui-kit/glyph_overcharge.png',
    name: 'ALACRITY',
    rarity: 'uncommon',
    blurb: '+14% fire rate, −4% range',
    effect: { mods: { cooldown: 0.86, range: 0.96 } },
  },
  {
    id: 'warhorn',
    art: '/assets/ui-kit/glyph_medal.png',
    name: 'WAR HORN',
    rarity: 'uncommon',
    blurb: '+12% range, +8% score',
    effect: { mods: { range: 1.12, score: 1.08 } },
  },
  {
    id: 'plunder',
    art: '/assets/ui-kit/glyph_anvil.png',
    name: 'PLUNDER',
    rarity: 'uncommon',
    blurb: '+22% kill gold, −6% damage',
    effect: { mods: { killGold: 1.22, damage: 0.94 } },
  },

  /* --------------------------------------------------------------- rare ---
     Six one-shot picks. A rare is never offered again once taken, so each of
     these is a real fork in the run rather than a stack. */
  {
    id: 'titansbane',
    art: '/assets/ui-kit/glyph_swords.png',
    name: 'TITANSBANE',
    rarity: 'rare',
    blurb: '+25% damage',
    effect: { mods: { damage: 1.25 } },
  },
  {
    id: 'goldrush',
    art: '/assets/ui-kit/glyph_meteor.png',
    name: 'GOLD RUSH',
    rarity: 'rare',
    blurb: '+30% kill gold — the horde gets 10% tougher',
    effect: { mods: { killGold: 1.3, enemyHealth: 1.1 } },
  },
  {
    id: 'clockwork',
    art: '/assets/ui-kit/glyph_gear.png',
    name: 'CLOCKWORK',
    rarity: 'rare',
    blurb: '+20% fire rate, −5% damage',
    effect: { mods: { cooldown: 0.8, damage: 0.95 } },
  },
  {
    id: 'banner',
    art: '/assets/ui-kit/glyph_crown.png',
    name: 'WARLORD’S BANNER',
    rarity: 'rare',
    blurb: '+12% damage and +10% range',
    effect: { mods: { damage: 1.12, range: 1.1 } },
  },
  {
    id: 'laststand',
    art: '/assets/ui-kit/glyph_fortify.png',
    name: 'LAST STAND',
    rarity: 'rare',
    blurb: '+2 core HP after every wave',
    effect: { add: { healPerWave: 2 } },
  },
  {
    id: 'overdrive',
    art: '/assets/ui-kit/glyph_overcharge.png',
    name: 'OVERDRIVE',
    rarity: 'rare',
    blurb: '+18% damage, +12% fire rate — horde 12% tougher',
    effect: { mods: { damage: 1.18, cooldown: 0.88, enemyHealth: 1.12 } },
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
export function drawCards(seed, wave, taken = [], count = CARDS_PER_OFFER, recent = []) {
  // Two independent streams: the wave index keeps consecutive offers from being
  // shifts of each other, the seed keeps a run reproducible.
  // The seed and the wave must land in *different* multipliers: with one shared
  // constant, `seed + wave` collisions made wave 3 of run 1 deal exactly wave 2
  // of run 2, which is the "same cards every time" the players reported.
  const random = mulberry32(
    ((Number(seed) || 1) * 2654435761) ^ ((Number(wave) || 0) * 40503) ^ 0x9e3779b9
  );
  const owned = new Set(Array.isArray(taken) ? taken : []);
  const fresh = new Set(Array.isArray(recent) ? recent : []);
  // Rare cards are one-shot picks; commons may stack.
  const pool = DRAFT_CARDS.filter((card) => {
    if (!owned.has(card.id)) return true;
    return card.rarity === 'common';
  }).map((card) => ({
    card,
    // A card shown last wave is a fifth as likely — not impossible, just not
    // the lazy re-deal that made every offer look the same.
    weight: (CARD_RARITY[card.rarity]?.weight || 1) * (fresh.has(card.id) ? 0.2 : 1),
  }));

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
