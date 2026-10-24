import { buildGridGraph, cellKey, parseCellKey, restoreGridNode } from '../dsa/Graph.js';
import { bfsShortestPath } from '../dsa/BFS.js';
import { isWalkableTile } from '../data/mapData.js';

/**
 * PathfindingSystem — connects the map, the Graph and BFS to gameplay.
 *
 * Responsibilities:
 *   1. Build the walkable-cell graph from the parsed map (once, on load).
 *   2. Run BFS spawn → base to obtain the enemies' route, and validate it
 *      before the first wave (the scene refuses to start if no path exists).
 *   3. Barricades: test a candidate road tile with a temporary `blocked` set.
 *      The barricade is accepted only if BFS still finds a path from the spawn
 *      AND from every living enemy's position. On success the node is removed
 *      from the graph and new routes are returned for rerouting enemies.
 *   4. Record real statistics for every BFS run (last run + cumulative).
 *
 * BFS is NOT run every frame — only on load, on barricade placement/removal,
 * and when the BFS visualiser is requested (which reuses the stored result).
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
    this.blockedCells = new Set(); // cells removed by barricades
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

  /** Shortest path from any walkable cell to the base (used for rerouting). */
  pathToBase(startKey, purpose = 'reroute') {
    return this.#search(startKey, this.baseKey, {}, purpose);
  }

  isBlocked(key) {
    return this.blockedCells.has(key);
  }

  /**
   * Try to block a road cell with a barricade.
   *
   * @param {string} key cell to block
   * @param {Array<{id:number, startKey:string}>} enemyStarts the cell each living enemy is heading to
   * @returns {{ok:true, enemyPaths:Map<number,string[]>} | {ok:false, reason:string}}
   */
  tryBlockCell(key, enemyStarts) {
    if (key === this.spawnKey || key === this.baseKey) return { ok: false, reason: 'endpoint' };
    if (!this.graph.hasNode(key)) return { ok: false, reason: 'not-walkable' };

    const blocked = new Set([key]);

    // 1) The spawn must still reach the base.
    const spawnResult = this.#search(this.spawnKey, this.baseKey, { blocked }, 'barricade check: spawn');
    if (!spawnResult.found) return { ok: false, reason: 'blocks-path' };

    // 2) Every living enemy must still reach the base. Enemies heading to the
    //    same cell share one BFS result (small cache keyed by start cell).
    const cache = new Map();
    const enemyPaths = new Map();
    for (const { id, startKey } of enemyStarts) {
      if (startKey === key) return { ok: false, reason: 'enemy-on-tile' };
      let path = cache.get(startKey);
      if (path === undefined) {
        const r = this.#search(startKey, this.baseKey, { blocked }, 'barricade check: enemy');
        path = r.found ? r.path : null;
        cache.set(startKey, path);
      }
      if (path === null) return { ok: false, reason: 'traps-enemy' };
      enemyPaths.set(id, path);
    }

    // 3) Commit: remove the node from the graph and store the new main route.
    this.graph.removeNode(key);
    this.blockedCells.add(key);
    this.lastMainResult = spawnResult;
    this.mainPath = spawnResult.path;
    return { ok: true, enemyPaths };
  }

  /**
   * Re-open a previously blocked cell (barricade sold) and return fresh routes.
   * @returns {Map<number, string[]>} new path for every enemy
   */
  unblockCell(key, enemyStarts) {
    if (!this.blockedCells.has(key)) return new Map();
    const { row, col } = this.graph.getNodeData(key) ?? parseCellKey(key);
    restoreGridNode(this.graph, row, col);
    this.blockedCells.delete(key);
    this.computeMainPath();

    const cache = new Map();
    const enemyPaths = new Map();
    for (const { id, startKey } of enemyStarts) {
      let path = cache.get(startKey);
      if (path === undefined) {
        const r = this.pathToBase(startKey, 'reroute after sell');
        path = r.found ? r.path : null;
        cache.set(startKey, path);
      }
      if (path) enemyPaths.set(id, path);
    }
    return enemyPaths;
  }
}
