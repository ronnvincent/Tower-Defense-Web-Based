/**
 * defenceRoles.js — what a defence is *for*, as one colour.
 *
 * The board has twenty-two lines and, by wave six, a player is looking at a
 * dozen buildings that all read as "a stone keep". The question that decides a
 * build is never the damage number in the shop — it is "do I need this to kill
 * the thing that flies, or the thing that walks, or to make the rest of my line
 * stronger?". That question has exactly four answers, and each one already
 * exists in the data (`targetsGround`, `targetsAir`, `supportOnly`, the support
 * lines) — this module just names it, colours it and keeps every surface that
 * shows it (dock card, inspector chip, the gem on the tower) reading the same
 * value.
 *
 * The palette is fixed by the brief:
 *
 *     GROUND  → green      AIR → red      SUPPORT → blue
 *
 * A defence that covers both categories is not given a fourth colour: it wears
 * both markers side by side (a green/red gem, a split dock strip), because
 * "green *and* red" says what it does and a neutral gold/white badge would say
 * only that it is special.
 *
 * Nothing here is gameplay. It never gates a shot, changes a range or a cooldown
 * — `Tower.canEngage` and the projectile's copied flags stay the only rules.
 */

import { defenceTargets } from '../systems/TargetCategories.js';
import { SUPPORT_LINES } from './towerData.js';

/** The four categories a defence can belong to. */
export const DEFENCE_ROLE = Object.freeze({
  GROUND: 'ground',
  AIR: 'air',
  BOTH: 'both',
  SUPPORT: 'support',
});

/**
 * Colour + copy per role.
 *
 * `colours` is ordered [left, right] for the split gem; a single-entry list is
 * drawn as one solid shape. `css` is the same hue for the DOM surfaces, kept in
 * sync here so a hex value is never invented twice.
 */
export const ROLE_STYLE = Object.freeze({
  [DEFENCE_ROLE.GROUND]: {
    colours: [0x54c95f],
    css: '#54c95f',
    ink: '#7ff08a',
    wash: 'rgba(24, 58, 26, 0.62)',
    edge: 'rgba(84, 201, 95, 0.55)',
    label: 'GROUND',
    title: 'Ground only — flyers pass over it',
    word: 'ground',
  },
  [DEFENCE_ROLE.AIR]: {
    colours: [0xe8503f],
    css: '#e8503f',
    ink: '#ff9186',
    wash: 'rgba(62, 22, 18, 0.62)',
    edge: 'rgba(232, 80, 63, 0.55)',
    label: 'AIR',
    title: 'Air only — walkers pass under it',
    word: 'air',
  },
  [DEFENCE_ROLE.BOTH]: {
    colours: [0x54c95f, 0xe8503f],
    css: '#f0b45f',
    ink: '#ffe0a8',
    wash: 'rgba(58, 42, 18, 0.62)',
    edge: 'rgba(240, 180, 95, 0.5)',
    label: 'GROUND + AIR',
    title: 'Hits ground and air creeps',
    word: 'ground and air',
  },
  [DEFENCE_ROLE.SUPPORT]: {
    colours: [0x4f9bff],
    css: '#4f9bff',
    ink: '#9cc8ff',
    wash: 'rgba(18, 36, 64, 0.62)',
    edge: 'rgba(79, 155, 255, 0.55)',
    label: 'SUPPORT',
    title: 'No gun of its own — buffs or repairs nearby defences',
    word: 'support',
  },
});

/**
 * Which of the four roles a definition belongs to.
 *
 * Order matters. A support line (the Banner Keep and the royal ward lines)
 * *does* shoot, so the targeting flags alone would file it as a weapon; it is
 * classified by its job instead. A trap takes no air, so it falls out of the
 * targeting flags as GROUND without a special case.
 *
 * @param {object} def a tower/bastion definition (`key`, `targetsGround`, …)
 * @returns {'ground'|'air'|'both'|'support'}
 */
export function defenceRole(def) {
  if (!def) return DEFENCE_ROLE.GROUND;
  if (def.supportOnly || SUPPORT_LINES.includes(def.key)) return DEFENCE_ROLE.SUPPORT;
  const { ground, air } = defenceTargets(def);
  if (ground && air) return DEFENCE_ROLE.BOTH;
  if (air) return DEFENCE_ROLE.AIR;
  return DEFENCE_ROLE.GROUND;
}

/** The style record for a definition (accepts a def, a role string or nothing). */
export function roleStyleFor(defOrRole) {
  const role =
    typeof defOrRole === 'string' && ROLE_STYLE[defOrRole]
      ? defOrRole
      : defenceRole(defOrRole);
  return ROLE_STYLE[role] || ROLE_STYLE[DEFENCE_ROLE.GROUND];
}

/** The word printed on a chip or a `title`: GROUND / AIR / GROUND + AIR / SUPPORT. */
export function roleLabel(defOrRole) {
  return roleStyleFor(defOrRole).label;
}

/** One sentence, for a tooltip or an aria-label. */
export function roleTitle(defOrRole) {
  return roleStyleFor(defOrRole).title;
}

/** `role-ground` / `role-air` / … — the class every DOM surface switches on. */
export function roleClass(defOrRole) {
  const role =
    typeof defOrRole === 'string' && ROLE_STYLE[defOrRole] ? defOrRole : defenceRole(defOrRole);
  return `role-${role}`;
}

/** Keys → role, for the dock and for tests that want the whole roster at once. */
export function roleMap(definitions = {}) {
  const out = {};
  for (const [key, def] of Object.entries(definitions)) out[key] = defenceRole(def || { key });
  return out;
}
