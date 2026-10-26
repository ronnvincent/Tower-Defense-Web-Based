import { describe, it, expect } from 'vitest';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { cellKey } from '../src/dsa/Graph.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { deriveBuildSlots, resolveSlotConfig, slotAt, slotStates, SLOT_STATUS } from '../src/systems/BuildSlots.js';
import { getLevel } from '../src/data/levelData.js';
import { getBuildDefinition } from '../src/data/towerData.js';

/**
 * Designated build pads.
 *
 * A bastion stage is held from marked ground. The tests here cover the three
 * things that make that safe to ship: the pads are deterministic (same map →
 * same pads, in the same order), they obey their own spacing/band rules, and the
 * one validation path every build already goes through refuses a pad-less tile
 * *before* it charges the player.
 */

const level = () => getLevel('level-1');
const mapOf = () => parseMap(getMapLayout(level().map));

function lanesOf(map) {
  const pf = new PathfindingSystem(map);
  return pf.computeLanes({ max: 3 });
}

function slotsFor(map, config = resolveSlotConfig(level())) {
  return deriveBuildSlots(map, lanesOf(map), config);
}

describe('stage 1 declares pads', () => {
  it('resolves the level config with data defaults', () => {
    expect(resolveSlotConfig(level())).toEqual({ max: 16, reach: 2, spacing: 2, minRow: 2, maxRow: 9 });
    expect(resolveSlotConfig({})).toBeNull();
    expect(resolveSlotConfig({ buildSlots: true })).toEqual({ max: 16, reach: 2, spacing: 2, minRow: 0, maxRow: null });
  });

  it('derives a full set of pads on the bastion battlefield', () => {
    const { slots } = slotsFor(mapOf());
    expect(slots.length).toBeGreaterThanOrEqual(12);
  });

  it('is deterministic: the same battlefield always gives the same pads in the same order', () => {
    const first = slotsFor(mapOf()).slots.map((s) => s.key);
    const second = slotsFor(mapOf()).slots.map((s) => s.key);
    expect(second).toEqual(first);
  });

  it('only uses grass, never the gates, and stays inside the defence band', () => {
    const map = mapOf();
    const { slots } = slotsFor(map);
    for (const slot of slots) {
      expect(map.tiles[slot.row][slot.col]).toBe(TILE.GRASS);
      expect(slot.row).toBeGreaterThanOrEqual(level().buildSlots.minRow);
      expect(slot.row).toBeLessThanOrEqual(level().buildSlots.maxRow);
      const gateDistance = Math.max(
        Math.abs(map.spawn.row - slot.row),
        Math.abs(map.spawn.col - slot.col)
      );
      expect(gateDistance).toBeGreaterThan(1);
    }
  });

  it('keeps pads at least `spacing` apart so the field stays readable', () => {
    const { slots } = slotsFor(mapOf());
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const d = Math.abs(slots[i].row - slots[j].row) + Math.abs(slots[i].col - slots[j].col);
        expect(d).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('puts every pad within reach of a road the horde actually walks', () => {
    const map = mapOf();
    const lanes = lanesOf(map);
    const { slots } = slotsFor(map, { ...resolveSlotConfig(level()) });
    const reach = level().buildSlots.reach;
    for (const slot of slots) {
      const near = lanes.some((lane) =>
        lane.some((key) => {
          const [r, c] = key.split(',').map(Number);
          return Math.max(Math.abs(r - slot.row), Math.abs(c - slot.col)) <= reach;
        })
      );
      expect(near, `pad ${slot.key} overlooks no road`).toBe(true);
    }
  });

  it('honours `max` and reports live occupancy', () => {
    const map = mapOf();
    const { slots } = slotsFor(map, { ...resolveSlotConfig(level()), max: 5 });
    expect(slots).toHaveLength(5);

    const occupied = new Set([slots[0].key]);
    const states = slotStates(slots, { isOccupied: (row, col) => occupied.has(cellKey(row, col)) });
    expect(states[0].status).toBe(SLOT_STATUS.OCCUPIED);
    expect(states[1].status).toBe(SLOT_STATUS.FREE);
    expect(slotAt(slots, slots[0].row, slots[0].col)?.key).toBe(slots[0].key);
    expect(slotAt(slots, 0, 0)).toBeNull();
  });
});

describe('every campaign stage declares pads', () => {
  it('gives each of the five stages pads derived from its own roads', async () => {
    const { LEVELS } = await import('../src/data/levelData.js');
    for (const stage of LEVELS) {
      const config = resolveSlotConfig(stage);
      expect(config, `${stage.id} has no pads`).toBeTruthy();
      const map = parseMap(getMapLayout(stage.map));
      const lanes = new PathfindingSystem(map).computeLanes({ max: 3 });
      const { slots } = deriveBuildSlots(map, lanes, config);
      expect(slots.length, `${stage.id} derived ${slots.length} pads`).toBeGreaterThanOrEqual(12);
      for (const slot of slots) {
        expect(map.tiles[slot.row][slot.col], `${stage.id} pad ${slot.key}`).toBe(TILE.GRASS);
      }
    }
  });
});

describe('placement respects the pads', () => {
  const def = getBuildDefinition('archer');

  function harness() {
    const map = mapOf();
    const { slots, keys } = slotsFor(map);
    const placement = new PlacementSystem(map);
    return { map, slots, keys, placement };
  }

  it('accepts a build on a pad', () => {
    const { placement, slots, keys } = harness();
    const slot = slots[0];
    const result = placement.validate(def, slot.row, slot.col, 9999, { slots: keys });
    expect(result).toEqual({ ok: true, reason: null });
  });

  it('builds on grass that no pad marks', () => {
    const { map, placement, keys } = harness();
    let target = null;
    // Our side of the river only: grass on the far bank is the horde's ground.
    for (let row = map.riverRow + 1; row < map.rows && !target; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (map.tiles[row][col] !== TILE.GRASS) continue;
        if (keys.has(cellKey(row, col))) continue;
        target = { row, col };
        break;
      }
    }
    expect(target).toBeTruthy();
    // Free placement: a grass tile that no pad marks is still buildable. Pads
    // are a hint for good overwatch, not a gate on the build path.
    const result = placement.validate(def, target.row, target.col, 9999, { slots: keys });
    expect(result).toEqual({ ok: true, reason: null });
  });

  it('keeps free placement on stages that declare no pads', () => {
    const { map, placement } = harness();
    let target = null;
    for (let row = map.riverRow + 1; row < map.rows && !target; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (map.tiles[row][col] === TILE.GRASS) {
          target = { row, col };
          break;
        }
      }
    }
    expect(target).toBeTruthy();
    const result = placement.validate(def, target.row, target.col, 9999, {});
    expect(result.ok).toBe(true);
  });

  it('leaves palisades alone — a wall goes on the road, not on a pad', () => {
    const { map, placement, keys } = harness();
    const wall = getBuildDefinition('barricade');
    const route = new Set();
    // A palisade is a player-half object, so only our roads count.
    for (let row = map.riverRow + 1; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (map.tiles[row][col] === TILE.ROAD) route.add(cellKey(row, col));
      }
    }
    const [firstRoad] = [...route];
    expect(firstRoad).toBeTruthy();
    const [row, col] = firstRoad.split(',').map(Number);
    const result = placement.validate(wall, row, col, 9999, { route, slots: keys });
    expect(result).toEqual({ ok: true, reason: null });
  });
});
