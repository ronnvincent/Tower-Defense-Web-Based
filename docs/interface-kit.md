# The Interface Kit — "Obsidian & Gold"

This is the third UI pass. The first two fixed *behaviour* (camera, non-blocking panels,
responsive HUD, campaign screens). This one fixes the **look**: the game was wearing a
free demo pack of warm wood panels over cold pixel-art battles, and every text colour was
tuned for light plates. On screen that read as "prototype with stickers on it".

Everything here is generated, deterministic and audited:

| Layer | Owner |
|---|---|
| Sprites (plates, buttons, sockets, glyphs, cursors, FX) | `scripts/build_ui_kit.py` → `public/assets/ui-kit/` |
| Menu key art | generated once, committed at `public/assets/ui-kit/menu-bg.jpg` |
| Tokens + all 9-slice rules | `src/style.css` |
| Contrast proof | `scripts/check-contrast.mjs` (reads `:root`, measures sprite fills) |
| Regression guard | `tests/ui-kit.test.js` |

---

## 1. What was actually wrong

The four screenshots that prompted this pass showed the same three failures:

| Symptom | Root cause |
|---|---|
| Seven or more identical peach buttons stacked in one column, with a second scrollbar *inside* the menu card, clipping the title | The menu was a 520 px `Container1` panel with a single-column button list: nine actions at one weight, taller than a landscape phone |
| "Next: +50 starting gold", blessing descriptions and achievement rows were nearly invisible | Every `--ink-*` token was dark brown, designed for the wood/parchment pack. Once the same copy sat on the dark `overlay-shell`, it was dark-on-dark (as low as 1.3:1) |
| Progress bars vanished | 4 px track at `rgba(255,255,255,.12)` behind a dim orange gradient on a near-black card |
| The whole thing read as a mobile clone | Flat plastic gradients, one skin, five icons, cartoon-ish 100 px PNG icons at 18 px |

The fix is not a recolour: a demo pack with three skins cannot be made to look like a
shipping game. The kit below was drawn for **this** game.

---

## 2. The kit

Every sprite is drawn at the *exact* canvas size and 9-slice geometry the stylesheet
already used, so swapping art touched no layout:

| Sprite | Canvas | Slice | Where it lands |
|---|---|---|---|
| `frame_panel.png` | 281×292 | `50` | main menu card, modal cards, every overlay shell |
| `frame_panel_soft.png` | 281×292 | `30` | leaderboard table, telemetry sections |
| `frame_panel_inset.png` | 281×292 | `40 35` | tower inspector |
| `frame_note.png` | 1090×330 | `30` | toasts, result summary |
| `frame_bar.png` | 1511×384 | `40 60` | HUD top bar, tower dock |
| `btn_iron.png` | 377×160 | `28 50` | default button, daily challenge |
| `btn_gold.png` | 377×160 | `28 50` | PLAY, every primary action |
| `btn_crimson.png` | 377×160 | `28 50` | sell / danger / early call |
| `btn_ghost.png` | 377×160 | `28 50` | subtle actions |
| `btn_square.png` | 152×160 | `24` | close buttons |
| `card_iron.png` | 281×343 | `35 30` | dock build cards, menu tiles |
| `card_crimson.png` | 281×342 | `35 30` | boss banner |
| `slot.png` | 137×148 | `20` | stat chips, icon sockets, inputs |
| `slot_sel.png` | 138×148 | `20` | wave badge, selected card |
| `glyph_*.png` | 64×64 | — | menu tiles, daily icon |
| `cursor*.png` | 32×32 | — | gold crosshair |
| `fx_ring.png`, `fx_glow.png` | 128×128 | — | in-canvas shockwaves / boss halo |

Design language, applied consistently:

- **Plate** — near-black slate fill with a vertical lighting gradient, bronze frame,
  gold hairline, chamfered corners, four rivets, and an inner shadow so the plate sits in
  its own cavity rather than floating on the map.
- **Gold is a *light* surface.** Only PLAY and primary actions use it, and they set
  dark ink (`--ink-on-gold`) — the single exception to "all text is light".
- **Crimson** never means decoration; it is sell / danger / boss.
- Everything that stretches is either a horizontal line, a vertical line, or a gradient —
  the only shapes a 9-slice cannot distort.

### Rebuilding

```bash
python3 scripts/build_ui_kit.py --preview /tmp/ui-kit.png   # needs Pillow
```

The script prints the **measured average colour of each plate**. Those numbers are the
`SURFACES` table in `scripts/check-contrast.mjs`: the audit must measure the art that is
actually on screen, or it proves nothing.

---

## 3. Palette

| Token group | Values |
|---|---|
| Plate inks | `--ink-strong #f7eedc` · `--ink #e9dcc4` · `--ink-muted #c2b299` · `--ink-gold #f3c96b` |
| Semantic inks | `--ink-red #ff9aa8` · `--ink-green #7ce3ac` · `--ink-cyan #7fdcf5` |
| The one dark ink | `--ink-on-gold #2a1a05` (7.6:1 on the gold plate) |
| Accents | `--gold-primary #f5c451` · `--cyan-primary #4ee1ff` · `--crimson-primary #ff7a90` |

Measured pairs (all ≥ 4.5:1, `npm run check:contrast`, 47 pairs):

| Pair | Ratio |
|---|---|
| `--ink-strong` on the panel plate | **15.6:1** |
| `--ink-muted` on the panel plate | **8.7:1** |
| `--ink-gold` on the panel plate | **11.4:1** |
| `--ink` on the iron button | **9.8:1** |
| `--ink-on-gold` on the gold button | **8.0:1** |
| `--ink-strong` on the crimson button | **11.2:1** |
| `--ink-muted` on the boss card | **8.8:1** |

---

## 4. The main menu, rebuilt

**Before:** one column, nine full-width peach buttons, inner scrollbar overlapping the
title, no hierarchy.

**After:** two columns on anything wider than 620 px, one column below.

```
┌───────────────────────────────┬──────────────────────────────────┐
│ DSALGO BASTION EDITION        │  ██████  PLAY  (gold)  ██████    │
│ TOWER                         │  [ daily challenge · streak ]    │
│ DEFENSE                       │  [forge] [medals] [champions]    │
│ ─────◆─────                   │  [codex] [how to] [credits]      │
│ one line of flavour           │  [ fullscreen ]                  │
│ STARS 12/45 GEMS 73 MEDALS…   │                                  │
│ controls hint                 │                                  │
└───────────────────────────────┴──────────────────────────────────┘
```

Why this is more usable:

- **One primary action.** PLAY is the only gold plate on the screen; the eye lands there
  first instead of parsing nine equal buttons.
- **Nothing scrolls.** The card is `max-height: 100%` with the hub sized in `clamp()` /
  `vh` units; on a 360 px-tall landscape phone the content is ~300 px, so the inner
  scrollbar (and the clipped title) is gone.
- **Six destinations keep their labels** but ride as 52 px+ tiles — thumb-sized, uniform,
  and each one recognisable by glyph before the label is read.
- **The daily is promoted**, because it is the only button with a *reason to return
  tomorrow*: it shows today's modifier name and the streak flame inline.
- **The save summary is on the front door**: stars, gems and medals are visible without
  opening a submenu.
- **Fullscreen is demoted to a small pill**, not one of nine equal actions.

Markup lives in `index.html`, styles in the `MAIN MENU` block of `src/style.css`, and
`src/main.js` still binds the same ids — plus `refreshMenuSummary()` for the three chips.

The key art (`menu-bg.jpg`) sits behind two scrims: a radial warm corner and a vertical
darkening pass, so the text never fights the image.

---

## 5. Mobile rules this pass enforces

- Every interactive element in the menu is ≥ 44 px tall (`clamp(50px, 9.4vh, 76px)` for
  PLAY, ≥ 50 px for tiles).
- `max-height: 430px` (landscape phones) hides the flavour text and the save summary
  instead of shrinking the buttons.
- `max-width: 620px` (portrait / narrow windows) collapses to one centred column.
- No new fixed widths; every column is `minmax(0, …)` so long labels ellipsize rather
  than push the grid wider.

---

## 6. In-battle surfaces

The same plates are used in play, so the HUD stops looking like a different product:

| Surface | Sprite |
|---|---|
| Top bar / tower dock | `frame_bar` |
| Stat chips, icon sockets, name input | `slot` (gold rim when focused/selected) |
| Build cards | `card_iron` |
| Boss banner | `card_crimson` |
| Toasts, result summary | `frame_note` |
| Inspector | `frame_panel_inset` |
| Buttons | `btn_*`, with gold reserved for primary |

New in play: `fx_ring.png` is now used for shockwaves — a tier-3 kill, a boss entrance
and a boss death each pop a ring that expands and fades (`GameScene.shockwave()`), and
the boss entrance adds a centred halo. Both are guarded on `textures.exists('fx-ring')`,
so a missing kit costs a flourish, never a fight.

---

## 7. Verification

```bash
python3 scripts/build_ui_kit.py       # regenerate + print measured fills
npm run check:contrast                # 47/47 pairs, ≥ 4.5:1
npx vitest run tests/ui-kit.test.js   # 40 contract tests
npm test                              # 518 tests / 39 suites
npm run build
```

`tests/ui-kit.test.js` is the guard rail for the next person who touches the art:

1. every `url('/assets/…')` in `src/style.css` and every `src="/assets/…"` in
   `index.html` exists on disk,
2. every sliced sprite keeps its exact canvas size (a regenerated 300×300 panel would
   quietly stretch every corner),
3. every slice leaves a stretchable middle,
4. every `menu-*` id `main.js` binds still exists exactly once in the markup,
5. the retired Cozy UI demo pack is not referenced by the stylesheet, the markup or the
   contrast audit.
