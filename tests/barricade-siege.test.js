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
    // Six grunts against the authored tier. The palisade ladder was raised
    // 1.5× when defences were made sturdier (500 → 750 at level 1), so the
    // pack now needs ~13 s including the walk in, not ~8. The bound still
    // fails loudly if a wall ever becomes unbreakable or free to fell.
    expect(elapsed).toBeLessThan(20000);
    expect(elapsed).toBeGreaterThan(8000);
  });

  it('a lone grunt cannot chew through a palisade in seconds, a pack can', () => {
    const wallHp = BARRICADE.levels[0].health;
    const grunt = ENEMY_TYPES.grunt;

    // A lone grunt needs a minute of hammering; a pack opens a hole in seconds.
    // The exact numbers follow the authored tier, so this asserts the *shape*
    // of the curve rather than a constant that drifts with every rebalance.
    const soloSwings = Math.ceil(wallHp / siegeDamage(grunt));
    expect((soloSwings * siegeInterval(grunt)) / 1000).toBeGreaterThan(30);
    const pack = 8;
    const rounds = Math.ceil(wallHp / (siegeDamage(grunt) * pack));
    // Same 1.5× ladder: a pack of eight opens the hole in ten swings (~10 s),
    // where it took seven before. Still "seconds", and still bounded.
    expect(rounds).toBeLessThan(15);
    expect((rounds * siegeInterval(grunt)) / 1000).toBeLessThan(15);
  });

  it('every tier takes longer to break than the one below it', () => {
    const { levels } = BARRICADE;
    expect(levels).toHaveLength(5);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i].health / levels[i - 1].health, `tier ${i + 1}`).toBeGreaterThan(1.5);
      expect(levels[i].upgradeCost, `tier ${i + 1} cost`).toBeGreaterThan(0);
    }
  });
});
