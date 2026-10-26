# Testing & Quality Verification Report

## 1. Executive Testing Summary

- **Total Automated Unit Tests:** 1250 tests across 105 test suites.
- **Pass Rate:** **100% (1250 / 1250 Passed)**
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
