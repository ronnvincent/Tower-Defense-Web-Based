import { describe, it, expect } from 'vitest';
import { MAPS, parseMap, isWalkableTile } from '../src/data/mapData.js';
import { PVP_ARENAS } from '../src/data/pvpArenas.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import {
  LANE_ARROW_DEPTH,
  LANE_ARROW_STEP,
  laneArrowAnchors,
  paintLaneArrows,
} from '../src/systems/LaneArrows.js';
import { TILE_SIZE } from '../src/config/gameConfig.js';

/**
 * Lane contract.
 *
 * The old game funnelled the whole horde down one road, which made a single
 * stack of towers (or one palisade line) beat every wave. Every battlefield now
 * answers with 2–3 loopless routes from the gate to the core, the spawner deals
 * enemies across them in a fixed order, and each lane is drawn with direction
 * chevrons. These tests pin all three halves: the routes exist and are real
 * forks, the deal is deterministic (a duel has to stay mirrored), and the
 * arrows point the way the horde actually walks.
 */

const BATTLEFIELDS = [
  ...Object.entries(MAPS).map(([id, layout]) => [`campaign:${id}`, layout]),
  ...PVP_ARENAS.map((arena) => [`arena:${arena.id}`, arena.layout]),
];

const build = (layout) => {
  const map = parseMap(layout);
  const pf = new PathfindingSystem(map);
  const lanes = pf.computeLanes();
  return { map, pf, lanes };
};

const overlaps = (a, b) => a.filter((cell) => b.includes(cell));

describe('multi-lane routing', () => {
  it('covers the five campaign maps and all three duel arenas', () => {
    expect(BATTLEFIELDS).toHaveLength(8);
  });

  it('gives every battlefield two or three routes', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { lanes } = build(layout);
      expect(lanes.length, `${name} only offers ${lanes.length} route(s)`).toBeGreaterThanOrEqual(2);
      expect(lanes.length, `${name} offers too many routes`).toBeLessThanOrEqual(3);
    }
  });

  it('runs every lane from the gate to the core, without repeating a cell', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { map, lanes } = build(layout);
      const spawn = `${map.spawn.row},${map.spawn.col}`;
      const base = `${map.base.row},${map.base.col}`;
      lanes.forEach((lane, index) => {
        expect(lane[0], `${name} lane ${index + 1} does not start at the gate`).toBe(spawn);
        expect(lane[lane.length - 1], `${name} lane ${index + 1} does not end at the core`).toBe(base);
        expect(new Set(lane).size, `${name} lane ${index + 1} loops`).toBe(lane.length);
      });
    }
  });

  it('only walks road, gate and core tiles', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { map, lanes } = build(layout);
      for (const lane of lanes) {
        for (const key of lane) {
          const [row, col] = key.split(',').map(Number);
          const tile = map.tiles[row][col];
          expect(isWalkableTile(tile), `${name} lane crosses a ${tile} tile at ${key}`).toBe(true);
        }
      }
    }
  });

  it('keeps the routes comparable in length', () => {
    // Yen's tolerance is 35 %; a lane that took half a map longer would simply
    // never be used, so the length spread is the proof the fork is real.
    for (const [name, layout] of BATTLEFIELDS) {
      const { lanes } = build(layout);
      const shortest = Math.min(...lanes.map((lane) => lane.length));
      const longest = Math.max(...lanes.map((lane) => lane.length));
      expect(longest, `${name} lanes are ${shortest} vs ${longest} cells`).toBeLessThanOrEqual(
        Math.ceil(shortest * 1.35)
      );
    }
  });

  it('makes the lanes genuinely different routes, not one-cell jogs', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { lanes } = build(layout);
      for (let i = 0; i < lanes.length; i += 1) {
        for (let j = i + 1; j < lanes.length; j += 1) {
          const shared = overlaps(lanes[i], lanes[j]).length;
          const distinct = Math.max(lanes[i].length, lanes[j].length) - shared;
          expect(distinct, `${name} lanes ${i + 1}/${j + 1} are the same road`).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('splits the horde early enough that the gate does not read as one road', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { lanes } = build(layout);
      // How long all lanes stay on the same cells before the first one peels off.
      let common = 0;
      const shortest = Math.min(...lanes.map((lane) => lane.length));
      while (common < shortest && lanes.every((lane) => lane[common] === lanes[0][common])) {
        common += 1;
      }
      expect(common, `${name} keeps every lane together for ${common} cells`).toBeLessThanOrEqual(10);
    }
  });

  it('computes the same lanes twice — a duel has to stay mirrored', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const first = build(layout).lanes;
      const second = build(layout).lanes;
      expect(second, `${name} lane order is not deterministic`).toEqual(first);
      // Re-running on a live system must not append duplicates either.
      const pf = new PathfindingSystem(parseMap(layout));
      pf.computeLanes();
      const once = pf.lanes.map((lane) => [...lane]);
      pf.computeLanes();
      expect(pf.lanes, `${name} repeated computeLanes drifted`).toEqual(once);
    }
  });

  it('publishes the union of every lane for build validation', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { pf, lanes } = build(layout);
      const union = new Set(lanes.flat());
      expect(pf.laneCells.size, `${name} laneCells is not the union`).toBe(union.size);
      for (const key of union) expect(pf.laneCells.has(key)).toBe(true);
      expect(pf.laneCount).toBe(lanes.length);
      // The main path is one of the lanes, so every cell it uses is covered too.
      for (const key of pf.mainPath) expect(pf.laneCells.has(key)).toBe(true);
    }
  });
});

describe('lane dealing', () => {
  const lanes = ['a', 'b', 'c'];

  it('wraps in both directions and never returns undefined', () => {
    const pf = new PathfindingSystem(parseMap(MAPS.grassland));
    pf.computeLanes();
    expect(pf.laneAt(0)).toEqual(pf.lanes[0]);
    expect(pf.laneAt(3)).toEqual(pf.lanes[0]);
    expect(pf.laneAt(4)).toEqual(pf.lanes[1]);
    expect(pf.laneAt(-1)).toEqual(pf.lanes[pf.lanes.length - 1]);
    expect(pf.laneAt(undefined)).toEqual(pf.lanes[0]);
    expect(pf.laneAt(2.7)).toEqual(pf.lanes[2 % pf.lanes.length]);
  });

  it('falls back to the shortest path before computeLanes has run', () => {
    const pf = new PathfindingSystem(parseMap(MAPS.grassland));
    pf.computeMainPath();
    expect(pf.laneAt(0)).toEqual(pf.mainPath);
    expect(pf.laneAt(1)).toEqual(pf.mainPath);
  });

  it('deals a wave across every lane and leaves none idle', () => {
    // This is the rule GameScene.spawnEnemy applies: k-th spawn → lane k % n.
    const dealt = (count, spawns) => {
      const tally = new Array(count).fill(0);
      for (let k = 0; k < spawns; k += 1) tally[((k % count) + count) % count] += 1;
      return tally;
    };
    expect(dealt(3, 12)).toEqual([4, 4, 4]);
    expect(dealt(2, 9)).toEqual([5, 4]);
    // A boss wave: the titan takes the next lane in the same fixed order.
    expect(dealt(3, 1)).toEqual([1, 0, 0]);
    expect(dealt(3, 2)).toEqual([1, 1, 0]);
  });

  it('replays the same order on both seats of a duel', () => {
    const replay = () => {
      const seq = [];
      for (let wave = 1; wave <= 3; wave += 1) {
        for (let k = 0; k < 5; k += 1) seq.push(`w${wave}:${k % 3}`);
      }
      return seq;
    };
    expect(replay()).toEqual(replay());
  });
});

describe('lane direction arrows', () => {
  const lanesOf = (layout) => build(layout).lanes;
  const midOf = (a, b) => {
    const [ar, ac] = a.split(',').map(Number);
    const [br, bc] = b.split(',').map(Number);
    return { x: ((ac + bc) / 2) * TILE_SIZE + TILE_SIZE / 2, y: ((ar + br) / 2) * TILE_SIZE + TILE_SIZE / 2 };
  };
  const at = (arrow, point) => Math.abs(arrow.x - point.x) < 1e-6 && Math.abs(arrow.y - point.y) < 1e-6;

  it('paints a chevron layer between the tiles and the units', () => {
    expect(LANE_ARROW_DEPTH).toBeGreaterThan(3); // terrain tiles
    expect(LANE_ARROW_DEPTH).toBeLessThan(10); // portal + core platform
  });

  it('marks every lane', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const lanes = lanesOf(layout);
      const arrows = laneArrowAnchors(lanes, TILE_SIZE);
      lanes.forEach((lane, index) => {
        const marked = arrows.filter((arrow) =>
          lane.some((key, i) => i + 1 < lane.length && at(arrow, midOf(key, lane[i + 1])))
        );
        expect(marked.length, `${name} lane ${index + 1} has no arrows`).toBeGreaterThan(2);
      });
    }
  });

  it('points every chevron the way the horde walks', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const lanes = lanesOf(layout);
      const arrows = laneArrowAnchors(lanes, TILE_SIZE);
      for (const lane of lanes) {
        for (let i = 1; i + 1 < lane.length; i += 2) {
          const mid = midOf(lane[i], lane[i + 1]);
          const arrow = arrows.find((candidate) => at(candidate, mid));
          if (!arrow) continue; // that edge was already marked by another lane
          const [nr, nc] = lane[i + 1].split(',').map(Number);
          const dx = nc * TILE_SIZE + TILE_SIZE / 2 - arrow.x;
          const dy = nr * TILE_SIZE + TILE_SIZE / 2 - arrow.y;
          const dot = (arrow.tip.x - arrow.x) * dx + (arrow.tip.y - arrow.y) * dy;
          expect(dot, `${name} arrow between ${lane[i]} and ${lane[i + 1]} points backwards`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the gate clear and stamps every edge only once', () => {
    const lanes = lanesOf(MAPS.grassland);
    const arrows = laneArrowAnchors(lanes, TILE_SIZE);
    const coords = arrows.map((arrow) => `${arrow.x},${arrow.y}`);
    expect(new Set(coords).size, 'an edge was stamped twice').toBe(coords.length);

    const spawn = parseMap(MAPS.grassland).spawn;
    const gate = { x: spawn.col * TILE_SIZE + TILE_SIZE / 2, y: spawn.row * TILE_SIZE + TILE_SIZE / 2 };
    for (const arrow of arrows) {
      const distance = Math.hypot(arrow.x - gate.x, arrow.y - gate.y);
      expect(distance, 'an arrow sits on the gate tile').toBeGreaterThan(TILE_SIZE / 2);
    }
  });

  it('gives a forked cell one arrow per exit instead of one muddled marker', () => {
    // Two lanes leave the same cell in different directions. Because the marker
    // sits on the edge between cells, each exit keeps its own chevron.
    const lanes = [
      ['9,4', '9,5', '9,6', '9,7'],
      ['9,4', '9,5', '8,5', '8,6'],
    ];
    const arrows = laneArrowAnchors(lanes, TILE_SIZE);
    const has = (a, b) => arrows.some((arrow) => at(arrow, midOf(a, b)));
    expect(has('9,5', '9,6')).toBe(true); // east out of the fork
    expect(has('9,5', '8,5')).toBe(true); // north out of the same cell
    const east = arrows.find((arrow) => at(arrow, midOf('9,5', '9,6')));
    const north = arrows.find((arrow) => at(arrow, midOf('9,5', '8,5')));
    expect(east.angle).not.toBeCloseTo(north.angle);
    expect(east.x).not.toBeCloseTo(north.x);
  });

  it('drops near-identical routes instead of padding the count', () => {
    // A grid of roads offers corner-cut twins that differ by a cell; asking for
    // barely-distinct lanes must fall back to a single route, not three.
    const pf = new PathfindingSystem(parseMap(MAPS.grassland));
    expect(pf.computeLanes({ minDifference: 0.95 })).toHaveLength(1);
    const again = new PathfindingSystem(parseMap(MAPS.grassland));
    expect(again.computeLanes()).toHaveLength(3);
  });

  it('draws two triangles per arrow — a dark keyline and the warm chevron', () => {
    const lanes = lanesOf(MAPS.grassland);
    const expected = laneArrowAnchors(lanes, TILE_SIZE).length;
    const calls = { styles: [], triangles: [] };
    const recorder = {
      fillStyle: (color, alpha) => calls.styles.push([color, alpha]),
      fillTriangle: (...points) => calls.triangles.push(points),
    };
    const drawn = paintLaneArrows(recorder, lanes, TILE_SIZE);
    expect(drawn).toBe(expected);
    expect(calls.styles).toHaveLength(expected * 2);
    expect(calls.triangles).toHaveLength(expected * 2);
    // Keyline first, chevron second, and the chevron sits 1.5 px up-left of it.
    expect(calls.styles[1]).toEqual([0xffe6a3, 0.72]);
    for (let i = 0; i < calls.triangles.length; i += 2) {
      const shade = calls.triangles[i];
      const chevron = calls.triangles[i + 1];
      expect(shade[0] - chevron[0]).toBeCloseTo(1.5);
      expect(shade[1] - chevron[1]).toBeCloseTo(1.5);
    }
  });

  it('spaces the chevrons two cells apart on a straight lane', () => {
    expect(LANE_ARROW_STEP).toBe(2);
    const lane = ['5,2', '5,3', '5,4', '5,5', '5,6', '5,7', '5,8'];
    const arrows = laneArrowAnchors([lane], TILE_SIZE);
    expect(arrows).toHaveLength(3); // edges 1-2, 3-4, 5-6
    expect(arrows.map((arrow) => arrow.x)).toEqual([4 * TILE_SIZE, 6 * TILE_SIZE, 8 * TILE_SIZE]);
    for (const arrow of arrows) {
      expect(arrow.angle).toBeCloseTo(0);
      expect(arrow.tip.x).toBeGreaterThan(arrow.x); // pointing east, the way the lane runs
    }
  });

  it('survives a map with no lanes at all', () => {
    expect(laneArrowAnchors([], TILE_SIZE)).toEqual([]);
    expect(laneArrowAnchors([['1,1', '1,2']], TILE_SIZE)).toEqual([]);
    expect(paintLaneArrows(null, [], TILE_SIZE)).toBe(0);
    expect(paintLaneArrows({ fillTriangle() {} }, [['1,1', '1,2']], TILE_SIZE)).toBe(0);
  });
});
