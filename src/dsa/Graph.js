/**
 * Graph — an undirected, unweighted graph stored as an ADJACENCY LIST.
 *
 * Representation:
 *   adjacency : Map<string, string[]>
 *     key   = node id (for the battlefield: the string "row,col")
 *     value = array of neighbour node ids
 *
 * Why an adjacency list (and not an adjacency matrix)?
 *   The battlefield grid has 240 cells but only ~90 walkable road cells, and
 *   each road cell has at most 4 neighbours. A matrix would need V*V entries
 *   (mostly zeros); the list stores only the edges that exist, i.e. O(V + E)
 *   memory, and lets BFS enumerate a node's neighbours in O(degree).
 *
 * Complexity (d = degree of a node, at most 4 on our grid):
 *   addNode      O(1)
 *   addEdge      O(d)   (duplicate check scans the short neighbour array)
 *   removeNode   O(d * d') — visits each neighbour's list once (≤ 4 × 4 here)
 *   hasNode      O(1)
 *   getNeighbors O(1)  (returns the stored array)
 */
export class Graph {
  constructor() {
    /** @type {Map<string, string[]>} */
    this.adjacency = new Map();
    /** Optional data attached to each node, e.g. { row, col }. */
    this.nodeData = new Map();
  }

  /** Add a node if it does not exist yet. */
  addNode(id, data = null) {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, []);
    }
    if (data !== null) this.nodeData.set(id, data);
  }

  /** Add an undirected edge a <-> b (both nodes must already exist). */
  addEdge(a, b) {
    if (a === b) return false;
    const listA = this.adjacency.get(a);
    const listB = this.adjacency.get(b);
    if (!listA || !listB) return false;
    if (!listA.includes(b)) listA.push(b);
    if (!listB.includes(a)) listB.push(a);
    return true;
  }

  /** Remove a node and every edge touching it. */
  removeNode(id) {
    const neighbours = this.adjacency.get(id);
    if (!neighbours) return false;
    for (const n of neighbours) {
      const list = this.adjacency.get(n);
      const index = list.indexOf(id);
      if (index !== -1) list.splice(index, 1);
    }
    this.adjacency.delete(id);
    return true;
  }

  hasNode(id) {
    return this.adjacency.has(id);
  }

  /** @returns {string[]} neighbour ids (empty array for unknown nodes) */
  getNeighbors(id) {
    return this.adjacency.get(id) ?? [];
  }

  getNodeData(id) {
    return this.nodeData.get(id) ?? null;
  }

  /** V — number of nodes. */
  nodeCount() {
    return this.adjacency.size;
  }

  /** E — number of undirected edges (each edge is stored twice). */
  edgeCount() {
    let total = 0;
    for (const list of this.adjacency.values()) total += list.length;
    return total / 2;
  }

  nodes() {
    return [...this.adjacency.keys()];
  }
}

/** Build the node id used for a grid cell. */
export function cellKey(row, col) {
  return `${row},${col}`;
}

/** Parse a node id back into { row, col }. */
export function parseCellKey(key) {
  const comma = key.indexOf(',');
  return { row: Number(key.slice(0, comma)), col: Number(key.slice(comma + 1)) };
}

/** 4-directional movement: up, right, down, left (fixed order => deterministic BFS). */
export const DIRECTIONS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

/**
 * Build a graph from a 2D grid.
 * Every cell for which `isWalkable(row, col)` returns true becomes a node,
 * and orthogonally adjacent walkable cells are connected by an edge.
 *
 * Time: O(R * C) — each cell is visited once and checks ≤ 4 neighbours.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {(row:number, col:number) => boolean} isWalkable
 * @returns {Graph}
 */
export function buildGridGraph(rows, cols, isWalkable) {
  const graph = new Graph();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalkable(r, c)) graph.addNode(cellKey(r, c), { row: r, col: c });
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isWalkable(r, c)) continue;
      // Only look right and down; the edge is undirected so this covers all pairs once.
      if (c + 1 < cols && isWalkable(r, c + 1)) graph.addEdge(cellKey(r, c), cellKey(r, c + 1));
      if (r + 1 < rows && isWalkable(r + 1, c)) graph.addEdge(cellKey(r, c), cellKey(r + 1, c));
    }
  }
  return graph;
}

/**
 * Re-insert a grid cell into an existing graph and reconnect it to any walkable
 * neighbours that are currently in the graph (used when a barricade is sold).
 */
export function restoreGridNode(graph, row, col) {
  const id = cellKey(row, col);
  graph.addNode(id, { row, col });
  for (const [dr, dc] of DIRECTIONS) {
    const neighbour = cellKey(row + dr, col + dc);
    if (graph.hasNode(neighbour)) graph.addEdge(id, neighbour);
  }
  return id;
}
