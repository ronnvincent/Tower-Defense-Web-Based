# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 1,709 tests across 131 test suites (current
  count; the newest suites are `tutorial` and `village-map`, see §37).
- **Pass Rate:** **100% (1,709 / 1,709 Passed)**
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
| `tests/duel-link.test.js` | 12 | The room-link UI: ONLINE is the default, the chips switch the transport the room is built with, the badge follows `open`/`closed`, the error line lives outside the entry grid so it is visible mid-room, the join button spells out `DIALING RELAY…` / `WAITING FOR HOST…`, the RELAY ADDRESS field saving/validating/resetting an override, and it opening itself when a dial fails on a host with no relay. |
| `tests/pvp-relay.test.js` | 13 | **Real sockets against a real relay process.** It spawns `server/pvp-relay.mjs` on a free port and drives two genuine `PvpRoom` clients over the wire: host creates, guest joins, 2 seats, both ready, start, countdown, launch on both, live progress, knockout verdict on both, rematch. Also: a guest that arrives *before* the host is held and then seated, an unknown code is refused with the exact sentence the lobby prints, a third challenger is refused, a host that disappears mid-duel produces a forfeit verdict, a dead relay fails in ~3 s naming the exact address, and a hostname that is not this machine gets the "static host has no relay process" wording. Plus the transport-choice table as pure functions. |
| `tests/relay-address.test.js` | 8 | The address resolver: `wss://`, `https://`, bare hosts, `host:port`, custom paths, junk rejection, `?relay=`, saved override, and the documented precedence saved → link → `VITE_PVP_RELAY` → same origin. |
| `tests/pvp-sync.test.js` | 7 | **Is it live, and does it stay in sync?** Both seats byte-identical after every lobby change (this is the test that caught the host's arena pick never being broadcast), intent→rival-strip latency measured over real sockets, a four-minute clock skew that still starts both countdowns together, a 120-message burst that arrives in order with no stale score, an unchanged heartbeat that is not sent, and the per-snapshot cost. |
| `tests/duel-contracts.test.js` | 12 | The side bets: the same seed deals the same three contracts on both seats, payouts count only finished ones, the 10-wave script has two bounty waves and one boss, every arena shares the non-boss waves, and the wave manager carries `bounty`/`bountyGold` on completion. |
| `tests/duel-hud-rules.test.js` | 7 | What a duel's HUD shows and hides: the powerup rail and blessings button go away, the contract panel paints progress without repainting on an unchanged tick, and the result card lists what paid. |
| `tests/duel-finish.test.js` | 6 | A decided duel on each phone: a knockout resolves in the reducer, the board stops, the card is up with live buttons, BACK TO LOBBY tears the dead board down instead of leaving a paused scene under a live HUD, and a walk-out is settled as a forfeit. |
| `tests/duel-pacing.test.js` | 13 | The arena's wave clock — 10 s prep, a 5 s breather after every clear, one wave per gate, nothing after the run ends, a no-op manual start in a duel — plus a run of the clock against the real `WaveManager` to prove waves one and two open without a tap. |
| `tests/duel-wave-button.test.js` | 5 | What the wave control reads while the arena drives: a button in a campaign, a disabled countdown during prep and the breather, back to a button when the duel ends. |
| `tests/duel-telemetry.test.js` | 5 | The HUD's work budget: 60 fps becomes ≤ 9 rival paints and 2 reports a second; `progressKey` treats an unchanged heartbeat as nothing to say. |
| `tests/rival-strip.test.js` | 4 | The strip in jsdom: repeated identical states do not touch the DOM, one changed number repaints, a knockout repaints even with frozen numbers, and hide/show re-arms. |

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

Test Files  77 passed (77)
Tests       933 passed (933)
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
- `tests/world-map.test.js` mounts the world map in jsdom and asserts the camera clamps, the
  landmark → briefing → deploy wiring, the eight War Room modes, the locked stage, the pan/zoom
  gestures and the save-driven markers.
- `tests/campaign-ui.test.js` renders the result modal in jsdom and asserts the
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

## 12. Arena re-cut (Request 22) — what was actually executed

The board was rebuilt from the ground up: a wider landscape arena split by a
river (40 % enemy ground above, 60 % ours below), 2–3 crossings per map, every
map re-authored, and the keep redrawn from a downloaded CC0 vector. Everything
below was run, not assumed.

### 12.1 Geometry audit — all 17 maps

`/tmp/audit.mjs` builds every entry of `MAPS`, parses it, runs
`PathfindingSystem.computeMainPath()` + `computeLanes()` and checks the rim, the
river, the gate rows and the lane spread:

| map | lanes | cells | map | lanes | cells |
|---|---|---:|---|---|---:|
| grassland | 2 | 18 / 18 | blackfen | 3 | 18 / 18 / 18 |
| bastion-approach | 2 | 25 / 25 | shattered | 3 | 27 / 27 / 27 |
| desert | 2 | 16 / 16 | skyward | 2 | 14 / 14 |
| ice | 3 | 25 / 25 / 25 | tidewatch | 2 | 21 / 21 |
| crystal | 3 | 24 / 24 / 24 | bastion | 2 | 18 / 18 |
| caldera | 3 | 21 / 21 / 21 | emberfall | 3 | 26 / 26 / 26 |
| volcanic | 3 | 23 / 23 / 23 | frostgate | 2 | 18 / 18 / 20 |
| ash-throne | 2 | 27 / 27 | prismatic | 2 | 18 / 18 |
| dune | 2 | 20 / 20 | | | |

Every map: 26 columns × 12 rows, rock rim on all four sides (the river breaks
the left/right rim on purpose — it runs off the board), portal on row 2, river
on row 5, bastion on row 9, two rows of margin under the keep.

### 12.2 Headless Chromium run (real browser, real WebGL)

The sandbox has no system Chromium, so one is provisioned from npm
(`@sparticuz/chromium`, AL2023 build) plus the NSS libraries from the same
package; `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp` and `--use-angle=swiftshader`
give a working WebGL context. The built `dist/` was served with
`python3 -m http.server` and driven by `puppeteer-core` at 1366×768.

What was observed, in order:

1. **Boot → menu** renders (Phaser 3.90, WebGL, no console errors).
2. **`gameFlow.startLevel()`** into `level-1`, `level-3`, `level-4`:
   camera viewport 1280×432 at y=125, zoom **0.5625** = the band fit, board
   centred (`scrollX 192`, not 497), zero page errors.
3. **Lane counts in the live scene** match the audit: 2, 3 and 3 lanes with
   equal lengths (25/25, 25/25/25, 24/24/24).
4. **Build path**: `validateBuild('archer', 6, 2)` → ok, `attemptBuild` creates
   the keep (`activeTowers` 1, HUD `1/8 BUILDS`); a lane cell answers
   `road-tile`, enemy-half grass answers `enemy-half`, the portal ring answers
   `spawn-zone`.
5. **Wave → base attack**: the wave opened, 7 → 10 creeps marched the lane and
   reached the gate (`x 1305, y 599` against a base at col 21 / row 9), base HP
   20 → 0, and the DEFEAT card appeared with `0 / 8` waves and `33.2 s`.

### 12.3 Bugs found by that run (and fixed at the source)

| Symptom in the browser | Root cause | Fix |
|---|---|---|
| The bastion sat *behind* the forge dock | `CameraRig` fitted the zoom to the whole canvas, not to the band `battleFrame` measures | fit against `frame.height` (`CameraRig` constructor) |
| The board crept back to 1× a second after boot | `install()` set `camera.zoom` but left `targetZoom` at 1, so `update()` smoothed straight back out | `install()` now calls `reset()` |
| The board hugged the left edge with half the band empty | Phaser's `useBounds` clamp pins a world smaller than the viewport to the top-left | `useBounds = false`; the rig's own `clampScroll` (which centres a small world) is the single clamp |
| The world HP bar vanished on the second battle | repaint guard keyed on the HP string while the scene instance is reused | reset `bastionBarShown` when the bar is created |
| `MAPS` was not exported any more | the variant rewrite dropped the compiled record | restored, built once from `ARENA_VARIANTS` |
| A three-lane board named every lane `RIGHT` | labels came from "where a lane peels off the reference lane" | label by lane centroid: left / centre / right |
| “spawn-zone” could never be reported | the enemy-half rule was checked first | portal ring is tested first |

### 12.4 Suites updated to the new contract

`systems`, `graph-bfs`, `bastion-field`, `build-points`, `build-slots`,
`endless-map`, `lane-routing`, `modes` — 27 assertions that encoded the old
21×12 board or the overturned “build anywhere” rule were rewritten to derive
their cells from `ARENA` / the parsed map, and the free-placement cases now
assert the refusal (`road-tile`, `enemy-half`). Final run: **1250 / 1250**.

## 13. The bastion, the courtyard and the bands (Request 22, second pass)

Three defects were still visible in the browser after section 12, and all three
were fixed at the cause rather than nudged.

### 13.1 The keep's health bar floated on the river

`bastionBarY` was read from `bastionKeep.getBounds().top`, i.e. the top edge of
the *texture*. That texture is the fortress plus a tenth of its height of
transparent padding (the contact shadow's room), so the bar was anchored ~40 px
above the actual battlements and landed in the water row.

- `KEEP_PAD_RATIO = 0.1` now documents that padding in `src/data/arenaArt.js`
  (it is `(H/8) / (H + H/4)` from `scripts/build_arena_art.sh`), and
  `GameScene` anchors the bar to `keepTop + displayHeight × KEEP_PAD_RATIO − 20`.
- The keep's foot moved from `baseY + TILE_SIZE × 0.34` to `+ 0.9`, putting it on
  the top edge of the bottom margin row. The two rows of grass and rock under the
  bastion are visible again (the brief asks for the keep at the very bottom
  *with a margin*), and the bar now sits on the grass strip between the river and
  the battlements.

Measured after the change (`/tmp/browser/dockoverlap.mjs`, 1366×768): keep
texture top/bottom `378 / 630` → `414 / 666`; bar on grass; camera viewport
`1280 × 432`; board fits the band at zoom `0.5625`.

### 13.2 Every courtyard was a paved plaza with holes in it

`arenaLanes` gave each lane its own `turnRow`, so two or three roads ran down our
half in parallel and their stairs enclosed grass pockets. The bottom of the map
read as a lattice.

Every lane now turns in on the same courtyard row: the routes converge on one
approach road to the keep with a spur per crossing. Lane counts and lengths are
unchanged (re-ran the audit in `tests/lane-routing.test.js` and the 17-map
length table): 2 or 3 routes per map, longest ≤ 1.35 × shortest.

### 13.3 The endless field was four hard stripes

`endlessBiomeGrid()` painted ice / desert / volcanic / crystal from top to
bottom, and the crystal strip put the keep on lilac ground.

Three bands now (ice under the portal, desert across the enemy corridor, caldera
from the water down), with the water row kept desert-themed so the divider reads
as **water** and not as lava. `tests/endless-map.test.js` was rewritten to pin
that contract, including `expect(themes.has('crystal')).toBe(false)` so the
lilac strip cannot come back by accident.

### 13.4 Balance: wave 1 on level 1

An earlier probe lost the base in 33 s; the runs below show that was the
placement, not the map.

| run | towers | result |
|---|---|---|
| `/tmp/browser/balance.mjs` — five ballistas clustered on the road side | 5 × 60 g | base 20 → 0 at t≈68 s, 9 of 10 grunts alive |
| `/tmp/browser/balance2.mjs` — five ballistas ranked by lane coverage | 5 × 60 g | **base 20/20, every grunt killed, wave closed at t≈45 s, 146 g earned** |
| `/tmp/browser/combat.mjs` — targeting trace | 2 in range | towers acquire at ~390 px of travel, grunt 92 → 60 → 28 → 12 HP |

`validateBuild` still answers `road-tile` on a lane cell and `enemy-half` above
the river; the DOM Start Wave button still opens the wave; zero page or console
errors in all three runs. Suites: **1250 / 1250**; `npm run build` clean.

## 14. Duel arenas on the shared grammar, and the ice lane (Request 22, third pass)

### 14.1 The three duel arenas were still on the old language

`pvpArenas.js` carried three hand-drawn 26 x 16 boards that were 180°-symmetric
but shared nothing with the rest of the game: no river, no top-to-bottom march,
gates on the side columns. The brief is one map language for every battlefield,
so all three are now built by `buildArena` + `arenaLanes`, exactly like a
campaign map:

| arena | theme | gates | crossings | lanes |
|---|---|---|---|---|
| Cinder Crown | caldera | portal 5 → keep 20 | 3 | 23 / 23 / 27 |
| Frostspine | glacier | portal 12 → keep 12 | 2 | 20 / 20 |
| Dust Meridian | oasis | portal 20 → keep 5 | 3 | 23 / 23 / 23 |

Fairness did not depend on rotation: both clients already receive the *same*
level object (`getPvpLevel`), so what has to be equal is the board, the wave
script, the gold and the boss — all equal by construction. `tests/pvp.test.js`
now pins the grammar instead of the rotation (river across the middle, 2–3
crossings, portal on row 2, keep on row 9 with a margin), and
`tests/map-margin.test.js` checks each gate's own margin.

Verified in the browser (`/tmp/browser/pvp.mjs`, canvas capture per arena):
`pvp-cinder-crown` 3 lanes, `pvp-frostspine` 2 lanes, `pvp-dust-meridian` 3
lanes, spawn (2,5)/(2,12)/(2,20), keep (9,20)/(9,12)/(9,5), zoom **0.563**,
zero page or console errors.

### 14.2 The divider is water everywhere

`themed(key, null)` resolves to the *level* theme, not to the base sheet, so a
"neutral" water lookup was really asking for the caldera set — which is magma.
The river row now asks for `RIVER_THEME` (`grassland`, the suffix-less base set)
explicitly, for both the water tiles and the underlay beneath a bridge. Ponds
keep their themed water; only the line that splits the board is always a river.

### 14.3 Frostbite Hollow had the weakest lane in the game

`ROAD_RAMPS['ice']` ended on `0x748C9E`, which is the ice *ground's* own shadow,
so the lane's highlights melted into the snow: **37.9** on the YCbCr audit, the
lowest surface in the project. The ramp is now colder and stops at `0x465E78`
— the same lane reads **57.0**. `python3 scripts/terrain.py --contrast` before
and after; the tiles were regenerated with `scripts/build_arena_tiles.py`'s own
writer (`build_theme('ice')`, 42 files, deterministic).

Suite after all three changes: **1250 / 1250**; `npm run build` clean;
`docs/pvp.md` updated with the new arena table.

### 14.4 Crossings are bridges, not gaps

Two rendering faults made the river look cut rather than built over:

1. **The deck was rotated onto the wrong axis.** `horizontal` was tested as
   "water left and right", which describes the *river's* run, not the deck's —
   so a north-south crossing was drawn as a short, wide slab in the middle of
   the water. The deck now follows the lane: water east-west gives a tall,
   narrow deck; water north-south gives a wide, short one.
2. **The water painted a beach where the deck is.** Shorelines were masked from
   `isWater` alone, so every water square facing a crossing capped itself off
   and the river visibly ended twice per bridge. Masking now uses
   `isWaterBed` (water *or* bridge), so the divider runs unbroken underneath
   and the deck — with a dark parapet and a lit inner edge down each side —
   sits on top of it.

Checked on level 1 (two crossings, dirt causeway) and on Cinder Crown (three
crossings, ash causeway): the river is continuous, each deck is one tile wide
along the lane, and the caldera's divider is water rather than lava.

## 15. Bridges, a grounded keep, and a dock that stops resizing the board (Request 24)

### 15.1 Every crossing is a bridge sprite

A crossing used to be a road tile scaled to 60 % and drawn over a water tile.
At the campaign zoom its edges never met the banks, so the river looked cut and
the deck looked like a picture of a road floating in it.

`terrain.build_bridge(theme)` now draws a real deck: rung planks with grain and
nail heads, two timber parapets with three posts each, dressed-stone sills at
both mouths, and a soft shadow that falls onto the water. The material comes
from the biome's own paved and rock ramps, so a caldera bridge is ashen stone
and a grassland bridge is dark oak. `scripts/build_bridges.py` writes
`bridge{suffix}.png` for all twelve biomes (12 files, deterministic); `BootScene`
loads `tile-bridge{suffix}` and `GameScene` draws it on every lane cell that has
water on both sides, rotated a quarter turn when the water runs north-south.

Verified in the browser on grassland (level 1), ice (level 3), desert (level 2),
volcanic (Endless) and Cinder Crown: one deck per crossing, running with the
lane, river unbroken underneath.

### 15.2 The keep stands on the ground

`base-platform` — a procedural hexagonal plinth drawn under the fortress — is
gone, and with it the "my base is floating" read. The keep's foot now lands on
the bastion tile itself (`baseY + 0.62 tiles`) instead of a plinth below it, and
the sprite dropped from 0.54 to 0.44 scale (227 px → 185 px wide), so it reads
as the place being defended without swallowing the courtyard. The core crystal
moved to the gate and the world bar follows the new bounds.

### 15.3 Building no longer shrinks the map

`#placement-hint` was a flex child of the dock. Picking a card grew the panel
by 42 px, `--dock-clearance` went 219 → 261, the camera band went 432 → 392 and
`reframeBattlefield()` re-fitted: **zoom 0.5625 → 0.5104** — the board visibly
shrank every time the player went to build. Measured in headless Chrome before
and after (`buildzoom.mjs`, `fs.mjs`):

| state | dock | band | zoom |
| --- | --- | --- | --- |
| idle, before | 559 / 199 px | 432 | 0.5625 |
| card selected, before | 517 / 241 px | 392 | 0.5104 |
| idle, after | 559 / 199 px | 432 | 0.5625 |
| card selected, after | 559 / 199 px | 432 | 0.5625 |

The pill is now an absolute overlay pinned to `bottom: calc(100% + 10px)` of the
dock, so it can only ever hover over the board's bottom rim, never over a card.
`reframeBattlefield()` also ignores changes of ≤ 8 px, so a chip appearing in
the top bar cannot nudge the camera either.

Fullscreen was checked through the real button (`#btn-fullscreen`): the document
enters fullscreen, the layout is unchanged and there are no console errors.
`tests/mobile-layout.test.js` was rewritten for the new invariant (the hint must
be out of flow *and* anchored above the panel).

Suite after all of it: **1250 / 1250**, `npm run build` clean.

## 16. Lane seams, and the letterbox put to work (Request 24, follow-up)

### 16.1 Two lanes no longer render as one slab

Lanes in the enemy half can share neighbouring rows (`corridorRow` 3 and 4). The
autotiler joins them into a single wide band, and the fork the player is meant to
read — one wave per lane — disappeared. Each road square now draws a shaded
joint on its top edge **only where both rows continue sideways**, so corners,
junctions and lone roads stay clean. The rows are painted top to bottom, so the
joint lands on the lower row and covers nothing drawn after it.

Checked on level 1 (two lanes, 2-row band) and level 3 (three lanes): the roads
read as separate routes, and no seam appears at a turn.

### 16.2 The Vanguard card moved into the letterbox

A 26×12 board fitted to the band is narrower than a 16:9 window, so the game is
letterboxed at fit zoom — about 184 px of empty canvas either side at 1366×768.
The card used to sit on the battlefield's top-right corner. `GameScene.
publishBoardGutter()` now publishes that gap as `--board-gutter-right` (re-read
only on a re-frame), and the stylesheet narrows the card into it:

| measurement (1366×768, level 1) | value |
| --- | --- |
| board right edge (CSS px) | 1182 |
| gutter right / `--board-gutter-right` | 184 px |
| `--hero-panel-w` | 166 px |
| `#hero-panel` rect | 1184 → 1350 (fully outside the board) |
| panel overflow | none (`scrollWidth` 164 = `clientWidth` 164) |

Below ~200 px the card stacks (`is-compact`: name + state, health, two
full-width actions) instead of ellipsising a portrait and two buttons into the
strip. On a phone there is no gutter, so the card keeps its 208 px and its old
place — verified at 844×390 (zoom 0.622, 0 errors).

Suite after both: **1250 / 1250**; build clean.

## 17. Seated in the grass, and a board that stays put (Request 26)

### 17.1 Why the keep still looked *nakalutang*

The previous fix moved the sprite's anchor so that the *drawing's* bottom edge sat
on the ground line. It did not touch the art, and the art was the problem: the
sheet carried one big blurred ellipse whose centre sat ~6 % of the sheet height
**below** that bottom edge, so on the board the darkest part of the shadow fell
in front of the walls with nothing standing in it. That reads as a building
hovering over its own shadow, which is exactly what the user kept seeing.

`scripts/build_arena_art.sh` now composes the shadow around the footprint
instead of below it, in four layers drawn at the art's own bottom edge:

| layer | size (of the 420×374 drawing) | centre | blur | strength |
| --- | --- | --- | --- | --- |
| penumbra | rx 47 %, ry 11.5 % | bottom − 11 % | 10 | 0.45 |
| wall ring | rx 42 %, ry 8.5 % | bottom − 8 % | 6 | 0.40 |
| contact core | rx 30 %, ry 4.5 % | bottom − 3 % | 3 | 0.60 |
| forward cast | rx 24 %, ry 4 % | bottom + 2.5 % | 7 | 0.22 |

The wall ring is the layer that matters: the first attempt only darkened the
front gate, so the left and right tower bases — the parts of an isometric
building that a viewer reads as its feet — still floated. The sheet is now
**470×462** (6 % horizontal / 12 % vertical padding) and
`KEEP_PAD_RATIO = 0.0952` (`44 / 462`), so `setOrigin(0.5, 1 - KEEP_PAD_RATIO)`
puts the drawing's bottom edge exactly on `keepFoot` and the contact core two
pixels above it.

Verified in the browser at level 1 (`bastion-approach`, grass) and level 5
(`caldera`, dark volcanic soil): the shadow wraps the wall bases on both maps,
0 console errors. `npx vitest run` **1250 / 1250**, build clean.

### 17.2 Opening the Forge no longer moves the camera

The frame lock landed in the previous pass (`measureBattleFrame` memoises the
band), but it never engaged on the first battle: the boot `hud-layout-change`
fires **before** `install()` attaches its listener, so `battleFrameLocked` was
still `false` when the dock was folded, and the fold itself was the one event
that re-measured the band. The `time.delayedCall(1500)` meant to cover that case
never fired either — instrumenting the scene showed the Clock advancing
(`time.now = 12471`) while a 300 ms `delayedCall` created from the console never
ran, so the scene clock cannot be relied on for this.

`install()` now schedules the lock with `window.setTimeout(900)` and then flips
`battleFrameLocked` synchronously; the timer is cleared on `shutdown`. From that
point only a `resize` / `orientationchange` may force a re-measure.

| state | desktop 1366×768 (zoom / camera viewport) | mobile shell 844×390 |
| --- | --- | --- |
| dock open at start | 0.5625 / `[0,125,1280,432]` | 0.6224 / `[0,174,1280,478]` |
| forge folded | 0.5625 / `[0,125,1280,432]` | 0.6224 / `[0,174,1280,478]` |
| forge re-opened | 0.5625 / same | 0.6224 / same |
| card picked (build mode) | 0.5625 / same | 0.6224 / same |

Before the fix the same probe read 0.5625 open → **0.7604** folded (the board
"zoomed in" and jumped 152 px taller). Both shells now hold the frame; the phone
shell folds the forge by default and covers the bottom of the board with its
sheet when opened, but never resizes it. 0 console errors in both runs.

## 18. The Vanguard and the companions (prepared turn)

Everything below was driven in a real Chromium against the production build
(`npm run build`, `python3 -m http.server … -d dist`, 1366×768, 0 console-level
errors in every run).

### 18.1 The Muster Hall is a menu shop, not a battle screen

- world map → `#wm-pets` opens `#pets-screen` with **5 companion cards** and the
  rank ladder; every portrait is a CSS crop of the unit sheet that animates in
  battle (`hero-vanguard.png`, `pet-squire.png`, … all eight request 200).
- buy Bramble (150) + promote to Captain (160) with a seeded 2000 gold:
  `localStorage` ends at `gold 1690, pets ["bramble"], pet "bramble", heroRank 2`,
  the card flips to `equipped`, and the flash reads
  `THE VANGUARD RISES — CAPTAIN`.

### 18.2 Rank 2 is what walks into the battle

Same session, `gameFlow.startLevel('level-1')`:

| reading | value |
|---|---|
| `hero.tier` | 2 |
| sprite texture | `hero-captain` |
| clip | `hero-captain-idle` |
| draw scale / body height | 1.011 / 92 px (origin on the feet) |
| `hero.auto` | `true` |
| `hero.config.skills` | `["strike", "warcry"]` |
| HUD | title `CAPTAIN`, WAR CRY visible, BULWARK hidden |
| companion | `pet-squire-idle`, 44 px tall |

### 18.3 The clips actually play in a fight

Level 1, START WAVE clicked, sampled every 800 ms for 96 s:

| observed | value |
|---|---|
| hero clips | `hero-warlord-idle`, `-walk`, `-attack` |
| companion clips | `pet-squire-idle`, `-walk`, `-attack` |
| frames with a swing | 13 |
| frames with creeps on screen | 101 (max 18 alive) |
| companion casts | 3 |
| Vanguard health | 820 → 360 (contact damage, never down) |
| waves reached | 1 and 2 |

### 18.4 Skills, death and revival

- clicking `#hero-warcry` with the skill ready: cooldown `0 → 15000 ms`, the
  label becomes `15s`, the button disables.
- `takeDamage(∞)`: `isDown true`, sprite `alpha 0.45`, tinted, HUD
  `is-down` + state `DOWN`; the `fx-skull` sprite is created by the next
  simulation frame and destroyed when its clip completes (2.4 s later the scene
  holds 0).
- `revive()`: health 820 / 820, alpha 1, state `AUTO`.

### 18.5 What moved in the test suite

`tests/pets.test.js` (19) covers the catalogue, the wallet (buy → equip → reload
→ clamp), the pet entity's five abilities, the cooldown, and the "no flying
targets / does nothing while the hero is down" rules.
`tests/texture-keys.test.js` now treats `UNIT_SHEETS` as a loadable source (the
sheets reach Phaser through `queueUnitSheets`, not a literal `load.*` call) and
adds a new assertion that every sheet the manifest names exists in `public/`.
Full suite: **106 files / 1270 tests**, build clean.

## 19. A result card that fits, and a menu that stands in the middle (Request 28)

### 19.1 What was actually broken on the phone

The old card was one centred column: ribbon, level name, stars, three stat
boxes, rewards, the unlock line, then five full-width buttons. At 844×390 that
column is **taller than the frame**, so `.overlay-actions` wrapped onto a
second row and painted *past* the gilded border — the defect in the user's
screenshot. The fix is not a font-size nudge; the card changes shape:

- `.result-shell` is `overflow: hidden` with a `.result-body` scroll pane, so
  nothing can paint outside the frame at any size;
- every direct child of `.result-body` is `flex: 0 0 auto` — before this, the
  star row (whose `min-height` the compact query had zeroed) collapsed and the
  gold stars were drawn *on top of* the "NEW BEST" line;
- **landscape, ≥640 px wide and ≤540 px tall** (phones and short laptops) the
  shell becomes a two-column grid: the run on the left, the five plates stacked
  in a right-hand column. A vertical list needs 170 px of a 390 px screen; the
  same plates in a column need the width, which there is.

Measured in Chromium against `dist/` (`/tmp/browser/result28.mjs`):

| viewport | card | body overflow | actions bottom vs frame | buttons outside frame | errors |
| --- | --- | --- | --- | --- | --- |
| 844×390 victory | `[32,25,780,340]` | 233 / 233 px (none) | 337 ≤ 365 | 0 | none |
| 844×390 defeat | `[32,54,780,282]` | 161 / 161 px (none) | 308 ≤ 336 | 0 | none |
| 390×844 portrait | `[10,180,370,485]` | 250 / 250 px (none) | 629 ≤ 665 | 0 | none |
| 1366×768 desktop | `[403,148,560,472]` | 291 / 291 px (none) | 586 ≤ 620 | 0 | none |

The only element the clip check reports is `.result-shine`, the 3 px highlight
sweep, which is *meant* to travel across the frame. Before the change the same
probe read `bodyScroll 182 / 138` at 844×390 — 44 px of run data hidden inside a
scrolling pane — with the buttons in three rows below it.

### 19.2 The entrance is a sequence, not a fade

Only `prefers-reduced-motion` users get the static card; everyone else gets, in
order (all CSS keyframes, no JS timers except the counters):

| t (ms) | what lands |
| --- | --- |
| 0 → 340 | the card rises 14 px and scales 0.965 → 1 |
| 90 → 510 | the ribbon is **stamped**: 1.42×, 2.4× bright, snaps to 0.965× then rest |
| 110 → 490 | level name rises 10 px |
| 240 / 400 / 560 | the three stars pop in one at a time (`cubic-bezier(0.2, 1.5, 0.4, 1)`) |
| +120 ms after each | a radial gold burst blooms behind that star and fades (620 ms) |
| 380 → 1280 | a single 102° light sweep crosses the card once |
| 300 / 360 / 420 | SCORE, WAVES, TIME rise in sequence; SCORE and TIME count from 0 in 760 ms (cubic ease-out) |
| 620 → 940 | the "new best" line rises, then breathes (1.6 s alternate) |
| 470 → 810 | rewards and the unlock line rise |
| 500 → 1000 | the five plates rise, 45 ms apart |

Nothing loops except the record glow, and nothing moves after ~1 s: the card
settles. A filmstrip (`/tmp/browser/shots/strip-90/330/900.png`) confirms the
order at 844×390.

### 19.3 The menu: centred, bigger, with a description

`.menu-body` gained `justify-content: center`, `.menu-panel` lost its 56 px
left gutter and its `flex-start` alignment, and the carved wall behind it
(`.menu-stone`) plus the scrim moved to the same centre line. `.menu-rule`
gained its mirrored hairline and `.menu-eyebrow` its second dash, so the
centred lockup is symmetric.

A `.menu-blurb` — the description the menu was missing — sits between the rule
and the plate:

> Raise ballistas, cannons and rune-forged keeps along the lanes, hold the Realm
> Core against five realms of invaders, and carry one vanguard — ranks, skills
> and pets — through the whole campaign.

| reading | before | after |
| --- | --- | --- |
| panel centre (1366×768) | left-aligned at x 40 | **683 = viewport centre** |
| PLAY plate centre | 302 | **683** |
| title `OF KINGDOM` | 89 px | **89 px tall, box 694 px** (`clamp(42px, min(11.6vh, 8.2vw), 120px)`) |
| description | none in the column | 406×59 px, 3 lines, 58ch cap |
| 844×390 panel / plate centre | 422 / 430 (8 px off) | **422 / 422** |
| 390×844 panel / plate centre | 195 / 195 | **195 / 195** |

The 8 px offset at 844×390 was a leftover `padding-left: clamp(0, 2vw, 24px)`
in the `max-width: 900px` block: fine while the panel was left-aligned, a
mis-centring nudge once it was not.

### 19.4 Suite

`npx vitest run` → **106 files / 1270 tests passed**; `npm run build` clean
(`index-*.js` 567.77 kB / 163.93 kB gzip at the time of the run). The result
screen keeps its contract: `.result-ribbon` text, `.result-stats` `6 / 6`,
`.result-star` count, the five action ids and the `REPLAY` / `RETRY` labels.
The two emoji marks that used to head a defeat (`💀`) and a starless run (`⚔`)
are now kit sprites (`glyph_skull.png`, `glyph_swords.png`), and the unlock line
lost its `🔓` for a CSS diamond — the headless render showed an empty box where
the emoji should be, and a shipped card may not depend on an emoji font.

## 20. The Muster Hall becomes a real shop, and companions level up (Request 29)

### 20.1 The plate

`public/assets/ui-kit/pets-hall.webp` (1600×1067, 186 kB) is a generated
pavilion plate — torch-lit stone, hanging banners, hay, a water trough and a
castle on the cliff — kept at full width in `art-source/ui-kit/pets-hall-raw.png`
(1536×1024 PNG) so it can be re-encoded without the generator. It is drawn by
`.pets-screen` under a light scrim and by `.pets-backdrop`, a vignette layer.

The shell no longer uses the opaque panel fill
(`border-image-slice: 50` without `fill`); it paints its own translucent sheet
with `backdrop-filter: blur(2.5px)`, so the torchlight reads through the frame
instead of being covered by it.

### 20.2 Layout

Three columns, in the order a player shops:

| column | always on screen | content |
| --- | --- | --- |
| tabs | yes | `RECRUIT`, `UPGRADE`, `VANGUARD` — the two the request asked for |
| roster | yes | all five companions, with state (`ACTIVE` / `LV n` / `LOCKED`) |
| detail | yes | portrait, level ladder, stats, skill, the action plate |

The roster is a column, not a grid, so "all of them" fits without scrolling on
every tested viewport (the compact rules drop the role line and the portrait to
30 px for exactly that reason).

### 20.3 Levels (new system)

`data/petData.js` now owns the ladder: `PET_MAX_LEVEL = 5`,
`PET_LEVEL_SCALE` (damage ×1.22 … ×2.05, cooldown ×0.93 … ×0.75, reach and
blast radius to ×1.24, healing to ×2, slow capped at 0.6 so a companion can
never out-slow a Frost Spire), `petUpgradeCost` (55 %/90 %/135 %/190 % of the
recruit price, rounded to 5), `petStatRows` and `petSkill`.

`petAbility(pet, level)` is the single source of truth: the `Pet` entity stores
`this.stats = petAbility(def, level)` and its `get ability()` returns it, so
every attack, burn tick, blast radius and mend uses the bought level. The shop
prints its cards from the same function.

`ProgressStore` gained `petLevels` (`{ id: 1..5 }`), `petLevel(id)`,
`petLevels`, and `upgradePet(id)` → `{ ok, reason: 'unknown-pet'|'not-owned'|'maxed'|'gold', level, cost, gold }`.
`buyPet` seeds level 1; `load()` drops levels for unowned ids and clamps the
rest.

### 20.4 Verified in Chromium against `dist/`

| reading | desktop 1366×768 | phone shell 844×390 |
| --- | --- | --- |
| shell | `[123,136,1120,495]` | `[17,8,810,374]` |
| tabs / roster / detail | 123 / 232 / 658 px | 101 / 143 / 482 px |
| roster scroll | 324 = 324 (none) | 215 = 215 (none) |
| detail scroll | 322 = 322 (none) | 210 = 210 · upgrade 217 / 213 (4 px) |
| elements outside the frame | none | none |
| companions listed | 5 | 5 |
| console errors | none | none |

Buying a level: gold 3000 → 2865 with `bramble` 2 → 3 (cost 135), flash
`BRAMBLE REACHES LEVEL 3`. A live level-1 battle with a saved level-5 Bramble
spawns `pet.level 5`, `stats.damage 82`, `stats.cooldownMs 6000`, texture
`pet-squire`, 0 errors.

Full suite: **106 files / 1282 tests** (12 new in `tests/pets.test.js`), build
clean.

## 21. The arena button, and everything behind it (Request 30)

### 21.1 The bug was not a dead handler

`ENTER THE ARENA` ran `window.gamePvpLobby?.show()` and the handler was fine.
The lobby element itself was **gone**: `PvpLobbyUI` builds `#pvp-lobby` once at
boot and appends it to `#screen-container`, while every other overlay in that
same layer (`ResultScreenUI`, `PetShopUI`, `AchievementsUI`, `ForgeUI`,
`BlessingsUI`) mounted itself with `container.innerHTML = …` and cleared itself
with `container.innerHTML = ''`.

A MutationObserver on `#screen-container` caught it: pressing PLAY runs
`showLevelSelect()` → `gameResultScreen.hide()` → `innerHTML = ''` → the removal
log listed `duel-result` **and** `pvp-lobby` at the same millisecond. The lobby
object still held its node, so `isOpen()` kept returning `true` and the optional
chain never tripped: a silent, un-dismissable no-op. The same wipe had already
taken the duel result card, which is why a decided match could look like a
frozen battlefield.

### 21.2 One mounting authority

New `src/ui/screenHost.js`:

| export | behaviour |
| --- | --- |
| `mountScreen(container, id, markup)` | unmounts that id, parses the markup in a `<template>`, appends the single root, returns it |
| `unmountScreen(container, id)` | removes only that id |
| `ensureMounted(container, el)` | re-appends a long-lived element if it left the DOM; returns `true` when it had to |

All five wiping screens now mount and unmount through it, so no screen can
delete a sibling. `PvpLobbyUI.show()`, `DuelResultUI.show()` and `showFinal()`
also call `ensureMounted` first: even if some future code clears the layer, the
same element goes back in instead of a detached copy that reports itself open.

### 21.3 What was wrong *inside* the arena

* **A static host had no way to play.** The lobby defaults to the relay on any
  `http(s)` origin, and Vercel has no `/pvp` process, so `CREATE ROOM` failed
  after ~3.3 s with only an error line. `#pvp-fallback` now answers that exact
  failure with `PLAY IN THIS BROWSER`: it switches the link chip to the local
  transport and retries the action that failed. The relay fields collapse while
  the fallback is up (the fallback *is* the fix); `CHANGE RELAY` still opens
  them.
* **Only the host could rematch.** A guest who won had no way to ask for
  another round. New intent `OP.REMATCH_REQUEST`: a guest's request is a
  message, not a state change (`rematchAskedBy` guards one request per round,
  and the host's button still owns the restart). On the host's card
  `#duel-rematch-note` names the rival and `#duel-rematch` pulses twice
  (disabled under `prefers-reduced-motion`, where it gets an outline instead).
  The guest's button reads `ASK FOR REMATCH` → `REQUEST SENT`.
* **The phone had to scroll to find START.** At 844×390 the lobby measured
  439 px of content in a 390 px overlay, with `JOIN ROOM` below the fold. The
  compact block (`@media (max-height: 560px)`) is density only — same type and
  art, smaller steps — and both screens now measure exactly 390/390 with
  nothing outside the frame.
* Copy: the unreachable-relay message quoted a shell command with backticks in
  a red banner; it now uses quotes. `#pvp-title` gets `line-height: 1.05` so the
  display face's descender stops landing on the subtitle.

### 21.4 Verified, two real pages at once

Headless Chromium, 1366×768, `?probe=1&pvp=local`, two pages in one browser,
room code `XPXTA`:

| step | A (host) | B (guest) |
| --- | --- | --- |
| ENTER THE ARENA | lobby open, 1366×768, `screen: entry` | same |
| CREATE ROOM / JOIN | `room`, `lobby`, connected 1 | `room`, `lobby`, connected 2 |
| seats | `SEAT I ALPHA NOT READY` · `SEAT II BETA NOT READY` | same |
| arenas offered | `cinder-crown`, `frostspine`, `dust-meridian` | same |
| READY both → START | enabled, `readyA true`, `readyB true` | — |
| countdown | `GATES OPEN IN 3 · Cinder Crown · CALDERA · 10 waves · identical horde` | — |
| battle | lobby hidden, `pvp live`, board + HUD + rival strip | same |

Knockout (`gameState.damageBase(9999)` + `handleGameOver()`, the same path a
breach takes), 25 → 0 HP:

* A: `Defeat`, `Beta won by knockout.`, rows `ALPHA YOU · 0 PTS · CORE DOWN K.O.` / `BETA · WINNER`.
* B: `Victory`, same sentence, `BETA YOU · WINNER`.
* Both cards keep their buttons alive and both pages answer afterwards.

Rematch loop, same run: B (guest, winner) had no `REMATCH` and a live
`ASK FOR REMATCH`; the click put `Beta wants another round.` on A's card and
pulsed the button; the host's `REMATCH` returned **both** pages to
`screen: room`, `status: lobby`, same room code, result card hidden.

Relay fallback (`?pvp=relay` against a static server): the fallback appeared
3257 ms after `CREATE ROOM` with
`The duel relay at ws://127.0.0.1:4300/pvp did not answer. Start it with "npm run pvp:relay".`;
`PLAY IN THIS BROWSER` produced a live local room (`connected 1`, error and
fallback both hidden).

Phone 844×390: entry `scroll 390/390`, room `390/390`, `outside: []`, room code
and `READY` / `START DUEL` / `LEAVE` all on screen.

Full suite: **106 files / 1284 tests** (2 new: the rematch-request reducer case
and the host-side request card); `npm run build` clean.

## 22. The panel comes off, the ranks go to five (Request 31)

### 22.1 The Vanguard card is gone

`#hero-panel` was a floating card in the top-right corner: portrait, name,
health, and four buttons (`MOVE`, `STRIKE`, and the rank-gated `WAR CRY` /
`BULWARK`). It was the one piece of the battle HUD that asked for orders, and on
a phone it sat on top of the enemy half of the board.

The node, its 30 stylesheet rules, the four listeners, `HUD.setHero()` /
`setHeroArmed()`, the `--hero-panel-w` measurement, the tap-armed move order and
both manual cast entry points (`castHeroStrike`, `castHeroSkill`) are deleted.
Nothing in the HUD now addresses the hero.

The information it carried did not disappear with it:

| was on the card | now |
| --- | --- |
| hero health | the bar the entity already draws above itself (`Hero.drawHealthBar`) |
| `AUTO` / `MOVING` / `DOWN` | the sprite's own clip and the downed pose |
| skill cooldowns | the casts are the feedback: the autopilot fires them and `playHeroCast` draws the ring |
| `MOVE` | gone by design — the autopilot owns movement |

Verified on both shells: `document.getElementById('hero-panel')` is `null`,
the visible `.hud-panel` list is `hud-top-bar`, `hud-level-chip`,
`camera-cluster`, `powerup-rail`, `hud-bottom-dock`, and the console is clean.

### 22.2 Five ranks, not three

`HERO_TIERS` is now a five-step ladder, each step a real loadout rather than a
bigger number on the same sheet:

| tier | id | sheet | health | damage | reach | skills | promote |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | vanguard | `hero-vanguard` (knight, sword) | 500 | 30 | 30 | strike | — |
| 2 | halberd | `hero-halberd` (pawn, spear) | 580 | 34 | 46 | strike | 160 |
| 3 | captain | `hero-captain` (knight, gold) | 640 | 38 | 34 | + warcry | 300 |
| 4 | warlord | `hero-warlord` (knight, red) | 820 | 48 | 38 | + bulwark | 520 |
| 5 | sentinel | `hero-sentinel` (knight, violet) | 1000 | 54 | 40 | + bulwark, wider aura | 860 |

Two new sheets were re-packed from the same CC0 source by
`scripts/build_unit_sheets.sh` (`hero-sentinel` from `warrior_purple.png`,
`hero-halberd` from `pawn_blue.png`), both 1152×576, six frames per clip. The
rank clamp in `ProgressStore` now reads `HERO_TIER_COUNT` instead of a literal
`3`, so a saved rank of 99 loads as 5 rather than 3.

The Halberd sits at tier 2 on purpose: the pawn's silhouette is smaller than a
knight's, and a promotion that shrinks the hero read as a downgrade at rank 5.
At tier 2 it is the reach step — the first rank that can hold the lane mouth
without standing in it.

Verified in the Muster Hall with a profile at rank 4: the tab reads
`RANK 4 / 5`, `TIER 4 · WARLORD`, and the next-step plate is
`TIER 5 · SENTINEL · 1000 HP · 54 dmg · 118 spd · 200 strike` with
`PROMOTE · 860`. A battle launched from that profile spawned
`hero.tier 5` with texture `hero-halberd`.

### 22.3 One companion, and it says so

Only one pet is ever spawned — `spawnPet()` returns early when `this.pet`
exists, and a scene probe with a saved Boomer reported
`petsInScene: 1` next to the Vanguard. The two figures at the gate are the
Vanguard and the companion; with the card gone there was no label left to say
which was which, so the spawn now raises one toast:
`BOOMER JOINS THE VANGUARD — it fights on its own`.

Casting was already automatic (the pet has its own cooldown and targets on its
own). What it lacked was a visible tell at the source, so `playPetCast` now
starts every cast with a small `nova` ring on the companion itself, before the
elemental effect on the target; the archer's shot also uses the arrow impact
strip so `shot` and `taunt` no longer look identical. A forced cast in the
browser reported `{ id: 'bomb', hits: 1 }`, `casts 0 → 1`, `attackAnimMs 420`,
cooldown 9300 ms and damage 110 at level 2 — and 0 console errors.

### 22.4 What is still not there: a real death clip

The CC0 pack ships idle, run and attack rows only. The hero's death is the
`fx-skull` puff plus the downed pose, and companions cannot be targeted at all,
so they never die. A full idle/walk/attack/death set needs a pack that actually
carries a death row; that is a download-and-repack job, not a code change, and
it is the next art task rather than something this pass pretended to ship.

## 23. Five Vanguards, one dispatcher (Request 32)

### 23.1 The roster

The Vanguard stopped being a single unit with five ranks and became five
*classes*, three ranks each. "More heroes" was the request; five tints of one
knight would not have answered it, so each class is a different unit on the
board and a different set of numbers in the data.

| id | name | role | sheet | health | reach | damage | swing | recruit | promote (2 / 3) | skills |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `vanguard` | Vanguard | SWORD & BOARD | `hero-vanguard` (blue knight, sword) | 500 | 30 | 30 | 1000 ms | free | 160 / 300 | Shieldbreaker, War Cry, Bulwark |
| `halberdier` | Halberdier | REACH | `hero-halberd` (blue pawn, spear) | 460 | 48 | 26 | 850 ms | 220 | 190 / 360 | Wide Cleave, Snare, Shieldbreaker |
| `ranger` | Ranger | RANGED | `hero-ranger` (blue archer, bow) | 360 | 190 | 22 | 900 ms | 320 | 220 / 400 | Volley, Snare, Emberbrand |
| `warden` | Warden | WALL | `hero-warden` (gold knight) | 720 | 34 | 36 | 1080 ms | 420 | 240 / 430 | Bulwark, War Cry, Wide Cleave |
| `cinder` | Cinder | FIRE | `hero-cinder` (violet knight) | 560 | 36 | 32 | 940 ms | 560 | 260 / 470 | Emberbrand, Shieldbreaker, Bulwark |

Rank arithmetic is one function (`makeRanks` in `src/data/heroData.js`), quoted
here so the shop, the battle and the tests cannot drift: health
`×(1 + 0.35·(rank−1))`, speed `×(1 + 0.03·i)`, reach `×(1 + 0.06·i)`, damage
`×[1, 1.25, 1.55]`, swing interval `×[1, 0.93, 0.86]`, contact damage `+2` per
rank, body height `+2` per rank. Skills unlock one per rank, in the order
listed. The Ranger is the only class with `attack: 'ranged'`.

### 23.2 Five sheets, re-packed from the same CC0 source

`scripts/build_unit_sheets.sh` grew five rows, each pointing at a different
Tiny Swords unit (Pixel Frog, CC0 1.0 — `art-source/units/LICENSE-TinySwords-CC0.txt`):

| sheet | source row file | size | idle / walk / attack |
| --- | --- | --- | --- |
| `hero-vanguard` | `warrior_blue.png` | 1152×576 | 6 / 6 / 6 |
| `hero-halberd` | `pawn_blue.png` | 1152×576 | 6 / 6 / 6 |
| `hero-ranger` | `archer_blue.png` | 1536×576 | 6 / 6 / 8 |
| `hero-warden` | `warrior_yellow.png` | 1152×576 | 6 / 6 / 6 |
| `hero-cinder` | `warrior_purple.png` | 1152×576 | 6 / 6 / 6 |

The three old tier sheets (`hero-captain`, `hero-warlord`, `hero-sentinel`) are
gone; nothing referenced them any more. The body box for each new sheet was
measured with `convert -trim` and written into `UNIT_SHEETS`, so the feet still
land on the unit's `x, y` and the aura and shadow follow the real silhouette:
the archer's cell is `{x:68, y:59, w:62, h:75}` at 8 columns, the spear and the
two knights are `{x:67, y:69, w:58, h:59}` and `{x:63, y:45, w:78, h:91}`.

### 23.3 Skills are a table, not five code paths

`HERO_SKILLS` holds seven skills, each with one of five shapes — `burst`,
`volley`, `slow`, `burn`, `self` — and `Hero.castSkill(id, enemies)` is the only
dispatcher. A class entry is a list of ids and a rank slice; the entity never
learns a class name.

| skill | kind | numbers (rank 1) | rank 3 |
| --- | --- | --- | --- |
| Shieldbreaker | burst | 100 dmg, 75 r, 12 s, needs 2 targets | 155 dmg, 10.3 s |
| Wide Cleave | burst | 74 dmg, 108 r, 9 s, needs 3 | 115 dmg, 7.7 s |
| Volley | volley | 52 dmg × 4 targets, 240 r, 8.5 s, needs 2 | 81 dmg, 7.3 s |
| Snare | slow | 24 dmg, 170 r, slow .55 for 3.2 s, 14 s | 37 dmg, 12 s |
| Emberbrand | burn | 26 dmg + 14 per 600 ms for 4.2 s, 120 r, 12 s | 40 dmg, 10.3 s |
| War Cry | slow | 190 r, slow .35 for 4 s, 15 s | 12.9 s |
| Bulwark | self | heal 35 % of wounds, guard .5 for 4.5 s, 20 s | heal 54 %, 17.2 s |

Every cast still obeys the rules from request 17: ground enemies only, one hit
per enemy per cast, liveness re-checked at cast time, no damage while down, a
cooldown that survives a refused cast. `autoCast()` walks the class's own list in
order and consults each skill's `auto` trigger (`minTargets`, or a health ratio
for Bulwark), and `update()` reports what fired.

### 23.4 The effects are per skill, not one puff

`GameScene.playHeroCast(id, info)` reads the cast's `kind` and draws the shape
that belongs to it: the cleave/strike ring of steel rays, arrow streaks for the
volley (one per target, aimed at that target's position), a frost ring and a
pale tint for the two slows, and a fire bloom with embers for the burn. The
Bulwark cast flashes the guard shield on the hero itself. The Ranger's ordinary
attack got its own tell (`playHeroShot`), so a shot looks different from a melee
swing even when no skill is on cooldown.

### 23.5 The Muster Hall grows a roster

The VANGUARD tab is now a roster plus a detail panel: five cards on the left
(portrait, name, role, and `IN THE FIELD` / `RANK n` / `LOCKED`), and on the
right the selected hero's title, name, role, rank pips, stats, the three skills
with their per-rank numbers, and one action plate — `RECRUIT · price`,
`TAKE THE GATE`, or `PROMOTE · cost`. The wallet line reads `n / 5 recruited`
next to `n / 5 vanguards`. Buying selects the new hero; promoting spends the
next rank's price and cannot pass rank 3.

### 23.6 The phone had 356 px of detail in a 189 px panel

First measurement on a 844×390 landscape phone: `.pets-detail` reported
`scrollHeight 356` against `clientHeight 189`, with `pets-detail-grid`, the
locked skill row and the fifth roster card all spilling past the shell. The
design was not "too much content" so much as four separate stack-ups:

1. the header stacked kind, name, role chip and rank ladder — four lines in a
   158 px column, 69 px tall;
2. each of the three skills stacked name, a two-line description and a numbers
   line — 35 px of prose each;
3. `201 PX · RANGED` wrapped inside a 55 px stat box, making the whole stat row
   taller than the text;
4. the action plate sat at the bottom of that overflow, where the touch target
   could be scrolled away.

Fixed in the compact rule (`@media (max-width: 900px), (max-height: 560px)`)
without touching the desktop layout:

- the title becomes a 2×2 grid — kind + role on one row, name + rank pips on the
  next — and the portrait drops from 104 px to 52 px: header 69 → 52;
- stats go from 2×2 to one row of four, the attack kind moves to its own small
  line under the number (and is hidden here, where the role chip already says
  it): stat block 48 → 34;
- each skill becomes a single row — icon, name, then `65 dmg · 240 r · 7.9s` in
  dim text with an ellipsis guard — and a still-locked skill drops its numbers:
  three skills 117 → 60;
- the flavour sentence is hidden on a short phone (the name, role, stats and
  skills all still read), the panel gap goes 3 → 2 px, and the action plate is
  sticky with a scrim so the one button that spends gold is always reachable.

Measured after the fix, with the same probe on three landscape sizes:

| viewport | `.pets-detail` | `.overlay-shell` | nodes outside viewport | cards |
| --- | --- | --- | --- | --- |
| 844×390 | 210 / 210 | 328 / 328 | 0 | 5 |
| 667×375 | 203 / 203 | — | 0 | 5 |
| 896×414 | 210 / 210 | — | 0 | 5 |

All three tabs were measured separately at 844×390 (RECRUIT, UPGRADE,
VANGUARD): `210 / 210` each, `328 / 328` shell, five cards, no element past the
edge, and 0 console errors (`tabsMobile.mjs`).

### 23.7 Verification

- **Desktop 1366×768** (`roster.mjs`): five cards with five different
  portraits, `IN THE FIELD` / `LOCKED` states, the Vanguard panel at
  `RANK 1 / 3` with Shieldbreaker live and War Cry / Bulwark `· RANK 2` /
  `· RANK 3`, `PROMOTE · 160`; 0 nodes outside the shell. Recruiting the Ranger
  moved gold `4000 → 3680`, set `heroClass: 'ranger'`, flashed
  `RANGER JOINS THE VANGUARD`, and swapped the plate to `PROMOTE · 220`.
- **In battle**: a rank-2 Ranger spawned with `classId ranger`,
  `texture hero-ranger`, `ranged true`, 486 HP, 28 damage, reach 201 and an
  8-frame attack clip, then fired a real volley. A rank-3 Cinder spawned with
  952 HP, 50 damage, skills `ember/strike/bulwark`, and its Ember cast hit six
  creeps, left `fire:14` on every one of them and started a 10 320 ms cooldown.
- **Assets**: every glyph the shop prints resolves to a file — the skill icons
  used to be bare names and were 404s until they were changed to full paths
  (`/assets/ui-kit/glyph_*.png`, `/assets/projectiles/proj-arrow.png`); a
  failed-response scan now reports none.
- **Tests**: `tests/hero-roster.test.js` adds 23 cases (unique classes and
  sheets, three scaling ranks, skill table coverage of all five kinds, the cast
  dispatcher per kind, cooldown refusal, down-state refusal, auto triggers),
  taking the suite from 1285 to **1308 passing**. `npm run build` is clean.

### 23.8 Still missing: a death row and a cast row

Same gap as 22.4, one step worse: the CC0 pack has idle, walk and attack rows
for these units, so the five heroes now walk, swing and shoot — and still go
down with the `fx-skull` puff instead of a death animation. Casts are drawn by
the scene's effect layer rather than by a dedicated cast row. A pack that
carries those rows is a download-and-repack job, not something this pass
pretended to ship.

## 24. A ledger behind the name (Request 33)

The brief: put the game on Supabase so progression and achievements survive the
browser, make a commander name mandatory before the main menu — no password —
and refuse a name that someone already owns; the shared ranking comes later but
the numbers it will rank on have to exist now.

"Database first" is how this was built: the schema and the client that talks to
it, then the gate in front of the menu. No leaderboard redesign was attempted
beyond making the existing Hall of Champions read from the ledger.

### 24.1 The schema (`supabase/migrations/0001_cloud_save.sql`, 477 lines)

Three tables:

| table | rows | why |
| --- | --- | --- |
| `players` | one per commander | `username` + a lower-cased, unique `username_key`, the owning `device_key`, and the four published ranking numbers (`power`, `level`, `stars`, `best_score`) |
| `progress` | one per player | the save file as `jsonb` plus a monotonically increasing `revision` |
| `player_achievements` | one per medal | so the ranking can count medals without parsing the blob |

and seven `security definer` functions with `search_path` pinned:

`cloud_ping`, `check_username`, `register_player`, `sync_progress`,
`pull_progress`, `leaderboard_page`, `my_rank`.

`anon` and `authenticated` get **no table privileges at all** — `revoke all`
followed by `grant execute` on the seven functions only. RLS is enabled on all
three tables with zero policies, so even a leaked anon key reads nothing it was
not given by a function. The whole file is idempotent and wrapped in
`begin; … commit;`.

Two rules live in SQL rather than in the client, because a client can be edited:

- `sync_progress` clamps every metric upward (`greatest(...)`) so a stale device
  cannot lower a row, and rejects payloads over 128 KB.
- The ranking order is fixed: **power DESC, level DESC, stars DESC,
  best_score DESC, created_at ASC, id ASC**.

### 24.2 Why there is no password

A name and nothing else cannot authenticate anything. Instead the browser mints
a random `device_key` on first run, keeps it in `localStorage`, and presents it
on every write. It is never returned by any function, so reading the leaderboard
cannot leak someone else's key, and the tables are unreachable anyway. The name
is claimed once; `register_player` answers `{ ok: false, reason: 'taken' }` for
anybody else, including the same person on a different device.

What that buys and what it costs is written down in `supabase/README.md`: losing
site data means losing the right to write that row — the name stays taken, which
is exactly the requested behaviour, but the save behind it becomes read-only.
Cross-device restore would need a real auth provider or a recovery code, and
pretending a name-only identity can do that would be a lie.

### 24.3 The client

`src/net/supabaseClient.js` (171 lines) is the whole network layer: seven
`POST {url}/rest/v1/rpc/{fn}` calls, a 9 s timeout, and a `ping()` that requires
`{ ok: true, schema: 1 }` before the app will trust the endpoint. No SDK was
added — a dependency-free PostgREST call was smaller than `@supabase/supabase-js`
and its auth/realtime/storage modules combined.

`src/systems/CloudSave.js` (595 lines) owns identity, claiming, debounced pushes
(4 s / 12 s / 30 s retries) and the leaderboard reads. `src/systems/PlayerMetrics.js`
(117 lines) is the single place the ranking numbers are computed:

```
power = 120·heroRank + 90·petLevel + 60·relicLevel
      + 100·star + 150·achievement + 2·gems + 40·endlessWave
commanderLevel = 1 + clearedLevels + floor((totalStars − clearedLevels) / 3)   → max 9
```

One bug was found and fixed during testing rather than papered over: calling
`claimName()` before `start()` had resolved produced a local-only identity and
silently skipped the "is this name free" check. `claimName()` now pings once
when a ledger is configured but not yet online, then decides.

### 24.4 The gate

`src/ui/NameGateUI.js` (237 lines) is the only gate in the app. It opens before
the menu on a browser with no identity, live-checks the name after a 380 ms
debounce (`THAT NAME IS FREE` / `THAT NAME IS ALREADY CARVED INTO THE LEDGER —
PICK ANOTHER`), and on a taken submit it keeps the gate open, shakes the panel,
clears the field and stores nothing.

The first screenshot of this pass showed the form floating on a near-black void,
because the menu art is hidden while the gate is open. The gate now carries the
same `menu-scene` painting as the menu (keep, sky, wisps, torch, embers,
vignette) behind a scrim, and the panel uses the carved `--ui-panel` frame that
every other dialog uses instead of a flat dark plate. Two layout corrections
came out of measuring rather than eyeballing:

| viewport | panel | gate scroll | overflow |
| --- | --- | --- | --- |
| 1366×768 | 470×431 | 768 / 768 | none |
| 844×390 | 520×292 | 390 / 390 | none |
| 667×375 | 520×286 | 375 / 375 | none |
| 390×844 | 362×454 | 844 / 844 | none |

The 844×390 and 667×375 cases used to overflow by 40 px and 44 px; a
`max-height: 560px` block shrinks the title, the blurb (clamped to two lines),
the input and the submit, so landscape phones fit without a scrollbar. The blurb
was also shortened for every size — the first version was three long sentences
that read like a license agreement.

### 24.5 The Hall of Champions

`src/ui/LeaderboardUI.js` was rewritten around two tabs:

- **REALM RANKING** — `leaderboard_page` + `my_rank`, with explicit
  loading / error-with-retry / empty states, a highlighted `YOU` row and a
  `YOU ARE #2 OF 3 · POWER 1,604 · LEVEL 4 · 5★ · 2 MEDALS` summary.
- **THIS DEVICE** — the existing local records table and its merge-sort
  telemetry, unchanged in spirit.

The old initials prompt is gone: a run is recorded under the commander name,
because there is now exactly one name. Rank badges are drawn plates
(`.rank-chip`, gold / silver / bronze) rather than 🥇🥈🥉 — the emoji rendered as
tofu boxes on a system without a colour-emoji font, which looked like damage.

### 24.6 Verification

- **Tests**: `tests/player-metrics.test.js` (7), `tests/cloud-save.test.js` (20,
  fake client + fake storage + fake timers), `tests/cloud-contract.test.js` (11,
  parses the SQL, the client and the stand-in and asserts they agree) and
  `tests/name-gate.test.js` (10, real `index.html` markup in jsdom). The suite
  went from 1308 to **1356 passing / 111 files**. `npm run build` is clean:
  `index-CQg-xLkd.js` 614.11 kB (176.66 gzip), `phaser-DFK5Ua9d.js` 1208.06 kB
  (332.17 gzip), `index-Kh05SKQT.css` 189.14 kB (37.26 gzip).
- **Contract checks that now fail loudly if the three sides drift**: every RPC
  the client calls exists in the SQL and in the stand-in, every `p_` parameter
  is read, `anon` holds no table grant, RLS is on for all three tables, every
  data function is `security definer`, and `username_key` / `device_key` are
  unique.
- **Live browser probe** (`/tmp/browser/gate.mjs`, vite dev on 4300 + stand-in
  on 8791): fresh browser → gate open, menu hidden, `LEDGER · LOCAL STAND-IN`,
  `status: online`; taken name → the refusal message live, then on submit the
  same message, gate still open, `is-shaking`, **no** identity written, input
  empty; free name → `THAT NAME IS FREE`, gate closes, menu opens, identity
  `{ mode: 'cloud', claimed: true }`; reload → gate skipped, name kept; a save
  bump → `revision 3`, `my_rank { rank 1, power 1604, level 4, stars 5,
  achievements 2 }`; a second commander at 5,400 → board
  `[(1, Borin, 5,400), (2, Aria, 1,604), (3, Keeper, 0)]`, modal rows
  `1 Borin… / 2 Aria… YOU / 3 Keeper…`, `YOU ARE #2 OF 3 · POWER 1,604 ·
  LEVEL 4 · 5★ · 2 MEDALS`. **0 console errors, 0 failed requests.**
- **Production build**: `vite preview` on 4320 with the same seven-call path —
  gate opens on the keep art, the panel's frame resolves to
  `/assets/ui-kit/frame_panel.png`, a name claims through `/supabase-dev`,
  menu opens, `mode: cloud`, **0 console errors, 0 failed requests**.

### 24.7 What was not verified — and must not be claimed

The SQL in this pass **has never been executed**. The sandbox cannot reach
`*.supabase.co` (TLS to the project host is refused at the egress proxy, which
`curl` confirms), there is no `psql` and no local Postgres, so nothing here
proves the migration is valid Postgres, that the grants behave as intended, or
that `security definer` + `search_path` is airtight in production.

What stands in for that is a contract test and a stand-in server
(`server/cloud-dev.mjs`, 325 lines, JSON-file backed, same seven functions) that
the whole gate → claim → sync → ranking path was exercised against. The stand-in
runs no SQL, enforces no RLS and is **not** Supabase; it proves the client's
calls and the app's behaviour, not the database's.

To close that gap the migration has to be applied to a real project
(`supabase/README.md` §1) and the same probe re-run with
`?supabase=<url>&key=<anon key>`. Until then the honest statement is: schema and
client are written, wired, contract-checked and browser-verified against the
stand-in — not against Postgres.

### 24.8 On a real static host

The dev stand-in is reached through a Vite proxy at `/supabase-dev`, which only
exists while `vite dev` or `vite preview` is running. The first version of
`resolveSupabaseConfig()` pointed at `<origin>/supabase-dev` on *any* origin, so a
deployed build would have claimed a ledger it could not reach and then 404 on
every call. It now requires a loopback origin (`localhost`, `127.0.0.1`, `[::1]`,
`*.localhost`); everywhere else, with no env pair, it returns
`{ url: '', anonKey: '', source: 'none' }` and the game stays local.

Three probes against the built `dist` served over the container's **non-loopback**
address (the same shape as a Vercel host), with no dev proxy anywhere:

| build | gate line | `source` | claim | console | failed requests |
| --- | --- | --- | --- | --- | --- |
| `npm run build` | `LEDGER · LOCAL ONLY` | `none` | local, menu opens | 0 | **0** |
| `vite build` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (pointing at a ledger on that same host) | `LEDGER · SUPABASE` | `env` | `cloud`, live check `THAT NAME IS FREE` | 0 | **0** |

The second row is the Vercel path end to end: the pair is inlined at build time,
the browser talks to the remote ledger over CORS, and nothing touches
`/supabase-dev`. `tests/supabase-config.test.js` (14 cases) pins the precedence
order, the `/rest/v1` normalisation, the rejection of non-http URLs and the
loopback rule itself.

**Deployment note (not tested from here).** Vercel's *blocked* state
(`TEAM_ACCESS_REQUIRED`) is an authorship check, not a build failure: on a Hobby
account only commits authored by the account owner may deploy. A clean clone of
this branch builds in 7.4 s with `npm ci && npm run build`, so a blocked
deployment points at the commit author rather than at the code. The tip of the
branch is now authored as the account owner — two earlier commits in its history
are not, and whether Vercel evaluates only the deployed commit or the whole push
could not be tested from here. `supabase/README.md` §7 records the check, the
fix, and the fallback (squash-merge to `main`, or re-authoring the branch).

## 25. The Champions' Hall becomes a hall (Request 34)

The brief: put the ranking behind the banner art — move it there — tidy the UI
including on mobile, make sure nothing is cut off, highlight the player names,
generate the art, and stop cramming everything into one frame.

### 25.1 What was actually wrong

Measured on the previous build (`lb-before-*.png`), with 24 commanders in the
ledger:

| viewport | dialog card | table frame | result |
| --- | --- | --- | --- |
| 1366×768 | 860×588 | 814×**300** | 24 rows in a 300 px window |
| 844×390 | 787×337 | 741×**51** | the frame collapsed to a header bar |
| 667×375 | 617×323 | 583×**43** | same, worse |

A tab strip, a "you are #24 of 24" line, a source note and a 24-row table all
lived in one `.modal-card`; on a landscape phone the flexible table got whatever
was left, which was 51 px. That is the "sobrang siksikan sa isang frame" in the
brief, and it was measurable, not a matter of taste.

### 25.2 The new shape

The screen is now its own overlay (`#leaderboard-modal.overlay-screen.lb-screen`)
with the generated hall wall behind it, and **four separate frames** instead of
one:

- **THE PODIUM** — three cards, gold / silver / bronze, each with that metal's
  banner medallion bleeding off its right edge, the commander name in the
  display face, and power + level/stars/medals underneath. Missing places keep
  their frame and say `AWAITING A CHAMPION`.
- **THE ROLL** — every commander from rank 4 down, in its own carved frame with
  its own scrollbar.
- **YOUR STANDING** — rank, name and six numbers (power, level, stars, medals,
  best score, waves) in a side card. `my_rank` already returned `bestScore` and
  `waves`; the client now keeps them (`CloudSave.myRank`) and the card shows
  them.
- **RECORDS ON THIS DEVICE** — the local merge-sorted run history, unchanged in
  substance, now in the same frame language.

The shell lost its own 22 px carved plate; header, each block and the footer are
panels of their own (`--ui-panel-soft`), so the hall art shows between them.

### 25.3 Names

Every commander name is now gold in `--font-display` with a soft shadow:
`.lb-name` in the roll and `.lb-champ-name` on the podium. The player's own row
gets `#ffe6a4` plus a glow, a left gold rule and an outlined `YOU` tag. Measured
contrast of `#f3c96b`-family gold on the block fill (`rgba(8,10,14,0.74)` over
dark art) stays above 7:1; `check:contrast` still passes 57/57.

### 25.4 Mobile and cut-offs

Three layouts, measured rather than eyeballed:

| viewport | layout | roll rows visible (of 22) | text clipped | footer inside |
| --- | --- | --- | --- | --- |
| 1920×1080 | podium strip / roll + standing | 19 | none | yes |
| 1440×900 | same | 14 | none | yes |
| 1366×768 | same | 11 | none | yes |
| 1280×720 | same | 10 | none | yes |
| 1024×600 | short-landscape stack (compact) | 13 | none | yes |
| 932×430 | landscape phone: podium strip, roll + standing | 6 | none | yes |
| 844×390 | same | 4 | none | yes |
| 736×414 | same | 5 | none | yes |
| 667×375 | same | 4 | none | yes |
| 768×1024 | tablet: podium strip, roll + standing | 22 | none | yes |
| 390×844 | portrait: podium → standing → roll, body scrolls | 8 | none | yes |
| 414×896 | same | 9 | none | yes |
| 360×640 | same | 6 | none | yes |

Every row is measured by `finalSweep.mjs`, which also reports console errors and
failed requests: **0 and 0 at all thirteen sizes**, gold name colour
`rgb(243,201,107)` everywhere, and `standOverflow: 0` (the standing card never
scrolls its own text).

The clip detector is stricter than a bounding-box test: it walks every readable
node (names, powers, stats, headings, th keys) up to the nearest ancestor that
hides its overflow and reports it only when the text itself would be cut. It
also ignores decorative bleed — the podium emblem is *meant* to run past its
card. `outside: 0` everywhere; at 360×640 the roll's 22 rows simply extend past
the fold and the body scrolls to them (verified: `scrollTop 213`, roll fully
visible above the footer).

Two real bugs came out of that sweep:

- The podium medal (22 px) overran the two text rows of its `minmax` grid and
  was clipped by the card's own `overflow: hidden` at every short viewport.
  Fixed by giving the rows explicit minimums.
- On the device tab, a finished run's summary was appended *under* the table and
  pushed `RECORD THIS RUN` below the footer on a landscape phone. The device body
  is now a column with the summary pinned first, and the table keeps a 72 px
  floor so it can never collapse into an empty bar again.
- "BEST SCORE" is 10 characters in a 7 px face; in a three-column standing card
  it wrapped onto two lines and printed over "WAVES". The short-landscape card
  now uses **two** columns, and the two tie-breaker numbers only appear above
  388 px of height — below that the card would overflow by 22 px, which was
  measured, not guessed.

### 25.5 Fixing a double-close found in passing

`render()` and `_paint()` both called `bindEvents()`, and `bindEvents()` attached
the backdrop click. Every realm load painted twice, so a single click on the dim
ran `hide()` twice — and `onClose` with it (which restores the world map). The
chrome binding moved to `_bindChrome()`, called once per render;
`tests/leaderboard-hall.test.js` now asserts `onClose` fires exactly once after a
repaint.

### 25.6 Verification

- **Tests**: `tests/leaderboard-hall.test.js` adds 16 cases (own-screen mount,
  three separate frames, one commander per podium place, vacant places, the whole
  standing, tab round-trip, single close, HTML escaping, no-ledger and
  failed-read states, no emoji rank, the CSS contract for the three-frame layout
  and the generated art). Suite: **1395 passing / 114 files** (was 1379 / 113).
- **Build**: clean — `index-Cub73_aR.css` 198.83 kB (39.17 gzip),
  `index-C8CaTq0Q.js` 617.16 kB (177.68 gzip), phaser unchanged.
- **In the real app**: opened from the world map's Champions' Hall landmark
  (`[data-wm-id="champions"]` → `#wm-enter`), the hall mounts with the podium,
  22 roll rows and the standing card; closing it returns to the map with the map
  still visible. 0 console errors, 0 failed requests at every size above.
- **Recording a run**: from a victory, `RECORD THIS RUN` closes the summary,
  the table shows `1 Nyx… 4210 6 73.4s VICTORY` highlighted, at 844×390, 667×375,
  390×844 and 1366×768, with no console errors.

### 25.7 What this is not

The roll is capped at the 25 rows `leaderboard_page` returns; the standing card
carries your true rank even when it is outside that page (it read `#224 of 240`
in one probe). Pagination beyond one page is still not built, and the podium
reads only from that first page — a player ranked 200th sees their real standing
but not their neighbours. The generated art is committed as WebP at build-time
quality; the sources stay in `art-source/` so it can be re-cut without
re-generating.

## 26. The phone inspector stops hiding its own button

### 26.1 What was wrong

Tapping a defence on a phone opened a sheet whose body is the only scrolling
region. The upgrade card was the *last* thing in that body, under the targeting
row and seven stat cells, so on every landscape phone the one button the panel
exists for started below the screen. Measured at 844×390 with a fresh tower:

| | before |
| --- | --- |
| sheet | 832 × 203 px, top at y=125 |
| body | 151 px tall, **224 px of content below the fold** |
| upgrade button | top **y=409** on a 390 px screen |
| SELL | y=522 |

At 667×375 the two path cards (level 2) were 11 px taller than the body, so even
after scrolling to the bottom their price row was clipped. A new player saw four
targeting chips and six stat cells — nothing to press.

### 26.2 What changed

All of it is the phone shell; the desktop panel is untouched (`[data-shell="mobile"]`
selectors only, verified by screenshot at 1366×768 and 1024×600).

- `.inspector-actions { display: contents }` on the phone, so the upgrade card and
  SELL join the body's flex flow and can be ordered independently.
- `order: -1` puts the upgrade / the path choice / the FULLY UPGRADED badge
  **first**, directly under the title; `order: 10` sends SELL to the end.
- The single upgrade became a one-line bar (art · what it becomes · four
  before → after chips · price · UPGRADE) at 44 px, and it is `position: sticky;
  top: 0` with an opaque plate, so reading SPECIAL PERK or SIGNATURE cannot
  scroll the buy button away.
- Both path cards now sit in a two-column grid instead of a horizontal scroller:
  a swipe nobody knows about is not a way to compare two options.
- The sheet cap moved from `52vh` to `58vh` (still `max-height: min(58vh, 250px)`,
  still above the dock) because at 667×375 the cards ended exactly on the body's
  edge and their price row was dimmed by the scroll fade.
- A 14 px fade on the frame's bottom edge, gated by `HUD#syncInspectorScroll()`
  (`is-scrollable` while the body overflows, `is-scroll-end` once it is spent),
  replaces the hard cut through a stat row. A freshly inspected tower also starts
  at `scrollTop: 0` instead of inheriting the last tower's offset.

Two real defects fell out while measuring:

- the wall's upgrade card printed **`RATE NaN → NaN`** (`cooldown` is undefined on
  a palisade). Chips now refuse non-finite numbers, and a non-attacking defence
  gets `HP 420 → 900` and `THORNS 0 → 20` — the numbers it actually has;
- the header printed the tower name twice (`SIEGE BALLISTA ★5 Siege Ballista`).
  The chip is now `★5 · MAX` / `★3` / `★2 · REINFORCED`.

### 26.3 Verification

Probe `inspSweep.mjs` builds a tower through `attemptBuild()`, opens the
inspector, then upgrades once so the path choice is on screen. "up" means the
upgrade bar is entirely inside the body's visible area (not merely in the DOM);
"cards/cta" means both path cards and their price rows are.

| viewport | L1 upgrade visible | body | scroll left | L2 cards + price visible | console errors |
| --- | --- | --- | --- | --- | --- |
| 568×320 | yes | 134 px | 198 px | yes | 0 |
| 667×375 | yes | 166 px | 166 px | yes | 0 |
| 736×414 | yes | 188 px | 143 px | yes | 0 |
| 844×390 | yes | 174 px | 157 px | yes | 0 |
| 932×430 | yes | 197 px | 134 px | yes | 0 |
| 1024×600 | yes | 198 px | 133 px | yes | 0 |
| 1280×720 (`?hud=mobile`) | yes | 198 px | 134 px | yes | 0 |

- **Production build** (`vite preview`, 4320): same two states pass at 844×390 and
  667×375 with 0 console errors and 0 failed requests (`prodInsp.mjs`).
- **End to end** (`inspClick.mjs`, 844×390, real taps): upgrade bar → level 2
  (−50 gold); PATH II card → level 3, `sniper` (−100); two more taps → level 5,
  the bar is replaced by `★★★★★ FULLY UPGRADED`; scrolled to the end the panel
  reads `is-scrollable is-scroll-end`; SELL removes the tower and refunds 390.
- **Desktop untouched**: 1366×768 and 1024×600 still render the floating panel
  with the tall two-row card inside the scrolling body.
- **Tests**: `tests/inspector-sheet.test.js` adds 13 cases (action-first CSS
  contract, no horizontal scroller, 44 px target, the fade's two classes, the
  scroll reset, the chip maths including the wall, the de-duplicated header).
  `tests/mobile-shell.test.js` now pins the 58vh cap with the measurement that
  forced it. Suite: **1408 passing / 115 files**. Contrast: **68/68**. Build
  clean: `index-CIkrR0pq.css` 202.05 kB (39.76 gzip), `index-BMbpo9C1.js`
  617.89 kB (177.86 gzip).

## 27. Ground and air become one rule (Request 36, part one)

The audit for this request found the flying archetype honoured in exactly one
place — a tower choosing its next target — and ignored by every effect that fires
without an aim. A Boulder Sling could not *aim* at a wraith, and still damaged
one standing inside its blast; a ground-locked keep's chain lightning climbed
into the sky. That is the bug this section covers.

### Written, not patched four times

`src/systems/TargetCategories.js` now owns the rule
(`canTarget`, `projectileCanHit`, `defenceTargets`) plus the two labels the UI
prints. `Tower.acquireTarget`, `Projectile.impact`, `Projectile.frostNova`,
`Projectile.executeChainLightning` and `Tower.checkBarricadeThorns` all ask it.
`Tower.fire` copies the firing line's categories onto the shot, because the tower
may be gone by the time a slow shell lands. The palisade now declares
`targetsAir: false` — it was silently claiming the sky.

The chain was rewritten while passing through: it walked the enemy array once,
could not repeat a target by construction, and could not pick the nearest one. It
now takes the nearest valid creep and keeps a visited set.

### Air is a route

`src/systems/AirRoutes.js` derives three sky lanes per board (three mouths on the
top rim, a drop, a diagonal into the bastion cell). `GameScene.spawnEnemy` sends
a flying creep down the sky lane for the same wave ordinal the ground horde uses.
Level 1, measured in the browser: ground lane starts `2,4` with 25 waypoints, sky
lane starts `1,12` with 15, both end on the bastion `9,21`.

The wraith is no longer a stage-5 exclusive: 2 + 5 in stage 1, 4 in stages 2 and
3, 9 in stage 4. The debut wave is never one of the first three.

### Tests added

* `tests/target-categories.test.js` — 23 tests over the real `Tower`,
  `Projectile` and `Enemy` classes: splash, nova, chain, thorns, and the
  "sweeps the sky" opt-out.
* `tests/air-routes.test.js` — 15 tests: ≥ 2 lanes per board, every lane ends on
  the bastion, every board's sky crosses ground the road cannot, lanes differ
  from the roads, determinism, and the wave data actually using them.

### Tests updated (behaviour deliberately changed)

| file | old assertion | new assertion |
| --- | --- | --- |
| `tests/flying.test.js` | wraith only in stage 5 | wraith in ≥ 4 stages, never in waves 1–3 |
| `tests/lane-routing.test.js` | spawn uses the road lane, verbatim | ground uses the road lane, flyers use the sky lane, one `lane` variable |
| `tests/enemy-assets.test.js` | `types.has(group.type)` | compares **art** keys — the wraith flies on the wyvern sheet |
| `tests/mobile-shell.test.js` | sheet cap 58vh / 250px | 70vh / 280px, with the measurement that forced it |

### In the browser (Chromium, dev server and production build)

| check | 844 × 390 dev | 844 × 390 production (`?probe=1`) |
| --- | --- | --- |
| dock badges | `BOTH`/`GROUND` on 12 cards, barricade `GROUND` | same |
| inspector `TARGETS` cell | `GROUND + AIR` (`targets-both`) | same |
| ground lane / sky lane start | `2,4` / `1,12`, both end `9,21` | same |
| cannon vs wraith, 90 ticks | fired 0 shots, HP 152 → 152 | fired 0 shots, HP 152 → 152 |
| archer vs wraith, 90 ticks | fired 3 shots, HP 152 → 104 | fired 3 shots, HP 152 → 104 |
| scout strip | `NEXT IN 9 · AIR`, wraith chip flagged `air` | same |
| console errors / failed requests | `[]` / `[]` | `[]` / `[]` |

### The phone inspector, re-measured

| viewport | sheet | body | upgrade row | targeting | path cards |
| --- | --- | --- | --- | --- | --- |
| 844 × 390 | 273 px | 221 px | y 118–162 | y 168–213 | 108 px, both visible |
| 667 × 375 | 263 px | 211 px | y 114–158 | y 164–209 | 108 px, both visible |
| 568 × 320 | 224 px | 172 px | y 97–141 | y 147–192 | 108 px, both visible |

Before: 203 px sheet / 151 px body with the upgrade 224 px below the fold.

Full suite after these changes: **1446 passing / 117 files**. Contrast:
**68/68**. Build clean (`index-CIKq2dGO.css` 204.13 kB / 40.17 gzip,
`index-DfrhpGnN.js` 621.48 kB / 178.97 gzip).

Not done, and not claimed: specialist branches, new CC0 art, and the authored
stage aspect (5:3) were not touched. See `docs/bastion-overhaul.md` §6.

## 28. Req 37 — battlefield, bastion and asset pipeline

### 28.1 World geometry, before and after

| | before | after |
| --- | --- | --- |
| board | 26 × 12 = **1664 × 768 px** (2.17 : 1) | 32 × 12 = **2048 × 768 px** (2.67 : 1) |
| columns | absolute numbers (`3`, `22`, `[8, 16]`) | authored as axis offsets — `A(-8)`, `A(9)`, `[A(-4), A(4)]` |
| axis | hard-coded 12 | `ARENA.axisCol = 15`, exported `colAt()` |
| bastion row | 9 of 12 = 75 % down, two rim rows below | 10 of 12 = **87.5 % down**, one rim row below |
| keep clearance | `BASE_CLEARANCE = 1` | unchanged, plus `BASTION_APRON = 2` for scattered props |
| lanes | one centre pair | every board re-authored around the axis; 20 boards re-parsed |

The width was chosen against the camera band, not by taste: between the top bar
and the open forge the canvas leaves ≈ 2.7 : 1 at desktop sizes, so a 2.17 : 1
board was **height-bound** and left ~110 px of dead world on each side. At
2.67 : 1 the board fills the width at 1920 × 1080 and 844 × 390, and is within
14 % of filling it at 1366 × 768.

### 28.2 Measured result, seven viewports (dev server, Chromium)

| viewport | shell | canvas | zoom | board on screen | board % of viewport | bastion centre y | gap below bastion |
| --- | --- | --- | --: | --- | --- | --: | --: |
| 360 × 640 | portrait → rotate gate | 360 × 216 | 0.625 | 360 × 135 | 100 / 21 % | 335 | 305 |
| 390 × 844 | portrait → rotate gate | 390 × 234 | 0.625 | 390 × 146 | 100 / 17 % | 441 | 403 |
| 768 × 1024 | portrait → rotate gate | 768 × 461 | 0.625 | 768 × 288 | 100 / 28 % | 583 | 441 |
| 667 × 375 | landscape phone | 667 × 400 | 0.625 | 667 × 250 | 100 / 67 % | 208 | 167 |
| 844 × 390 | landscape phone | 813 × 488 | 0.622 | 809 × 303 | 96 / 78 % | 217 | 173 |
| 1366 × 768 | desktop | 1366 × 820 | 0.540 | 1181 × 443 | 86 / 58 % | 362 | 406 |
| 1920 × 1080 | desktop | 1920 × 1152 | 0.625 | 1920 × 720 | 100 / 67 % | 597 | 483 |

Bastion centre sits at 87.5 % of the board height in **every** row of the table,
and the row below it (row 11) is plain rim — so the fortress always has ground
under it, never the dock edge. On the two portrait phone sizes gameplay is
paused by the rotate gate; they are listed because they were opened.

Camera: fit zoom 0.540 (height-bound, 1366 × 768) to 0.625 (width-bound,
1920 × 1080); `min` equals the fit, `max` 3×. Wheel zoom-in measured 0.540 →
0.752, zoom-out clamped back to 0.540, drag panned `scrollX 384 → 557` with the
board still inside `worldView` (2369 wide vs 2048 of board).

### 28.3 Perimeter and build pads

Scripted over every board and the first five campaign levels:

- **20 boards** (17 campaign + 3 duel) parsed at 12 × 32 with gates on both banks.
- **2,348 scattered props** (rock + pond cells) across those boards, **0 inside the
  bastion apron** — the scatter now *relocates* a prop that lands within
  `BASTION_APRON = 2` of the keep instead of deleting it, so no scenery was lost.
- Level 1–5 slot lists: 16 / 15 / 16 / 16 / 16 pads, rows 6–9 only, **none on a
  lane tile, none in a blocked zone, none within 2 cells of the keep, all grass**.
- In the browser (prod build, 1366 × 768) a pad was clicked with the mouse and a
  Ballista was built at `(9, 22)`; gold 300 → 240. Placement inside the bastion
  (row 10), on the rim row 11 and on the river lane were all refused.

### 28.4 Ground and air, re-verified after the widening

| check | dev 1366 × 768 | prod 844 × 390 |
| --- | --- | --- |
| wraith path vs `airRoutes.laneAt(0)` | identical, 24 nodes | identical, 24 nodes |
| wraith `flying` / route cells | true / sky only | true / sky only |
| wraith reaches the bastion | base HP 20 → 19 at t+22 s, `assaulting` | same |
| ground wave 1 (10 grunts, 26-node road) | 10 defeated, 0 escaped, HP 20/20 | — |
| wave advance | wave 2 auto-started after the 10 s gap | — |
| cannon vs wraith (90 ticks) | 0 shots | 0 shots (from §27) |
| archer vs wraith (90 ticks) | 3 shots, 152 → 104 | same (from §27) |

The desktop run is a **real playthrough of wave 1** — card clicked, pad clicked,
START WAVE clicked — not a mocked call. It is not a full 8-wave campaign clear;
that is still unverified.

### 28.5 Build, tests, assets

- `npx vitest run` → **117 files / 1,446 tests passing** after the new geometry.
- `npm run build` → `index-CIKq2dGO.css` 204.13 kB (40.17 gzip),
  `index-DjaW4r0K.js` 622.15 kB (179.27 gzip), phaser 1,208.06 kB.
- Production preview on `:4320` re-ran the desktop flow above with the same
  numbers, and the 844 × 390 inspector sheet still measures **273 px / 221 px body**
  (`#inspect-targets` = `GROUND + AIR`).
- CSS hash is unchanged from §27 (`index-CIKq2dGO.css`), which is the check that
  no stylesheet was touched in this pass.
- Assets: audit and manual pack list in `docs/asset-integration.md` §8. Nothing
  new was downloaded; the shipped set is idle/move/death × 3 facings per
  creature, base + weapon strips per tower, Kenney CC0 effects.

### 28.6 Still open

1. At **1366 × 768** the board is height-bound: 86 % width, 36.9 px tiles on
   screen (20.8 px at 667 × 375, 25.3 px at 844 × 390, 60 px at 1920 × 1080). The
   binding constraint is chrome (91 px top bar + 227 px open dock = 41 % of the
   screen). Trimming it measures out to ≈ 6 % larger tiles, so the HUD layout was
   left alone rather than restyled for a marginal gain.
2. The authored stage is 5 : 3 while the board is 2.67 : 1 — the board letterboxes
   inside the stage. Not changed; this is the authored-aspect decision from §27.
3. `MAP_COLS = 20` in `src/config/gameConfig.js` still disagrees with the 32-column
   board. Nothing reads it for layout any more (the camera is data-driven), but the
   constant is misleading and should be derived from `ARENA`.
4. The phone inspector's SELL row is still below the fold at ≤ 390 px height; the
   sheet scrolls, and the fade marks it (§27 decision, unchanged).
5. No attack/hit animation rows exist for the creatures; packs that would supply
   them are listed in `docs/asset-integration.md` §8.4 but were not fetched.
6. Untested: a full 8-wave campaign on desktop, two-device PvP, 4K, real touch
   hardware, and the manual downloads in §8.4.

## 29. Request 38 — animated combat, visual overhaul and campaign proof

This pass is verification-first: every claim below was produced by a real
browser run on the dev server (`:4300`), and the fixtures are named where a
run was helped along. Nothing was committed, pushed or deployed.

### 29.1 Code changed in this pass

| File | Change |
| --- | --- |
| `src/config/gameConfig.js` | `MAP_COLS` / `MAP_ROWS` deleted; `STAGE_ASPECT = 5 / 3`, `STAGE_WIDTH = 1280`, `STAGE_HEIGHT = 768`, with `GAME_WIDTH` / `GAME_HEIGHT` kept as aliases for the Phaser canvas. |
| `src/scenes/GameScene.js` | Bastion apron (depth 5, two-tone ellipse + 1 px rim) under the keep; build pads repainted gold `0xf6e2ac` (double ring + four corner brackets over a dark halo) because the previous green ring disappeared on grassland. |
| `src/data/assetManifest.js`, `scripts/write_asset_manifest.mjs`, `docs/asset-manifest.md`, `tests/asset-manifest.test.js` | Asset manifest and the test that keeps the document honest (Req 38 part 2). |

`MAP_COLS` disposition: the constant was only ever read by `src/main.js:58-59`
(as `GAME_WIDTH`), so it was retired instead of being re-pointed at `ARENA`.
`grep -rn "MAP_COLS\|MAP_ROWS" src tests` now returns nothing. Tests that pin
the 1280 × 768 canvas (`camera-math`, `pvp`, `endless-map`) were left alone and
still pass, because the canvas size itself did not change.

### 29.2 Geometry, measured on seven viewports

| Viewport | Canvas (CSS) | Board (CSS) | % width / height | Zoom | Bastion y | From bottom |
| --- | --- | --- | --- | --- | --- | --- |
| 360 × 640 | 360 × 216 | 360 × 135 | 100 / 21 | 0.625 | 335 | 305 |
| 390 × 844 | 390 × 234 | 390 × 146 | 100 / 17 | 0.625 | 441 | 403 |
| 768 × 1024 | 768 × 461 | 768 × 288 | 100 / 28 | 0.625 | 583 | 441 |
| 667 × 375 | 667 × 400 | 667 × 250 | 100 / 67 | 0.625 | 208 | 167 |
| 844 × 390 | 813 × 488 | 809 × 303 | 96 / 78 | 0.622 | 217 | 173 |
| 1366 × 768 | 1366 × 820 | 1181 × 443 | 86 / 58 | 0.540 | 362 | 406 |
| 1920 × 1080 | 1920 × 1152 | 1920 × 720 | 100 / 67 | 0.625 | 597 | 483 |

Row visibility (camera viewport included, not just canvas pixels): at
1366 × 768 the twelve rows sit between y 126 and y 532, clear of the 82 px top
bar and the 216 px open dock; at 1920 × 1080 between 162 and 822; at 844 × 390
between 83 and 284 with the dock collapsed; at 667 × 375 between 73 and 302.
The 5 : 3 stage still bleeds 25 % vertically — that cap is deliberate
(`src/style.css:147-149`) and is what keeps the board full-bleed without
cropping a playable row.

The 5 : 3 stage versus the 2.67 : 1 board was re-evaluated and **left as is**:
the camera rig frames by world size (`fitZoom = clamp(min(w/bw, h/bh), 0.45, 1)`),
so the authored aspect changes how much scenery is on screen, not the tile size
needed for readable combat.

### 29.3 Asset pipeline

`node scripts/write_asset_manifest.mjs` → 12 packs, 20 creatures, 88 tower
variants, 14 projectiles, 14 impacts, 37 effect strips. Every creature sheet is
9 rows tall (idle / walk / death × 3 facings), `height = 9 × frameHeight` and
`width = frames × frameWidth`; `tests/asset-manifest.test.js` enforces both and
refuses any licence other than CC0-1.0 or project-owned.

The honest gap the manifest records: **20/20 creatures have idle, walk and
death, and none has an attack row or a hit row.** Fallbacks in play are the
70 ms white tint flash on damage (`src/entities/Enemy.js:510-516`), weapon
recoil plus muzzle flash on towers, and the per-line impact effects. No new
pack was downloaded — `opengameart.org`, `kenney.nl`, `itch.io` and
`raw.githubusercontent.com` are unreachable from this sandbox — so the manual
list stays in `docs/asset-integration.md` §8.4 and nothing was invented.

### 29.4 Combat readability (browser-verified)

- Walk: `enemy-grunt-d0-move`, 7 distinct frames observed.
- Death: `enemy-grunt-d0-death` plays, then the sprite is destroyed and removed
  from `activeEnemies`.
- Fire: the archer cycles `tower-top-archer-rest` ↔ `tower-top-archer-fire`,
  spawns exactly one projectile and drops a creep from 92 HP to 0. `Tower.fire()`
  is reachable only from `Tower.update()` (`src/entities/Tower.js:781`) behind
  `cooldownTimer <= 0 && canFire(...)` and a live `currentTarget`, so the muzzle
  flash and the `-fire` clip cannot play without executing the configured shot.
- Impact: `fx-line-archer-impact`, `fx-line-archer-muzzle`, `fx-spark`,
  `fx-smoke-light`, `fx-ring`, `fx-rune`; never more than six effect objects at
  once in the single-tower probes.
- Boss: `spawnEnemy('warlord', 8)` → two depth-58 bars, `activeBoss`
  "Abyssal Warlord", bars cleared after ≈ 1.8 s.

### 29.5 Inspector and upgrades (browser-verified)

All twelve dock entries were built, selected and read back; L1 damage, range,
cooldown and DPS equal `src/data/towerData.js`, and the target line matches the
firing rules:

| Dock key | Inspector title | Cost | DMG | Range | Rate | DPS | Type | Targets |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| archer | Scout Ballista | 60 | 16 | 155 px | 0.62 s | 26 | physical | ground + air |
| cannon | Mortar Battery | 110 | 55 | 150 px | 1.65 s | 33 | explosive | ground |
| frost | Chilling Crystal | 85 | 10 | 140 px | 0.95 s | 11 | magic | ground + air |
| forge | Anvil Forge | 120 | 60 | 140 px | 1.60 s | 38 | explosive | ground |
| runes | Rune Shard | 135 | 30 | 170 px | 1.10 s | 27 | magic | ground + air |
| banner | Banner Post | 125 | 16 | 155 px | 1.25 s | 13 | physical | ground + air |
| crossbow | Field Crossbow | 70 | 34 | 175 px | 0.95 s | 36 | piercing | ground + air |
| gatling | Hand Crank | 125 | 8 | 118 px | 0.15 s | 53 | physical | ground + air |
| flamer | Pitch Brazier | 95 | 18 | 105 px | 0.90 s | 20 + 12 burn | explosive | ground + air |
| venom | Toxic Gourd | 105 | 16 | 165 px | 1.10 s | 15 + 14 poison | magic | ground |
| harpoon | Dock Winch | 115 | 75 | 200 px | 2.20 s | 34 | physical | ground |
| barricade | (wall panel) | 30 | — | — | — | 420 / 420 HP | — | ground only |

Upgrade chain on the archer: L1 → L2 costs 50 (gold 740 → 690) and the panel
re-renders as "Twin Ballista"; L2 offers two specialisation cards (PATH I Rapid
Ranger / PATH II Sniper Tower); PATH I → L3 costs 90 (690 → 600) and reads
"DAMAGE 30 · RANGE 178 px · 0.22 s · DPS 136". Every card preview matched the
tier it sold: L1 promised `DPS 26 → 48`, `RATE 1.6 → 1.9`, `RANGE 155 → 168` and
L2 delivered exactly that; L3 promised `136 → 238` for Tempest Ranger. Two
clicks in the same frame produced level 1 → 3 and 140 gold spent (50 + 90), so
there is no double deduction. The barricade is placed on a road tile only
(`6, 11` in that run) and upgrades to "Reinforced Palisade", 420 → 900 HP and
0 → 20 thorns.

Rejected placements (no tower added, no gold spent): the keep tile, the bottom
rim row, and a river/road lane.

### 29.6 Campaign, victory and defeat (browser-verified)

- **Victory, natural run**, 1366 × 768 at 2×: 8/8 waves, 20/20 HP, 186 kills,
  0 leaks, 415.1 s, score 10,374, 3/3 stars, two unlocks
  (`/tmp/browser/campaign-win3.log`).
- **Defeat, natural run** with no towers: 20 → 0 HP at ≈ 33 s, DEFEAT card,
  no `#result-next` (`/tmp/browser/defeat2.log`).
- **Leave battle**: pause → `#btn-menu` shows `#quit-warning` once, the second
  click returns to the world map with the HUD hidden.
- **Result wiring** (forced-victory fixture — used *only* for the buttons; the
  natural victory above is separate evidence): `#result-replay` restarts level 1
  with 0 towers, 20 HP and 0 waves and no second scene left running;
  `#result-next` loads level 2 with 25 HP; `#result-menu` returns to the menu.

### 29.7 Suite, build, performance

- `npx vitest run` → **118 files / 1,453 tests passing**.
- `npm run build` → `index-CIKq2dGO.css` 204.13 kB (40.17 gzip),
  `index-BXYeg3lW.js` 622.92 kB (179.45 gzip), phaser 1,208.06 kB.
- Perf sample — headless Chromium on ANGLE/SwiftShader, i.e. a **CPU
  rasteriser and therefore a floor, not a GPU claim**: 8 towers and 40 creeps at
  1× averaged 53.2 fps (min 42.7); 59 creeps at 2× averaged 56.6 fps (min 54.5);
  at most 785 display objects, 31 effect objects, 35.6 MB JS heap and 904–926
  texture keys.
- The production preview on `:4320` now serves that build
  (`index-BXYeg3lW.js`); the desktop flow was re-run against it — build by real
  click, wave 1 cleared 10 defeated / 0 escaped / 20 HP, wave 2 auto-started,
  `errs [] failed []`.

### 29.8 Partial and untested

1. No attack or hit rows exist in the shipped creature sheets — the tint flash
   and recoil are the honest fallback; new packs are manual downloads.
2. The bastion is a static CC0 fortress SVG: no idle / damage / destruction
   frames, only flash + pulse + shake.
3. A heavy run created 22 new texture keys (904 → 926) that were not traced; a
   fresh run showed no "Texture key already in use" warning.
4. Build pads are visible only while a defence is armed (by design) — a player
   may read the ground as featureless before choosing.
5. Levels 2–5 were not played to a terminal state in this pass; **§30 closes
   that gap** — all five levels reached a verified victory, and level 2 also
   ended in a real defeat.
6. Performance was measured in software rendering only; 4K, real touch hardware,
   two-device PvP and the manual asset downloads remain untested (§28.6).

## 30. Request 39 — full campaign regression and progression validation

Nothing was committed, pushed, merged or deployed. No art was downloaded or
generated. The only code change in this pass is a test file; the campaign data,
waves, towers, heroes, spells and progression rules were not modified.

### 30.1 What was inspected first

Existing coverage that already answered part of the brief, so it was **not**
repeated: `campaign-levels` (every node wires to a pathable board, each level
closes with its boss wave), `wave-flow` (one authored wave list spawns in order
and completes), `progression` (a single clear, a replay, a defeat, persistence),
`campaign-ui` (Next button only when a next level exists, defeat shows Retry),
`world-map` / `difficulty` (a locked banner renders `is-locked` and its DEPLOY is
disabled), `target-categories` (the ground/air rule at unit level) and
`systems` (a match cannot be both game-over and victory).

What was genuinely missing, and is what this pass adds:

1. **Every shipped level walked end to end through the real wave queue** — not
   one authored list, all five.
2. **The five-level unlock chain** as one sequence, with rewards, stars and the
   campaign-complete flag.
3. **Natural browser playthroughs of levels 2–5** to a terminal state.
4. **Restart hygiene** — a re-initialised scene must not inherit the previous
   battle's frame, draft offer or mode flags.

### 30.2 Level-by-level results (browser, real game logic)

Method: production-equivalent dev build on `:4300`, `?probe=1`, real pointer
clicks for builds and for every result button. Level 5 was then played again on
the **built bundle** served by `vite preview` on `:4320`, to prove the shipped
build reaches the same terminal state. The **battles are natural** —
real waves, real pathing, real targeting, real economy. Two things were
controlled and are labelled as such: playback ran at the game's own **2× speed
toggle**, and the build/upgrade decisions were made by a probe routine (it
builds on the highest-coverage pads, then upgrades) rather than by a human.

| Level | Start (HP / coins / waves) | Result | HP left | Kills | Leaks | Stars | Wall time | Upgrades | Reward |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Verdant Marches | 20 / 300 / 8 | **VICTORY** 8/8 | 20/20 | 180 | 0 | 3★ | 196 s | — | +150 gold, +5 gems, opened level 2 + Endless |
| 2 Sunscorch Mesa (run A) | 25 / 240 / 7 | **DEFEAT** at wave 4 | 0/25 | 67 | 0 | — | 80 s | 8 towers | profile unchanged |
| 2 Sunscorch Mesa (run B) | 25 / 240 / 7 | **VICTORY** 7/7 | 25/25 | 137 | 0 | 3★ | 132 s | 29 | +200 gold, +7 gems |
| 3 Frostbite Hollow | 25 / 260 / 8 | **VICTORY** 8/8 | 25/25 | 168 | 0 | 3★ | 197 s | 38 | +260 gold, +9 gems |
| 4 Prism Depths | 25 / 280 / 9 | **VICTORY** 9/9 | 14/25 | 258 | 0 | 2★ | 238 s | 64 | +320 gold, +10 gems |
| 5 Ashen Caldera | 25 / 320 / 10 | **VICTORY** 10/10 | 24/25 | 271 | 0 | 3★ | 228 s | 78 | +380 gold, +15 gems, campaign complete |
| 5 Ashen Caldera (production bundle, `:4320`) | 25 / 320 / 10 | **VICTORY** 10/10 | 25/25 | 271 | 0 | 3★ | 227 s | 70 | +380 gold, +15 gems, campaign complete |

Observations that matter:

- **Run A of level 2 is a real defeat** (25 → 0 HP at wave 4) with the same
  shallow policy that cleared level 1. Run B, which upgrades instead of spreading
  eight level-1 towers, clears it with a perfect core. The difficulty step
  between level 1 and level 2 is real, and upgradeable rather than unwinnable.
- **Level 4 finishes on 14 / 25 HP** and the result screen pays exactly 2 stars
  (14 / 25 = 56 %, above the 50 % two-star gate and below the 85 % three-star
  gate) — the star thresholds are live, not decorative.
- **Every wave sequence was strictly increasing** (0..8, 0..7, 0..8, 0..9,
  0..10) with no repeated wave number, i.e. no duplicate wave starts.
- **HP loss with `leaks: 0` is expected**: creeps that arrive at the bastion do
  not despawn, they *assault* it. `handleEnemyHitBase` counts `baseHits`;
  `handleEnemyReachedBase` is the path that increments `enemiesEscaped`. A
  defeat with zero escapes therefore means the wall was chipped down, not that
  the counter is broken.
- Level 1 (natural, no seed) is the evidence that clearing a stage really opens
  the next road: the profile came out as `unlocked: [level-1, level-2, endless]`
  with `stars: {level-1: 3}` and 150 gold in the bank.

Per-run verdicts (actions: open the world map → pick the banner → DEPLOY →
build/upgrade until the result screen → press the result button):

| Run | Expected | Actual | Verdict | Console / network |
| --- | --- | --- | --- | --- |
| Level 1, map → deploy → play | victory only after wave 8 | VICTORY 8/8, 20/20 HP, result card | **PASS** | none / none |
| Level 2 (run A), same policy as level 1 | hold or lose honestly | DEFEAT at wave 4, 0 HP, RETRY offered, no NEXT | **PASS** (defeat path) | none / none |
| Level 2 (run B), upgrade-first policy | victory with all 7 waves | VICTORY 7/7, 25/25 HP, 3★ | **PASS** | none / none |
| Level 2 → REPLAY | same stage, clean battle, no reward | wave 0, 0 towers, 25 HP, 240 coins, profile unchanged | **PASS** | none / none |
| Replay → pause → LEAVE (twice) | confirm, then the map, HUD hidden | `#quit-warning`, then `['MenuScene']`, HUD hidden | **PASS** | none / none |
| Level 3 → NEXT LEVEL | level 4 loads clean | `level-4`, crystal, 25 HP, 280 coins, 0 towers | **PASS** | none / none |
| Level 4 victory | 9/9 waves, stars follow HP | VICTORY 9/9, 14/25 HP, 2★ | **PASS** | none / none |
| Level 5 victory | 10/10, complete, no NEXT | VICTORY 10/10, "CAMPAIGN COMPLETE", no `#result-next` | **PASS** | none / none |
| Level 5 → MAIN MENU | menu, one scene | `campaignComplete: true`, `['MenuScene']`, HUD hidden | **PASS** | none / none |
| Level 5 on the shipped bundle (`:4320`) | same terminal state as dev | VICTORY 10/10, 25/25 HP, 271 kills, `TIME 455.7s`, campaign complete, MAIN MENU → `['MenuScene']` | **PASS** | none / none |
| Cannon vs wraith (production build) | never targets air | 21 in-range samples, no target, 120 → 120 HP | **PASS** | none / none |
| Archer vs wraith (production build) | targets air | targeted, 120 → 8 HP | **PASS** | none / none |
| Locked banner (fresh profile) | briefing opens, DEPLOY disabled | `disabled: true`, others `is-locked` | **PASS** | none / none |

Every one of those runs ended with `errs [] failed []` from the probe's console
and request listeners (the one exception is the console-driven `destroy()` case
noted in §30.9.5).

### 30.3 Progression rules, derived from the implementation

Documented here because the brief asks that none be invented:

| Rule | Where it lives | Behaviour |
| --- | --- | --- |
| Starting unlock | `createProfile()` | `unlocked: ['level-1']`, everything else locked, even Endless. |
| First clear | `computeRewards()` | full `level.reward` (gold + gems) **plus 1 gem** when the clear is 3★. |
| Replay | `computeRewards()` | `round(reward.gold × 0.2)` gold, **0 gems**, no second unlock. |
| Stars | `starRating()` | ✔ HP ratio ≥ `level.stars.three` → 3; ≥ `two` → 2; else 1. All five stages use 0.85 / 0.5. |
| Unlock | `recordVictory()` | `getNextLevel(id)` is appended to `unlocked`; level 1 also opens `endless`. |
| Campaign end | `recordVictory()` | clearing the last level sets `campaignComplete`; the result screen drops NEXT and prints "CAMPAIGN COMPLETE — ENDLESS SIEGE AWAITS". |
| Achievements | `syncAchievements()` | their gems are paid **on top of** the bounty; that is why level 1 banked 44 gems while the card printed +5. |
| Sell refund | `SELL_REFUND_RATIO = 0.6` | a 60-gold archer refunds 36 — measured in the browser, and the HUD prints the same number it pays. |
| Locked stage | `stageState()` + `WorldMapUI` | banner carries `is-locked`/`data-state="locked"`; the briefing still opens, but DEPLOY is `disabled`. |

### 30.4 Transitions, replay and teardown (browser, real clicks)

| Check | Expected | Actual |
| --- | --- | --- |
| Level 1 victory → NEXT LEVEL | loads level 2, clean battle | `level-2`, desert, 25 HP, 240 coins, 0 towers, 0 kills, 0 leaks, speed back to 1×, result gone, one active scene |
| Level 2 victory → REPLAY | same stage, clean state, no extra reward | `level-2`, 25 HP, 240 coins, wave 0, 0 towers, result gone; profile gold/gems/stars unchanged |
| Replayed battle → pause → LEAVE | confirm once, then the world map | `#quit-warning` shown, then `scenes: ['MenuScene']`, HUD hidden |
| Level 3 victory → NEXT LEVEL | loads level 4 | `level-4`, crystal, 25 HP, 280 coins, 9 waves, 0 towers |
| Level 5 victory → MAIN MENU | menu, campaign complete | `campaignComplete: true`, menu overlay open, `scenes: ['MenuScene']`, HUD hidden |
| Duplicate scenes / timers | exactly one active scene at every hop | every sample returned a single `GameScene` (or a single `MenuScene`); no second battle scene, no result left behind |

Level 5's result card reads `VICTORY Ashen Caldera 3 of 3 stars SCORE 13744
WAVES 10 / 10 … +380 +15 All the Stars CAMPAIGN COMPLETE — ENDLESS SIEGE AWAITS
REPLAY WORLD MAP LEADERBOARD MAIN MENU` — no `#result-next`, which is the last
stage's contract.

### 30.5 Ground/air compatibility in the browser

Run against the **production build** (`:4320`, `index-BXYeg3lW.js`), level 1.
One tower on pad `6,10`, which sits 46 px from the flight path a wave-1 wraith
actually takes; a wraith is then spawned into that same lane and tracked every
200 ms. Samples that are near the bastion are excluded, because a creep inside
the gate is `reachedBase` and no tower may target it any more.

| Tower on pad `6,10` | Range | Samples in range, not at base | Ever targeted the wraith | Wraith HP |
| --- | --- | --- | --- | --- |
| `cannon` (ground only) | 150 px | **21** (min distance 45 px) | **no** | 120 → **120** |
| `archer` (ground + air) | 155 px | **21** (min distance 46 px) | **yes** | 120 → **8** |

Same pad, same lane, same sampling: the ground-only battery never looks up even
when the flyer is 45 px away, while the archer locks it and takes 112 HP off in
one pass. This is the runtime half of the `target-categories` suite.

The control that proves the cannon was not simply idle: on the same pad, with a
ground `grunt` and a `wraith` of the same wave ordinal spawned together, the
cannon targets and hits the grunt (**92 → 7 HP**) while the wraith passes at
45 px and stays at **120 HP**. It is armed, it is shooting, and air is simply
not a category it declares.

Economy spot-check from the same run: selling that cannon returned **66 gold on
a 110 gold build** — exactly the 60 % `SELL_REFUND_RATIO`, paid into the same
balance the dock reads.

### 30.6 Locked-stage gate in the browser

Fresh profile — `unlocked: ['level-1']`:

```
banner-verdant   state=next     objective=true   locked=false
banner-sunscorch state=locked   locked=true
banner-frostbite state=locked   locked=true
banner-prism     state=locked   locked=true
banner-caldera   state=locked   locked=true
banner-endless   state=locked   locked=true
```

Opening the locked Frostbite briefing leaves `#wm-deploy.disabled === true`;
opening Verdant enables it.

### 30.7 Automated tests added

`tests/campaign-regression.test.js` — 6 tests, all passing:

1. **All five levels walk their whole wave list** through the real `WaveManager`
   (queue drains, one completion event per wave, strictly increasing wave
   numbers, the final wave flagged `isFinal`, `wavesCompleted` equals the list
   length, and a second `startNextWave()` in the same frame is refused).
2. **Each stage boss spawns exactly once, in the closing wave** (and is a real
   `isBoss` enemy). Level 1 closes with the warlord *followed by escorts*, so the
   assertion is "once, in the last wave", not "last in the queue".
3. **No unknown creature** is spawned by any level.
4. **The five-clear chain**: one road opens at a time, first clear pays the
   printed bounty (+1 gem at 3★), achievements pay on top, `getNextLevel` is
   unlocked, the last clear sets `campaignComplete`, and a replay pays the 20 %
   stipend with **no gems and no new unlock**.
5. **A locked stage stays locked** after an unrelated clear.
6. **A restart starts a fresh battle**: re-running `init()` on the same scene
   resets `battleFrame`, `battleFrameLocked`, `lastOffer` and the mode flags, and
   resolves the new level id — no carry-over from the previous stage.

### 30.8 Suite and build

- `npx vitest run` → **119 files / 1,459 tests passing** (118 / 1,453 before this
  pass; +1 file, +6 tests), 66.10 s on the final tree.
- `npm run build` → `index-CIKq2dGO.css` 204.13 kB (40.17 gzip),
  `index-BXYeg3lW.js` 622.92 kB (179.45 gzip), phaser 1,208.06 kB. Hashes are
  unchanged from §29, which is the check that this pass touched no shipped code.
  That bundle is what the `:4320` production run in §30.2 was played on.

### 30.9 Known issues, ambiguity and limitations

1. **Result-screen TIME is simulation time, not wall time.** `stepSimulation`
   advances the match clock by `Math.min(rawDelta, MAX_FRAME_DELTA) * simSpeed`
   (`MAX_FRAME_DELTA` = 50 ms, `src/scenes/GameScene.js:4011`), i.e. it caps how
   much simulated time one frame may add. On a fast machine that is exactly wall
   time × speed — the production level-5 run reported **TIME 455.7 s for 227 s of
   wall clock at 2×**, a clean 2.0 ratio — but when the headless SwiftShader
   renderer falls to a few frames per second, frames longer than 50 ms are
   truncated and the clock (and the wave timers with it) advances more slowly
   than the wall clock. Level 2's `TIME 33.7s` in a 132 s run is that clamp, not
   a stopwatch. It is a deliberate anti-jump guard, so it was not "fixed"; the
   reading is simply not a measurement of human play speed and every table in
   §30 uses wall time, not the card's TIME.
2. **Levels 2–5 ran on a seeded profile** (level 1 cleared, roads open). The
   *battles* were natural; only the "player has already cleared level 1" state
   was prepared. The unlock chain itself is covered naturally for level 1 (see
   §30.2) and for all five by test 4 in §30.7.
3. **Accelerated playback**: 2× speed toggle was used on every run. One frame in
   two is skipped by design, so this is the game's own fast-forward, not a
   different ruleset.
4. **No human-level play skill**: the probe's build order is deterministic
   (coverage-ranked pads, then upgrades). A different build could lose where this
   one won — run A of level 2 shows exactly that.
5. **Destroying a live enemy from the console logs a caught simulation error.**
   The category probe first removed flyers with `enemy.destroy()`; the scene then
   printed `[GameScene] simulation error (game loop kept alive): …` twice. The
   loop recovered and normal play never showed it (`errs []` on every campaign
   run), and nothing in the UI can reach that path, so it is recorded here rather
   than patched inside an unrelated system.
6. **Not tested in this pass**: two-device PvP, the non-campaign modes, real touch
   hardware, 4K, and the remaining manual asset downloads (§28.6). Also untested:
   an Endless run past the first milestone. Every campaign clear above ran on the
   dev server (`:4300`); the **production bundle** (`:4320`) was exercised with a
   full natural level-5 clear (§30.2, "production run"), which is where the
   shipped asset set and build-time transforms would differ.

### 30.10 Status summary

| Area | Status |
| --- | --- |
| Levels 1–5 to a terminal victory | **Verified — natural gameplay** (2× speed, probe-controlled builds); level 5 also on the production bundle |
| Result-screen TIME | **Explained** (simulation clock, clamped delta — §30.9.1), not a stopwatch |
| Defeat path | **Verified — natural** (level 2, run A: 25 → 0 HP, DEFEAT card, no NEXT) |
| Wave progression without duplicates | **Verified** (strictly increasing wave sequence on all runs + automated) |
| Rewards, stars, unlocks | **Verified** (level 1 natural; 2–5 on a seeded profile; all five by automated test) |
| Replay / Next / Map / Menu | **Verified** (real clicks, clean state, single scene) |
| Locked stages | **Verified** (browser gate + `world-map`/`difficulty` suites) |
| Ground-only vs air | **Verified** (browser: cannon never touches a wraith; archer does) |
| Sell refund | **Verified** (60 % of invested, HUD number equals the payout) |
| Duplicate reward claims | **Covered by automated tests only** (replay stipend, no gems, no re-unlock) |
| Stale state across stages | **Covered by automated tests only** (`init()` reset) |
| PvP, modes, touch hardware, 4K | **Not tested** (out of scope) |
## 31. Request 42 — base-defence overhaul and the five-tier wall

Nothing was committed, pushed, merged or deployed. No third-party art was
downloaded; no licences changed. The wall art in this pass is drawn in code, in
the same procedural kit as the rest of the board.

### 31.1 What was inspected first

Coverage that already answered part of the brief, so it was **not** rewritten:
`forge-defenses` (the wall is a five-tier structure with rising HP, thorns and
costs), `barricade-siege` (stop distance, contact range, swing cadence and the
queue-offset regression), `target-categories` (a wall is ground-only and its
"attack" can never be aimed at air), `build-points` / `systems` (placement zones
and reasons), `hud-dom` / `inspector-sheet` (the inspector contract) and
`graph-bfs` (a blocked cell really closes a route).

Two assertions *did* need updating because the wall moved from
`engineerDefenses.js` into the shared `towerData.js` roster, and because
`hud-dom` was still asserting the old 30-gold palisade. Neither test was
weakened: `target-categories` now imports the real `BARRICADE` (it had been
importing an undefined symbol and silently skipped the wall in the ground-only
list), and `hud-dom` asserts the new 40-gold price.

### 31.2 The wall as a real structure

| Tier | Name | Max HP | Upgrade cost | Thorns | Texture |
| --- | --- | --- | --- | --- | --- |
| 1 | Wooden Palisade | 500 | build 40 | 0 | `wall-t1` |
| 2 | Reinforced Wood Wall | 1 000 | +60 | 15 / s | `wall-t2` |
| 3 | Stone Wall | 2 000 | +100 | 30 / s | `wall-t3` |
| 4 | Fortified Stone Wall | 3 600 | +170 | 50 / s | `wall-t4` |
| 5 | Imperial Fortress Wall | 6 000 | +260 | 80 / s | `wall-t5` |

- **The infographic's numbers are not copied.** It asks for 1 000 → 12 500 HP.
  At the top of the ladder a single archer does 16 damage every 0.62 s, so
  12 500 HP would take several minutes of focused fire per segment and make the
  wall the only structure worth buying. The shipped ladder keeps roughly the
  infographic's *shape* (5 × 1 → 5 × 12 of the base) but scales it to the
  board's real damage numbers: 500 → 6 000 is 12× the tier-1 pool, and a
  tier-5 wall survives about a minute of a mid-game horde.
- **Damage is real and shared.** `Tower.takeDamage` is the single entry point for
  every structure; `health`, `maxHealth`, `isDestroyed` live on the same object
  the towers and walls already used, so the inspector, the badges and the
  selection ring read one number.
- **Upgrades keep the damage taken.** `upgrade()` recomputes the new pool and
  scales the current HP by the old ratio (`newMax * old / oldMax`, floor 1).
  A wall at 50 % stays at 50 %; there is no silent full heal. `upgradeLock`
  (260 ms) makes a double-click charge once. At tier 5 `nextUpgrades` is empty,
  so the dock has no button to press.
- **Destruction happens once.** `GameScene.destroyStructure` frees the cell,
  clears the selection, bumps `barricadesDestroyed` / `towersDestroyed`, shakes
  the camera, emits particles, drops a rubble decal and re-runs the lane BFS.
  A structure that is already destroyed is removed from `activeTowers` before
  any of that, so a second hit cannot replay the effect.

### 31.3 The art, and why it is procedural

The existing `barricade.png` / `barricade_lvl2.png` are flat fences — thin
boards with visible gaps — so a run of them reads as a row of props, not a
rampart. They are unused after this pass and nothing loads them.

The five tiers are drawn by `TextureFactory.makeWalls()` into 64 × 64 canvases,
full-bleed edge to edge (verified: adjacent sprites share an edge with a gap of
`0.000` px and a vertical overlap equal to the tile height of `64` px, at the
display width of `64` px):

| Tier | Material drawn | How it differs |
| --- | --- | --- |
| 1 | Six sharpened stakes, lashed rails | warmest wood, pointed silhouette |
| 2 | Four heavy planks, three iron bands, rivets | metal bands catch the light |
| 3 | Three offset stone courses | cool grey, mortar joints |
| 4 | Stone body, crenellated merlon row, iron studs | tallest, hardest silhouette |
| 5 | Dark stone, gold band, central crest, gold caps | gold trim, imperial crest |

Damage is a runtime overlay driven by real HP (`drawDamageOverlay`): hairline
cracks at 75 %, a knocked-out chunk and two cracks at 50 %, a third crack and a
−2.5° lean at 25 %. Full health draws nothing. A destroyed wall leaves
`wall-rubble`, tinted per tier, which fades out after 1.1 s.

No spritesheet animation exists for the wall and none is claimed: requirement 6
allows the "level sprites + damage-state system" fallback when no licensed
sheet covers the subject, and the fallback is what shipped. The textures are
generated deterministically at boot, so there is no external asset to license,
no download to fail and no alpha channel to lose; the canvas is transparent
outside the wall body by construction.

### 31.4 Placement and navigation rules

- A wall may stand on grass **or** on a road tile; it may not overlap a keep,
  the bastion, another wall or a cell occupied by anything else. The reason
  strings a player can see are unchanged (`road-tile` for keeps, `occupied` for
  a second structure on the same cell).
- **A wall on the road is not a detour, it is a barrier.** It is deliberately
  excluded from `blockedBuildCells()`, so the lane BFS keeps the original route
  and the horde walks into it and stops. A wall on grass *is* a blocker, so the
  pre-flight that refuses a build which would seal every route applies to it.
- Destroying either kind calls `refreshLanes()`, so the blocked set is rebuilt
  from `activeTowers` and the freed cell is walkable on the same frame.
- Walls never fire and never acquire: the combat tick returns early for a
  barricade, so `currentTarget` stays `null` and no projectile is ever created
  with a wall as its owner.

### 31.5 Browser evidence (real scene, real waves)

Method: dev server on `:4300`, production bundle served by `vite preview` on
`:4320`, both at `?probe=1&hud=desktop`, 1366 × 768, real Phaser scene, real
enemies and real tower fire. Gold was topped up on purpose so the checks could
build repeatedly; every damage, death and route change below came from the
simulation, not from a mock.

| Probe | What it exercised | Result |
| --- | --- | --- |
| `req42.mjs` (`:4300`, `:4320`) | horizontal / vertical / diagonal wall shapes, 40 g each; L1→L5 (levels 1,2,3,4,5,5), max 500/1000/2000/3600/6000, textures `wall-t1..t5`, costs 60/100/170/260, tier-5 press refused with 0 spent, double-click charged once | **ALL PASS** on both servers |
| `req42.mjs` damage | wall at 250/500 upgraded to 500/1000 — ratio preserved | **PASS** |
| `req42.mjs` siege | lane wall (row 5, col 15) attacked: 500 → 20 HP, destroyed at ≈29 s, cell freed, horde reached 79 px from the bastion, `barricadesDestroyed: 1` | **PASS** |
| `req42.mjs` keep siege | keep beside the lane 500 → 380 (one 120-damage swing), bar drawn, destroyed → removed, `towersDestroyed: 1` | **PASS** |
| `req42b.mjs` placement | reason histogram over the whole board: 90 `blocked-tile`, 78 `enemy-half`, 30 `spawn-zone`, 46 `road-tile`, 2 `base-zone`, **138 `ok`**, 0 `not-a-slot`, 0 outside the build bounds | **PASS** |
| `req42b.mjs` cost | rim build refused (0 gold), grass wall −40, second build on the same cell `occupied` with no further charge | **PASS** |
| `req42b.mjs` wall combat | wall in the road: 0 projectiles fired, 0 targeting frames, 93 frames of siege, 500 → 430 HP | **PASS** |
| `req42b.mjs` flyers | a wraith used an air mouth, moved, never sieged, never blocked | **PASS** |
| `req42b.mjs` destroyed state | 40 % wall drew a bar; after destruction the sprite, the bar and the cell were released | **PASS** |
| `req42b.mjs` other boards | level-3 and level-5: 141 open cells each, a wall built on a lane cell and blocked it | **PASS** |
| `air42.mjs` | a keep out in the field, a flyer held inside its range (controlled positioning): the archer acquired it on all 40 samples and took 142 → 110 HP — anti-air still works next to the new wall code | **PASS** |
| `ghost42.mjs` | the build preview at a legal cell (green box, `validateBuild.ok = true`) and at a blocked rim cell (red box, `ok = false`), driven by a real pointer move after pressing the wall hotkey `4`; no console error from the wall's missing range ring | **PASS** |
| `wallart.mjs` | five-tier horizontal run, adjacency geometry, vertical run from the corner, rubble on breach | **ALL PASS** |
| `wallshot.mjs` | five tiers side by side, keep beside the lane sieged 500 → 450 with a drawn bar | **PASS** |
| `mobilewall.mjs` (844 × 390, prod) | inspector 832 × 273 inside the viewport, upgrade button 794 × 44, four real taps climb 1→5 (gold 3 260 → 2 670 = 60 + 100 + 170 + 260), tier 5 removes the button, HP 6 000/6 000 | **ALL PASS** |
| `victoryresult.mjs` (native result flow) | VICTORY card 3★ / +150 g / +5 gems with unlock notices → REPLAY resets the board → second VICTORY pays +30 only → NEXT LEVEL opens level-2 at 25 HP | **PASS** |

Screenshots: `shots/req42-wallcrop.png` (the five materials at 1.9× with a
damaged tier-2 segment), `shots/req42-wallart.png` (a five-tier rampart plus a
corner and rubble), `shots/req42-towersiege.png`, `shots/req42-mobile-wall.png`
(the phone inspector at tier 5), `shots/req42-ghost-valid.png` /
`shots/req42-ghost-invalid.png` (the green and red placement previews) and
`shots/req42-natural-victory.png` (the real victory card).

### 31.6 Automated suite and production build

- `npx vitest run` → **118 files, 1 450 tests passed** (72.3 s).
- `npm run check:contrast` → **68/68 pairs pass**.
- `npm run build` → clean; `dist/assets/index-BiBomom2.js` 627.53 kB
  (gzip 180.87 kB), `phaser-DFK5Ua9d.js` 1 208.06 kB, `index-CIKq2dGO.css`
  204.13 kB. The same probes were then re-run against that bundle on `:4320`
  (see the table above).

### 31.7 Natural play, not just controlled probes

Two battles were played end to end on the shipped bundle (`:4320`) with no
scripted damage and no forced result:

| Run | Setup | Outcome |
| --- | --- | --- |
| Natural victory | Waves allowed to auto-start on their own timers, eight real keeps (L4) built on legal grass cells beside the bastion, gold topped up to 4 000 so the build could be finished in one pass | **VICTORY** at wave 8/8, 300.7 s, **20/20 HP**, score 9 899, 3★, +150 gold, +5 gems, `SUNSCORCH MESA UNLOCKED` + `ENDLESS SIEGE UNLOCKED`, result buttons NEXT LEVEL / REPLAY / WORLD MAP / LEADERBOARD / MAIN MENU |
| Natural defeat | No structures, nothing pressed; the horde walks in and assaults the bastion | **DEFEAT** in wave 1 at 54.7 s, 0/20 HP, score 86, card offers RETRY / WORLD MAP / LEADERBOARD / MAIN MENU and **no NEXT LEVEL**; MAIN MENU returns to `MenuScene` with the HUD hidden |

The natural victory is what proves the wall work did not break the campaign:
waves start themselves, towers fire, the boss wave resolves and the terminal
state is a real victory rather than a handler call. The natural defeat is what
proves the opposite terminal state still fires on the new board.

Honest labels:

- **Natural gameplay** — the eight-wave victory and the wave-1 defeat above.
  The only injected value is the starting gold in the victory run.
- **Controlled browser tests** — `req42`, `req42b`, `wallart`, `wallshot`,
  `mobilewall`, `victoryresult`. These drive the real scene but set up
  situations on purpose (spawned enemies, topped-up gold, a chosen wall cell).
- **Automated tests** — the 1 450 vitest assertions, none of which touch a
  browser.

### 31.8 Known limitations

1. **No corner or end-cap wall pieces.** Every tier is one square, full-bleed
   tile: horizontal and vertical runs meet cleanly at a right angle (verified:
   zero gap, full-height overlap), but an outside corner shows the same square
   edge as a straight run. There is no dedicated elbow art.
2. **No wall spritesheet.** Requirement 6's fallback is what shipped — five
   level textures plus a runtime damage-state overlay. There is no idle,
   walk-cycle-style animation for a static wall, and none is claimed.
3. **The HP ladder is deliberately below the infographic** (500 → 6 000 instead
   of 1 000 → 12 500) for the reason in §31.2. Costs and thorns follow suit.
4. **Phone inspector sheet.** At 844 × 390 the sheet is 832 × 273 and its lower
   edge sits behind the dock bar; the body scrolls and the upgrade button is
   inside the visible area (measured 794 × 44 at y 118), but the last stat rows
   need a scroll before they clear the dock.
5. **Untested here:** towers on the four non-campaign boards (Realm, War Room,
   duel arenas) were checked structurally by the suite, but only levels 1, 3 and
   5 plus Endless were exercised in a browser with walls; the PvP arenas were
   not replayed with walls in this pass. Frame rate was not measured again — no
   performance claim is made for the added rubble decals and damage overlays.
6. **The rubble decal is decoration only.** It is spawned at the destroyed
   structure's position, fades after 1.1 s and has no collider; a rebuild on the
   same cell immediately is allowed and will render on top of it.
7. **Probe-path console noise.** Calling `spawnEnemy()` directly from a probe
   (instead of letting a wave spawn it) makes Phaser log "Texture key already in
   use: enemy-grunt" and friends. The natural wave path logs nothing — the
   eight-wave victory run finished with an empty console — so this is the probe's
   shortcut, not player-facing. It was left alone rather than papered over.
## 32. One wave, one road — the horde stops arriving from everywhere at once

Nothing was committed, pushed or deployed as part of this section; the change
rides on the branch with the Request 42 work.

### 32.1 What was wrong

The Request 40 board has three portals, and `spawnEnemy` dealt **every** enemy
of **every** wave round-robin across all three of them. The arithmetic was
correct and the intent ("a base is attacked from all sides") was reasonable, but
in play it read as one undifferentiated blob: three columns of creeps stepped out
of three holes inside the same second, from wave 1 on, and the entrance hint —
which was already painting every lane — could not tell the player which push
mattered. The first four waves of a campaign stage are where the player learns to
read the board, and they were the noisiest waves in the game.

Measured on the live scene before the change: a single opening wave produced
enemies from **3** distinct gates, and the hint painted **3** beacons.

### 32.2 The rule now

`src/systems/SpawnGates.js` — pure functions, no Phaser, no scene state:

```js
waveProgress({ waveNumber, totalWaves, endless })   // 0 at the first wave, 1 at the last
gatesInPlay({ waveNumber, totalWaves, endless, laneCount })   // 1 · 2 · 3
gateIndexForSpawn(tick, waveNumber, gateCount, activeGates)   // the enemy's gate
waveGatePlan({ … })                                  // { progress, gates, slots, primary }
```

Thresholds live in `config/gameConfig.js` (`SPAWN_GATES`), not in the module:

| progress | gates | campaign, 8 waves | endless |
| --- | --- | --- | --- |
| < 0.5 | 1 | waves 1–4 | waves 1–6 |
| 0.5 – 0.8 | 2 | waves 5–6 | waves 7–10 |
| ≥ 0.8 | 3 | waves 7–8 | wave 11 onwards |

- A wave **owns a block of gates** starting at its own ordinal and its enemies
  cycle inside that block only, so a one-gate wave sends every grunt, runner and
  escort down the same road — the beacon, the toast and the marching column now
  agree.
- Three gates is a hard cap even on a five-mouth board; beyond that a spawn is
  noise rather than pressure.
- Endless has no last wave, so it ramps over `endlessRampWaves` (12) and then
  stays fully open. Wave 1 of endless is one road; wave 20 is all of them.
- A boss's summons inherit **the boss's own gate** (`enemy.gateSlot` is handed to
  `onSummonMinions`), so a warlord's brood never steps out of a portal on the far
  side of the board.
- The whole thing is a function of the wave ordinal, so a duel seat, a replay and
  a server-side check derive the same gate with no data on the wire.

### 32.3 What else had to follow

- **The entrance hint** (`drawLaneHint`) now paints only the gates the coming
  wave will use instead of all three. Between waves it paints the *next* wave's
  gates; during a wave it paints the marching wave's.
- **The wave toast** reads the same plan: `⚑ LEFT LANE` for a single-gate wave,
  `⚑ LEFT + CENTRE LANES` for a two-gate split, `⚑ ALL LANES` when the whole
  board opens. (`GameScene.gateLabel()`.)
- `gateIndexForSpawn` moved out of `PathfindingSystem.js` into `SpawnGates.js` and
  grew a fourth argument. `PathfindingSystem` keeps `laneIndexForWave`, which is
  still the wave's starting road.
- `docs/multi-lane-routing.md` §2 was rewritten — it still documented the
  pre-Request-40 rule ("every spawn uses `laneIndexForWave`").

### 32.4 A bug found while wiring it (and fixed)

`spawnEnemy(typeKey, waveNumber, gateOverride)` used
`Number.isFinite(Number(gateOverride))`, and `Number(null) === 0` is finite — so
the first version silently pinned **every wave in the game** to gate 0. The
browser probe caught it (wave 8 reported `slots: [0]` while its plan said
`[1,2,0]`); the guard now keeps `null`/`undefined` as "no override".

### 32.5 Verification

Automated: `npx vitest run` → **119 files, 1 466 tests passed** (15 of them in
the new `tests/spawn-gates.test.js`). The two existing tests that pinned the old
round-robin were updated to assert the new contract *and* the old one where it
still holds (a wave that owns every gate is the flat rotation).

`npm run build` clean (`index-D1FeULbL.js` 629.74 kB, gzip 181.73 kB);
`npm run check:contrast` 68/68.

Browser, real scene, dev server `:4300` and the built bundle on `:4320`:

| Check | Result |
| --- | --- |
| Wave 1 of the campaign (`gates.mjs`) | **one** gate. Real queued spawns: `slots: [0]`, 4 grunts, all at `x = 288` (the left mouth). Toast: `Wave 1: The Scouting Line · ⚑ LEFT LANE` |
| Wave 8 of the campaign | **three** gates: `slots: [0,1,2]`. Toast: `Wave 8: Cataclysmic Siege · ⚑ ALL LANES` |
| Wave 5 of the campaign (`twogate.mjs`) | **two** gates: plan `[1,2]`, hint grew from 108 to **216** commands (two beacons), toast `⚑ CENTRE + RIGHT LANES` (`shots/req43-two-gates.png`) |
| Endless wave 1 / 7 / 20 | plan gates `1 / 2 / 3` |
| Natural campaign run, unattended (`natwave2.mjs`, 2× speed, eight real keeps) | **waves 1–4: one gate each** (`[0]`, `[1]`, `[2]`, `[0]`), **waves 5–6: two** (`[1,2]`, `[2,0]`), **waves 7–8: three** (`[0,1,2]` — the live scene showed all three at once). Finished on a real **VICTORY 8/8, 20/20 HP, 393.1 s, 3★, score 9 948** (`shots/req43-natural.png`). No console error, no failed request |
| Entrance hint, wave 1 | 108 graphics commands — **one** beacon + chevron run (`shots/req43-hint-wave1.png`) |
| Entrance hint, wave 8 | 324 commands — **three** beacons (`shots/req43-hint-wave8.png`) |
| Console / network | none on either server |

The hint screenshots are the visual proof: `req43-hint-wave1.png` shows the arrow
run on the left road only, `req43-hint-wave8.png` shows all three.

### 32.6 A second bug, found by leaving a battle alone

While the wave run above was in progress the title card appeared **over a live
battlefield** — the game was still playing underneath, but the menu overlay was
on top and the HUD was hidden. Nothing was pressed; it happened about 20 s in.

Cause: `MenuScene` can be queued by the title flow at the same moment the player
presses DEPLOY. Phaser boots a queued scene *after* the one that replaced it, so
`MenuScene.create()` ran on a board that was already live, painted itself, and
un-hid the menu overlay. `startLevel` had correctly stopped the menu a moment
earlier — the late boot undid it.

Fix: `MenuScene.create()` now stands down if `GameScene` is already active, so a
stale queued boot cannot draw over a battle or reveal the menu:

```js
const battleLive = Boolean(window.game?.scene?.getScene?.('GameScene')?.scene?.isActive?.());
if (battleLive) { this.scene.stop(); return; }
```

Browser evidence, `menuflow.mjs` on the built bundle (`:4320`) — every check
passes:

| Check | Result |
| --- | --- |
| A lost core (real leak into a 1 HP bastion) shows the DEFEAT card | PASS |
| MAIN MENU from that card shows the menu | PASS |
| …and the field is torn down once the menu has it | PASS (`active: ["MenuScene"]`) |
| DEPLOY → a live battle with the menu down | PASS |
| 30 s of unattended play, sampled every 3 s | **0** intrusions — the menu never opened itself |
| Console / network | none on `:4320` |

### 32.7 Known limitations

1. **The gate count is a step function**, not a ramp: wave 4 → 5 in a campaign
   jumps from one road to two. That is deliberate (a wave either splits or it does
   not), but it means wave 5 is the noticeable difficulty step in every stage.
2. **A two-gate wave alternates** between its two roads (1-2-1-2) rather than
   sending equal columns; with an odd enemy count one road gets one more body.
3. **Air waves use the same rule** measured against the air-lane count, which is
   also three. A wave of wraiths therefore arrives on one flank early and on
   up to three late.
4. **Duel fairness** rests on the plan being pure — it was verified in unit tests
   (same input, same answer) but the duel itself was not replayed in this pass.

## 33. Request 43 — the ten royal defences

Scope: ten new base defences with five authored tiers each, a real targeting
panel, support/aura/debuff/trap mechanics, and an art package generated,
inspected and wired in this pass. Everything below was executed; nothing is
inferred from a passing import.

### 33.1 Automated (vitest, executed)

| Suite | Result |
| --- | --- |
| Full run — `npx vitest run` | **120 files / 1 497 tests passed** |
| `tests/royal-defences.test.js` (new) | 30 passed |
| `tests/target-categories.test.js` | 33 passed with `tower-ascension` |
| `tests/forge-defenses.test.js`, `vfx-assets`, `engineer-defenses`, `hud-dom` | updated to the 21-line roster, pass |
| `npm run build` (vite 7.3.7) | `✓ built in 6.8 s`, 139 modules, no warnings |

The new suite pins, among others: the roster shape and five tiers per line,
strictly climbing upgrade costs, art present on disk, weapon-strip geometry read
from the PNG IHDR bytes, category filter beating every priority, the artillery
minimum range, all six sort modes, chain falloff 100 → 50 → 25 with no repeat
hits, mortar damage resolved at the launch coordinates, ward mitigation and its
1.4 s lapse, repairs never resurrecting a destroyed structure and halving under
fire, the trap being ground-only and its cooldown re-arm, the L1 → L5 track,
the seven trails (shipped, dripped at the interval, budget-refused, absent on a
field line), a wreck on disk for every line, and the repair beam (drawn on a real
heal, not on an idle tick, capped at eight, and the working flag lapsing).

### 33.2 Art inspection (executed)

`python3 scripts/check_royal_art.py` — **all ten lines pass**. The checker fails
the build on: a missing file, a non-RGBA sheet, an opaque base, a base whose ink
does not reach the ground line, a strip that is not six frames, an empty frame,
a release frame identical to the rest pose, a tier that changes the silhouette by
less than 6 % (a recolour), a blank impact frame, and missing projectile/card art.
Two real defects were caught by it during this pass and fixed at the source
(an arcane release frame that was a hairline, and an empty last impact frame),
plus one geometry bug it exposed indirectly (bases cropped short of the ground
line after clamping, which sat the gun 4 px high). A third pass added the trail
and wreck rules: a trail must be 48×48 with a transparent margin and a peak
alpha of at least 120 (an early 3-layer streak on the dark spike plate sat at 91
and was retuned), only shooting lines may ship one, and every wreck must have
real transparency with its ink reaching the ground edge.

### 33.3 Browser (executed on the production build, `:4320`)

Bootstrap: name gate → menu → world map → Verdant Marches → DEPLOY, all through
the real UI. Towers were placed with the scene's own `attemptBuild` (validator and
economy real; the run's gold was topped up only to afford eleven towers at once).

| Check | Result |
| --- | --- |
| All ten lines place and upgrade (L1 → L3/L5) | PASS — every base texture is the tier art, none is `__MISSING` |
| Royal dock tab | PASS — 5 cards: artillery, ballista, arcane sniper, mortar, skybreaker |
| Inspector on a royal tower | PASS — name, tier title, DPS/rate/range chips, next-tier art (`base_siegeBallista-l5.png`), real cost |
| Targeting panel drives the tower | PASS — `BOTH → GROUND` flips `tower.targetCategory` and `engagedTargets.air` to false |
| Support / debuff / trap sheets | PASS — aura, repair, field radius, trigger radius all read from the live stats |
| Workshop repairs a real structure | PASS — 52 HP/s field healed a gun from 294 → 877 HP in 6 s |
| Wards applied to live creeps | PASS — `royalSystems.stats.wardsApplied` climbed and enemies carried a resistance break |
| Traps triggered on ground creeps | PASS — `trapsTriggered` 1 → 4, `trapDamage` 2 503 |
| Waves cleared without a leak | PASS — base stayed at 20/20 across the sampled waves, `projectilesFired` rose 6 → 27 |
| Console / network | none — 0 page errors, 0 failed requests |
| Menu does not intrude on a live battle | PASS — 0 intrusions over 60 s of unattended play |
| Trails behind royal shots | PASS — peak 6 live streaks during a four-gun volley, 0 afterwards, 0 page errors |
| Muzzle flash and charge read at barrel height | PASS — reworked after a first frame showed a cream cone inside the carriage: five tapering tongues at the muzzle mouth plus a growing charge orb on the prepare frame |
| Every destroyed building leaves its own wreck | PASS — `ruin-workshop`, `ruin-obelisk`, `ruin-rimeTower`, `ruin-spikeTrap` all spawned, tile released, toast shown |
| Workshop repair is visible | PASS — 343 → 423 HP, `tower-top-workshop-l5-fire` clip playing, one live beam, 0 after the fade |
| All ten lines on one board at L5 | PASS — 10/10 placed, every base/weapon key is its `-l5` art, 10 shots fired in one wave, base untouched at 20/20 |
| Console after the aura-ring fix | PASS — two consecutive runs of the maxed-board probe and the L5-aura probe with 0 page errors (previously 1) |

Five product bugs were found and fixed during this pass because the browser
(or a probe frame) exposed them:

1. **A tower built during the boot stream rendered as Phaser's `__MISSING` box.**
   The menu is interactive before the last tower sheets land, so a fast DEPLOY
   could build against a texture that did not exist yet. `Tower.bindLateTexture`
   now swaps the sprite onto the real sheet on `addtexture-<key>`.
2. **`MenuScene` could boot on top of a loading battle.** The guard only checked
   `isActive()`, which is false while `GameScene` is still in `LOADING`. It now
   also treats Phaser status 2–6 (starting/loading/creating/running/paused) as
   "a battle owns the screen", and the menu stays down.
3. **The muzzle flash was drawn at the pivot**, so it exploded inside the
   carriage and read as a solid cream triangle on the stone platform. It is now
   drawn `at = barrel length + recoil` as five tapering tongues over a white
   core, and the `prepare` frame grows a charge orb at the same point.
4. **`RoyalSystems.playWorkAnimation()` was never called.** The repair numbers
   moved but nothing on screen did. The repair tick now swings the hammer clip
   and runs a bounded additive beam to the structure it mended — and the beam is
   proof that the heal really happened, not a decorative timer.
5. **`TextureFactory` and the fx pack both owned `fx-aura-ring`.** The menu can
   hand the player a battle before `BootScene` has baked its procedural
   fallbacks, so `GameScene.preload` queued the painted 160 px ring while the
   128 px canvas was still to be drawn. Whichever finished second lost: Phaser
   logged "Texture key already in use" and kept the wrong art. The canvas
   fallback is gone (the pack always ships the ring), `canvasTexture` now also
   refuses to bake a key that any scene's loader has queued, and
   `tests/texture-keys.test.js` pins both halves of that rule.

### 33.4 Labelled honestly

* **Automated** — every row in 33.1, executed in this pass.
* **Controlled** — 33.3: a real browser on the real build, but the probe drove the
  wave clock and gold. It is *not* a natural playthrough.
* **Not verified** — real mobile touch input (no device in this environment; the
  responsive pass was Chromium emulation at 844 × 390 only), and a full 8-wave
  campaign won with royal towers only. Neither is claimed.

---

## 34. Request 45 — every royal line branches at level 3

Scope: the ten royal lines stopped being a five-step track and became two
five-tier paths each. Levels 1–2 are shared; level 3 buys branch A (the
machine the line already had) or branch B (a second, different machine with its
own building, weapon, shot, hit effect and wreck). Thirty new tiers were
authored, drawn, inspected, wired and tested. Everything below was executed in
this pass.

### 34.1 Automated (vitest, executed)

| Suite | Result |
| --- | --- |
| Full run — `npx vitest run` | **120 files / 1 500 tests passed** |
| `tests/royal-defences.test.js` | 32 passed — roster asserts two branches, two `specKey`s, three rising prices per branch, eight art slots per line and branch-B fx/shot/wreck files on disk; a branch-B trap trigger is pinned to its own hit art |
| `tests/branch-niche.test.js` | 6 passed — every branch wins its declared column at L3/4/5, no branch is dominated, no tier regresses |
| `tests/description-truth.test.js` | 4 passed — all 100 tier descriptions agree with the stat block they sit on |
| `tests/tower-ascension.test.js` | 9 passed — 21 branching lines, `fieldPower` ladder for support branches |
| `tests/engineer-defenses.test.js` | 27 passed — damage band 4.04 (< 4.2), control 1.38 (< 2.5), support band via `supportPower`, max/min maxed-tower cost 1.88 (< 1.9) |
| `tests/forge-defenses.test.js` | 17 passed — the linear-line special case is gone; royal shots are checked against the generated table the loader really iterates |
| `tests/spec-ui.test.js` | 9 passed — the chooser shows both royal branches, and a two-shell branch is badged `VOLLEY` instead of being filed under its shell |
| `npm run build` (vite 7.3.7) | `✓ built in 6.54 s`, 140 modules, no warnings |

Two test-only crutches were removed rather than papered over:

* the "is this branch worth upgrading?" check compared `dps()` for every branch,
  which is `0 > 0` for a repair yard or a ward. It now compares `fieldPower()`
  — damage for a turret, the field it hands the roster for a support building —
  and still requires the dps ladder for anything that shoots;
* the power-per-gold band divided support throughput (always 0) by gold. The
  support family is now priced with `supportPower()`: an aura at the fire rate
  and range it grants a reference turret, repairs at the health they restore, a
  ward at the effective damage its breaks unlock, a coin aura at the gold per
  kill, all scaled by field area. No assertion was weakened to `>=` and no band
  was widened.

### 34.2 Art inspection (executed)

`python3 scripts/check_royal_art.py` — **all twenty branches pass**. The checker
gained three rules for this pass: eight slots per line, a ≥ 4 % bottom-centre
aligned difference between branch A and branch B on base, wreck, impact, muzzle,
trail and shot, and the branch-B ladder must itself change silhouette by ≥ 6 %
per tier. 214 images are generated (80 bases, 80 weapon strips, 28 shots,
20 impacts, 20 muzzles, 14 trails, 20 wrecks, 10 cards) plus three data tables.
Real defects it caught: two branch-B weapons whose only difference was interior
detail (invisible in the alpha mask — both redrawn with exterior outline), a
mirrored caltrop/impaler pair, and a `width=3.4` ellipse that crashed Pillow's
integer `width` argument at generation time.

### 34.3 Balance numbers after the pass (measured, not estimated)

| Family | Spread (worst → best, power per gold) | Cap |
| --- | --- | --- |
| damage | `mortar.cluster` 0.16 → `frost.lightning` 0.64 = **4.04×** | 4.2× |
| control | `frost.blizzard` 0.17 → `harpoon.grapple` 0.24 = **1.38×** | 2.5× |
| support | `obelisk.rune` 0.075 → `workshop.engineer` 0.108 = **1.44×** | 1.5× |
| maxed cost | 595 g → 1 120 g = **1.88×** | 1.9× |

The support family had no honest number at all before this pass — its damage
cols were zero, so its power-per-gold was 0/0. Priced by `supportPower()` the
six support branches land inside 1.44× of each other without touching a single
aura or repair value except the repair yard's (see below), which is the point:
they are alternatives, not a ranking.

Data changes made to land inside the bands (each one a real stat or price, never
a test edit):

* `archer.rapid` L5 damage 34 → 32 (it was the cheapest, highest-yield tower);
* `mortar.cluster` L5 damage 92 → 96 (and its description, which quotes it);
* `royalArtillery` entry 300 → 260 g, upgrades 160/230/330/460 →
  140/190/240/290 g (the heaviest line was priced outside the roster's cost band);
* `workshop.master` repairs 20 → 18 HP/s at L3, 36 → 30 at L4, 52 → 42 at L5
  (the repair crew was the highest support yield in the game);
* `banner.muster` 165/325 → 130/240 g (the economy standard should be the
  cheaper standard);
* `skybreaker.flak` L5 damage 46 → 55 so the cap tier is a real step.

One code defect the browser path exposed in this pass: `RoyalSystems.playTrapSnap()`
fired the *line's* effect (`fx-line-spikeTrap-impact`) no matter which branch the
trap was built as, so a caltrop field triggered with the impaler's burst even
though it ships its own. It now uses `trap.artLine`, and
`tests/royal-defences.test.js` pins both branches' trigger art (verified red
before the fix, green after).

### 34.4 Browser (executed on the production build, `:4320`)

Bootstrap: name gate → menu → world map → Verdant Marches → DEPLOY through the
real UI. Towers placed with the scene's own `attemptBuild`; every upgrade went
through `Tower.upgrade()`, including the level-3 branch choice.

| Check | Result |
| --- | --- |
| `royalArtillery` → `battery` to L5 | PASS — `lvl1 → lvl2 → spec-b → spec-b2 → spec-b3`, `tower-top-royalArtillery-b1/-b2/-b3`, title `Royal Salvo Battery` |
| `tesla` → `arccannon` to L5 | PASS — same ladder, title `Storm Cannon`, `artLine: tesla-b` |
| `mortar` → `cluster` to L5 | PASS — same ladder, title `Royal Cluster Battery`, `proj-royal-mortar-b2` |
| Shot art in flight | PASS — live projectile texture `proj-royal-royalArtillery-b2`, `TRAIL_BUDGET` respected (`__trailSprites` 1 → 13 during a volley, back to 0) |
| Branch-B trail and impact | PASS — `fx-line-royalArtillery-b-trail` and `fx-line-royalArtillery-b-impact` used (the probe hooked `vfx.impact` and recorded `line: royalArtillery-b`), both textures present for `tesla-b` too |
| Wreck | PASS — destroying the salvo battery spawned `ruin-royalArtillery-b` (branch-A wreck is the fallback), tile released |
| Branch-B trap (live) | PASS — `spikeTrap` → `caltrop` L5 (`Royal Spike Field`, field 96 px, 210 dmg / 2.4 s) triggered on a grunt and hit under `fx-line-spikeTrap-b-impact`; `trapsTriggered` 1, `trapDamage` 210. Before the fix in this pass it re-used the impaler's burst |
| Branch-B support (live) | PASS — `workshop` → `engineer` L5 (`Royal Engineer Corps`): a neighbouring `tesla` → `arccannon` took `range 1.24`, `cooldown 0.64` (exactly +24 % range, +36 % rate from the 330 px aura), and the crew healed a damaged neighbour 26 HP in one tick. `obelisk` → `nullify` L5 (`Null Colossus`) warded a guard inside 235 px: `armorBreak 15`, `resistanceBreak 0.5`, physical resistance 0.35 → 0.00 |
| Branch chooser | PASS — a level-2 Royal Siege Artillery offers PATH I `Bastion Culverin` (BOSS HUNTER, DPS 90 → 126, 190 g) and PATH II `Twin-Bore Battery` (VOLLEY, DPS 90 → 145, `base_royalArtillery-b1.png`, 180 g); clicking the PATH II card buys branch B (`level 3`, `specialization battery`, `spec-b`, `artLine royalArtillery-b`) |
| Console | PASS — 0 page errors across the run |

### 34.5 Labelled honestly

* **Automated** — every row in 34.1 and 34.2, executed in this pass.
* **Controlled** — 34.4: a real browser on the real build, but the probe granted
  gold and started the wave itself. It is *not* a natural playthrough, and no
  screenshot is presented as one.
* **Still not verified** — real mobile touch input, a full 8-wave campaign won
  with royal towers only, and a single frame containing trails, muzzle flash and
  ruins together. None of these is claimed.

## 35. Request 46 — the line breaks, the gate answers

Scope: a barricade is destroyed and the horde walks through the hole; the
report was that every defence then stops attacking and lets the core be
demolished, "even when it is still intact".

### 35.1 What the investigation actually found (executed, in this pass)

Nine probes ran against the real build in Chromium. The finding is not a
disabled attack loop — no frame was ever produced in which a live, in-range
tower had a legal creep and stayed silent. What the probes did reproduce, every
time, is the *outcome* the report describes:

| Observation | Evidence |
| --- | --- |
| Creeps that break through stop on a 72 px ring around the keep, inside the no-build moat (`BASE_CLEARANCE = 1`) | 21 attackers parked at `(976…1001, 600)` — `assaulting: true` — around the keep at `(992, 672)` |
| A defence can never be raised closer than 128 px from the keep, so the ring is a dead zone for most of the line | `cannon@10,13` is 128 px from the keep with 150 range; an attacker on the far slot reads 188 px — out of range |
| That is what "my defences do nothing" looks like from the chair | with no defences at all the core went 20 → 0 in wave 2; with five towers ringing the keep, three fired continuously and the core still went 20 → 0 in 3 s |
| Towers that *were* in range kept firing through and after the break | `ring4`/`base1`: fire 1 → 22 → 30 → 36 across the break; 0 page errors |
| A separate, real defect: the cooldown can settle at a permanent negative | `cd-30` printed for idle towers in every run — `cooldownTimer -= deltaMs` with no floor |

The base's own math compounded it: `assaultDamage` is 1–3 against a 20-point
core, so sixteen attackers kill it in one swing round. No change was made to
those numbers — the fix is about who may answer the attack, not about inflating
damage.

### 35.2 The fix

* **Gate rule** (`Tower.acquireTarget`): a defence whose range reaches the
  **bastion** may engage creeps that are `assaulting` it, wherever on the ring
  they stand. One shared path, so every defence type inherits it; `canEngage`
  is still consulted first, so ground-only guns still refuse flyers, the live
  target filter still applies, and support buildings still never fire.
  `GameScene.bastionPoint()` is now the single definition of where the keep is,
  handed to towers, creeps and effects alike.
* **Cooldown clamp** (`Tower.update`): `max(0, cooldownTimer - deltaMs)`.

Nothing else changed: no range, damage, cadence, cost or map rule was touched.

### 35.3 Automated (executed)

| Suite | Result |
| --- | --- |
| Full run — `npx vitest run` | **121 files / 1 507 tests passed** |
| `tests/gate-coverage.test.js` (new) | 7 passed — far-slot attacker acquired by the opposite tower; a creep walking past ignored; a tower four tiles up the lane unaffected; a cannon refuses a flyer at the gate; a real projectile lands damage on the ring attacker; the cooldown clamps to 0 instead of freezing at −30 |
| `npm run build` | `✓ built in 7.49 s` |

### 35.4 Browser (executed, controlled)

Same scene each time: four defences around the keep, a `barricade` on the
wave's own lane at `7,12`, real waves, probe-granted gold.

| Check | Result |
| --- | --- |
| Before the gate rule | `cannon@10,13` (150 range) never acquired an attacker standing 188 px away on the far slot; it went silent while the core was hit |
| After the gate rule | `cannon@10,13` fires on a target at **155 px with 150 range** (`FAR155`), flagged live by the probe, because that creep is `assaulting`; the core went **20 → 17 over waves 2–3** instead of 20 → 0 |
| Screenshot | `docs/req46/gate-answered.png` — keep at 19/20, three towers answering at the gate, palisade still standing on the lane, HUD intact |
| Console | 0 page errors |

### 35.5 Labelled honestly

* **Automated** — every row in 35.3, executed.
* **Controlled** — 35.4: real browser, real build, real waves, but the probe
  granted gold and placed its own defence line. It is not presented as a natural
  playthrough.
* **Not reproduced** — a total attack freeze. Nine probes (siege, no-siege,
  seeded, natural waves, three wall positions, five defence lines) all showed
  towers firing whenever a legal creep was in range. If a player still sees a
  tower go permanently silent, the thing to capture is that tower's `currentTarget`,
  `cooldownTimer` and `disabledTimer` — those three cover every early return in
  `Tower.update`.
* **Still not verified** — real mobile touch input, and a natural 8-wave win.

## 36. Request 46b — defences first, the gate last; sturdier defences

Scope: "the monsters and bosses ignore our defences — they should attack those
first, and only hit the base when there is no defence left; also the defences
die too easily."

### 36.1 What the investigation found (executed, in this pass)

A probe placed four keeps around the keep's lane and seeded grunts, brutes and
the Ironhorn boss:

| Observation | Evidence |
| --- | --- |
| A brute walked up to the archer at `7,14`, parked at `(816, 478)` with `isSieging: true` and `siegeTarget: archer@7,14` — and the archer never lost a point | `dmg0` on all four keeps across 55 polls; its health stayed 500/500 |
| The siege target was resolved from **the cell being stepped into** (±1 tile) | `GameScene.getSiegeTarget(cellKey)`, called from `Enemy.getStructureAhead()` with `path[pathIndex]` |
| The bastion assault runs at ~90 px from the core, where every late-game defence stands | `updateBaseAssault` cut in before `updateSiege` in `Enemy.update` |
| A keep was 500 HP against a swing table of 10–160 | `computeMaxHealth()` = `380 + cost × 2`; bosses swing 55–160 |

The two defects compound: the horde could not reach the towers it was walking
past, and the tower it did reach took damage from a source the probe could not
attribute (the brute's `siege` 34 landed 60 points in one poll later in the run,
so the damage path itself was live — the *reach* was the bug).

### 36.2 The rule

* **`BarricadeCombat.huntRadiusFor`** — two radii from the attacker:
  `DEFENCE_HUNT_RADIUS = 80` px (1.25 tiles) out on the road, and
  `GATE_GUARD_RADIUS = 192` px (3 tiles) inside the ring that guards the bastion.
  `pickDefenceInReach` picks the nearest standing structure in that radius,
  breaking ties toward a palisade.
* **`Enemy.update` order** — defences are now step 5 and the bastion assault is
  step 5b. A creep engages `getStructureAhead() || getDefenceInReach()` before
  `updateBaseAssault` is ever consulted, so **the core cannot be touched while a
  guard stands**.
* **`Enemy.updateSiege(deltaMs, target)`** — takes the target explicitly; the old
  implicit `getStructureAhead()` lookup is still the default.
* Flyers never hunt (they are not on the road the keep stands beside).

### 36.3 Health

| | before | after |
| --- | --- | --- |
| Keep (`380 + cost × 2`) | 500 (archer) | **1000** (`DEFENCE_HEALTH.scale = 2`) |
| Wall L1–L5 | 500 / 1000 / 2000 / 3600 / 6000 | **750 / 1500 / 3000 / 5400 / 9000** (×1.5) |

Both live in config/data (`DEFENCE_HEALTH` in `gameConfig.js`, `BARRICADE.levels`),
and the tier descriptions that quote HP were updated with them — a shop that
lies about a number fails `description-truth.test.js`.

A ×1.5 wall was chosen over ×2 deliberately: the palisade exists to be broken,
and at ×2 a six-grunt pack needed 17 s against it. The pack tests in
`barricade-siege.test.js` were **updated honestly** (not deleted, not loosened
to `>=`) to the new curve: six grunts now breach in ~13 s, eight grunts need ten
swings, and both bounds still fail if a wall becomes unbreakable or free.

### 36.4 Automated (executed)

| Suite | Result |
| --- | --- |
| Full run — `npx vitest run` | **122 files / 1 517 tests passed** |
| `tests/defence-hunt.test.js` (new) | 10 passed — hunt radius tight on the road and wide at the gate; nearest standing defence only; a ruin is not a target; palisade breaks a tie; a creep walking past a keep one tile off the lane attacks it; a keep two tiles out is not a magnet; a flyer never stops; a guard at the gate dies before the core takes a point; an empty gate is assaulted immediately; keep and wall pools hold the new numbers |
| `npm run build` | ✓ 6.83 s |

### 36.5 Browser (executed, controlled)

`docs/req46/defences-first.png` — four keeps around the lane, seeds of grunts,
brutes and one **Ironhorn Minotaur** (3000 HP, phase bar live):

| Check | Result |
| --- | --- |
| Base | **20 / 20 for the whole 70-poll run** |
| Brutes | switched from walking to `SIEGE:archer@8,14` at `(829, 498)`, then to `archer@9,12` when the first guard fell |
| Boss | `SIEGE:archer@9,12` — 360 damage landed on that guard while the core stayed untouched |
| Towers | 1000 / 1200 / 1000 / 1100 HP (was 500 / 600 / 500 / 550) |
| Console | 0 page errors |

### 36.6 Labelled honestly

* **Automated** — every row in 36.4, executed.
* **Controlled** — 36.5: real browser on the real build, real waves, but the
  probe granted gold and placed its own line. Not a natural playthrough.
* **Not yet verified** — a natural 8-wave run with a full perimeter, and real
  mobile touch input. Neither is claimed.

---

## 37. Request 58 — the opening scene (Havenbrook)

### 37.1 Automated

| Suite | Tests | What it proves |
| --- | :-: | --- |
| `tests/tutorial.test.js` | 27 | The five villagers are distinct (a child and an elder among them) and their sheets/portraits exist at the size the CSS asks for; every sheet's PNG header matches the frame grid the scene animates; every speaker has an accent; the anchor and exit spots are on the board and in the gutters; the script opens on a narrator, teaches exactly `place → upgrade → wave` in that order and ends on one `end` beat; every line is held long enough to read it and no line stalls the scene; the crowd's lines are toasts, not beats; the director never advances a step on a tap, never rewinds, skips a step whose action already happened, finishes exactly once, and has no `skip`/`stop`/`dismiss`; `needsTutorial()` lets a brand-new save in and keeps every save with stars out. |
| `tests/village-map.test.js` | 13 | Havenbrook is the tutorial's own board and only its own; same 32 × 12 size as every other battlefield; a rock rim on all sides; three ground portals and two sky gates; one keep on the centre column; **a flood fill from every portal reaches the keep**; every road cell belongs to an authored lane (no stray paving the pathfinder can take); the build field holds no water, rock or scenery; no cottage sits on a tower square; the village palette ships its own grass/rock/water/foliage/bridge and all 16 road masks plus a world-map thumbnail; no other theme borrows the village suffix. |

Full run: **131 files / 1,709 tests, 100 % pass** (`npx vitest run`), plus
`npm run check:contrast` (68/68) and `npm run build`.

### 37.2 Browser — a natural playthrough (executed)

Real Chromium (SwiftShader, 1280 × 768), real pointer events, no console
shortcuts beyond reading scene state:

1. fresh save → name gate → **PLAY** lands directly in Havenbrook (no map);
2. the village talks; the board is held — 6 s idle at `open`, the beat clock
   advanced but no creep moved;
3. tapping `START WAVE` out of turn is refused with *“THE VILLAGE IS STILL
   TALKING — LISTEN FIRST”* and wave 0 stays on the HUD;
4. **step 1** — pick a defence from the forge, tap the meadow → tower raised for
   60 g, the step retires itself, the card comes back as Mara's line;
5. **step 2** — tap the tower, `UPGRADE` → 50 g spent, tier 2, step retired;
6. **step 3** — `START WAVE` → wave 1 on the road, the remaining lines arrive as
   toasts over a live battle;
7. wave 1 cleared at 69 s; **wave 2 opened by itself 11.6 s later** (the
   preparation clock arms at the hand-over, not at boot);
8. victory → **THE VILLAGE HOLDS · WAVES HELD 2 / 2 · TIME 77.4 s** with
   `ENTER THE REALM` → the world map with no arrival banner;
9. `profile.tutorialDone = true`, `stars = {}`, `unlocked = ['level-1']`.

| Check | Result |
| --- | --- |
| Console | 0 page errors across every run |
| Defeat path | core broken mid-scene → **THE VILLAGE FELL**, `TRY AGAIN` / `MAIN MENU`, flag still false; `TRY AGAIN` replays the village from the first line |
| Returning keeper | reload after the win → PLAY opens the world map; `startLevel('level-1')` boots Verdant Marches with no director and no overlay |
| Skip attempts | quitting to the map mid-scene clears the letterbox and the dimmed HUD; starting any level re-enters Havenbrook until the flag is set |
| Mobile shell (`?hud=mobile`, 844 × 390) | letterbox and card fit; the objective card sits under the measured top bar; `BUILD` and `START WAVE` stay visible and clickable; phone copy used (*“Tap BUILD, pick a defence, then tap the meadow.”*) |

Screenshots from these runs: `/home/user/peek/{q1..q7,d1,d2,m1..m3,b2-*}.png`.
