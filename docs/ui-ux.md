# UI / UX Pass — Camera, HUD, Panels & Accessibility

This document records the second UI/UX pass: what was wrong, what changed, how it was verified,
and what to check by hand. It complements [technical-documentation.md](technical-documentation.md)
and [testing-report.md](testing-report.md).

---

## 1. Why this pass was needed

| Symptom | Root cause |
|---|---|
| Clicking a tile built on the *wrong* tile when the camera was zoomed or panned | Tile maths used raw canvas pixels: `Math.floor(pointer.x / TILE_SIZE)`. That is only true at zoom 1 with scroll 0. |
| No way to see the far side of the map on a phone | No pan, no zoom, no pinch. The canvas was simply scaled down. |
| The HUD covered the map and swallowed drags | Every `.hud-panel` was `pointer-events: auto`, including its transparent wooden frame. |
| Upgrading meant hunting: click tower → find button in a far-corner panel | No affordance on the tower itself; the inspector was bolted to `right: 18px; bottom: 120px`. |
| Codex hid the battlefield | It was a full-screen modal, so the “visualise BFS” button had to close it to show anything. |
| Beige text on beige wood (unreadable labels) | `--text-muted: #b0a08a` used on parchment/wood surfaces: **1.56:1**. Gold `#f5c451` on wood: **1.43:1**. |
| HUD collided with itself on 1366×768 laptops and phones | One fixed layout (`width: 1280px`), no media queries. |

---

## 2. Camera: drag, wheel zoom, pinch

New, Phaser-free modules:

- `src/camera/cameraMath.js` — world-view maths, pointer ↔ world conversion, anchored zoom,
  pan clamping, pinch resolution, smoothing.
- `src/camera/CameraRig.js` — the input-driven rig that applies those functions to
  `scene.cameras.main` and tells the HUD when the zoom changed.

### Pointer → world, done properly

Phaser centres zoom on the camera viewport, so the visible world rectangle is

```
worldView.x = scrollX + (width - width / zoom) / 2
worldView.width = width / zoom
world = worldView.x + screenX / zoom
```

That is exactly what `Camera#getWorldPoint()` returns. It was verified against a real
Phaser 3.90 `Camera` in Node (setBounds → setZoom → preRender → getWorldPoint) and the numbers
are locked into `tests/camera-math.test.js`:

| zoom | scroll | `getWorldPoint(0,0)` | `worldView` |
|---|---|---|---|
| 1 | 0 | 0,0 | 0, 0, 1280×768 |
| 2 | 0 | 320,192 | 320, 192, 640×384 |
| 2 | 320 | 640,192 | 640, 192, 640×384 |

Consequences in the scene:

- `tileAtScreen(x, y)` replaces every `pointer.x / TILE_SIZE`.
- The build ghost is recomputed whenever the camera moves, so it stays under the cursor while zooming.
- Tab actions (build / select / badge) fire on **pointerup**, and only when the press started on
  the canvas and did not pan. A drag can never build a tower; a press that began on a HUD button
  can never do it either (`CameraRig#consumeTap`).

### Controls

| Gesture | Action |
|---|---|
| Drag (any button / one finger) | Pan (6 px threshold before it counts as a drag) |
| Mouse wheel / trackpad scroll | Zoom at the cursor, smoothed, clamped 1×–3× |
| Two-finger pinch | Zoom + two-finger pan, pinned to the world point under the midpoint |
| <kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd> | Zoom in / out / fit the whole map |
| <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> | Nudge the camera |
| HUD cluster (−  100%  +  ⤢) | Same, for touch and mouse users |

The camera is bounded to the 1280×768 map, so it is impossible to drag the battlefield into the void.
Zoom buttons disable themselves at the limits and the ⤢ button stays highlighted while the whole map fits.

---

## 3. Upgrade badges above every defence

`src/ui/UpgradeBadge.js` — pure model (`badgeModel`, `badgeAnchorY`, `badgeScale`, `badgeHit`) plus a
Phaser view (`UpgradeBadges`).

- A pill floats above each tower/barricade, offset by the **art height** (`Tower#artHeight`), not the
  tile height, so tall level-3 sprites never hide it.
- `▲ 60` = linear upgrade (price shown) · `✦ 120` = branching specialisation (cheapest option).
- Gold when affordable, muted grey when not, cyan ring on the selected tower.
- Clicking a badge selects the tower and opens the inspector; the badge has priority over the tile
  behind it, so badges never act as a mis-click trap.
- Constant on-screen size at every zoom (`1 / zoom`, clamped 0.7–1.55) and culled off-screen.
- Hidden at max level, popped in on build, pulses after an upgrade.

---

## 4. Non-blocking panels

| Rule | Implementation |
|---|---|
| HUD frames are click-through | `.hud-panel { pointer-events: none }`; only real controls (stat chips, buttons, build cards, camera cluster, drawer, inspector) opt back in. |
| The inspector follows the tower | `placeInspector()` tries right → left → below → above, then clamps to the battlefield. |
| The inspector can be moved/hidden | Drag the header, collapse with ▾, close with ✕, double-click the header to re-anchor. Its content scrolls (`max-height: min(52vh, 430px)`) on short screens. |
| The codex no longer steals the map | `StatisticsPanel` is now a right-hand drawer: the battlefield stays visible and the battle keeps running. Telemetry refreshes every 900 ms while open, and “SHOW BFS PATH” toggles the overlay **without** closing the panel. |
| Modals are escapable | Backdrop click and <kbd>Esc</kbd> close the field manual, credits and leaderboard. |
| Portrait phones get guidance | The game is 20×12 tiles, so portrait shows a “rotate your device” card with a *Continue anyway* escape hatch. |

---

## 5. Responsive HUD

`#app` fills the screen (`100vw × 100dvh`) and the 5:3 battlefield is a separate, always-full-width
box inside it, so the HUD is anchored to the screen even when the stage overflows it. Two measured
custom properties — `--dock-clearance` and `--topbar-clearance`, published by
[`src/ui/hudLayout.js`](../src/ui/hudLayout.js) — keep every floating control clear of the dock and
the top bar at any aspect ratio. The placement hint lives *inside* the dock as a flow child, so it
grows the panel upwards instead of covering a card.

| Breakpoint | Behaviour |
|---|---|
| ≤ 1180 px | Labels collapse to values, smaller dock cards, tighter top bar |
| ≤ 900 px | Top bar wraps: stats + icon-only controls on row 1, wave badge + START WAVE on row 2 |
| ≤ 680 px | Score chip hidden, dock becomes a full-width strip without its title, inspector becomes a 272 px sheet, TIME column hidden in the leaderboard, codex drawer takes the full width |
| ≤ 620 px height | Desktop labels hidden, 30 px dock icons, 40 vh inspector, camera hint suppressed |
| ≤ 460 px height | Dock name labels hidden (icon + price only), compact menu, top bar collapses to one row (wave badge inline) |
| `hover: none` | 34 px camera/close buttons, 44 px minimum touch rows, zoom pill reduced to its "reset view" button (pinch already zooms the battlefield) |

Type and spacing use `clamp()` so the HUD scales with the window instead of jumping between sizes.

---

## 6. Contrast tokens

Text is split by the surface it sits on, because the Cozy UI art is *light*:

```
ink-strong  #241208   7.70:1 on wood   16.23:1 on parchment
ink         #33200f   6.63:1 on wood   13.96:1 on parchment
ink-muted   #4f3018   5.07:1 on wood   10.69:1 on parchment
ink-gold    #572d00   5.04:1 on wood   10.62:1 on parchment
text-main   #f6efe2  16.56:1 on #14100c
text-muted  #cfc0a9  10.61:1 on #14100c
slot-muted  #f8ecdf   4.80:1 on #a14e3f  (stat-chip labels)
```

Measured against **sampled sprite colours**, not guesses:

| Sprite | Average fill |
|---|---|
| WoodenContainer1 / Container1 / SquareButton2_wood | `#dd9a79` |
| NoteContainerSimple (toasts, results) | `#faf2e6` |
| Container3 (telemetry sections) | `#d9d2d3` |
| ItemSlot1 (stat chips) | `#a14e3f` |
| CardRegular1_red (boss banner) | `#f65d63` |

`npm run check:contrast` parses the tokens straight out of `src/style.css`, recomputes WCAG 2.1
ratios and fails the build if any pair drops below 4.5:1 — **30/30 pairs pass**.

Bugs this caught and fixed:

- modal body copy, leaderboard rows, table headers and toast text inherited light text on wood/parchment;
- the toast accents were cyan/crimson on cream (1.4:1) — now inked borders with ink text;
- boss banner name (1.9:1) and ability line (3.0:1) on the red card;
- “SELL” and danger buttons were white on red (3.2:1) — now dark ink (5.7:1);
- wave/label text inside the cream wave badge;
- codex telemetry descriptions on slate.

---

## 7. Verification

```bash
npm test                # 298 tests / 24 suites (includes the UI + mobile-layout suites)
npm run check:contrast  # WCAG audit — 36/36
npm run verify:camera   # pure camera maths vs a real Phaser camera
npm run build           # production bundle
npm run dev             # manual check at http://localhost:5173
```

`npm run verify:camera` boots a headless Phaser 3 `Camera` (jsdom stubs, no WebGL) and compares it
with `src/camera/cameraMath.js` over 2000 random zoom/scroll combinations:

| Contract | Max difference from the engine |
|---|---|
| `screenToWorld` vs `Camera#getWorldPoint` | **0.00004 px** |
| `clampScroll` vs `Camera#preRender` clamping | **0 px** |
| `zoomAround` anchor drift (where the camera is free to move) | **0.00006 px** |
| `worldView` vs `Camera#worldView` | 0.72 px — Phaser rounds the rectangle to whole pixels |

So pointer → tile conversion is engine-exact; the 0.72 px on `worldView` only affects where HUD
panels anchor and is far below one tile. 45 % of the random samples land on a map edge, where keeping
the world point under the cursor is geometrically impossible; there the rig clamps the scroll instead.


New automated coverage:

| Suite | What it pins down |
|---|---|
| `tests/camera-math.test.js` | World-view maths (incl. engine-verified numbers), zoom-at-cursor pinning, clamping, pinch, pan |
| `tests/upgrade-badge.test.js` | Badge labels/prices/affordability, anchor above art, zoom compensation, hit-testing |
| `tests/panel-placement.test.js` | Inspector side selection and viewport clamping |
| `tests/hud-dom.test.js` (jsdom) | HUD renders every control, buttons forward callbacks, inspector content, placement hint, zoom readout, reset, codex drawer open/live/BFS toggle |

Manual checklist for a human browser session:

1. Zoom to 2× with the wheel, then build — the tower appears under the cursor.
2. Drag the map — no tower is built when you release, and the ghost disappears during the drag.
3. Pan to the base and click a badge above a tower — the inspector opens beside it, never off-screen.
4. Start a wave, open the codex (`C`) — the battle keeps running; toggle the BFS path and watch it
   light up behind the drawer.
5. Resize the window down to ~600 px wide — the top bar wraps, the dock becomes a strip, the inspector
   stays inside the battlefield.
6. On a phone, rotate to portrait — the rotate card appears with *Continue anyway*.

---

## 8. Campaign screens

**World map** (`src/ui/LevelSelectUI.js`, styles under "CAMPAIGN UI" in `src/style.css`)
- A single `.overlay-screen` inside `#modal-container`; the container stays
  `pointer-events: none` so the battlefield below keeps its drags, and the
  overlay re-enables pointer events for itself only.
- Four stage nodes (three levels + Endless Siege) on a dashed `.track-line`.
  Each node carries the generated minimap of *its own* battlefield, the level's
  stars, and a padlock + `disabled` when it is still locked. The accent colour
  comes from `THEMES[level.theme].accent` through a `--node-accent` custom
  property, so a new biome needs no new CSS.
- The header is the campaign wallet (gold, gems, total stars). `Esc`-free: the
  only ways out are a node or MAIN MENU.

**Result screen** (`src/ui/ResultScreenUI.js`)
- Victory: ribbon, level name, 1–3 stars popping in on a 140 ms stagger, three
  stat chips (score / waves / time), the banked rewards, an unlock line, and
  Next / Replay / Leaderboard / Main Menu.
- Defeat: same shell in crimson, a skull mark instead of stars, RETRY instead of
  Next. Endless swaps the stat chips for WAVE REACHED / BEST WAVE / SCORE and
  reports a new depth record.
- The leaderboard opens *over* the result screen (later DOM sibling, higher
  z-index), so the player can submit a score and still take Next afterwards.

**HUD level chip** — the running level's name sits under the top bar in the same
lane as the pause banner (which shifts down 26 px while a level chip is
present). In Endless the wave counter drops its "/ N" denominator and the chip
turns crimson.
