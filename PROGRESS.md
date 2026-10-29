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
| 2 | Tower inspector, panels and modals | ⬜ |
| 3 | Main menu and scene transitions | ⬜ |
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

## 5. Still open

* Codex at 1024×640 still overflows its own telemetry grid (pre-existing, was in
  the baseline audit) — Phase 2 rebuilds the modal shell.
* The inspector at 1024×640 is tall but contained; it is rebuilt as an anchored
  popover in Phase 2.

---

## 4. Bugs found while working

_(filled in as phases land)_

---

## 5. Still open

_(filled in as phases land)_
