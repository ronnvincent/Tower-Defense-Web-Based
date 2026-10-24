# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 62 tests across 4 test suites.
- **Pass Rate:** **100% (62 / 62 Passed)**
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

Test Files  4 passed (4)
Tests       62 passed (62)
Duration    271ms
```
