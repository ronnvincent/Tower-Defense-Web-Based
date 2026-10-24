import { describe, it, expect } from 'vitest';
import {
  ART_FORWARD_OFFSET,
  TURRET_TURN_RATE,
  AIM_TOLERANCE,
  aimAngle,
  shortestDelta,
  rotateToward,
  stepAngle,
  isAligned,
  canFire,
  muzzlePoint,
} from '../src/systems/TurretAim.js';

/**
 * Weapon art is drawn pointing UP, and Phaser rotates clockwise. Rotating a
 * turret by the raw `atan2(dy, dx)` of its target therefore aims the barrel 90°
 * clockwise of the target — the towers "looked at" enemies while firing out of
 * the side. These tests pin the offset, the fast servo turn and the muzzle
 * geometry that the shot origin depends on.
 */

const HALF_PI = Math.PI / 2;

describe('turret aim — art offset', () => {
  it('keeps a target straight above at rotation 0', () => {
    expect(aimAngle(0, 0, 0, -100)).toBeCloseTo(0, 6);
  });

  it('turns a right-hand target to +90°', () => {
    expect(aimAngle(0, 0, 100, 0)).toBeCloseTo(HALF_PI, 6);
  });

  it('turns a left-hand target to -90°', () => {
    expect(aimAngle(0, 0, -100, 0)).toBeCloseTo(-HALF_PI, 6);
  });

  it('turns a target below to 180°', () => {
    expect(Math.abs(aimAngle(0, 0, 0, 100))).toBeCloseTo(Math.PI, 6);
  });

  it('always reports a wrapped angle in (-π, π]', () => {
    for (const angle of [-7, -3.5, 0, 3.3, 9]) {
      const wrapped = aimAngle(0, 0, Math.cos(angle - Math.PI / 2), Math.sin(angle - Math.PI / 2));
      expect(wrapped).toBeGreaterThan(-Math.PI - 1e-9);
      expect(wrapped).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('is exactly a quarter turn ahead of the raw screen angle', () => {
    for (const [x, y] of [[10, 10], [-30, 5], [0, -20], [7, -7]]) {
      expect(aimAngle(0, 0, x, y)).toBeCloseTo(
        Math.atan2(Math.sin(Math.atan2(y, x) + ART_FORWARD_OFFSET), Math.cos(Math.atan2(y, x) + ART_FORWARD_OFFSET)),
        9
      );
    }
    expect(ART_FORWARD_OFFSET).toBeCloseTo(HALF_PI, 9);
  });
});

describe('turret aim — servo turn', () => {
  it('measures the shortest way around the circle', () => {
    expect(shortestDelta(3.0, -3.0)).toBeCloseTo(0.2831853, 5);
    expect(shortestDelta(-3.0, 3.0)).toBeCloseTo(-0.2831853, 5);
    expect(shortestDelta(0, HALF_PI)).toBeCloseTo(HALF_PI, 6);
  });

  it('steps at the configured turn rate', () => {
    // 16 rad/s over 100 ms is 1.6 rad.
    expect(stepAngle(0, Math.PI, 100)).toBeCloseTo(1.6, 6);
    expect(TURRET_TURN_RATE).toBeGreaterThanOrEqual(10);
  });

  it('never overshoots the target', () => {
    const target = 0.4;
    expect(rotateToward(0, target, 5)).toBe(target);
    expect(rotateToward(0, 3, 0.5)).toBeCloseTo(0.5, 9);
    expect(rotateToward(0, -3, 0.5)).toBeCloseTo(-0.5, 9);
  });

  it('takes under a quarter second to flip 180°', () => {
    // Continuous frames of 16 ms until aligned.
    let angle = 0;
    const target = Math.PI;
    let elapsed = 0;
    while (!isAligned(angle, target) && elapsed < 2000) {
      angle = stepAngle(angle, target, 16);
      elapsed += 16;
    }
    expect(elapsed).toBeLessThanOrEqual(250);
    expect(isAligned(angle, target)).toBe(true);
  });

  it('never blocks a static weapon that cannot rotate', () => {
    // The frost crystal and banner keep rotation 0 forever; gating them on
    // alignment would stop them firing at anything that is not straight up.
    expect(canFire(false, 0, Math.PI)).toBe(true);
    expect(canFire(false, 0, HALF_PI)).toBe(true);
    // Rotating turrets still have to line up.
    expect(canFire(true, 0, Math.PI)).toBe(false);
    expect(canFire(true, 0, 0.05)).toBe(true);
  });

  it('refuses a shot until the barrel is on the line', () => {
    expect(isAligned(0, AIM_TOLERANCE * 0.9)).toBe(true);
    expect(isAligned(0, HALF_PI)).toBe(false);
    // Wrapping must not fool the gate near the ±180° seam.
    expect(isAligned(Math.PI - 0.05, -Math.PI + 0.05)).toBe(true);
  });
});

describe('turret aim — muzzle geometry', () => {
  const offset = { x: 0, y: -40 }; // straight up the barrel, art space

  it('leaves straight above the pivot at rotation 0', () => {
    const { x, y } = muzzlePoint(100, 200, 0, offset);
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(160, 6);
  });

  it('carries the muzzle to the right when the turret turns to +90°', () => {
    const { x, y } = muzzlePoint(100, 200, HALF_PI, offset);
    expect(x).toBeCloseTo(140, 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it('carries the muzzle to the left when the turret turns to -90°', () => {
    const { x, y } = muzzlePoint(100, 200, -HALF_PI, offset);
    expect(x).toBeCloseTo(60, 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it('points at the target it is aiming at', () => {
    const pivot = { x: 300, y: 300 };
    const target = { x: 420, y: 180 };
    const angle = aimAngle(pivot.x, pivot.y, target.x, target.y);
    const muzzle = muzzlePoint(pivot.x, pivot.y, angle, offset);
    // The muzzle must lie on the pivot→target ray, 40 px out.
    const dx = muzzle.x - pivot.x;
    const dy = muzzle.y - pivot.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(40, 6);
    expect(Math.atan2(dy, dx)).toBeCloseTo(Math.atan2(target.y - pivot.y, target.x - pivot.x), 6);
  });
});
