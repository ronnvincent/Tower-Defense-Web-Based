/**
 * petData.js — the five companions, their prices and their abilities.
 *
 * A companion is bought **outside** a battle, with meta gold banked from cleared
 * levels, and then fights beside the Vanguard in every battle. That split is
 * deliberate: an in-battle pet would be another thing to buy with the forge's
 * gold and would compete with the towers, while a meta pet is a goal you save
 * for and a reason to replay a level.
 *
 * Every pet is one of two things the board already understands — damage or
 * crowd control — plus one support, so a companion can never invalidate a tower:
 *
 *   Bramble  Pawn          guard   — hits and staggers the closest creep
 *   Wool     Sheep         support — mends the Vanguard
 *   Fletch   Archer        ranged  — picks off the nearest creep at range
 *   Ember    Torch Goblin  burn    — sets a creep alight (damage over time)
 *   Boomer   Bomb Goblin   blast   — lobs a bomb into the thickest clump
 *
 * The art is Tiny Swords (Pixel Frog, CC0 1.0); the sheets are composed by
 * `scripts/build_unit_sheets.sh`, and the clip layout lives in `data/unitArt.js`.
 */

/**
 * @typedef {object} PetDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} kind     species shown under the name
 * @property {string} role     one-word role for the shop card
 * @property {string} blurb    what it does, in the shop's voice
 * @property {number} price    meta gold
 * @property {string} texture  sheet key (see data/unitArt.js)
 * @property {number} height   display height in world px (feet on the ground)
 * @property {object} ability  the numbers the entity applies
 */

/** @type {ReadonlyArray<PetDefinition>} */
export const PETS = Object.freeze([
  Object.freeze({
    id: 'bramble',
    name: 'Bramble',
    kind: 'Pawn',
    role: 'GUARD',
    blurb: 'A stubborn little shield-bearer. Meets the first creep on the lane and staggers it.',
    price: 150,
    texture: 'pet-squire',
    height: 44,
    ability: Object.freeze({
      id: 'taunt',
      cooldownMs: 8000,
      range: 120,
      damage: 40,
      slow: 0.35,
      slowMs: 2000,
      type: 'physical',
    }),
  }),
  Object.freeze({
    id: 'wool',
    name: 'Wool',
    kind: 'Sheep',
    role: 'SUPPORT',
    blurb: 'Unbothered by the war. Mends the Vanguard every few seconds while it holds the gate.',
    price: 240,
    texture: 'pet-wool',
    height: 34,
    ability: Object.freeze({
      id: 'mend',
      cooldownMs: 9000,
      range: 200,
      healRatio: 0.16,
      minMissingRatio: 0.2,
    }),
  }),
  Object.freeze({
    id: 'fletch',
    name: 'Fletch',
    kind: 'Archer',
    role: 'RANGED',
    blurb: 'Looses an arrow at whatever is closest. Short cooldown, single target, no fuss.',
    price: 340,
    texture: 'pet-fletch',
    height: 48,
    ability: Object.freeze({
      id: 'shot',
      cooldownMs: 3800,
      range: 240,
      damage: 45,
      type: 'physical',
    }),
  }),
  Object.freeze({
    id: 'ember',
    name: 'Ember',
    kind: 'Torch Goblin',
    role: 'BURN',
    blurb: 'Carries a torch bigger than its arms. Sets one creep alight and lets it burn.',
    price: 460,
    texture: 'pet-ember',
    height: 48,
    ability: Object.freeze({
      id: 'burn',
      cooldownMs: 6500,
      range: 170,
      damage: 10,
      tickMs: 600,
      durationMs: 4200,
      type: 'fire',
    }),
  }),
  Object.freeze({
    id: 'boomer',
    name: 'Boomer',
    kind: 'Bomb Goblin',
    role: 'BLAST',
    blurb: 'Lobs a lit bomb into the thickest knot of the horde. Slow to reload, worth the wait.',
    price: 620,
    texture: 'pet-boomer',
    height: 46,
    ability: Object.freeze({
      id: 'bomb',
      cooldownMs: 10000,
      range: 210,
      radius: 80,
      damage: 90,
      type: 'explosive',
    }),
  }),
]);

/** Look a pet up by id; null for anything unknown (old saves, bad URLs). */
export function getPet(id) {
  return PETS.find((pet) => pet.id === id) || null;
}

/* ------------------------------------------------------------- upgrades */

/** Every companion levels from 1 to 5. */
export const PET_MAX_LEVEL = 5;

/**
 * What each level does to the base ability.
 *
 * Read as multipliers of the numbers in `PETS`: level 1 is the creature as
 * written, and each further level raises damage/healing, reach and pace a step.
 * The curve is deliberately front-loaded (the first upgrade is the biggest
 * relative jump) so a cheap level on a cheap companion still feels like a buy,
 * and flat at the top so a maxed pet can never out-scale its tower.
 */
export const PET_LEVEL_SCALE = Object.freeze([
  Object.freeze({ damage: 1, cooldown: 1, range: 1, radius: 1, heal: 1, slow: 1 }),
  Object.freeze({ damage: 1.22, cooldown: 0.93, range: 1.06, radius: 1.06, heal: 1.22, slow: 1.1 }),
  Object.freeze({ damage: 1.46, cooldown: 0.86, range: 1.12, radius: 1.12, heal: 1.46, slow: 1.2 }),
  Object.freeze({ damage: 1.74, cooldown: 0.8, range: 1.18, radius: 1.18, heal: 1.72, slow: 1.3 }),
  Object.freeze({ damage: 2.05, cooldown: 0.75, range: 1.24, radius: 1.24, heal: 2, slow: 1.4 }),
]);

/** Cost to take a companion from `level` to `level + 1`, in meta gold. */
const UPGRADE_STEPS = Object.freeze([0.55, 0.9, 1.35, 1.9]);

export function petUpgradeCost(pet, level) {
  if (!pet || level >= PET_MAX_LEVEL) return null;
  const step = UPGRADE_STEPS[Math.max(0, Math.min(UPGRADE_STEPS.length - 1, level - 1))];
  return Math.round((pet.price * step) / 5) * 5;
}

/**
 * The ability as it actually plays at `level`.
 *
 * This is the single source of truth for both the entity and the shop: the
 * shop's stat rows are printed from the same object the Pet fights with, so a
 * card can never advertise a number the battle does not use.
 */
export function petAbility(pet, level = 1) {
  if (!pet) return null;
  const lv = Math.max(1, Math.min(PET_MAX_LEVEL, Math.round(Number(level) || 1)));
  const scale = PET_LEVEL_SCALE[lv - 1];
  const base = pet.ability;
  const out = { ...base, level: lv };
  if (typeof base.damage === 'number') out.damage = Math.round(base.damage * scale.damage);
  if (typeof base.healRatio === 'number') {
    out.healRatio = Math.round(base.healRatio * scale.heal * 1000) / 1000;
  }
  if (typeof base.cooldownMs === 'number') {
    out.cooldownMs = Math.max(600, Math.round((base.cooldownMs * scale.cooldown) / 50) * 50);
  }
  if (typeof base.range === 'number') out.range = Math.round(base.range * scale.range);
  if (typeof base.radius === 'number') out.radius = Math.round(base.radius * scale.radius);
  // A companion may never slow harder than a Frost Spire's 60 % ceiling.
  if (typeof base.slow === 'number') {
    out.slow = Math.min(0.6, Math.round(base.slow * scale.slow * 100) / 100);
  }
  return out;
}

const secs = (ms) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;

/** Four (or three) labelled numbers for a stat card at `level`. */
export function petStatRows(pet, level = 1) {
  const a = petAbility(pet, level);
  if (!a) return [];
  switch (a.id) {
    case 'taunt':
      return [
        { label: 'DAMAGE', value: String(a.damage) },
        { label: 'SLOW', value: `${Math.round(a.slow * 100)}%`, hint: secs(a.slowMs) },
        { label: 'COOLDOWN', value: secs(a.cooldownMs) },
        { label: 'REACH', value: String(a.range) },
      ];
    case 'mend':
      return [
        { label: 'HEAL', value: `${Math.round(a.healRatio * 100)}%`, hint: 'of max HP' },
        { label: 'COOLDOWN', value: secs(a.cooldownMs) },
        { label: 'REACH', value: String(a.range) },
      ];
    case 'shot':
      return [
        { label: 'DAMAGE', value: String(a.damage) },
        { label: 'REACH', value: String(a.range) },
        { label: 'COOLDOWN', value: secs(a.cooldownMs) },
      ];
    case 'burn':
      return [
        { label: 'BURN', value: String(a.damage), hint: `per ${secs(a.tickMs)}` },
        { label: 'DURATION', value: secs(a.durationMs) },
        { label: 'REACH', value: String(a.range) },
        { label: 'COOLDOWN', value: secs(a.cooldownMs) },
      ];
    case 'bomb':
      return [
        { label: 'DAMAGE', value: String(a.damage) },
        { label: 'BLAST', value: String(a.radius) },
        { label: 'REACH', value: String(a.range) },
        { label: 'COOLDOWN', value: secs(a.cooldownMs) },
      ];
    default:
      return [{ label: 'COOLDOWN', value: secs(a.cooldownMs) }];
  }
}

/** The signature move, as the shop names and describes it. */
const SKILL_META = Object.freeze({
  taunt: Object.freeze({
    name: 'SHIELD BASH',
    text: 'Charges the closest creep and staggers it, buying the towers a beat.',
    icon: '/assets/ui-kit/glyph_swords.png',
  }),
  mend: Object.freeze({
    name: 'MENDING WOOL',
    text: 'Knits the Vanguard back together when its health falls low.',
    icon: '/assets/ui-kit/glyph_fortify.png',
  }),
  shot: Object.freeze({
    name: 'TRUE SHOT',
    text: 'A flat arrow at the nearest creep. No wind-up, no splash, no waste.',
    icon: '/assets/ui/icon_swords.svg',
  }),
  burn: Object.freeze({
    name: 'TORCHBEARER',
    text: 'Sets one creep alight; the fire keeps burning after the torch moves on.',
    icon: '/assets/ui-kit/glyph_flame.png',
  }),
  bomb: Object.freeze({
    name: 'LOB BOMB',
    text: 'Drops a fused bomb on the thickest knot of the horde. Slow to reload.',
    icon: '/assets/ui-kit/glyph_meteor.png',
  }),
});

export function petSkill(pet) {
  const meta = (pet && SKILL_META[pet.ability?.id]) || null;
  if (!meta) return null;
  return { id: pet.ability.id, ...meta };
}

/** How far behind the hero a companion walks, and how quickly it catches up. */
export const PET_FOLLOW = Object.freeze({
  // Far enough behind the Vanguard that the two silhouettes never merge, close
  // enough that a companion still reads as "with" its hero at 0.56 zoom.
  offsetX: 62,
  offsetY: 34,
  /** 0..1 per 60 Hz step; higher is snappier. */
  catchUp: 0.18,
  /** Beyond this the pet is teleported to the hero (map wrap, revive). */
  snapDistance: 360,
});

/** Roles, in the order the shop lists them. */
export const PET_ROLES = Object.freeze(['GUARD', 'SUPPORT', 'RANGED', 'BURN', 'BLAST']);
