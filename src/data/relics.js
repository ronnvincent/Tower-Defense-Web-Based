/**
 * Relics — permanent upgrades bought with gems, applied to every run.
 *
 * Gems have exactly one sink, and it is power without a difficulty spike: every
 * relic is a small, legible multiplier rather than a new mechanic. Costs climb
 * inside a relic (buy level 1 before level 2), so a new player can afford
 * something after their first two or three campaign wins.
 *
 * The effects are read once at run start (`relicBonuses`) and the scene folds
 * them into starting gold, core HP, tower damage/cooldown and payouts.
 */

export const RELICS = [
  {
    id: 'war-chest',
    name: 'War Chest',
    icon: '🪙',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui/icon_coin.png',
    desc: 'Start every battle with more gold.',
    maxLevel: 3,
    costs: [3, 5, 7],
    effect: { startingGold: 50 },
    unit: 'gold',
    format: (level) => `+${level * 50} starting gold`,
  },
  {
    id: 'reinforced-core',
    name: 'Reinforced Core',
    icon: '🛡️',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui-kit/glyph_fortify.png',
    desc: 'The realm core holds more damage.',
    maxLevel: 2,
    costs: [4, 6],
    effect: { baseHealth: 5 },
    unit: 'HP',
    format: (level) => `+${level * 5} core HP`,
  },
  {
    id: 'sharpened-blades',
    name: 'Sharpened Blades',
    icon: '⚔️',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui-kit/glyph_swords.png',
    desc: 'Every defence deals more damage.',
    maxLevel: 3,
    costs: [4, 6, 9],
    effect: { towerDamage: 0.08 },
    unit: 'damage',
    format: (level) => `+${Math.round(level * 8)}% tower damage`,
  },
  {
    id: 'swift-hands',
    name: 'Swift Hands',
    icon: '⏱️',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui-kit/glyph_gear.png',
    desc: 'Every defence fires faster.',
    maxLevel: 2,
    costs: [5, 8],
    effect: { towerCooldown: 0.06 },
    unit: 'rate',
    format: (level) => `-${Math.round(level * 6)}% tower cooldown`,
  },
  {
    id: 'gilded-kills',
    name: 'Gilded Kills',
    icon: '💰',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui-kit/glyph_gem.png',
    desc: 'Every defeated enemy pays more gold.',
    maxLevel: 2,
    costs: [3, 5],
    effect: { killGold: 0.1 },
    unit: 'gold',
    format: (level) => `+${Math.round(level * 10)}% kill gold`,
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    icon: '♻️',
    // Kit art first: an emoji is a font dependency, and a missing glyph
    // renders as an empty box on half the platforms we ship to.
    art: '/assets/ui-kit/glyph_overcharge.png',
    desc: 'Selling a defence returns more gold.',
    maxLevel: 2,
    costs: [3, 5],
    effect: { sellRefund: 0.08 },
    unit: 'refund',
    format: (level) => `+${Math.round(level * 8)}% sell refund`,
  },
];

export function getRelic(id) {
  return RELICS.find((relic) => relic.id === id) || null;
}

/** Gem total for a fully upgraded collection — used by the forge header. */
export const RELIC_GEM_TOTAL = RELICS.reduce(
  (sum, relic) => sum + relic.costs.reduce((a, b) => a + b, 0),
  0
);
