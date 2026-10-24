# Tower Defense: DSALGO Bastion Edition ⚔️🛡️

> **Final Project for Data Structures and Algorithms (DSALGO)**  
> **Course:** Data Structures and Algorithms  
> **Presentation Date:** November 7, 2026  
> **Stack:** Phaser 3.90.0, JavaScript (ES Modules), HTML5, CSS3, Vite 7, Web Audio API

---

## 📖 Project Overview

**Tower Defense: DSALGO Bastion Edition** is a modern, high-performance, browser-based 2D tower defense web game built to demonstrate the practical application of core computer science data structures and custom algorithms in an interactive software project.

Instead of relying on game engine built-in methods or generic web libraries for computation, all pathfinding, queueing, sorting, searching, and occupancy validations are **student-written, decoupled, and unit-tested**.

---

## 🛠️ Technology Stack & Architecture

- **Game Engine:** [Phaser 3.90.0](https://docs.phaser.io/) (Canvas & WebGL rendering, tweens, particles, input management).
- **Core Logic:** Pure Modern JavaScript (ES Modules).
- **Build System:** [Vite 7.3.7](https://vite.dev/) (Instant HMR local development and optimized production bundling).
- **Testing Framework:** [Vitest 5.0.5](https://vitest.dev/) (Automated headless unit testing in Node.js environment).
- **Audio:** Web Audio API (Synthesizes sound effects at runtime with zero external audio assets).
- **Styling:** Vanilla CSS3 with bespoke dark fantasy / arcane bastion art direction.

---

## 🧠 Mandatory Data Structures Implemented

### 1. Circular Buffer Queue (`src/dsa/Queue.js`)
- **Policy:** FIFO (First In, First Out).
- **Why not `Array.prototype.shift()`?** Standard array shifting forces $O(n)$ element repositioning on every dequeue. The circular buffer utilizes `head` pointer arithmetic `(head + 1) % capacity`, achieving **$O(1)$ constant time dequeue**.
- **Usage:**
  1. Controls **wave enemy spawning intervals** in `WaveManager.js`.
  2. Serves as the **search frontier** in Breadth-First Search (`BFS.js`).

### 2. Adjacency-List Graph (`src/dsa/Graph.js`)
- **Structure:** `Map<string, string[]>` mapping cell keys (`"row,col"`) to an array of orthogonally adjacent walkable neighbor coordinates.
- **Why an Adjacency List?** In a 240-tile grid with only ~90 road cells (maximum degree 4), an adjacency list stores only existing edges ($O(V + E)$ space) instead of an $O(V^2)$ sparse adjacency matrix.
- **Dynamic Graph Cuts:** Road Barricades physically remove nodes from the graph, dynamically rerouting enemies in real-time.

### 3. Arrays with $O(1)$ Swap Removal & In-Place Compaction (`src/utils/arrayUtils.js`)
- Manages active collections: `activeEnemies[]`, `activeTowers[]`, `activeProjectiles[]`.
- Utilizes two-pointer in-place compaction (`compactInPlace`) to purge dead entities in a single $O(n)$ pass without `splice()` overhead.

### 4. Hash Map for Tile Occupancy (`src/systems/PlacementSystem.js`)
- `Map<string, Tower|Barricade>` provides $O(1)$ average time lookups for mouse hover and placement collision queries.

---

## ⚡ Mandatory Custom Algorithms Implemented

### 1. Breadth-First Search (BFS) Shortest Path (`src/dsa/BFS.js`)
- **Time Complexity:** $O(V + E)$
- **Space Complexity:** $O(V)$
- **Implementation:** Custom circular queue frontier, `Set` visited tracking, and `Map` parent pointers for reverse path reconstruction.
- **Gameplay Roles:**
  - Computes the shortest route from Spawn `(5,0)` to Base `(5,19)` on the 3-route road network.
  - Validates Barricade placement: guards against blocking the only path or stranding living enemies.
  - Dynamically reroutes live enemies when the road layout changes.

### 2. Merge Sort for Leaderboard (`src/dsa/MergeSort.js`)
- **Time Complexity:** $O(n \log n)$ across all cases (Best, Average, Worst).
- **Space Complexity:** $O(n)$ auxiliary array space.
- **Implementation:** Top-down recursive divide-and-conquer algorithm. Stable sorting order.
- **Deterministic Multi-Key Ranking:**
  1. Primary: Score descending (`b.score - a.score`)
  2. Tie-breaker 1: Completed waves descending
  3. Tie-breaker 2: Completion time ascending
  4. Tie-breaker 3: Timestamp ascending

### 3. Linear Search (`src/dsa/LinearSearch.js`)
- Scans ranked leaderboard records to locate the player's newly registered score and highlight their rank.

---

## 🎮 How to Play & Controls

### Objective
Defend the **Guardian Core Base (20 HP)** against 6 escalating waves of invaders. Earn gold coins by eliminating enemies and construct defensive towers on grass tiles or tactical barricades on road tiles.

### Defense Arsenal
1. **Archer Tower (🪙 60):** Balanced single-target ballista. Upgradable to Level 3.
2. **Cannon Battery (🪙 110):** Heavy mortar with ballistic arc and area-of-effect splash damage.
3. **Frost Spire (🪙 85):** Casts slowing frost aura (up to 60% slow).
4. **Road Barricade (🪙 30):** Placed directly on the road to cut graph edges and force enemy rerouting. Cannot seal off the only path.

### Keyboard Shortcuts
| Key | Action |
|:---:|---|
| <kbd>1</kbd> | Select Archer Tower |
| <kbd>2</kbd> | Select Cannon Battery |
| <kbd>3</kbd> | Select Frost Spire |
| <kbd>4</kbd> | Select Road Barricade |
| <kbd>Space</kbd> | Start Next Wave / Toggle Pause |
| <kbd>Esc</kbd> | Deselect Tower / Close Inspector |
| <kbd>C</kbd> | Toggle DSALGO Technical Codex |
| <kbd>L</kbd> | View Hall of Champions (Leaderboard) |

---

## 🚀 Installation & Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ or v20+ / v24+
- `npm` v9+

### Steps
```bash
# 1. Clone repository or open workspace directory
cd "Tower Defense Web Based"

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Open in browser
# http://localhost:5173/
```

### Running Unit Tests
```bash
# Run all 62 automated unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Production Build
```bash
# Build optimized production bundle to dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 📂 Project Directory Structure

```
tower-defense-dsalgo/
├── index.html                  # Main application structure & modal frames
├── package.json                # Project manifest & scripts
├── vite.config.js              # Vite & Vitest configuration
├── README.md                   # This master documentation
├── docs/                       # Technical defense & academic deliverables
│   ├── technical-documentation.md
│   ├── algorithm-analysis.md
│   ├── pseudocode.md
│   ├── testing-report.md
│   ├── presentation-outline.md
│   └── contribution-record.md
├── src/
│   ├── main.js                 # Game bootstrap & scene lifecycle
│   ├── style.css               # Complete dark fantasy / bastion styling
│   ├── config/
│   │   └── gameConfig.js       # Game constants, balance tuning & storage keys
│   ├── data/
│   │   ├── mapData.js          # ASCII grid layout, parsing & tile validations
│   │   ├── enemyData.js        # Enemy attributes & wave health scaling
│   │   ├── towerData.js        # Tower statistics & upgrade definitions
│   │   └── waveData.js         # 6 progressive wave group definitions
│   ├── dsa/                    # PURE, INDEPENDENT STUDENT-WRITTEN ALGORITHMS
│   │   ├── Queue.js            # Circular buffer FIFO queue (O(1) dequeue)
│   │   ├── Graph.js            # Adjacency-list graph with dynamic node removal
│   │   ├── BFS.js              # Shortest path BFS with live telemetry
│   │   ├── MergeSort.js        # Stable top-down recursive merge sort
│   │   └── LinearSearch.js     # Search helper for rank lookup
│   ├── entities/               # Game objects
│   │   ├── Enemy.js            # Path following, health bar & status effects
│   │   ├── Tower.js            # Target acquisition, recoil & upgrade states
│   │   └── Projectile.js       # Ballistic arcs, splash blast & hit text
│   ├── rendering/
│   │   ├── TextureFactory.js   # Procedural Canvas 2D sprites (zero external assets)
│   │   └── AudioSynth.js       # Procedural Web Audio sound generator
│   ├── scenes/
│   │   ├── BootScene.js        # Asset generation & bootstrap
│   │   ├── MenuScene.js        # Animated atmospheric title menu
│   │   └── GameScene.js        # Main battlefield loop, camera & controls
│   ├── systems/
│   │   ├── EconomyManager.js   # Safe gold/score balance invariants
│   │   ├── GameStateManager.js # State machine (playing/paused/gameover/victory)
│   │   ├── Leaderboard.js      # LocalStorage persistence & MergeSort ranking
│   │   ├── PathfindingSystem.js# Graph/BFS glue & live barricade rerouting
│   │   ├── PlacementSystem.js  # Hash map occupancy & rule verification
│   │   └── WaveManager.js      # Queue-driven wave spawner
│   ├── ui/
│   │   ├── HUD.js              # Status bar, build dock & tower inspector
│   │   ├── LeaderboardUI.js    # High-score modal & name submission
│   │   └── StatisticsPanel.js  # Live DSALGO telemetry & BFS overlay
│   └── utils/
│       ├── arrayUtils.js       # In-place compaction & swap-and-pop removal
│       └── storage.js          # Crash-proof LocalStorage with in-memory fallback
└── tests/                      # Automated Vitest test suites (62 unit tests)
    ├── graph-bfs.test.js
    ├── queue.test.js
    ├── sorting-leaderboard.test.js
    └── systems.test.js
```
