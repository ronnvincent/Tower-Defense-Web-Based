import { Queue } from './Queue.js';

/**
 * Breadth-First Search (BFS) shortest-path search on an unweighted graph.
 *
 * Because every edge has the same cost (one tile step), BFS explores nodes in
 * order of increasing distance from the start, so the first time the goal is
 * taken from the queue, the path found is a SHORTEST path (fewest steps).
 *
 * Data structures used:
 *   - frontier : our custom circular-buffer Queue (FIFO)       → dsa/Queue.js
 *   - visited  : Set<string> of nodes already discovered     → O(1) membership
 *   - parent   : Map<string, string|null> — how we reached each node, used to
 *                reconstruct the path by walking backwards from the goal.
 *
 * Statistics collected from the actual run (nothing is estimated):
 *   nodesVisited   – nodes marked as visited (discovered and enqueued), incl. start
 *   nodesExplored  – nodes dequeued and expanded (their neighbours examined)
 *   neighborChecks – total neighbour entries examined across all expansions
 *   pathNodes      – number of cells in the returned path (0 if none)
 *   pathEdges      – number of steps in the returned path (pathNodes - 1)
 *   timeMs         – wall-clock duration measured with performance.now()
 *
 * Time complexity:  O(V + E) — each node is enqueued/dequeued at most once
 *                   (visited set) and each adjacency list is scanned at most once.
 * Space complexity: O(V) for the queue, visited set and parent map.
 *
 * @param {import('./Graph.js').Graph} graph
 * @param {string} start  start node id
 * @param {string} goal   goal node id
 * @param {object} [options]
 * @param {Set<string>} [options.blocked]  nodes to treat as impassable for this
 *        search only (used to test "what if a barricade is placed here?")
 * @param {Set<string>} [options.blockedEdges] edges to treat as missing for this
 *        search only. Built with {@link edgeKey}; used by the lane finder to ask
 *        "what is the best route that does not leave this way?".
 * @returns {{found:boolean, path:string[], reason:string|null, stats:object, visitOrder:string[]}}
 */
export function bfsShortestPath(graph, start, goal, options = {}) {
  const blocked = options.blocked ?? null;
  const blockedEdges = options.blockedEdges ?? null;
  const t0 = now();

  const stats = {
    nodesVisited: 0,
    nodesExplored: 0,
    neighborChecks: 0,
    pathNodes: 0,
    pathEdges: 0,
    timeMs: 0,
  };
  const visitOrder = [];

  const fail = (reason) => {
    stats.timeMs = now() - t0;
    return { found: false, path: [], reason, stats, visitOrder };
  };

  // Guard clauses: invalid input returns a clearly defined "not found" result.
  if (!graph.hasNode(start)) return fail('start-missing');
  if (!graph.hasNode(goal)) return fail('goal-missing');
  if (blocked && (blocked.has(start) || blocked.has(goal))) return fail('endpoint-blocked');

  const frontier = new Queue(32);
  const visited = new Set();
  const parent = new Map();

  visited.add(start);
  parent.set(start, null);
  frontier.enqueue(start);
  visitOrder.push(start);
  stats.nodesVisited = 1;

  // Loop ends when the queue is empty. It cannot run forever: a node is only
  // enqueued if it was not visited before, so at most V nodes are ever enqueued.
  while (!frontier.isEmpty()) {
    const current = frontier.dequeue();
    stats.nodesExplored++;

    if (current === goal) {
      const path = reconstructPath(parent, goal);
      stats.pathNodes = path.length;
      stats.pathEdges = path.length - 1;
      stats.timeMs = now() - t0;
      return { found: true, path, reason: null, stats, visitOrder };
    }

    const neighbours = graph.getNeighbors(current);
    for (let i = 0; i < neighbours.length; i++) {
      const next = neighbours[i];
      stats.neighborChecks++;
      if (visited.has(next)) continue;
      if (blocked && blocked.has(next)) continue;
      if (blockedEdges && blockedEdges.has(edgeKey(current, next))) continue;
      visited.add(next);
      parent.set(next, current);
      frontier.enqueue(next);
      visitOrder.push(next);
      stats.nodesVisited++;
    }
  }

  return fail('unreachable');
}

/** One canonical key per undirected edge, whichever way it is walked. */
export function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Walk the parent links backwards from the goal to the start, then reverse.
 * O(L) where L is the path length.
 */
export function reconstructPath(parent, goal) {
  const reversed = [];
  let node = goal;
  while (node !== null && node !== undefined) {
    reversed.push(node);
    node = parent.get(node);
  }
  // Manual reverse (two-pointer swap) to keep the algorithm self-contained.
  for (let i = 0, j = reversed.length - 1; i < j; i++, j--) {
    const tmp = reversed[i];
    reversed[i] = reversed[j];
    reversed[j] = tmp;
  }
  return reversed;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
