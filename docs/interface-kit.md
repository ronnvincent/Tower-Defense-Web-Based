# The Interface Kit — "Obsidian & Gold"

This is the third UI pass. The first two fixed *behaviour* (camera, non-blocking panels,
responsive HUD, campaign screens). This one fixes the **look**: the game was wearing a
free demo pack of warm wood panels over cold pixel-art battles, and every text colour was
tuned for light plates. On screen that read as "prototype with stickers on it".

Everything here is generated, deterministic and audited:

| Layer | Owner |
|---|---|
| Sprites (plates, buttons, sockets, glyphs, cursors, FX) | `scripts/build_ui_kit.py` → `public/assets/ui-kit/` |
| Menu key art | `menu-keep.jpg` + `menu-stone.jpg`, committed at `public/assets/ui-kit/` (see §8) |
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
| `glyph_*.png` | 64×64 | — | menu keys, realm panels, mode sigils (46 marks) |
| `cursor*.png` | 32×32 | — | gold crosshair |
| `fx_ring.png`, `fx_glow.png` | 128×128 | — | in-canvas shockwaves / boss halo |
| `menu-stone.jpg` | 640×1024 | — | granite film behind the title (not a 9-slice) |

The two sound keys are glyphs from this same grid — `glyph_sound.png` (horn and
three waves) and `glyph_muted.png` (the same horn struck through) — so the menu's
sound key, the map's sound key and the fullscreen key read as one set. The muted
state is the *slash*, not a dimmed colour, so it survives greyscale.
`src/ui/soundIcon.js` is the only place their paths are written down.

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
python3 scripts/build_menu_stone.py                          # seeded granite slab
```

Both are deterministic: rebuilding from the same source produces byte-identical
files, so a rebuild never churns the repo.

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

**Now (request 14):** one plate, one action.

```
        ┌──────────────────────────────────────────────┐
        │              D E F E N S E                   │
        │            OF KINGDOM                        │
        │        ── DSALGO BASTION EDITION ──          │
        │                                              │
        │        ████  PLAY CAMPAIGN  ████             │
        │        return to the realm · 12/45 stars      │
        │                                          ◉ ◉ │  ← sound · fullscreen
        └──────────────────────────────────────────────┘
```

Why this is more usable:

- **One action.** PLAY CAMPAIGN is the only plaque on the screen. Every other
  destination (daily, duel, War Room, Forge, medals, champions, codex, field manual,
  credits) lives on the world map, in a place that looks like what it does.
- **Nothing to parse.** No second navigation row, no secondary button grid, no save
  summary competing with the title — the wallets (gold/gems/stars) moved onto the map
  top bar, where the campaign actually is.
- **Two utilities stay**, as 44 px icon keys in the corner: sound and fullscreen.
  They are settings, not destinations, and they had nowhere else to live before a
  profile exists.
- **The title is the composition.** A Cinzel Decorative lockup over the painted keep,
  a granite grain plate behind it (`scripts/build_menu_stone.py`, seeded), fog and
  embers at rest — the plate is a painting, not a button list on a gradient.
- **One line of guidance** under the plaque: the campaign totals, or "begin a new
  campaign" on a fresh save. It is the only number on the screen and it is live.

Markup lives in `index.html` (`#menu-btn-play`, `.menu-tools`), styles in the
`MAIN MENU` block of `src/style.css`, and `src/main.js` binds the ids and keeps
`syncSoundButtons()` in step with the audio state.

The key art sits behind two scrims: a radial warm corner and a vertical darkening
pass, so the text never fights the image. (§8 replaced the original `menu-bg.jpg`.)

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


---

## 8. Second pass — "the keep at dusk" (main-menu redesign)

The Obsidian & Gold pass fixed materials but not composition: the menu was still an
880 px form card on a black field, with nine plates at one volume. The redesign rebuilds
the *page*, not the palette.

### What changed

The menu went through two passes. The first gave it materials; the second
(request 14) cut it down to one action and moved every destination into the realm.

| Area | Before | After |
|---|---|---|
| Background | near-black, `menu-bg.jpg` barely visible | `menu-keep.jpg` — a painted keep cliff at dusk, full-bleed, with a slow 78 s drift |
| Left column | centred form card | a dark granite film (`menu-stone.jpg`) over the art, masked so it dissolves right |
| Title | `TOWER` / `DEFENSE` stacked in one gold-bar plate | `DEFENSE` / `OF KINGDOM` gold-leaf lockup in `Cinzel Decorative` |
| Primary action | gold bar with eight siblings below it | `plaque_gold.png` — struck metal, engraved double rule, corner studs, a seal, an engraved chevron, and one live line: `CONTINUE · …` |
| Secondary doors | daily, arena, war room, six tiles, credits | **gone from the menu** — each is a building or a banner on the world map |
| HUD | save summary inside the card | **gone from the menu** — gold / gems / stars live on the map's top bar |
| Top bar | none | the crest, then two 44 px keys: sound (`glyph_sound` / `glyph_muted`) and fullscreen (`glyph_expand`) |
| Atmosphere | none | fog wisps, brazier bloom, eight embers, a swaying war banner — all opacity/transform |

### New art (all deterministic)

`plaque_gold / steel / crimson / dark` (480×200, slice 60/56), `plate_tile` (240×168,
slice 30), `chip_metal` (220×96, slice 24), and nine marks drawn in the existing
pixel idiom: `keep`, `warroom` (crossed axes), `quill`, `star`, `gem`, `flame`,
`skull`, `sound`, `muted`.

`menu-keep.jpg` (1672×941, posterised JPEG) is a painted plate. `menu-stone.jpg`
(640×1024) is generated by `scripts/build_menu_stone.py` — seeded granite grain,
broad mottling and seven hairline cracks, **no mortar grid**: an earlier pass cut
ashlar blocks into it and at 64 % width the joints read as a wireframe table under
the title. It is drawn once, stretched, at 52 % opacity.

### Type is served locally

`@import url(fonts.googleapis.com …)` is gone. Eight OFL woff2 subsets (~15 KB each)
live in `public/fonts/` with their licences, declared as `@font-face` with
`font-display: swap`. First paint no longer waits on a third party, and the display
face (`Cinzel Decorative`) is available to every screen, not just the menu.

### Motion budget

Sky drift 78 s, wisps 66 s / 92 s, brazier flicker 6.4 s, embers 10–16 s, banner sway
8 s. All are `opacity`/`transform` only. `prefers-reduced-motion: reduce` sets
`animation: none` on every decorative layer and drops the ember field entirely; hover,
focus and pressed states stay.

### Checks that now include the new surfaces

`scripts/check-contrast.mjs` gained six measured fills (`plaqueGold`, `plaqueSteel`,
`plaqueCrimson`, `plaqueDark`, `tile`, `chip`) and ten pairs: **57/57 pass at ≥ 4.5:1**.

### The hall plates (Request 34)

The Champions' Hall needed art the kit did not have, so two plates were made and
committed with the source they were cut from:

| sprite | size | source | what it is |
| --- | --- | --- | --- |
| `hall_ledger.webp` | 1600×560 | `art-source/ui-kit/leaderboard-hall-raw.png` | torch-lit masonry with one gold sun banner and empty dark space on the left for the title — the wall behind the hall |
| `banner_rank_gold/silver/bronze.webp` | 420×420 | `art-source/ui-kit/leaderboard-banner-raw.png` | the same banner's sun medallion in three metals, one per podium place |

The banner photograph cannot be re-lit per rank, so the three metals are
**duotones of its luminance**: grey, normalise, back to sRGB, then
`+level-colors <shadow>,<highlight>`. Folds, embroidery and firelight survive;
only the hue changes. `scripts/build_hall_art.sh` rebuilds all four from the
tracked sources with ImageMagick 6 (no network, no Python), and prints the byte
size of each output.

Both sources are AI-generated for this project from the same gold-banner
reference as the menu key art, so they carry no third-party licence obligation
and no attribution requirement. They are the only images in the repository in
that category, and they live beside the generated kit sprites rather than in
`public/assets/` art directories that hold licensed packs.
