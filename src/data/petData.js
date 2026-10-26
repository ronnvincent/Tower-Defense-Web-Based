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
