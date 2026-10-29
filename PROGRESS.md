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
| 4 | Core game feel ("juice") | ⬜ |
| 5 | Atmosphere and lighting | ⬜ |
| 6 | Progression, reward and onboarding | ⬜ |
| 7 | Audio and settings | ⬜ |
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
