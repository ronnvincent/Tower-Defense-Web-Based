# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 200 tests across 16 test suites.
- **Pass Rate:** **100% (200 / 200 Passed)**
- **Test Framework:** Vitest 5.0.5 running in headless Node.js environment.
- **Manual End-to-End Verification:** Verified via automated Chromium browser subagent across the full game loop (Menu $\to$ Build $\to$ Wave Spawning $\to$ Tower Targeting $\to$ Barricade Cut $\to$ Codex Telemetry).

---

## 2. Structured Test Cases

| Test Case ID | Test Category | Description / Action Performed | Input / Action | Expected Result | Actual Result | Status |
|:---:|---|---|---|---|---|:---:|
| **TC-01** | **Gameplay & Tower Placement** | Player places Archer Tower on a valid, unbuilt grass tile with sufficient coins. | Current Coins = 160. Click Archer card (🪙60), click Grass tile `(3, 5)`. | Tile occupied; coins decrease to 100; Archer tower rendered with range circle; placement sound plays. | Tower placed at `(3, 5)`; coins deducted to 100; sound played; occupancy registered. | **PASS** |
| **TC-02** | **Economy Constraints** | Player attempts to build a Cannon Tower without sufficient coins. | Current Coins = 40. Click Cannon card (🪙110), click valid Grass tile `(2, 5)`. | Placement rejected; coins remain 40; HUD toast displays *"Not enough coins"*; error audio plays. | Placement denied; coins unchanged at 40; toast notification displayed; error audio triggered. | **PASS** |
| **TC-03** | **Placement Collision Rules** | Player attempts to place a tower on invalid terrain (Water/Rocks/Road). | Click Archer card, click Water tile `(0, 2)` or Road tile `(5, 5)`. | Placement rejected; HUD toast displays *"Rocks and water cannot be built on"* or *"Towers cannot be built on the road"*. | Placement denied; occupied status prevented; correct error banner shown. | **PASS** |
| **TC-04** | **BFS Feasibility Guard (Edge Case)** | Player attempts to place a road barricade that would completely cut off the only path to the base. | Cut Middle route at `(7, 9)`, cut North route at `(1, 10)`. Attempt to cut South route at `(10, 10)`. | `tryBlockCell()` returns `{ ok: false, reason: 'blocks-path' }`; graph retains node `(10, 10)`; placement rejected. | Placement denied with toast *"That would block the only path to the base!"*; shortest path remains valid at 30 steps. | **PASS** |
| **TC-05** | **Dynamic BFS Enemy Rerouting** | Place a barricade on the active path while living enemies are traveling on it. | Place barricade at `(7, 9)` while Goblin Grunts are at `(5, 2)`. | BFS calculates alternate route via North path; living enemies receive new waypoint list and change direction. | Enemies smoothly turned North; waypoint sequence updated without pausing or glitching. | **PASS** |
| **TC-06** | **Base Damage & Defeat Trigger** | Enemy reaches the base monolith at `(5, 19)`. | Enemy traverses entire path into Base tile. | Base health decreases by enemy base damage (1 HP); screen shakes; enemy removed without duplicate coin award. | Base HP decreased from 20 to 19; screen shake fired; no coins awarded; enemy cleanly purged from memory. | **PASS** |
| **TC-07** | **Leaderboard Sorting (Merge Sort)** | Leaderboard ranks multiple records including duplicate scores and tie-breaking. | Records submitted: Alice (500 pts, 4 waves), Bob (900 pts), Charlie (500 pts, 3 waves, 40s), Dave (500 pts, 3 waves, 25s). | Ranked list: 1. Bob (900), 2. Alice (500, 4 waves), 3. Dave (500, 3 waves, 25s), 4. Charlie (500, 3 waves, 40s). | Displayed order strictly matches multi-key tie-breaker; Merge Sort comparison stats collected accurately. | **PASS** |
| **TC-08** | **Circular Queue Edge Cases** | Circular buffer wraps around the array boundary and dynamically resizes. | Enqueue 4 items in capacity 4, dequeue 2 items, enqueue 3 more items (wrapping indices), then enqueue 1 more to trigger growth. | Queue wraps indices without shifting elements; on growth, doubles capacity to 8 and preserves exact FIFO order. | FIFO sequence `[1, 2, 3, 4, 5, 6]` preserved across growth; `head` reset to 0; no data loss. | **PASS** |
| **TC-09** | **LocalStorage Corruption Fallback** | LocalStorage contains malformed or corrupted JSON string. | Set `localStorage['td-dsalgo:leaderboard:v1'] = "{corrupt json..."`. Initialize `Leaderboard`. | Game survives without crashing; moves corrupted data to backup key; returns clean empty array. | `loadStatus` marked as `'corrupt'`; corrupted string backed up; game launches smoothly with empty table. | **PASS** |
| **TC-10** | **Terminal Game State Guard** | Base reaches 0 HP simultaneously as wave ends. | Trigger Base Health = 0. Call `gameState.end('gameover')` followed by `gameState.end('victory')`. | Once a terminal state is set, subsequent terminal calls are rejected; only Game Over is registered. | State remains `gameover`; double-triggering victory modal is prevented. | **PASS** |

---

## 3. Automated Vitest Test Suite Execution Logs

```
 ✓ tests/queue.test.js (8 tests)
     ✓ starts empty: isEmpty, size 0, dequeue/peek return undefined
     ✓ follows FIFO order
     ✓ peek does not remove the front item
     ✓ wraps around the end of the buffer without shifting
     ✓ grows when full and keeps FIFO order across the resize
     ✓ grows correctly when the content is wrapped
     ✓ counts lifetime enqueue/dequeue operations
     ✓ clear() empties the queue

 ✓ tests/sorting-leaderboard.test.js (19 tests)
     ✓ handles an empty array
     ✓ handles a single element
     ✓ sorts numbers and does not mutate the input
     ✓ matches a reference result on random data
     ✓ is stable for equal keys
     ✓ performs n-1 merges and at most n·log2(n) comparisons
     ✓ linearSearch finds an element and counts comparisons
     ✓ orders by score desc, then waves desc, then time asc, then timestamp asc
     ✓ keeps every record when scores are duplicated
     ✓ starts empty when nothing is stored
     ✓ survives corrupt JSON and keeps a backup
     ✓ treats a non-array value as corrupt
     ✓ drops malformed records but keeps valid ones
     ✓ adds records, ranks them with merge sort and returns the rank
     ✓ limits the display to the top 10
     ✓ rejects records with an empty name
     ✓ sanitizeName trims, strips control characters and limits length
     ✓ normalizeRecord rejects negative scores and arrays

 ✓ tests/systems.test.js (14 tests)
     ✓ never lets coins go negative
     ✓ ignores invalid amounts
     ✓ cannot be both game over and victory
     ✓ base health never drops below zero and reports destruction once
     ✓ clock only advances while playing
     ✓ spawns every enemy of a wave in FIFO order and then completes
     ✓ does not start a wave twice (duplicate trigger protection)
     ✓ does not complete a wave while enemies are alive
     ✓ a long frame releases several due spawns
     ✓ accepts a tower on free grass with enough coins
     ✓ rejects towers on road, rocks, water, occupied tiles and with too few coins
     ✓ barricades must go on road tiles, never on spawn or base
     ✓ compactInPlace removes items in one pass and preserves order
     ✓ swapRemove removes a single item in O(1) after locating it

 ✓ tests/graph-bfs.test.js (21 tests)
     ✓ adds nodes and undirected edges without duplicates
     ✓ removeNode deletes the node and every edge touching it
     ✓ builds 4-directional edges only between walkable cells
     ✓ restoreGridNode reconnects a removed cell
     ✓ finds the shortest path and reconstructs it from start to goal
     ✓ every consecutive pair in the path is an edge of the graph
     ✓ returns found=false with reason "unreachable" when no path exists
     ✓ handles missing start/goal nodes without throwing
     ✓ start equal to goal returns a single-node path
     ✓ respects a temporary blocked set without modifying the graph
     ✓ terminates on graphs with cycles and visits each node at most once
     ✓ collects consistent statistics
     ✓ parses a 20×12 map with one spawn and one base
     ✓ rejects malformed layouts
     ✓ finds the 24-cell middle route on the real map
     ✓ a barricade on the middle route forces the 28-cell north route
     ✓ rejects a barricade that would block the only remaining path
     ✓ rejects a barricade that would trap a living enemy
     ✓ cannot block the spawn or the base
     ✓ unblocking restores the shortest route
     ✓ records cumulative BFS statistics across runs

Test Files  16 passed (16)
Tests       200 passed (200)
Duration    5.82s
```

---

## 4. UI / UX Regression Suites (camera, badges, panels, contrast)

| Suite | Env | Tests | Guards against |
|---|---|:---:|---|
| `tests/camera-math.test.js` | node | 15 | Wrong tile under the cursor at non-1× zoom / panned cameras; zoom drifting off the cursor; camera escaping the map bounds; broken pinch resolution |
| `tests/upgrade-badge.test.js` | node | 9 | Badge label/price mismatches, unaffordable styling, badges drawn over the tower art at high zoom, badges blocking tile clicks |
| `tests/panel-placement.test.js` | node | 7 | Inspector opening off-screen or on top of the selected tower |
| `tests/hud-dom.test.js` | jsdom | 14 | HUD controls missing, buttons not forwarding callbacks, stale inspector after deselect, codex drawer not opening/live-updating, `reset()` leaving paused/locked UI behind |
| `tests/ui-contracts.test.js` | node | 6 | A UI method GameScene calls no longer existing on the class (the wave-3 freeze class of bug) |
| `tests/hud-boss-bar.test.js` | jsdom | 5 | Boss banner not appearing/updating, or throwing on an incomplete boss object |
| `tests/wave-flow.test.js` | node | 5 | Spawn stalls, waves that never complete, wave 5 outgrowing the 32-slot queue, bosses spawning at the wrong point |
| `tests/display-mode.test.js` | node | 17 | Orientation maths, handheld detection (incl. iPadOS desktop UA), gate policy, Fullscreen API vendor selection |
| `tests/orientation-gate.test.js` | node | 18 | Rotate→unlock, re-block on rotate-back, debounce, skip/re-arm, unsupported fullscreen, first-gesture arming, toggle |
| `tests/display-gate-dom.test.js` | jsdom | 14 | Real index.html gate markup, gates outside #app, inert/aria transitions, button callbacks, focus, HUD ⛶ mirroring |

Contrast is verified separately by `npm run check:contrast` (36/36 WCAG AA pairs, measured against
sampled sprite colours). Full UI notes: [ui-ux.md](ui-ux.md).


---

## 5. Root-cause fix: the wave-3 freeze

**Symptom:** the game stopped dead the moment wave 3 reached its boss, and again on wave 6.

**Root cause:** `GameScene`'s `onBossSpawn` callback calls `hud.showBossBar(enemy)`, but `HUD`
only ever implemented `showBossBanner`. Calling the missing method threw
`TypeError: this.hud.showBossBar is not a function` from inside `Enemy`'s constructor, i.e. inside
`WaveManager.update()` → `GameScene.update()` → Phaser's step callback.

That last step is what makes it fatal. Phaser's RAF driver schedules the *next* frame only after the
current one returns:

```js
// node_modules/phaser/src/dom/RequestAnimationFrame.js
this.step = function step (time) {
  _this.callback(time);                 // ← GameScene.update() runs (and throws) here
  if (_this.isRunning) {
    _this.timeOutID = window.requestAnimationFrame(step);   // ← never reached
  }
};
```

With the exception escaping, no further frame is ever requested: the canvas keeps the last rendered
image (matching the screenshot: "WAVE 3/6 · 17 spawning…", boss still queued) and no input is
processed. Waves 4–5 look fine only because they contain no boss; wave 6 has one, so it dies too.

**Fix:**

1. `HUD.showBossBar(boss)` now exists (and `showBossBanner` delegates to it). It is null-safe and
   tolerates an incomplete boss object; `updateBossBar` guards against NaN widths.
2. `GameScene.update()` wraps the frame in `try/catch` → `reportRuntimeError()`, which logs once per
   unique message and shows a toast. A future UI slip can no longer brick the loop.
3. `onBossPhaseChange` now also refreshes the phase badge/ability text, not just the HP bar.

**Regression cover:**

- `tests/ui-contracts.test.js` parses every `hud.x(...)` / `gameCodex.x(...)` / `gameLeaderboardUI.x(...)`
  / `audio.x(...)` call site in `src/` and asserts the method exists on the receiving class. It fails
  with `Missing HUD methods: ["HUD.showBossBar"]` when the bug is reintroduced (verified).
- `tests/hud-boss-bar.test.js` exercises the real DOM banner: reveal, HP/shield updates, hide, and a
  bare `{}` boss object.
- `tests/wave-flow.test.js` plays all six waves through `WaveManager` and asserts every spawn is
  released in order, the queue grows past its initial 32 slots, and each wave reports completion.
