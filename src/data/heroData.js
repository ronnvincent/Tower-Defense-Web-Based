/**
 * heroData.js — the Vanguard's three ranks and the skills they unlock.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The Vanguard was one fixed stat line and one button. It walked only where it
 * was told, so a player who did not want to micromanage simply never used it —
 * and a hero nobody uses is a hole in the HUD. The design answers that in three
 * moves, all of them here in data:
 *
 *   • **Rank.** Three tiers, each with its own sheet, health, damage, swing rate
 *     and skill list. Rank 1 is the old stat line unchanged, so every number the
 *     balance pass already tuned still means the same thing.
 *   • **Skills.** Shieldbreaker (area), War Cry (a shout that slows everything
 *     around it) and Bulwark (self-heal plus a window of damage reduction). Each
 *     one declares the condition under which the Vanguard will cast it *by
 *     itself*, which is what makes the unit useful without input.
 *   • **Autopilot.** `HERO_AUTO` is the leash: how far from its post the hero
 *     will look for work, how far it may chase, and how often it re-decides.
 *
 * Rank costs are gold, but they are banked gold, spent at the Muster Hall
 * between battles — the same wallet the companions use. Promoting is therefore
 * a decision about which battle you want to bring a stronger Vanguard to, not
 * something you can do halfway through a wave.
 */

/**
 * One entry per rank. `strike` is the Shieldbreaker numbers for that rank; the
 * skills list is what the HUD shows and what autopilot is allowed to cast.
 */
export const HERO_TIERS = Object.freeze([
  Object.freeze({
    id: 'vanguard',
    name: 'Vanguard',
    title: 'TIER 1 · VANGUARD',
    texture: 'hero-vanguard',
    height: 86, // world pixels, feet on the ground (unitArt.unitMetrics)
    maxHealth: 500,
    speed: 110,
    range: 30,
    damage: 30,
    intervalMs: 1000,
    contactDps: 18,
    contactRange: 34,
    aura: 0x8fd0ff,
    strike: Object.freeze({ damage: 100, radius: 75, cooldownMs: 12000, type: 'physical' }),
    skills: Object.freeze(['strike']),
    promoteCost: 0,
  }),
  Object.freeze({
    id: 'captain',
    name: 'Captain',
    title: 'TIER 2 · CAPTAIN',
    texture: 'hero-captain',
    height: 92,
    maxHealth: 640,
    speed: 116,
    range: 34,
    damage: 38,
    intervalMs: 900,
    contactDps: 18,
    contactRange: 36,
    aura: 0xffd76a,
    strike: Object.freeze({ damage: 130, radius: 88, cooldownMs: 10500, type: 'physical' }),
    skills: Object.freeze(['strike', 'warcry']),
    promoteCost: 160,
  }),
  Object.freeze({
    id: 'warlord',
    name: 'Warlord',
    title: 'TIER 3 · WARLORD',
    texture: 'hero-warlord',
    height: 98,
    maxHealth: 820,
    speed: 122,
    range: 38,
    damage: 48,
    intervalMs: 820,
    contactDps: 18,
    contactRange: 38,
    aura: 0xff7b6a,
    strike: Object.freeze({ damage: 170, radius: 104, cooldownMs: 9500, type: 'physical' }),
    skills: Object.freeze(['strike', 'warcry', 'bulwark']),
    promoteCost: 300,
  }),
]);

/**
 * The autopilot's leash. Tuned so the Vanguard covers the bastion mouth and the
 * last stretch of lane without wandering into the enemy half, where it would be
 * surrounded by a wave it cannot outrun.
 */
export const HERO_AUTO = Object.freeze({
  /** How far from its post the hero will look for a target, in px. */
  aggro: 300,
  /** Hard limit on how far it may stray from the post, in px. */
  leash: 360,
  /** Re-decide this often; a decision costs one pass over the enemy list. */
  retargetMs: 220,
  /** Stand this far inside its reach so a creep walking away is still hit. */
  standoff: 0.62,
  /** A manual move order suspends autopilot for this long. */
  manualHoldMs: 6000,
});

/**
 * Skill definitions.
 *
 * `auto` is the trigger autopilot uses; `null` means "manual only". The numbers
 * are per-skill (not per-rank) so the HUD, the tests and the entity read one
 * table; the *rank* decides which of them are unlocked and how hard
 * Shieldbreaker hits.
 */
export const HERO_SKILLS = Object.freeze({
  strike: Object.freeze({
    id: 'strike',
    name: 'Shieldbreaker',
    label: 'STRIKE',
    glyph: 'glyph_swords',
    auto: Object.freeze({ minTargets: 2 }),
  }),
  warcry: Object.freeze({
    id: 'warcry',
    name: 'War Cry',
    label: 'WAR CRY',
    glyph: 'glyph_frost',
    cooldownMs: 15000,
    radius: 190,
    slow: 0.35,
    slowMs: 4000,
    auto: Object.freeze({ minTargets: 2 }),
  }),
  bulwark: Object.freeze({
    id: 'bulwark',
    name: 'Bulwark',
    label: 'BULWARK',
    glyph: 'glyph_fortify',
    cooldownMs: 20000,
    healRatio: 0.35,
    durationMs: 4500,
    guard: 0.5,
    auto: Object.freeze({ healthRatio: 0.35 }),
  }),
});

/** The rank a hero of `tier` (1-based) fights at. Clamped, never undefined. */
export function heroTier(tier = 1) {
  const index = Math.max(0, Math.min(HERO_TIERS.length - 1, Math.round(tier) - 1));
  return HERO_TIERS[index];
}

/** The next rank up, or null at the top. */
export function nextHeroTier(tier = 1) {
  const index = Math.max(0, Math.round(tier) - 1);
  return HERO_TIERS[index + 1] || null;
}

/** How many ranks exist — the HUD draws pips from this. */
export const HERO_TIER_COUNT = HERO_TIERS.length;
