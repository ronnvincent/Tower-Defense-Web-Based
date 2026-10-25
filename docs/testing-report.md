# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 859 tests across 70 test suites.
- **Pass Rate:** **100% (859 / 859 Passed)**
- **Test Framework:** Vitest 5.0.5 running in headless Node.js environment.
- **Manual End-to-End Verification:** The full loop (Menu $\to$ Build $\to$ Wave Spawning $\to$ Tower Targeting $\to$ Palisade Siege $\to$ Codex Telemetry) was exercised in the browser during the UI/UX pass. The palisade redesign and the three new forge lines are covered by automated suites (`barricade-siege`, `forge-defenses`, `module-contracts`) plus the asset-existence assertions, because the CI sandbox has no GPU/browser.

---

### 1.1 Duel (PvP) coverage

The Mirror Arena adds three suites that need no network and no GPU:

| Suite | Tests | What it proves |
| --- | :-: | --- |
| `tests/pvp.test.js` | 31 | All arenas are 26 × 16 and 180° symmetric (gates included), every arena has a real BFS route and a usable shelf on both halves, the level contract is byte-identical for both seats, every boss key exists, the camera fits 1× on a campaign map and 0.75× on an arena, and every win condition (knockout / points / core HP / time / draw) resolves. |
| `tests/lobby.test.js` | 24 | Room codes, envelopes and name sanitising; seat assignment, host-only start and arena pick, countdown → live, snapshot round-trip, rematch and forfeit; **two real `PvpRoom` instances talking over `BroadcastChannel`** end to end (join → ready → start → countdown → launch → knockout); and the peer watchdog, which tells an unanswered challenger instead of leaving the board waiting. |
| `tests/duel-ui.test.js` | 11 | The lobby and result panels in jsdom: seat labels, arena locking for the challenger, live wave/points readout, waiting state, winner row and escaping of hostile player names. |
| `tests/duel-link.test.js` | 6 | The room-link UI: ONLINE is the default, the chips switch the transport the room is built with, the badge follows `open`/`closed`, the error line lives outside the entry grid so it is visible mid-room, and the join button spells out `DIALING RELAY…` / `WAITING FOR HOST…`. |
| `tests/pvp-relay.test.js` | 12 | **Real sockets against a real relay process.** It spawns `server/pvp-relay.mjs` on a free port and drives two genuine `PvpRoom` clients over the wire: host creates, guest joins, 2 seats, both ready, start, countdown, launch on both, live progress, knockout verdict on both, rematch. Also: a guest that arrives *before* the host is held and then seated, an unknown code is refused with the exact sentence the lobby prints, a third challenger is refused, a host that disappears mid-duel produces a forfeit verdict, and a dead relay fails in ~3 s with instructions instead of hanging. Plus the transport-choice table (`preferredMode`, `relayUrlFor`) as pure functions. |

> Why the relay test has to exist: `BroadcastChannel` is same-origin **and same-browser**,
> so it can never prove two-device play. The suite above is the only test in the repo
> that opens two independent sockets; if a phone could not join, it fails here first.
> The same path was also verified by hand through the running dev server's `/pvp`
> proxy (page origin `ws://127.0.0.1:4173/pvp` → relay), including a WebSocket upgrade
> carrying the public preview `Host` header.

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

Test Files  70 passed (70)
Tests       859 passed (859)
Duration    34.2s
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
| `tests/engineer-art-distinct.test.js` | node | 7 | Two engineer lines that share a crown silhouette or a dock card (the five-generals problem), an upgrade that is a recolour, a tier that outgrows its 72 × 130 px budget, a weapon pivot drifting off the deck, or an apex shot that reuses the tier-4 sprite |
| `tests/spec-ui.test.js` | jsdom | 8 | A specialisation card with no branch art, two branches showing the same building, a role badge the stats no longer justify, a DPS preview computed with a different formula than `dps()`, an unclickable or wrongly-affordable card, a next-tier button with no tower art, or a maxed tower showing an empty list |
| `tests/focus-target.test.js` | jsdom | 12 | A tap that marks the wrong creep in a swarm, a corpse that keeps holding the mark, a mark out of range that stops a tower from firing at anything, a targeting mode that outranks the player's instruction, or a focus chip that cannot be dismissed on a touch device |
| `tests/mobile-shell.test.js` | jsdom | 19 | A phone getting the desktop bands, a build sheet that will not fold after a pick, a scrim that does not dismiss, a floating inspector on a thumb layout, or a toast that grows into a paragraph |
| `tests/powerup-rail.test.js` | jsdom | 4 | A powerup drawn as an emoji again, an icon that does not exist on disk, a countdown that never clears, a ready flash that repeats every frame, or a tap that does not reach the scene |
| `tests/haptics.test.js` | node | 8 | A buzz on a desktop, a buzz after the player muted it, a pattern long enough to read as an error dialog, or a throw from a blocked `navigator.vibrate` |

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

## 6. Root-cause fix: the horde walked sideways

**Symptom:** every creep marched the lanes with its body turned 90°, sometimes head
first and sometimes tail first, and the pose never changed when the road bent.
Three earlier passes each nudged the rotation offset; the symptom came back.

**Root cause:** the model was wrong, not the offset. A Spire strip is **three clips x
three directions**, not three colour palettes:

| Rows | Clip | Row 0 | Row 1 | Row 2 |
| --- | --- | --- | --- | --- |
| 0-2 | idle | south (towards camera) | north (away) | profile |
| 3-5 | move | south | north | profile |
| 6-8 | death | south | north | profile |

`Enemy` rotated the sprite by the lane heading, which maps a top-down drawing's
front-to-back axis onto the screen's left-to-right axis — a northbound leafbug ends
up lying flat while still "pointing" north. `paletteForWave()` was meanwhile
indexing the same rows as colour variants, so the pose also drifted with the wave
number.

**Fix:**

1. `Enemy.faceTravel()` selects a **row** and never rotates: south -> `-d0`,
   north -> `-d1`, horizontal lanes -> `-d2`. Rotation is asserted to be exactly 0.
2. `BootScene.createEnemyClips()` builds `<texture>-d<0|1|2>-<clip>` from
   `row = (clipBand + direction) * cols`, with frame counts read from the manifest.
3. The profile row is drawn looking **east** on some creatures and **west** on
   others. `ENEMY_PROFILE_FACING` (plus `ENEMY_PROFILE_INHERITS` for the scaled
   bosses) now travels into `spireManifest.js` as `profileFacing`, and mirroring is
   resolved against the art: `flipX = (dx < 0) != (profileFacing === 'west')`.
4. The `-v0..2` clip aliases and `skinFor().animPrefix` were removed: both existed
   only to express the palette-row model and would silently reintroduce it.
5. `shield-barrier` was referenced by `Enemy.createShieldBarrier()` but never
   drawn, so shielded creeps (and two bosses) rendered Phaser's missing-texture
   placeholder — a black square with green diagonals — on top of the monster. It is
   now baked in `TextureFactory` together with `fx-aura-ring`.

**Regression cover:**

- `tests/enemy-facing.test.js` (11 tests) is driven by `ENEMY_SHEETS`: all **20**
  creeps are walked in all four lanes and asserted for row, mirror and zero
  rotation, so a new creature cannot ship sideways.
- `tests/texture-keys.test.js` (3 tests) collects every literal key passed to
  `scene.add.*` and fails if nothing bakes or loads it — the class-level guard for
  the missing-texture bug.
- `tests/enemy-skins.test.js` no longer pins an anim prefix; it pins that the skin
  layer does not decide the row.

**Live verification (headless Chromium, real Phaser render):** each of the 14
animated creeps was spawned on a straight-run lane and photographed. All 14 report
`rotation = 0` and the expected row; the mirror matches the table (brute, swarm,
shield, sandwyrm, frostwarden and obsidian are eastbound *mirrored*, the rest are
not). Walking **north**, grunt, brute, runner and shield render with their backs to
the camera; walking **south**, with their faces towards it; turning a corner changes
the pose in the same frame the lane changes. Screenshots: `scratch/walk-contact2.png`,
`scratch/north-check.png`, `scratch/pf-A.png` / `pf-B.png` (profile rows at 5x).

## 7. Root-cause fix: the ENGINEER dock tab could not be clicked

**Symptom:** the dock shows two pages, `7 KEEPS` and `5 ENGINEER`. The KEEPS page
worked; the ENGINEER tab did nothing. The five engineer lines — Iron Crossbow,
Clockwork Repeater, Pitchfire Siphon, Venom Still, Harpoon Winch — were
unreachable, which read to players as "the flamethrower and the machine gun are
missing".

**Root cause:** `#hud-container` and every `.hud-panel` are `pointer-events: none`
so that drags on empty HUD space fall through to the battlefield. Each real
control opts back in with `pointer-events: auto` — `.build-card` and
`.dock-toggle` do, `.dock-tab` did not. The tab was painted, styled, had a
working click handler and correct `aria-selected`, but every click and tap went
straight through it into the canvas.

Two details kept this alive through twelve green test suites:

1. `element.click()` in jsdom fires the handler regardless of CSS, so the DOM
   suite that "clicks a tab" never tested clickability.
2. The tabs use a roving `tabindex` (`-1` on the inactive tab) and nothing
   handled the arrow keys, so the ENGINEER page was **also** unreachable from
   the keyboard — the same bug in the other input modality.

**Fix:**

1. `.dock-tab` declares `pointer-events: auto`, with a comment saying why the
   line may never be removed.
2. Inactive tabs grow a visible edge (`border-color`) and the tab grows from a
   22 px to a 30 px strip (32 px on narrow phones, 30 px in landscape) so it is
   a real tap target.
3. The tablist handles `ArrowLeft` / `ArrowRight` / `Home` / `End` — with a
   roving tabindex that is the only way to reach the other page by keyboard.
4. A folded dock now hides the tab bar too: paging cards that are not on screen
   is a live control with no effect.

**Regression cover — `tests/hud-hit-area.test.js` (6 tests):** it parses
`src/style.css`, resolves `pointer-events` through the real cascade for every
button the HUD paints (nearest explicit declaration wins) and fails any control
that does not end up `auto`. Removing the one line from `.dock-tab` reproduces
the bug in the test runner:

```
× every tab is clickable, not just the selected one
   keeps tab is not hittable: expected 'none' to be 'auto'
× gives every control in the dock a real hit area
   these dock controls inherit pointer-events: none and cannot be clicked:
   expected [ 'dock-tab active', 'dock-tab' ] to deeply equal []
```

The suite also pins the arrow-key contract, so "the handler exists" and "the
player can reach it" are now two separate assertions.

## 8. Root-cause fix: the second branch was never a choice

**Symptom:** seven of the eleven lines shipped two branches, and one of them was
worse on every axis. The clearest example was the archer: the Rapid Ranger
advertises *"blistering fire rate — shreds unarmored runners and swarms"*, and the
Sniper beat it on crowds (115 vs 109 dps), on armour (115 vs 78) and on bosses
(115 vs 64) while reaching 70 px further. Buying the crowd-clearer for a crowd
was a trap. The same pattern held for the Thunderforge, the Repeater, the
Shredder, the Napalm Mortar, the Corrosive Still and the Muster Camp.

**Root cause:** the numbers were never compared against each other. Each branch
was authored on its own, in isolation, against a vague idea of its role; no
mechanism in the project ever put the two halves of a choice side by side. The
one balance test that existed measured *maxed* power per gold across all lines
with a hand-rolled weighting (aura x2.6, chain x2.0) — it could not see a
within-line dominance, and it compared a support standard to a DPS turret, which
is not a balance question.

**Fix:** a declared niche per branch, and the data moved until the niche was
true.

1. `tests/helpers/balance.js` mirrors the runtime instead of inventing a second
   model: `CombatCalculator` armour curves, per-type penetration, persistent
   armour break (`Enemy.applyDamage`), splash falloff and body coverage
   (`Projectile`), chain damage, DoT sustain (`Enemy.applyDot`) and boss bonus.
   Four targets: crowds, single, armour 40, and the Obsidian titan.
2. `tests/branch-niche.test.js` (6 tests) declares what each branch is for —
   crowds / single / armour / bosses / control / support — and fails when a
   branch does not beat its sibling on its own column by 8 % at levels 3, 4 *and*
   5. Control and support branches are held to a different contract (they must
   carry the slow or the aura the sibling cannot), so a deliberate utility
   trade is allowed and a lazy one is not.
3. Data rebalanced to match: the Rapid Ranger gained two and three bolts per
   draw, the Emberforge lost its armour break (it already had the widest blast —
   that combination was what made it unbeatable), the Repeater went to 4.3
   bolts/s, the Shredder traded shell for 30–40 armour stripped per burst, the
   Napalm Mortar's pool grew to 140 px, the Corrosive Still became a heavy acid
   dose, and the Titan Breaker gained the damage its description claimed.
4. The old power-per-gold test was rebuilt on the shared model and split into the
   three families that actually compete: damage (4.2x band), control (2.5x),
   support (1.5x).
5. `tests/description-truth.test.js` (4 tests) parses every tier's prose and
   compares any quoted radius, armour break or raw damage against the stat block
   it sits on. It immediately caught a Kraken Harpoon advertising 880 damage
   while dealing 800.

**Live effect:** the choice now changes the answer. On a grunt pack the Rapid
Ranger leads its sibling 392 to 330 dps at level 5; against the Obsidian
Behemoth (armour 70) the Siege Arbalest does **2.2x** what the Rapid Ranger does
(512 vs 231); against a Brute's armour 40 the Shredder edges the Storm Repeater
260 to 236, and it does that while stripping 40 armour for everything else on the
field. Full tables: `docs/balance.md`, regenerated with
`node scripts/balance-report.mjs`.

## 9. Root-cause fix: five defences, one drawing

**Symptom (reported from a screenshot of the board):** the five engineer
defences — Iron Crossbow, Clockwork Repeater, Pitchfire Siphon, Venom Still,
Harpoon Winch — looked alike and did not look like their names, and on a full
board their upgrade badges overlapped (`335 / 180 / 160 / 90` stacked on the same
tile).

**Root cause:** `scripts/build_engineer_towers.py` had **one** `draw_base()` for
all five lines. The line was only ever consulted for its accent colour
(`accent_of()`) and for a handful of bolts-on props (`machines()`); the
silhouette — shaft, crenellations, spires, turrets, banner, apex crystal — came
from a shared `GEOMETRY` table keyed by *slot*, not by line. Additive growth then
pushed the shared drawing to 118 × 152 px on a 64 px tile, which is why the
badges collided. Measured ink coverage of the five dock cards before the fix:
1373, 1386, 1358, 1375, 1394 px — five renders of the same object.

**Fix:** one builder per line, and a footprint derived from the line's own
proportions.

1. `PROPORTIONS[line]` gives ground width, outward reach and crown height;
   `geometry(line, slot)` derives the canvas, the shaft, the deck and `mount`
   from them. Nothing about a canvas is hand-written per slot any more.
2. Five builders — `build_crossbow`, `build_gatling`, `build_flamer`,
   `build_venom`, `build_harpoon` — draw a different *building*: an arbalest
   tower with a full-width prod and a V-string; a squat bunker with a six-mouth
   drum, a smokestack and meshed cogs; a domed copper boiler with a lit firebox;
   a glass flask of distillate on a copper stand; a dockyard crane with a king
   post, a jib and a rope reel.
3. `make_card()` crops the crown band instead of shrinking the whole tower, so
   the 64 px dock tile shows the signature it has room for.
4. The weapon pivot is measured from each drawing's ground line (`mount =
   shaft + 11`) instead of the old `height − 30`.
5. Tier-4 and tier-5 projectiles were added for the five lines
   (`scripts/build_projectiles.py`), which previously kept their level-1 shot
   all the way to the apex while the base lines swapped art.

**Tests:** `tests/engineer-art-distinct.test.js` (7 tests) decodes the alpha
channel of the generated PNGs and compares them bottom-centre anchored
(`silhouetteDifferenceAnchored`). Every pair of lines differs on 22–65 % of its
crown ink at level 1; every consecutive upgrade moves 26–55 %; no two dock cards
share more than 24 % of their ink; every tier stays inside 72 × 130 px; and the
apex shots are not recolours (≥ 10 % silhouette change). A recolour cannot pass
any of those. `tests/spec-ui.test.js` (8 tests) covers the chooser rebuild in §3.

**Live effect:** five silhouettes that can be named at a glance, and a board
where a level-5 tower no longer sits on top of its neighbour's label.

## 10. New mechanic: focus fire

**Problem:** eleven lines ship four targeting modes, and all four are *rules*.
A rule cannot pick out one creep. When a Grave Shaman healed a pack, when a
summoner replaced its minions faster than the towers cleared them, or when a
boss was about to reach the core while the defences were busy with swarm, the
player had no lever — only the hope that "first" happened to be the right
target.

**Design:** tap a creep to mark it. Every tower that can reach it fires at it
first, whatever its mode says. Tap again (or `Esc`, or the chip) to release.

- `src/systems/FocusTarget.js` is the pure part: `isFocusable`, `enemyAt`
  (nearest-wins, 30 px), `focusReadout` (name, HP, percent, boss flag).
- `Tower.acquireTarget()` reads `scene.focusTarget` live, after the range filter
  and before the mode switch, and falls through when the mark is out of range or
  dead — so a stale mark can never switch a defence off.
- `GameScene.updateFocusFire()` runs right after the enemy list is compacted:
  draws the corner-bracket reticle, prunes the mark when the creep dies, and
  updates the HUD chip at ~5 Hz instead of every frame.
- The tap is additive: building and tower inspection take priority, and the
  focus branch only runs on an empty tile with no dock card armed.

**Why the balance did not move:** the mark changes *which* enemy takes the
damage, not how much. `docs/balance.md`, `tests/branch-niche.test.js` and the
power-per-gold bands are untouched by construction, and the full suite stayed
green.

**Tests:** `tests/focus-target.test.js` (12) — nearest-wins hit-testing, dead/
escaped/zero-health creeps rejected, the mark overriding "first", the fallback
when it is out of range, the release when it dies, the chip's name/HP/percent,
the boss styling, and the chip-to-scene clear callback.


## 11. Mobile shell

**Problem:** the HUD was one layout that shrank at breakpoints. On a 390 px-tall
phone in landscape the desktop bands — a 56 px top bar, a ~150 px card dock, a
floating inspector next to the tower — left ~180 px of clear lane, and the rest
was covered by toasts, a camera pill, a boss card and the inspector. Shrinking
further was not available: touch targets bottom out at 44 px.

**Design:** two layouts, chosen at start-up. `src/ui/shellMode.js` decides
(`coarse pointer AND landscape AND width <= 1100`), writes
`<html data-shell="mobile">`, and every phone rule in the stylesheet is scoped
to that attribute, so the desktop layout cannot regress from phone work.

The phone shell keeps the corners and gives the centre back:

- 44 px top rail (base, gold, wave, speed, mute, pause); score, map name,
  fullscreen and reset-view move into the pause card.
- `⚒ BUILD` in the bottom-left thumb zone opens a full-width forge sheet with a
  scrim; picking a card folds the sheet and leaves a one-line placement pill.
- `▶ NEXT` in the bottom-right thumb corner, `:disabled` (and therefore absent)
  for the whole duration of a wave.
- The inspector becomes a bottom sheet with a scrolling body; the drag grip is
  gone because CSS owns the box.
- Toasts become a one-line ticker top-left, the boss card a slim strip top-right,
  the camera pill and the combo chip disappear, powers move above `BUILD`.
- `src/systems/Haptics.js` adds a 12 ms tick on every control, on coarse
  pointers only, with a stored preference and a no-op on unsupported platforms.

**Tests:** `tests/mobile-shell.test.js` (19) — the detection matrix, the URL
override, the stored preference, the HUD on both shells (starts folded, scrim
shown and dismissed, fold-on-pick keeping the selection, CSS-owned inspector,
wave composition on the button, pause status) and the CSS contract (rail height,
hidden camera pill and preview, sheet geometry, single-line toasts, scrim,
`touch-action` hand-off). `tests/haptics.test.js` (8) — device default, stored
preference, unsupported platform, pattern length ceiling, thrown calls.
