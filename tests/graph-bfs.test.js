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
  // The field grammar is generated (see src/data/arenaLayout.js): 32 columns,
  // three ground portals on row 1 and one bastion on the bottom-centre column
  // of row 10. Every cell below is derived from the board itself — a hand-typed
  // coordinate would rot the moment a map moved.
  const SPAWN = `${map.spawn.row},${map.spawn.col}`;
  const BASE = `${ARENA.baseRow},${ARENA.axisCol}`;

  it('parses the generated field with three portals and one base', () => {
    expect(map.cols).toBe(ARENA.cols);
    expect(map.rows).toBe(ARENA.rows);
    // The board is attacked from three directions, so it ships three portals.
    expect(map.spawns).toHaveLength(3);
    for (const spawn of map.spawns) expect(spawn.row).toBe(ARENA.portalRow);
    expect(map.spawn).toEqual(map.spawns[0]);
    expect(map.base).toEqual({ row: ARENA.baseRow, col: ARENA.axisCol });
    // The portals keep a rim row above them and the bastion keeps one below it.
    expect(map.spawn.row).toBeGreaterThan(0);
    expect(map.base.row).toBeLessThan(map.rows - 1);
  });

  it('rejects malformed layouts', () => {
    expect(() => parseMap(['S#', '#'])).toThrow();
    expect(() => parseMap(['S#?B'])).toThrow();
    expect(() => parseMap(['.##B'])).toThrow(/spawn/);
  });

  it('finds a short route from every portal to the bastion on the real map', () => {
    const pf = new PathfindingSystem(map);
    const res = pf.computeMainPath();
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe(SPAWN);
    expect(res.path[res.path.length - 1]).toBe(BASE);
    // A lane walks from the top row of the field to the bastion row.
    expect(res.stats.pathNodes).toBeGreaterThanOrEqual(10);
    for (const key of res.path) {
      const [r, c] = key.split(',').map(Number);
      expect(isWalkableTile(map.tiles[r][c])).toBe(true);
    }
    // ...and every other portal has its own way in, too.
    const lanes = pf.computeLanes();
    expect(lanes).toHaveLength(map.spawns.length);
    for (const lane of lanes) expect(lane[lane.length - 1]).toBe(BASE);
  });

  it('keeps the palisade out of the graph so the horde can never dodge it', () => {
    const pf = new PathfindingSystem(map);
    const lanes = pf.computeLanes();
    // The road directly under a portal is the tile a player walls off.
    const underPortal = `${ARENA.portalRow + 1},${map.spawn.col}`;
    expect(pf.isRoad(underPortal)).toBe(true);
    const nodes = pf.graph.nodeCount();
    pf.computeLanes();
    expect(pf.graph.nodeCount()).toBe(nodes);
    expect(lanes.some((lane) => lane.includes(underPortal))).toBe(true);
  });

  it('reports every portal unreachable the moment a road is cut', () => {
    const pf = new PathfindingSystem(map);
    const lanes = pf.computeLanes();
    expect(pf.hasRoute()).toBe(true);
    // The roads are single-cell staircases, so a block anywhere on one of them
    // cuts that approach — which is exactly why a defence may never stand on a
    // road tile (`PlacementSystem` refuses it before the check can happen).
    const blocked = lanes[0][3];
    pf.setBlocked([blocked]);
    expect(pf.computeMainPath().found).toBe(false);
    expect(pf.hasRoute()).toBe(false);
    pf.setBlocked([]);
    expect(pf.hasRoute()).toBe(true);
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
