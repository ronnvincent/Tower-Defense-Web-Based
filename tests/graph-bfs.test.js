import { describe, it, expect } from 'vitest';
import { Graph, buildGridGraph, cellKey, restoreGridNode } from '../src/dsa/Graph.js';
import { bfsShortestPath } from '../src/dsa/BFS.js';
import { parseMap, isWalkableTile, MAP_LAYOUT } from '../src/data/mapData.js';
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

  it('parses a 20×12 map with one spawn and one base', () => {
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(12);
    expect(map.spawn).toEqual({ row: 5, col: 0 });
    expect(map.base).toEqual({ row: 5, col: 19 });
  });

  it('rejects malformed layouts', () => {
    expect(() => parseMap(['S#', '#'])).toThrow();
    expect(() => parseMap(['S#?B'])).toThrow();
    expect(() => parseMap(['.##B'])).toThrow(/spawn/);
  });

  it('finds the 24-cell middle route on the real map', () => {
    const pf = new PathfindingSystem(map);
    const res = pf.computeMainPath();
    expect(res.found).toBe(true);
    expect(res.path[0]).toBe('5,0');
    expect(res.path[res.path.length - 1]).toBe('5,19');
    expect(res.stats.pathNodes).toBe(24);
    for (const key of res.path) {
      const [r, c] = key.split(',').map(Number);
      expect(isWalkableTile(map.tiles[r][c])).toBe(true);
    }
  });

  it('keeps the palisade out of the graph so the horde can never dodge it', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();

    // 7,9 is a middle-lane road cell — the exact tile a player would wall off.
    expect(pf.isRoad('7,9')).toBe(true);
    expect(pf.graph.hasNode('7,9')).toBe(true);
    expect(pf.mainPath).toContain('7,9');

    // The old design removed the node and pushed BFS onto the 28-cell north
    // route. That "detour" is precisely the dodge the redesign removed: the
    // graph is untouched, so every enemy keeps walking into the wall and has
    // to break it (Enemy.updateSiege) before it can use the road again.
    pf.computeMainPath();
    expect(pf.mainPath.length).toBe(24);
    expect(pf.mainPath).toContain('7,9');
    expect(pf.graph.hasNode('7,9')).toBe(true);
  });

  it('still measures the hypothetical detour at the BFS level', () => {
    // Kept as documentation of the graph-cut concept: if a wall *were* solid
    // to BFS the middle lane would cost 4 extra cells. The game uses this only
    // in the algorithm panel/visualiser, never to steer enemies.
    const pf = new PathfindingSystem(map);
    const direct = pf.computeMainPath();
    const detour = bfsShortestPath(pf.graph, pf.spawnKey, pf.baseKey, { blocked: new Set(['7,9']) });
    expect(direct.stats.pathNodes).toBe(24);
    expect(detour.found).toBe(true);
    expect(detour.stats.pathNodes).toBe(28);
    expect(detour.path).toContain('1,10');
    expect(pf.graph.hasNode('7,9')).toBe(true); // the blocked set is temporary
  });

  it('runs BFS from any road cell to the base and records the run', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();
    const fromNorthLane = pf.pathToBase('1,10', 'route test');
    expect(fromNorthLane.found).toBe(true);
    expect(fromNorthLane.path[0]).toBe('1,10');
    expect(fromNorthLane.path[fromNorthLane.path.length - 1]).toBe(pf.baseKey);
    expect(pf.lastRun.purpose).toBe('route test');
    expect(pf.cumulative.runs).toBe(2);
    expect(pf.cumulative.nodesVisited).toBeGreaterThan(0);
  });

  it('records cumulative BFS statistics across runs', () => {
    const pf = new PathfindingSystem(map);
    pf.computeMainPath();
    pf.pathToBase('5,2');
    expect(pf.cumulative.runs).toBe(2);
    expect(pf.cumulative.nodesVisited).toBeGreaterThan(0);
    expect(pf.lastRun.start).toBe('5,2');
    expect(pf.routeLength).toBe(24);
  });
});
