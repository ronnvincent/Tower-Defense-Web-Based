/**
 * heroData.js — the five Vanguards, their ranks and their skills.
 *
 * WHAT THIS IS
 * ------------
 * The player used to field exactly one hero: the Vanguard, with three ranks of
 * the same knight. That is a stat line, not a roster — every battle looked the
 * same at the gate, and no purchase changed *how* the gate was held.
 *
 * There are now five heroes. Each one is a different answer to the same
 * question ("who stands in front of the keep?"), and each answer is visible
 * from the board, not only from a menu:
 *
 *   • **Vanguard** — sword and board, the balance point. Burst, shout, brace.
 *   • **Halberdier** — a spear at arm's length: the widest sweep in the game.
 *   • **Ranger** — the only ranged hero; arrows travel, and it stands back.
 *   • **Warden** — gold plate, the wall: the most health, the slowest swing.
 *   • **Cinder** — violet plate and a burning blade: everything it touches burns.
 *
 * Each hero has **three ranks**. A rank raises health, damage and reach, speeds
 * the swing up slightly and unlocks one more skill, so a hero you have invested
 * in is a different unit from a fresh one. Rank costs are banked gold spent at
 * the Muster Hall between battles.
 *
 * WHY THE SKILL TABLE IS GLOBAL
 * -----------------------------
 * Skill *numbers* live once in `HERO_SKILLS`; the rank supplies a `power`
 * multiplier (×1, ×1.25, ×1.55) applied to damage and healing, and a cooldown
 * factor. That keeps one table to balance instead of fifteen, while still
 * making a rank-3 Ranger hit harder than a rank-1 one.
 *
 * Every skill declares an `auto` trigger, which is what lets the hero be useful
 * to a player who never gives it an order: `{ minTargets }` for area skills and
 * `{ healthRatio }` for the self-heal.
 */

/**
 * One entry per skill. `radius` is in world pixels, `damage` is per target per
 * cast, `power` scaling happens in `heroRank()`.
 *
 * `kind` is what the entity does with it:
 *   'burst' — damage every ground creep inside radius, once each
 *   'volley'— damage the nearest `targets` creeps inside radius, once each
 *   'slow'  — apply the enemy slow channel inside radius
 *   'burn'  — put a damage-over-time on every creep inside radius
 *   'self'  — heal the hero and open a damage-reduction window
 */
export const HERO_SKILLS = Object.freeze({
  strike: Object.freeze({
    id: 'strike',
    name: 'Shieldbreaker',
    label: 'STRIKE',
    kind: 'burst',
    glyph: '/assets/ui-kit/glyph_swords.png',
    text: 'Slams the ground: every ground creep inside the ring takes a heavy hit.',
    radius: 75,
    damage: 100,
    cooldownMs: 12000,
    type: 'physical',
    auto: Object.freeze({ minTargets: 2 }),
  }),
  cleave: Object.freeze({
    id: 'cleave',
    name: 'Wide Cleave',
    label: 'CLEAVE',
    kind: 'burst',
    glyph: '/assets/ui-kit/glyph_swords.png',
    text: 'A full circle of steel — the largest ring any hero carries.',
    radius: 108,
    damage: 74,
    cooldownMs: 9000,
    type: 'physical',
    auto: Object.freeze({ minTargets: 3 }),
  }),
  volley: Object.freeze({
    id: 'volley',
    name: 'Volley',
    label: 'VOLLEY',
    kind: 'volley',
    glyph: '/assets/projectiles/proj-arrow.png',
    text: 'Looses a flight of arrows at the closest creeps — no need to close in.',
    radius: 240,
    damage: 52,
    targets: 4,
    cooldownMs: 8500,
    type: 'physical',
    auto: Object.freeze({ minTargets: 2 }),
  }),
  snare: Object.freeze({
    id: 'snare',
    name: 'Snare',
    label: 'SNARE',
    kind: 'slow',
    glyph: '/assets/ui-kit/glyph_frost.png',
    text: 'Pins the horde in place for a beat and chills everything in the ring.',
    radius: 170,
    damage: 24,
    slow: 0.55,
    slowMs: 3200,
    cooldownMs: 14000,
    type: 'physical',
    auto: Object.freeze({ minTargets: 2 }),
  }),
  ember: Object.freeze({
    id: 'ember',
    name: 'Emberbrand',
    label: 'EMBER',
    kind: 'burn',
    glyph: '/assets/ui-kit/glyph_flame.png',
    text: 'Sets the ring alight; the fire keeps burning after the cast.',
    radius: 120,
    damage: 26,
    dot: Object.freeze({ damage: 14, tickMs: 600, durationMs: 4200 }),
    cooldownMs: 12000,
    type: 'fire',
    auto: Object.freeze({ minTargets: 2 }),
  }),
  warcry: Object.freeze({
    id: 'warcry',
    name: 'War Cry',
    label: 'WAR CRY',
    kind: 'slow',
    glyph: '/assets/ui-kit/glyph_frost.png',
    text: 'A shout that staggers everything around the hero.',
    radius: 190,
    slow: 0.35,
    slowMs: 4000,
    cooldownMs: 15000,
    auto: Object.freeze({ minTargets: 2 }),
  }),
  bulwark: Object.freeze({
    id: 'bulwark',
    name: 'Bulwark',
    label: 'BULWARK',
    kind: 'self',
    glyph: '/assets/ui-kit/glyph_fortify.png',
    text: 'Braces: heals a third of its wounds and halves incoming damage for a beat.',
    cooldownMs: 20000,
    healRatio: 0.35,
    durationMs: 4500,
    guard: 0.5,
    auto: Object.freeze({ healthRatio: 0.35 }),
  }),
});

/** Every skill id the entity knows how to cast. */
export const HERO_SKILL_IDS = Object.freeze(Object.keys(HERO_SKILLS));

/** Damage/heal multiplier and cooldown factor per rank (index 0 = rank 1). */
export const RANK_POWER = Object.freeze([1, 1.25, 1.55]);
export const RANK_HASTE = Object.freeze([1, 0.93, 0.86]);

/**
 * The five heroes.
 *
 * `ranks` is generated from `base` by `makeRanks` so the arithmetic is in one
 * place; every generated tier is frozen, so a UI cannot scribble on the config.
 * `skills` is the unlock order: rank 1 gets the first, rank 2 the second, rank 3
 * the third.
 */
const CLASS_DEFS = [
  {
    id: 'vanguard',
    name: 'Vanguard',
    role: 'SWORD & BOARD',
    title: 'KNIGHT OF THE GATE',
    texture: 'hero-vanguard',
    attack: 'melee',
    aura: 0x8fd0ff,
    price: 0,
    blurb: 'The old reliable. Hits hard enough, stands long enough, and never needs an order.',
    base: {
      maxHealth: 500,
      speed: 110,
      range: 30,
      damage: 30,
      intervalMs: 1000,
      contactDps: 18,
      contactRange: 34,
      height: 86,
    },
    skills: ['strike', 'warcry', 'bulwark'],
    costs: [0, 160, 300],
  },
  {
    id: 'halberdier',
    name: 'Halberdier',
    role: 'REACH',
    title: 'SPEAR OF THE LINE',
    texture: 'hero-halberd',
    attack: 'melee',
    aura: 0x9dffd0,
    price: 220,
    blurb: 'A spear keeps the horde at arm\'s length, and a wide cleave clears the mouth of the lane.',
    base: {
      maxHealth: 460,
      speed: 118,
      range: 48,
      damage: 26,
      intervalMs: 850,
      contactDps: 14,
      contactRange: 56,
      height: 88,
    },
    skills: ['cleave', 'snare', 'strike'],
    costs: [0, 190, 360],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    role: 'RANGED',
    title: 'BOW OF THE BASTION',
    texture: 'hero-ranger',
    attack: 'ranged',
    aura: 0xffd76a,
    price: 320,
    blurb: 'The only hero that shoots. Low health, long reach — it thins the lane before it arrives.',
    base: {
      maxHealth: 360,
      speed: 116,
      range: 190,
      damage: 22,
      intervalMs: 900,
      contactDps: 10,
      contactRange: 30,
      height: 84,
    },
    skills: ['volley', 'snare', 'ember'],
    costs: [0, 220, 400],
  },
  {
    id: 'warden',
    name: 'Warden',
    role: 'WALL',
    title: 'GOLD OF THE KEEP',
    texture: 'hero-warden',
    attack: 'melee',
    aura: 0xffe27a,
    price: 420,
    blurb: 'The most health any hero brings. Slow to swing, but the gate does not move while it stands.',
    base: {
      maxHealth: 720,
      speed: 104,
      range: 34,
      damage: 36,
      intervalMs: 1080,
      contactDps: 22,
      contactRange: 38,
      height: 92,
    },
    skills: ['bulwark', 'warcry', 'cleave'],
    costs: [0, 240, 430],
  },
  {
    id: 'cinder',
    name: 'Cinder',
    role: 'FIRE',
    title: 'VIOLET OF THE FORGE',
    texture: 'hero-cinder',
    attack: 'melee',
    aura: 0xc9a6ff,
    price: 560,
    blurb: 'A burning blade: every cast leaves fire on the ground, and fire does not wait for the next wave.',
    base: {
      maxHealth: 560,
      speed: 114,
      range: 36,
      damage: 32,
      intervalMs: 940,
      contactDps: 16,
      contactRange: 36,
      height: 90,
    },
    skills: ['ember', 'strike', 'bulwark'],
    costs: [0, 260, 470],
  },
];

/** Build the three frozen ranks of one hero from its base stat line. */
function makeRanks(def) {
  return Object.freeze(
    [0, 1, 2].map((index) => {
      const power = RANK_POWER[index];
      const haste = RANK_HASTE[index];
      const base = def.base;
      const skills = def.skills.slice(0, index + 1);
      const strikeBase = HERO_SKILLS.strike;
      return Object.freeze({
        id: `${def.id}-${index + 1}`,
        classId: def.id,
        name: def.name,
        role: def.role,
        title: `RANK ${index + 1} · ${def.name.toUpperCase()}`,
        rank: index + 1,
        texture: def.texture,
        attack: def.attack,
        height: base.height + index * 2,
        maxHealth: Math.round(base.maxHealth * (1 + 0.35 * index)),
        speed: Math.round(base.speed * (1 + 0.03 * index)),
        range: Math.round(base.range * (1 + 0.06 * index)),
        damage: Math.round(base.damage * power),
        intervalMs: Math.round(base.intervalMs * haste),
        contactDps: base.contactDps + index * 2,
        contactRange: base.contactRange,
        aura: def.aura,
        power,
        haste,
        // Shieldbreaker's numbers for this rank. Kept on the tier because the
        // balance pass, the shop and the tests all quote it by name.
        strike: Object.freeze({
          damage: Math.round(strikeBase.damage * power),
          radius: strikeBase.radius,
          cooldownMs: Math.round(strikeBase.cooldownMs * haste),
          type: strikeBase.type,
        }),
        skills: Object.freeze(skills),
        promoteCost: def.costs[index] || 0,
      });
    })
  );
}

export const HERO_CLASSES = Object.freeze(
  CLASS_DEFS.map((def) =>
    Object.freeze({
      id: def.id,
      name: def.name,
      role: def.role,
      title: def.title,
      texture: def.texture,
      attack: def.attack,
      aura: def.aura,
      price: def.price,
      blurb: def.blurb,
      skills: Object.freeze([...def.skills]),
      ranks: makeRanks(def),
    })
  )
);

export const HERO_CLASS_IDS = Object.freeze(HERO_CLASSES.map((entry) => entry.id));
export const HERO_RANK_COUNT = 3;
/** The hero every profile starts with. */
export const DEFAULT_HERO = 'vanguard';

/** The class definition for `id`; unknown ids fall back to the Vanguard. */
export function heroClass(id = DEFAULT_HERO) {
  return HERO_CLASSES.find((entry) => entry.id === id) || HERO_CLASSES[0];
}

/** Which rank of `classId` fights at `rank` (1-based, clamped). */
export function heroRank(classId = DEFAULT_HERO, rank = 1) {
  const klass = heroClass(classId);
  const index = Math.max(0, Math.min(klass.ranks.length - 1, Math.round(rank) - 1));
  return klass.ranks[index];
}

/** The next rank of the same hero, or null at the top. */
export function nextHeroRank(classId = DEFAULT_HERO, rank = 1) {
  const klass = heroClass(classId);
  const index = Math.round(rank) - 1;
  return klass.ranks[index + 1] || null;
}

/**
 * The number a skill does for a given rank.
 *
 * One table, scaled at read time, so a rank-3 Ranger's Volley and a rank-1
 * Ranger's Volley can never drift apart in the data.
 */
export function skillStats(id, tier = 1) {
  const base = HERO_SKILLS[id];
  if (!base) return null;
  const index = Math.max(0, Math.min(RANK_POWER.length - 1, Math.round(tier) - 1));
  const power = RANK_POWER[index];
  const haste = RANK_HASTE[index];
  const stats = { ...base, power, cooldownMs: Math.round((base.cooldownMs || 0) * haste) };
  if (base.damage) stats.damage = Math.round(base.damage * power);
  if (base.healRatio) stats.healRatio = base.healRatio * power;
  return stats;
}

/* -------------------------------------------------------------------------- */
/* Backwards-compatible aliases                                               */
/* -------------------------------------------------------------------------- */

/** The Vanguard's three ranks — the ladder the rank-1 pin and HERO read. */
export const HERO_TIERS = HERO_CLASSES[0].ranks;
/** How many ranks one hero has. */
export const HERO_TIER_COUNT = HERO_RANK_COUNT;

/** @deprecated use `heroRank('vanguard', n)`; kept for older call sites. */
export function heroTier(tier = 1) {
  return heroRank('vanguard', tier);
}

/** @deprecated use `nextHeroRank('vanguard', n)`. */
export function nextHeroTier(tier = 1) {
  return nextHeroRank('vanguard', tier);
}

/**
 * The autopilot's leash. Tuned so the hero covers the bastion mouth and the
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
  manualMoveMs: 6000,
});
