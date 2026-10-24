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
Five battlefields are defined in `src/data/mapData.js`, each a $20 \times 12$ matrix of tiles (64×64 pixels each, total resolution $1280 \times 768$ px).
- Road tiles (`#`), Spawn portal (`S`), and Base monolith (`B`) are flagged as **walkable**.
- Grass (`.`) is buildable by towers.
- Rock (`x`) and Water (`~`) are impassable barriers.

### Graph Construction
On initialization, `buildGridGraph()` scans the map grid and constructs an **undirected unweighted graph**:
- Each walkable tile $(r, c)$ is stored as a node identified by `"row,col"`.
- Orthogonally adjacent walkable neighbors (top, bottom, left, right) are connected via undirected edges.
- Total nodes: $V \approx 90$ walkable cells. Average degree: $d \le 4$.

### Barricade Placement on the Marched Route
The map contains **three distinct routes** from Spawn `(5,0)` to Base `(5,19)`:
1. **Middle Route:** 24 cells (23 steps) — Natural shortest path.
2. **North Route:** 28 cells (27 steps).
3. **South Route:** 30 cells (29 steps).

BFS picks the middle route, so that is the lane the horde walks every time. The
graph is **never modified** by a palisade: a wall is a physical, damageable
object standing on a road cell, resolved by `Enemy.updateSiege()` (see
`docs/pseudocode.md` §4). Two rules keep the placement honest:

1. **On the road.** `PlacementSystem.validate()` requires `TILE.ROAD` and
   rejects the portal/base cells (`needs-road` / `endpoint`).
2. **On the marched route.** `GameScene` builds `routeCells = Set(mainPath)`
   right after `computeMainPath()` and hands it to the validator. A road cell
   that the horde never enters is rejected with *"No enemies march through this
   tile"* (`off-route`) instead of silently eating the 30 gold.

Because every legal palisade sits on the one route the queue follows, an enemy
is guaranteed to reach it and start swinging — the wall can never be walked
around. When the last hit lands, `damageBarricade()` collapses it and the road
reopens.

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

## 5. Campaign, Level Data & Progression

`src/data/levelData.js` is the single source of truth for the campaign; the
scene never hard-codes "six waves" any more. Each level owns its battlefield,
theme, economy seed, core HP, enemy health scale, wave list, star thresholds,
boss and first-clear bounty.

| Level | Theme / map | Waves | Start gold | Core HP | Enemy HP scale | Boss |
|---|---|:-:|:-:|:-:|:-:|---|
| `level-1` Verdant Marches | grassland | 6 | 220 | 25 | 1.00× | Abyssal Warlord |
| `level-2` Sunscorch Mesa | desert | 7 | 240 | 25 | 1.15× | Dune Tyrant |
| `level-3` Frostbite Hollow | ice | 8 | 260 | 25 | 1.30× | Frost Warden |
| `level-4` Prism Depths | crystal | 9 | 280 | 25 | 1.45× | Prism Warden |
| `endless` Endless Siege | volcanic | ∞ | 260 | 25 | 1.20× | rotating every 5th wave |

### Stars, rewards and unlocks (`src/systems/Progression.js`)
- **Star rating** — core HP kept: $\ge 85\%$ → 3★, $\ge 50\%$ → 2★, else 1★.
  Thresholds live on the level (`stars.two` / `stars.three`) so a future level
  can be stricter without touching the UI.
- **Rewards** — the first clear pays the level bounty and one extra gem for a
  3★; replays pay a 20% gold stipend and no gems.
- **Unlock graph** — a first clear unlocks `getNextLevel(id)`; the first win on
  `level-1` also opens `endless`. `ProgressStore` merges an older save over a
  fresh profile, keeps the best stars/score, and falls back to an in-memory
  store when `localStorage` throws (private mode, quota).
- **Endless** — `WaveManager` accepts `{ endless, waveFactory }`; wave *n* is
  generated on demand (5-wave cycle, boss on every 5th) and cached in
  `generated[]` instead of mutating the level definition. `totalWaves` reports
  `Infinity` and `isFinal` is never set, so the run can only end on a defeat.

### Victory / defeat flow
`GameScene.handleVictory()` → `ProgressStore.recordVictory()` → `ResultScreenUI`
(stars, rewards, one unlock line per door that opened, Next / Replay /
Leaderboard / Main Menu). `handleGameOver()` records the defeat (endless keeps
the depth reached, a campaign level keeps its saved best untouched) and shows
the same screen without stars. `window.gameFlow` in `src/main.js` owns the
transitions, so Next and Replay restart the battle with a new `levelId` rather
than stacking scenes.

`recordVictory()` reports `unlocked` (first door, kept for compatibility) and
`unlockedAll` (every door) because a single level-1 clear opens level 2 *and*
Endless Siege. `GameScene.init()` re-reads `levelId` from the resolved level, so
an unknown id can never be carried into a restart.

### Pause, codex and leaving a battle
`HUD.setPausedUI()` is the single owner of the paused state: it toggles the
pause card (`#pause-overlay`) and the passive chip used by gate pauses, and it
disarms the quit caution. The card holds RESUME, CODEX and LEAVE BATTLE —
the two controls that used to clutter the top bar. LEAVE BATTLE requires a
second tap within 4 s ("Leaving now discards this battle"); the confirmed call
goes to `window.gameFlow.quitToMap()`, which stops `GameScene` and reopens the
world map. Stars and rewards only come from a finished level, so an abandoned
run banks nothing.

### Screen layers
Campaign screens mount into `#screen-container` (z-index 250) and dialogs —
leaderboard, codex — into `#modal-container` (z-index 300). Both containers are
`pointer-events: none` so the battlefield keeps its drags, and each screen
re-enables pointer events on itself. Sharing one container used to let the
leaderboard's `innerHTML` write wipe the result screen it was opened from.

---

## 6. Game Balance & Economic Constants

Starting economy: **220 gold**, **25 base HP**, **70% sell refund** on `level-1`;
levels 2 and 3 start at 240 / 260 gold (see the campaign table above).
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
| **Abyssal Warlord** | 3300 | 32 px/s | 70 | 🪙 200 | 600 pts | `level-1` final boss, 3 phases |
| **Dune Tyrant** (`sandwyrm`) | 2600 | 46 px/s | 60 | 🪙 180 | 500 pts | `level-2` boss: Sandstorm Aura (+35% speed, 190 px) every 7 s; Razor Winds below 45% HP |
| **Frost Warden** (`frostwarden`) | 3600 | 28 px/s | 75 | 🪙 220 | 600 pts | `level-3` boss: freezes towers in 170 px, shields itself below 55%, immune to slow below 22% |
| **Magma Regent** (`magmalord`) | 4200 | 30 px/s | 85 | 🪙 260 | 700 pts | Endless boss: summons swarms, hastes the horde, then burns immune to slow |

Boss abilities are dispatched from one shared `abilityTimer` in
`Enemy.update()` (`summon` / `speedAura` / `disableTowers`); `GameScene`
answers them with `handleBossSpeedAura()` (haste pulse + toast + shake) and
`handleBossDisableTowers()` (freeze pulse, tower tint, refreshed auras).

Wave Health Scaling: $\text{HP}(w) = \text{BaseHP} \times \min(2, 1 + 0.09 \times (w - 1))$.

---

## 7. Battlefield & Horde Art Pipeline

The battlefield and the horde are generated, not hand-painted per map, so adding
a fifth biome is a palette entry rather than a second art pack.

### 7.1 Procedural terrain (`scripts/terrain.py`)
`build_ground`, `build_road`, `build_water`, `build_rock`, `build_decor` and
`build_foliage` each paint a 64×64 RGBA tile (32×32 for the scatter props) from
the theme's ramp. `build_spire_assets.py` only writes the files and the manifest.
Two properties matter for correctness:

- **Determinism.** Every random draw comes from `random.Random(seed_for(...))`
  with a `zlib.crc32` seed — Python's `hash()` is randomised per process, which
  would churn every PNG (and the git diff) on each build.
- **Compositing, not painting.** `road_*` and `water_*` leave every pixel outside
  their fringe fully transparent. `GameScene.renderBattlefieldMap()` paints
  ground, then lane/water, then decor/rocks, so a lane edge can never disagree
  with the biome ground beside it. The earlier version painted ground colour into
  the fringe, which forced a per-neighbour recomputation and produced bluish seams
  on the ice map; `_fringe()` also wrapped its out-of-bounds probes (`x % size`),
  which painted a false rim on every seam between two connected tiles. Both are
  fixed at the source.

Each biome also owns one landmark prop (`build_foliage`): Spire oak, saguaro,
snow-laden fir, charred deadwood, crystal prism cluster. A recoloured tree was tried first and read as
"the same tree, tinted", which is exactly what the map pass was meant to remove.

### 7.2 Surface readability audit
`surface_contrast(theme, 'road' | 'water')` returns a YCbCr distance between a
surface and its biome ground, weighted 55/30/10/5 % across the ramp because the
bright foam stop only covers a rim. `python3 scripts/terrain.py --contrast`
prints the table; `tests/terrain-contrast.test.js` enforces a floor of 26 and
fails if two biomes share a lane or water value. Current values (road / water):
grassland 58.0 / 41.7, desert 43.9 / 77.9, ice 37.9 / 61.9, volcanic 36.2 / 73.8,
crystal 61.0 / 34.7.

### 7.3 Horde skins (`src/systems/EnemySkins.js`)
Three pure lookups, all exported for the tests:

| Axis | Function | Effect |
|---|---|---|
| battlefield | `textureFor(type, theme, tier)` | `ENEMY_SKINS` maps each creep to a baked sheet per biome |
| escalation | `tierForWave(wave)` | waves 1–2 base, 3–4 elite, 5+ champion, then capped |
| colour | `paletteForWave(wave)` | rows 0–2 / 3–5 / 6–8 of the strip, in two-wave blocks |

The generator bakes **45 creep sheets** (8 creeps × 5 battlefields × 3 tiers).
Tier 1 adds saturation and a gold contour; tier 2 lays an ember ramp under the
biome hue and grows an ember contour one pixel outwards, so the champion's
*silhouette* is bigger, not just warmer. `Enemy` multiplies its base scale by
`ENEMY_TIERS[tier].scale`, adds an additive brood glow ellipse from tier 1 up, and
stakes a ground ring under champions so a wave tier reads even at a glance.
Bosses are excluded on purpose and keep their single duotone sheet.

### 7.4 Adding a look
1. Add or edit a ramp in `terrain.py` (`RAMPS` / `ROAD_RAMPS` / `WATER_RAMPS`).
2. Add a landmark in `build_foliage` if the biome needs one.
3. Add the ASCII layout to `mapData.js`, then point a level at it.
4. `python3 scripts/build_spire_assets.py && npx vitest run`.

The manifest (`src/data/spireManifest.js`) is generated; never edit it by hand.

---

## 8. Addictiveness Systems

Three layers, built in that order: **dopamine** (moment-to-moment), **retention**
(reasons to come back) and **economy** (something to spend it on). This section
covers the first layer; the later layers extend it without changing its rules.

### 8.1 Kill chains (`src/systems/ComboMeter.js`)

A pure state machine — it never owns a timer, the caller passes `nowMs` — so the
windowing rules are testable without a scene.

| Kill chain | Tier | Payout multiplier |
|---|:---:|:---:|
| 0–2 | 0 | 1× |
| 3–5 | 1 | 1.25× |
| 6–9 | 2 | 1.5× |
| 10+ | 3 | 2× |

Kills must land within **2.6 s** of the previous one. The bonus is *additive*:
`comboBonus(base, mult)` returns only the extra gold/score, rounded, so a kill
can never pay less than its listed bounty. A leak (an enemy reaching the core)
or the end of a wave resets the live chain; `resetCombo` keeps the wave's best
chain so the end-of-wave payout still pays out. A cleared wave pays
`min(90, (best − 2) × 4)` gold for the best chain, and a chain that long also
raises the HUD chip to its ember tier.

Because chains reward *tempo*, the chain also fights the player's instinct to
hoard: you must keep killing, which means standing waves down rather than
letting them trickle in.

### 8.2 Early wave call (`src/systems/WaveManager.js`)

The wave button has two states. In the prep phase it reads **START WAVE**. While
the last stragglers of a wave are still walking (`clearing`, zero pending spawns,
`aliveEnemies > 0`) it becomes **CALL EARLY · +Ng** and starts the next wave *on
top of the leftovers* for `min(70, 6 + 3 × alive)` gold.

The guard rails matter more than the payout:

- **Only in `clearing`.** The spawn queue is per-wave; calling early mid-spawn
  would silently drop the pending spawns of the wave being replaced. `#beginWave`
  clears the queue on purpose, so the state check is the safety, not a courtesy.
- **Never on the final wave** of a fixed campaign (there is no next wave), but
  always available in Endless.
- **The settled wave still counts.** `callEarly()` increments `wavesCompleted`
  and pays that wave's clear bounty immediately; the leftovers keep the new wave
  alive, which is exactly the risk being bought.
- The chain payout for the settled wave is paid at the call site, because that
  wave will never emit `waveComplete`.

### 8.3 Feedback (the juice pass)

| Moment | Feedback |
|---|---|
| Kill | tint flash (`Enemy.applyDamage`), biome/brood-tinted spark burst + additive flash ring, bigger with chain tier |
| 3 / 6 / 10 kills | `audio.playCombo(tier)` triangle stinger, pitch climbing `523.25 × 1.2^(tier−1)` |
| Early call | `audio.playCallEarly()` square sweep 392 → 587 Hz, toast with the payout, camera-warm pulse on the button |
| Boss spawn | letterbox bars close in and out, camera kick + warm flash |
| Wave clear | payout toast that names the best chain when it paid |

All effects are fire-and-forget and wrapped in `try/catch` through
`reportRuntimeError`, so a missing texture or tween can never freeze the
simulation loop.

### 8.4 HUD additions

- **Wave preview**: a scout strip under the wave button during the prep phase
  listing the next wave's composition and flagging a boss. It is absolutely
  positioned so the top bar never reflows, and it sits below the toast lane.
- **Combo chip**: multiplier, chain length, last bonus and a draining timer bar.
  It takes priority over the preview strip — mid-fight the chain is the number
  the player is chasing.
- The wave button itself carries the early-call bonus, so the decision is priced
  on the control that makes it.

---

## 9. Retention Layer

The second layer answers "why come back tomorrow?" — a date-seeded daily run,
a checklist that pays gems, and depth markers for the mode that has no ending.

### 9.1 Daily Challenge (`src/systems/DailyChallenge.js`)

One run per local calendar day, identical for every player:

- `dayKey(date)` → `YYYY-MM-DD` (local, so the reset happens at the player's
  midnight, not UTC's).
- `seedForDay(key)` → FNV-1a hash; `mulberry32(seed)` is the PRNG. The same day
  therefore produces the same modifier and the same level, and a refresh cannot
  reroll the challenge.
- `dailyRun({ date, unlockedIds })` picks one of six modifiers and one level the
  player has actually unlocked (Endless is excluded — it has no finish line).
- `applyDailyModifiers(level, modifier, key)` returns a copy with the twist
  applied, so the campaign data is never mutated.

| Modifier | Twist | Gems |
|---|---|:---:|
| Standard Muster | no twist | 3 |
| Midas Rush | +40 starting gold, horde +15% HP | 4 |
| Glass Bastion | core 15 HP, +60 gold | 5 |
| Lean Rations | 140 starting gold, kills pay +25% | 4 |
| Siege Day | horde +30% HP, +80 gold | 6 |
| Bounty Board | kills pay +40%, horde +10% HP | 4 |

`DailyStore` owns the streak. Starting the run is enough to keep it alive; the
win pays the modifier's gems exactly once per day. `currentStreak()` treats
yesterday's run as still alive until midnight (so the menu is not scary at
00:05), and a gap of two or more days resets the visible streak while
`bestStreak` is kept.

### 9.2 Achievements (`src/data/achievements.js`, `src/systems/Achievements.js`)

24 entries across combat / defense / campaign / endurance / daily, worth
**96 gems** in total. Each entry is data — `{ metric, target, gems }` against
the lifetime stats in `ProfileStore.profile.stats` — so one evaluator covers
all of them and the menu can render real progress bars ("612 / 1000 kills").

`ProgressStore` folds gameplay into those stats:

| Hook | Stats |
|---|---|
| kill | `kills`, `goldEarned`, `bestChain` (peak), `bossesKilled` |
| early call | `earlyCalls` |
| build | `towersBuilt` / `palisadesBuilt`, `maxTowersAtOnce` (peak) |
| upgrade | `upgradesBought` |
| wave clear | `wavesCleared` |
| victory | `victories`, `threeStarVictories`, `flawlessVictories`, `starsTotal` |
| endless record | `endlessBestWave` (peak) |
| daily win | `dailyWins`, `dailyStreak` (peak) |

Peak metrics use `trackStats(patch, { max: [...] })` so a 20-kill chain is a
record, not 20 more kills. `syncAchievements()` pays every newly satisfied entry
once and saves; the scene calls it on wave and run boundaries so a fight is not
interrupted by a toast storm.

### 9.3 Endless checkpoints (`src/systems/EndlessMilestones.js`)

Checkpoints every 5 waves to 50, then every 10 to 100, paying `30 + 6·wave` gold
and 1–5 gems. `milestonesBetween(lastPaid, wave)` makes the payout idempotent, so
an early call or a replayed wave cannot double-pay. The HUD shows the personal
best under the wave number in Endless and flips to `NEW BEST · N` the moment the
run passes it — `isRecordWave()` is the single comparison behind that.

### 9.4 Surfaces

| Surface | Change |
|---|---|
| Main menu | `DAILY CHALLENGE` button: today's modifier, streak flame, "cleared" state |
| Achievements overlay | grouped checklist with per-entry progress bars and gems |
| HUD wave badge | `BEST N` / `NEW BEST · N` in Endless |
| Result screen | daily modifier + streak + gems row, achievement names for the run |
