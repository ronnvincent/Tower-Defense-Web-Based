# Technical Documentation: Tower Defense (DSALGO Bastion Edition)

## 1. System Overview & Architecture

*Tower Defense: DSALGO Bastion Edition* is designed with a strict **Model-View separation** architecture:
- **Core Domain & DSA Layer (`src/dsa/`, `src/systems/`, `src/data/`):** Pure, platform-independent JavaScript classes with zero dependencies on Phaser or browser DOM. This design allows 100% headless testing in Node.js via Vitest.
- **Rendering & Engine Layer (`src/rendering/`, `src/entities/`, `src/scenes/`):** Phaser 3 scenes managing canvas rendering, sprite tweens, particle effects, and user pointer input.
- **Interface & Telemetry Layer (`src/ui/`, `src/style.css`):** Hardware-accelerated HTML5/CSS3 HUD and modal overlays displaying game state and live algorithm telemetry.

```
       +-------------------------------------------------------------+
       |                         USER INPUT                          |
       |                (Mouse Pointer, Hotkeys 1-4, C, L)           |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |                         PHASER SCENES                       |
       |             (BootScene -> MenuScene -> GameScene)           |
       +------------------------------+------------------------------+
                                      |
                +---------------------+---------------------+
                |                                           |
                v                                           v
+-------------------------------+           +-------------------------------+
|       GAMEPLAY SYSTEMS        |           |       STUDENT DSA CORE        |
|  - EconomyManager             |           |  - Queue.js (Circular Buffer) |
|  - GameStateManager           |<--------->|  - Graph.js (Adjacency List)  |
|  - WaveManager                |           |  - BFS.js (Shortest Path)     |
|  - PlacementSystem (Hash Map) |           |  - MergeSort.js (Leaderboard) |
|  - PathfindingSystem          |           |  - LinearSearch.js            |
+---------------+---------------+           +---------------+---------------+
                |                                           |
                +---------------------+---------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |                     UI & TELEMETRY DOM                      |
       |      (HUD Dock, Tower Inspector, Codex, Leaderboard)        |
       +-------------------------------------------------------------+
```

---

## 2. Battlefield Graph & Pathfinding System

### Map Representation
The battlefield is defined in `src/data/mapData.js` as a $20 \times 12$ matrix of tiles (64×64 pixels each, total resolution $1280 \times 768$ px).
- Road tiles (`#`), Spawn portal (`S`), and Base monolith (`B`) are flagged as **walkable**.
- Grass (`.`) is buildable by towers.
- Rock (`x`) and Water (`~`) are impassable barriers.

### Graph Construction
On initialization, `buildGridGraph()` scans the map grid and constructs an **undirected unweighted graph**:
- Each walkable tile $(r, c)$ is stored as a node identified by `"row,col"`.
- Orthogonally adjacent walkable neighbors (top, bottom, left, right) are connected via undirected edges.
- Total nodes: $V \approx 90$ walkable cells. Average degree: $d \le 4$.

### Dynamic Barricade Edge Cutting & Enemy Rerouting
The map contains **three distinct routes** from Spawn `(5,0)` to Base `(5,19)`:
1. **Middle Route:** 24 cells (23 steps) — Natural shortest path.
2. **North Route:** 28 cells (27 steps).
3. **South Route:** 30 cells (29 steps).

When the player attempts to construct a **Road Barricade**:
1. `tryBlockCell(key, enemyStarts)` simulates blocking the node using a temporary `blocked` Set.
2. BFS runs to verify that:
   - A valid path still exists from Spawn `(5,0)` to Base `(5,19)`.
   - A valid path still exists from every living enemy's current cell to Base `(5,19)`.
3. If either search returns `found: false`, placement is rejected (*"That would block the only path to the base!"*), and the graph remains unaltered.
4. On validation success, `graph.removeNode(key)` cuts the node and its connected edges. Living enemies are immediately assigned the newly computed shortest sub-paths.

---

## 3. Custom Circular Buffer Queue

Wave enemy spawning and BFS frontier traversal require high-frequency First-In, First-Out (FIFO) operations.

```
Buffer Array [ _ , _ , EnemyA , EnemyB , EnemyC , _ , _ ]
                        ^                  ^
                       head               tail = (head + count) % capacity
```

### Invariant Properties
- `head`: Points to the front element.
- `count`: Number of active items.
- Tail insertion: Enqueues at `(head + count) % capacity` in $O(1)$ time.
- Head removal: Reads item at `head`, sets slot to `undefined` (preventing memory leaks), advances `head = (head + 1) % capacity` in $O(1)$ time.
- Geometric Resizing: When `count === capacity`, the internal buffer doubles in size ($2\times$) and unrolls elements into indices $0 \dots count-1$. This maintains **$O(1)$ amortized enqueue**.

---

## 4. Leaderboard Persistence & Merge Sort

High scores are persisted locally in `localStorage` under `td-dsalgo:leaderboard:v1`.

### Data Integrity & Crash Proofing
- If `localStorage` is disabled or corrupted, `src/utils/storage.js` creates a safety backup of corrupt data and provides an in-memory storage fallback.
- Individual records are verified with `normalizeRecord()`, discarding malformed entries without throwing runtime exceptions.

### Deterministic Multi-Level Tie-Breaking
When `getRanked()` is called, our student-written `mergeSort` sorts all records using `compareRecords`:
$$\text{Rank}(A, B) = \begin{cases}
B.\text{score} - A.\text{score} & \text{if } A.\text{score} \ne B.\text{score} \\
B.\text{waves} - A.\text{waves} & \text{if } A.\text{waves} \ne B.\text{waves} \\
A.\text{timeMs} - B.\text{timeMs} & \text{if } A.\text{timeMs} \ne B.\text{timeMs} \\
A.\text{timestamp} - B.\text{timestamp} & \text{if } A.\text{timestamp} \ne B.\text{timestamp} \\
A.\text{id} \leftrightarrow B.\text{id} & \text{lexicographical total order}
\end{cases}$$

---

## 5. Game Balance & Economic Constants

| Tower | Cost | Range | Cooldown | Damage | Special Capability |
|---|:---:|:---:|:---:|:---:|---|
| **Archer** | 🪙 60 | 150 px | 0.65 s | 15 | Balanced single-target; Level 2 (🪙55), Level 3 (🪙90) |
| **Cannon** | 🪙 110 | 145 px | 1.70 s | 45 | Ballistic trajectory; 62 px Area Splash Damage |
| **Frost** | 🪙 85 | 135 px | 1.00 s | 6 | 40% Speed Reduction for 1.6s |
| **Barricade** | 🪙 30 | N/A | N/A | 0 | Road graph node cut; forces BFS reroute |

| Enemy | Base HP | Speed | Reward | Score | Role |
|---|:---:|:---:|:---:|:---:|---|
| **Goblin Grunt** | 70 | 62 px/s | 🪙 7 | 10 pts | Standard foot soldier |
| **Shadow Runner**| 38 | 120 px/s | 🪙 6 | 12 pts | Agile sprinter |
| **Iron Brute** | 300 | 40 px/s | 🪙 20 | 35 pts | Heavy armored juggernaut (3 base damage) |
| **Warlord Boss** | 2600 | 32 px/s | 🪙 150 | 500 pts | Wave 6 Final Boss (10 base damage) |

Wave Health Scaling: $\text{HP}(w) = \text{BaseHP} \times (1 + 0.12 \times (w - 1))$.
