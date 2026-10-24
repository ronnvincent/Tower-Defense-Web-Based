import { describe, it, expect } from 'vitest';
import {
  SIEGE_STOP_DISTANCE,
  SIEGE_CONTACT_RANGE,
  approachPoint,
  queueOffset,
  siegeStep,
  siegeDamage,
  siegeInterval,
  resolveSiegeSwing,
} from '../src/systems/BarricadeCombat.js';
import { TILE_SIZE } from '../src/config/gameConfig.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { BARRICADE } from '../src/data/towerData.js';

const wall = (row, col) => ({ x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 });

describe('Barricade siege geometry', () => {
  it('stops the attacker outside the wall tile instead of letting it walk through', () => {
    // Enemy sits one tile to the west of the wall, both on the same lane.
    const to = wall(3, 6);
    const from = { x: to.x - TILE_SIZE, y: to.y };
    const spot = approachPoint(from, to);

    expect(spot.contact).toBe(false);
    // The stopping point must stay *outside* the wall tile (half a tile wide).
    expect(to.x - spot.x).toBeGreaterThan(TILE_SIZE / 2);
    expect(to.x - spot.x).toBeCloseTo(SIEGE_STOP_DISTANCE, 5);
    expect(spot.y).toBeCloseTo(to.y, 5);
  });

  it('keeps the stop distance inside siege contact range', () => {
    expect(SIEGE_CONTACT_RANGE).toBeGreaterThan(SIEGE_STOP_DISTANCE);
    expect(SIEGE_STOP_DISTANCE).toBeLessThan(TILE_SIZE);
  });

  it('already-adjacent attackers simply start swinging', () => {
    const to = wall(0, 0);
    const from = { x: to.x - 12, y: to.y };
    const spot = approachPoint(from, to);
    expect(spot.contact).toBe(true);
    expect(spot.x).toBe(from.x);
    expect(spot.y).toBe(from.y);
  });

  it('is a no-op when the attacker is on top of the wall centre', () => {
    const to = wall(2, 2);
    const spot = approachPoint({ x: to.x, y: to.y }, to);
    expect(spot.contact).toBe(true);
    expect(spot.dist).toBe(0);
  });

  it('parks every queue lane in contact instead of hovering a hair outside', () => {
    // Regression: the sideways queue offset used to leave lanes 2 and 3 of a
    // pack frozen ~0.1 px outside their aim point, attacking nothing forever.
    const to = wall(4, 7);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let pos = { x: to.x - TILE_SIZE * 2, y: to.y };
      let touched = false;
      for (let frame = 0; frame < 600; frame++) {
        const step = siegeStep(pos, to, { id, speed: 62, deltaMs: 16.6667 });
        pos = { x: step.x, y: step.y };
        if (step.attack) {
          touched = true;
          expect(step.gap).toBeLessThanOrEqual(SIEGE_CONTACT_RANGE);
          // Never inside the wall tile itself.
          expect(step.gap).toBeGreaterThan(TILE_SIZE * 0.5);
          break;
        }
      }
      expect(touched, `lane ${id} never reached the wall`).toBe(true);
    }
  });

  it('walks the opposite way for a wall to the north', () => {
    const to = wall(5, 4);
    const from = { x: to.x, y: to.y + TILE_SIZE };
    const spot = approachPoint(from, to);
    expect(spot.y - to.y).toBeCloseTo(SIEGE_STOP_DISTANCE, 5);
    expect(spot.x).toBeCloseTo(to.x, 5);
  });
});

describe('Palisade breach simulation', () => {
  it('assigns deterministic, spread-out queue slots', () => {
    const offsets = [1, 2, 3, 4, 5, 6].map((id) => queueOffset(id));
    expect(offsets).toEqual([0, 14, -14, 0, 14, -14]);
    expect(queueOffset(4)).toBe(queueOffset(1)); // stable per enemy id
    expect(new Set(offsets).size).toBe(3);
  });

  it('falls back to sane siege numbers when an archetype forgets them', () => {
    expect(siegeDamage({})).toBe(8);
    expect(siegeDamage({ siege: 0 })).toBe(8);
    expect(siegeDamage({ siege: 'nope' })).toBe(8);
    expect(siegeDamage({ siege: 12.4 })).toBe(12);
    expect(siegeInterval({})).toBe(1000);
    expect(siegeInterval({ siegeInterval: 500 })).toBe(500);
    expect(siegeInterval(ENEMY_TYPES.colossus)).toBe(1000);
  });

  it('resolves a swing without ever over-killing the wall', () => {
    const target = { health: 25 };
    const swing = resolveSiegeSwing(target, 10);
    expect(swing).toEqual({ dealt: 10, remaining: 15, destroyed: false });
    target.health -= swing.dealt;

    const killing = resolveSiegeSwing(target, 40);
    expect(killing.dealt).toBe(40);
    expect(killing.remaining).toBe(0);
    expect(killing.destroyed).toBe(true);

    // A destroyed wall takes no further damage.
    expect(resolveSiegeSwing({ health: 0 }, 10)).toEqual({ dealt: 0, remaining: 0, destroyed: true });
    expect(resolveSiegeSwing(null, 10)).toEqual({ dealt: 0, remaining: 0, destroyed: true });
  });

  it('breaks a real wall down when the pack is simulated frame by frame', () => {
    const to = wall(4, 7);
    const interval = siegeInterval(ENEMY_TYPES.grunt);
    const pack = [1, 2, 3, 4, 5, 6].map((id) => ({
      id,
      pos: { x: to.x - TILE_SIZE, y: to.y + (id - 3.5) * 6 },
      timer: 0,
    }));
    let hp = BARRICADE.levels[0].health;
    const dt = 16.6667;
    let elapsed = 0;

    while (hp > 0 && elapsed < 20000) {
      for (const unit of pack) {
        const step = siegeStep(unit.pos, to, { id: unit.id, speed: 62, deltaMs: dt });
        unit.pos = { x: step.x, y: step.y };
        if (!step.attack) continue;
        unit.timer += dt;
        if (unit.timer >= interval) {
          unit.timer -= interval;
          const swing = resolveSiegeSwing({ health: hp }, siegeDamage(ENEMY_TYPES.grunt));
          hp = swing.remaining;
        }
      }
      elapsed += dt;
    }

    expect(hp).toBe(0);
    expect(elapsed).toBeLessThan(10000); // six grunts breach 420 HP in a few seconds
  });

  it('a lone grunt cannot chew through a palisade in seconds, a pack can', () => {
    const wallHp = BARRICADE.levels[0].health;
    const grunt = ENEMY_TYPES.grunt;

    const soloSwings = Math.ceil(wallHp / siegeDamage(grunt));
    expect(soloSwings).toBe(42); // 420 HP / 10 per swing
    expect((soloSwings * siegeInterval(grunt)) / 1000).toBeGreaterThan(30); // > 30s alone

    // Eight grunts attacking together fell it in six rounds (~6s).
    const pack = 8;
    const rounds = Math.ceil(wallHp / (siegeDamage(grunt) * pack));
    expect(rounds).toBe(6);
  });

  it('the reinforced tier takes roughly twice as long to break', () => {
    const [lvl1, lvl2] = BARRICADE.levels;
    expect(lvl2.health / lvl1.health).toBeGreaterThan(1.9);
  });
});
