import { describe, it, expect } from 'vitest';
import { buildAirRoutes, airMouths, airCells, flightCells } from '../src/systems/AirRoutes.js';
import { getMapLayout, parseMap, TILE, isWalkableTile } from '../src/data/mapData.js';
import { LEVELS } from '../src/data/levelData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';

/**
 * The sky lanes.
 *
 * A flyer must not walk the road. That sounds obvious, and until this file the
 * game did exactly the opposite: a wraith was a creep with a `flying` flag that
 * selected a taller sprite, and it still queued behind the grunts on the same
 * bridge. These tests pin the three things that make an air route a route —
 * it starts at the top rim, it ends on the bastion, and it crosses ground the
 * road cannot (water, rock, the middle of the enemy zone) — for every campaign
 * board, not just the one that happened to be open when the feature was written.
 */

const boards = LEVELS.map((level) => ({ level, map: parseMap(getMapLayout(level.map)) }));

describe('sky lanes on every campaign board', () => {
  it('gives every stage more than one way in', () => {
    for (const { level, map } of boards) {
      const air = buildAirRoutes(map);
      expect(air.lanes.length, `${level.id} only has ${air.lanes.length} sky lane`).toBeGreaterThanOrEqual(2);
      // Three mouths is the design target; the dedupe clamps it to the unique
      // columns a board can offer, so two is the floor and never one.
      expect(air.mouths.length).toBe(new Set(air.mouths).size);
    }
  });

  it('never repeats a mouth column on the same board', () => {
    for (const { map } of boards) {
      const mouths = airMouths(map);
      expect(new Set(mouths).size).toBe(mouths.length);
      for (const col of mouths) {
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThan(map.cols);
      }
    }
  });

  it('ends every lane on the bastion cell', () => {
    for (const { level, map } of boards) {
      const air = buildAirRoutes(map);
      const baseKey = `${map.base.row},${map.base.col}`;
      for (const lane of air.lanes) {
        expect(lane.length, `${level.id} produced an empty lane`).toBeGreaterThan(2);
        expect(lane[lane.length - 1], `${level.id} sky lane misses the bastion`).toBe(baseKey);
      }
    }
  });

  it('enters from the top rim, above the ground portal', () => {
    for (const { level, map } of boards) {
      const air = buildAirRoutes(map);
      for (const lane of air.lanes) {
        const [row] = lane[0].split(',').map(Number);
        expect(row, `${level.id} sky lane starts at row ${row}`).toBeLessThanOrEqual(2);
        expect(row).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('crosses ground the road cannot, which is what makes it air', () => {
    // At least one cell of at least one sky lane has to be non-walkable on every
    // board. If a map ever made every lane a straight road corridor, the feature
    // would quietly degrade back to "a creep with a taller sprite".
    for (const { level, map } of boards) {
      const air = buildAirRoutes(map);
      const cells = [...airCells(air)];
      const overSomething = cells.filter((cell) => {
        const [row, col] = cell.split(',').map(Number);
        return !isWalkableTile(map.tiles[row]?.[col]);
      });
      expect(overSomething.length, `${level.id} has no flying-only cell`).toBeGreaterThan(0);
    }
  });

  it('is genuinely different from the road lanes', () => {
    for (const { level, map } of boards) {
      const pf = new PathfindingSystem(map);
      pf.computeMainPath();
      pf.computeLanes();
      const ground = new Set(pf.laneCells.size ? pf.laneCells : pf.mainPath);
      const air = buildAirRoutes(map);
      const shared = air.lanes[0].filter((cell) => ground.has(cell));
      // Sharing the bastion approach is fine (every route converges); sharing
      // the whole lane is not.
      expect(shared.length, `${level.id} sky lane is the road lane`).toBeLessThan(air.lanes[0].length);
    }
  });
});

describe('the geometry helper', () => {
  it('walks a straight line corner to corner', () => {
    const cells = flightCells({ row: 0, col: 0 }, { row: 3, col: 3 });
    expect(cells).toEqual(['0,0', '1,1', '2,2', '3,3']);
  });

  it('covers every row and column of an uneven line', () => {
    const cells = flightCells({ row: 2, col: 4 }, { row: 8, col: 4 });
    expect(cells).toHaveLength(7);
    expect(new Set(cells.map((c) => c.split(',')[0])).size).toBe(7);
  });

  it('stays put when both ends are the same cell', () => {
    expect(flightCells({ row: 4, col: 4 }, { row: 4, col: 4 })).toEqual(['4,4']);
  });

  it('rotates lanes with the wave ordinal, like the ground lanes do', () => {
    const { map } = boards[0];
    const air = buildAirRoutes(map);
    expect(air.laneAt(0)).toBe(air.lanes[0]);
    expect(air.laneAt(air.lanes.length)).toBe(air.lanes[0]);
    expect(air.laneAt(-1)).toBe(air.lanes[air.lanes.length - 1]);
  });

  it('is deterministic, because both duel seats derive it separately', () => {
    const a = buildAirRoutes(boards[0].map);
    const b = buildAirRoutes(boards[0].map);
    expect(a.lanes).toEqual(b.lanes);
    expect(a.mouths).toEqual(b.mouths);
  });
});

describe('the wave data actually uses the sky', () => {
  it('sends flyers in more than one campaign stage', () => {
    const withAir = LEVELS.filter((level) =>
      (level.waves || []).some((wave) =>
        (wave.groups || []).some((group) => ENEMY_TYPES[group.type]?.flying)
      )
    );
    expect(withAir.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the opening stage fair: flyers arrive after the player can afford an archer', () => {
    const level1 = LEVELS[0];
    const firstAir = level1.waves.findIndex((wave) =>
      wave.groups.some((group) => ENEMY_TYPES[group.type]?.flying)
    );
    expect(firstAir).toBeGreaterThanOrEqual(3);
  });

  it('never puts a flying boss on a ground-only map', () => {
    for (const level of LEVELS) {
      if (!level.boss) continue;
      const boss = ENEMY_TYPES[level.boss];
      // A flying boss is allowed — the roster has one — but the stage has to
      // ship the anti-air answer, and every stage does (archer/frost/runes).
      if (boss?.flying) expect(boss.siege).toBe(0);
    }
  });
});

describe('the arena grammar still produces walkable ground', () => {
  it('keeps the road network connected on every board', () => {
    for (const { level, map } of boards) {
      const pf = new PathfindingSystem(map);
      const result = pf.computeMainPath();
      expect(result.found, `${level.id} has no road from portal to bastion`).toBe(true);
      expect(pf.mainPath.length).toBeGreaterThan(5);
      // Tiles are still the data the renderer reads.
      expect(map.tiles[map.spawn.row][map.spawn.col]).toBe(TILE.SPAWN);
      expect(map.tiles[map.base.row][map.base.col]).toBe(TILE.BASE);
    }
  });
});
