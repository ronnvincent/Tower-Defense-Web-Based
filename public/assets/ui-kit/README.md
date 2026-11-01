# ui-kit — "Obsidian & Gold"

**Generated. Do not hand-edit.** Every PNG in this folder except `menu-bg.jpg` is drawn by
`scripts/build_ui_kit.py` (Pillow). Change the palette or a frame in that script and
regenerate:

```bash
python3 scripts/build_ui_kit.py --preview /tmp/ui-kit.png
```

The script is deterministic (no RNG), so a rebuild is byte-identical.

## Provenance

| File(s) | Origin |
|---|---|
| `frame_*`, `btn_*`, `card_*`, `slot*`, `glyph_*`, `cursor*`, `fx_*` | Drawn in this repository by `scripts/build_ui_kit.py`. No third-party art, no attribution required. |
| `menu-bg.jpg` | Generated for this project (dark-fantasy bastion key art) and committed as an asset. Project-owned; no stock or pack licence applies. |

The previous skin (`public/assets/cozy-ui/`) was a free demo pack from dobo_ui on itch.io.
It is no longer referenced by the stylesheet, the markup or the contrast audit; it is kept
only as history and can be deleted without touching the game.

## Geometry contract

`src/style.css` 9-slices these sprites. The canvas size is part of the contract — a
regenerated sprite at another size stretches every corner, which is why
`tests/ui-kit.test.js` pins the dimensions.

| Sprite | Canvas | Slice | Used by |
|---|---|---|---|
| `frame_panel.png` | 281×292 | 50 | menu card, modals, overlay shells |
| `frame_panel_soft.png` | 281×292 | 30 | leaderboard table, telemetry |
| `frame_panel_inset.png` | 281×292 | 40 35 | tower inspector |
| `frame_note.png` | 1090×330 | 30 | toasts, result summary |
| `frame_bar.png` | 1511×384 | 40 60 | HUD top bar, tower dock |
| `btn_iron.png` | 377×160 | 28 50 | default button |
| `btn_gold.png` | 377×160 | 28 50 | primary action (PLAY) |
| `btn_crimson.png` | 377×160 | 28 50 | sell / danger / early call |
| `btn_ghost.png` | 377×160 | 28 50 | subtle action |
| `btn_square.png` | 152×160 | 24 | close buttons |
| `card_iron.png` | 281×343 | 35 30 | build cards, menu tiles |
| `card_crimson.png` | 281×342 | 35 30 | boss banner |
| `slot.png` | 137×148 | 20 | stat chips, sockets, inputs |
| `slot_sel.png` | 138×148 | 20 | wave badge, selected card |
| `glyph_*.png` | 64×64 | — | menu tiles (drawn on a 32 px grid, 2× blocks) |
| `cursor.png`, `cursor_click.png` | 32×32 | — | gold crosshair (hotspot 16 16) |
| `fx_ring.png` | 128×128 | — | in-canvas shockwaves (`GameScene.shockwave`) |
| `fx_glow.png` | 128×128 | — | soft halo (boss entrance) |

## Measured fills

These are the numbers `scripts/check-contrast.mjs` audits text against. They are printed
by the generator; paste them into `SURFACES` if the palette changes.

| Key | Sprite | Average fill |
|---|---|---|
| `panel` | `frame_panel.png` | `#1d2025` |
| `panelSoft` | `frame_panel_soft.png` | `#13171f` |
| `note` | `frame_note.png` | `#13171f` |
| `bar` | `frame_bar.png` | `#151a24` |
| `iron` | `btn_iron.png` | `#283040` |
| `gold` | `btn_gold.png` | `#ddab46` |
| `crimson` | `btn_crimson.png` | `#5f1622` |
| `card` | `card_iron.png` | `#151a24` |
| `cardCrimson` | `card_crimson.png` | `#280b12` |
| `slot` | `slot.png` | `#0f1219` |
| `slotSel` | `slot_sel.png` | `#0f1219` |
