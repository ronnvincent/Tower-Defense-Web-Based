import { buildGridGraph, cellKey } from '../dsa/Graph.js';
import { bfsShortestPath } from '../dsa/BFS.js';
import { isWalkableTile } from '../data/mapData.js';

/**
 * PathfindingSystem — connects the map, the Graph and BFS to gameplay.
 *
 * Responsibilities:
 *   1. Build the walkable-cell graph from the parsed map (once, on load).
 *   2. Run BFS spawn → base to obtain the enemies' route, and validate it
 *      before the first wave (the scene refuses to start if no path exists).
 *   3. Record real statistics for every BFS run (last run + cumulative).
 *
 * ### Why barricades are *not* part of the graph any more
 * A palisade used to remove its node from the graph so BFS had to route around
 * it. Play-testing showed that this is the opposite of what a wall should do:
 * the horde simply took another lane and the player never saw the palisade do
 * anything. Barricades are now solid *physical* obstacles instead — the route
 * stays the shortest road route and every enemy that meets a wall stops and
 * breaks it down (see `Enemy.updateSiege`). The graph therefore describes the
 * road network, not the walls standing on it.
 *
 * BFS is NOT run every frame — only on load (and whenever the scene asks for a
 * fresh route, e.g. after a wave).
 */
export class PathfindingSystem {
  /** @param {{rows:number, cols:number, tiles:string[][], spawn:{row,col}, base:{row,col}}} map */
  constructor(map) {
    this.map = map;
    this.graph = buildGridGraph(map.rows, map.cols, (r, c) => isWalkableTile(map.tiles[r][c]));
    this.spawnKey = cellKey(map.spawn.row, map.spawn.col);
    this.baseKey = cellKey(map.base.row, map.base.col);

    this.mainPath = [];
    this.lastMainResult = null; // full BFS result of the latest spawn → base search
    this.lastRun = null; // stats of the most recent BFS run of any kind
    this.cumulative = { runs: 0, nodesVisited: 0, nodesExplored: 0, neighborChecks: 0, timeMs: 0, failedRuns: 0 };
  }

  /** Run BFS and record its statistics. */
  #search(start, goal, options, purpose) {
    const result = bfsShortestPath(this.graph, start, goal, options);
    const s = result.stats;
    this.cumulative.runs++;
    this.cumulative.nodesVisited += s.nodesVisited;
    this.cumulative.nodesExplored += s.nodesExplored;
    this.cumulative.neighborChecks += s.neighborChecks;
    this.cumulative.timeMs += s.timeMs;
    if (!result.found) this.cumulative.failedRuns++;
    this.lastRun = { ...s, found: result.found, purpose, start, goal };
    return result;
  }

  /** Compute (or recompute) the spawn → base route. */
  computeMainPath() {
    const result = this.#search(this.spawnKey, this.baseKey, {}, 'spawn → base');
    this.lastMainResult = result;
    this.mainPath = result.found ? result.path : [];
    return result;
  }

  /** Shortest route from any walkable cell to the base. */
  pathToBase(startKey, purpose = 'route to base') {
    return this.#search(startKey, this.baseKey, {}, purpose);
  }

  /** True when a cell belongs to the walkable road network. */
  isRoad(key) {
    return this.graph.hasNode(key);
  }

  /** Length in cells of the current enemy route (0 when the map is cut). */
  get routeLength() {
    return this.mainPath.length;
  }
}
