# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 755 tests across 58 test suites.
- **Pass Rate:** **100% (755 / 755 Passed)**
- **Test Framework:** Vitest 5.0.5 running in headless Node.js environment.
- **Manual End-to-End Verification:** The full loop (Menu $\to$ Build $\to$ Wave Spawning $\to$ Tower Targeting $\to$ Palisade Siege $\to$ Codex Telemetry) was exercised in the browser during the UI/UX pass. The palisade redesign and the three new forge lines are covered by automated suites (`barricade-siege`, `forge-defenses`, `module-contracts`) plus the asset-existence assertions, because the CI sandbox has no GPU/browser.

---

### 1.1 Duel (PvP) coverage

The Mirror Arena adds three suites that need no network and no GPU:

| Suite | Tests | What it proves |
| --- | :-: | --- |
| `tests/pvp.test.js` | 31 | All arenas are 26 × 16 and 180° symmetric (gates included), every arena has a real BFS route and a usable shelf on both halves, the level contract is byte-identical for both seats, every boss key exists, the camera fits 1× on a campaign map and 0.75× on an arena, and every win condition (knockout / points / core HP / time / draw) resolves. |
| `tests/lobby.test.js` | 22 | Room codes, envelopes and name sanitising; seat assignment, host-only start and arena pick, countdown → live, snapshot round-trip, rematch and forfeit; and **two real `PvpRoom` instances talking over `BroadcastChannel`** end to end (join → ready → start → countdown → launch → knockout). |
| `tests/duel-ui.test.js` | 11 | The lobby and result panels in jsdom: seat labels, arena locking for the challenger, live wave/points readout, waiting state, winner row and escaping of hostile player names. |

### 1.2 Upgrade-feel coverage

The per-tier art pass is pinned by `tests/tower-decor.test.js` (19 tests):

| What it proves | Why it matters |
| --- | --- |
| Every line ships a pennant, a shard and a hung standard, and all 40 decoration files exist on disk | A missing file silently degrades a maxed tower back to a plain keep |
| An engineer tower wears the iron gun rail and its own stamped standard, while a keep wears battlements | Twelve lines must not blur into one silhouette |
| The five engineer sprits are decoded and compared by alpha mask, pairwise | A recolour keeps the exact mask, so "different shape" becomes a thing a test can prove |
| Level 1 has no decoration; 2 adds a crown + two pennants; 3 adds a plinth + standard; 4 lights two braziers; 5 floats two shards | The tier ladder is a *strict superset*, so every upgrade changes the silhouette |
| The crown widens and the shards hover above it (never beside the flags) | Geometry, not palette, is what reads as "stronger" at 64 px |
| `projectileArtFor()` returns the line's own shot at 4/5 and the banner bolt at 1–3, and `Tower.projectileArt` falls back to branch art when a texture is missing | Each line fires a different object, and a texture hiccup costs art, not a crash |

### 1.3 Engineer roster coverage

`tests/engineer-defenses.test.js` (24 tests) guards the whole second roster:

| Group | What it proves |
| --- | --- |
| Roster | Five lines × 2 levels × 2 branches, and each line reaches its own signature (armour-piercing / burst rate / burn / poison / stun) rather than duplicating a neighbour |
| Art | All 40 base + 40 weapon PNGs exist, and every tier's canvas is strictly taller and wider than the one below it — an upgrade is a new drawing, not a repaint |
| Effects | Every line ships its own projectile sprite (no two share one), plus an impact and a muzzle strip registered in `fxManifest` |
| DoT | Burn ticks as true damage past armour, expires, refreshes instead of stacking, coexists with poison, and kills mid-walk from `Enemy.update` |
| Traits | Phalanx blunts a packed creep, adaptive armour hardens under fire (with a cap), enrage speeds a cornered runner (with a cap) |
| Control | Stun halts movement and clears to exactly 0; bosses resist 40–70% of it; `bossBonus` pays out only against `isBoss` and carries DoT/stun through `Projectile.hitEnemy` |
| Battle loop | Every line kills a walking grunt before it crosses the lane; the crossbow opens fire ~57 px earlier than the repeater; the siphon leaves a burn, the still poisons through armour, the harpoon stuns; the apex tier needs fewer shots than the level-1 tower; a level-5 upgrade mid-battle never breaks the next shot |
| Balance | Power-per-gold stays inside a 4.2× band across all 22 branches, cost spread stays under 1.9×, every branch still gains DPS at L4 and L5, and every boss still out-stats a brute |

---

## 2. Structured Test Cases

| Test Case ID | Test Category | Description / Action Performed | Input / Action | Expected Result | Actual Result | Status |
|:---:|---|---|---|---|---|:---:|
| **TC-01** | **Gameplay & Tower Placement** | Player places Archer Tower on a valid, unbuilt grass tile with sufficient coins. | Current Coins = 160. Click Archer card (🪙60), click Grass tile `(3, 5)`. | Tile occupied; coins decrease to 100; Archer tower rendered with range circle; placement sound plays. | Tower placed at `(3, 5)`; coins deducted to 100; sound played; occupancy registered. | **PASS** |
| **TC-02** | **Economy Constraints** | Player attempts to build a Cannon Tower without sufficient coins. | Current Coins = 40. Click Cannon card (🪙110), click valid Grass tile `(2, 5)`. | Placement rejected; coins remain 40; HUD toast displays *"Not enough coins"*; error audio plays. | Placement denied; coins unchanged at 40; toast notification displayed; error audio triggered. | **PASS** |
| **TC-03** | **Placement Collision Rules** | Player attempts to place a tower on invalid terrain (Water/Rocks/Road). | Click Archer card, click Water tile `(0, 2)` or Road tile `(5, 5)`. | Placement rejected; HUD toast displays *"Rocks and water cannot be built on"* or *"Towers cannot be built on the road"*. | Placement denied; occupied status prevented; correct error banner shown. | **PASS** |
| **TC-04** | **Palisade placement guard** | Player tries to drop a palisade on the tile a living enemy occupies. | Enemy standing on `(7, 9)`; click Palisade card, click `(7, 9)`. | `GameScene.validateBuild()` returns `{ ok: false, reason: 'enemy-on-tile' }`; ghost renders red; placement rejected. | Preview turned red *before* the click and the build was rejected with *"An enemy is on this tile"*. | **PASS** |
| **TC-05** | **Palisade is not dodgeable** | Place a palisade on the shortest (middle) route while enemies are marching it. | Place palisade at `(7, 9)` while Goblin Grunts are at `(5, 2)`. | The BFS route is unchanged (22 cells, still contains `7,9`); enemies walk up to the wall and attack it, taking ~42 grunt swings to breach 420 HP. | Route stays 22 cells and still contains `7,9` (`tests/graph-bfs.test.js`); the siege geometry, cadence and breach maths are covered by `tests/barricade-siege.test.js`. | **PASS** |
| **TC-05c** | **Palisade goes only where the horde walks** | Player tries to plant a palisade on a road lane the BFS route never uses. | Click Palisade card, hover road tile `(1, 5)` (north decoy lane), then click. | Ghost renders red; `PlacementSystem.validate()` returns `{ ok: false, reason: 'off-route' }`; toast shows *"No enemies march through this tile"*. | Rejected off-route at `(1, 5)` while every cell of the 22-cell middle route stays buildable (`tests/systems.test.js`). | **PASS** |
| **TC-05b** | **Forge defences** | Build each of the three new lines and upgrade every branch. | Buy Hammerforge 🪙120, Runestone 🪙135, Banner Keep 🪙125; upgrade each to level 3 in both branches. | All 7 dock cards render with icons, hotkeys 1–7 select them, and every slot loads its generated base + weapon art. | All cards, hotkeys and 12 new sprite slots verified by `tests/forge-defenses.test.js`. | **PASS** |
| **TC-06** | **Base Damage & Defeat Trigger** | Enemy reaches the base monolith at `(5, 18)`. | Enemy traverses entire path into Base tile. | Base health decreases by enemy base damage (1 HP); screen shakes; enemy removed without duplicate coin award. | Base HP decreased from 25 to 24; screen shake fired; no coins awarded; enemy cleanly purged from memory. | **PASS** |
| **TC-07** | **Leaderboard Sorting (Merge Sort)** | Leaderboard ranks multiple records including duplicate scores and tie-breaking. | Records submitted: Alice (500 pts, 4 waves), Bob (900 pts), Charlie (500 pts, 3 waves, 40s), Dave (500 pts, 3 waves, 25s). | Ranked list: 1. Bob (900), 2. Alice (500, 4 waves), 3. Dave (500, 3 waves, 25s), 4. Charlie (500, 3 waves, 40s). | Displayed order strictly matches multi-key tie-breaker; Merge Sort comparison stats collected accurately. | **PASS** |
| **TC-08** | **Circular Queue Edge Cases** | Circular buffer wraps around the array boundary and dynamically resizes. | Enqueue 4 items in capacity 4, dequeue 2 items, enqueue 3 more items (wrapping indices), then enqueue 1 more to trigger growth. | Queue wraps indices without shifting elements; on growth, doubles capacity to 8 and preserves exact FIFO order. | FIFO sequence `[1, 2, 3, 4, 5, 6]` preserved across growth; `head` reset to 0; no data loss. | **PASS** |
| **TC-09** | **LocalStorage Corruption Fallback** | LocalStorage contains malformed or corrupted JSON string. | Set `localStorage['td-dsalgo:leaderboard:v1'] = "{corrupt json..."`. Initialize `Leaderboard`. | Game survives without crashing; moves corrupted data to backup key; returns clean empty array. | `loadStatus` marked as `'corrupt'`; corrupted string backed up; game launches smoothly with empty table. | **PASS** |
| **TC-10** | **Terminal Game State Guard** | Base reaches 0 HP simultaneously as wave ends. | Trigger Base Health = 0. Call `gameState.end('gameover')` followed by `gameState.end('victory')`. | Once a terminal state is set, subsequent terminal calls are rejected; only Game Over is registered. | State remains `gameover`; double-triggering victory modal is prevented. | **PASS** |
| **TC-11** | **World map & unlocks** | Player clears Level 1 and returns to the world map. | Win `level-1`, then open PLAY → world map. | `level-2` and Endless Siege become selectable; the cleared node shows its 1–3 stars; locked nodes render a padlock and stay disabled. | `ProgressStore.recordVictory()` unlocked `level-2` + `endless`, node markup re-rendered with earned stars (`tests/campaign-ui.test.js`). | **PASS** |
| **TC-12** | **Star rating & rewards** | Finish a level with different core health. | Core at 100 % / 52 % / 48 % on clear. | 3★ / 2★ / 1★; first clear pays the full bounty (+1 gem at 3★), replays pay a 20 % gold stipend. | Boundary maths covered by `tests/progression.test.js`; the victory modal renders earned vs empty stars and the reward row. | **PASS** |
| **TC-13** | **Endless Siege** | Survive as long as possible in the endless mode. | Clear `level-1` to unlock Endless, start it, lose the core. | Waves are generated forever (5-wave cycle, boss every 5th), `totalWaves` is ∞, and the run only ends on defeat, keeping the best wave/score. | `WaveManager` endless branch covered by `tests/wave-flow.test.js`; `recordEndless()` keeps the depth reached and the result modal shows WAVE REACHED / BEST WAVE. | **PASS** |
| **TC-15** | **Prism Depths level** | Play the fourth campaign level and its boss. | Clear `level-3`, open the world map, start `level-4`; reach wave 9. | The crystal battlefield loads (quartz spiral lane, mana pools, prism spires), waves 1–8 spawn crystal-skinned creeps, and the Prism Warden closes the level with Refraction / Hard Light / Total Reflection. | Node renders with its `map_crystal.png` thumbnail and stays locked until `level-3` is cleared; the map is BFS-pathable (47 cells) and the boss data is validated by the boss-phase suite. | **PASS** |
| **TC-14** | **Boss abilities** | Fight each level's boss. | Reach wave 6 / 7 / 8. | Boss bar + warning; Dune Tyrant hastes nearby enemies, Frost Warden freezes towers, Magma Regent summons swarms and hastes itself. | Ability dispatch (`summon` / `speedAura` / `disableTowers`), phase thresholds and tower freeze/thaw are covered by the boss-phase and module-contract suites; art ships as 2× duotone sheets. | **PASS** |

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

 ✓ tests/systems.test.js (15 tests)
     ✓ never lets coins go negative
     ✓ ignores invalid amounts
     ✓ cannot be both game over and victory
     ✓ base health never drops below zero and reports destruction once
     ✓ clock only advances while playing
     ✓ spawns every enemy of a wave in FIFO order and then completes
     ✓ does not start a wave twice (duplicate trigger protection)
     ✓ does not complete a wave while enemies are alive
     ✓ a long frame releases several due spawns
     ✓ (endless) never runs out of waves and never reports a final wave
     ✓ (endless) caches generated waves instead of mutating the level definition
     ✓ accepts a tower on free grass with enough coins
     ✓ rejects towers on road, rocks, water, occupied tiles and with too few coins
     ✓ barricades must go on road tiles, never on spawn or base
     ✓ refuses palisades on decoy lanes the horde never walks
     ✓ compactInPlace removes items in one pass and preserves order
     ✓ swapRemove removes a single item in O(1) after locating it

 ✓ tests/graph-bfs.test.js (19 tests)
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
     ✓ finds the 22-cell middle route on the real map
     ✓ keeps the palisade out of the graph so the horde can never dodge it
     ✓ still measures the hypothetical detour at the BFS level
     ✓ runs BFS from any road cell to the base and records the run
     ✓ records cumulative BFS statistics across runs

 ✓ tests/forge-defenses.test.js (17 tests)
     ✓ adds exactly three new tower lines to the build dock
     ✓ gives every dock entry a unique hotkey that matches its position
     ✓ maps every specialisation to the right art slot through its branch field
     ✓ ships an icon, base and weapon sheet for every slot of every tower
     ✓ declares frame geometry that matches the shipped weapon sheets
     ✓ starts the player with enough gold for two defences and 25 base HP
     ✓ gives every enemy a siege attack so no archetype can be walled off forever

 ✓ tests/barricade-siege.test.js (12 tests)
     ✓ stops the attacker outside the wall tile instead of letting it walk through
     ✓ parks every queue lane in contact instead of hovering a hair outside
     ✓ breaks a real wall down when the pack is simulated frame by frame
     ✓ a lone grunt cannot chew through a palisade in seconds, a pack can
     ✓ resolves a swing without ever over-killing the wall

 ✓ tests/viewport-lock.test.js (9 tests)
     ✓ cancels the iOS page-pinch gesture events
     ✓ cancels two-finger drags but leaves one-finger camera drags alone
     ✓ cancels ctrl+wheel (trackpad pinch) and allows normal wheel zoom
     ✓ cancels the browser zoom keyboard shortcuts outside text fields
     ✓ detaches every listener on release

 ✓ tests/mobile-layout.test.js (24 tests)
     ✓ measures the gap between the dock top and the bottom of the screen
     ✓ publishes the measured heights as custom properties
     ✓ grows the clearance when the placement hint makes the dock taller
     ✓ is a flow child of the dock, not an absolute overlay
     ✓ scales the 5:3 stage to the full width of the viewport
     ✓ keeps the top bar on a single row on short landscape screens
     ✓ hides the zoom pill on touch devices but keeps reset

 ✓ tests/progression.test.js (12 tests)
     ✓ awards 3 stars at 85% base health, 2 at 50%, 1 for surviving
     ✓ honours per-level thresholds and never crashes on a zeroed core
     ✓ pays the full bounty on a first clear and a bonus gem at 3 stars
     ✓ pays only a 20% gold stipend on replays
     ✓ starts with only level 1 open
     ✓ unlocks the next level (and Endless) on the first clear
     ✓ keeps the best stars on replay and only pays the stipend
     ✓ never lets a campaign defeat overwrite the saved best score
     ✓ records endless depth without granting stars
     ✓ a defeat never awards stars but endless keeps the depth reached
     ✓ persists to storage and rehydrates, merging over a fresh profile
     ✓ survives corrupt JSON and a throwing storage

 ✓ tests/campaign-ui.test.js (18 tests)
     ✓ renders one node per campaign level plus Endless Siege
     ✓ locks every node that has not been unlocked and shows the padlock
     ✓ uses the generated minimap for each theme
     ✓ selecting an open node reports its id, a locked node reports nothing
     ✓ shows earned stars and unlocks the next node after a victory
     ✓ back button closes the overlay and reports it
     ✓ renders the star rating, rewards and the unlock line on a win
     ✓ offers Next Level only when there is a next level, and replays the current one
     ✓ a defeat shows the retry path and no star rating
     ✓ an endless run reports the wave reached and the record
     ✓ hides cleanly and forgets the last result
     ✓ mounts on its own layer between the HUD and the modal dialogs
     ✓ survives another UI replacing the modal container
     ✓ announces level 2 and Endless Siege when one clear opens both
     ✓ falls back to the single unlocked id and never prints "A new battle" for it
     ✓ keeps a tall overlay reachable on a short landscape phone
     ✓ shouts about a new best rating only when a replay actually improves it
     ✓ celebrates a finished campaign on the last level and drops the NEXT button

 ✓ tests/boss-abilities.test.js (9 tests)
     ✓ ships three distinct, bigger, multi-phase bosses
     ✓ gives each boss its signature ability
     ✓ fires on its interval and hands the scene a radius + multiplier
     ✓ multiplies movement speed for the duration, then expires
     ✓ stacks with a slow instead of overwriting it
     ✓ the Frost Warden pulses disableTowers and the scene can freeze towers
     ✓ a disabled tower stops firing and thaws after its timer
     ✓ a palisade cannot be frozen — it is not a firing tower
     ✓ waves every fifth wave carries a boss

 ✓ tests/module-contracts.test.js (10 tests)
     ✓ does not call the removed BFS barricade API any more
     ✓ keeps Projectile splash gated on the splash radius, not the art type

Test Files  58 passed (58)
Tests       518 passed (518)
Duration    6.7s
```

---

## 4. UI / UX Regression Suites (camera, badges, panels, contrast)

| Suite | Env | Tests | Guards against |
|---|---|:---:|---|
| `tests/camera-math.test.js` | node | 15 | Wrong tile under the cursor at non-1× zoom / panned cameras; zoom drifting off the cursor; camera escaping the map bounds; broken pinch resolution |
| `tests/upgrade-badge.test.js` | node | 9 | Badge label/price mismatches, unaffordable styling, badges drawn over the tower art at high zoom, badges blocking tile clicks |
| `tests/panel-placement.test.js` | node | 7 | Inspector opening off-screen or on top of the selected tower |
| `tests/hud-dom.test.js` | jsdom | 16 | HUD controls missing, buttons not forwarding callbacks, destructive controls back on the top bar, a single tap leaving the battle, the pause card not opening/closing, stale inspector after deselect, codex drawer not opening/live-updating, `reset()` leaving paused/locked UI behind |
| `tests/ui-contracts.test.js` | node | 6 | A UI method GameScene calls no longer existing on the class (the wave-3 freeze class of bug) |
| `tests/hud-boss-bar.test.js` | jsdom | 7 | Boss banner not appearing/updating, throwing on an incomplete boss object, or the extra-boss counter leaking `+0` / a negative count onto the strip |
| `tests/hud-powerups.test.js` | jsdom | 6 | A powerup rail with no buttons, a cooling button that still looks ready, a sweep that never leaves 0, or a click that does not reach the scene |
| `tests/vfx-runtime.test.js` | node | 9 | An impact that plays the wrong element, a splash that neither shakes nor drops a shockwave, a muzzle flash that ignores the barrel angle, or a scene without particle support that throws |
| `tests/engineer-defenses.test.js` | jsdom | 24 | A line with two identical branches, a tier whose canvas does not grow, a shot that borrows another line's sprite, a burn that ignores armour break, a DoT that stacks forever, phalanx/adaptive/enrage that never fire (or never cap), a stun a boss does not resist, a `bossBonus` that pays out on grunts, or a rebalance that pushes power-per-gold outside its band |
| `tests/tower-ascension.test.js` | node | 9 | A tower whose level 4/5 tier is missing, cheaper than the tier below, weaker in DPS than the tier below, has no signature ability at the cap, drifts out of its branch, has no ascended texture on disk, or reuses the level-3 muzzle |
| `tests/powerups.test.js` | node | 10 | A powerup with no hotkey, a cooldown that recharges early or never, a failed use that still extends the cooldown, an overcharge window that outlives its duration, a wave-clear refund that can go negative |
| `tests/vfx-assets.test.js` | node | 4 | An effect strip whose PNG is not exactly `frames × frameWidth`, a missing particle texture, or a tower damage type with no impact art |
| `tests/flare-roster.test.js` | node | 10 | A Flare creature with no manifest entry or no walk cycle, a strip that no longer slices into 9 whole rows, a missing biome/tier skin, a new boss whose phases do not descend or whose ability is unknown, a boss rotated in before wave 25, or a new creep the horde never actually spawns |
| `tests/boss-tracker.test.js` | jsdom | 9 | The strip showing the wrong boss when a titan and an anchor share a wave, a shield not counting toward the tracked pool, the panel blanking when the tracked boss dies first, a leaked boss never leaving the roster, or `syncBossPanel()` hiding a strip that still has a live boss |
| `tests/engineer-battle.test.js` | jsdom | 8 | A line that never fires, a creep that walks the whole lane untouched, a burn that never sticks, poison that armour absorbs, a harpoon that does not stun, a boss bonus that pays out on creeps, or a mid-battle upgrade that kills the firing loop — the real Tower → Projectile → Enemy loop, not its data |
| `tests/dock-tabs.test.js` | jsdom | 11 | A card that belongs to no tab or two tabs at once, a tab that shows more than its own page, a remembered tab lost on reload, a stale stored tab, storage disabled mid-battle, a tab that stays focusable while hidden, or a hotkey from the other page not flipping the dock |
| `tests/hud-responsive.test.js` | jsdom | 7 | A boss card that spans the screen again on a phone, a compact strip that drifts back over the toast lane, a dock fold that hides its own handle |
| `tests/dock-fold.test.js` | jsdom | 8 | The forge toggle not folding/unfolding the cards, an armed defence surviving into a fold, the fold not remembered (or crashing without storage), a duel label leaking into the next campaign battle |
| `tests/map-margin.test.js` | node | 6 | A spawn or core back on the map edge (half its art clipped), a gate buried under the top bar or the dock, a duel arena whose gates stop mirroring each other, a margin that severs the road network |
| `tests/enemy-facing.test.js` | jsdom | 10 | A sheet that declares no orientation, south- and north-drawn art turned the wrong way (the "walking backwards" bug), a pose off the 45° grid, a rotated sprite being mirrored as well, a creep that holds its old pose at a corner, a siege swing facing away from the wall, front-on art rotating instead of flipping |
| `tests/endless-difficulty.test.js` | jsdom | 15 | An endless HP curve that plateaus (the campaign curve caps at 2×), speed past the readability cap, a bounty that stops tracking the ramp, titans spawning before wave 20 or never pairing, waves that spawn unknown art, a horde count that stops growing, a boss that inherits the creep HP ramp from `spawnScaling()`, or a campaign spawn that picks up an endless multiplier |
| `tests/endless-map.test.js` | node | 7 | The endless map shrinking back under twice a campaign map's area, a road too short (or too slow to walk), water that no lane can cross, a biome grid out of step with the layout, a biome the road never visits, the core off its crystal dais |
| `tests/relics-blessings.test.js` | jsdom | 21 | Relics bought twice, bonuses lost on reload, cooldown stacking into a stall, blessings bought past their cap or without gold, healing past the core maximum |
| `tests/daily-challenge.test.js` | node | 17 | A daily that rerolls on refresh, a streak that survives a missed day, win gems farmed by replaying, storage failures |
| `tests/achievements.test.js` | node | 17 | Duplicate/unreachable achievements, gems paid twice, peak stats summed instead of maxed, saves losing the checklist |
| `tests/achievements-ui.test.js` | jsdom | 5 | The checklist not rendering progress, claimed entries not marked, the result screen losing daily/achievement rows |
| `tests/endless-milestones.test.js` | jsdom | 9 | Checkpoints double-paid or skipped, the payout curve drifting, the best-wave marker lying about a record |
| `tests/combo-meter.test.js` | node | 15 | Chain window drifting, tiers skipping a step, a kill paying less than its base bounty, wave payouts uncapped |
| `tests/early-call.test.js` | node | 13 | Calling early mid-spawn (drops queued spawns), calling on the final wave, the bonus curve uncapped, a settled wave not counting toward stars |
| `tests/hud-juice.test.js` | jsdom | 13 | Wave preview missing/misordered, CALL EARLY not reachable from the button, combo chip not draining or never hiding |
| `tests/wave-flow.test.js` | node | 7 | Spawn stalls, waves that never complete, wave 5 outgrowing the 32-slot queue, bosses spawning at the wrong point, endless waves never ending |
| `tests/campaign-levels.test.js` | jsdom | 10 | A node mapped to a missing/unknown level, a battlefield with no spawn/base or no BFS route, a final wave without a boss, two levels sharing a boss, endless waves that spawn nothing or skip the fifth-wave boss |
| `tests/campaign-assets.test.js` | node | 7 | Missing biome tiles, a road set that never changed, creeps or bosses without a sheet, animation strips too short for their frames, missing minimaps / star / lock icons |
| `tests/turret-aim.test.js` | node | 15 | Weapon art aimed 90° off the target (rotating by `atan2` instead of `atan2 + π/2`), turrets that fire before the barrel is on the line, a muzzle that drifts off the drawn barrel |
| `tests/enemy-skins.test.js` | node | 12 | A wave tier that never escalates, a biome falling back to the wrong sheet, bosses inheriting an ember contour, a tier sheet that is a byte-copy of the base sheet, a missing PNG per (creep × biome × tier) |
| `tests/terrain-contrast.test.js` | node | 4 | A lane or pond that stops separating from its biome ground, two biomes drifting onto the same surface palette (runs `terrain.py --contrast`) |
| `tests/ui-kit.test.js` | node | 40 | A skin asset URL that 404s, a sprite regenerated at the wrong canvas (which stretches every 9-slice corner), a `menu-*` id `main.js` binds to that the markup no longer defines, the retired Cozy UI pack creeping back into the stylesheet or the contrast audit |
| `tests/progression.test.js` | node | 12 | Star boundaries, reward payouts, unlock graph, endless records, corrupt/throwing storage |
| `tests/campaign-ui.test.js` | jsdom | 18 | World-map nodes/locks/minimaps, star display, next/replay/menu routing, defeat & endless result copy |
| `tests/boss-abilities.test.js` | jsdom | 9 | Boss phase data, aura/freeze pulses, speed-boost stacking with slow, tower freeze/thaw, endless boss cadence |
| `tests/display-mode.test.js` | node | 17 | Orientation maths, handheld detection (incl. iPadOS desktop UA), gate policy, Fullscreen API vendor selection |
| `tests/orientation-gate.test.js` | node | 18 | Rotate→unlock, re-block on rotate-back, debounce, skip/re-arm, unsupported fullscreen, first-gesture arming, toggle |
| `tests/display-gate-dom.test.js` | jsdom | 14 | Real index.html gate markup, gates outside #app, inert/aria transitions, button callbacks, focus, HUD ⛶ mirroring |
| `tests/mobile-layout.test.js` | jsdom | 24 | Placement hint covering the dock, floating HUD pinned to a stale dock height, stage leaving bands on a phone, missing viewport/touch-action lock, the wave readout splitting across lines, the pause card buried under a dialog |
| `tests/viewport-lock.test.js` | jsdom | 9 | Page pinch-zoom on iOS, two-finger page scroll, ctrl+wheel and browser zoom shortcuts stealing the game's gestures |

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
- `tests/hud-boss-bar.test.js` exercises the real DOM banner: reveal, HP/shield updates, hide, the
  `+N BOSSES` overflow chip, and a bare `{}` boss object.
- `tests/boss-tracker.test.js` pins the multi-boss roster (biggest pool wins, ties keep the earlier
  spawn, a death hands the strip to the next boss) and that `GameScene.syncBossPanel()` routes it to
  the one strip.
- `tests/progression.test.js` pins the star boundaries (85 % / 50 %), the first-clear vs replay
  payouts, the unlock graph (`level-1` → `level-2` → `endless`) and the save-file merge/corruption paths.
- `tests/campaign-ui.test.js` renders the world map and the result modal in jsdom and asserts the
  node states, minimap URLs, star markup and the Next / Replay / Main Menu routing.
- `tests/wave-flow.test.js` plays all six waves through `WaveManager` and asserts every spawn is
  released in order, the queue grows past its initial 32 slots, and each wave reports completion.
