/**
 * BarricadeCombat — the pure maths behind a horde breaking down a palisade.
 *
 * The palisade is a solid wall on a road tile. Enemies never path around it:
 * they walk the BFS route and, when the next waypoint holds a wall, they stop
 * at its edge and hammer it until it collapses.
 *
 * Keeping the geometry in one small module (instead of inlining it in
 * `Enemy.update`) means the "stops outside the wall instead of walking into
 * it" contract can be unit-tested without a Phaser scene.
 */
import { TILE_SIZE } from '../config/gameConfig.js';

/**
 * Distance from the wall's centre where an attacker plants its feet.
 * 0.62 × 64 ≈ 40 px — just under one tile, so a 16 px radius enemy stands in
 * the road tile *before* the wall and never overlaps the stakes.
 */
export const SIEGE_STOP_DISTANCE = Math.round(TILE_SIZE * 0.62);

/** Distance at which an attacker is considered "in contact" and starts hitting. */
export const SIEGE_CONTACT_RANGE = SIEGE_STOP_DISTANCE + 4;

/** Default melee cadence against a structure, in milliseconds. */
export const SIEGE_INTERVAL_MS = 1000;

/** Upper bound: enemies never spawn closer than this to a wall (avoids 0-div). */
const MIN_APPROACH = 1;

/**
 * Point along the segment from the attacker to the wall's centre where the
 * attacker should stop. If the attacker is already inside the stop radius the
 * point collapses onto its current position, so it simply starts swinging.
 *
 * @param {{x:number,y:number}} from attacker position
 * @param {{x:number,y:number}} to wall centre
 * @param {number} [stop] distance to keep from the wall centre
 * @returns {{x:number, y:number, dist:number, contact:boolean}}
 */
export function approachPoint(from, to, stop = SIEGE_STOP_DISTANCE) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= stop || dist < MIN_APPROACH) {
    return { x: from.x, y: from.y, dist, contact: true };
  }
  const ratio = (dist - stop) / dist;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
    dist,
    contact: dist <= stop + 1,
  };
}

/**
 * Perpendicular "queue offset" so a pack of attackers does not stack on one
 * pixel. Deterministic on the enemy id, so an enemy keeps its slot while it
 * hammers away.
 *
 * @param {number} id enemy id
 * @param {number} spread half-width of the queue in pixels
 */
export function queueOffset(id, spread = 14) {
  const lane = ((id % 3) + 3) % 3; // 0, 1, 2
  return (lane - 1) * spread;
}

/**
 * One frame of a siege approach, shared by `Enemy.updateSiege` and the tests.
 *
 * Returns the next position plus whether the attacker is close enough to swing.
 * Contact is radial (`gap <= contact`), so a sideways queue slot can never park
 * an attacker 0.1 px outside its aim point and stall the whole pack.
 *
 * @param {{x:number, y:number}} position attacker position
 * @param {{x:number, y:number}} wall wall centre
 * @param {{id?:number, speed?:number, deltaMs?:number, stop?:number, contact?:number}} [opts]
 * @returns {{x:number, y:number, gap:number, attack:boolean, facing:number}}
 */
export function siegeStep(position, wall, opts = {}) {
  const { id = 0, speed = 60, deltaMs = 16.7, stop = SIEGE_STOP_DISTANCE, contact = SIEGE_CONTACT_RANGE } = opts;
  const dx = wall.x - position.x;
  const dy = wall.y - position.y;
  const gap = Math.hypot(dx, dy) || 1;
  const facing = Math.atan2(dy, dx);

  if (gap <= contact) {
    return { x: position.x, y: position.y, gap, attack: true, facing };
  }

  const spot = approachPoint(position, wall, stop);
  const lane = queueOffset(id) * 0.6;
  const targetX = spot.x + (-dy / gap) * lane;
  const targetY = spot.y + (dx / gap) * lane;

  const mx = targetX - position.x;
  const my = targetY - position.y;
  const remaining = Math.hypot(mx, my);
  const stepLength = Math.max(0, (speed * deltaMs) / 1000);
  if (remaining <= 0.01 || stepLength === 0) {
    return { x: position.x, y: position.y, gap, attack: false, facing };
  }

  const travel = Math.min(stepLength, remaining);
  return {
    x: position.x + (mx / remaining) * travel,
    y: position.y + (my / remaining) * travel,
    gap,
    attack: false,
    facing,
  };
}

/**
 * Damage a single siege swing deals. Falls back to a sane default so a new
 * enemy archetype cannot break the wall interaction by forgetting `siege`.
 */
export function siegeDamage(def) {
  const value = Number(def?.siege);
  if (!Number.isFinite(value) || value <= 0) return 8;
  return Math.round(value);
}

/** Milliseconds between two siege swings for this archetype. */
export function siegeInterval(def) {
  const value = Number(def?.siegeInterval);
  if (!Number.isFinite(value) || value <= 0) return SIEGE_INTERVAL_MS;
  return value;
}

/**
 * Work out what one swing does to a wall. Pure — the caller applies the damage
 * (the Tower owns its health so the health bar can redraw itself).
 *
 * @param {{health:number, isDestroyed?:boolean}} wall
 * @param {number} amount
 * @returns {{dealt:number, remaining:number, destroyed:boolean}}
 */
export function resolveSiegeSwing(wall, amount) {
  if (!wall || wall.isDestroyed || wall.health <= 0) {
    return { dealt: 0, remaining: 0, destroyed: true };
  }
  const dealt = Math.max(1, Math.round(amount));
  const remaining = Math.max(0, wall.health - dealt);
  return { dealt, remaining, destroyed: remaining <= 0 };
}

/* --------------------------------------------------------------------------
 * Bastion assault
 *
 * The old rule was a leak: an enemy that walked off the end of its path took a
 * lump of base integrity and vanished. That read as a monster phasing through
 * the gate, and it made the bastion a number instead of a place.
 *
 * Now the end of the path is a *siege*. The horde stops at the wall, swings on
 * a cadence, and stays alive — so every hit it lands is a hit you could have
 * prevented by killing it at the gate. `assaultDamage` splits the old lump into
 * thirds, because a living attacker hits several times; the totals only stay
 * comparable when the per-swing number is smaller.
 * ------------------------------------------------------------------------- */

/** How close (world px) to the bastion an attacker stops and swings. */
export const ASSAULT_RANGE = 72;

/** Damage of a single swing on the bastion. Bosses hit ~4× a grunt. */
export function assaultDamage(def) {
  const threat = Math.max(1, Number(def?.baseDamage) || 1);
  return Math.max(1, Math.round(threat / 3));
}

/** Milliseconds between swings. Heavier attackers swing slower, per hit. */
export function assaultInterval(def) {
  const threat = Math.max(1, Number(def?.baseDamage) || 1);
  if (threat >= 9) return 2000;
  if (threat >= 4) return 1700;
  return 1500;
}

/** Full width of the ring fan, in radians (80°, so ±40° off the bearing). */
export const ASSAULT_FAN = (Math.PI * 2) / 9;

/**
 * Where on the ring around the bastion this attacker stands.
 *
 * Spreading the horde around the gate keeps a twenty-creep wave from stacking
 * into one sprite, and reads as a siege rather than a queue. The slot is
 * deterministic per enemy id, so a duel replay walks the same ring.
 *
 * The slot is fanned around `approachAngle` — the side of the bastion the creep
 * actually came from — instead of around a fixed compass point. A fixed ring
 * sent north-side attackers to south-side slots, so they walked *through* the
 * keep to get there: the exact pass-through the gate must never allow.
 *
 * @param {number} id            enemy id (deterministic slot)
 * @param {number} [radius]      ring radius in pixels
 * @param {number} [approachAngle] bearing from the bastion to the creep
 */
export function assaultRing(id, radius = ASSAULT_RANGE, approachAngle = -Math.PI / 2) {
  const slot = Math.abs(Math.floor(Number(id) || 0)) % 9;
  const bearing = Number.isFinite(approachAngle) ? approachAngle : -Math.PI / 2;
  const fan = (slot / 8 - 0.5) * ASSAULT_FAN;
  return { angle: bearing + fan, radius };
}

/* --------------------------------------------------------------------------
 * Defence hunting
 *
 * A wall across the lane is unmissable: the creep is walking into it. A keep
 * standing one tile off the road is not — the first version only looked at the
 * cell the creep was stepping into, so a tower that covered the lane was
 * something the horde walked past while it plinked them. Worse, the bastion
 * assault runs when the creep is ~90 px from the core, and every defence a
 * player builds late game stands right there — so the horde ignored the whole
 * line and hammered the gate with the towers intact.
 *
 * The rule now is the one the report asks for: **defences first, the gate
 * last.** Two radii, both measured from the attacker:
 *
 *   DEFENCE_HUNT_RADIUS  a defence this close is in the horde's way, whether
 *                        or not it sits on the next waypoint. 1.25 tiles, so a
 *                        keep hugging the road is reachable and a keep out in
 *                        the field is not.
 *   GATE_GUARD_RADIUS    inside this ring around the bastion, everything the
 *                        player raised to defend the gate is a target before
 *                        the gate itself. The core cannot be touched while a
 *                        guard stands.
 * -------------------------------------------------------------------------- */

/** A defence within this distance of an attacker is engaged on the way past. */
export const DEFENCE_HUNT_RADIUS = Math.round(TILE_SIZE * 1.25);

/** Inside this ring around the bastion, the guards are cleared before the gate. */
export const GATE_GUARD_RADIUS = Math.round(TILE_SIZE * 3);

/**
 * Which radius applies to an attacker standing at `(x, y)`.
 *
 * @param {{x:number,y:number}} from attacker position
 * @param {{x:number,y:number}|null} base bastion centre, if the scene has one
 * @returns {number} hunt radius in px
 */
export function huntRadiusFor(from, base) {
  if (!base) return DEFENCE_HUNT_RADIUS;
  const toBase = Math.hypot(base.x - from.x, base.y - from.y);
  return toBase <= GATE_GUARD_RADIUS ? GATE_GUARD_RADIUS : DEFENCE_HUNT_RADIUS;
}

/**
 * The defence an attacker should break next, or null.
 *
 * Pure: the caller owns the structure objects and applies the damage. Ties are
 * broken toward a palisade (it is the thing physically in the way) and then
 * toward the closest, so a pack does not spend the wave deciding.
 *
 * @param {{x:number,y:number}} from attacker position
 * @param {Array<{x:number,y:number,isBarricade?:boolean,isDestroyed?:boolean,health?:number}>} structures
 * @param {number} radius
 * @returns {object|null}
 */
export function pickDefenceInReach(from, structures, radius) {
  if (!Array.isArray(structures) || !(radius > 0)) return null;
  let best = null;
  let bestScore = Infinity;
  for (const structure of structures) {
    if (!structure || structure.isDestroyed) continue;
    if (typeof structure.health === 'number' && structure.health <= 0) continue;
    const distance = Math.hypot(structure.x - from.x, structure.y - from.y);
    if (distance > radius) continue;
    const score = distance - (structure.isBarricade ? 8 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = structure;
    }
  }
  return best;
}
