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
| 1 | Bugs + layout foundation (top bar, dock, UI scale) | ⬜ |
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

_(filled in as phases land)_

---

## 4. Bugs found while working

_(filled in as phases land)_

---

## 5. Still open

_(filled in as phases land)_
