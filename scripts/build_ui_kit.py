#!/usr/bin/env python3
"""
build_ui_kit.py — the "Obsidian & Gold" interface kit.

WHY THIS EXISTS
---------------
The game shipped with a demo pack of warm wood / peach panels. The battlefield
is cold Spire pixel art, so every panel read as pasted on: bright plastic
buttons stacked on dark cards, ink-brown text on near-black plates. This script
bakes a matching kit instead — dark slate plates, a bronze frame, a gold
hairline, chamfered corners and rivets — at *exactly* the sprite dimensions and
slice geometry src/style.css already uses, so swapping the URLs keeps every
9-slice rule valid (no layout churn, no stretched corners).

Every sprite is drawn deterministically (no RNG), so rebuilding is byte
identical. Run it after editing a palette or a frame:

    python3 scripts/build_ui_kit.py --preview /tmp/ui-kit.png

The script prints the measured average colour of every plate. Those numbers are
the SURFACES table in scripts/check-contrast.mjs — the contrast audit must use
the real sprite fill, not a guess, or it stops proving anything.

Requires Pillow (`pip install pillow` in a venv).
"""
from __future__ import annotations

import argparse
import math
import os

from PIL import Image, ImageDraw

# --------------------------------------------------------------- palette

INK = (4, 6, 9, 255)  # 1 px outline that separates plates from the map
SLATE_TOP = (33, 40, 54, 255)  # plate, lit edge
SLATE_MID = (22, 27, 37, 255)
SLATE_BOT = (13, 16, 23, 255)  # plate, shadow edge
SLATE_DEEP = (9, 11, 16, 255)  # recessed cavity
STEEL_LINE = (72, 86, 108, 255)

BRONZE_DARK = (62, 44, 20, 255)
BRONZE = (124, 92, 42, 255)
BRONZE_LIT = (198, 158, 88, 255)
GOLD = (238, 192, 88, 255)
GOLD_LIT = (255, 236, 168, 255)
GOLD_DARK = (146, 100, 28, 255)

CRIM_TOP = (128, 34, 48, 255)
CRIM_MID = (94, 22, 34, 255)
CRIM_BOT = (54, 10, 18, 255)
CRIM_LIT = (214, 96, 112, 255)

GOLD_BTN_TOP = (250, 216, 128, 255)
GOLD_BTN_MID = (226, 172, 62, 255)
GOLD_BTN_BOT = (162, 108, 22, 255)

GHOST_TOP = (32, 38, 50, 255)
GHOST_BOT = (17, 21, 28, 255)

RIVET = (222, 186, 116, 255)


def clamp8(v: float) -> int:
    return max(0, min(255, int(round(v))))


def mix(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(clamp8(a[i] + (b[i] - a[i]) * t) for i in range(4))


def vgrad(w: int, h: int, stops) -> Image.Image:
    """Vertical multi-stop gradient. `stops` = [(pos 0..1, colour), ...]."""
    stops = sorted(stops, key=lambda s: s[0])
    img = Image.new("RGBA", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        left = stops[0]
        right = stops[-1]
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                left, right = stops[i], stops[i + 1]
                break
        span = right[0] - left[0]
        local = 0.0 if span <= 0 else (t - left[0]) / span
        col = mix(left[1], right[1], local)
        for x in range(w):
            px[x, y] = col
    return img


def ring(draw: ImageDraw.ImageDraw, box, width: int, color, inset: int = 0):
    x0, y0, x1, y1 = box
    draw.rectangle([x0 + inset, y0 + inset, x1 - inset, y1 - inset], outline=color, width=width)


def rivet(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: int = 3):
    draw.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=INK)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RIVET)
    draw.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy - 1], fill=mix(RIVET, (255, 255, 255, 255), 0.45))


def inner_shadow(img: Image.Image, thickness: int, alpha_top: int = 150, alpha_side: int = 90):
    """Darken the inside of the frame so the plate sits in its own cavity."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in range(thickness):
        a = clamp8(alpha_top * (1 - i / max(1, thickness)) ** 1.6)
        draw.line([(0, i), (w, i)], fill=(0, 0, 0, a))
    for i in range(thickness):
        a = clamp8(alpha_side * (1 - i / max(1, thickness)) ** 1.6)
        draw.line([(i, 0), (i, h)], fill=(0, 0, 0, a))
        draw.line([(w - 1 - i, 0), (w - 1 - i, h)], fill=(0, 0, 0, a))
    return Image.alpha_composite(img, overlay)


def chamfer(img: Image.Image, sx: int, sy: int, color=BRONZE):
    """Cut the four corners at 45° and run a gold line along the cut."""
    w, h = img.size
    cut = max(6, min(sx, sy) // 2)
    draw = ImageDraw.Draw(img)
    corners = [
        ((0, 0), (cut, 0), (0, cut)),
        ((w - 1, 0), (w - 1 - cut, 0), (w - 1, cut)),
        ((0, h - 1), (cut, h - 1), (0, h - 1 - cut)),
        ((w - 1, h - 1), (w - 1 - cut, h - 1), (w - 1, h - 1 - cut)),
    ]
    for c0, c1, c2 in corners:
        draw.polygon([c0, c1, c2], fill=(0, 0, 0, 0))
        draw.line([c1, c2], fill=mix(color, GOLD, 0.55), width=2)
    return img


# ------------------------------------------------------------------ plates


def plate(w: int, h: int, sx: int, sy: int, *, fill_stops=None, accent=BRONZE, chamfered=True) -> Image.Image:
    """A framed plate whose border bands are drawn inside the 9-slice bands."""
    fill_stops = fill_stops or [(0.0, SLATE_TOP), (0.45, SLATE_MID), (1.0, SLATE_BOT)]
    img = vgrad(w, h, fill_stops)
    img = inner_shadow(img, max(6, min(sx, sy) // 2))

    draw = ImageDraw.Draw(img)
    # Outline + metal frame, thickest line in the middle of the band.
    band = max(4, min(sx, sy) // 4)
    ring(draw, [0, 0, w - 1, h - 1], 2, INK)
    ring(draw, [1, 1, w - 2, h - 2], max(2, band // 2), BRONZE_DARK)
    ring(draw, [3, 3, w - 4, h - 4], band, accent)
    lit = mix(accent, (255, 255, 255, 255), 0.42)
    ring(draw, [3, 3, w - 4, h - 4], 1, lit, inset=0)
    inner = 3 + band
    ring(draw, [inner - 1, inner - 1, w - inner, h - inner], 1, GOLD_DARK)
    ring(draw, [inner, inner, w - 1 - inner, h - 1 - inner], 1, GOLD)

    # Top-band highlight + bottom-band shade: both horizontal, so the
    # 9-slice stretch (which only widens the middle) cannot distort them.
    draw.line([(sx, band + 2), (w - sx, band + 2)], fill=(255, 255, 255, 40))
    draw.line([(sx, h - band - 3), (w - sx, h - band - 3)], fill=(0, 0, 0, 90))
    # Corner rivets sit inside the corner boxes, which never stretch.
    pad = max(10, min(sx, sy) // 2)
    for cx, cy in ((pad, pad), (w - pad, pad), (pad, h - pad), (w - pad, h - pad)):
        rivet(draw, cx, cy, 2)

    if chamfered:
        img = chamfer(img, sx, sy, accent)
    return img


def plate_bar(w: int, h: int, sx: int, sy: int) -> Image.Image:
    """Long chrome bar (HUD top bar, tower dock): pillar end caps."""
    img = plate(w, h, sx, sy)
    draw = ImageDraw.Draw(img)
    for x in (sx // 2 - 6, sx // 2 + 4, w - sx // 2 - 6, w - sx // 2 + 4):
        draw.line([(x, sy), (x, h - sy)], fill=(0, 0, 0, 70))
        draw.line([(x + 1, sy), (x + 1, h - sy)], fill=(255, 255, 255, 26))
    # Gold studs in the caps: drawn as short vertical ticks so a vertical
    # stretch keeps them straight.
    for x in (sx // 2 - 1, w - sx // 2 - 1):
        draw.line([(x, h // 2 - sy // 2), (x, h // 2 + sy // 2)], fill=GOLD_DARK, width=2)
        draw.line([(x + 2, h // 2 - sy // 2), (x + 2, h // 2 + sy // 2)], fill=GOLD_LIT, width=1)
    return img


def plate_card(w: int, h: int, sx: int, sy: int, accent, fill_stops) -> Image.Image:
    """Build / boss cards: a plate with a lighter top lip and a bottom socket."""
    img = plate(w, h, sx, sy, fill_stops=fill_stops, accent=accent)
    draw = ImageDraw.Draw(img)
    draw.rectangle([sx // 2, sy // 2, w - sx // 2, sy // 2 + 3], fill=(255, 255, 255, 24))
    return img


def plate_slot(w: int, h: int, sx: int, sy: int, *, selected=False) -> Image.Image:
    """Inventory socket: a recessed square. `selected` adds the gold glow."""
    img = vgrad(w, h, [(0.0, SLATE_DEEP), (0.5, (14, 17, 24, 255)), (1.0, (24, 29, 40, 255))])
    draw = ImageDraw.Draw(img)
    ring(draw, [0, 0, w - 1, h - 1], 2, INK)
    ring(draw, [1, 1, w - 2, h - 2], 3, BRONZE_DARK)
    ring(draw, [2, 2, w - 3, h - 3], 1, GOLD_DARK if not selected else GOLD)
    # lit bottom lip makes the socket read as a hole
    draw.line([(4, h - 5), (w - 5, h - 5)], fill=(120, 138, 168, 120))
    draw.line([(4, 4), (w - 5, 4)], fill=(0, 0, 0, 160))
    return chamfer(img, sx, sy, GOLD if selected else BRONZE)


def button(w: int, h: int, sx: int, sy: int, *, top, mid, bot, accent, ink_line) -> Image.Image:
    img = vgrad(w, h, [(0.0, top), (0.55, mid), (1.0, bot)])
    draw = ImageDraw.Draw(img)
    # bevel: bright top edge, dark bottom edge, both horizontal
    draw.rectangle([0, 0, w - 1, h - 1], outline=INK, width=2)
    draw.line([(3, 2), (w - 4, 2)], fill=mix(top, (255, 255, 255, 255), 0.55))
    draw.line([(3, h - 3), (w - 4, h - 3)], fill=(0, 0, 0, 150))
    draw.line([(2, 4), (2, h - 5)], fill=mix(top, (255, 255, 255, 255), 0.35))
    draw.line([(w - 3, 4), (w - 3, h - 5)], fill=(0, 0, 0, 110))
    ring(draw, [0, 0, w - 1, h - 1], 2, accent)
    ring(draw, [3, 3, w - 4, h - 4], 1, ink_line)
    # end-cap pillars live in the left/right slice bands (vertical stretch only)
    for x in (sx // 2 - 8, sx // 2 - 2, w - sx // 2 + 1, w - sx // 2 + 7):
        draw.line([(x, sy // 2), (x, h - sy // 2)], fill=(0, 0, 0, 60))
        draw.line([(x + 1, sy // 2), (x + 1, h - sy // 2)], fill=(255, 255, 255, 28))
    img = chamfer(img, sx, sy, accent)
    return img


# -------------------------------------------------------------------- FX


def fx_glow(size: int = 128) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / c
            if d >= 1:
                continue
            a = clamp8(255 * (1 - d) ** 2.4)
            px[x, y] = (255, 244, 206, a)
    return img


def fx_ring(size: int = 128, radius: float = 0.82, thickness: float = 0.10) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / c
            band = abs(d - radius)
            if band > thickness:
                continue
            a = clamp8(230 * (1 - band / thickness) ** 1.2)
            px[x, y] = (255, 236, 186, a)
    return img


def cursor(size: int = 32, clicked: bool = False) -> Image.Image:
    """Gold crosshair. The dark halo keeps it legible on the bright map."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size // 2
    gap = 3 if not clicked else 4
    span = size // 2 - 2
    for x0, y0, x1, y1 in ((c, 0, c, c - gap), (c, c + gap, c, size), (0, c, c - gap, c), (c + gap, c, size, c)):
        d.line([(x0, y0), (x1, y1)], fill=(3, 4, 7, 210), width=4)
    for x0, y0, x1, y1 in ((c, 0, c, c - gap), (c, c + gap, c, size), (0, c, c - gap, c), (c + gap, c, size, c)):
        d.line([(x0, y0), (x1, y1)], fill=GOLD_LIT, width=2)
    r = 3 if not clicked else 5
    d.ellipse([c - r - 1, c - r - 1, c + r + 1, c + r + 1], fill=(3, 4, 7, 220))
    d.ellipse([c - r, c - r, c + r, c + r], fill=GOLD if not clicked else (255, 122, 144, 255))
    return img


# ------------------------------------------------------------------ glyphs
# 64 px canvas drawn on a 32 px grid (2× blocks): crisp down to 16 px.

G = 64
U = 2  # one design unit = 2 px


def glyphs() -> dict:
    out = {}

    def canvas():
        img = Image.new("RGBA", (G, G), (0, 0, 0, 0))
        return img, ImageDraw.Draw(img)

    def px(d, x, y, w, h, color):
        d.rectangle([x * U, y * U, (x + w) * U - 1, (y + h) * U - 1], fill=color)

    # anvil — the forge
    img, d = canvas()
    px(d, 7, 9, 18, 4, (152, 162, 178, 255))
    px(d, 7, 9, 18, 1, (206, 214, 226, 255))
    px(d, 6, 9, 1, 4, (110, 118, 130, 255))
    px(d, 22, 10, 4, 2, (110, 118, 130, 255))
    px(d, 9, 13, 12, 4, (128, 136, 150, 255))
    px(d, 11, 17, 7, 6, (96, 102, 114, 255))
    px(d, 9, 23, 12, 2, (72, 78, 88, 255))
    for x, y in ((26, 6), (24, 4), (27, 11), (23, 8)):
        px(d, x, y, 1, 1, GOLD_LIT)
    out["glyph_anvil"] = img

    # medal — achievements
    img, d = canvas()
    px(d, 10, 3, 4, 10, (150, 40, 54, 255))
    px(d, 18, 3, 4, 10, (58, 92, 156, 255))
    px(d, 11, 3, 2, 8, (198, 74, 88, 255))
    px(d, 19, 3, 2, 8, (92, 132, 198, 255))
    px(d, 10, 13, 12, 2, GOLD_DARK)
    px(d, 9, 15, 14, 12, INK)
    px(d, 10, 16, 12, 10, GOLD)
    px(d, 11, 16, 10, 2, GOLD_LIT)
    px(d, 11, 24, 10, 2, GOLD_DARK)
    px(d, 13, 18, 6, 5, (150, 40, 54, 255))
    px(d, 14, 19, 3, 2, (198, 74, 88, 255))
    out["glyph_medal"] = img

    # crown — hall of champions
    img, d = canvas()
    px(d, 6, 24, 20, 3, INK)
    px(d, 6, 22, 20, 2, GOLD)
    px(d, 6, 22, 2, 2, GOLD_DARK)
    px(d, 24, 22, 2, 2, GOLD_DARK)
    px(d, 6, 10, 3, 12, GOLD)
    px(d, 23, 10, 3, 12, GOLD)
    px(d, 9, 13, 14, 9, GOLD)
    px(d, 9, 13, 14, 1, GOLD_LIT)
    px(d, 9, 8, 2, 5, GOLD)
    px(d, 15, 6, 2, 7, GOLD)
    px(d, 21, 8, 2, 5, GOLD)
    px(d, 12, 17, 3, 3, (150, 40, 54, 255))
    px(d, 18, 17, 2, 3, (58, 92, 156, 255))
    out["glyph_crown"] = img

    # scroll — codex
    img, d = canvas()
    px(d, 8, 6, 16, 20, (222, 206, 172, 255))
    px(d, 8, 6, 16, 1, (246, 236, 208, 255))
    px(d, 8, 25, 16, 1, (164, 148, 116, 255))
    px(d, 6, 6, 2, 20, BRONZE)
    px(d, 24, 6, 2, 20, BRONZE)
    for y in (10, 13, 16, 19, 22):
        px(d, 11, y, 10, 1, (96, 78, 56, 255))
    px(d, 11, 10, 6, 1, (96, 78, 56, 255))
    out["glyph_scroll"] = img

    # book — how to play
    img, d = canvas()
    px(d, 5, 7, 22, 18, INK)
    px(d, 6, 8, 20, 16, (36, 48, 70, 255))
    px(d, 6, 8, 20, 1, (74, 92, 124, 255))
    px(d, 15, 8, 2, 16, BRONZE)
    for y in (12, 15, 18):
        px(d, 8, y, 6, 1, (196, 176, 132, 255))
        px(d, 19, y, 6, 1, (196, 176, 132, 255))
    px(d, 9, 9, 4, 2, GOLD)
    out["glyph_book"] = img

    # gear — credits / settings
    img, d = canvas()
    px(d, 12, 4, 8, 4, (150, 160, 176, 255))
    px(d, 12, 24, 8, 4, (150, 160, 176, 255))
    px(d, 4, 12, 4, 8, (150, 160, 176, 255))
    px(d, 24, 12, 4, 8, (150, 160, 176, 255))
    px(d, 8, 8, 16, 16, (150, 160, 176, 255))
    px(d, 8, 8, 16, 2, (206, 214, 226, 255))
    px(d, 11, 11, 10, 10, INK)
    px(d, 12, 12, 8, 8, GOLD)
    px(d, 14, 14, 4, 4, (14, 17, 24, 255))
    out["glyph_gear"] = img

    # calendar — daily
    img, d = canvas()
    px(d, 6, 6, 20, 20, INK)
    px(d, 7, 7, 18, 18, (222, 206, 172, 255))
    px(d, 7, 7, 18, 5, (150, 40, 54, 255))
    px(d, 7, 7, 18, 1, (198, 74, 88, 255))
    px(d, 10, 4, 3, 5, GOLD)
    px(d, 19, 4, 3, 5, GOLD)
    for x in (10, 15, 20):
        for y in (15, 20):
            px(d, x, y, 2, 2, (96, 78, 56, 255))
    px(d, 15, 15, 2, 2, (150, 40, 54, 255))
    out["glyph_calendar"] = img

    # crossed swords — campaign / play
    img, d = canvas()
    for i in range(16):
        px(d, 6 + i, 24 - i, 2, 2, (186, 196, 212, 255))
        px(d, 24 - i, 24 - i, 2, 2, GOLD)
    px(d, 5, 25, 3, 3, BRONZE)
    px(d, 24, 25, 3, 3, BRONZE)
    px(d, 4, 22, 5, 2, BRONZE)
    px(d, 23, 22, 5, 2, BRONZE)
    out["glyph_swords"] = img

    # expand — fullscreen
    img, d = canvas()
    for (x, y, dx, dy) in ((5, 5, 1, 1), (26, 5, -1, 1), (5, 26, 1, -1), (26, 26, -1, -1)):
        px(d, x, y, 7, 2, GOLD)
        px(d, x, y, 2, 7, GOLD)
        px(d, x + (3 if dx > 0 else 0), y + (3 if dy > 0 else 0), 2, 2, GOLD_LIT)
    out["glyph_expand"] = img

    # combat cross-check: close (gold X)
    img, d = canvas()
    for i in range(9):
        px(d, 12 + i, 12 + i, 2, 2, GOLD_LIT)
        px(d, 20 - i, 12 + i, 2, 2, GOLD_LIT)
    out["glyph_close"] = img

    # ------------------------------------------------------------------
    # Powerup sigils. Same 32-unit grid and the same ink outline as the
    # menu glyphs, because these sit on the same iron plates as everything
    # else — a 64 px pixel sigil, never a font emoji.
    # ------------------------------------------------------------------

    # meteor — a burning stone falling down-left
    img, d = canvas()
    # ember tail: three tapering streaks, darkest at the tip
    for i in range(9):
        tone = (214, 122, 44, 255) if i < 3 else (170, 78, 30, 255) if i < 6 else (112, 48, 22, 255)
        px(d, 14 - i, 16 + i, 2, 2, tone)
    for i in range(6):
        px(d, 17 - i, 19 + i, 1, 1, (238, 154, 62, 255))
    # the stone
    px(d, 18, 5, 9, 2, INK)
    px(d, 17, 7, 11, 8, INK)
    px(d, 18, 15, 9, 1, INK)
    px(d, 18, 7, 8, 7, (150, 106, 78, 255))
    px(d, 19, 7, 6, 2, (206, 168, 132, 255))
    px(d, 23, 10, 3, 3, (104, 70, 52, 255))
    # molten leading edge
    px(d, 17, 8, 1, 5, (238, 140, 52, 255))
    px(d, 17, 13, 2, 1, (238, 140, 52, 255))
    px(d, 19, 15, 5, 1, (238, 140, 52, 255))
    for x, y in ((9, 20), (6, 25), (16, 24), (27, 4)):
        px(d, x, y, 1, 1, GOLD_LIT)
    out["glyph_meteor"] = img

    # overcharge — a bolt through the tower's coils
    img, d = canvas()
    bolt = [
        (17, 3, 6, 3),
        (15, 6, 5, 4),
        (13, 10, 5, 3),
        (8, 13, 11, 3),
        (13, 16, 4, 4),
        (11, 20, 4, 4),
        (9, 24, 3, 4),
    ]
    for x, y, w, h in bolt:  # ink backing, one unit proud
        px(d, x - 1, y - 1, w + 2, h + 2, INK)
    for x, y, w, h in bolt:
        px(d, x, y, w, h, (86, 196, 226, 255))
    # lit inner edge
    for x, y, w, h in bolt:
        px(d, x, y, max(1, w - 2), 1, (176, 240, 255, 255))
    px(d, 17, 3, 2, 2, (236, 253, 255, 255))
    for x, y in ((6, 8), (25, 18), (5, 20), (27, 6)):
        px(d, x, y, 1, 1, (140, 226, 255, 255))
    out["glyph_overcharge"] = img

    # fortify — the core's shield
    img, d = canvas()
    px(d, 10, 3, 12, 2, INK)
    px(d, 8, 5, 16, 9, INK)
    px(d, 9, 14, 14, 4, INK)
    px(d, 12, 18, 8, 4, INK)
    px(d, 14, 22, 4, 3, INK)
    px(d, 11, 5, 10, 8, (74, 176, 126, 255))
    px(d, 10, 13, 12, 3, (74, 176, 126, 255))
    px(d, 13, 16, 6, 4, (74, 176, 126, 255))
    px(d, 15, 20, 2, 2, (74, 176, 126, 255))
    px(d, 12, 5, 8, 1, (126, 226, 168, 255))
    px(d, 11, 6, 1, 6, (126, 226, 168, 255))
    px(d, 15, 7, 2, 9, GOLD)
    px(d, 15, 7, 1, 9, GOLD_LIT)
    px(d, 11, 10, 10, 2, GOLD)
    px(d, 19, 13, 2, 2, (54, 132, 94, 255))
    out["glyph_fortify"] = img

    return out


# ------------------------------------------------------------------ build


# ============================================================== CINEMATIC KIT
#
# The first kit was one plate for everything: nine equal buttons on one navy
# card. It was legible, but the menu still read as a web form. These plates are
# the second pass — a real primary plaque with a struck-metal surface, plus the
# cold steel / oxblood / blackened plates the other destinations sit on.
#
# Every one is still a 9-slice at a known geometry, so no layout rule changes:
# only the corner boxes carry ornament, because those are the only bands that
# never stretch. Anything drawn in the middle is horizontal (it may stretch
# sideways, never smear).


def _hash01(x: int, y: int, seed: int = 0) -> float:
    """Deterministic value noise. No RNG: rebuilding must be byte identical."""
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def grain(img: Image.Image, strength: float = 9.0, seed: int = 1, step: int = 1) -> Image.Image:
    """Fine per-pixel luminance grain — kills the "flat CSS gradient" read."""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            n = (_hash01(x // step, y // step, seed) - 0.5) * 2 * strength
            px[x, y] = (clamp8(r + n), clamp8(g + n), clamp8(b + n), a)
    return img


def brushed(img: Image.Image, strength: float = 12.0, seed: int = 2, band: int = 3) -> Image.Image:
    """Horizontal brush streaks: per-row offset noise, softened along y."""
    w, h = img.size
    rows = [(_hash01(0, y // band, seed) - 0.5) * 2 * strength for y in range(h)]
    smooth = [(rows[max(0, y - 1)] + rows[y] * 2 + rows[min(h - 1, y + 1)]) / 4 for y in range(h)]
    px = img.load()
    for y in range(h):
        d = smooth[y]
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (clamp8(r + d), clamp8(g + d), clamp8(b + d), a)
    return img


def specular(img: Image.Image, y: int, alpha: int = 46, height: int = 10) -> Image.Image:
    """Soft light band falling off downward — reads as a curved metal surface."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for i in range(height):
        a = clamp8(alpha * (1 - i / max(1, height)) ** 2.1)
        d.line([(0, y + i), (w, y + i)], fill=(255, 246, 214, a))
    return Image.alpha_composite(img, overlay)


def corner_flourish(draw, cx: int, cy: int, sx: int, sy: int, lit, dark, s: int = 1):
    """Corner work: a parallel cut behind the chamfer and one diamond stud.

    Only the 9-slice corner boxes are safe to decorate — they are the one band
    that never stretches — and at ~30 px on screen there is room for about
    three shapes. Earlier passes tried scrollwork and it turned to mud.
    """
    x_dir = 1 if cx < sx else -1
    y_dir = 1 if cy < sy else -1
    cut = max(6, min(sx, sy) // 2)
    inset = 7 * s
    # second cut, parallel to the chamfer, one shade darker
    draw.line(
        [(cx + x_dir * inset, cy + y_dir * (cut + inset)),
         (cx + x_dir * (cut + inset), cy + y_dir * inset)],
        fill=dark, width=2 * s,
    )
    # diamond stud sitting on the diagonal, clear of the cut
    fx = cx + x_dir * (cut * 0.62 + 6)
    fy = cy + y_dir * (cut * 0.62 + 6)
    r = max(3, 4 * s)
    draw.polygon([(fx, fy - r - 1), (fx + r + 1, fy), (fx, fy + r + 1), (fx - r - 1, fy)], fill=INK)
    draw.polygon([(fx, fy - r), (fx + r, fy), (fx, fy + r), (fx - r, fy)], fill=lit)
    draw.polygon([(fx, fy - r + 2), (fx + r - 2, fy), (fx - r + 2, fy)], fill=mix(lit, (255, 255, 255, 255), 0.5))


def plaque(w: int, h: int, sx: int, sy: int, *, stops, edge, accent, ink, ornament=True, glossed=True) -> Image.Image:
    """The cinematic 9-slice: struck metal, engraved double rule, corner work."""
    img = vgrad(w, h, stops)
    img = brushed(img, strength=9.0, seed=7)
    img = grain(img, strength=7.0, seed=3, step=2)
    if glossed:
        img = specular(img, int(h * 0.06), alpha=58, height=max(10, h // 7))
    img = inner_shadow(img, max(8, min(sx, sy) // 4), alpha_top=190, alpha_side=120)

    d = ImageDraw.Draw(img)
    # 1 px ink outline separates the plate from whatever art is behind it.
    ring(d, [0, 0, w - 1, h - 1], 2, INK)
    # Struck metal edge: light where the hammer fell, dark where it turned away.
    d.line([(2, 2), (w - 3, 2)], fill=mix(edge, (255, 255, 255, 255), 0.55), width=2)
    d.line([(2, 3), (2, h - 4)], fill=mix(edge, (255, 255, 255, 255), 0.30), width=2)
    d.line([(2, h - 3), (w - 3, h - 3)], fill=(0, 0, 0, 170), width=2)
    d.line([(w - 3, 3), (w - 3, h - 4)], fill=(0, 0, 0, 120), width=2)
    # Engraved groove: dark cut with a lit lower lip, like a chiselled line.
    ring(d, [7, 7, w - 8, h - 8], 2, (0, 0, 0, 170))
    ring(d, [9, 9, w - 10, h - 10], 1, mix(edge, (255, 255, 255, 255), 0.55))
    ring(d, [11, 11, w - 12, h - 12], 1, (0, 0, 0, 110))
    ring(d, [12, 12, w - 13, h - 13], 1, mix(accent, (255, 255, 255, 255), 0.22))

    if ornament:
        lit = mix(accent, (255, 246, 214, 255), 0.55)
        dark = mix(accent, (0, 0, 0, 255), 0.55)
        for cx, cy in ((0, 0), (w, 0), (0, h), (w, h)):
            corner_flourish(d, cx, cy, sx, sy, lit, dark)
    # Studs on the long edges only: a vertical stretch keeps a column of them
    # straight, and they sit inside the top/bottom bands.
    if ornament:
        for cx in (sx // 2, w - sx // 2):
            for cy in (sy // 2 + 2, h - sy // 2 - 2):
                rivet(d, cx, cy, 2)

    img = chamfer(img, sx, sy, accent)
    # Restore the ink outline over the chamfer cut so the silhouette stays crisp.
    ring(d, [0, 0, w - 1, h - 1], 1, (0, 0, 0, 80))
    return img


GOLD_STOPS = [(0.0, (255, 236, 174, 255)), (0.16, (247, 214, 128, 255)), (0.44, (230, 184, 74, 255)),
              (0.72, (188, 134, 34, 255)), (0.93, (214, 166, 58, 255)), (1.0, (168, 116, 26, 255))]
STEEL_STOPS = [(0.0, (74, 86, 106, 255)), (0.18, (52, 61, 76, 255)), (0.55, (36, 43, 56, 255)),
               (0.86, (26, 31, 41, 255)), (1.0, (20, 24, 33, 255))]
CRIMSON_STOPS = [(0.0, (132, 38, 50, 255)), (0.2, (104, 26, 37, 255)), (0.58, (82, 18, 28, 255)),
                 (0.88, (58, 12, 20, 255)), (1.0, (46, 9, 15, 255))]
DARK_STOPS = [(0.0, (48, 54, 66, 255)), (0.2, (34, 39, 49, 255)), (0.6, (24, 28, 36, 255)),
              (0.88, (16, 19, 25, 255)), (1.0, (13, 16, 21, 255))]
# Tiles sit on a near-black scrim, so they get one extra stop of lift: at
# DARK_STOPS they read as holes rather than as plates bolted to the wall.
TILE_STOPS = [(0.0, (64, 71, 86, 255)), (0.16, (48, 55, 68, 255)), (0.58, (34, 40, 50, 255)),
              (0.88, (24, 28, 36, 255)), (1.0, (30, 35, 44, 255))]


def tile_plate(w: int, h: int, sx: int, sy: int) -> Image.Image:
    """Secondary tile: smaller ornament budget, so the grid stays quiet."""
    img = plaque(w, h, sx, sy, stops=TILE_STOPS, edge=STEEL_LINE, accent=BRONZE, ink=INK,
                 ornament=True, glossed=False)
    d = ImageDraw.Draw(img)
    d.line([(14, h - 16), (w - 15, h - 16)], fill=(0, 0, 0, 110), width=2)
    d.line([(14, h - 15), (w - 15, h - 15)], fill=mix(BRONZE, (255, 255, 255, 255), 0.3), width=1)
    return img


def chip_plate(w: int, h: int, sx: int, sy: int) -> Image.Image:
    """HUD resource chip: a small recessed socket with a gold rim."""
    img = vgrad(w, h, [(0.0, (30, 35, 45, 255)), (0.55, (18, 22, 29, 255)), (1.0, (26, 31, 40, 255))])
    img = grain(img, strength=6.0, seed=11, step=2)
    img = inner_shadow(img, 7, alpha_top=200, alpha_side=130)
    d = ImageDraw.Draw(img)
    ring(d, [0, 0, w - 1, h - 1], 2, INK)
    ring(d, [2, 2, w - 3, h - 3], 2, BRONZE_DARK)
    ring(d, [4, 4, w - 5, h - 5], 1, GOLD_DARK)
    ring(d, [5, 5, w - 6, h - 6], 1, (0, 0, 0, 120))
    # lit bottom lip makes the socket read as a hole, not a pad
    d.line([(6, h - 6), (w - 7, h - 6)], fill=(150, 168, 200, 90), width=1)
    for cx in (max(12, sx // 2), w - max(12, sx // 2)):
        rivet(d, cx, h / 2, 2)
    return chamfer(img, sx, sy, BRONZE)


# ------------------------------------------------------------ new marks
#
# 32 design units per edge (U px each), exactly like glyphs() above — a keep
# drawn here sits next to the shipped anvil without a change of dialect.

MARKS = {}


def _mark(name):
    def register(fn):
        MARKS[name] = fn
        return fn
    return register


def _units(canvas_units: int = 32):
    img = Image.new("RGBA", (canvas_units * U, canvas_units * U), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _px(d, x, y, w, h, color):
    d.rectangle([x * U, y * U, (x + w) * U - 1, (y + h) * U - 1], fill=color)


STONE = (86, 96, 114, 255)
STONE_LIT = (132, 144, 164, 255)
STONE_DARK = (52, 59, 72, 255)
GATE = (8, 10, 14, 255)


@_mark("keep")
def _mark_keep():
    img, d = _units()
    # pennant
    _px(d, 15, 2, 1, 8, (96, 84, 60, 255))
    _px(d, 16, 2, 5, 3, GOLD)
    _px(d, 16, 2, 3, 1, GOLD_LIT)
    _px(d, 21, 3, 1, 1, GOLD_DARK)
    # centre tower body + battlements
    _px(d, 11, 12, 11, 16, STONE)
    _px(d, 11, 12, 1, 16, STONE_LIT)
    _px(d, 21, 12, 1, 16, STONE_DARK)
    for x in (10, 13, 18, 21):
        _px(d, x, 9, 2, 3, STONE)
        _px(d, x, 9, 1, 3, STONE_LIT)
    _px(d, 10, 12, 13, 1, STONE_DARK)
    # gate: arch + portcullis
    _px(d, 15, 18, 4, 10, GATE)
    _px(d, 16, 17, 2, 1, GATE)
    _px(d, 16, 20, 2, 6, (52, 44, 30, 255))
    _px(d, 15, 22, 4, 1, (52, 44, 30, 255))
    # lit windows
    for x, y in ((12, 15), (19, 15), (12, 19), (19, 19)):
        _px(d, x, y, 1, 2, GOLD)
    # flanking turrets
    for x in (6, 23):
        _px(d, x, 16, 3, 12, STONE_DARK)
        _px(d, x, 16, 1, 12, STONE)
        for mx in (x, x + 2):
            _px(d, mx, 13, 1, 3, STONE_DARK)
        _px(d, x + 1, 19, 1, 2, GOLD)
    # ground line
    _px(d, 5, 28, 22, 1, STONE_DARK)
    _px(d, 6, 29, 20, 1, (28, 32, 40, 255))
    return img


@_mark("warroom")
def _mark_warroom():
    img, d = _units()
    # Crossed battle-axes. Mirror Arena owns the swords, so the war council gets
    # axes: thick hafts, a crescent blade on each head, gold binding where they
    # cross. Bold enough to survive at 32 px in the tile grid.
    for i in range(19):
        _px(d, 6 + i, 25 - i, 2, 2, (110, 86, 54, 255))
        _px(d, 24 - i, 25 - i, 2, 2, (110, 86, 54, 255))
        _px(d, 6 + i, 25 - i, 1, 1, (156, 126, 80, 255))
        _px(d, 24 - i, 25 - i, 1, 1, (156, 126, 80, 255))
    for mirror in (0, 1):
        for i, (x0, x1) in enumerate(((25, 27), (24, 29), (23, 29), (22, 29), (22, 29),
                                      (23, 29), (24, 29), (25, 27), (26, 27))):
            y = 3 + i
            if mirror:
                _px(d, 32 - x1, y, x1 - x0, 1, STONE_LIT)
                _px(d, 32 - x1, y, 1, 1, (222, 230, 240, 255))
                _px(d, 32 - x0 - 1, y, 1, 1, STONE_DARK)
            else:
                _px(d, x0, y, x1 - x0, 1, STONE_LIT)
                _px(d, x0, y, 1, 1, (222, 230, 240, 255))
                _px(d, x1 - 1, y, 1, 1, STONE_DARK)
    # binding over the crossing
    _px(d, 13, 12, 6, 1, GOLD_DARK)
    _px(d, 13, 13, 6, 2, GOLD)
    _px(d, 13, 15, 6, 1, GOLD_DARK)
    _px(d, 14, 13, 4, 1, GOLD_LIT)
    return img


@_mark("quill")
def _mark_quill():
    img, d = _units()
    # Feather: a fat vane either side of a bright spine, tapering to a nib.
    for i in range(15):
        x = 8 + i
        y = 24 - i
        half = 1 + min(3, i // 4)
        _px(d, x - half, y - 1, half * 2 + 1, 1, (236, 226, 204, 255))
        _px(d, x - half, y - 1, 1, 1, (186, 174, 148, 255))
        _px(d, x, y - 2, 1, 2, (250, 246, 234, 255))
    _px(d, 23, 8, 2, 2, (236, 226, 204, 255))
    _px(d, 24, 7, 1, 1, GOLD_LIT)
    # nib + inkwell
    _px(d, 6, 26, 2, 1, GOLD_DARK)
    _px(d, 4, 26, 7, 4, STONE_DARK)
    _px(d, 4, 26, 7, 1, STONE_LIT)
    _px(d, 5, 27, 5, 2, (10, 12, 17, 255))
    _px(d, 10, 25, 1, 2, GOLD)
    return img


@_mark("sound")
def _mark_sound():
    """Audio on — a horn with three waves. Same grid as every other glyph, so
    the menu's sound key and the fullscreen key read as one set."""
    img, d = _units()
    _px(d, 5, 13, 4, 6, (150, 160, 176, 255))
    _px(d, 5, 13, 4, 1, (198, 208, 222, 255))
    _px(d, 9, 10, 4, 12, GOLD)
    _px(d, 9, 10, 4, 1, GOLD_LIT)
    _px(d, 13, 8, 2, 16, GOLD_LIT)
    _px(d, 13, 8, 1, 16, GOLD)
    for x, y, h in ((18, 13, 6), (21, 10, 12), (24, 7, 18)):
        _px(d, x, y, 1, h, GOLD)
        _px(d, x, y, 1, 1, GOLD_LIT)
        _px(d, x, y + h - 1, 1, 1, GOLD_DARK)
    return img


@_mark("muted")
def _mark_muted():
    """Audio off — the same horn, struck through. The slash is the signal, not
    a dimmed colour, so it survives a greyscale or colour-blind view."""
    img, d = _units()
    _px(d, 5, 13, 4, 6, (110, 118, 130, 255))
    _px(d, 9, 10, 4, 12, (152, 162, 178, 255))
    _px(d, 13, 8, 2, 16, (186, 196, 212, 255))
    for i in range(10):
        _px(d, 12 + i, 23 - i, 2, 2, (198, 74, 88, 255))
    for i in range(9):
        _px(d, 13 + i, 22 - i, 1, 1, (236, 128, 138, 255))
    return img


@_mark("star")
def _mark_star():
    img, d = _units()
    rows = {
        4: (15, 2), 5: (15, 2), 6: (14, 4), 7: (14, 4), 8: (13, 6),
        9: (9, 14), 10: (10, 12), 11: (11, 10), 12: (11, 10),
        13: (10, 3), 14: (9, 2), 15: (8, 2),
    }
    for y, (x, w) in rows.items():
        _px(d, x, y, w, 1, GOLD)
    for y, (x, w) in ((13, (19, 3)), (14, (21, 2)), (15, (22, 2))):
        _px(d, x, y, w, 1, GOLD)
    _px(d, 11, 9, 1, 4, GOLD_LIT)
    _px(d, 12, 8, 2, 1, GOLD_LIT)
    _px(d, 13, 13, 6, 1, GOLD_DARK)
    _px(d, 14, 14, 4, 1, GOLD_DARK)
    return img


@_mark("gem")
def _mark_gem():
    img, d = _units()
    # Three flat zones read as a cut stone at 48 px; per-band facet noise did
    # not (it just looked like a dirty gold blob).
    rows = [(8, 9, 14), (9, 8, 16), (10, 7, 18), (11, 7, 18), (12, 7, 18), (13, 8, 16),
            (14, 9, 14), (15, 10, 12), (16, 11, 10), (17, 12, 8), (18, 13, 6), (19, 14, 4)]
    for y, x, w in rows:
        _px(d, x, y, w, 1, GOLD)
    # table highlight
    _px(d, 9, 8, 14, 1, (255, 244, 196, 255))
    _px(d, 10, 9, 5, 1, (255, 250, 220, 255))
    # left lit facet
    for y, x, w in rows[2:10]:
        _px(d, x, y, max(1, w // 3), 1, (255, 238, 176, 255))
    # right shaded facet
    for y, x, w in rows[1:11]:
        _px(d, x + w - max(1, w // 3), y, max(1, w // 3), 1, (186, 132, 32, 255))
    # centre ridge
    _px(d, 15, 10, 2, 6, (240, 200, 104, 255))
    _px(d, 15, 16, 2, 1, (214, 166, 58, 255))
    _px(d, 15, 17, 2, 1, (196, 146, 42, 255))
    # sparkle
    _px(d, 11, 9, 1, 1, (255, 255, 240, 255))
    _px(d, 12, 10, 1, 1, (255, 252, 232, 255))
    return img


@_mark("flame")
def _mark_flame():
    img, d = _units()
    body = [(5, 15, 3), (6, 14, 4), (7, 14, 5), (8, 13, 6), (9, 12, 8), (10, 11, 10),
            (11, 10, 12), (12, 10, 12), (13, 9, 14), (14, 9, 14), (15, 10, 12),
            (16, 10, 12), (17, 11, 10), (18, 12, 8), (19, 13, 6), (20, 14, 4)]
    for y, x, w in body:
        _px(d, x, y, w, 1, (255, 168, 62, 255))
    for y, x, w in body[4:]:
        _px(d, x + 1, y, w - 2, 1, (255, 206, 108, 255))
    for y in range(11, 20):
        _px(d, 15, y, 2, 1, (255, 240, 186, 255))
    _px(d, 15, 6, 2, 4, (255, 214, 120, 255))
    _px(d, 16, 3, 1, 3, (255, 236, 168, 255))
    _px(d, 14, 9, 1, 3, (255, 244, 200, 255))
    # ember at the base
    _px(d, 13, 21, 6, 2, (196, 84, 30, 255))
    _px(d, 14, 23, 4, 1, (120, 42, 18, 255))
    return img


@_mark("skull")
def _mark_skull():
    img, d = _units()
    _px(d, 9, 7, 14, 15, (216, 208, 186, 255))
    _px(d, 10, 6, 12, 1, (216, 208, 186, 255))
    _px(d, 9, 7, 14, 1, (244, 240, 226, 255))
    _px(d, 10, 20, 12, 2, (188, 178, 154, 255))
    _px(d, 11, 22, 10, 3, (150, 140, 118, 255))
    for x in (12, 15, 18, 21):
        _px(d, x, 22, 1, 3, (96, 88, 72, 255))
    # eye sockets
    _px(d, 11, 11, 4, 4, GATE)
    _px(d, 17, 11, 4, 4, GATE)
    _px(d, 12, 12, 1, 1, GOLD)
    _px(d, 18, 12, 1, 1, GOLD)
    _px(d, 12, 17, 8, 2, GATE)
    _px(d, 12, 15, 1, 2, (150, 140, 118, 255))
    _px(d, 19, 15, 1, 2, (150, 140, 118, 255))
    return img


def heraldic_marks() -> dict:
    return {f"glyph_{name}.png": fn() for name, fn in MARKS.items()}


def average(img: Image.Image, inset: int = 0) -> str:
    """Mean colour of the opaque fill — the number the contrast audit uses."""
    w, h = img.size
    px = img.load()
    r = g = b = n = 0
    for y in range(inset, h - inset):
        for x in range(inset, w - inset):
            pr, pg, pb, pa = px[x, y]
            if pa < 200:
                continue
            r += pr
            g += pg
            b += pb
            n += 1
    if not n:
        return '#000000'
    return '#%02x%02x%02x' % (r // n, g // n, b // n)


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(root, 'public', 'assets', 'ui-kit'))
    ap.add_argument('--preview', default=None)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    assets = {
        # 281x292 containers — Container1 (slice 50), Container3 (slice 30),
        # ContainerAdvanced4 (slice 40/35)
        'frame_panel.png': plate(281, 292, 50, 50),
        'frame_panel_soft.png': plate(
            281, 292, 30, 30, fill_stops=[(0.0, (26, 31, 42, 255)), (1.0, (12, 15, 21, 255))]
        ),
        'frame_panel_inset.png': plate(
            281, 292, 40, 35, fill_stops=[(0.0, (16, 20, 28, 255)), (1.0, (10, 12, 18, 255))]
        ),
        # 1090x330 note card (slice 30)
        'frame_note.png': plate(
            1090, 330, 30, 30, fill_stops=[(0.0, (26, 31, 42, 255)), (0.6, (18, 22, 30, 255)), (1.0, (12, 15, 21, 255))]
        ),
        # 1511x384 chrome bar (slice 40/60)
        'frame_bar.png': plate_bar(1511, 384, 60, 40),
        # 377x160 plates (slice 28/50)
        'btn_iron.png': button(
            377, 160, 50, 28, top=(62, 72, 92, 255), mid=(38, 46, 62, 255), bot=(22, 27, 37, 255), accent=BRONZE, ink_line=(150, 166, 194, 255)
        ),
        'btn_gold.png': button(
            377, 160, 50, 28, top=GOLD_BTN_TOP, mid=GOLD_BTN_MID, bot=GOLD_BTN_BOT, accent=GOLD_DARK, ink_line=GOLD_LIT
        ),
        'btn_crimson.png': button(
            377, 160, 50, 28, top=CRIM_TOP, mid=CRIM_MID, bot=CRIM_BOT, accent=BRONZE, ink_line=CRIM_LIT
        ),
        'btn_ghost.png': button(
            377, 160, 50, 28, top=GHOST_TOP, mid=(24, 29, 39, 255), bot=GHOST_BOT, accent=(52, 62, 78, 255), ink_line=(92, 106, 128, 255)
        ),
        # 152x160 square close button (slice 24)
        'btn_square.png': button(
            152, 160, 24, 24, top=(60, 70, 90, 255), mid=(36, 44, 58, 255), bot=(20, 25, 34, 255), accent=BRONZE, ink_line=(150, 166, 194, 255)
        ),
        # 281x343 cards (slice 35/30)
        'card_iron.png': plate_card(281, 343, 30, 35, accent=BRONZE, fill_stops=[(0.0, (30, 36, 49, 255)), (1.0, (14, 17, 24, 255))]),
        'card_crimson.png': plate_card(
            281, 342, 30, 35, accent=BRONZE, fill_stops=[(0.0, (58, 16, 26, 255)), (1.0, (24, 8, 12, 255))]
        ),
        # 137x148 sockets (slice 20)
        'slot.png': plate_slot(137, 148, 20, 20),
        'slot_sel.png': plate_slot(138, 148, 20, 20, selected=True),
        # FX
        'fx_glow.png': fx_glow(),
        'fx_ring.png': fx_ring(),
        'cursor.png': cursor(),
        'cursor_click.png': cursor(clicked=True),
    }
    assets.update({f'{name}.png': img for name, img in glyphs().items()})
    assets.update(heraldic_marks())
    # Cinematic menu kit — see the CINEMATIC KIT section. Same geometry the
    # old plates used, so a rule can swap one border-image for another.
    assets.update({
        'plaque_gold.png': plaque(
            480, 200, 60, 56, stops=GOLD_STOPS, edge=GOLD_LIT, accent=GOLD, ink=(32, 20, 4, 255)
        ),
        'plaque_steel.png': plaque(
            480, 200, 60, 56, stops=STEEL_STOPS, edge=STEEL_LINE, accent=BRONZE, ink=INK
        ),
        'plaque_crimson.png': plaque(
            480, 200, 60, 56, stops=CRIMSON_STOPS, edge=(168, 70, 84, 255), accent=BRONZE, ink=INK
        ),
        'plaque_dark.png': plaque(
            480, 200, 60, 56, stops=DARK_STOPS, edge=STEEL_LINE, accent=GOLD_DARK, ink=INK
        ),
        'plate_tile.png': tile_plate(240, 168, 30, 30),
        'chip_metal.png': chip_plate(220, 96, 26, 24),
    })

    for name, img in assets.items():
        img.save(os.path.join(args.out, name))

    measured = {
        'panel': average(assets['frame_panel.png'], 12),
        'panelSoft': average(assets['frame_panel_soft.png'], 12),
        'note': average(assets['frame_note.png'], 14),
        'bar': average(assets['frame_bar.png'], 20),
        'iron': average(assets['btn_iron.png'], 24),
        'gold': average(assets['btn_gold.png'], 24),
        'crimson': average(assets['btn_crimson.png'], 24),
        'ghost': average(assets['btn_ghost.png'], 24),
        'card': average(assets['card_iron.png'], 20),
        'cardCrimson': average(assets['card_crimson.png'], 20),
        'slot': average(assets['slot.png'], 12),
        'slotSel': average(assets['slot_sel.png'], 12),
        'plaqueGold': average(assets['plaque_gold.png'], 34),
        'plaqueSteel': average(assets['plaque_steel.png'], 34),
        'plaqueCrimson': average(assets['plaque_crimson.png'], 34),
        'plaqueDark': average(assets['plaque_dark.png'], 34),
        'tile': average(assets['plate_tile.png'], 20),
        'chip': average(assets['chip_metal.png'], 18),
    }

    for name, img in sorted(assets.items()):
        print(f'  {name:<24} {img.size[0]}x{img.size[1]}')
    print('\nmeasured sprite averages (feed these into SURFACES):')
    for k, v in measured.items():
        print(f'  {k:<12} {v}')

    if args.preview:
        pad, cell, cols = 14, 150, 6
        rows = math.ceil(len(assets) / cols)
        sheet = Image.new('RGBA', (cols * (cell + pad) + pad, rows * (cell + pad) + pad), (10, 13, 18, 255))
        draw = ImageDraw.Draw(sheet)
        for i, (name, img) in enumerate(sorted(assets.items())):
            cx = pad + (i % cols) * (cell + pad)
            cy = pad + (i // cols) * (cell + pad)
            thumb = img.copy()
            thumb.thumbnail((cell, cell), Image.NEAREST)
            sheet.alpha_composite(thumb, (cx + (cell - thumb.width) // 2, cy + (cell - thumb.height) // 2))
            draw.rectangle([cx, cy, cx + cell - 1, cy + cell - 1], outline=(52, 62, 80, 255))
            draw.text((cx + 3, cy + cell - 12), name.replace('.png', ''), fill=(214, 196, 160, 255))
        sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(args.preview)
        print(f'preview -> {args.preview}')

    print(f'\n{len(assets)} sprites -> {args.out}')


if __name__ == '__main__':
    main()
