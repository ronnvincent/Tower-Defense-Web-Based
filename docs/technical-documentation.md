# Technical Documentation: Tower Defense (DSALGO Bastion Edition)

## 1. System Overview & Architecture

*Tower Defense: DSALGO Bastion Edition* is designed with a strict **Model-View separation** architecture:
- **Core Domain & DSA Layer (`src/dsa/`, `src/systems/`, `src/data/`):** Pure, platform-independent JavaScript classes with zero dependencies on Phaser or browser DOM. This design allows 100% headless testing in Node.js via Vitest.
- **Rendering & Engine Layer (`src/rendering/`, `src/entities/`, `src/scenes/`):** Phaser 3 scenes managing canvas rendering, sprite tweens, particle effects, and user pointer input.
- **Interface & Telemetry Layer (`src/ui/`, `src/style.css`):** Hardware-accelerated HTML5/CSS3 HUD and modal overlays displaying game state and live algorithm telemetry.

```
       +-------------------------------------------------------------+
       |                         USER INPUT                          |
       |                (Mouse Pointer, Hotkeys 1-7, C, L)           |
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

When the player attempts to construct a **Palisade**:
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

Starting economy: **220 gold**, **25 base HP**, **70% sell refund**.
Wave-clear payout: $30 + 8w$ gold, $100w$ score.

| Tower | Cost | Range | Cooldown | Damage | Special Capability |
|---|:---:|:---:|:---:|:---:|---|
| **Ballista (archer)** | 🪙 60 | 155 px | 0.62 s | 16 | Balanced single-target; L2 (🪙50) → Rapid Ranger (🪙90) / Sniper (🪙100) |
| **Boulder Sling (cannon)** | 🪙 110 | 150 px | 1.65 s | 55 | 70 px splash with distance falloff; L2 (🪙85) → Siege Sling (🪙135) / Stone Hammer (🪙150) |
| **Frost Bastion** | 🪙 85 | 140 px | 0.95 s | 10 | 40% slow for 1.6 s; L2 (🪙65) → Blizzard (🪙110) / Lightning (🪙120) |
| **Hammerforge** | 🪙 120 | 140 px | 1.60 s | 60 | Explosive slam (66 px); L2 (🪙85) → Emberforge (🪙130, −20 armour) / Thunderforge (🪙140, 35% pen) |
| **Runestone** | 🪙 135 | 170 px | 1.10 s | 30 | Magic bolts (75% armour bypass); L2 (🪙95) → Void Lance (🪙130, true damage) / Arcane Nova (🪙140, splash) |
| **Banner Keep** | 🪙 125 | 155 px | 1.25 s | 16 | Aura: +15% damage, +6% range within 150 px; L2 (🪙85) → Great Warbanner (🪙115) / Muster Camp (🪙120, +gold per kill) |
| **Palisade** | 🪙 30 | N/A | N/A | N/A | 420 HP wall on the road — enemies must break it; L2 (🪙35) → 900 HP + 20 thorns/s |

| Enemy | Base HP | Speed | Siege | Reward | Score | Role |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Goblin Grunt** | 75 | 62 px/s | 10 | 🪙 7 | 10 pts | Standard foot soldier |
| **Shadow Runner** | 40 | 125 px/s | 6 | 🪙 6 | 12 pts | Agile sprinter |
| **Iron Brute** | 320 | 38 px/s | 34 | 🪙 22 | 35 pts | Heavy armored juggernaut (3 base damage) |
| **Stone Colossus** | 1250 | 34 px/s | 55 | 🪙 100 | 250 pts | Wave 3 mid-boss, 2 phases |
| **Abyssal Warlord** | 3300 | 32 px/s | 70 | 🪙 200 | 600 pts | Wave 6 final boss, 3 phases |

Wave Health Scaling: $\text{HP}(w) = \text{BaseHP} \times \min(2, 1 + 0.09 \times (w - 1))$.
