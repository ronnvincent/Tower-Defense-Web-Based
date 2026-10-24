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
