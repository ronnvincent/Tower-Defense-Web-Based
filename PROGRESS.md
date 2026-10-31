# UI/UX overhaul — progress log

Working document for the overhaul described in `tower-defense-ui-overhaul-prompt.md`.
It is the resume point if the work is interrupted: **start at the first phase below
without a ✅**.

Rules I am holding myself to while executing it (they override the prompt where
they disagree — see §2):

* No gameplay, balance, DSA, wave-data or map-coordinate changes.
* Nothing that the prompt lists under "ASK ME FIRST" is done; where a phase needs
  one of those decisions I take the prompt's own documented fallback and write the
  assumption down in §3.
* Every phase ends with `npm test`, `npm run build`, a browser run at **1280×768**
  and **1024×640** with screenshots in `docs/ui-after/phaseN/`, and a commit
  `Phase N: <short title>`.

---

## 1. Phase checklist

| Phase | Title | State |
| ----- | ----- | ----- |
| 0 | Baseline (tests, screenshots, extra observations) | ✅ |
| 1 | Bugs + layout foundation (top bar, dock, UI scale) | ✅ |
| 2 | Tower inspector, panels and modals | ✅ |
| 3 | Main menu and scene transitions | ✅ |
| 4 | Core game feel ("juice") | ✅ |
| 5 | Atmosphere and lighting | ✅ |
| 6 | Progression, reward and onboarding | ✅ |
| 6b | Top rail restyle (requested after Phase 5) | ✅ |
| 7b | Tutorial spotlight + pointing hand (requested after Phase 7) | ✅ |
| 7 | Audio and settings | ✅ |
| 8 | Accessibility, performance, QA | ⬜ |

---

## 2. Phase 0 — baseline (done)

* `npm install` already satisfied; `npm test` green before any change
  (**1,709 tests / 131 suites** — the number recorded in `docs/testing-report.md`).
* Dev server on `:5173`; the game was driven with a real headless Chromium
  (`/home/user/pw/ui-harness.mjs`), not a fixture.
* Screenshots + machine audit saved to `docs/ui-before/`:
  `menu, howTo, battle, ghost, battleMid, inspector, pause, codex, leaderboard,
  defeat, victory, map, tutorial` at **1280×768** and **1024×640**
  (`audit-1280x768.json`, `audit-1024x640.json`).

### Measured starting point (1280×768)

| Thing | Value | Verdict |
| ----- | ----- | ------- |
| `#hud-top-bar` | rect `[16, 9, 1248, 80]` → 80 px tall | over the prompt's 56 px budget |
| `#hud-bottom-dock` | rect `[295, 545, 690, 205]` → 205 px tall | 27 % of the viewport |
| Interactive controls under 44 px | 14 | zoom 30, dock tabs 30, fold handle 21, hint dismiss 20 |
| Clipped nodes | 0 | – |
| Text spills | 4 (`button.powerup-btn`, 59 px in a 56 px box) | powerup plate one pixel too wide |
| Console errors | `500` on the cloud ping | pre-existing (no `npm run cloud:dev`) |

At **1024×640** the same audit gives a 68 px top bar, 14 tiny controls, and the
codex modal clipping its own telemetry grid (`section.telemetry-section` 195 px
tall inside a 640 px screen).

### Section-3 items verified in the browser

| Item | Status at baseline |
| ---- | ------------------ |
| A top bar overflow / 140 px / 3-line counter | partly: it is 80 px, not 140; the wave pill still stacks three lines at 1024 |
| B dock over the road | **no longer true** — `--dock-clearance` already pushes the camera band above the forge; the dock covers empty letterbox |
| C `box-shadow` on `border-image` panels | live |
| D blue inspector container on the right edge | live (Elemental blue `ContainerAdvanced4` frame) |
| E flat menu card | already replaced by a painted diorama; utility buttons are still 36 px |
| F 3 px enemy HP bars, no ground shadow | live |
| G emoji mixed with pixel icons | live (`💀 ⚒ ✥ ⤢ ✕ ◎`) |
| H `showBossBar` vs `showBossBanner` | **already fixed** — `GameScene` calls `showBossBar`, `HUD` defines it (banner aliases kept) |
| I `healthBar*` vs `hpBar*` in `Enemy.js` | live — the bars stay up through the death tween |
| J fixed DOM HUD vs FIT canvas | live — a scale factor is still per-panel media queries |
| K inline styles in `index.html` / `HUD.js` | live |

### Extra observations (not in section 3)

1. `#wave-preview` ("NEXT IN 1 · 10 GRUNT") lands on the map's top-left border and
   touches `#hud-level-chip`.
2. Build-card names truncate: *Ballista To…*, *Frost Basti…*, *Hammerfo…*.
3. The dock is 205 px because it stacks a fold header (21 px), a tab strip (30 px)
   and a 120 px card row. Two of those three rows only pick a filter.
4. `#btn-toggle-dock` (197×21) and the four tab buttons (30 px) are the smallest
   controls in the game; they are also the two the player touches most.
5. The camera cluster (`− 55 % + ⤢`) floats over the bottom-right corner of the
   board at 1024×640.
6. The hint bubble ("Tap a raised tower to upgrade it…") sits on the middle lane
   and hides the road it is talking about.
7. The base crystal draws a flat green bar labelled `BOSS` above it — reads as a
   debug overlay at play scale.
8. Labels are below the 14 px floor: `.hud-label` ≈ 10 px, card names ≈ 11 px.
9. The menu's four utility buttons in the top-right are 36 px squares with no
   tooltips; the footer's `ENTER`/`F` key caps are 9 px.
10. The captured `inspector` state never opened the inspector (the harness clicked
    an empty tile, so only the "cannot build on the road" toast is up). A tower
    has to be raised first — fixed in Phase 2 by seeding a built tower before the
    click.
11. The powerup rail (Q/E/T/R) sits in the left letterbox band — good; it does not
    duplicate the 1–4 build hotkeys.
12. Pre-existing false positives in the audit, do not "fix": `menu-sky`,
    `menu-wisp-*`, `wm-camera/plate/terrain/air/clouds/mist` are oversized on
    purpose for parallax; `codex`/`defeat`/`victory`/`leaderboard` report
    `covered` because a modal legitimately covers the HUD.

---

## 3. Decisions and assumptions

**Phase 1**

* **Dock stays inside the letterbox band.** The prompt's preferred fix (grow the
  canvas, add `MAP_OFFSET_Y`, move every coordinate) is on the "ask me first"
  list, so the documented fallback is used: the forge is one 84 px translucent
  band that lives in the reserved bottom clearance. `--dock-clearance` already
  tells the camera to frame the board above it, so no road or build tile is
  covered — verified in the browser at both sizes.
* **The build card is icon + hotkey + price** (`76 × 68`), exactly what the
  prompt asks for. The tower's *name* would not fit a 70 px label at the 14 px
  floor, and truncating it to "Ballista To…" was the ugliest thing in the old
  dock. The name therefore lives in `title`, `aria-label`, the hover/focus card
  and in the placement hint the moment a card is armed ("PLACING BALLISTA TOWER"),
  so it is never hover-only.
* **The four family tabs became a popover.** A 30 px tab strip cost 34 px of the
  84 px budget for a control that only picks a filter. The same four `.dock-tab`
  buttons, ids, handlers, roving tabindex and storage key remain — they open
  from `#dock-family-btn`.
* **Unaffordable cards still arm.** The prompt asks for a shake + denied sound
  on click; refusing the *selection* would also remove the ghost preview and the
  range ring, which is a behaviour change I am not allowed to make. So the price
  shakes, the denied tick plays, and the card arms as it always did.
**Phase 2**

* **The inspector's actions sit outside the scrolling body.** The upgrade and
  sell buttons were the last two children of `.inspector-body`; a level-1 tower
  at 1024×640 pushed SELL 17 px below the viewport and no amount of scrolling
  reached it because the panel itself was not capped. The panel is now a capped
  flex column (header · scrolling body · actions footer) and `.inspector-shell`
  owns that column — capping the outer box alone just let the shell paint
  outside it.
* **Touch targets stay 44 px; type stays 14 px.** Where a control could not be
  both, the control kept its size and the *label* moved into `title`/`aria-label`
  or into the tooltip card.
* **The How-to modal is four tabs, and the tab state is remembered for the
  session** (default GOAL). Six stacked sections in one scroll meant the player
  reading "how do I build" scrolled past the objective, the tower table and the
  daily rules first.
* **The Codex drawer stays a drawer, but stops eating the HUD.** It now starts
  below `--topbar-clearance` and ends above `--dock-clearance`, so the pause,
  speed, mute, fullscreen and wave controls stay reachable while it is open —
  the point of a *live* telemetry panel. It also gained the shared 9-slice
  frame; it was the one panel that was still a flat gradient with a 2 px
  `border-left`.
* **Modal prose is 14 px, not 11–13 px.** `--fs-small` bottoms out at 11 px,
  which is under the design system's own floor; `.modal-body`, `.modal-list`,
  `.modal-note` and the codex body copy now set 14 px directly.
* **Dialogs trap focus.** Tab/Shift+Tab cycle inside `#instructions-modal` and
  `#credits-modal` instead of walking out into the menu behind them.

* **`--ui-scale` drives geometry, not type.** Type sits at its 14 px floor
  already; scaling it down would break the design system's own rule, so the
  scale factor tightens padding/gaps and `data-density="compact"` (≤1100 px wide
  or ≤640 px tall) drops the stat labels to icons + aria-labels.

**Phase 6**

* **Rewards are read, not recomputed.** The wave-clear card prints the tallies the
  scene already keeps (`waveKills`, `waveLeaks`, `waveStartedAt`) and the gold the
  economy already granted; nothing in `HUD.showWaveClear` adds, multiplies or
  balances anything. "FLAWLESS" is `leaks === 0`, which is a fact the scene has.
* **The creep card only exists for a mouse.** It is built from `enemy.stats` (the
  same object combat reads) and suppressed while a build key or a keep is
  selected, because during placement that corner of the board belongs to the
  ghost. On touch there is no hover, so the CSS hides it outright rather than
  leaving a card that can never appear.
* **Nudges are throttled twice** — 45 s per hint key, 30 s global — and skipped
  while a modal is open, during the tutorial hold and after game over. A hint
  that repeats is noise; a hint that fires over a dialog is a bug.
* **One hover card, not two.** The existing tower hover card and the new creep
  card share the same pointer plumbing (`pointerCssPoint()` converts Phaser's
  canvas-space pointer into CSS pixels, which is *not* `displayScale`), so a
  creep under the cursor replaces the tower card instead of stacking under it.

**Phase 6b — the rail (request: no plates, one fade, display type)**

* **The plates are gone, not restyled.** BASE/GOLD/SCORE, the wave pill, the four
  controls and the level name all lose their frame, fill and radius. What is
  left is the realm header's recipe: a masked black gradient behind the strip,
  Cinzel kickers over cream values, and a gold call to action.
* **START WAVE lost its gold plate too.** The request says "text na lang", and a
  single surviving plate in the middle of a plate-free rail is exactly the
  inconsistency being reported. It stays the loudest element through size
  (17 px display, 3.2 px tracking), colour and a breathing underline
  (`@keyframes railCall`) instead of a second frame. Mid-wave it stops
  breathing and dims to a status label, because it is not a call then.
* **The closing hairline was dropped.** A gold rule at the bar's bottom edge sat
  on the same row as the base-integrity meter and the wave meter and cut through
  both. The fade ends the rail on its own; the two meters are its only edges.
* **The speed readout keeps the body face.** `1×` in Cinzel Decorative renders as
  a single gothic stroke; the one control that reports a number has to read.
* **44 px targets stay 44 px** (34 px on the phone rail, the project's existing
  touch floor) — only the paint was removed, never the hit box; hover answers
  with a gold halo and `:focus-visible` draws one thin ring.

**Phase 7 — audio and settings**

* **The pause card gains exactly two buttons, and both are destructive-safe.**
  RESUME was the only way back, so a run that had gone wrong had no recovery
  short of LEAVE BATTLE → the map → the level again. RESTART replays the *same
  launch* through `gameFlow.restartBattle()` (level, difficulty, mode flags),
  so a restart in an endless run or a daily is that run again, not the bare
  campaign level. It arms on the first tap and acts on the second, like LEAVE.
* **Settings opens over the paused battle** rather than dismissing it: the
  player closes the panel and is exactly where they left off.
* **Three new switches live in the settings record, not in a second key.**
  `muted`/`volumes` belong to the mixer, `ux` belongs to
  `config/uxSettings.js`; both now spread the existing record when they write.
  Before this a fader move silently reset the switches (a test pins it).
* **Colour assist is a real palette swap, not a filter.** The creep health bar
  (`hpBarColor`) and the HUD integrity meter (`--hp-good/--hp-warn/--hp-bad`)
  move to the Okabe–Ito blue → orange → deep-orange axis. Colour is never the
  only cue anyway: the bar is also its own length.
* **Pitch variation and panning are applied at the one funnel that already
  existed.** `AudioSamples.play()` took a `rate`; it now takes `jitter` and
  `pan`, and `AudioSynth.panFor(worldX, camera)` turns a world position into
  ±0.7 using the camera's `worldView` (screen position, not map position). The
  three loudest positional cues — tower fire, impact, death — pass it.
* **The low-integrity alarm is a heartbeat, not a klaxon.** Two soft sine
  thumps every ~1.9 s on the simulation clock, only while the gate is under a
  quarter and the run is live. It shares `tickLowHealthAlarm` with the rest of
  the scene clock so pausing, 2× speed and the tutorial hold all behave.
* **Music "layers" were already built** (proc beds + recorded tracks with
  crossfades, `intense`/`boss` aliases). Nothing was rebuilt; that part of the
  phase was an audit, and it is recorded as such rather than re-implemented.

## 4. Bugs found while working

* **I (fixed).** `Enemy.js` hid `healthBarBg/healthBarFill` on death; the fields
  are `hpBarBg/hpBarFill`, so a dead creep kept a floating health bar for the
  whole death tween.
* **C (fixed).** `box-shadow` on `border-image` panels painted a rectangle
  behind the transparent 9-slice corners on the top bar, the dock, the toast and
  the boss card. All four now use `filter: drop-shadow()`.
* **K (fixed).** The last two inline styles (`boss-hp-bar`, `boss-shield-bar`
  initial widths) moved into the stylesheet; `index.html` had none left.
* **G (partly fixed).** The boss `💀`, the forge `⚒`, the camera-hint `✥` and
  the focus `◎` are gone (word chip, brass stud, inline SVG, CSS ring). Emoji
  inside transient toasts (`⚠`, `🪙`, `🏆` in `GameScene`) are still there and
  are handled with the wave banners in Phase 4/6.
* **New: the powerup rail can overlap the board's outer column.** Shortening
  the bar and dock made the camera band taller, so at 1024×640 the board now
  fills the full width and the Q/E/T/R rail sits over the first one or two grass
  columns. It never covers a road tile (every map's leftmost path column is ≥ 3).
  Root fix needs a horizontal inset in `CameraRig.setFrame` + pointer mapping;
  deferred to Phase 8 QA where the input maths can be re-verified.

**Phase 2**

* **Inspector action footer (fixed).** See §3 — SELL was unreachable at
  1024×640 on a fresh tower.
* **How-to modal overflowed its own card (fixed).** `.modal-body` was
  `overflow-y: auto` but its flex parent had no `min-height: 0`, so the card
  clamped at 92 % and the content kept drawing past the footer. Header, tabs and
  footer are now `flex: 0 0 auto`, the body is the only flexible child.
* **`FINAL SCORE undefined · WAVES CLEARED undefined · ELAPSED TIME NaNs`
  (fixed).** `LeaderboardUI.show()` is also reached with no run to report (the
  harness did exactly that, and so does any route that reopens the hall), and
  `_resultMarkup` printed whatever it was handed. `LeaderboardUI.describesRun()`
  now gates the summary block, and an absent clock reads `—` instead of a
  made-up number. The browser harness was passing `{ status: 'victory' }`; it
  now passes a complete result object.
* **Coach/camera hint cut mid-sentence (fixed).** A shrink-to-fit pill centred
  with `left: 50%` measures itself against the half-screen to its right and
  ellipsised its own last words. `width: max-content` + a `max-width` cap.
  It also stands down while the codex drawer is open, because the drawer owns
  that half of the glass.
* **Inspector was still the one blue panel (fixed).** The inner shell's cyan
  border became the brass line the rest of the UI uses.

## 5. Still open

* `victory` reports 4 text "spills" — all four are `.result-star-slot` measured
  *during* its `scale()` entrance animation, not an overflow. Re-measuring after
  the 460 ms animation reports 0.
* The map screen still reports 8–10 clipped `.wm-*` nodes at both sizes; those
  are the parallax layer (intentional overdraw, pre-existing).
* `defeat` / `victory` / `leaderboard` report "covered" HUD controls: those are
  full-screen overlays, which is the design.
* The powerup rail / outer grass column overlap from Phase 1 is unchanged.
  Root fix (horizontal inset in `CameraRig.setFrame` + pointer mapping) is
  still scheduled for Phase 8.


---

## 6. Phase 2 — inspector, panels and modals (done)

**Changed:** `src/style.css`, `src/ui/HUD.js`, `src/ui/LeaderboardUI.js`,
`index.html`, `src/main.js`.

* Inspector: upgrade previews as green `→ next` deltas (damage, range, attack
  speed, DPS) with `.is-down` reserved for a real loss; targeted only when a
  single next tier exists, so the level-2 fork shows no arrow that could lie.
* Inspector: brass accent instead of the cyan shell, a pointer arrow on the
  side the panel was actually placed on, capped height, sticky action footer.
* Targeting priority is a segmented control (brass fill on the active mode).
* One modal system: same 9-slice plate, `filter: drop-shadow`, fade + 0.96→1
  entrance (`modalIn`), an exit keyframe, a scrollable body between fixed header
  and footer, focus trap, Esc and backdrop close.
* How-to-Play is four tabs — GOAL / TOWERS / ALGORITHMS / HOTKEYS — with arrow /
  Home / End keys and `aria-selected` kept in sync.
* Codex drawer: sits between the two HUD bands, framed like every other panel,
  body copy at 14 px.
* Leaderboard summary block only renders for a run that has a score and a wave
  count; missing clock reads `—`.

**Verified (headless Chromium, real flows, `docs/ui-after/phase2/`):**

| State | 1280×768 | 1024×640 |
| ----- | -------- | -------- |
| battle / ghost / battleMid / pause / tutorial | 0 clipped, 0 spill | same |
| inspector | 0 clipped, 0 covered | **0 clipped** (was 4, SELL unreachable) |
| codex | 0 covered (was 4) | 0 covered |
| howTo / howToAlgo / credits | card clamped, body scrolls | same |
| victory | 4 "spills" = entrance-animation transforms | same |

`npx vitest run` → **131 files / 1709 passed**. `npm run build` → ✓.

---

## 7. Phase 3 — title, loader and the curtain (done)

**Changed:** `index.html`, `src/style.css`, `src/main.js`.

* **Curtain.** `withCurtain()` wraps `startLevel` / `showLevelSelect`: the screen
  fades to black for 180 ms, the scene swaps, the curtain lifts on the next
  frame. Falls through synchronously when the element is missing (jsdom) or the
  player asked for reduced motion, so no test or timer depends on it.
  Verified in a real browser: 24 of 30 polled frames shut, then open, scene =
  `GameScene`, loader hidden.
* **Loader.** The bar and caption were correct but static, so a two-second gate
  read as a frozen frame. Added a spinning portal sigil (pure CSS, no asset to
  licence) and three tips on a 13.5 s CSS clock — the loader has no idea how
  long it will take, so the tips must not depend on a JS timer it can outrun.
* **Menu entrance.** The two title lines drop in (620 ms, back-out), take one
  brightness pass, then hold; the panel's six children rise in a stagger
  (40 → 780 ms). Nothing appears in a single frame any more.
* **Per-letter title split — tried and reverted.** Chromium drops a parent's
  `background-clip: text` once the glyphs live in transformed inline-blocks, so
  the gold ramp painted as a pale slab behind the O. Two-line drop instead;
  recorded so nobody tries it again.
* Deferred from this phase, with reasons: the *live* menu diorama (towers firing
  on the menu background) needs a second Phaser scene; music ducking on modal
  open belongs to Phase 7's audio work.

`npx vitest run` → **131 files / 1709 passed**. `npm run build` → ✓.
Screenshots: `docs/ui-after/phase3/{menu,loading,battle}-{1280x768,1024x640}.png`.

---

## 8. Tutorial fixes (requested after Phase 3)

**Changed:** `src/data/levelData.js`, `src/data/tutorialScript.js`,
`src/scenes/GameScene.js`, `src/ui/HUD.js`, `src/main.js`, `src/style.css`,
`tests/hud-dom.test.js`.

Four defects, all reported from play:

1. **The opening could dead-end on an upgrade.** `startingCoins: 320` bought one
   ballista (60) and left 60 — not enough for any tier-2 step — and the upgrade
   is a *step gate*, so the script waited forever on a button the player could
   never afford. The war chest is now **2000**: every defence on the shelf can be
   raised and taken to tier 2, twice over for the dearer ones.
2. **The system now points at the thing it is waiting for.** A step gate is only
   fair if the target is findable:
   * *place* — a gold ring **and the words "RAISE IT HERE"** on the suggested
     tile (the label rides the cell in the game's own face, so it moves with the
     camera), plus a glowing outline on the recommended forge card;
   * *upgrade* — the ring lands on **the tower the player actually built**
     (not the scripted cell, because they may have built elsewhere), the label
     says "TAP THE TOWER", and when the panel opens the **UPGRADE card glows**;
   * *wave* — the **START WAVE** button glows.
   Marks are painted by `HUD.setTutorialHint()` / `applyTutorialHint()` and are
   repainted after any re-render, cleared the moment the action lands.
3. **Leaving no longer bypasses *or* re-traps.** `quitToMap()` now writes the
   same `profile.tutorialDone` flag a finished run writes. Before this, quitting
   mid-story wrote nothing: the player "escaped" once and then got dragged back
   into the village on every later battle. The gate is now single-shot per
   player — finished **or** left, it never fires again — and the pause card says
   so in advance ("Leaving now ends the opening for this keeper").
4. **The step copy matches the marks** ("Tap the glowing card in the forge, then
   tap the marked meadow").

**Verified in a real browser** (`docs/ui-after/tutorial-fix/`): fresh save →
Havenbrook opens with **GOLD 2000**, the marked tile and the glowing card;
building at the marked cell advances to *upgrade*; `#btn-upgrade-tower` carries
`.is-tutorial-target` when the panel opens; `quitToMap()` sets `tutorialDone`,
and after a reload **PLAY opens the world map, not the tutorial**.

New tests: `tests/hud-dom.test.js` — the hint marks exactly one control, clears
it, and marks the UPGRADE card (never SELL). Full suite **131 files / 1711**.

Left as is on purpose: losing the opening still lets the player try it again —
a defeat is a real run, not a skip.

---

## 9. Mobile HUD (requested after the tutorial fix)

The phone shell already existed (`[data-shell='mobile']`, ~140 rules). It was
right in *shape* and wrong in *scale*: five cards stretched to 150 px each, a
270 px sheet on a 375 px screen, the category row opening as four full-width
rows across the middle of the board, and START WAVE sitting on top of pause,
mute and speed.

**Changed:** `src/style.css` (a `MOBILE HUD v2` section, appended),
`src/ui/HUD.js` (`collapseDockAfterBuild`), `src/scenes/GameScene.js` (calls it
after a completed build).

### What was actually wrong

| Symptom | Cause |
| ------- | ----- |
| Cards 150 px wide, sheet 270 px tall | `flex: 1 1 0` — five cards shared the whole width |
| Category menu covered the battlefield | `.dock-tabs` was a full-width row inside the sheet |
| START WAVE overlapped pause / mute / speed | `.hud-panel` carries `filter: drop-shadow(...)`. A filter makes a box a **containing block for `position: fixed` children**, and the phone rail parks START WAVE as a fixed thumb button — so it anchored to the 44 px bar (rect `y = -7`) instead of the screen. The tutorial's "HUD steps back" dim had a `saturate()` filter too, so it happened during every opening line |
| Two dozen boxes hung off the bottom edge | the folded sheet hid by translation, but the strip kept its 386 px layout |
| `spill: 4` on the rail | 34 px icon buttons kept their content padding |
| Narration text ran under the card edge ("Keeper Phone! You came u") | `grid-template-columns: auto 1fr` — `1fr` never shrinks below min-content |

### What it is now

* **Cards 64 × 62, one swiped row** (`overflow-x: auto`, `touch-action: pan-x`,
  `overscroll-behavior-x: contain`): the strip scrolls without dragging the map,
  and the page never rubber-bands.
* **Sheet capped at `calc(var(--hud-build-h) + 72px)` = 118 px** — head + one
  card row + frame, measured, no overflow. Folded it is the 46 px BUILD button.
* **Categories are a 172 px dropdown** that hangs above its own button (34 px
  rows, closes on pick through the existing `setFamilyMenuOpen(false)`).
* **The sheet folds itself after a build** (`collapseDockAfterBuild`).
* **No `filter` on the mobile rail**, and the tutorial dim is opacity-only — so
  fixed children anchor to the screen again. This is the root fix, not a
  z-index patch.
* **Rail at ≤760 px:** wave badge 34 px with its label dropped, icon buttons
  34 px with a 44 px `::after` hit area, `.btn-sub` hidden.
* **Narration card** uses `minmax(0, 1fr)` and wraps.

### Verified (headless Chromium, `?hud=mobile` forces the shell)

| Size | clipped | spill | covered | notes |
| ---- | ------- | ----- | ------- | ----- |
| 667 × 375 | 2 | 0 | 0 | the two are the intentional 5:3 stage crop (`#game-container`, `canvas`) |
| 844 × 390 | 2 | 0 | 0 | same |
| 360 × 800 (portrait) | 0 | 0 | 0 | rotate overlay path |
| 1280 × 720 (desktop) | 2 | 0 | 0 | unchanged |
| 1920 × 1080 (desktop) | 2 | 0 | 0 | unchanged |

`tiny` counts the 34 px rail buttons (their hit area is 44 px via `::after`) —
a deliberate trade so four controls and the wave call fit inside a 44 px rail.

Battlefield share at 667 × 375: **≈ 88 % folded**, **≈ 68 % with the sheet open**
(rail + sheet + margins). The sheet auto-folds after a build and the BUILD
button is always one tap away, so the open state is a deliberate, transient
exception rather than the resting layout.

`npx vitest run` → **131 / 1711 passed**. `npm run build` → ✓.
Screenshots: `docs/ui-after/mobile/`.

**Not verified / open:** a real handset (all numbers are headless Chromium),
and the end-to-end *tap* build flow — level 1 opens with three narration lines
that hold input, and the harness places towers through the game API instead.
The sheet's auto-fold is therefore proven only for the API path.

---

## 10. Phase 4 — core game feel ("juice")

Strong for the rare events, quiet for the frequent ones. No combat number moved:
every effect here is triggered *by* a resolution the game already made.

### Changed

| File | Why |
| ---- | --- |
| `src/systems/Juice.js` **(new)** | The arithmetic behind the feedback, as pure functions: bar geometry, chip segment, damage-number classification, gold label. Testable without a canvas. |
| `src/entities/Enemy.js` | Health bar is one `Graphics` object: 6 px, rounded ends, 1 px dark rim, and it only appears on the first hit (24 full green strips hid the road). The lost share lingers as an amber **chip segment** that drains 130 ms later, so a heavy hit looks like it *took* something. |
| `src/entities/Projectile.js` | Damage numbers are classified: grey/small when armour ate the hit, gold/large when it took a real share of the target, firing-line colour otherwise. No crit roll was added — that would be a balance change. |
| `src/entities/Tower.js` | Contact shadow under every keep (same `shadow` texture the creeps use), skipped when the sheet has not streamed in. |
| `src/ui/HUD.js` | `bumpGold()` (treasury bounce) and `flashBaseHit(intensity)` (edge vignette + heart shake), both class-driven with one timer each, plus the `#damage-vignette` element. |
| `src/scenes/GameScene.js` | Wave banner sweeps + rule + portal ring; build pop + dust; upgrade ring + shine; sell burst + float; gold float on every kill; boss killing-blow slow motion; ghost reason line. |
| `src/style.css` | `.damage-vignette`, `baseHitShake`, `goldBump`, all with `prefers-reduced-motion` fallbacks. |
| `tests/battle-juice.test.js` **(new, 18 tests)** | Pins the bar arithmetic and the DOM contracts. |

### Decisions worth recording

* **"Crit" is presentation, not a dice roll.** The prompt asks for gold crits with
  hit-stop; a crit chance would change damage maths. Instead the *size of the
  number* decides: ≥12 % of the target's health or ≥40 flat reads gold and large.
  Same damage, honest emphasis.
* **No coin arc.** An arc from the corpse to the HUD counter needs the counter's
  screen position on every kill (a DOM read per event under a panned, zoomed
  camera), and it flies under the 80 px top bar on a phone. The floating `+8` and
  the counter's bounce say the same thing for one tween.
* **No hit-stop.** Slowing the scene on every heavy hit fights the 2× speed
  control and reads as a stutter. The only slow motion is the boss killing blow
  (0.4 s), guarded so two bosses dying together cannot stack into a freeze.

### Verified

`npm run build` ✓ · `npx vitest run` → **132 files / 1729 passed**.

Screenshots at **1280×768** and **1024×640** in `docs/ui-after/phase4/`:
`combat`, `baseHit`, `ghostInvalid`, `waveBanner`, `boss`, `inspector`, `battle`.
Audit at both sizes: `clipped 0`, `spill 0`, `covered 0`.

**Not verified:** the boss killing-blow slow motion and the build pop were not
captured as stills (both are sub-second); they are exercised by playing the wave
in the browser, not by an assertion.

---

## 11. Phase 5 — atmosphere and lighting

### Changed

| File | Why |
| ---- | --- |
| `src/systems/Mood.js` **(new)** | Which light a wave plays in, as a pure function: daylight → golden hour → dusk, boss wave always dusk. Also the CSS values per mood. |
| `src/scenes/GameScene.js` | `applyWaveMood()` writes three custom properties on `#battle-atmosphere` at wave start; `syncBastionPulse()` toggles `.is-critical` when the gate drops under a quarter. |
| `src/style.css` | The atmosphere layer cross-fades its background over 1.6 s; the `balanced` profile now gets the mood tint (it used to get *nothing*, so the feature only existed on the fastest device); reduced motion snaps instead of fading. |
| `src/entities/Tower.js` | Contact shadow is a `detail`-profile extra, so a phone does not pay for it. |
| `tests/mood.test.js` **(new, 11 tests)** | Pins the ramp, the boss override, and the CSS contract. |

### What is deliberately *not* tinted

The **board** keeps its own palette; only the sky wash, the low fog band and the
rim change with the mood. A full-canvas colour matrix would also recolour the
creeps, and this game's defence is colour-coded (fire, frost, lightning, venom).
Measured at 1280×768 (same tile, day → dusk): `rgb(74,128,74)` → `rgb(78,111,66)`
— the light changed, the ability to read a creep did not.

### Measured

| Layer | day | dusk |
| ----- | --- | ---- |
| top band (y = 200) | `rgba(255,244,214,0.10)` | `rgba(196,62,96,0.32)` |
| board tint | `rgba(255,246,214,0.04)` | `rgba(120,48,108,0.20)` |
| rim vignette | 0.34 | 0.52 |

### Skipped, with reasons

* **Phaser postFX bloom / colour matrix** — Phaser's WebGL post pipeline is not in
  use anywhere in this project and adding it would sit on top of every frame for
  every device. The portal, crystal and frost already glow through additive
  sprites (`fx-glow`, `fx-rune`, `BlendModes.ADD`), which is a bloom that costs
  nothing when it is off screen. Bloom stays additive-sprite-only.
* **Foliage sway / water shimmer** — every tree and rock on this board is a tile
  in one baked background texture, not individual sprites, so swaying them means
  a shader over the terrain. Skipped rather than adding a full-screen pass.
* **Rain / leaves / fog per wave** — the biome weather emitters already exist
  (`systems/Atmosphere.js`, high profile only); a second per-wave layer would
  double the emitter count for a mood the tint already carries.

`npm run build` ✓ · `npx vitest run` → **133 files / 1740 passed**.
Screenshots: `docs/ui-after/phase5/` at 1280×768 and 1024×640.

---

## 12. Phase 6 — progression, reward and onboarding

### Changed

| File | Why |
| ---- | --- |
| `src/ui/HUD.js` | `showWaveClear()`, `showEnemyCard()`, `showNudge()` — three surfaces that only read state the scene already owns. |
| `src/systems/EnemyCard.js` **(new)** | Turns one live enemy into the six lines a player can act on (hp, speed in tiles/s, armour, traits, resistance, flying/shielded). Pure, so it is testable without a scene. |
| `src/scenes/GameScene.js` | `refreshEnemyCard()`, `isDesktopPointer()`, `pointerCssPoint()`, `setBoardCursor()`, `tickOnboardingHint()` and the three per-wave counters (`waveKills`, `waveLeaks`, `waveStartedAt`). The hit test reuses `enemyAt()` from `systems/FocusTarget.js`, which already existed. |
| `src/style.css` | `.wave-clear`, `.enemy-card`, the three `is-*-cursor` classes on `#game-container`. |
| `tests/enemy-card.test.js` **(new, 16 tests)** | The card's lines, its boss/flying/shielded flags and the round-trip from `enemy.stats`. |

### The wave-clear card

Prints `WAVE n CLEARED`, `FLAWLESS` when nothing leaked, then
`14 slain · 0 leaked · 51s · +46 gold`. 2.6 s, above the dock, never over the
wave call. Verified in the browser (`docs/ui-after/phase6/waveClear-1280x768.png`).

### The creep card

`enemyCard(enemy, tileSize)` → `{ name, hp, max, pct, boss, speed, armour, traits,
resistance, flying, shielded }`. Speed is reported in **tiles/s**, which is what
the player can compare between two creeps; the raw px/s is in the stat block and
means nothing on screen. Cursor states: `is-build-cursor` on a legal tile,
`is-invalid-cursor` on an enemy zone or a path, `is-inspect-cursor` otherwise.

### Onboarding nudges

`tickOnboardingHint()` runs on a 4 s cadence and speaks only when the player has
been idle for 20 s with no keeps placed (or 30 s with an affordable upgrade
waiting). 45 s per key, 30 s global, silent under `body.modal-open`, during the
tutorial hold and after game over.

### Verified

`npm run build` ✓ 8.37 s · `npx vitest run` → **134 files / 1756 passed**.
Shots: `docs/ui-after/phase6/` (`waveClear-`, `enemyCard-`, `rail-prep-`,
`rail-combat-` at 1280×768 and 1024×640, plus the 667×375 phone rail).

---

## 13. The top rail (after Phase 6)

The request: the card/panel behind every top-HUD icon goes, replaced by a black
fade like the realm header and display type.

### What is on the strip now

| Element | Before | Now |
| ------- | ------ | --- |
| the bar | 9-slice sprite frame + drop shadow | `::before` masked black gradient, no frame |
| BASE / GOLD / SCORE | three engraved slots | 10 px Cinzel kicker over a 17 px cream value |
| wave pill | framed slot | type + a gold meter rule |
| START WAVE | gold 9-slice plate | 17 px gold display type + breathing underline |
| speed / pause / mute / fullscreen | four dark chips with a border | four glyphs, one 44 px box each, one divider |
| level name | bordered pill | plain gold-dim caption |

No element in the strip draws a card, a chip or a radius any more. Only paint
was removed: every hit box, id, handler and hotkey is untouched.

### Why the fade is a pseudo-element

`z-index: -1` inside the bar's own stacking context puts it behind every child
and above the board, so it can bleed past the bar's box (`inset: … -26px -22px`)
and dissolve horizontally through `mask-image` without fading the two controls at
the ends with it. A background on the bar itself would be clipped to the bar.

### Verified

`npm run build` ✓ 6.85 s · `npx vitest run` → **135 files / 1762 passed**
(`tests/hud-rail.test.js` pins the six negative rules so a later style pass
cannot quietly put a plate back).
Shots: `docs/ui-after/phase6/rail-*.png`.

---

## 14. Phase 7 — audio and settings

### Changed

| File | Why |
| ---- | --- |
| `src/config/uxSettings.js` **(new)** | The three field switches, persisted in the shared settings record, painted on `<html>` as `data-ux-*`. |
| `src/ui/SettingsUI.js` | FIELD section with SCREEN SHAKE / DAMAGE NUMBERS / COLOUR ASSIST as `role="switch"` rows; a scrollable body with the actions pinned; the panel repaints when anything else moves a switch. |
| `src/ui/HUD.js` | RESTART (two-tap arm) and SETTINGS in the pause card, plus `#restart-warning`. |
| `src/scenes/GameScene.js` | `shakeCamera()` (one gate for all eight camera shakes), `tickLowHealthAlarm()`, `handleRestartBattle()`, and — the fix below — the missing `tickOnboardingHint()` call. |
| `src/entities/Projectile.js` | Damage numbers respect the switch; explosion and impact cues pan. |
| `src/entities/Enemy.js` | Health bar follows the colour-vision palette. |
| `src/entities/Tower.js` | Firing cue pans by the tower's screen position. |
| `src/rendering/AudioSynth.js` | `#gain(v, pan)`, `#jitter()`, `panFor()`, `playLowHealth()`; `#persist()` keeps the record's other fields. |
| `src/rendering/AudioSamples.js` | `play(id, { pan, jitter })`, with the panner disconnected on `ended`. |
| `src/systems/Vfx.js` | Its 70 ms impact shake goes through the scene's gate. |
| `src/systems/Juice.js` | `hpBarColor(pct, { colourAssist })`. |
| `src/main.js` | `gameFlow.restartBattle()`, `window.gameUx`. |
| `src/style.css` | Switch rows, the armed RESTART state, the colour-vision variables, and the panel's scroll body. |
| `tests/ux-settings.test.js` **(new, 8 tests)** | Defaults, persistence, no-op sets, the painted attributes, and the mixer-vs-panel record ownership. |

### Bug found while working (and fixed)

* **The Phase-6 onboarding nudges never ran.** `tickOnboardingHint()` was
  written, tested and documented, but nothing called it — the method sat next to
  `openWave()` and `stepSimulation()` never invoked it. It is now called on the
  simulation clock beside `tickWavePrep()` and the new alarm tick. This is
  exactly the "a handler is not a feature" failure the brief warns about; the
  fix is one line and the feature is now audible/visible in play.
* **`ui-harness.mjs`'s `settings` state called a getter.** `SettingsUI.open` is
  a boolean getter, not a method, so the old `open?.()` threw and the state had
  silently been taking the fallback path. It calls `show()` now.

### Verified in the browser (not just in jsdom)

| Check | Result |
| ----- | ------ |
| Pause card, 7 actions, 1280×768 / 1024×640 / 667×375 | all 7 fit, no clipping (`docs/ui-after/phase7/pause-*`) |
| RESTART arm → act | first click arms + shows the warning, second restarts the launched run, scene active, unpaused, no page errors |
| SCREEN SHAKE off | `data-ux-shake="off"`, `localStorage …ux.shake=false`, `shakeCamera()` leaves `shakeEffect.isRunning` false; back on → true |
| COLOUR ASSIST on | `--hp-good` flips `#5cf2a6` → `#56b4e9`; the switch repaints to on |
| Settings at 1280×768 | fits without scrolling (client 687 px = scroll 687 px); at 1024×640 the body scrolls with CLOSE always visible |

`npm run build` ✓ 6.66 s · `npx vitest run` → **136 files / 1770 passed**.
Screenshots: `docs/ui-after/phase7/`.

### Skipped, with reasons

* **A separate boss music layer** — the recorded `intense`/`boss` tracks and
  the oscillator bed already crossfade between the same states, and both are
  driven by `audioDirector.sync()`. Adding a third layer would double-play the
  same harmony; the audit is recorded in §3 instead.
* **Per-tower pan on every cue** — only the three cues that fire at combat rate
  (fire, impact, death) carry a pan. A UI click has no position, and panning it
  would be a lie about where it happened.

---

## 15. The tutorial spotlight (requested after Phase 7)

> "mag fifade na black yung screen then i hahighlight lang yung button na
> kailangan then ituturo ng parang kamay … dapat may spritesheet din dyan"

### What was there

`.is-tutorial-target` painted a pulsing gold outline and a gold `drop-shadow`.
Two problems, and the request names both: the game's whole interface is gold, so
"the glowing one" is not a direction; and a glow lights up the control's
neighbours, which is the opposite of pointing at one thing.

### What replaced it

| Piece | How it works |
| ----- | ------------ |
| The fade | `box-shadow: 0 0 0 100vmax` on a transparent box. The shadow is the veil, the box is the hole — one element, no mask to keep in sync. |
| The hole | Follows the marked control on a 220 ms sampler, so it lands correctly when the inspector opens, the dock unfolds or the window resizes. It refuses to open on a 0 px rect (that is what keeps it down while the upgrade step waits for the player to tap the tower). |
| The edge | Two rings: 2 px gold, 1 px dark inside it. Enough to read on grass, slate and dock; not a glow, because the *step* is special, not the button. |
| The hand | `public/assets/ui-kit/hand_point.png` — 6 frames × 96 px, drawn by `scripts/build_ui_kit.py` (`hand_point()`), the same deterministic Pillow pipeline as every other sprite in the kit. No third-party art, no new dependency. |
| The animation | `background-position` stepped with `animation-timing-function: steps(6)` over 1.2 s. Only a sprite sheet scrolled by CSS, so no JS per frame and nothing to clean up. |
| The pose | Below the control when there is room (wrist off the bottom edge, finger on the button), above it pointing down when the control sits near the bottom (the dock), and beside it turned 90° when the opening's own objective card is in the way (the wave button). |

### Decisions worth recording

* **The veil lives inside `#app`, at `z-index: 150`.** `#app` is its own stacking
  context, so a body-level veil painted over the opening's dialogue and
  objective cards — the sentence explaining the step went dark with the board.
  Inside `#app` it dims the board and the HUD (100) and stays under the tutorial
  card (200), the screens (250) and the modals (300).
* **The mark class is now a marker, not a look.** The same `.is-tutorial-target`
  decides which element the hole is cut around; it paints nothing. Every test
  that asserts *which* control is marked still means what it meant.
* **A phone points at the BUILD button while the forge is folded.** The card the
  step names is not on screen until the sheet is open, so `applyTutorialHint()`
  falls back to `#btn-toggle-dock`, and `setDockCollapsed()` repaints the hint so
  the mark moves to the card the moment it can be seen.
* **A step's pointer dies with the step.** `tutorialOnBeat()` now clears the
  target on any non-step beat; before this, the hand kept pointing at a card the
  player had already used while the villagers talked about the tower.
* **Copy follows the art.** "Tap the glowing card…" became "Tap the card the
  hand is pointing at…", because there is no glow any more.

### Verified in the browser

Driven through the real opening (`startLevel('tutorial')`), not a fixture:

| Step | Target | Result |
| ---- | ------ | ------ |
| 1 · place | dock card ARCHER | hole 92×84 on the card, hand above it pointing down, `is-on` |
| 1b · phone | folded BUILD button | same, at 667×375 |
| 2 · upgrade | `#btn-upgrade-tower` | the veil stays **down** until the tower is selected, then opens on the UPGRADE card |
| 3 · wave | `#start-wave` | hand turned 90° beside the objective card, fingertip on the button's right edge |
| end | — | veil off, hand hidden, no page errors |

`npm run build` ✓ 6.39 s · `npx vitest run` → **136 files / 1774 passed**
(`tests/ui-kit.test.js` pins the sheet's 6×96 geometry and the CSS frame maths;
`tests/hud-dom.test.js` pins the veil's home, its "no hole, no veil" rule and
that it comes up when the inspector finally opens).

Screenshots: `docs/ui-after/tutorial-spotlight/`.

---

## 16. Request 62 — the bands, the letterbox, and the first battle

> "masyadong matingkad yung kulay ng black, parang yung opacity lang is dapat
> nasa 15 % … dapat hindi straight yung edges nya sa ilalim, parang random edge
> like parang papel na natupi … wag masyadong makapal yung width … sa battlefield
> na ako tapos yung portal natin and base ay hindi nakikita i mean yung assets,
> then mag baback sya and babalik sa main menu"

### The bands

| Piece | Before | Now |
| ----- | ------ | --- |
| Top rail | 9-slice frame + a ~110 px black gradient, hard bottom edge | one `rgba(0,0,0,0.15)` band, 73 px at 1280×768, torn along its bottom edge |
| Forge dock | engraved glass plate, `backdrop-filter`, border, shadow | no plate at all — cards straight on the battlefield, backed by a 15 % band |
| The tear | — | `public/assets/ui-kit/band-tear-{bottom,top}.png`, 1024×64 alpha masks from `scripts/build_hud_bands.py` (seed 20251029, three deliberate straight fold creases) |

The masks are stretched to the band (`mask-size: 100% 100%`), so the rip reads at
any width. The dock's band is **two** boxes: `::before` is exactly the mask's own
64 px (the torn strip above the cards) and `::after` carries the tint from the
dock's top down past the screen edge. One box was tried first and the math is
what killed it — stretched over the dock's 114 px the rip started 72 px down,
under the cards, where nobody could see it.

### The bug under it: the letterbox plate never painted

Everything the bands sat on was flat navy, which is what made 15 % black read as
"too vivid". The plate behind the letterbox was `body::before` — a fixed,
oversized pseudo-element with `filter: blur(20px) …`. Measured in the real
build:

| State | Pixel at (640, 10) |
| ----- | ------------------ |
| filter left alone | plate visible |
| after the graphics profile rewrote that filter (every battle start) | nothing painted |
| after a fullscreen toggle / an `inset` write | nothing painted, and it stays that way |
| background overridden to magenta | magenta paints — the box is there, the raster is not |

Chromium loses that layer's raster on the first invalidation. A dedicated
`#stage-backdrop` div was tried next and lost it the same way (its background
went blank the moment it was rewritten). What works is the **app's own
background**: `#app` carries the plate, written once by the stylesheet and never
rewritten at runtime.

So the blur is baked instead of composited: `scripts/build_arena_plate.py` tiles
`assets/tiles/grass.png`, adds periodic light and shade (whole cycles, so the
tile is seamless), blurs it with wrap and writes a 512×512
`public/assets/ui-kit/arena-plate.png`. The browser draws one repeated texture —
no `filter`, no per-frame composite on the profile most laptops land on, and
nothing to invalidate. The `performance` profile and the fullscreen toggle no
longer rewrite that background; fullscreen already darkens the frame with the
inset vignette on `#app::after`.

### The first battle: missing arena art, and the bounce

* `src/systems/ArenaArt.js` is the one list of arena landmarks and their texture
  keys (`portal-arch`, `bastion-fortress`, `river-flow`, `portal-vortex`) plus
  `hasArenaArt` / `missingArenaArt` / `queueArenaArt` / `createArenaAnims`.
* `BootScene` used to be the only place that loaded them, so a battle opened
  before boot finished had no portal and no keep. `GameScene.preload` now queues
  whatever is still missing, `create` tracks the sprites it will need, and
  `repairArenaArt` re-applies the texture when the load lands — a first battle is
  never left with invisible landmarks, and no page reload is needed.
* `MenuScene` refuses to reveal the menu over a live battle (status
  2–6 — starting/loading/creating/running/paused), `src/main.js` holds the menu
  behind `boot-complete` (`revealMainMenu` waits for boot, and stands down
  entirely if a battle is live), and `startLevelNow` is the only path into a
  level.

### Deliberate decisions

* **15 % black and nothing else.** No gradient, no blur, no border, no shadow on
  either band. `tests/hud-rail.test.js` pins the value and the mask.
* **The dock stays `position: absolute`.** Making it `relative` (to host the
  band) moved the whole row; the band lives on its pseudos instead.
* **The plate may be darker than the board, never a different colour.** Plate
  average (53, 107, 56) against the board's (72, 136, 70). A brightness step at
  the canvas edge is a straight line you can see, which is exactly what the torn
  band exists to avoid.
* **No `filter` on anything full-screen.** Two separate layers proved it.

### Verified in the browser

`/tmp/f-1280.png`, `/tmp/f-1024.png`, `/tmp/f-844.png` (desktop 1280×768, desktop
1024×640, phone shell 844×390), driven through the real level:

| Check | Result |
| ----- | ------ |
| Plate at (20, 5) / (20, 700) | (64, 94, 57) / (40, 79, 43) — grass, not navy |
| Plate after a 1280→1024→1280 resize | still grass |
| Plate after `body.is-fullscreen` on/off | darker in fullscreen, back to grass after |
| Menu | unchanged (opaque key art) |
| Layout harness | `clipped=0 spill=0 covered=0 tiny=4` |
| Prod arena art (`dbgprod.mjs`, `slow 9000`) | menu at 7770 ms, `bounced:false`, 40/40 requests ok |

`npm run build` ✓ 6.38 s · `npx vitest run` → **138 files / 1788 passed**
(`tests/arena-art.test.js`, `tests/menu-battle-guard.test.js`, and the rewritten
first case in `tests/hud-rail.test.js`).

---

## 17. Request 63 — the hand that walks the player through the first two steps

> "dapat yung kamay na nagtuturo is nag shishrink and lumalaki then kapag naka
> tap na ng defense ay ituturo naman sa spot ng lalapagan ng defense then pag
> tapos ay ituturo naman sa icon na upgrade ng tower para full guided talaga"

### What was wrong

A step was one target, and only the first one. `step-place` pointed the hand at
the shelf card and left it there: after the card was tapped the hand kept
pointing at the card the player had already used, and the meadow it was meant to
go on was only ringed. `step-upgrade` asked for the UPGRADE button before the
tower that opens it had been tapped, so for the whole first half of the step
there was nothing to point at and the veil stayed down — the one moment the
player could get lost was the one moment the hand had nothing to say.

### What it does now

| Moment | Where the hand points |
| ------ | -------------------- |
| `step-place`, nothing armed | the ARCHER card on the dock |
| `step-place`, card tapped | **the marked meadow cell** — the same tile the ring labels "RAISE IT HERE" |
| tower placed, `step-upgrade` | **the tower that was just raised**, whichever tile it went on |
| tower tapped | the UPGRADE card in the inspector |
| `step-wave` | START WAVE (unchanged) |

Two new pieces under that:

* **`refreshTutorialPointer()`** in `GameScene` is the one place that decides the
  target, and it runs again when the forge arms (`handleSelectBuild`), when a
  tower is picked up or put down (`selectTower` / `handleDeselectTower`) and when
  a step opens (`setTutorialTarget`).
* **`{ spot: () => rect }`** in the HUD. A board cell is not an element, so the
  scene hands over a getter and the 220 ms sampler asks again on every tick:
  `worldToClient()` → `cellScreenRect()` turn the tile into CSS pixels through
  the canvas rect and the camera rig, so the hole follows the cell through a pan
  or a zoom. A cell that is off screen returns `null` and the veil goes down
  rather than pinning a hole to the window edge.

**The pulse.** `.tut-hand` now runs two loops on the same 1.2 s clock:
`tutHandTap` (the six-frame sheet, as before) and `tutHandPulse` (scale
1 → 1.15 → 1). It animates the `scale` property, not `transform`, because the
poses (`is-flipped`, `is-side`) own `transform` — an animation that took it
would undo the mirror mid-tap. Measured live: scale 1.00 → 1.15 across the beat,
`background-position` still stepping −50 px per frame.

### A bug this exposed, fixed

`tutorialReport('place')` put the forge down by calling the *scene's*
`handleSelectBuild(null)`, which never told the HUD. For the whole upgrade step
the ARCHER card stayed lit and the "PLACING BALLISTA TOWER — click a grass tile
· ESC to cancel" pill stayed on screen, telling the player to do the thing they
had just done. It now goes through `HUD.clearBuildSelection(true)` as well.

### Verified in the browser (real opening, real buttons)

Driven through `startLevel('tutorial')` at 1280×768 and at 844×390 (phone
shell); screenshot after every press:

| Step | Target | Hole | Hand |
| ---- | ------ | ---- | ---- |
| place | `card-archer` | 92×84 on the card | above it, pointing down |
| card tapped | board cell 12,7 | 56×56 on the tile | below it, pointing up |
| placed | — (line beat) | veil down | hidden |
| upgrade opens | the raised tower | 56×56 on the tower | below it, pointing up |
| tower tapped | `btn-upgrade-tower` | 262×124 in the inspector | below it, pointing up |

No page errors in either run. `prefers-reduced-motion: reduce` turns both loops
off (the hand still points, it just stops moving).

`npx vitest run` → **138 files / 1790 passed** · `npm run build` ✓ 6.40 s
(`tests/hud-dom.test.js` pins the board-spot hint — placement, following, and
the off-screen guard; `tests/ui-kit.test.js` pins the two animations and that
the poses keep `transform`).

Screenshots: `/tmp/tf-1-place.png` … `/tmp/tf-5-selected.png`, `/tmp/tfm-*`.

## 18. Request 64 — the frame around the battlefield is gone

> *"bakit parang may blur sa likod? parang horizontal straight line pati sa
> ilalim and sa gilid, dapat wala yan e, para syang may frame, ang pangit
> tignan, i remove mo yan"*

### What the frame actually was

Not a border that somebody drew — the **camera band** showing through to the
page.

`battleFrame` gives the camera the rectangle between the top rail and the forge
("the battlefield draws here"), because a board fitted to the whole canvas put
the bastion's own row behind the dock. The camera therefore paints *only* inside
that band, and everything outside it is transparent canvas — the page behind,
which in a battle was `#app`'s backdrop: the out-of-focus grass plate from
request 62.

Measured at 1536×864, on the pixel column where the board's grass sits:

| y | what was there | colour |
| - | -------------- | ------ |
| 0 – 81 | the page (blurred plate + 15 % band) | `(41,84,43)` flat |
| 82 – 780 | the camera band | `(59,119,62)` … textured |
| 780 – 864 | the forge dock | — |

So the "blur behind" and the "straight line" were the same thing: a flat,
out-of-focus green running to a razor edge where the crisp field began. Both
horizontal edges were that seam, and the vertical ones were the same seam on the
left and right whenever the window was wide enough that the fit zoom left side
gutters (1920×800 leaves ~76 px each side).

Two separate causes, two separate fixes.

### 1. The letterbox is field, not page — `drawFieldApron`

The arena is now set *in* a field instead of laid on a table: one `TileSprite`
of the biome's own ground, three tiles deep on every side, at depth 0.5 (under
the 64 px ground tiles), plus the same sparse props the board scatters (7 % a
tree, then 35 % a tuft — the same hashes and the same jitter). Its cells never
touch the board's own, so nothing is dressed twice.

Three tiles is not a guess: at fit zoom the margin is `(band − board) / 2`, and
the widest case (a short, wide window) leaves ~3 tiles of side gutter. The
apron is static — one draw object and ~120 sprites, no per-frame cost.

### 2. The strip the camera cannot paint — `publishFieldScale`

Above the band nothing in the canvas can ever help, so the *page* has to be
told what belongs there. The scene now publishes two custom properties on boot,
on every re-frame and whenever the zoom settles:

* `--battle-ground` — the biome's own ground tile (`grass-desert.png` on the
  mesa, `grass.png` in Havenbrook);
* `--field-tile` — the size one tile has on screen right now:
  `64 world px × camera zoom × canvas CSS scale` (40 px at 1280×768, 48 px at
  1536×864).

`body.is-battle #app` repeats that tile at that size. Crisp grass now meets
crisp grass at the same scale, so there is no wash and no edge — and because the
ground is read from the level's theme, the strip is sand on Sunscorch Mesa and
ice at Frostbite Hollow instead of always being grassland (verified on
`level-2`).

The plate itself is untouched: the menu still sits on it. `is-battle` is added
with the camera rig and removed on scene shutdown.

### Verified

| Check | Result |
| ----- | ------ |
| 1536×864, `level-1` | strip above the band is the board's grass; no seam under the rail |
| 1280×768, `level-1` | same; the field runs under the rail and the dock |
| 1024×640, `level-1` | same; the page letterbox above/below the stage is field too |
| 1920×800, `level-1` | side gutters are apron grass, not a blurred band |
| 844×390 (phone shell) | same |
| 1280×768, `level-2` (desert) | strip is sand + cacti, not green |
| menu → battle → world map | `is-battle` on, `--field-tile` 40 → 64 px after a 1.6× zoom, off again on exit; `#app` back to the plate |
| tutorial gate, natural run | `line:mara-3` → `line:doren-3` → finished, `ERRS []` |

`npx vitest run` → **139 files / 1797 passed** · `npm run build` ✓ 6.65 s
(`tests/field-apron.test.js` pins the apron's size, depth and that it never
dresses a board cell, plus the published tile size and biome path).

Screenshots: `/tmp/r64-d.png` (1536), `/tmp/r64-1280.png`, `/tmp/r64-1024.png`,
`/tmp/r64-1920.png`, `/tmp/r64-mobile.png`, `/tmp/r64-desert.png`.

## 19. Request 65 — the ribbon that would not stay in its box

> *"sa ui naman sa mobile device natin tignan mo yung text na not recruited is
> hindi na nakikita and lumalagpas, same sa lahat, paki fix ito"*

### What was wrong

The state ribbon (`NOT RECRUITED`, `LV 3`, `RANK 1 / 3`) was a child of the
portrait, absolutely positioned and centred on it:

```css
.pet-level-badge { position:absolute; left:50%; transform:translateX(-50%); }
```

At 9 px with 1 px of tracking, "NOT RECRUITED" is **107 px of text**. The
portrait on a phone is **52 px** and on a desktop card **104 px**, so the ribbon
hung out over both sides of the art and printed straight through the
companion's name beside it. Nothing clipped it — the box it was centred on was
simply narrower than the words, which is why it read as "overflowing" at every
size, not just mobile ("same sa lahat").

Measured before, at 844×390: panel `{311,83,482,212}`, portrait `{320,89,52,52}`,
badge `107×16` — **28 px out on each side**, name `{380,112,346,21}` underneath
it.

### The fix

The ribbon is no longer a child of the art. It moved into the title block, and
the art's column width is handed down as `--pet-portrait` so the desktop layout
can still lay it back over the art:

* desktop — `position:absolute; left:calc(var(--pet-portrait)/2); bottom:2px`
  inside `.pets-detail-title`'s column: pixel-identical to before (badge
  `{492,319,107,16}` over portrait `{493,233,104,104}` at 1280×768);
* compact (`≤900 px` wide or `≤560 px` tall) — `position:static` as the header's
  **third row** (`grid-area:3/1/4/-1`), 8 px with `0.8 px` tracking, a 52 px
  portrait beside it: 107 px of text in 232 px of row, inside the panel, below
  the name.

Same component, same wording, in the RECRUIT, UPGRADE and VANGUARD details.

### The stat labels under it

With the header settled, the 614×350 case showed the four stat labels clipped
(`DAMA…`, `COOL…`, `COOLO…`). Eliding them is not a fix — the columns have to
actually get wider:

* compact `.pets-detail-grid` split `1.5fr / 1fr` (was an even split) so the
  stat side gets the extra 20 px;
* `.pet-stat` padding `2px 2px`, label `7px` with no tracking, skill name
  `0.4 px` tracking;
* `.pet-stat-label` may now clip rather than spill (`min-width:0;
  max-width:100%; overflow:hidden; text-overflow:ellipsis`).

At 614×350 every label measures `clientW 35` against real ink widths of
DAMAGE 24 / SLOW 17 / COOLDOWN 33 / REACH 19 — all four whole, values `40 35%
8s 120` on one line, `SHIELD BASH` on one line. A 2×2 stat grid at ≤700 px was
tried and **reverted**: it stranded the SKILL box below the stats.

### Verified

| Check | Result |
| ----- | ------ |
| 844×390, locked, RECRUIT | `NOT RECRUITED` static, 8 px, `clippedByPanel:false`, `inTitle:true` |
| 844×390, owned, RECRUIT | `LV 3` same treatment |
| 844×390, owned, VANGUARD | `RANK 1 / 3` same treatment |
| 614×350, locked, RECRUIT | `NOT RECRUITED` inside a 232 px row; labels whole |
| 1280×768, locked, RECRUIT | `NOT RECRUITED` absolute 9 px over the portrait column, unchanged |

`npx vitest run` → **140 files / 1803 passed** · `npm run build` ✓ 6.52 s
(`tests/muster-hall.test.js` pins the ribbon to the title block in both detail
views, the portrait width it is told about, the three states, and the labels).

Screenshots: `/tmp/muster-844.png` (before), `/tmp/m-844f.png`,
`/tmp/m-vang.png`, `/tmp/m-614e.png`, `/tmp/m-desk2.png`.

## 20. Request 66 — the frame was the page, and the flicker was an entrance

> *"parang may frame talaga na nakapalibot sa mapa natin, i mean pag nasa
> battlefield na, parang grass yung frame and parang blurry sya, so hindi
> nakikita yung buong mapa, try mo i zoom ng malapitan, mapapansin mo na parang
> may frame sa paligid ng mapa, tanggalin mo yan!!!!!!!!!!! tapos check mo sa
> muster hall natin kapag nag tatap ako ng mga pets doon like nag swiwitch ay
> biglang may fliflicker na background na parang kulay itim, dapat wala ding
> ganon, check mo sa iba baka may ganon din hindi lang sa muster hall"*
>
> (earlier in the same turn, with a crop of the phone's battlefield corner:
> *"tignan mo sa mobile yung parang itim natin kanina na background, naputol, ang
> gawin mo tanggalin mo na lang yan, sa taas na lang itira mo, mabilisang fix"*)

### Why there was a frame at all

Request 64 matched the page's grass to the board's grass. It matched the
*colour*; it did not match the picture:

| | the board (canvas) | the page strip |
| - | ------------------ | -------------- |
| art | three ground variants, roads, props, decor | one tile, repeated |
| scaling | nearest-neighbour (`pixelArt: true`) | **bilinear** — the browser was smoothing a 64 px tile down to 40 px |
| alignment | the board's own tile grid | wherever the element's box happened to start |
| extent | the apron, 3 tiles | everywhere outside the stage |

A soft, unbounded, differently-aligned copy of the grass around a crisp board is
a frame — and it is the *blurry grass* the request is about. Three things
followed from that:

1. **the strip is drawn like the board** — `image-rendering: pixelated`, and its
   phase published from the scene (`--field-x`, `--field-y`), so the page's tile
   grid is the board's tile grid. It follows a pan (`syncFieldPhase`, once per
   frame, no style write unless the camera really moved);
2. **the camera band starts at the top of the canvas** — it used to start under
   the top rail, which is what left a strip of page *inside* the stage in the
   first place. The rail's torn 15 % band separates the readings from the field
   now; the field runs under it. The forge still keeps the board's last row;
3. **the apron is 5 tiles deep** — at the campaign's 0.625× fit zoom a 768 px
   canvas looks at 1229 world px for a 768 px board, so 3 tiles (192 px) did not
   reach the edge of the view at 1920×800 or 1536×864. 5 tiles (320 px) covers
   every case the camera can produce, and it is never seen when zoomed in;
4. **the atmosphere covers the page too** — `#battle-atmosphere` was sized to
   the stage, so it began at the canvas' top edge, where its daylight wash is
   strongest. A 1024×640 window letterboxes 13 px, and the page strip above the
   canvas met a lit canvas in a hard horizontal step (measured: page mean
   G 102 vs canvas 123 at the seam). In a battle the layer fills `#app` now, so
   the page and the canvas get the same light and the only edge left on screen
   is the rail's torn band.

A phone also lost its 16 px column of page down each side: the 1.25 × 5/3 stage
cap is lifted in the compact query (`--stage-width: 100vw`), so the canvas is
full-bleed there. Desktop keeps its cap.

### The black band the user cropped

The forge's `::before`/`::after` (request 62's torn strip and its solid half) are
`width: 100vw`, centred on the dock. That only makes a band while the dock spans
the stage; **folded it is a 95 px BUILD chip**, and 100 vw measured from that
chip's centre spilled a dark rectangle from the left edge to the middle of the
field, ending in a straight vertical cut — exactly the crop in the request. The
dock now paints nothing, open or folded: the cards carry their own frames, and
the rail's band at the top is the only band left on screen.

### The flicker

Every overlay screen re-renders itself by re-mounting its root
(`mountScreen`), and `.overlay-screen` animates `opacity` from 0
(`screenIn`). So tapping a companion in the Muster Hall — or a tab, a relic in
the Forge, a claim in Achievements — dropped the whole screen to transparent for
220 ms and let the dark menu behind it flash through. Measured before: the
Muster Hall's opacity fell to **0.00** on every switch.

`mountScreen` now marks a node `no-enter` when it replaces one that is still
mounted, and `.overlay-screen.no-enter { animation: none }`. Opening a screen is
still an entrance — the id is not remembered past the unmount.

### Verified

| Check | Result |
| ----- | ------ |
| 1280×768 fit / 1.6× / 2.6× / corner pan | field to all four edges, no seam, no band above the field or under the dock |
| 1024×640 | same; the 13 px letterbox is field, not plate |
| 844×390 phone | full-bleed canvas, no column of page; dock folded *and* open paint no band |
| 1920×800 | side bands are the same pixelated grass; no luminance step at the canvas edge |
| `level-2` (Sunscorch Mesa) | strip is the mesa's sand, not grass |
| tutorial gate, real buttons | place → upgrade → wave, `ERRS []` |
| Muster Hall, 12 switch samples | overlay opacity **1.00 at every frame** |
| Forge / Blessings / Achievements / Leaderboard / world map / Codex | no drop below 1.00 while re-rendering (only *opening* a screen animates) |

`npx vitest run` → **141 files / 1817 passed** · `npm run build` ✓ 7.80 s
(`tests/field-frame.test.js` pins the band's new top, the dock's missing band,
the strip's `pixelated` + phase, the full-bleed stage, the atmosphere's new box
and the `no-enter` contract; `tests/field-apron.test.js` grew to 5 tiles, the
published phase and the pan guard).

Screenshots: `/tmp/field-fit.png` (before), `/tmp/f66-1280-fit.png`,
`/tmp/f66-1280-zoom.png`, `/tmp/f66-1280-corner.png`, `/tmp/f66-844.png`,
`/tmp/f66-844-dock.png`, `/tmp/f66-1024.png`, `/tmp/f66-desert.png`.

## 10. The opening only lets you press what it points at (Request 70)

**The bug.** The spotlight drew a dim screen with one lit hole and a hand, but the
dim was *decoration*: every control underneath was still live. A new player could
press START WAVE before the village had finished explaining which card to raise
(the wave then started, the director's "already performed" memory retired the
lesson, and the opening was skipped), pick a different forge card, build on any
tile, or open the forge mid-sentence.

**The fix** is the input side of that same drawing — `systems/TutorialGate.js`
(pure geometry + key table) plus two DOM layers in the HUD:

* `HUD#setTutorialLock(true)` mounts a shield in `#app` at **z-index 190**:
  a transparent box over *every pixel outside the hole*. The hole is the same
  box the veil cuts (the pointed control, + 8 px), so the answer is the only
  pressable thing while a step waits, and the whole screen is closed while a
  line is up — except the dialogue card, which is at 200 and is how a line is
  advanced.
* Two deliberate valves: **pause** (always, and the pause card is live while it
  is open, so RESUME / SETTINGS / LEAVE BATTLE work) and **Escape** on a step,
  which puts the card down instead of skipping the lesson.
* The keyboard obeys the same rule: `GameScene#handleTutorialKey` runs while
  `tutorialGateOn`, so only `Space` on the wave step and the pointed card's own
  hotkey (1) do anything. Enter/Space on a focused HUD button is swallowed.
* A miss flashes the hole rather than doing nothing, and the shield re-samples
  every 400 ms (plus on resize, dock fold, inspector open) so the hole follows
  the control through a phone rotation.
* Everything tears down on wave-call, `endTutorialScene`, or leaving the battle
  (`clearTutorialOverlay` also removes a stranded shield).

**Verified in a real browser** (`pw/tutorialgate.mjs`, real presses, 1280×768
and 1024×640):

| Press | Result |
| ----- | ------ |
| START WAVE during a line | `waveState` stays `idle` — blocked by the shield |
| dialogue card during a line | advances `mara-1 → doren-1` — allowed |
| PAUSE during a line | opens the card; RESUME works; the line survives |
| CANNON card on the build step | `selectedBuildKey` stays `null` |
| hotkey `2` on the build step | `selectedBuildKey` stays `null` |
| empty grass on the build step | nothing selected, nothing built |
| ARCHER card, then the marked meadow | builds `archer:1`, step retires |
| START WAVE on the upgrade step | `idle` — blocked |
| the tower, then UPGRADE | `archer:1 → archer:2` |
| START WAVE on the wave step | wave starts, lock off, gate removed (0 blockers) |

`npx vitest run` → **146 files / 1881 passed** · `npm run build` ✓
(`tests/tutorial-gate.test.js` pins the shield geometry — the boxes tile the
screen exactly minus the hole, never overlap it, and never overlap each other —
and the key table; `tests/tutorial-gate-dom.test.js` drives the real HUD and
checks the boxes, the full-screen closure during a line, the no-target release
and the Enter-key swallow.)

## 11. The hub earns its second look (Request 71)

The review of the Muster Hall grab named four things. All four were the same
complaint from different angles: the hub looked *drawn* but not *read*.

### 1. The region names were sinking into the painting

`.wm-region-label` was 13 px at `opacity: 0.86` and dyed in its region's own
accent — green on grass, gold on sand, ice blue on snow. That is camouflage, not
contrast; ASHEN CALDERA (27 %, 85 %) was also three scrims deep (vignette band,
corner vignette, credits bar) and never appeared at all.

* Each name is now `color-mix(tint 56 %, white 44 %)`: still the region's colour,
  lifted clear of the ground it sits on.
* A soft elliptical smudge fades out before its edge — shading in the terrain,
  not a plate on top of it. No border, no box (the test asserts the absence).
* A 1 px ink halo in four directions instead of a `text-stroke`: the stroke
  looked right on snow and turned every name grey on dark ground by eating half
  a stem.
* ASHEN CALDERA moved to `x: 41, y: 74` of the plate — the open burnt field
  above the two ashen banners, clear of every sprite at both test sizes.

### 2. THE BASTION reads as home, not as a thirteenth building

Its plate is now 13 px on a gold-trimmed brass bar with a diamond finial at each
end, plus a permanent pool of torchlight at its feet. It also carries
`z-index: 2`: at 1024 the wider plate reached the War Room's roof and lost — a
seat of power is not something a furnace roof gets to cover. Every other plate
stays exactly as it was, because *two* sizes of label are what make a hierarchy
legible.

### 3. Data on one side, machinery on the other

The bar was one strip: three purses, three system icons, MUSTER HALL and MAIN
MENU, all jammed right. The ledger now sits beside the realm name as a single
plated block with hairline dividers, and `.wm-tools` keeps the far edge behind a
bronze rule — `margin-right: auto` on the ledger is the whole mechanism.
Resource icons went 17 px → 22 px.

**Root cause of "tiny icons":** it was not the CSS alone. `icon_coin.png` was a
Kenney 64×64 tile carrying a 16×16 coin — 94 % transparent canvas — so at 22 px
the coin itself was painted at 5 px while the gem beside it was drawn at 18. The
asset is now a 20×20 canvas holding the same 16×16 pixels at +2+2, via
`scripts/normalize_icon_padding.py` (stdlib only, no resampling: the art pixels
are copied byte for byte). The same fix lifts the coin everywhere it is used —
HUD, prices, the Workshop.

The fullscreen key was also invisible: its SVG path had no rule at all, so it
defaulted to a black fill on a near-black plate. `.wm-icon svg` now strokes it,
and the toggle finally reports its state: `aria-pressed` was hard-coded to
`false` and now follows `fullscreenchange`, so leaving with Escape or F11 is
reflected too.

### 4. Shut roads say why, and buildings have somewhere to interrupt

* Every landmark carries a `.wm-landmark-lock` seal, painted only on
  `[data-state='locked']`. Desaturation alone is a colour-only cue and it
  disappears at the zoom where banner plates hide; the seal is a shape you can
  read from across the map. The `LOCKED` chip still spells it, and the hover now
  says `LOCKED · clear Sunscorch Mesa first · briefing`.
* `systems/HubBadges.js` (new, pure) decides what a building may announce:
  Forge → an unmaxed relic the purse can afford (`relicBoard`), Shrine → today's
  rule unplayed (`dailyRun` + `DailyStore#isWon`). Nothing else lights up; a
  timer or a decorative dot would be a lie. The pip is a worded gold plate
  (`READY`, `TODAY`), not a bare dot, and its news joins the button's
  `aria-label` so it is not hover-only information.
* The badge state is recomputed on every `refresh()`, so a relic bought in the
  Workshop clears the pip when the map comes back.

### 5. Chrome with an edge

`.wm-icon` and `.wm-rail` carry a chased 1 px bronze inner rule; the rail has
two corner brackets; `.wm-btn` still uses the kit's 9-slice. `CREDITS · PROJECT
INFO` was a 9 px, 55 % watermark — it is now a plated link with a chevron, and
the hint line went 9 px → 10 px and brighter.

### Verified

`npx vitest run` → **147 files / 1901 passed** ·
`npm run build` ✓ · `tests/hub-polish.test.js` (new, 20 tests) pins the badge
conditions against a real save, the seal/lock/aria contract, the visible "why",
the coin's tight canvas, and the declarations this pass depends on.

Real browser (`pw/wmshot.mjs`, `pw/wmprobe.mjs`, `pw/wmbadges.mjs`,
`pw/wmstates.mjs`, `pw/wmfs2.mjs`, `pw/wmforgefs.mjs`), **1280×768 and
1024×640**, plus 844×390 landscape and **fullscreen**: no horizontal overflow,
`.wm-tools` never leaves the viewport, five seals on five locked banners,
`TODAY` on the shrine, `READY` on the forge with gems, and a spent purse
clearing that badge on the next refresh.

Fullscreen, entered through the real key: `document.fullscreenElement` = `HTML`,
viewport 1280×768, brand 26–139, ledger 157–362, tools 860–1254, rail
1214–1260 × 319–449, foot 728–768, no overflow, `aria-pressed` `true`; after
`exitFullscreen` it returns to `false`.

Screenshots: `/tmp/wm-before-1280x768.png` (before), `/tmp/wm-final2-1280x768.png`,
`/tmp/wm-c7-1024x640.png`, `/tmp/wmstate-landscape-844x390.png`,
`/tmp/z-wallet.png`, `/tmp/z-pip.png`, `/tmp/z-ashen2.png`,
`/tmp/wm-fullscreen-hub.png`, `/tmp/wm-workshop-1280x768.png`.

The Workshop renders the shared coin at 30 px from the 20 px file — 24 px of
visible coin where it used to be 7.5 px — and stays proportionate to the other
relic icons.
