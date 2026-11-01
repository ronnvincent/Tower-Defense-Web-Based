import { describe, it, expect } from 'vitest';
import {
  ASSAULT_FAN,
  ASSAULT_RANGE,
  assaultDamage,
  assaultInterval,
  assaultRing,
} from '../src/systems/BarricadeCombat.js';

/**
 * The siege ring around the bastion.
 *
 * The first version of `assaultRing` ignored where a creep came from and dealt
 * slots around a fixed compass — so a creep arriving from the north could be
 * sent to a slot south of the keep and walk straight through it. These tests
 * pin the invariant that replaced it: every slot is on the attacker's own
 * approach side, so the horde surrounds the gate instead of crossing it.
 */

const target = (id, bearing, radius = ASSAULT_RANGE) => {
  const ring = assaultRing(id, radius, bearing);
  return { x: Math.cos(ring.angle) * radius, y: Math.sin(ring.angle) * radius, angle: ring.angle };
};

describe('assault ring', () => {
  it('puts every slot on the ring radius', () => {
    for (let id = 0; id < 40; id += 1) {
      const p = target(id, -Math.PI / 2);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(ASSAULT_RANGE, 6);
    }
    // The radius is a parameter, not a constant.
    const far = target(3, 0, 120);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(120, 6);
  });

  it('keeps every slot within the fan around the bearing the creep arrived on', () => {
    for (const bearing of [-Math.PI / 2, 0, Math.PI / 2, Math.PI, -2.2]) {
      for (let id = 0; id < 40; id += 1) {
        const p = target(id, bearing);
        const delta = Math.atan2(Math.sin(p.angle - bearing), Math.cos(p.angle - bearing));
        expect(Math.abs(delta)).toBeLessThanOrEqual(ASSAULT_FAN / 2 + 1e-9);
      }
    }
  });

  it('never sends a north-side attacker past the gate', () => {
    // ±40° around due north means the slot is at least 55 px *above* the
    // bastion centre — the creep can never walk over the keep to reach it.
    for (let id = 0; id < 40; id += 1) {
      const p = target(id, -Math.PI / 2);
      expect(p.y).toBeLessThanOrEqual(-ASSAULT_RANGE * Math.cos(ASSAULT_FAN / 2) + 1e-6);
      expect(p.y).toBeLessThan(0);
    }
  });

  it('is deterministic per id and spreads a crowd out', () => {
    expect(assaultRing(7).angle).toBe(assaultRing(7).angle);
    expect(assaultRing(7, ASSAULT_RANGE, 0.4).angle).toBe(assaultRing(7, ASSAULT_RANGE, 0.4).angle);
    const angles = new Set();
    for (let id = 0; id < 9; id += 1) angles.add(assaultRing(id, ASSAULT_RANGE, 0).angle.toFixed(6));
    expect(angles.size).toBe(9); // nine slots, nine distinct bearings
    // Slot 0 is the far edge of the fan, slot 8 the near edge.
    expect(assaultRing(0, ASSAULT_RANGE, 0).angle).toBeCloseTo(-ASSAULT_FAN / 2, 6);
    expect(assaultRing(8, ASSAULT_RANGE, 0).angle).toBeCloseTo(ASSAULT_FAN / 2, 6);
    // A negative or missing id still answers with a real slot.
    expect(Number.isFinite(assaultRing(-4).angle)).toBe(true);
    expect(Number.isFinite(assaultRing(undefined).angle)).toBe(true);
  });

  it('keeps the damage and cadence table intact', () => {
    expect(assaultDamage({ baseDamage: 16 })).toBe(5);
    expect(assaultDamage({ baseDamage: 2 })).toBe(1);
    expect(assaultDamage({})).toBe(1);
    expect(assaultInterval({ baseDamage: 16 })).toBe(2000);
    expect(assaultInterval({ baseDamage: 5 })).toBe(1700);
    expect(assaultInterval({ baseDamage: 1 })).toBe(1500);
  });
});
