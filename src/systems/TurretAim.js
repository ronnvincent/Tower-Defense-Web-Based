/**
 * Turret aiming maths.
 *
 * The Spire weapon art is drawn pointing **up** in its own frame, and Phaser
 * rotates a sprite clockwise around its pivot. So a weapon that must point at an
 * angle θ on screen (atan2(dy, dx), +y down) needs `rotation = θ + π/2`.
 *
 * Getting that offset wrong is what made the turrets look crooked: rotating by θ
 * aims the barrel 90° clockwise of the target, which reads as "the tower is
 * looking at the enemy" while the shots leave from the side.
 *
 * The helpers here are pure so the geometry can be pinned by tests without a
 * Phaser scene: nothing in this file touches the DOM, the canvas or a scene.
 */

export const TAU = Math.PI * 2;

/** Art-space forward is up, screen angles are clockwise — half a turn apart. */
export const ART_FORWARD_OFFSET = Math.PI / 2;

/**
 * Fast auto-aim: how quickly a turret can swing, in radians per second.
 * 16 rad/s ≈ 917°/s — a 180° target flip lands in ~0.2 s, which reads as a
 * snappy servo rather than the old instant (and therefore invisible) snap.
 */
export const TURRET_TURN_RATE = 16;

/** A shot is only released once the barrel is this close to the target line. */
export const AIM_TOLERANCE = 0.2;

/** Wrap any angle into (-π, π] so rotations compare and display predictably. */
export function wrapAngle(angle) {
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  if (wrapped <= -Math.PI) wrapped += TAU;
  return wrapped;
}

/** Rotation (radians) of a weapon whose pivot is at (fromX, fromY) aiming at a point. */
export function aimAngle(fromX, fromY, toX, toY) {
  return wrapAngle(Math.atan2(toY - fromY, toX - fromX) + ART_FORWARD_OFFSET);
}

/** Signed shortest rotation from `from` to `to`, in (-π, π]. */
export function shortestDelta(from, to) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta <= -Math.PI) delta += TAU;
  return delta;
}

/** Step `current` toward `target` without overshooting. */
export function rotateToward(current, target, maxStep) {
  if (!(maxStep > 0)) return current;
  const delta = shortestDelta(current, target);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/** Per-frame turn: `deltaMs` of travel at `turnRate` rad/s. */
export function stepAngle(current, target, deltaMs, turnRate = TURRET_TURN_RATE) {
  const step = (Math.max(0, Number(deltaMs) || 0) / 1000) * Math.max(0, turnRate);
  return rotateToward(current, target, step);
}

/** True once the barrel is within `tolerance` of the target line. */
export function isAligned(current, target, tolerance = AIM_TOLERANCE) {
  return Math.abs(shortestDelta(current, target)) <= tolerance;
}

/**
 * World position of a muzzle.
 *
 * `offset` is measured in the weapon's own art space (x right, y down, so the
 * muzzle of an upward-pointing weapon has a negative y), relative to the sprite
 * pivot at (x, pivotY). Rotating the offset by the sprite's rotation is what makes
 * the shot leave the barrel instead of the tile centre.
 */
export function muzzlePoint(x, pivotY, angle, offset) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ox = offset?.x || 0;
  const oy = offset?.y || 0;
  return {
    x: x + cos * ox - sin * oy,
    y: pivotY + sin * ox + cos * oy,
  };
}
