import { describe, it, expect } from 'vitest';
import { Graph, buildGridGraph, cellKey, restoreGridNode } from '../src/dsa/Graph.js';
import { bfsShortestPath } from '../src/dsa/BFS.js';
import { parseMap, isWalkableTile, MAP_LAYOUT } from '../src/data/mapData.js';
import { ARENA } from '../src/data/arenaLayout.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';

/** Build a graph from a small ASCII grid where '#' is walkable. */
function gridGraph(lines) {
  return buildGridGraph(lines.length, lines[0].length, (r, c) => lines[r][c] === '#');
}

describe('Graph (adjacency list)', () => {
  it('adds nodes and undirected edges without duplicates', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addEdge('a', 'b');
    g.addEdge('b', 'a'); // duplicate
    expect(g.getNeighbors('a')).toEqual(['b']);
    expect(g.getNeighbors('b')).toEqual(['a']);
    expect(g.edgeCount()).toBe(1);
  });

  it('removeNode deletes the node and every edge touching it', () => {
    const g = gridGraph(['###']);
    g.removeNode(cellKey(0, 1));
    expect(g.hasNode('0,1')).toBe(false);
    expect(g.getNeighbors('0,0')).toEqual([]);
    expect(g.getNeighbors('0,2')).toEqual([]);
  });

  it('builds 4-directional edges only between walkable cells', () => {
    const g = gridGraph(['##.', '.#.', '.##']);
    expect(g.nodeCount()).toBe(5);
    expect(g.edgeCount()).toBe(4);
    expect(g.getNeighbors('1,1').sort()).toEqual(['0,1', '2,1']);
  });

  it('restoreGridNode reconnects a removed cell', () => {
    const g = gridGraph(['###']);
    g.removeNode('0,1');
    restoreGridNode(g, 0, 1);
    expect(g.getNeighbors('0,1').sort()).toEqual(['0,0', '0,2']);
    expect(g.edgeCount()).toBe(2);
  });
});

describe('BFS shortest path', () => {
  it('finds the shortest path and reconstructs it from start to goal', () => {
    // Two routes from (0,0) to (0,4): top straight (4 steps) vs bottom loop (8 steps)
    const g = gridGraph(['#####', '#...#', '#####']);
    const res = bfsShortestPath(g, '0,0', '0,4');
    expect(res.found).toBe(true);
    expect(res.path).toEqual(['0,0', '0,1', '0,2', '0,3', '0,4']);
    expect(res.stats.pathNodes).toBe(5);
    expect(res.stats.pathEdges).toBe(4);
  });

  it('every consecutive pair in the path is an edge of the graph', () => {
    const g = gridGraph(['#.###', '#.#.#', '###.#']);
    const res = bfsShortestPath(g, '0,0', '0,4');
    expect(res.found).toBe(true);
    for (let i = 1; i < res.path.length; i++) {
      expect(g.getNeighbors(res.path[i - 1])).toContain(res.path[i]);
    }
  });

  it('returns found=false with reason "unreachable" when no path exists', () => {
    const g = gridGraph(['##.##']);
    const res = bfsShortestPath(g, '0,0', '0,4');
    expect(res.found).toBe(false);
    expect(res.reason).toBe('unreachable');
    expect(res.path).toEqual([]);
    expect(res.stats.nodesVisited).toBe(2); // only the left island is explored
  });

  it('handles missing start/goal nodes without throwing', () => {
    const g = gridGraph(['###']);
    expect(bfsShortestPath(g, '9,9', '0,2').reason).toBe('start-missing');
    expect(bfsShortestPath(g, '0,0', '9,9').reason).toBe('goal-missing');
  });

  it('start equal to goal returns a single-node path', () => {
    const g = gridGraph(['###']);
    const res = bfsShortestPath(g, '0,1', '0,1');
    expect(res.found).toBe(true);
    expect(res.path).toEqual(['0,1']);
    expect(res.stats.pathEdges).toBe(0);
  });

  it('respects a temporary blocked set without modifying the graph', () => {
    const g = gridGraph(['#####', '#...#', '#####']);
    const res = bfsShortestPath(g, '0,0', '0,4', { blocked: new Set(['0,2']) });
    expect(res.found).toBe(true);
    expect(res.path).not.toContain('0,2');
    expect(res.stats.pathEdges).toBe(8);
    expect(g.hasNode('0,2')).toBe(true);
  });

  it('terminates on graphs with cycles and visits each node at most once', () => {
    const g = gridGraph(['####', '####', '####']); // fully connected 3x4 block with many cycles
    const res = bfsShortestPath(g, '0,0', '2,3');
    expect(res.found).toBe(true);
    expect(res.stats.nodesVisited).toBeLessThanOrEqual(g.nodeCount());
    expect(res.stats.pathEdges).toBe(5); // Manhattan distance
  });

  it('collects consistent statistics', () => {
    const g = gridGraph(['#####']);
    const res = bfsShortestPath(g, '0,0', '0,4');
    expect(res.stats.nodesVisited).toBe(5);
    expect(res.stats.nodesExplored).toBe(5);
    // neighbor checks = sum of degrees of the explored nodes = 1+2+2+2 (goal is not expanded)
    expect(res.stats.neighborChecks).toBe(7);
    expect(res.visitOrder).toEqual(['0,0', '0,1', '0,2', '0,3', '0,4']);
    expect(res.stats.timeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Game map + PathfindingSystem', () => {
  const map = parseMap(MAP_LAYOUT);
  // The arena grammar is generated (see src/data/arenaLayout.js): 26 columns so
  // the two gates and three crossings have room, portal on row 2, bastion on
  // row 9 and the river on row 5 between them. Every cell below is derived from
  // the board itself — a hand-typed coordinate would rot the moment a map moved.
  const SPAWN = `${ARENA.portalRow},${ARENA.axisCol}`;
  const BASE = `${ARENA.baseRow},${ARENA.axisCol}`;

  it('parses the generated arena with one spawn and one base', () => {
    expect(map.cols).toBe(ARENA.cols);
    expect(map.rows).toBe(ARENA.rows);
    expect(map.spawn).toEqual({ row: ARENA.portalRow, col: ARENA.axisCol });
    expect(map.base).toEqual({ row: ARENA.baseRow, col: ARENA.axisCol });
    // Both gates keep a full row of terrain between them and the frame — see
    // tests/map-margin.test.js.
    expect(map.spawn.row).toBeGreaterThan(1);
    expect(map.base.row).toBeLessThan(map.rows - 1);
  });

  it('rejects malformed layouts', () => {
    expect(() => parseMap(['S#', '#'])).toThrow();
    expect(() => parseMap(['S#?B'])).toThrow();
    expect(() => parseMap(['.##B'])).toThrow(/spawn/);
  });

  it('finds a short route from the portal to the bastion on the real map', () => {
    const pf = new PathfindingSystem(map);
    const res = pf.computeMainPath();
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe(SPAWN);
    expect(res.path[res.path.length - 1]).toBe(BASE);
    // A lane crosses the river exactly once and walks the length of the board.
    expect(res.stats.pathNodes).toBeGreaterThanOrEqual(15);
    expect(res.path.filter((key) => key.startsWith(`${ARENA.riverRow},`)).length).toBe(1);
    for (const key of res.path) {
      const [r, c] = key.split(',').map(Number);
      expect(isWalkableTile(map.tiles[r][c])).toBe(true);
    }
  });

  it('keeps the palisade out of the graph so the horde can never dodge it', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();
    // The road directly under the portal is the tile a player walls off.
    const underPortal = `${ARENA.portalRow + 1},${ARENA.axisCol}`;
    expect(pf.isRoad(underPortal)).toBe(true);
    const nodes = pf.graph.nodeCount();
    pf.computeMainPath();
    expect(pf.graph.nodeCount()).toBe(nodes);
    expect(pf.mainPath).toContain(underPortal);
  });

  it('routes through the other bridge when one is blocked', () => {
    const pf = new PathfindingSystem(map);
    const direct = pf.computeMainPath();
    const bridgeOf = (path) => path.find((key) => key.startsWith(`${ARENA.riverRow},`));
    const firstBridge = bridgeOf(direct.path);
    const [bRow, bCol] = firstBridge.split(',').map(Number);
    // A keep dropped on the landing short of that bridge closes it; the horde
    // takes the other crossing rather than walking through the keep.
    pf.setBlocked([`${bRow - 1},${bCol}`]);
    const detour = pf.computeMainPath();
    expect(detour.found).toBe(true);
    expect(detour.path).not.toContain(`${bRow - 1},${bCol}`);
    expect(bridgeOf(detour.path)).not.toBe(firstBridge);
    expect(detour.path.length).toBeGreaterThanOrEqual(direct.path.length);
    expect(pf.hasRoute()).toBe(true);
    pf.setBlocked([]);
    expect(pf.computeMainPath().path).toContain(`${bRow - 1},${bCol}`);
  });

  it('reports no route when the bastion is walled in', () => {
    const pf = new PathfindingSystem(map);
    // Seal the gate approach: the one road cell above the bastion.
    const gateApproach = `${ARENA.baseRow - 1},${ARENA.axisCol}`;
    pf.setBlocked([gateApproach]);
    expect(pf.hasRoute()).toBe(false);
    expect(pf.computeMainPath().found).toBe(false);
    expect(pf.computeLanes({ max: 3 })).toEqual([]);
  });

  it('runs BFS from any road cell to the base and records the run', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();
    const fromLane = pf.mainPath[3];
    const res = pf.pathToBase(fromLane, 'route test');
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe(fromLane);
    expect(res.path[res.path.length - 1]).toBe(pf.baseKey);
    expect(pf.lastRun.purpose).toBe('route test');
    expect(pf.cumulative.runs).toBe(2);
    expect(pf.cumulative.nodesVisited).toBeGreaterThan(0);
  });

  it('records cumulative BFS statistics across runs', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();
    pf.pathToBase('3,8');
    expect(pf.cumulative.runs).toBe(2);
    expect(pf.cumulative.nodesVisited).toBeGreaterThan(0);
    expect(pf.lastRun.start).toBe('3,8');
    expect(pf.routeLength).toBeGreaterThan(0);
  });
});
