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
