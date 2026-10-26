import { buildGridGraph, cellKey } from '../dsa/Graph.js';
import { bfsShortestPath, edgeKey } from '../dsa/BFS.js';
import { isWalkableTile } from '../data/mapData.js';

/**
 * The lane a wave walks.
 *
 * One road takes the whole wave and the next wave takes the next one, cycling
 * through every lane: wave 1 → lane 0, wave 2 → lane 1, …, wave 4 → lane 0.
 * Ordinal, never random, so both duel seats send the same horde down the same
 * road without a single byte of lane data on the wire.
 *
 * @param {number} waveNumber 1-based wave
 * @param {number} laneCount  lanes the battlefield offers (0 = no lanes)
 */
export function laneIndexForWave(waveNumber, laneCount) {
  const count = Math.max(0, Math.floor(Number(laneCount) || 0));
  if (!count) return 0;
  const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
  return (wave - 1) % count;
}

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
    /** Every route the horde can take, shortest first. */
    this.lanes = [];
    /** Union of all lane cells — the ground a tower may not stand on. */
    this.laneCells = new Set();
    /**
     * Cells the horde must walk around. Keeps built on a lane land here, and
     * every later search treats them as walls — the road network does not move,
     * the horde simply takes the detour. Palisades are NOT in this set: a wall
     * is a thing the horde breaks down, not a thing it avoids.
     */
    this.extraBlocked = new Set();
    this.lastMainResult = null; // full BFS result of the latest spawn → base search
    this.lastRun = null; // stats of the most recent BFS run of any kind
    this.cumulative = { runs: 0, nodesVisited: 0, nodesExplored: 0, neighborChecks: 0, timeMs: 0, failedRuns: 0 };
  }

  /** Replace the extra obstacle set (keeps standing on a lane). */
  setBlocked(cells = []) {
    this.extraBlocked = new Set(cells);
    return this.extraBlocked;
  }

  /** Run BFS and record its statistics. */
  #search(start, goal, options, purpose) {
    const merged = this.extraBlocked.size
      ? { ...options, blocked: new Set([...(options.blocked || []), ...this.extraBlocked]) }
      : options;
    const result = bfsShortestPath(this.graph, start, goal, merged);
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

  /**
   * Find every route worth using, not just the shortest.
   *
   * The maps are hand-drawn with two or three roads from the gate to the core,
   * but a single BFS shortest path ignored all of them: every creep and every
   * boss walked the same corridor, which made a wide map play like a corridor.
   * This runs **Yen's k-shortest loopless paths** on the road graph and keeps up
   * to `max` routes that are not absurdly longer than the best one.
   *
   * Determinism matters as much as the routes: the duel seats both run this at
   * launch, and BFS explores neighbours in a fixed order, so both phones find
   * the same lanes in the same order.
   *
   * On top of Yen's rule the lanes must be *different roads*, not the same road
   * with a corner filed off: a grid of roads offers dozens of routes that differ
   * by one cell, and three of those would put the horde on one path again while
   * pretending otherwise. A candidate therefore has to leave at least
   * `minDifference` of its cells off every lane already accepted — the duel
   * arenas' concentric rings answer with two lanes (clockwise and
   * counter-clockwise), the campaign maps' hand-drawn forks with three.
   *
   * @param {{ max?: number, tolerance?: number, minDifference?: number }} [options]
   *   `tolerance` is how much longer than the shortest route a lane may be
   *   (0.35 = up to 35 % longer); `minDifference` is the fraction of a route
   *   that has to be its own (0.2 = a fifth of it, at least 4 cells).
   * @returns {string[][]} lanes, shortest first
   */
  computeLanes({ max = 3, tolerance = 0.35, minDifference = 0.2 } = {}) {
    const shortest = this.computeMainPath();
    if (!shortest.found) {
      this.lanes = [];
      this.laneCells = new Set();
      return [];
    }

    const limit = Math.ceil(this.mainPath.length * (1 + Math.max(0, tolerance)));
    const accepted = [this.mainPath];
    const pool = [];
    const samePath = (a, b) => a.length === b.length && a.every((cell, i) => cell === b[i]);
    const startsWith = (path, prefix) => prefix.every((cell, i) => path[i] === cell);
    // How many of `candidate`'s cells are its own, given `other`.
    const ownCells = (candidate, other) => {
      const seen = new Set(other);
      return candidate.reduce((count, cell) => count + (seen.has(cell) ? 0 : 1), 0);
    };
    const distinctEnough = (candidate) => {
      const floor = Math.max(4, Math.round(candidate.length * Math.min(0.8, Math.max(0, minDifference))));
      return accepted.every((path) => ownCells(candidate, path) >= floor);
    };

    while (accepted.length < Math.max(1, max)) {
      const last = accepted[accepted.length - 1];
      for (let i = 0; i < last.length - 1; i += 1) {
        const spurNode = last[i];
        const root = last.slice(0, i + 1);
        // Yen's rule: no candidate may re-use an edge another accepted lane
        // already left this root by, or it would just be that lane again.
        const blockedEdges = new Set();
        for (const path of accepted) {
          if (path.length > i + 1 && startsWith(path, root)) {
            blockedEdges.add(edgeKey(path[i], path[i + 1]));
          }
        }
        const blocked = new Set(root.slice(0, -1));
        const spur = this.#search(spurNode, this.baseKey, { blocked, blockedEdges }, `lane ${accepted.length + 1}`);
        if (!spur.found) continue;
        const total = root.slice(0, -1).concat(spur.path);
        if (total.length > limit) continue;
        if (accepted.some((path) => samePath(path, total))) continue;
        if (pool.some((path) => samePath(path, total))) continue;
        pool.push(total);
      }
      if (!pool.length) break;
      pool.sort((a, b) => a.length - b.length);
      // Take the shortest candidate that is genuinely a different road; if every
      // one left is a corner-cut twin, this map simply has fewer lanes.
      const index = pool.findIndex(distinctEnough);
      if (index < 0) break;
      accepted.push(pool.splice(index, 1)[0]);
    }

    this.lanes = accepted;
    this.laneCells = new Set(accepted.flat());
    return accepted;
  }

  /** The lane an enemy should walk, clamped to the lanes that exist. */
  laneAt(index) {
    if (!this.lanes.length) return this.mainPath;
    const safe = ((Math.floor(Number(index) || 0) % this.lanes.length) + this.lanes.length) % this.lanes.length;
    return this.lanes[safe];
  }

  /** Shortest route from any walkable cell to the base. */
  pathToBase(startKey, purpose = 'route to base') {
    return this.#search(startKey, this.baseKey, {}, purpose);
  }

  /** Can the horde still reach the bastion with the current obstacles? */
  hasRoute() {
    if (!this.extraBlocked.size) return this.mainPath.length > 0;
    return this.#search(this.spawnKey, this.baseKey, {}, 'route check').found;
  }

  /** True when a cell belongs to the walkable road network. */
  isRoad(key) {
    return this.graph.hasNode(key);
  }

  /** Length in cells of the current enemy route (0 when the map is cut). */
  get routeLength() {
    return this.mainPath.length;
  }

  /** How many distinct routes the horde can take. */
  get laneCount() {
    return this.lanes.length;
  }
}
