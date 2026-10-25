import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAPS, parseMap, isWalkableTile } from '../src/data/mapData.js';
import { PVP_ARENAS } from '../src/data/pvpArenas.js';
import { PathfindingSystem, laneIndexForWave } from '../src/systems/PathfindingSystem.js';
import {
  LANE_ARROW_DEPTH,
  LANE_HINT_STEPS,
  laneHintAnchors,
  laneLabel,
  paintLaneHint,
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
  it('covers the campaign maps, the War Room battlefields and every duel arena', () => {
    // 5 campaign stages + 10 War Room layouts + 3 duel arenas. The War Room
    // layouts are held to the same contract as the campaign set: if a mode's
    // map had one lane or a lane that never reaches the core, this fails.
    expect(BATTLEFIELDS).toHaveLength(18);
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

describe('one lane per wave', () => {
  it('files a whole wave down a single road and rotates on the next one', () => {
    // Wave 1 → lane 0, wave 2 → lane 1, wave 3 → lane 2, wave 4 → lane 0 …
    expect([1, 2, 3, 4, 5, 6].map((wave) => laneIndexForWave(wave, 3))).toEqual([0, 1, 2, 0, 1, 2]);
    expect([1, 2, 3, 4].map((wave) => laneIndexForWave(wave, 2))).toEqual([0, 1, 0, 1]);
    expect(laneIndexForWave(7, 1)).toBe(0);
    expect(laneIndexForWave(0, 3)).toBe(0);
    expect(laneIndexForWave(9, 0)).toBe(0);
  });

  it('deals every enemy of a wave — boss included — onto the same lane', () => {
    // This is the rule GameScene.spawnEnemy applies: the lane never varies
    // inside a wave, whatever the spawn order is.
    const laneOf = (wave) => laneIndexForWave(wave, 3);
    const wave = 2;
    const spawns = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(new Set(spawns.map(() => laneOf(wave)))).toEqual(new Set([1]));
    // …and the next wave really is a different road.
    expect(laneOf(wave + 1)).not.toBe(laneOf(wave));
  });

  it('reaches every lane of every battlefield over a run', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const { lanes } = build(layout);
      const used = new Set();
      for (let wave = 1; wave <= 10; wave += 1) used.add(laneIndexForWave(wave, lanes.length));
      expect(used.size, `${name} never uses one of its lanes`).toBe(lanes.length);
    }
  });

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

  it('replays the same order on both seats of a duel', () => {
    const replay = () => {
      const seq = [];
      for (let wave = 1; wave <= 10; wave += 1) seq.push(`w${wave}:${laneIndexForWave(wave, 3)}`);
      return seq;
    };
    expect(replay()).toEqual(replay());
    expect(replay()[0]).toBe('w1:0');
    expect(replay()[1]).toBe('w2:1');
  });
});

describe('lane entrance hint', () => {
  const lanesOf = (layout) => build(layout).lanes;
  const midOf = (a, b) => {
    const [ar, ac] = a.split(',').map(Number);
    const [br, bc] = b.split(',').map(Number);
    return { x: ((ac + bc) / 2) * TILE_SIZE + TILE_SIZE / 2, y: ((ar + br) / 2) * TILE_SIZE + TILE_SIZE / 2 };
  };
  const at = (arrow, point) => Math.abs(arrow.x - point.x) < 1e-6 && Math.abs(arrow.y - point.y) < 1e-6;

  it('paints a hint layer between the tiles and the units', () => {
    expect(LANE_ARROW_DEPTH).toBeGreaterThan(3); // terrain tiles
    expect(LANE_ARROW_DEPTH).toBeLessThan(10); // portal + core platform
  });

  it('marks the entrance of the wave lane only, not the whole road', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      const lanes = lanesOf(layout);
      for (const lane of lanes) {
        const marks = laneHintAnchors(lane, TILE_SIZE);
        expect(marks.length, `${name} has no entrance marker`).toBeGreaterThan(1);
        // Every chevron sits on one of the first LANE_HINT_STEPS edges.
        marks.forEach((arrow) => {
          const index = lane.findIndex((key, i) => i > 0 && at(arrow, midOf(lane[i - 1], key)));
          expect(index, `${name} marked an edge past the entrance`).toBeLessThanOrEqual(
            LANE_HINT_STEPS + 1
          );
          expect(index).toBeGreaterThan(0);
        });
        // The far end of the road — the core approach — stays bare.
        const tail = lane.slice(Math.floor(lane.length / 2));
        tail.forEach((key, i) => {
          if (i === 0 || i + 1 >= tail.length) return;
          expect(marks.some((arrow) => at(arrow, midOf(tail[i - 1], key)))).toBe(false);
        });
      }
    }
  });

  it('points every chevron the way the horde walks', () => {
    for (const [name, layout] of BATTLEFIELDS) {
      for (const lane of lanesOf(layout)) {
        for (const arrow of laneHintAnchors(lane, TILE_SIZE)) {
          const index = lane.findIndex((key, i) => i > 0 && at(arrow, midOf(lane[i - 1], key)));
          if (index < 0) continue;
          const [nr, nc] = lane[index].split(',').map(Number);
          const dx = nc * TILE_SIZE + TILE_SIZE / 2 - arrow.x;
          const dy = nr * TILE_SIZE + TILE_SIZE / 2 - arrow.y;
          const dot = (arrow.tip.x - arrow.x) * dx + (arrow.tip.y - arrow.y) * dy;
          expect(dot, `${name} hint arrow near ${lane[index]} points backwards`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('draws a beacon on the gate and two triangles per chevron', () => {
    const lanes = lanesOf(MAPS.grassland);
    const lane = lanes[0];
    const expected = laneHintAnchors(lane, TILE_SIZE).length;
    const calls = { styles: [], triangles: [], circles: [], lines: [] };
    const recorder = {
      fillStyle: (color, alpha) => calls.styles.push([color, alpha]),
      fillTriangle: (...points) => calls.triangles.push(points),
      strokeCircle: (x, y, r) => calls.circles.push({ x, y, r }),
      lineStyle: (width, color, alpha) => calls.lines.push([width, color, alpha]),
    };
    const drawn = paintLaneHint(recorder, lane, TILE_SIZE);
    expect(drawn).toBe(expected);
    expect(calls.triangles).toHaveLength(expected * 2);
    expect(calls.circles).toHaveLength(2); // outer ring + inner ring
    // The beacon sits on the gate tile, where the portal sprite is.
    const gate = parseMap(MAPS.grassland).spawn;
    expect(calls.circles[0].x).toBeCloseTo(gate.col * TILE_SIZE + TILE_SIZE / 2);
    expect(calls.circles[0].y).toBeCloseTo(gate.row * TILE_SIZE + TILE_SIZE / 2);
    expect(calls.circles[0].r).toBeGreaterThan(calls.circles[1].r);
    // Dark keyline first, warm chevron second.
    expect(calls.styles[1]).toEqual([0xffe6a3, 0.8]);
  });

  it('keeps the chevrons short and spaced a cell apart', () => {
    const lane = ['5,2', '5,3', '5,4', '5,5', '5,6', '5,7', '5,8', '5,9'];
    const arrows = laneHintAnchors(lane, TILE_SIZE);
    expect(arrows).toHaveLength(LANE_HINT_STEPS);
    expect(arrows.map((arrow) => arrow.x)).toEqual([
      4 * TILE_SIZE,
      5 * TILE_SIZE,
      6 * TILE_SIZE,
      7 * TILE_SIZE,
    ]);
    for (const arrow of arrows) {
      expect(arrow.angle).toBeCloseTo(0);
      expect(arrow.tip.x).toBeGreaterThan(arrow.x); // pointing the way the lane runs
    }
  });

  it('names a lane by where it leaves the shortest route', () => {
    // Ice forks three ways at the same cell: middle, up and down.
    const ice = lanesOf(MAPS.ice);
    const labels = ice.map((_, index) => laneLabel(ice, index));
    expect(labels[0]).toBe('CENTRE');
    expect(labels).toContain('UPPER');
    expect(labels).toContain('LOWER');
    expect(new Set(labels).size).toBe(3);
    for (const [name, layout] of BATTLEFIELDS) {
      const lanes = lanesOf(layout);
      lanes.forEach((_, index) => {
        expect(['CENTRE', 'UPPER', 'LOWER', 'LEFT', 'RIGHT'], name).toContain(laneLabel(lanes, index));
      });
    }
    expect(laneLabel([], 0)).toBe('CENTRE');
  });

  it('survives a map with no lanes at all', () => {
    expect(laneHintAnchors([], TILE_SIZE)).toEqual([]);
    expect(laneHintAnchors([['1,1', '1,2']], TILE_SIZE)).toEqual([]);
    expect(paintLaneHint(null, [], TILE_SIZE)).toBe(0);
    expect(paintLaneHint({ fillTriangle() {} }, ['1,1'], TILE_SIZE)).toBe(0);
  });
});

describe('scene wiring', () => {
  const source = readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');
  const body = (name) => {
    const start = source.indexOf(`  ${name}(`);
    expect(start, `${name} is missing from GameScene`).toBeGreaterThan(-1);
    return source.slice(start, start + 4000);
  };

  it('spawns every enemy — boss included — on the wave lane', () => {
    const spawn = body('spawnEnemy');
    expect(spawn).toContain('this.pathfinding.laneAt(this.laneIndexForWave(waveNumber))');
    expect(spawn).toMatch(/new Enemy\(this, typeKey, waveNumber, lane,/);
  });

  it('moves the hint when a wave opens', () => {
    expect(body('openWave')).toContain('this.setWaveLane(wave)');
  });

  it('never paints arrows over the whole road network', () => {
    for (const file of ['src/scenes/GameScene.js', 'src/systems/LaneArrows.js']) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(text).not.toContain('paintLaneArrows');
      expect(text).not.toContain('laneArrowAnchors');
    }
    expect(source).toContain('paintLaneHint');
  });

  it('paints the result card before reporting to the room', () => {
    // Reporting first let the host's synchronous resolution paint the verdict
    // and then the half-time card paint over it: the freeze players hit.
    const finish = body('finishDuel');
    const showAt = finish.indexOf('window.gameDuelResult?.show');
    const reportAt = finish.indexOf('window.gamePvp?.reportSeat');
    expect(showAt).toBeGreaterThan(-1);
    expect(reportAt).toBeGreaterThan(showAt);
    expect(finish).toContain('if (this.duelReported) return this.lastDuel;');
    expect(finish).toContain('pauseBattle');
  });
});
