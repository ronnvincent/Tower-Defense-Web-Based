# Request 17 — Defence of Kingdom: DSALGO Bastion Edition

**Status: in progress.** This report lists only what is implemented **and verified**, plus an
honest matrix of what is still outstanding. Every number below was measured on this machine
(Chromium 140 headless, software rasteriser, no GPU device attached) or read out of the live
scene through the dev-only `window.game` handle.

Companion documents: `docs/PROJECT_AUDIT.md` (Phase-0 audit), `docs/req-16-report.md`
(performance/responsive/asset pass that this work builds on), `docs/asset-credits.md`.

---

## 1. Method

* **Audited before touching anything.** `docs/PROJECT_AUDIT.md` records the real stack
  (Phaser 3.90, Vite 7, Vitest 5, jsdom), the features that already existed (targeting
  priorities, sell refunds, boss phases, wave preview, early call, pause-stops-simulation),
  and the gaps this request actually asks for.
* **No migration.** No React, no TypeScript, no engine change. The existing scenes, systems
  and data files are the ones being extended.
* **Nothing rebuilt that already worked.** The existing 4-stage campaign, 7 keep + 5 engineer
  defences, 20 enemy types and 8 game modes keep their code paths; the work below adds to them.
* **Every new number lives in data/config**, so a balance change never means editing a scene.

---

## 2. What shipped in this increment

### 2.1 Difficulty presets — Normal / Veteran / Nightmare

| Preset | Enemy health | Enemy damage | Gold |
| --- | --- | --- | --- |
| Normal | ×1 | ×1 | untouched |
| Veteran | ×1.25 | ×1.15 | untouched |
| Nightmare | ×1.5 | ×1.3 | untouched |

* **Data:** `src/systems/Difficulty.js` — `DIFFICULTIES`, `difficultyFor()`, labels, and a
  `DifficultyStore` that persists one id under `td-dsalgo:difficulty:v1` and falls back to
  Normal for a missing, corrupt or unknown value.
* **Applied once per attempt:** `GameScene.init()` resolves the preset (launch payload →
  store → Normal) and freezes it. Health is folded into `spawnScaling()` — which every spawn
  path (wave, boss, summon, escort) already goes through — and damage into the two places a
  creep can hurt the player: the core hit and the palisade swing. Gold is deliberately not
  touched.
* **PvP is always Normal**, so a stored Nightmare cannot tilt one duel seat.
* **UI:** the briefing card carries a three-plaque picker plus a summary line
  (`DIFFICULTY · Veteran · ×1.25 HP · ×1.15 DMG`), rendered from the same store the battle
  reads. Choosing a preset writes the store and repaints the card, so the card cannot show one
  thing and the fight run another.
* **Verified live (dev):** card label `Nightmare ×1.5 HP · ×1.3 DMG`, store
  `{"id":"nightmare"}`, scene `preset: nightmare, hp: 1.5, dmg: 1.3`, and a real wave-1 grunt
  born at **138 HP vs 92 HP on Normal** (exactly ×1.5). `stored: null` on a fresh profile →
  Normal.
* **Layout verified:** 1366×768 plaque 103×36, card 392×463 with no scroll; 844×390 plaque
  85×44, row at y 212–256 clear of the sticky DEPLOY/BACK row.
* **Tests:** `tests/difficulty.test.js` (12) + a UI interaction test in
  `tests/world-map.test.js` (33 in that file).

### 2.2 Frost Surge — the second spell

* `src/systems/Powerups.js` — fourth powerup: 20 s cooldown, hotkey **T**, 100 px radius,
  **40 % slow for 3 s**, ground only. `frostTargets()` ignores dead, escaped and flying creeps.
* `GameScene.castFrost()` applies the slow through `Enemy.applySlow()`, which already
  implements the strongest-slow-wins rule and restores the base speed when it expires.
* Aiming follows the meteor's grammar: arm the powerup, then tap the ground.
* The glyph (`public/assets/ui-kit/glyph_frost.png`, 64×64 RGBA) is drawn in-repo by
  `scripts/build_ui_kit.py` — no downloaded art, no licence question.
* **Tests:** `tests/powerups.test.js` (13) and `tests/powerup-rail.test.js` (4).

### 2.3 The Bastion Vanguard (hero)

| Stat | Value |
| --- | --- |
| Health | 500 |
| Speed | 110 px/s |
| Reach | 30 px |
| Auto-attack | 30 damage every 1.0 s |
| Shieldbreaker Strike | 100 damage, 75 px radius, 12 s cooldown, ground only, each enemy hit once |

* **Entity:** `src/entities/Hero.js`. Pure helpers (`nearestGroundTarget`, `isGroundEnemy`,
  `isAliveEnemy`) are exported and unit-tested; the class owns movement, the walk cycle, the
  health bar, contact damage and the down state.
* **Input:** *arm, then tap*. The HUD's MOVE button arms the next battlefield tap as a move
  order (pressing it again disarms). This slots into the existing pointer priority ahead of
  build/inspect, so a move order is never swallowed by a tower tap, and normal building is
  unchanged when nothing is armed.
* **Damage:** every hit goes through `Enemy.applyDamage()` — the same central resolver the
  towers use (armour, shields, traits, death bookkeeping, one death event, one bounty). The
  strike re-checks liveness and range at cast time and visits each enemy once.
* **Down state:** creeps that crowd the hero chip 18 dps each; at 0 HP the hero goes down, the
  panel says DOWN, MOVE and STRIKE disable, and it returns at full health when the next wave
  opens. Standing in the horde is expensive, which is what makes the move order matter.
* **Art:** `scripts/build_hero.py` draws a deterministic 4-frame strip
  (`public/assets/hero/vanguard.png`, 384×112 = 4 × 96×112) in the interface's palette, because
  the library has no friendly soldier (see the audit).
* **HUD:** `#hero-panel` — portrait, name, state, health bar, MOVE and STRIKE. 208×72 on
  desktop, 168×~88 on phones with 44 px touch targets; it sits under the top bar at the
  top-right and never collides with the dock, the powerup rail or the camera pill.
* **Verified live (dev):** hero spawned at (96, 352); after a real wave, grunts read 62/92
  (one 30-damage swing each) and the hero had taken contact damage (500 → 469); Shieldbreaker
  reported `hits: 1`, cooldown 12000, button label `12s`, toast
  `SHIELDBREAKER — 1 creep struck`; a move order walked the hero (96,352) → (112,270) and
  cleared the armed state.
* **Verified on the production build:** panel 208×72, `500 / 500`, `HOLDING`, MOVE arms
  (`aria-pressed="true"`), STRIKE → `12s` + disabled, toast, **0 console errors**.
* **Tests:** `tests/hero.test.js` (17).

### 2.4 Sell refund is 60 % of recorded spend

`SELL_REFUND_RATIO` was 0.7; the specification fixes 60 %. The ratio now lives in one constant
(`src/config/gameConfig.js`) and `calculateSellRefund()` uses it instead of its own 0.7 default,
so the refund cannot drift between data, HUD and tests. `tests/gameplay-systems.test.js` pins
the constant and the three tier refunds.

---

## 3. Fifteen-point status matrix

`verified` = exercised in this branch (tests, live probe or production build).
`partial` = implemented but not fully exercised. `open` = not implemented yet.

| # | Requirement | Status | Evidence / note |
| --- | --- | --- | --- |
| 1 | Campaign → briefing → preparation → waves → result → progression → realm loop | **verified** | Existing loop re-exercised end-to-end in dev and production smoke runs (menu → map → briefing → deploy → battle). |
| 2 | State machine; pause stops the simulation; next wave only when clear | **verified** | Pre-existing `GameStateManager` + `WaveManager`; pause blocks `stepSimulation()` (not CSS). |
| 3 | Terrain, ≥1 waypoint route, ordered coords, damage exactly once, fixed build points, clear entrance/exit | **verified** | Pre-existing `PathfindingSystem` (Yen k-shortest lanes) + `PlacementSystem`; the hero deliberately does not block lanes. |
| 4 | Five stages (green / forest / rock / marsh / bastion) | **open** | Four campaign stages exist (`level-1..4`, 6/7/8/9 waves). The fifth — **Ashen Caldera** — has a theme, a region and Endless already on the plate, but no campaign level, banner landmark or boss yet. |
| 5 | Balance defaults: 300 gold, 20 lives, 8 waves, 8 build points, early-call 10 % once | **partial** | Early-call bonus, speed toggle and build-point rules exist; the existing stages ship 220–25 lives/6–9 waves of their own. Retuning the shipped campaign to the spec's stage-1 numbers is a deliberate, separate balance change (see §5). |
| 6 | Four tower families, three levels, two branches each; First/Strongest/Nearest; 60 % sell | **partial** | Seven keeps + five engineer defences with L1→L2→two branches already exist, as do targeting priorities and per-tower investment. Sell is now 60 % (§2.4). The spec's exact archer/mage/artillery/barracks stat lines are **not** applied to the existing families. |
| 7 | Six enemy archetypes incl. a flying unit and a two-phase telegraphed boss | **partial** | 20 enemy types, armour/shield/traits and multi-phase bosses exist. A **flying** archetype does not: there is no `flying` flag in `enemyData`, so the Wraith and the "aerial towers only" rule are still open. Hero and Frost already respect `enemy.flying`. |
| 8 | Data-driven waves, preview, counts, start button, early start, speed toggle | **verified** | Pre-existing and exercised in the live probes (`WAVE 1/6`, `NEXT IN …`, START WAVE, ×1/×2). |
| 9 | Hero: stats, Shieldbreaker, click-to-move, re-issue, health/cooldown UI | **verified** | §2.3, dev + production. |
| 10 | Arcane Meteor and Frost Surge, telegraph, ground-only, stop at battle end | **verified** | Meteor pre-existing; Frost Surge §2.2. Both live on the same cooldown clock the pause freezes. |
| 11 | Unlock chain, replay, best stars retained, difficulty fixed per attempt, versioned validated save | **verified** | Pre-existing `ProgressStore` + `stageState()`; difficulty added on top and stored under its own key with validation. |
| 12 | Realm: Bastion, Forge, Champions' Hall, War Room, Library, Hall of Heroes — all functional | **verified** | Each landmark opens a panel that mirrors real save data; the panels were re-measured at 844×390 (all fit, no clipped actions) in the previous pass. |
| 13 | Six achievements with real event detection | **partial** | 14 achievements exist and are detected from lifetime stats, including First Victory and Boss Slayer. *Untouched Bastion*, *Tower Master* and *Arcane Arsenal* are not written yet. |
| 14 | Quality modes (presentation only), reduced effects, landscape battles | **verified** | `QualityManager` (auto/high/balanced/performance) shipped earlier: it changes particles/presentation only, never rules, speed or damage; map frame time measured 48.0 / 44.8 / 32.7 ms per profile. |
| 15 | Tests, rendering, performance, production build, six viewports, run instructions | **partial** | 95 test files / **1141 tests** green; `npm run build` green; production smoke on the built bundle green; the new hero HUD measured at 1366×768 and 844×390. The full six-viewport battle matrix and the final balance pass are still to run (§5). |

---

## 4. Decisions taken (the brief leaves these open)

1. **Difficulty multiplies the stage's own ramp** instead of replacing it, so a Nightmare run
   of a later stage is still harder than a Nightmare run of an earlier one.
2. **Difficulty never touches gold.** A harder run is a harder fight, not a poorer one.
3. **Duels ignore the preset** (always Normal) — two seats must be mirrored.
4. **The hero does not block the lane.** Creeps never stop for it, so adding a hero can never
   break the "waves walk a fixed route" rule.
5. **Hero contact damage** is 18 dps per adjacent ground creep; that is the only thing that can
   down it, and it is what gives the down state a cause.
6. **A downed hero returns at full health when the next wave opens** — no hidden timer, no
   purchase.
7. **Move orders are arm-then-tap**, so ordinary taps keep building and inspecting.
8. **The hero sprite is drawn in-repo** rather than borrowed, because the library has no
   friendly soldier and repainting an enemy would read as a bug.

---

## 5. What remains (in the order it should be done)

1. **Ashen Caldera** — a fifth campaign stage: level data (10 waves, volcanic theme, boss),
   a banner landmark on the plate, a painting for it, and the stage-5 gating in the unlock
   chain.
2. **Flying archetype** — a `flying` flag on the enemy table, the Wraith, and the rule that
   only towers with `canHitAir` may target it; the battlefield needs one aerial-capable keep
   before the flag is turned on for a stage.
3. **Three achievements** — Untouched Bastion (clear with ≥80 % lives), Tower Master (one of
   every family standing in a single run), Arcane Arsenal (both spells cast in one run), each
   with a real event and a stored flag.
4. **Spec-exact stage-1 economy** (300 gold / 20 lives / 8 waves / 8 build points) — a
   deliberate re-tune of the shipped campaign plus its tests, or an explicitly documented
   deviation.
5. **Balance pass** across the four existing stages once the hero and Frost are in the mix.
6. **Six-viewport battle matrix** for the new hero HUD (360×640, 390×844, 844×390, 768×1024,
   1366×768, 1920×1080) and a final production smoke after the balance pass.

---

## 6. Running it

```bash
npm install
npm run dev          # Vite dev server, 0.0.0.0:4173
npm run build        # production bundle in dist/
npm test             # Vitest, 95 files / 1141 tests
node scripts/check-contrast.mjs
python3 scripts/build_hero.py --preview /tmp/hero.png      # needs Pillow
python3 scripts/build_ui_kit.py --preview /tmp/ui-kit.png
```

Controls for the new systems: **MOVE** arms a tap-to-walk order, **STRIKE** fires
Shieldbreaker (also on the hero panel), **Q** meteor, **T** Frost Surge, **E** overcharge,
**R** fortify. Difficulty is chosen on the briefing card before DEPLOY.
