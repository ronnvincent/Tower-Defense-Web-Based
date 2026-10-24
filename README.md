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
- **Audio:** Web Audio API synthesis for the UI cues, plus CC0 foley clips.
- **Art:** [Foozle "Spire"](https://foozlecc.itch.io/) pixel-art towers, enemies and terrain (CC0 1.0) — see [docs/asset-integration.md](docs/asset-integration.md).
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
- **Solid Obstacles, Stable Routes:** Palisades no longer cut graph nodes. The BFS route stays the *shortest road route* and a palisade is a physical wall standing on it — enemies stop and break it down instead of taking a scenic detour around it.

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
  - Computes the shortest route from Spawn `(5,0)` to Base `(5,19)` on the 3-route road network; every enemy marches it.
  - Powers the live BFS visualiser in the codex and the route lengths shown in the algorithm panel.
  - Runs the spawn → base and cell → base searches that prove the map is solvable before wave 1.

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
Defend the **Guardian Core Base (25 HP)** against 6 escalating waves of invaders. You start with **220 gold**; earn more by eliminating enemies and spend it on defensive towers on grass tiles or palisades on the road.

### Defense Arsenal
1. **Ballista Tower (🪙 60):** Balanced single-target bolt fire. Branches into Rapid Ranger or Sniper.
2. **Boulder Sling (🪙 110):** Lobbed stone artillery with real distance-falloff splash. Branches into Siege Sling or Stone Hammer.
3. **Frost Bastion (🪙 85):** Crystal tower casting slowing frost (up to 60% slow). Branches into Blizzard Spire or Lightning Conductor.
4. **Palisade (🪙 30):** A solid wall on the road. Enemies **do not walk around it** — they stop and hammer it down (420 HP, 900 HP reinforced with contact thorns), buying your towers the time they need.
5. **Hammerforge (🪙 120):** Heavy hammer slams with explosive splash. Branches into the armour-melting **Emberforge** (−20 armour for 3.5 s) or the long-reach **Thunderforge** (35% armour penetration).
6. **Runestone (🪙 135):** Rune bolts that bypass 75% of armour. Branches into the **Void Lance** (true damage, ignores armour completely) or the **Arcane Nova** (magic splash).
7. **Banner Keep (🪙 125):** Support keep that buffs every tower in its aura (+damage, +range) while still firing. Branches into the **Great Warbanner** (+32% damage, +14% range) or the **Muster Camp** (+15% fire rate and +1 gold per kill inside the aura).

### Camera & Mouse Controls
| Input | Action |
|---|---|
| Drag the battlefield (any mouse button or one finger) | Pan the camera |
| Mouse wheel / trackpad scroll | Zoom towards the cursor (1×–3×) |
| Two-finger pinch | Zoom + pan simultaneously |
| Click a floating `▲` badge above a defence | Open that tower’s upgrade inspector |
| Click the dimmed backdrop of a dialog | Close it |
| `F` or the ⛶ button | Toggle browser fullscreen |
| Phone in portrait | Game pauses behind a *Rotate your device* card |

### Keyboard Shortcuts
| Key | Action |
|:---:|---|
| <kbd>+</kbd> / <kbd>−</kbd> | Zoom in / out |
| <kbd>0</kbd> | Fit the whole map (reset camera) |
| <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> | Nudge the camera |
| <kbd>1</kbd> | Select Ballista Tower |
| <kbd>2</kbd> | Select Cannon Battery |
| <kbd>3</kbd> | Select Frost Spire |
| <kbd>4</kbd> | Select Palisade |
| <kbd>5</kbd> | Select Hammerforge |
| <kbd>6</kbd> | Select Runestone |
| <kbd>7</kbd> | Select Banner Keep |
| <kbd>Space</kbd> | Start Next Wave / Toggle Pause |
| <kbd>F</kbd> | Toggle fullscreen |
| <kbd>Esc</kbd> | Deselect Tower / Close Inspector |
| <kbd>C</kbd> | Toggle DSALGO Technical Codex |
| <kbd>L</kbd> | View Hall of Champions (Leaderboard) |

---

## 🖥️ UI / UX Systems

- **Camera** — drag to pan, wheel or pinch to zoom (1×–3×), clamped to the battlefield. All tile
  maths goes through `cameraMath.screenToWorld`, so building/selecting stays pixel-accurate at any zoom.
- **Upgrade badges** — every defence shows its next upgrade and price above its roof; gold = affordable,
  grey = not yet, cyan ring = selected. Click one to open the inspector.
- **Non-blocking panels** — the HUD frame is click-through, the tower inspector is draggable/collapsible
  and anchors itself beside the selected tower, and the DSALGO codex is a live side drawer that never
  stops the battle.
- **Responsive HUD** — fluid type plus breakpoints at 1180 / 900 / 680 px and 620 / 460 px heights;
  portrait phones get a rotate card with an escape hatch.
- **Contrast tokens** — text colours are chosen per surface (wood, parchment, slate, dark glass) and
  audited with `npm run check:contrast` (36/36 pairs ≥ 4.5:1).
- **Fullscreen & landscape** — the game takes over the screen (first gesture on desktop, one tap on
  mobile), portrait play is blocked behind a rotate card that pauses the battle, and the leftover
  space beside the 5:3 stage is filled with an ambient backdrop instead of black bars. Installs as a
  landscape fullscreen web app via `manifest.webmanifest`.

Full write-ups: [docs/ui-ux.md](docs/ui-ux.md) · [docs/display-and-fullscreen.md](docs/display-and-fullscreen.md).

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
# Run all 200 automated unit tests (16 suites, incl. jsdom HUD tests)
npm test

# WCAG 2.1 contrast audit of the HUD palette (36/36 pairs)
npm run check:contrast

# Both of the above
npm run check

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
│   ├── style.css               # Design tokens, HUD, responsive breakpoints
│   ├── camera/
│   │   ├── cameraMath.js       # Pointer↔world maths, zoom anchors, clamps (pure)
│   │   └── CameraRig.js        # Drag-pan, wheel/pinch zoom, tap routing
│   ├── system/
│   │   ├── displayMode.js      # Orientation / device / fullscreen decisions (pure)
│   │   ├── FullscreenController.js  # Fullscreen API + orientation lock
│   │   └── OrientationGate.js  # Rotation watching, gate state machine
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
│   │   ├── TextureFactory.js   # Procedural Canvas 2D fallbacks (portal, base, FX)
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
└── tests/                      # Automated Vitest test suites (237 tests / 19 suites)
    ├── graph-bfs.test.js
    ├── queue.test.js
    ├── sorting-leaderboard.test.js
    └── systems.test.js
```
