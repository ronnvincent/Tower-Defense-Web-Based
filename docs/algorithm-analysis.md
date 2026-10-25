# Algorithm Complexity & Big-O Analysis

This document provides a formal complexity analysis of the custom algorithms and data structures implemented in *Tower Defense: DSALGO Bastion Edition*.

---

## 1. Breadth-First Search (BFS) Shortest Path

### Formal Complexity
- **Time Complexity:** $O(V + E)$
- **Space Complexity:** $O(V)$

### Context in the Game
- **Vertices ($V$):** Number of walkable battlefield road cells ($V \approx 90$ nodes on our $20 \times 12$ map).
- **Edges ($E$):** Valid orthogonal transitions between adjacent walkable road cells ($E \approx 110$ undirected edges).
- **Graph Degree:** Since cells only connect orthogonally (Up, Right, Down, Left), maximum degree $d \le 4$.

### Time Complexity Proof
1. **Node Discovery:** Each walkable cell is added to the `visited` Set and enqueued into our circular buffer Queue **at most once**. With $O(1)$ set lookups and $O(1)$ enqueuing, all vertex insertions consume $O(V)$ time.
2. **Node Exploration:** Each node is dequeued from the frontier at most once ($O(1)$ per dequeue). Upon expansion, its neighbor list in the adjacency list is iterated.
3. **Neighbor Iterations:** Sum of degrees across all explored vertices $\sum_{v \in V} \text{deg}(v) = 2E$. Each edge is examined at most twice (once from each endpoint).
4. **Path Reconstruction:** Reconstructing the path from Base to Spawn follows parent pointers backward in $O(L)$ time, where $L$ is the path length ($L \le V$).
5. **Total Time:** $O(V) + O(E) + O(L) = O(V + E)$. On our fixed grid map, BFS executes in under 0.5 milliseconds.

### Space Complexity Proof
- `frontier` (Queue): Contains at most $O(V)$ nodes in the search perimeter.
- `visited` (Set): Stores at most $V$ string keys $\implies O(V)$ space.
- `parent` (Map): Stores at most $V$ parent relationships $\implies O(V)$ space.
- **Total Space:** $O(V)$.

### Why BFS over Dijkstra or A*?
All road edge transitions in this grid have identical unit weights (1 tile step). On an unweighted graph, BFS is guaranteed to discover the optimal shortest path because it expands nodes in strictly non-decreasing order of distance. Utilizing Dijkstra on an unweighted graph introduces unnecessary $O((V + E) \log V)$ priority queue overhead without altering the resulting path.

---

## 2. Student Merge Sort (Leaderboard Ranking)

### Formal Complexity
- **Time Complexity:** $O(n \log n)$ in Best, Average, and Worst cases.
- **Space Complexity:** $O(n)$ auxiliary memory + $O(\log n)$ recursive call stack.

### Context in the Game
- **Elements ($n$):** The number of saved player score records stored in `localStorage` ($n \le 50$, top 10 displayed).

### Time Complexity Proof (Divide and Conquer)
1. **Divide Step:** The array of length $k$ is divided into two halves of size $\lfloor k/2 \rfloor$ and $\lceil k/2 \rceil$. Splitting indices takes $O(1)$ time, and copying slices takes $O(k)$ time.
2. **Conquer Step:** Two recursive calls are made on subarrays of size $n/2$.
3. **Combine (Merge) Step:** Two sorted subarrays are merged by comparing their front elements. Each comparison writes one element into the merged array. Merging two halves of total size $k$ takes at most $k - 1$ comparisons and $k$ writes $\implies O(k)$ time.
4. **Recurrence Relation:**
   $$T(n) = 2T(n/2) + O(n)$$
   By the Master Theorem (Case 2 where $a=2, b=2, d=1$, so $2 = 2^1$):
   $$T(n) = \Theta(n \log_2 n)$$
5. **Guaranteed Uniformity:** Unlike Quick Sort (which degenerates to $O(n^2)$ when pivots are poorly selected on sorted/duplicate data), Merge Sort maintains a guaranteed $O(n \log n)$ bound regardless of input ordering.

### Space Complexity
Merging requires temporary storage to hold the combined elements before copying them back, requiring $O(n)$ total auxiliary space across the deepest merge phase. The recursion tree has height $\lceil \log_2 n \rceil$, requiring $O(\log n)$ call stack frames.

---

## 3. Circular Buffer Queue

### Formal Complexity
| Operation | Circular Buffer Queue (Our Implementation) | Standard Array with `shift()` |
|---|:---:|:---:|
| `enqueue(item)` | **$O(1)$ amortized** | $O(1)$ (`push`) |
| `dequeue()` | **$O(1)$ constant** | **$O(n)$ linear** (`shift`) |
| `peek()` | **$O(1)$ constant** | $O(1)$ (`arr[0]`) |
| `isEmpty()` / `size()` | **$O(1)$ constant** | $O(1)$ |

### Dequeue Shift Cost Comparison
Standard JavaScript `Array.prototype.shift()` removes index 0 and re-indexes every remaining element from index 1 to $k-1$ down by one slot. Over a wave of $n$ enemies or a BFS exploring $V$ nodes, repeated calls to `shift()` induce:
$$\sum_{k=1}^{n} (k - 1) = \frac{n(n - 1)}{2} = O(n^2) \text{ operations}$$
Our circular buffer uses `head = (head + 1) % capacity`, which executes in **$O(1)$ constant time** with zero memory shifting.

---

## 4. Hash Map Occupancy Lookup

### Formal Complexity
- **Time Complexity:** $O(1)$ Average Case, $O(n)$ Worst Case (Hash collisions).
- **Space Complexity:** $O(n)$ where $n$ is the number of placed towers.

### Context in the Game
`PlacementSystem.js` stores active towers in a JavaScript `Map` using `"row,col"` strings as keys.
- On every pointer move frame (60 times per second), the game checks if the hovered tile is free.
- By querying `occupancy.has(key)`, collision detection is executed in **$O(1)$ average time**, avoiding a linear scan ($O(n)$) across the `activeTowers` array on every mouse movement.

---

## 5. Yen's k-Shortest Loopless Paths (multi-lane routing)

### Formal Complexity

- **Time Complexity:** $O(k \cdot V \cdot (V + E))$
- **Space Complexity:** $O(k \cdot V + V + E)$

### Context in the Game

- $k \le 3$ lanes, $V \approx 90$ road cells on a $20 \times 12$ campaign map and
  $V \approx 300$ on the $28 \times 18$ Endless battlefield, $E \le 2V$.
- Runs **once per battle** at scene start, never per frame. The horde then walks
  a precomputed array of cell keys.

### Time Complexity Proof

1. **First lane.** Ordinary BFS: $O(V + E)$.
2. **Spur searches.** For each of the $O(V)$ cells of the last accepted lane, one
   BFS is run on the graph with a pinned prefix (blocked nodes) and the outgoing
   edges of previously accepted lanes removed. Each search is still $O(V + E)$,
   so one Yen round is $O(V \cdot (V + E))$; three rounds are $O(k \cdot V \cdot (V + E))$.
3. **No re-search of accepted work.** Accepted lanes are never re-expanded — only
   the newest one generates spurs, which is Yen's own bound.
4. **On the shipped maps** that is a few hundred BFS passes over at most 300
   nodes and 1 200 edges: measured at **4–9 ms** for the largest battlefield,
   inside the 400 ms the scene already spends generating textures.

### Space Complexity Proof

- `accepted`: at most $k$ paths of at most $V$ keys $\implies O(k \cdot V)$.
- `pool`: candidate paths of the same bound $\implies O(k \cdot V)$.
- Per search: `visited` and `parent` $\implies O(V)$.
- **Total:** $O(k \cdot V + V + E)$, well under a megabyte even at $k = 3$.

### Correctness notes

- **Loopless.** `blocked` contains the spur root's prefix, so a spur can never
  walk back into its own tail.
- **Edge-level exclusion.** Blocking an edge (not a node) is what lets two lanes
  share a corridor and still be different routes; `edgeKey(a, b)` keeps the key
  order-independent.
- **Distinctness.** A candidate must claim `max(4, 20 %)` of its cells; without
  that filter a dense road grid answers with corner-cut twins, which is the
  single-path problem again with extra steps.
- **Determinism.** BFS expands neighbours in a fixed order and candidates are
  sorted stably by length, so two devices running the same map compute the same
  lanes in the same order — the requirement for a mirrored duel.

---

## 6. Summary Table

| Data Structure / Algorithm | Operation | Average Time | Worst Time | Space | Primary In-Game Purpose |
|---|---|:---:|:---:|:---:|---|
| **Circular Queue** | `enqueue` / `dequeue` | $O(1)$ | $O(1)^*$ | $O(C)$ | Wave spawner & BFS frontier |
| **Adjacency Graph** | Edge Lookup / Cut | $O(1)$ | $O(d)$ | $O(V + E)$ | Battlefield road network |
| **Breadth-First Search** | Pathfinding | $O(V + E)$ | $O(V + E)$ | $O(V)$ | Shortest enemy route & codex visualiser |
| **Yen's k-Shortest** | Lane discovery | $O(kV(V+E))$ | $O(kV(V+E))$ | $O(kV)$ | Two-to-three monster routes per map |
| **Merge Sort** | Leaderboard Rank | $O(n \log n)$ | $O(n \log n)$ | $O(n)$ | Multi-key player score sorting |
| **Linear Search** | Rank Position | $O(n)$ | $O(n)$ | $O(1)$ | Highlighting player's saved score |
| **Hash Map** | Occupancy Query | $O(1)$ | $O(n)$ | $O(n)$ | Instant placement validation |

$^*$ *Enqueue is $O(1)$ amortized; array resize occurs when capacity is reached.*
