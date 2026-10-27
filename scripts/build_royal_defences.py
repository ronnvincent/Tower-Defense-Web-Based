#!/usr/bin/env python3
"""Draw the ten royal defence lines — five authored tiers each.

Why this exists
---------------
The ten royal defences (siege artillery, ballista, arcane sniper, mortar, frost,
tesla, skybreaker, workshop, obelisk, spike trap) had no art pipeline: their
spritesheets cannot be downloaded (this repository's licence rule allows only
verified free sources, and the sandbox cannot reach any art site), and a
recolour of an archer is explicitly rejected. So the art is *drawn here*, in
code, and regenerated deterministically:

    python3 scripts/build_royal_defences.py     # writes PNGs + JS tables
    python3 scripts/check_royal_art.py          # validates every sheet

Every tier is a different structure, not a tint: the silhouette grows by one
real addition per level (foundation → banding → emplacement → machinery →
royal trim). The generator measures each drawing and emits the pivot, mount and
muzzle geometry into `src/data/royalTowerArt.js`, so `Tower` aims the real
barrel tip instead of a guessed offset.

Conventions (shared with the rest of the tower art)
---------------------------------------------------
* Base image: bottom edge is the tile's ground line, origin (0.5, 1).
* Weapon sheet: six 128x128 frames — rest, prepare, charged, release, recoil,
  settle — pivot at (64, 104), barrel drawn upward (weapon rotation is 0 = up).
* Non-rotating lines (rime, workshop, obelisk, trap) still ship six frames; the
  animation carries the action instead of the turret angle.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWER_DIR = os.path.join(ROOT, "public", "assets", "towers")
PROJ_DIR = os.path.join(ROOT, "public", "assets", "projectiles")
FX_DIR = os.path.join(ROOT, "public", "assets", "fx")
UI_DIR = os.path.join(ROOT, "public", "assets", "ui")
DATA_DIR = os.path.join(ROOT, "src", "data")

# Supersampling: drawing happens at 3x and is resampled down, which is what
# keeps the outlines clean without a per-pixel palette pass.
SS = 3
BASE_W, BASE_H = 176, 176
# Widest footprint a royal structure may cover, in tile pixels (TILE_SIZE = 64).
# The older Spire towers top out at 70 px; 80 lets a royal bastion read as
# larger without painting over the neighbouring tile.
MAX_BASE_W = 80
# The tallest Spire base is 129 px; a royal bastion is allowed the same ceiling
# so no line towers over the older keep beside it.
MAX_BASE_H = 142
GROUND = 158
FRAME = 128
PIVOT = (64, 104)

OUTLINE = (26, 24, 32, 255)
INK = (18, 17, 22, 255)


# --------------------------------------------------------------------------
# colour helpers
# --------------------------------------------------------------------------

def hx(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def shade(colour, factor: float):
    """factor < 1 darkens, > 1 lightens (clamped per channel)."""
    out = []
    for i in range(3):
        value = colour[i] * factor
        out.append(max(0, min(255, int(round(value)))))
    return (out[0], out[1], out[2], colour[3] if len(colour) > 3 else 255)


WOOD = hx("#7a5230")
WOOD_L = hx("#a1734a")
WOOD_D = hx("#50341d")
IRON = hx("#4a5058")
IRON_L = hx("#7c8590")
STEEL = hx("#8f98a3")
STEEL_L = hx("#c3cbd4")
STONE = hx("#7d8188")
STONE_L = hx("#a7abb1")
STONE_D = hx("#565a60")
BRONZE = hx("#a3702f")
BRONZE_L = hx("#cf9a4e")
GOLD = hx("#d9a84a")
GOLD_L = hx("#f4d383")
GOLD_D = hx("#8d6520")
CERAMIC = hx("#e6e1d6")
COPPER = hx("#b0613a")
ICE = hx("#8fd4ee")
ICE_D = hx("#4f9fc4")
ICE_L = hx("#d7f4ff")
RUNE = hx("#9b6cff")
RUNE_L = hx("#d7c4ff")
BLOOD = hx("#8e2b2b")
SLATE = hx("#4c5560")
BRASS = hx("#d8a648")


# --------------------------------------------------------------------------
# pen: draws in final-image coordinates, scales to the supersampled canvas
# --------------------------------------------------------------------------

class Pen:
    def __init__(self, image: Image.Image):
        self.image = image
        self.d = ImageDraw.Draw(image)

    # -- primitives ------------------------------------------------------
    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=0):
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        self.d.rectangle(
            [x0 * SS, y0 * SS, x1 * SS, y1 * SS],
            fill=fill,
            outline=outline,
            width=int(width * SS),
        )

    def poly(self, pts, fill=None, outline=None, width=0):
        scaled = [(x * SS, y * SS) for x, y in pts]
        if outline and width:
            self.d.polygon(scaled, fill=outline)
            inner = _inset(pts, width)
            if len(inner) >= 3:
                self.d.polygon([(x * SS, y * SS) for x, y in inner], fill=fill)
            return
        self.d.polygon(scaled, fill=fill, outline=outline, width=int(width * SS))

    def disc(self, cx, cy, r, fill=None, outline=None, width=0):
        self.d.ellipse(
            [(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS],
            fill=fill,
            outline=outline,
            width=int(width * SS),
        )

    def ring(self, cx, cy, r, outline, width=1.0):
        self.d.ellipse(
            [(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS],
            outline=outline,
            width=max(1, int(width * SS)),
        )

    def line(self, pts, fill, width=1.0):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=fill, width=max(1, int(width * SS)), joint="curve")

    def arc(self, cx, cy, r, start, end, fill, width=1.0):
        self.d.arc(
            [(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS],
            start=start,
            end=end,
            fill=fill,
            width=max(1, int(width * SS)),
        )

    def text_block(self, x, y, w, h, colour, rows=2):
        """Little carved-runner detail: reads as engraving at 64 px."""
        step = h / (rows + 1)
        for row in range(rows):
            yy = y + step * (row + 1)
            self.line([(x, yy), (x + w, yy)], colour, 1)


def _inset(pts, amount):
    """Shrink a polygon toward its centroid — a cheap, stable inner outline."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        dist = math.hypot(dx, dy) or 1.0
        k = max(0.0, (dist - amount)) / dist
        out.append((cx + dx * k, cy + dy * k))
    return out


def new_base():
    return Image.new("RGBA", (BASE_W * SS, BASE_H * SS), (0, 0, 0, 0))


def new_frame():
    return Image.new("RGBA", (FRAME * SS, FRAME * SS), (0, 0, 0, 0))


def downsample(image: Image.Image) -> Image.Image:
    w = image.width // SS
    h = image.height // SS
    return image.resize((w, h), Image.LANCZOS)


def has_alpha(image: Image.Image) -> bool:
    alpha = image.getchannel("A")
    return alpha.getextrema()[0] < 250


# --------------------------------------------------------------------------
# shared structure helpers
# --------------------------------------------------------------------------

def ground_shadow(p: Pen, half_w: float, y: float = GROUND - 2):
    """Soft contact shadow so a tower never floats on the tile."""
    mid = BASE_W / 2
    p.d.ellipse(
        [(mid - half_w) * SS, (y - 5) * SS, (mid + half_w) * SS, (y + 6) * SS],
        fill=(20, 18, 24, 70),
    )


def cx(p: Pen) -> float:
    return BASE_W / 2


def bricks(p: Pen, x0, y0, x1, y1, mortar, step=7):
    """Stone courses: horizontal mortar lines + staggered vertical joints."""
    y = y0 + step
    row = 0
    while y < y1 - 1:
        p.line([(x0, y), (x1, y)], mortar, 0.8)
        offset = 0 if row % 2 == 0 else step
        x = x0 + offset
        while x < x1 - 1:
            p.line([(x, y - step), (x, y)], mortar, 0.8)
            x += step * 2
        y += step
        row += 1


def rivets(p: Pen, x0, y0, x1, y1, colour, step=9, r=1.1):
    x = x0
    while x <= x1:
        p.disc(x, y0, r, fill=colour)
        p.disc(x, y1, r, fill=colour)
        x += step
    y = y0
    while y <= y1:
        p.disc(x0, y, r, fill=colour)
        p.disc(x1, y, r, fill=colour)
        y += step


def banded_post(p: Pen, x, y0, y1, w, body, band, bands=3, cap=True):
    p.rect(x - w / 2, y1, x + w / 2, y0, fill=body, outline=OUTLINE, width=1.2)
    for i in range(bands):
        t = (i + 0.5) / bands
        yy = y0 + (y1 - y0) * t
        p.rect(x - w / 2 - 0.6, yy - 1.6, x + w / 2 + 0.6, yy + 1.6, fill=band)
    if cap:
        p.rect(x - w / 2 - 1.2, y0 - 2.4, x + w / 2 + 1.2, y0 + 0.6, fill=band, outline=OUTLINE, width=1)


def wheel(p: Pen, x, y, r, rim, spoke, hub):
    p.disc(x, y, r, fill=rim, outline=OUTLINE, width=1.4)
    p.disc(x, y, r * 0.62, fill=shade(rim, 0.82))
    for k in range(6):
        a = math.radians(k * 30)
        p.line([(x - math.cos(a) * r * 0.62, y - math.sin(a) * r * 0.62),
                (x + math.cos(a) * r * 0.62, y + math.sin(a) * r * 0.62)], spoke, 1.2)
    p.disc(x, y, r * 0.2, fill=hub, outline=OUTLINE, width=0.8)


def pennant(p: Pen, x, y, h, colour, flip=1):
    p.line([(x, y), (x, y - h)], INK, 1.4)
    p.poly([(x, y - h), (x + 9 * flip, y - h + 3.2), (x, y - h + 6.4)], fill=colour, outline=OUTLINE, width=0.8)


def gear(p: Pen, x, y, r, colour, teeth=8):
    p.disc(x, y, r, fill=colour, outline=OUTLINE, width=1.1)
    for k in range(teeth):
        a = math.radians(k * (360 / teeth))
        px, py = x + math.cos(a) * r, y + math.sin(a) * r
        p.rect(px - 1.6, py - 1.6, px + 1.6, py + 1.6, fill=colour)
    p.disc(x, y, r * 0.36, fill=shade(colour, 0.7))


def spark(p: Pen, x, y, r, colour):
    p.line([(x - r, y), (x + r, y)], colour, 1.2)
    p.line([(x, y - r), (x, y + r)], colour, 1.2)
    d = r * 0.7
    p.line([(x - d, y - d), (x + d, y + d)], colour, 1.0)
    p.line([(x + d, y - d), (x - d, y + d)], colour, 1.0)


# --------------------------------------------------------------------------
# foundations — the shared, level-driven footing every line grows from
# --------------------------------------------------------------------------

FOUND_W = {1: 40, 2: 44, 3: 50, 4: 56, 5: 62}
# A tier-one emplacement still has to read as a building next to a 64 px tile,
# so the shortest foundation is 42 px, not a plinth stub.
FOUND_H = {1: 88, 2: 94, 3: 100, 4: 106, 5: 114}

# Per-line silhouettes: the same royal masonry, but a different width/height
# ratio and a different crown, so two lines never look like one tower with two
# guns. `crest` is drawn on top of the crenellations at levels 4-5.
PROFILES = {
    "royalArtillery": dict(w=1.16, h=0.92, crest="round"),
    "siegeBallista": dict(w=0.94, h=1.00, crest="pikes"),
    "arcaneSniper": dict(w=0.82, h=1.00, crest="spires"),
    "mortar": dict(w=1.10, h=0.86, crest="round"),
    "rimeTower": dict(w=0.96, h=1.04, crest="ice"),
    "tesla": dict(w=0.90, h=1.04, crest="rods"),
    "skybreaker": dict(w=1.00, h=1.00, crest="dish"),
    "workshop": dict(w=1.20, h=0.80, crest="chimney"),
    "obelisk": dict(w=0.88, h=1.02, crest="carved"),
    "spikeTrap": dict(w=1.00, h=1.00, crest="round"),
}
DEFAULT_PROFILE = dict(w=1.0, h=1.0, crest="round")

# The second branch wears a different crown, so the two silhouettes differ at
# the roofline even before the weapon is drawn.
B_CREST_SWAP = {
    "round": "pikes",
    "pikes": "spires",
    "spires": "carved",
    "carved": "round",
    "ice": "rods",
    "rods": "ice",
    "dish": "chimney",
    "chimney": "dish",
}


def foundation(p: Pen, level: int, stone=True, profile=None, variant: str = "a"):
    """One real structural step per tier, so L1…L5 are not a tint ramp.

    L1 timber deck → L2 stone footing + iron brackets → L3 stepped emplacement
    with a railing → L4 bastion with buttresses and crenellations → L5 royal
    bastion with a gold band, carved emblem and corner spires.
    """
    mid = BASE_W / 2
    profile = profile or DEFAULT_PROFILE
    w = FOUND_W[level] * profile.get("w", 1.0)
    h = FOUND_H[level] * profile.get("h", 1.0)
    if variant == "b":
        # The second branch is a *different building*, not the first one with a
        # new gun: it is slimmer and taller, wears another crown, and from L3 it
        # carries a round side turret that the other branch never gets.
        w *= 0.90
        h *= 1.05
    top = GROUND - h
    left, right = mid - w / 2, mid + w / 2

    ground_shadow(p, w * 0.62)

    if level == 1:
        # Timber tower: four legs, a braced frame and a plank deck. It has to
        # stand as tall as an archer tower or the cheapest royal line reads as
        # a crate lying on the grass.
        for x in (left + 5, right - 5):
            p.rect(x - 3.0, top + 4, x + 3.0, GROUND - 2, fill=WOOD, outline=OUTLINE, width=1.2)
            for yy in range(int(top + 16), int(GROUND - 8), 22):
                p.line([(x - 3, yy), (x + 3, yy + 8)], WOOD_L, 1.2)
        p.rect(left + 2, GROUND - 12, right - 2, GROUND - 2, fill=WOOD_D, outline=OUTLINE, width=1.0)
        # Back brace so the tower is not see-through on a busy tile.
        p.rect(mid - 5, top + 10, mid + 5, GROUND - 12, fill=shade(WOOD, 0.86), outline=OUTLINE, width=1.1)
        for yy in range(int(top + 16), int(GROUND - 16), 14):
            p.line([(mid - 5, yy), (mid + 5, yy + 6)], WOOD_D, 0.9)
        # Deck, railing and rope lashing.
        p.rect(left, top, right, top + 9, fill=WOOD_L, outline=OUTLINE, width=1.5)
        p.rect(left, top + 6, right, top + 9, fill=WOOD_D)
        for x in (left + 3, mid, right - 3):
            p.rect(x - 1.4, top - 9, x + 1.4, top + 2, fill=WOOD, outline=OUTLINE, width=0.9)
        p.line([(left + 3, top - 8), (right - 3, top - 8)], WOOD_L, 1.4)
        for x in (left + 4, mid, right - 4):
            p.line([(x - 2.4, top + 2), (x + 2.4, top + 7)], hx("#d8c08a"), 1.2)
        return top

    # L2+ — masonry starts.
    p.rect(left, top, right, GROUND - 1, fill=STONE, outline=OUTLINE, width=1.6)
    bricks(p, left, top, right, GROUND - 2, shade(STONE_D, 0.9), 8)
    p.rect(left, top, right, top + 5, fill=STONE_L, outline=OUTLINE, width=1.2)
    p.rect(left, GROUND - 6, right, GROUND - 1, fill=STONE_D, outline=OUTLINE, width=1.0)

    if level == 2:
        # Iron straps and corner brackets: the tier where the crew started
        # bolting the carriage down instead of tying it.
        for x in (left + 4, right - 4):
            p.rect(x - 2.4, top + 4, x + 2.4, GROUND - 3, fill=IRON, outline=OUTLINE, width=1.0)
            rivets(p, x - 2.4, top + 8, x + 2.4, GROUND - 6, IRON_L, 8, 0.9)
        p.rect(left - 2, GROUND - 12, right + 2, GROUND - 8, fill=IRON, outline=OUTLINE, width=1.0)
        return top

    # L3+ — a step and a railing.
    p.rect(left - 6, GROUND - 10, right + 6, GROUND - 1, fill=STONE, outline=OUTLINE, width=1.4)
    p.rect(left - 6, GROUND - 10, right + 6, GROUND - 7, fill=STONE_L)
    p.rect(left, top - 6, right, top + 2, fill=STONE_L, outline=OUTLINE, width=1.4)
    for x in (left + 4, right - 4):
        p.rect(x - 1.4, top - 14, x + 1.4, top - 4, fill=IRON, outline=OUTLINE, width=0.9)
    p.line([(left + 4, top - 13), (right - 4, top - 13)], IRON, 1.4)
    if variant == "b":
        # Round side turret with a slate cone and an arrow slit.
        tx = right + 5
        ty = top + 14
        p.rect(tx - 7, ty, tx + 7, GROUND - 5, fill=shade(STONE, 0.95), outline=OUTLINE, width=1.4)
        bricks(p, tx - 7, ty, tx + 7, GROUND - 6, shade(STONE_D, 0.92), 6)
        p.rect(tx - 8.5, ty - 4, tx + 8.5, ty + 1, fill=STONE_L, outline=OUTLINE, width=1.1)
        p.poly([(tx - 9, ty - 4), (tx, ty - 19), (tx + 9, ty - 4)], fill=SLATE, outline=OUTLINE, width=1.2)
        p.line([(tx - 6, ty - 7), (tx + 6, ty - 7)], shade(SLATE, 0.8), 0.9)
        p.rect(tx - 1.6, ty + 8, tx + 1.6, ty + 16, fill=INK)
        pennant(p, tx + 2, ty - 19, 12, BLOOD)

    if variant == "b" and level >= 4:
        # A lean-to annex on the left. Branch B grows *outwards* as it upgrades:
        # the crew that works the second machine gets a roof, and the building's
        # outline changes instead of only its height.
        ax = left - 4
        p.rect(ax - 7, GROUND - 36, ax + 8, GROUND - 2, fill=shade(STONE, 0.92),
               outline=OUTLINE, width=1.3)
        bricks(p, ax - 7, GROUND - 36, ax + 8, GROUND - 4, shade(STONE_D, 0.88), 6)
        p.poly([(ax - 9, GROUND - 36), (ax + 1, GROUND - 47), (ax + 11, GROUND - 36)],
               fill=SLATE, outline=OUTLINE, width=1.1)
        p.line([(ax - 9, GROUND - 36), (ax + 1, GROUND - 45)], shade(SLATE, 0.78), 0.9)
        p.rect(ax - 2, GROUND - 26, ax + 4, GROUND - 14, fill=INK)
        p.rect(ax + 4.5, GROUND - 24, ax + 7, GROUND - 20, fill=GOLD_D)
    if variant == "b" and level >= 5:
        # Brass gallery bridging the side turret to the keep, hung with finials.
        p.rect(left - 4, top + 15, right + 13, top + 22, fill=BRASS, outline=OUTLINE, width=1.2)
        for x in (left - 4, right + 13):
            p.rect(x - 2, top + 4, x + 2, top + 16, fill=STEEL, outline=OUTLINE, width=1.0)
            p.poly([(x - 3, top + 4), (x, top - 4), (x + 3, top + 4)], fill=GOLD, outline=OUTLINE, width=0.8)
        p.disc(mid, top + 18.5, 3.4, fill=GOLD_L)
        for k in range(4):
            p.rect(left - 2 + k * 14, top + 22, left + 0.5 + k * 14, top + 27, fill=STEEL_L)
        # The annex gains a storey and a pair of banners: level 5 is the widest
        # and busiest silhouette in the roster, so it cannot read as level 4.
        ax2 = left - 4
        p.rect(ax2 - 7, GROUND - 54, ax2 + 8, GROUND - 34, fill=shade(STONE, 0.86),
               outline=OUTLINE, width=1.2)
        p.rect(ax2 - 8, GROUND - 55, ax2 + 9, GROUND - 52, fill=STONE_L, outline=OUTLINE, width=1.0)
        pennant(p, ax2 + 9, GROUND - 54, 14, BLOOD)
        pennant(p, right + 14, top + 2, 13, BLOOD)

    if level == 3:
        return top

    # L4+ — buttresses and crenellations.
    for x in (left + 3, right - 3):
        p.poly([(x - 5, GROUND - 8), (x + 5, GROUND - 8), (x + 3, top + 6), (x - 3, top + 6)],
               fill=STONE_L, outline=OUTLINE, width=1.2)
        p.rect(x - 5.5, top + 14, x + 5.5, top + 18, fill=IRON, outline=OUTLINE, width=0.8)
    crest = profile.get("crest", "round")
    if variant == "b":
        crest = B_CREST_SWAP.get(crest, "round")
    _crest(p, level, crest, left, right, top)
    if level == 4:
        pennant(p, right - 4, top - 12, 18, BLOOD)
        return top - 8

    # L5 — gold band, emblem, corner spires.
    p.rect(left - 2, top + 2, right + 2, top + 7, fill=GOLD, outline=OUTLINE, width=1.2)
    p.rect(left - 2, top + 2, right + 2, top + 4, fill=GOLD_L)
    p.disc(mid, top + 22, 7, fill=shade(STONE_D, 1.1), outline=GOLD, width=1.4)
    p.poly([(mid, top + 16), (mid + 4, top + 22), (mid, top + 28), (mid - 4, top + 22)], fill=GOLD_L)
    for x in (left - 4, right + 4):
        p.rect(x - 2.6, top - 18, x + 2.6, top + 4, fill=STONE, outline=OUTLINE, width=1.0)
        p.poly([(x - 3.4, top - 18), (x, top - 27), (x + 3.4, top - 18)], fill=GOLD, outline=OUTLINE, width=0.9)
        p.disc(x, top - 30, 2.2, fill=GOLD_L)
    pennant(p, right + 4, top - 30, 16, GOLD)
    return top - 8


# --------------------------------------------------------------------------
# turret-space helpers (frame coordinates; pivot at PIVOT)
# --------------------------------------------------------------------------

def tube(p: Pen, level, length, width, colour, bands=3, rec=0.0, muzzle_ring=True,
         taper=0.82, glow=None):
    """A barrel drawn upward from the pivot; returns the tip distance."""
    px, py = PIVOT
    base_y = py + rec
    tip_y = base_y - length
    half = width / 2
    neck = half * taper
    p.poly([(px - half, base_y), (px + half, base_y), (px + neck, tip_y), (px - neck, tip_y)],
           fill=colour, outline=OUTLINE, width=1.6)
    # left-side highlight, right-side shadow: reads as a cylinder at 64 px
    p.poly([(px - half + 1.4, base_y - 2), (px - half * 0.32, base_y - 2),
            (px - neck * 0.32, tip_y + 2), (px - neck + 1.2, tip_y + 2)],
           fill=shade(colour, 1.24))
    p.poly([(px + half - 1.4, base_y - 2), (px + half * 0.42, base_y - 2),
            (px + neck * 0.42, tip_y + 2), (px + neck - 1.2, tip_y + 2)],
           fill=shade(colour, 0.72))
    band_colour = GOLD if level >= 5 else (BRONZE_L if level >= 4 else IRON_L)
    for i in range(bands):
        t = (i + 0.6) / (bands + 0.2)
        yy = base_y - length * t
        hw = half + (neck - half) * t
        p.rect(px - hw - 0.8, yy - 1.8, px + hw + 0.8, yy + 1.8, fill=band_colour, outline=OUTLINE, width=0.8)
    if muzzle_ring:
        p.rect(px - neck - 1.6, tip_y - 2.6, px + neck + 1.6, tip_y + 0.8, fill=band_colour, outline=OUTLINE, width=1.0)
    if glow:
        # Charge is drawn as an orb growing *at the muzzle*, so the prepare and
        # charged frames differ from rest by more than a couple of pixels.
        p.disc(px, tip_y - 1.4, min(6.0, width * 0.34), fill=glow)
    # breech block
    p.rect(px - half - 1.4, base_y - 4, px + half + 1.4, base_y + 5.5, fill=shade(colour, 0.82), outline=OUTLINE, width=1.2)
    p.disc(px, base_y + 6.5, 2.6, fill=band_colour)
    return length + 2.6


def charge_orb(p: Pen, amount, size, colour):
    """Growing energy at the muzzle — the visual half of "this shot is loaded"."""
    if amount <= 0.05:
        return
    px, py = PIVOT
    tip_y = py - size
    r = 2.2 + 4.4 * amount
    p.disc(px, tip_y - r * 0.4, r, fill=(*colour[:3], 120))
    p.disc(px, tip_y - r * 0.4, r * 0.62, fill=(*colour[:3], 200))
    p.disc(px, tip_y - r * 0.4, r * 0.3, fill=(255, 255, 255, 230))


def flash_cone(p: Pen, size, colour_inner, colour_outer, at=0.0):
    """A muzzle flash drawn as separate tongues of fire, not a solid pyramid.

    A filled triangle at this scale reads as a traffic cone glued to the barrel;
    three tapering tongues with a hot core read as a discharge even on a 64 px
    tile. `at` is the distance *up from the pivot* the flash sits at — always the
    mouth of the barrel, so the fire is never drawn inside the carriage.
    """
    px, py = PIVOT
    py -= at
    tongues = [(-1.0, 0.55, 1.15), (0.0, 0.34, 1.55), (1.0, 0.55, 1.15),
               (-0.55, 0.28, 0.85), (0.55, 0.28, 0.85)]
    for offset, width, length in tongues:
        cx = px + offset * size * 0.5
        half = size * width * 0.5
        tip_y = py - size * length
        p.poly([(cx - half, py), (cx - half * 0.35, tip_y + size * 0.22),
                (cx, tip_y), (cx + half * 0.35, tip_y + size * 0.22), (cx + half, py)],
               fill=colour_outer)
        inner_half = half * 0.55
        p.poly([(cx - inner_half, py), (cx, py - size * length * 0.72), (cx + inner_half, py)],
               fill=colour_inner)
    p.disc(px, py, size * 0.34, fill=(255, 255, 255, 235))


def crystal(p: Pen, x, y, w, h, colour, alpha=1.0, outline=True):
    p.poly([(x, y - h / 2), (x + w / 2, y), (x, y + h / 2), (x - w / 2, y)],
           fill=colour, outline=OUTLINE if outline else None, width=1.2)
    p.poly([(x, y - h / 2 + 2), (x + w / 2 - 2, y), (x, y + h / 2 - 2)],
           fill=shade(colour, 1.22))


def coil(p: Pen, x, y, w, turns, colour, height=26):
    for i in range(turns):
        yy = y - i * (height / turns)
        p.arc(x, yy, w / 2, 200, 340, colour, 2.0)


# --------------------------------------------------------------------------
# 1. Royal siege artillery
# --------------------------------------------------------------------------

def _crest(p: Pen, level: int, crest: str, left, right, top):
    """The line's crown — the cheapest way to keep ten towers distinguishable."""
    count = 5
    if crest == "round":
        for k in range(count):
            x = left + 4 + k * (right - left - 8) / (count - 1)
            p.disc(x, top - 8, 4.0, fill=STONE, outline=OUTLINE, width=1.0)
            p.arc(x, top - 8, 4.0, 200, 340, STONE_L, 1.0)
        return
    if crest == "spires":
        for k in range(count):
            x = left + 4 + k * (right - left - 8) / (count - 1)
            p.poly([(x - 3.2, top - 4), (x, top - 18), (x + 3.2, top - 4)], fill=STONE_L, outline=OUTLINE, width=0.9)
        return
    if crest == "pikes":
        for k in range(count):
            x = left + 4 + k * (right - left - 8) / (count - 1)
            p.rect(x - 2.6, top - 12, x + 2.6, top - 4, fill=STONE, outline=OUTLINE, width=0.9)
            p.poly([(x - 1.6, top - 12), (x, top - 18), (x + 1.6, top - 12)], fill=STEEL_L, outline=OUTLINE, width=0.7)
        return
    if crest == "ice":
        for k in range(count):
            x = left + 4 + k * (right - left - 8) / (count - 1)
            crystal(p, x, top - 8, 6, 16, ICE)
        return
    if crest == "rods":
        for k in range(count):
            x = left + 4 + k * (right - left - 8) / (count - 1)
            p.rect(x - 1.6, top - 16, x + 1.6, top - 4, fill=COPPER, outline=OUTLINE, width=0.8)
            p.disc(x, top - 17, 2.2, fill=GOLD_L)
        return
    if crest == "dish":
        p.poly([(left + 6, top - 4), (left + 6, top - 16), (right - 6, top - 16), (right - 6, top - 4)],
               fill=shade(STEEL, 0.9), outline=OUTLINE, width=1.0)
        for k in range(4):
            x = left + 10 + k * (right - left - 20) / 3
            p.rect(x - 1.4, top - 14, x + 1.4, top - 6, fill=INK)
        return
    if crest == "chimney":
        for k in range(3):
            x = left + 8 + k * (right - left - 16) / 2
            p.rect(x - 3.2, top - 16, x + 3.2, top - 4, fill=STONE_D, outline=OUTLINE, width=0.9)
            p.rect(x - 4, top - 18, x + 4, top - 15, fill=STONE_L)
        return
    if crest == "carved":
        for k in range(3):
            x = left + 8 + k * (right - left - 16) / 2
            p.rect(x - 4, top - 14, x + 4, top - 4, fill=hx("#4a4356"), outline=OUTLINE, width=0.9)
            p.line([(x, top - 12), (x, top - 6)], RUNE, 1.0)
        return
    for k in range(count):
        x = left + 4 + k * (right - left - 8) / (count - 1)
        p.rect(x - 3.4, top - 13, x + 3.4, top - 5, fill=STONE, outline=OUTLINE, width=1.0)


def base_royalArtillery(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["royalArtillery"])
    mid = BASE_W / 2
    if level <= 2:
        r = 13 + level * 1.5
        wheel(p, mid - 17, GROUND - r - 3, r, WOOD_L, WOOD_D, IRON)
        wheel(p, mid + 17, GROUND - r - 3, r, WOOD_L, WOOD_D, IRON)
        p.rect(mid - 24, top + 2, mid + 24, top + 9, fill=WOOD, outline=OUTLINE, width=1.2)
    else:
        # A stone emplacement swallows the wheels: the carriage is gone.
        p.rect(mid - 26, top + 4, mid + 26, GROUND - 14, fill=shade(STONE, 0.92), outline=OUTLINE, width=1.4)
        # Courses, so the platform is masonry and not a grey box.
        bricks(p, mid - 26, top + 4, mid + 26, GROUND - 15, shade(STONE_D, 0.95), 7)
        p.rect(mid - 30, top + 8, mid + 30, top + 12, fill=STONE_L, outline=OUTLINE, width=1.0)
        for x in (mid - 22, mid + 22):
            p.rect(x - 2, GROUND - 20, x + 2, GROUND - 12, fill=IRON, outline=OUTLINE, width=0.9)
    if level >= 2:
        # Shell pyramid grows one row per tier.
        rows = min(3, level - 1)
        for row in range(rows):
            for k in range(row + 1):
                sx = mid + 24 - k * 5.5 + row * 2.6
                sy = GROUND - 8 - row * 6
                p.disc(sx, sy, 3.2, fill=IRON, outline=OUTLINE, width=0.9)
                p.disc(sx, sy - 0.6, 1.4, fill=IRON_L)
    if level >= 4:
        # Counterweight frame behind the breech.
        p.rect(mid - 34, top - 6, mid - 22, top + 8, fill=IRON, outline=OUTLINE, width=1.2)
        p.disc(mid - 28, top - 9, 5.5, fill=STEEL, outline=OUTLINE, width=1.2)
        p.disc(mid - 28, top - 9, 2.0, fill=STEEL_L)
    if level >= 5:
        for x in (mid - 30, mid + 30):
            p.disc(x, top + 20, 3.0, fill=GOLD, outline=OUTLINE, width=0.9)
        p.rect(mid - 12, GROUND - 26, mid + 12, GROUND - 20, fill=GOLD_D, outline=OUTLINE, width=1.0)
    return top


def weapon_royalArtillery(p: Pen, level: int, pose):
    px, py = PIVOT
    rec = pose["rec"]
    length = [40, 50, 58, 68, 78][level - 1]
    width = [17, 19, 22, 25, 29][level - 1]
    colour = [BRONZE, shade(BRONZE, 0.95), IRON, STEEL, STEEL_L][level - 1]
    # trunnions / yoke
    p.rect(px - width * 0.9, py + rec - 2, px + width * 0.9, py + rec + 8, fill=shade(colour, 0.8), outline=OUTLINE, width=1.2)
    tip = tube(p, level, length, width, colour, bands=[2, 3, 3, 4, 5][level - 1], rec=rec, glow=pose["charge"] > 0.4 and GOLD_L or None)
    if level >= 4:
        # recoil springs either side of the tube
        for side in (-1, 1):
            sx = px + side * (width * 0.62 + 3)
            p.line([(sx, py + rec), (sx, py + rec - length * 0.55)], IRON_L, 1.2)
            for k in range(6):
                yy = py + rec - 3 - k * (length * 0.09)
                p.line([(sx - 1.6, yy), (sx + 1.6, yy - 2)], STEEL, 1.0)
    if level >= 5:
        p.ring(px, py + rec - length * 0.78, width * 0.72, GOLD, 1.6)
        p.disc(px, py + rec - length * 0.34, 2.2, fill=GOLD_L)
    charge_orb(p, pose["charge"], length, hx("#ffd47a"))
    if pose["flash"]:
        flash_cone(p, 8 + level * 1.4, hx("#fff3c0"), hx("#ff9d3c"), at=length + rec)
    return tip


# --------------------------------------------------------------------------
# 2. Siege ballista
# --------------------------------------------------------------------------

def base_siegeBallista(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["siegeBallista"])
    mid = BASE_W / 2
    # Swivel post: timber → iron-banded → steel bearing.
    post_w = [7, 8.5, 10, 11, 12][level - 1]
    post_col = WOOD if level <= 2 else (IRON if level <= 4 else STEEL)
    banded_post(p, mid, top - 10, GROUND - 12, post_w, post_col, GOLD if level == 5 else IRON_L, bands=level + 1)
    if level == 1:
        for side in (-1, 1):
            p.line([(mid, top + 6), (mid + side * 20, GROUND - 4)], WOOD, 3.2)
            p.line([(mid, top + 6), (mid + side * 20, GROUND - 4)], OUTLINE, 0.0)
    else:
        p.disc(mid, top - 10, post_w * 0.62, fill=GOLD if level == 5 else STEEL, outline=OUTLINE, width=1.2)
        p.disc(mid, top - 10, post_w * 0.26, fill=STONE_D)
    if level >= 2:
        # Winch drum and crank.
        p.rect(mid + 10, top + 4, mid + 24, top + 14, fill=IRON, outline=OUTLINE, width=1.1)
        p.disc(mid + 24, top + 9, 3.4, fill=STEEL, outline=OUTLINE, width=1.0)
        p.line([(mid + 24, top + 9), (mid + 30, top + 2)], IRON_L, 1.4)
    if level >= 3:
        # Bolt rack: this line stops hunting for ammunition.
        for k in range(3):
            x = mid - 30 + k * 4.2
            p.line([(x, GROUND - 22), (x + 2, GROUND - 40)], WOOD_L, 1.6)
            p.poly([(x + 2, GROUND - 40), (x + 4.4, GROUND - 35), (x + 0.4, GROUND - 36)], fill=STEEL_L)
        p.rect(mid - 34, GROUND - 22, mid - 20, GROUND - 18, fill=WOOD, outline=OUTLINE, width=1.0)
    if level >= 4:
        for side in (-1, 1):
            p.rect(mid + side * 18 - 3, top - 4, mid + side * 18 + 3, top + 14, fill=STEEL, outline=OUTLINE, width=1.1)
            p.disc(mid + side * 18, top - 5, 3.0, fill=STEEL_L, outline=OUTLINE, width=0.9)
    if level >= 5:
        for side in (-1, 1):
            pennant(p, mid + side * 26, top - 6, 14, GOLD, flip=side)
    return top - 10


def weapon_siegeBallista(p: Pen, level: int, pose):
    px, py = PIVOT
    stock_len = [46, 54, 60, 68, 76][level - 1]
    arm = [18, 22, 26, 30, 34][level - 1]
    pull = pose["draw"]
    # stock / rail
    p.rect(px - 3.4, py - stock_len, px + 3.4, py + 8, fill=WOOD if level <= 2 else STEEL, outline=OUTLINE, width=1.4)
    p.rect(px - 1.2, py - stock_len + 3, px + 1.2, py + 6, fill=WOOD_L if level <= 2 else STEEL_L)
    # Bow limbs: one pair per tier, so the silhouette thickens with upgrades.
    # Drawn as a wide, thick bow, not a V — a ballista has to read as a
    # crossbow from across the map, not as a crane.
    limb_y = py - stock_len * 0.82
    pairs = min(3, max(1, level - 1))
    for i in range(pairs):
        y = limb_y + i * 7.0
        span = arm * (1 + 0.1 * i)
        col = WOOD_L if level <= 2 else (STEEL if level < 5 else GOLD)
        limb = [(px - span, y + 13), (px - span * 0.92, y + 4), (px - span * 0.5, y - 1),
                (px, y - 2.4), (px + span * 0.5, y - 1), (px + span * 0.92, y + 4), (px + span, y + 13)]
        p.line(limb, OUTLINE, 6.2)
        p.line(limb, col, 4.2)
        p.line([(px - span * 0.5, y - 1), (px, y - 2.4), (px + span * 0.5, y - 1)], shade(col, 1.3), 1.4)
        for side in (-1, 1):
            p.disc(px + side * span, y + 13, 2.4, fill=shade(col, 0.8), outline=OUTLINE, width=0.9)
    # string: pulled back by `pull` px toward the pivot
    tip_y = py - stock_len * 0.82
    string_y = tip_y + 6 + pull * 18
    p.line([(px - arm, tip_y + 25), (px, string_y), (px + arm, tip_y + 25)], hx("#efe9d6"), 1.4)
    # loaded bolt
    if pull > 0.15:
        p.rect(px - 1.2, tip_y - 4, px + 1.2, string_y, fill=WOOD_L, outline=OUTLINE, width=0.8)
        p.poly([(px - 3, tip_y - 12), (px, tip_y - 4), (px + 3, tip_y - 12)], fill=STEEL_L, outline=OUTLINE, width=0.7)
    if level >= 4:
        for side in (-1, 1):
            p.disc(px + side * (arm * 0.55), tip_y + 5, 2.4, fill=STEEL_L, outline=OUTLINE, width=0.8)
    if level >= 5:
        p.ring(px, tip_y + 10, arm * 0.5, GOLD, 1.2)
    if pose["flash"]:
        p.line([(px - 10, tip_y - 14), (px, tip_y - 26), (px + 10, tip_y - 14)], hx("#fff3c4"), 1.6)
    return stock_len + 2


# --------------------------------------------------------------------------
# 3. Arcane sniper
# --------------------------------------------------------------------------

def base_arcaneSniper(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["arcaneSniper"])
    mid = BASE_W / 2
    if level >= 2:
        p.ring(mid, top - 6, 13 + level, RUNE, 1.6)
        for k in range(3 + level):
            a = math.radians(k * (360 / (3 + level)) + 12)
            p.disc(mid + math.cos(a) * (13 + level), top - 6 + math.sin(a) * (13 + level), 1.5, fill=RUNE_L)
    if level >= 3:
        for side in (-1, 1):
            p.poly([(mid + side * 16 - 3.5, top + 6), (mid + side * 16 + 3.5, top + 6),
                    (mid + side * 16 + 2, top - 12), (mid + side * 16, top - 18), (mid + side * 16 - 2, top - 12)],
                   fill=hx("#3b3350"), outline=OUTLINE, width=1.0)
            p.disc(mid + side * 16, top - 2, 2.0, fill=RUNE_L)
    if level >= 4:
        # Lattice cradle: four prongs around the crystal seat.
        for k in range(4):
            a = math.radians(45 + k * 90)
            x = mid + math.cos(a) * 15
            y = top - 2 + math.sin(a) * 8
            p.line([(x, y + 8), (x * 0.82 + mid * 0.18, y - 8)], STEEL, 1.6)
            p.disc(x, y - 9, 2.0, fill=RUNE)
    if level >= 5:
        p.ring(mid, top - 2, 21, GOLD, 1.4)
        for k in range(6):
            a = math.radians(k * 60)
            p.disc(mid + math.cos(a) * 21, top - 2 + math.sin(a) * 21, 2.0, fill=GOLD_L)
    return top - 2


def weapon_arcaneSniper(p: Pen, level: int, pose):
    px, py = PIVOT
    charge = pose["charge"]
    h = [30, 38, 46, 56, 66][level - 1]
    w = [10, 12, 14, 16, 18][level - 1]
    # focusing staff
    p.rect(px - 2.4, py - 8, px + 2.4, py + 8, fill=STEEL, outline=OUTLINE, width=1.1)
    # halo rings behind the crystal
    for i in range(level):
        p.ring(px, py - h * 0.62, w * (0.55 + i * 0.16) + charge * 2.5, RUNE if i % 2 else RUNE_L, 1.0)
    crystal(p, px, py - h * 0.62, w, h, ICE if level < 4 else RUNE_L)
    if level >= 2:
        for side in (-1, 1):
            p.poly([(px + side * w * 0.42, py - h * 0.42), (px + side * w * 0.62, py - h * 0.62),
                    (px + side * w * 0.42, py - h * 0.86)], fill=RUNE, outline=OUTLINE, width=0.8)
    if level >= 4:
        for k in range(4):
            a = math.radians(45 + k * 90 + charge * 20)
            x = px + math.cos(a) * w * 0.9
            y = py - h * 0.62 + math.sin(a) * h * 0.42
            p.disc(x, y, 1.8, fill=RUNE_L)
    if pose["flash"]:
        # A real lance of light: the release frame has to read as a shot at a
        # glance, including at level one.
        p.poly([(px - 5, py - h * 0.5), (px, py - h * 1.5), (px + 5, py - h * 0.5)],
               fill=hx("#dff4ff"), outline=OUTLINE, width=1.0)
        p.poly([(px - 2, py - h * 0.5), (px, py - h * 1.3), (px + 2, py - h * 0.5)], fill=hx("#ffffff"))
        p.line([(px - 9, py - h * 0.86), (px + 9, py - h * 0.86)], hx("#bfe6ff"), 1.8)
        p.disc(px, py - h * 0.5, w * 0.7, fill=hx("#eaf7ff"))
    return h * 0.62 + h * 0.5


# --------------------------------------------------------------------------
# 4. Mortar
# --------------------------------------------------------------------------

def base_mortar(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["mortar"])
    mid = BASE_W / 2
    p.rect(mid - 24, top + 2, mid + 24, GROUND - 12, fill=shade(IRON, 1.05) if level < 3 else shade(STONE, 0.9),
           outline=OUTLINE, width=1.4)
    if level >= 3:
        bricks(p, mid - 24, top + 2, mid + 24, GROUND - 13, shade(STONE_D, 0.95), 7)
        # Iron lintel, so the stone bed reads as built rather than stacked.
        p.rect(mid - 26, top + 2, mid + 26, top + 5, fill=IRON, outline=OUTLINE, width=1.0)
    if level >= 2:
        for k in range(3):
            p.disc(mid - 18 + k * 18, GROUND - 6, 4.2, fill=hx("#b9ab8a"), outline=OUTLINE, width=0.9)
        p.rect(mid - 20, GROUND - 14, mid + 20, GROUND - 9, fill=hx("#b9ab8a"), outline=OUTLINE, width=1.0)
    if level >= 3:
        # vent ports either side of the bed
        for side in (-1, 1):
            p.rect(mid + side * 20 - 3, top - 4, mid + side * 20 + 3, top + 10, fill=STONE_D, outline=OUTLINE, width=1.0)
            p.rect(mid + side * 20 - 1.4, top - 2, mid + side * 20 + 1.4, top + 8, fill=INK)
    if level >= 4:
        # ammunition: two crates and a stack of shells
        p.rect(mid - 34, GROUND - 20, mid - 20, GROUND - 6, fill=WOOD, outline=OUTLINE, width=1.1)
        p.line([(mid - 34, GROUND - 13), (mid - 20, GROUND - 13)], GOLD_D, 1.2)
        for k in range(2):
            p.disc(mid + 26, GROUND - 12 - k * 6, 3.4, fill=IRON, outline=OUTLINE, width=0.9)
    if level >= 5:
        # quadrant arc engraved on the emplacement
        p.arc(mid, GROUND - 16, 26, 200, 340, GOLD, 1.6)
        for k in range(6):
            a = math.radians(200 + k * 28)
            p.line([(mid + math.cos(a) * 22, GROUND - 16 + math.sin(a) * 22),
                    (mid + math.cos(a) * 26, GROUND - 16 + math.sin(a) * 26)], GOLD_L, 1.0)
    return top


def weapon_mortar(p: Pen, level: int, pose):
    px, py = PIVOT
    rec = pose["rec"]
    length = [30, 36, 42, 48, 54][level - 1]
    width = [22, 25, 28, 32, 36][level - 1]
    colour = [shade(BRONZE, 0.92), BRONZE_L, STEEL, shade(STEEL, 1.05), STEEL_L][level - 1]
    # bed / baseplate
    p.rect(px - 16, py + rec - 2, px + 16, py + rec + 8, fill=shade(colour, 0.7), outline=OUTLINE, width=1.3)
    # fat, short tube: the opposite silhouette of the artillery
    tip = tube(p, level, length, width, colour, bands=1 + level, rec=rec, taper=1.06,
               glow=pose["charge"] > 0.5 and hx("#ffce7a") or None)
    p.ring(px, py + rec - length * 0.55, width * 0.62, shade(colour, 1.3), 1.2)
    if level >= 3:
        for side in (-1, 1):
            p.line([(px + side * width * 0.7, py + rec + 2), (px + side * (width * 0.9), py + rec - length * 0.35)], IRON_L, 1.2)
    if level >= 4:
        for k in range(3):
            p.rect(px - width * 0.42, py + rec - length * 0.3 - k * 4, px + width * 0.42,
                   py + rec - length * 0.3 - k * 4 + 1.6, fill=shade(colour, 0.7))
    charge_orb(p, pose["charge"], length, hx("#ffc470"))
    if pose["flash"]:
        flash_cone(p, 7 + level * 1.2, hx("#fff3c0"), hx("#ff8a2e"), at=length + rec)
        p.disc(px, py + rec - length - 6, 4 + level, fill=hx("#ffe6a0"))
    return tip


# --------------------------------------------------------------------------
# 5. Frost
# --------------------------------------------------------------------------

def base_rimeTower(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, stone=False, variant=variant)
    mid = BASE_W / 2
    # Snow cap on every tier.
    p.poly([(mid - 22, top + 2), (mid - 12, top - 4), (mid, top - 1), (mid + 12, top - 4), (mid + 22, top + 2),
            (mid + 18, top + 6), (mid - 18, top + 6)], fill=hx("#eef9ff"), outline=OUTLINE, width=0.9)
    if level >= 2:
        for side in (-1, 1):
            crystal(p, mid + side * 20, GROUND - 18, 7, 20, ICE_D)
            crystal(p, mid + side * 27, GROUND - 10, 5, 13, ICE)
    if level >= 3:
        for k in range(4):
            a = math.radians(k * 90 + 45)
            x = mid + math.cos(a) * 22
            y = top - 2 + math.sin(a) * 10
            crystal(p, x, y, 5, 14, ICE_L)
            p.disc(x, y + 7, 2.2, fill=RUNE_L)
    if level >= 4:
        p.ring(mid, top - 4, 24, ICE_L, 1.4)
        for k in range(4):
            a = math.radians(k * 90 + 20)
            crystal(p, mid + math.cos(a) * 24, top - 4 + math.sin(a) * 12, 6, 16, ICE)
    if level >= 5:
        p.ring(mid, top - 4, 30, GOLD, 1.2)
        for k in range(6):
            a = math.radians(k * 60)
            crystal(p, mid + math.cos(a) * 30, top - 4 + math.sin(a) * 14, 5, 18, ICE_L)
    return top - 4


def weapon_rimeTower(p: Pen, level: int, pose):
    px, py = PIVOT
    charge = pose["charge"]
    h = [26, 34, 42, 52, 62][level - 1]
    w = [12, 15, 18, 21, 25][level - 1]
    y = py - h * 0.55
    # Hovering shard: the cradle does not touch the ground.
    for i in range(level):
        r = w * (0.5 + i * 0.18) + charge * 3
        p.ring(px, y, r, ICE_L if i % 2 == 0 else ICE, 1.1)
    crystal(p, px, y, w, h, ICE)
    crystal(p, px, y - h * 0.18, w * 0.55, h * 0.62, ICE_L)
    if level >= 3:
        for side in (-1, 1):
            crystal(p, px + side * w * 0.62, y + h * 0.18, w * 0.34, h * 0.44, ICE_D)
    if level >= 5:
        for k in range(5):
            a = math.radians(-90 + (k - 2) * 26)
            p.line([(px, y + h * 0.2), (px + math.cos(a) * 26, y + h * 0.2 + math.sin(a) * 26)], ICE_L, 1.2)
    if pose["flash"]:
        for k in range(6):
            a = math.radians(k * 60)
            p.line([(px + math.cos(a) * 9, y + math.sin(a) * 9),
                    (px + math.cos(a) * 18, y + math.sin(a) * 18)], hx("#e8fbff"), 1.6)
    return h * 0.55 + h * 0.5


# --------------------------------------------------------------------------
# 6. Tesla
# --------------------------------------------------------------------------

def base_tesla(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["tesla"])
    mid = BASE_W / 2
    # Ceramic insulator stacks: one more per tier, up to five.
    for k in range(level):
        x = mid - 18 + k * (36 / max(1, level - 1)) if level > 1 else mid
        for i in range(3):
            p.disc(x, GROUND - 10 - i * 6, 4.2 - i * 0.5, fill=CERAMIC, outline=OUTLINE, width=0.9)
        p.line([(x, GROUND - 8), (x, top - 2)], COPPER, 1.6)
    if level >= 3:
        p.rect(mid - 22, top - 2, mid + 22, top + 4, fill=COPPER, outline=OUTLINE, width=1.1)
    if level >= 4:
        # capacitor bank
        for side in (-1, 1):
            p.rect(mid + side * 26 - 4, GROUND - 26, mid + side * 26 + 4, GROUND - 10, fill=IRON, outline=OUTLINE, width=1.0)
            p.disc(mid + side * 26, GROUND - 27, 3.0, fill=COPPER)
    if level >= 5:
        for side in (-1, 1):
            p.rect(mid + side * 32 - 2.4, top - 14, mid + side * 32 + 2.4, GROUND - 6, fill=GOLD, outline=OUTLINE, width=0.9)
            p.disc(mid + side * 32, top - 17, 3.0, fill=GOLD_L)
    return top - 2


def weapon_tesla(p: Pen, level: int, pose):
    px, py = PIVOT
    charge = pose["charge"]
    h = [26, 34, 42, 52, 60][level - 1]
    # Copper mast.
    p.rect(px - 2.6, py - h, px + 2.6, py + 6, fill=COPPER, outline=OUTLINE, width=1.2)
    coil(p, px, py - h * 0.28, 16 + level * 2, 3 + level, COPPER, height=h * 0.5)
    # Orb.
    r = 7 + level * 1.4 + charge * 1.6
    p.disc(px, py - h, r, fill=hx("#cfe9f5"), outline=OUTLINE, width=1.3)
    p.disc(px - r * 0.3, py - h - r * 0.3, r * 0.42, fill=hx("#ffffff"))
    # Prongs around the orb: the visible "charge level" of the line.
    for k in range(level):
        a = math.radians(-90 + (k - (level - 1) / 2) * 34)
        x = px + math.cos(a) * (r + 6)
        y = py - h + math.sin(a) * (r + 6)
        p.line([(px + math.cos(a) * r * 0.9, py - h + math.sin(a) * r * 0.9), (x, y)],
               STEEL_L, 1.6)
        p.disc(x, y, 1.8, fill=GOLD_L)
    if charge > 0.25 or pose["flash"]:
        for k in range(3 + level):
            a = math.radians(k * 47 + charge * 90)
            r0 = r + 2
            r1 = r + 7 + charge * 9
            p.line([(px + math.cos(a) * r0, py - h + math.sin(a) * r0),
                    (px + math.cos(a + 0.5) * r1, py - h + math.sin(a + 0.5) * r1)],
                   hx("#dff6ff"), 1.3)
    if pose["flash"]:
        p.line([(px, py - h - r - 2), (px + 4, py - h - r - 16)], hx("#ffffff"), 1.6)
    return h + r


# --------------------------------------------------------------------------
# 7. Skybreaker
# --------------------------------------------------------------------------

def base_skybreaker(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["skybreaker"])
    mid = BASE_W / 2
    gear(p, mid - 20, top + 10, 8 + level * 0.8, BRONZE if level < 4 else STEEL)
    if level >= 2:
        # Bearing ring and elevation arc — an anti-air mount, not a field gun.
        p.arc(mid, top - 6, 20, 200, 340, IRON_L, 1.4)
        p.disc(mid, top - 4, 4.4, fill=STEEL, outline=OUTLINE, width=1.0)
    if level >= 3:
        for side in (-1, 1):
            p.rect(mid + side * 24 - 5, GROUND - 22, mid + side * 24 + 5, GROUND - 10, fill=IRON, outline=OUTLINE, width=1.0)
            for k in range(2):
                p.line([(mid + side * 24 - 4, GROUND - 20 + k * 4), (mid + side * 24 + 4, GROUND - 20 + k * 4)], STEEL_L, 0.8)
    if level >= 4:
        # Radar dish on a side arm.
        p.line([(mid + 26, top + 6), (mid + 26, top - 16)], IRON, 1.6)
        p.poly([(mid + 26, top - 16), (mid + 36, top - 26), (mid + 30, top - 6)], fill=STEEL_L, outline=OUTLINE, width=1.0)
    if level >= 5:
        for side in (-1, 1):
            pennant(p, mid + side * 30, top - 4, 14, GOLD, flip=side)
        p.disc(mid, top + 18, 4.6, fill=BLOOD, outline=GOLD, width=1.2)
    return top - 4


def weapon_skybreaker(p: Pen, level: int, pose):
    px, py = PIVOT
    rec = pose["rec"]
    barrels = [1, 2, 3, 4, 5][level - 1]
    length = [40, 48, 54, 62, 70][level - 1]
    spacing = [0, 7, 9, 11, 12][level - 1]
    colour = IRON if level < 3 else (STEEL if level < 5 else STEEL_L)
    tip = 0
    for b in range(barrels):
        offset = (b - (barrels - 1) / 2) * spacing
        p.rect(px + offset - 2.6, py + rec - length, px + offset + 2.6, py + rec + 6,
               fill=colour, outline=OUTLINE, width=1.2)
        p.rect(px + offset - 1.0, py + rec - length + 3, px + offset + 1.0, py + rec + 4, fill=shade(colour, 1.3))
        p.poly([(px + offset - 4.4, py + rec - length + 4), (px + offset, py + rec - length - 4),
                (px + offset + 4.4, py + rec - length + 4)], fill=STEEL_L, outline=OUTLINE, width=0.8)
        tip = max(tip, length + 4)
    # breech block and sight
    p.rect(px - (barrels * spacing) / 2 - 5, py + rec - 2, px + (barrels * spacing) / 2 + 5, py + rec + 8,
           fill=shade(colour, 0.8), outline=OUTLINE, width=1.2)
    p.rect(px - 1.6, py + rec - 14, px + 1.6, py + rec - 4, fill=GOLD if level >= 5 else IRON_L)
    if level >= 4:
        for side in (-1, 1):
            p.line([(px + side * (barrels * spacing / 2 + 4), py + rec), (px + side * (barrels * spacing / 2 + 4), py + rec - length * 0.6)], IRON_L, 1.3)
    if pose["flash"]:
        for b in range(barrels):
            offset = (b - (barrels - 1) / 2) * spacing
            p.disc(px + offset, py + rec - length - 5, 4.2, fill=hx("#ffe9a8"))
    return tip


# --------------------------------------------------------------------------
# 8. Engineer workshop
# --------------------------------------------------------------------------

def base_workshop(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["workshop"])
    mid = BASE_W / 2
    w = [30, 36, 44, 52, 62][level - 1]
    h = [26, 32, 40, 48, 58][level - 1]
    roof_y = top - h * 0.15
    wall_top = GROUND - h
    # Shed walls.
    p.rect(mid - w / 2, wall_top, mid + w / 2, GROUND - 4, fill=WOOD if level < 3 else hx("#8d7a63"), outline=OUTLINE, width=1.5)
    for k in range(3):
        p.line([(mid - w / 2 + 3, wall_top + 6 + k * 7), (mid + w / 2 - 3, wall_top + 6 + k * 7)], WOOD_D, 0.9)
    # Roof: gable, with more pitch each tier.
    p.poly([(mid - w / 2 - 5, wall_top + 2), (mid, roof_y - 16 - level * 2), (mid + w / 2 + 5, wall_top + 2)],
           fill=hx("#5f3f2c") if level < 4 else hx("#4c4a56"), outline=OUTLINE, width=1.4)
    p.poly([(mid - w / 2 - 5, wall_top + 2), (mid, roof_y - 16 - level * 2), (mid + 5, wall_top + 2)],
           fill=hx("#7d5638") if level < 4 else hx("#605e6c"))
    # Door.
    p.rect(mid - 7, GROUND - 20, mid + 7, GROUND - 4, fill=WOOD_D, outline=OUTLINE, width=1.1)
    p.disc(mid + 4, GROUND - 12, 1.2, fill=GOLD_L)
    if level >= 2:
        # Chimney + anvil.
        p.rect(mid + w / 2 - 12, roof_y - 30, mid + w / 2 - 6, roof_y - 6, fill=STONE, outline=OUTLINE, width=1.1)
        p.rect(mid + w / 2 - 12, roof_y - 30, mid + w / 2 - 6, roof_y - 27, fill=STONE_L)
        p.rect(mid - w / 2 - 12, GROUND - 12, mid - w / 2 - 2, GROUND - 6, fill=IRON, outline=OUTLINE, width=1.0)
        p.poly([(mid - w / 2 - 14, GROUND - 14), (mid - w / 2 - 4, GROUND - 14), (mid - w / 2 - 9, GROUND - 10)],
               fill=IRON_L, outline=OUTLINE, width=0.8)
    if level >= 3:
        # Open repair bay: the crew can reach a struck wall from here.
        p.rect(mid - w / 2 - 2, GROUND - 24, mid - w / 2 + 8, GROUND - 4, fill=hx("#3d2d22"), outline=OUTLINE, width=1.0)
        p.rect(mid - w / 2 - 4, GROUND - 24, mid - w / 2 - 2, GROUND - 4, fill=STEEL)
        # Crane arm.
        p.line([(mid + w / 2 - 4, wall_top), (mid + w / 2 + 12, wall_top - 26)], WOOD, 2.4)
        p.line([(mid + w / 2 + 12, wall_top - 26), (mid + w / 2 + 12, wall_top - 12)], IRON_L, 1.0)
        p.rect(mid + w / 2 + 10, wall_top - 12, mid + w / 2 + 14, wall_top - 9, fill=IRON, outline=OUTLINE, width=0.8)
    if level >= 4:
        gear(p, mid + w / 2 - 14, wall_top + 12, 7, STEEL)
        p.rect(mid - w / 2 - 18, GROUND - 10, mid - w / 2 - 6, GROUND - 4, fill=WOOD, outline=OUTLINE, width=1.0)
        p.line([(mid - w / 2 - 16, GROUND - 7), (mid - w / 2 - 8, GROUND - 7)], WOOD_D, 0.9)
    if level >= 5:
        p.rect(mid - 10, roof_y - 34, mid + 10, roof_y - 24, fill=GOLD, outline=OUTLINE, width=1.1)
        p.poly([(mid, roof_y - 40), (mid + 5, roof_y - 34), (mid, roof_y - 28), (mid - 5, roof_y - 34)], fill=GOLD_L)
        pennant(p, mid + w / 2 + 2, roof_y - 18, 16, GOLD)
    return wall_top - 8


def weapon_workshop(p: Pen, level: int, pose):
    px, py = PIVOT
    swing = pose["swing"]
    h = [22, 28, 34, 40, 46][level - 1]
    # Pivot gantry.
    p.rect(px - 7, py - 6, px + 7, py + 8, fill=IRON, outline=OUTLINE, width=1.2)
    p.disc(px, py - 4, 4.0, fill=STEEL, outline=OUTLINE, width=1.0)
    p.disc(px, py - 4, 1.6, fill=STEEL_L)
    # Swinging arm: angle from -60 deg (raised) to +40 deg (struck).
    a = math.radians(-58 + swing * 96)
    ax = px + math.sin(a) * h
    ay = py - 4 - math.cos(a) * h
    p.line([(px, py - 4), (ax, ay)], WOOD if level < 3 else STEEL, 3.4)
    p.line([(px, py - 4), (ax, ay)], OUTLINE, 1.0)
    # Hammer head.
    hw = 6 + level * 1.2
    p.rect(ax - hw / 2, ay - 5.5, ax + hw / 2, ay + 5.5, fill=IRON, outline=OUTLINE, width=1.2)
    p.rect(ax - hw / 2, ay - 5.5, ax + hw / 2, ay - 2.6, fill=STEEL_L if level >= 2 else IRON_L)
    if level >= 4:
        p.disc(ax, ay, 2.0, fill=GOLD)
    if level >= 5:
        p.line([(ax - hw / 2 - 2, ay - 6), (ax + hw / 2 + 2, ay - 6)], GOLD, 1.2)
    if pose["flash"]:
        # Strike sparks — drawn at the head, not a static explosion.
        for k in range(5):
            ang = math.radians(-140 + k * 34)
            p.line([(ax, ay), (ax + math.cos(ang) * (8 + k), ay + math.sin(ang) * (8 + k))],
                   hx("#ffd47a"), 1.2)
    return h + 8


# --------------------------------------------------------------------------
# 9. Warding obelisk
# --------------------------------------------------------------------------

def base_obelisk(p: Pen, level: int, variant: str = "a"):
    top = foundation(p, level, variant=variant, profile=PROFILES["obelisk"])
    mid = BASE_W / 2
    # Carved stele rises out of the plinth.
    h = [30, 38, 46, 56, 66][level - 1]
    w = [12, 14, 16, 19, 22][level - 1]
    p.poly([(mid - w / 2, GROUND - 6), (mid - w / 2, GROUND - h), (mid, GROUND - h - 8), (mid + w / 2, GROUND - h), (mid + w / 2, GROUND - 6)],
           fill=hx("#4a4356"), outline=OUTLINE, width=1.5)
    p.poly([(mid - w / 2 + 1.4, GROUND - 8), (mid - w / 2 + 1.4, GROUND - h + 2), (mid - 1, GROUND - h - 5), (mid - 1, GROUND - 8)],
           fill=hx("#6b6379"))
    for k in range(2 + level):
        yy = GROUND - 14 - k * 6
        p.line([(mid - w / 2 + 3, yy), (mid + w / 2 - 3, yy)], RUNE if k % 2 else RUNE_L, 0.9)
    if level >= 2:
        p.ring(mid, GROUND - 6, w * 0.9, RUNE, 1.2)
    if level >= 3:
        for side in (-1, 1):
            p.rect(mid + side * (w / 2 + 8) - 3, GROUND - 18, mid + side * (w / 2 + 8) + 3, GROUND - 4, fill=STONE_D, outline=OUTLINE, width=1.0)
            p.disc(mid + side * (w / 2 + 8), GROUND - 20, 2.4, fill=RUNE_L)
    if level >= 4:
        for k in range(4):
            a = math.radians(45 + k * 90)
            crystal(p, mid + math.cos(a) * (w + 6), GROUND - 26 + math.sin(a) * 6, 5, 14, RUNE, outline=False)
    if level >= 5:
        p.rect(mid - w / 2 - 2, GROUND - h - 4, mid + w / 2 + 2, GROUND - h + 1, fill=GOLD, outline=OUTLINE, width=1.0)
        for k in range(6):
            a = math.radians(k * 60)
            p.disc(mid + math.cos(a) * (w + 12), GROUND - 26 + math.sin(a) * 10, 2.2, fill=GOLD_L)
    return GROUND - h - 8


def weapon_obelisk(p: Pen, level: int, pose):
    px, py = PIVOT
    pulse = pose["charge"]
    # Floating rune core above the stele.
    y = py - 4
    r = 8 + level * 1.6 + pulse * 2
    for i in range(level):
        p.ring(px, y, r + 5 + i * 4, RUNE if i % 2 == 0 else RUNE_L, 1.1)
    p.disc(px, y, r, fill=hx("#2c2540"), outline=RUNE_L, width=1.3)
    crystal(p, px, y, r * 1.1, r * 1.9, RUNE_L, outline=False)
    p.disc(px, y, r * 0.34, fill=hx("#ffffff"))
    for k in range(3 + level):
        a = math.radians(k * (360 / max(1, 3 + level)) + pulse * 40)
        p.disc(px + math.cos(a) * (r + 7), y + math.sin(a) * (r + 7), 1.8, fill=RUNE_L)
    if pose["flash"]:
        for k in range(6):
            a = math.radians(k * 60)
            p.line([(px + math.cos(a) * r, y + math.sin(a) * r),
                    (px + math.cos(a) * (r + 14), y + math.sin(a) * (r + 14))], hx("#e9dcff"), 1.4)
    return r + 8


# --------------------------------------------------------------------------
# 10. Spike trap
# --------------------------------------------------------------------------

def base_spikeTrap(p: Pen, level: int, variant: str = "a"):
    mid = BASE_W / 2
    w = [40, 48, 56, 64, 74][level - 1]
    if variant == "b":
        # Branch B is a *field*, not a plate: wider, lower, with a brass frame
        # and rows of caltrops. The silhouette is different on purpose, so the
        # two branches are told apart at a glance on the road.
        fw = [58, 66, 74, 82, 90][level - 1]
        ground_shadow(p, fw * 0.58, GROUND - 2)
        p.rect(mid - fw / 2, GROUND - 7, mid + fw / 2, GROUND - 1,
               fill=IRON if level < 4 else STEEL, outline=OUTLINE, width=1.3)
        p.rect(mid - fw / 2 + 2, GROUND - 7, mid + fw / 2 - 2, GROUND - 5.6, fill=BRASS)
        for side in (-1, 1):
            p.rect(mid + side * (fw / 2 - 1.5) - 1.6, GROUND - 11, mid + side * (fw / 2 - 1.5) + 1.6,
                   GROUND - 1, fill=BRASS, outline=OUTLINE, width=0.9)
        caltrops = 3 + level
        for k in range(caltrops):
            x = mid - fw / 2 + 8 + k * (fw - 16) / (caltrops - 1)
            p.poly([(x - 3.4, GROUND - 7), (x, GROUND - 13 - (k % 2) * 2), (x + 3.4, GROUND - 7)],
                   fill=STEEL_L, outline=OUTLINE, width=0.8)
            p.line([(x, GROUND - 7), (x, GROUND - 9)], GOLD_D if level >= 4 else IRON_L, 1.0)
        # A brass tally rail: how many rows of spikes this field carries.
        for k in range(level):
            p.rect(mid - 14 + k * 7, GROUND - 12.5, mid - 11 + k * 7, GROUND - 11, fill=GOLD)
        return GROUND - 8
    ground_shadow(p, w * 0.6, GROUND - 3)
    # The plate lies on the road: low, readable, never hides the path.
    p.rect(mid - w / 2, GROUND - 9, mid + w / 2, GROUND - 1,
           fill=WOOD if level == 1 else (IRON if level < 4 else STEEL), outline=OUTLINE, width=1.4)
    p.rect(mid - w / 2, GROUND - 9, mid + w / 2, GROUND - 7,
           fill=WOOD_L if level == 1 else STEEL_L)
    rivets(p, mid - w / 2 + 4, GROUND - 7, mid + w / 2 - 4, GROUND - 7, GOLD if level >= 5 else IRON_L, 10, 0.9)
    if level >= 2:
        # Serrated lip so the plate reads as a hazard from above.
        for k in range(int(w / 8)):
            x = mid - w / 2 + 5 + k * 8
            p.poly([(x, GROUND - 9), (x + 3, GROUND - 13), (x + 6, GROUND - 9)], fill=IRON_L, outline=OUTLINE, width=0.7)
    if level >= 3:
        for side in (-1, 1):
            p.rect(mid + side * (w / 2 - 6) - 4, GROUND - 14, mid + side * (w / 2 - 6) + 4, GROUND - 9, fill=WOOD_D, outline=OUTLINE, width=1.0)
            p.disc(mid + side * (w / 2 - 6), GROUND - 12, 2.0, fill=STEEL_L)
    if level >= 4:
        p.rect(mid - w / 2 - 3, GROUND - 12, mid - w / 2 + 4, GROUND - 1, fill=IRON, outline=OUTLINE, width=1.0)
        p.rect(mid + w / 2 - 4, GROUND - 12, mid + w / 2 + 3, GROUND - 1, fill=IRON, outline=OUTLINE, width=1.0)
    if level >= 5:
        for k in range(4):
            x = mid - w / 2 + 8 + k * (w - 16) / 3
            p.disc(x, GROUND - 5, 2.2, fill=GOLD)
        p.rect(mid - 10, GROUND - 11, mid + 10, GROUND - 9, fill=GOLD, outline=OUTLINE, width=0.8)
    return GROUND - 10


def weapon_spikeTrap(p: Pen, level: int, pose):
    px, py = PIVOT
    rise = pose["rise"]           # 0 = armed flat, 1 = fully out
    rows = [1, 2, 2, 3, 3][level - 1]
    count = [3, 4, 5, 6, 8][level - 1]
    spike_h = (12 + level * 3) * (0.25 + 0.75 * rise)
    span = 16 + level * 3
    for row in range(rows):
        y = py + 6 + row * 6
        for k in range(count):
            t = (k + 0.5) / count - 0.5
            x = px + t * span * (1 - row * 0.18)
            h = spike_h * (1 - row * 0.12)
            p.poly([(x - 2.4, y), (x, y - h), (x + 2.4, y)],
                   fill=STEEL_L if level < 5 else GOLD_L, outline=OUTLINE, width=1.0)
            p.line([(x, y - h + 1), (x, y - 1)], shade(STEEL, 1.3), 0.7)
    # Spring housing under the rows.
    p.rect(px - span * 0.5 - 2, py + 10, px + span * 0.5 + 2, py + 16, fill=IRON, outline=OUTLINE, width=1.1)
    if rise > 0.5 and pose["flash"]:
        for k in range(4):
            ang = math.radians(-30 + k * 20)
            p.line([(px + (k - 1.5) * 6, py + 2), (px + (k - 1.5) * 6 + math.cos(ang) * 8, py + 2 - 6)], hx("#ffd9a0"), 1.0)
    return spike_h


# --------------------------------------------------------------------------
# poses — six frames, matched to what `Tower` actually does when it fires
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Branch B weapons
#
# Every royal line splits at level 3. Branch A keeps the weapon the line shipped
# with; branch B carries a *different machine*, drawn here, so the choice is
# visible on the board and not just a number in the inspector. Each one returns
# the muzzle distance from the pivot, exactly like branch A.
# --------------------------------------------------------------------------

def weapon_b_royalArtillery(p: Pen, level: int, pose):
    """Twin-bore siege battery: two short, wide tubes instead of one long gun."""
    px, py = PIVOT
    rec = pose["rec"]
    length = [30, 36, 42, 48, 54][level - 1]
    bore = [10.5, 12, 13.5, 15, 16.5][level - 1]
    gap = bore * 1.25
    colour = BRONZE_L if level < 4 else (STEEL if level == 4 else STEEL_L)
    # Shared breech block: one carriage, two bores.
    p.rect(px - gap - bore, py + rec - 3, px + gap + bore, py + rec + 10,
           fill=shade(colour, 0.72), outline=OUTLINE, width=1.3)
    p.rect(px - gap - bore + 2, py + rec + 4, px + gap + bore - 2, py + rec + 8, fill=GOLD_D)
    for side in (-1, 1):
        cx = px + side * gap
        p.rect(cx - bore, py + rec - length, cx + bore, py + rec + 6, fill=colour, outline=OUTLINE, width=1.3)
        p.rect(cx - bore * 0.7, py + rec - length + 4, cx + bore * 0.7, py + rec + 3, fill=shade(colour, 1.2))
        for k in range(2 + level // 2):
            yy = py + rec - length + 6 + k * ((length - 10) / max(1, 1 + level // 2))
            p.rect(cx - bore - 1.4, yy, cx + bore + 1.4, yy + 2.4, fill=GOLD_D, outline=OUTLINE, width=0.7)
        p.rect(cx - bore - 1.8, py + rec - length - 2.6, cx + bore + 1.8, py + rec - length + 1.4,
               fill=shade(colour, 1.3), outline=OUTLINE, width=1.0)
        p.disc(cx, py + rec - length + 0.5, bore * 0.5, fill=INK)
    if level >= 3:
        p.arc(px, py + rec + 2, gap + bore + 4, 200, 340, IRON_L, 1.3)
    if level >= 4:
        # Tier 4: a shield plate bolted between the bores.
        p.rect(px - 6, py + rec - length * 0.62, px + 6, py + rec - length * 0.18,
               fill=STEEL, outline=OUTLINE, width=1.1)
        p.disc(px, py + rec - length * 0.4, 2.4, fill=GOLD_L)
    if level >= 5:
        # Tier 5: a third, shorter bore under the pair, and a brass loading cage.
        p.rect(px - 5.5, py + rec - length * 0.55, px + 5.5, py + rec + 6, fill=shade(colour, 0.85),
               outline=OUTLINE, width=1.2)
        p.disc(px, py + rec - length * 0.55, 3.4, fill=INK)
        for side in (-1, 1):
            p.line([(px + side * (gap + bore), py + rec - length * 0.2),
                    (px + side * (gap + bore + 6), py + rec + 4)], BRASS, 2.2)
        # A sight frame standing over both bores: level 5 is a different
        # machine, and the silhouette says so from across the field.
        p.rect(px - gap - bore - 4, py + rec - length - 18, px - gap - bore - 0.5, py + rec - length + 2,
               fill=BRASS, outline=OUTLINE, width=1.0)
        p.rect(px + gap + bore + 0.5, py + rec - length - 18, px + gap + bore + 4, py + rec - length + 2,
               fill=BRASS, outline=OUTLINE, width=1.0)
        p.rect(px - gap - bore - 5, py + rec - length - 22, px + gap + bore + 5, py + rec - length - 16,
               fill=STEEL, outline=OUTLINE, width=1.1)
        p.ring(px, py + rec - length - 8, 3.4, GOLD_L, 1.2)
    charge_orb(p, pose["charge"], length, hx("#ffd47a"))
    if pose["flash"]:
        for side in (-1, 1):
            flash_cone(p, 6 + level * 1.1, hx("#fff3c0"), hx("#ff9d3c"), at=length + rec)
    return length + 4


def weapon_b_siegeBallista(p: Pen, level: int, pose):
    """Repeater ballista: a short double-prod bow over a bolt magazine."""
    px, py = PIVOT
    pull = pose["draw"]
    stock = [34, 40, 46, 52, 58][level - 1]
    span = [20, 24, 28, 32, 36][level - 1]
    col = WOOD_L if level < 3 else (STEEL if level < 5 else GOLD)
    # Short, thick stock — this bow is built for rate, not reach.
    p.rect(px - 3.6, py - stock, px + 3.6, py + 9, fill=WOOD_D if level < 4 else STEEL, outline=OUTLINE, width=1.4)
    p.rect(px - 1.4, py - stock + 3, px + 1.4, py + 6, fill=col)
    # Two prods crossed high on the stock: the repeating silhouette.
    for k, y in enumerate((py - stock * 0.86, py - stock * 0.56)):
        sweep = 8 + k * 5
        limb = [(px - span, y + sweep), (px - span * 0.6, y + 2), (px, y - 2.5),
                (px + span * 0.6, y + 2), (px + span, y + sweep)]
        p.line(limb, OUTLINE, 5.4)
        p.line(limb, col, 3.6)
    tip_y = py - stock * 0.86
    string_y = tip_y + 6 + pull * 12
    p.line([(px - span, tip_y + 8), (px, string_y), (px + span, tip_y + 8)], hx("#efe9d6"), 1.2)
    # Magazine: three bolts racked on the left, one in the groove.
    for k in range(3):
        x = px - span - 8 + k * 3.6
        p.line([(x, py - 10), (x, py - 30)], WOOD_L, 1.5)
    if level >= 4:
        # Tier 4: a winding frame and the drum that feeds the magazine.
        p.rect(px - span - 20, py - 34, px - span - 17, py - 2, fill=IRON, outline=OUTLINE, width=1.0)
        p.rect(px - span - 11, py - 38, px - span - 8, py - 2, fill=IRON, outline=OUTLINE, width=1.0)
        p.rect(px - span - 21, py - 40, px - span - 7, py - 34, fill=STEEL, outline=OUTLINE, width=1.1)
        p.disc(px - span - 14, py - 18, 6.0, fill=WOOD_D, outline=OUTLINE, width=1.2)
        p.disc(px - span - 14, py - 18, 2.4, fill=STEEL_L)
        for k in range(4):
            a = math.radians(45 * k)
            p.line([(px - span - 14 + math.cos(a) * 2.4, py - 18 + math.sin(a) * 2.4),
                    (px - span - 14 + math.cos(a) * 6.0, py - 18 + math.sin(a) * 6.0)], WOOD, 1.0)
    if level >= 5:
        # Tier 5: a second magazine on the other side, both latched open.
        for k in range(3):
            x = px + span + 4 + k * 3.6
            p.line([(x, py - 10), (x, py - 30)], WOOD_L, 1.5)
        p.rect(px - span - 12, py - 34, px + span + 12, py - 30, fill=GOLD, outline=OUTLINE, width=1.0)
    if pull > 0.1:
        p.rect(px - 1.1, tip_y - 6, px + 1.1, string_y, fill=WOOD_L, outline=OUTLINE, width=0.8)
        p.poly([(px - 2.8, tip_y - 14), (px, tip_y - 6), (px + 2.8, tip_y - 14)], fill=STEEL_L, outline=OUTLINE, width=0.7)
    if level >= 4:
        p.disc(px - span * 0.5, py - stock * 0.7, 2.2, fill=STEEL_L, outline=OUTLINE, width=0.7)
    if pose["flash"]:
        p.line([(px - 8, tip_y - 12), (px, tip_y - 24), (px + 8, tip_y - 12)], hx("#fff3c4"), 1.5)
    return stock + 2


def weapon_b_arcaneSniper(p: Pen, level: int, pose):
    """Hex weaver: three orbiting shards around a low focus ring, no long barrel."""
    px, py = PIVOT
    charge = pose["charge"]
    r = 12 + level * 1.8
    cy = py - 18 - level * 3
    # Hex ring: the whole tower is a focusing lattice, not a lance.
    p.ring(px, cy, r, RUNE, 1.6)
    for k in range(6):
        a = math.radians(k * 60 + charge * 55)
        x1, y1 = px + math.cos(a) * r, cy + math.sin(a) * r
        x2, y2 = px + math.cos(a) * (r + 5), cy + math.sin(a) * (r + 5)
        p.line([(x1, y1), (x2, y2)], RUNE_L, 1.2)
    # Three shards float on the ring; they spread as the shot charges.
    for k in range(3):
        a = math.radians(k * 120 + charge * 40 - 90)
        d = r * (0.62 + charge * 0.2)
        crystal(p, px + math.cos(a) * d, cy + math.sin(a) * d, 5 + level * 0.5, 12 + level * 1.2, RUNE_L)
    p.disc(px, cy, 4.2 + charge * 1.6, fill=hx("#efe6ff"), outline=RUNE, width=1.0)
    if level >= 4:
        for side in (-1, 1):
            p.line([(px + side * (r + 6), cy - r * 0.5), (px + side * (r + 12), cy - r * 0.9)], RUNE_L, 1.3)
            p.disc(px + side * (r + 12), cy - r * 0.9, 2.0, fill=RUNE_L)
    if pose["flash"]:
        for k in range(6):
            a = math.radians(k * 60)
            p.line([(px + math.cos(a) * r, cy + math.sin(a) * r),
                    (px + math.cos(a) * (r + 13), cy + math.sin(a) * (r + 13))], hx("#efe6ff"), 1.4)
    return r + 14


def weapon_b_mortar(p: Pen, level: int, pose):
    """Cluster battery: three short tubes fanned out instead of one long one."""
    px, py = PIVOT
    rec = pose["rec"]
    length = [26, 30, 34, 38, 42][level - 1]
    inner = [9.5, 10.5, 11.5, 12.5, 13.5][level - 1]
    colour = IRON_L if level < 3 else (STEEL if level < 5 else STEEL_L)
    dark = shade(colour, 0.62)
    # Iron bed the three tubes sit in.
    p.rect(px - 21, py + rec - 2, px + 21, py + rec + 12, fill=IRON, outline=OUTLINE, width=1.4)
    p.rect(px - 19, py + rec + 1, px + 19, py + rec + 4, fill=STEEL_L)
    for k, angle in enumerate((-17, 0, 17)):
        a = math.radians(angle)
        dx, dy = math.sin(a), -math.cos(a)
        # Draw the tube as a thick tapered band of segments, outlined first.
        for step in range(int(length) + 1):
            x = px + dx * step
            y = py + rec + dy * step - 4
            w = inner - step * 0.10
            p.rect(x - w, y - 5.2, x + w, y + 5.2, fill=colour, outline=None)
        # One clean outline down each side, so the tube reads as metal.
        p.line([(px - inner, py + rec + 1), (px - inner + dx * length, py + rec + dy * length - 3)], OUTLINE, 1.1)
        p.line([(px + inner, py + rec + 1), (px + inner + dx * length, py + rec + dy * length - 3)], OUTLINE, 1.1)
        tipx, tipy = px + dx * length, py + rec + dy * length - 4
        p.rect(tipx - inner - 1.6, tipy - 4.4, tipx + inner + 1.6, tipy + 4.4,
               fill=shade(colour, 1.15), outline=OUTLINE, width=1.1)
        p.disc(tipx, tipy - 0.6, inner * 0.55, fill=dark)
        p.disc(tipx - 1, tipy - 1.4, inner * 0.3, fill=INK)
        # Breech block per tube.
        p.rect(px + dx * 2 - inner - 1.2, py + rec - 3, px + dx * 2 + inner + 1.2, py + rec + 8,
               fill=dark, outline=OUTLINE, width=1.0)
    if level >= 3:
        for side in (-1, 1):
            p.rect(px + side * 19 - 1.8, py + rec - 18, px + side * 19 + 1.8, py + rec + 4,
                   fill=STEEL, outline=OUTLINE, width=0.9)
            p.poly([(px + side * 19 - 2.6, py + rec - 18), (px + side * 19, py + rec - 23),
                    (px + side * 19 + 2.6, py + rec - 18)], fill=STEEL_L, outline=OUTLINE, width=0.7)
    charge_orb(p, pose["charge"], length, hx("#ffd47a"))
    if pose["flash"]:
        for angle in (-17, 0, 17):
            a = math.radians(angle)
            p.disc(px + math.sin(a) * (length + 4), py + rec - math.cos(a) * (length + 4) - 4, 3.6, fill=hx("#ffe1a6"))
    return length + 6


def weapon_b_rimeTower(p: Pen, level: int, pose):
    """Frost tempest: a fan of three shards instead of one great crystal."""
    px, py = PIVOT
    charge = pose["charge"]
    h = [22, 28, 34, 40, 46][level - 1]
    for k in (-1, 0, 1):
        a = math.radians(k * 24)
        d = 10 + level * 1.6
        x = px + math.sin(a) * d
        y = py - h * 0.6 - math.cos(a) * 6
        crystal(p, x, y, 8 + level * 0.6 - abs(k) * 1.6, h * (1 - abs(k) * 0.18), ICE if k == 0 else ICE_D)
    for k in range(3 + level):
        a = math.radians(k * (360 / max(1, 3 + level)) + charge * 70)
        r = 14 + level * 1.4 + charge * 3
        p.disc(px + math.cos(a) * r, py - h * 0.6 + math.sin(a) * r * 0.5, 1.7, fill=ICE_L)
    if pose["flash"]:
        for k in range(8):
            a = math.radians(k * 45)
            p.line([(px + math.cos(a) * 10, py - h * 0.6 + math.sin(a) * 10),
                    (px + math.cos(a) * 20, py - h * 0.6 + math.sin(a) * 20)], hx("#e8fbff"), 1.5)
    return h * 0.6 + 12


def weapon_b_tesla(p: Pen, level: int, pose):
    """Arc cannon: a horizontal barrel ringed with coils, not a mast and orb."""
    px, py = PIVOT
    charge = pose["charge"]
    length = [30, 36, 42, 48, 54][level - 1]
    width = [7, 8, 9.5, 11, 12.5][level - 1]
    cy = py - 10
    # Barrel lies across the frame; the tower still rotates toward its target.
    p.rect(px - width, cy - length, px + width, cy + 8, fill=STEEL, outline=OUTLINE, width=1.3)
    p.rect(px - width * 0.55, cy - length + 4, px + width * 0.55, cy + 6, fill=STEEL_L)
    for k in range(2 + level):
        yy = cy - length + 8 + k * ((length - 12) / max(1, 1 + level))
        p.rect(px - width - 3.4, yy, px + width + 3.4, yy + 3.6, fill=COPPER, outline=OUTLINE, width=0.8)
    # Spark gap: two ceramic balls and the arc between them.
    for side in (-1, 1):
        p.disc(px + side * (width + 9), cy - length + 2, 4.2, fill=CERAMIC, outline=OUTLINE, width=1.0)
    gap = 4 + charge * 4
    p.line([(px - gap - 3, cy - length + 2), (px, cy - length - 3), (px + gap + 3, cy - length + 2)],
           hx("#dff6ff"), 1.4 + charge)
    if level >= 5:
        p.ring(px, cy - length + 2, width + 8, GOLD, 1.2)
    if pose["flash"]:
        # The discharge itself: the flash sits on the muzzle, so the release
        # frame is visibly different from the rest pose.
        flash_cone(p, 8 + level * 1.2, hx("#ffffff"), hx("#9fe6ff"), at=length + 7)
        p.line([(px, cy - length - 4), (px, cy - length - 22)], hx("#ffffff"), 1.8)
    elif charge > 0.4:
        for k in range(3):
            a = math.radians(k * 120 + charge * 90)
            p.line([(px + math.cos(a) * (width + 6), cy - length + 2 + math.sin(a) * 6),
                    (px + math.cos(a) * (width + 13), cy - length + 2 + math.sin(a) * 11)],
                   (*hx("#dff6ff")[:3], int(150 + 80 * charge)), 1.2)
    return length + 10


def weapon_b_skybreaker(p: Pen, level: int, pose):
    """Flak battery: four stubby tubes in a boxy mount, built to fill the sky."""
    px, py = PIVOT
    rec = pose["rec"]
    length = [24, 28, 32, 36, 40][level - 1]
    colour = IRON if level < 3 else (STEEL if level < 5 else STEEL_L)
    # Boxy launcher frame.
    p.rect(px - 20, py + rec - 6, px + 20, py + rec + 12, fill=shade(colour, 0.72), outline=OUTLINE, width=1.4)
    for side in (-1, 1):
        for k in range(2):
            cx = px + side * (4 + k * 8)
            p.rect(cx - 3.2, py + rec - length, cx + 3.2, py + rec + 2, fill=colour, outline=OUTLINE, width=1.1)
            p.rect(cx - 1.4, py + rec - length + 3, cx + 1.4, py + rec, fill=shade(colour, 1.25))
            p.disc(cx, py + rec - length + 1, 2.2, fill=INK)
    # Elevation arc + tracker dish on the shoulder.
    p.arc(px, py + rec + 4, 26, 205, 335, IRON_L, 1.3)
    p.line([(px + 22, py + rec - 2), (px + 28, py + rec - 18)], IRON, 1.2)
    p.poly([(px + 28, py + rec - 18), (px + 34, py + rec - 22), (px + 30, py + rec - 12)], fill=STEEL_L, outline=OUTLINE, width=0.8)
    if pose["flash"]:
        for side in (-1, 1):
            for k in range(2):
                cx = px + side * (4 + k * 8)
                p.disc(cx, py + rec - length - 4, 3.0, fill=hx("#ffe9a8"))
    return length + 6


def weapon_b_workshop(p: Pen, level: int, pose):
    """Field engineer: a crane with a pulley, a counterweight and a crate."""
    px, py = PIVOT
    swing = pose["swing"]
    h = [30, 36, 42, 48, 54][level - 1]
    # Mast with cross-bracing.
    p.rect(px - 4.2, py - h, px + 4.2, py + 12, fill=IRON, outline=OUTLINE, width=1.3)
    for k in range(level + 1):
        yy = py - 2 - k * 9
        p.line([(px - 4.2, yy), (px + 4.2, yy - 6)], STEEL_L, 1.0)
    # Jib swinging on the mast head.
    a = math.radians(-16 + swing * 30)
    jib = h * 1.55
    jx = px + math.sin(a) * jib
    jy = py - h - math.cos(a) * jib * 0.22
    p.line([(px, py - h), (jx, jy)], STEEL, 5.0)
    p.line([(px, py - h), (jx, jy)], OUTLINE, 1.4)
    # Counterweight behind the mast head.
    p.rect(px - 13, py - h - 3, px - 4, py - h + 4, fill=IRON, outline=OUTLINE, width=1.1)
    p.disc(px - 8.5, py - h + 0.5, 2.0, fill=STEEL_L)
    # Pulley, cable and the load.
    p.disc(jx, jy + 2, 4.0, fill=STEEL_L, outline=OUTLINE, width=1.1)
    p.disc(jx, jy + 2, 1.4, fill=IRON)
    drop = 8 + swing * 14
    p.line([(jx, jy + 5), (jx, jy + 5 + drop)], hx("#d8cfae"), 1.2)
    # Crate on the hook: the crew is lifting something, not swinging a hammer.
    cw, ch = 9.5 + level * 0.5, 8 + level * 0.4
    cy = jy + 5 + drop
    p.rect(jx - cw / 2, cy, jx + cw / 2, cy + ch, fill=WOOD_L, outline=OUTLINE, width=1.2)
    p.line([(jx - cw / 2, cy + 2.5), (jx + cw / 2, cy + 2.5)], WOOD_D, 1.0)
    p.line([(jx - cw / 2, cy + ch - 2.5), (jx + cw / 2, cy + ch - 2.5)], WOOD_D, 1.0)
    p.line([(jx, cy), (jx, cy + ch)], WOOD_D, 1.0)
    if level >= 3:
        p.rect(px - 10, py - h * 0.5, px - 3.4, py - h * 0.5 + 8, fill=COPPER, outline=OUTLINE, width=1.0)
        p.disc(px - 6.7, py - h * 0.5 + 4, 2.2, fill=GOLD_L)
    if level >= 5:
        p.ring(jx, jy + 2, 6.2, GOLD, 1.2)
        p.disc(px, py - h, 2.6, fill=GOLD_L)
    return h + 8


def weapon_b_obelisk(p: Pen, level: int, pose):
    """Null obelisk: twin floating shards, one dark and one bright."""
    px, py = PIVOT
    charge = pose["charge"]
    h = [26, 32, 38, 44, 50][level - 1]
    cy = py - h * 0.5
    for side in (-1, 1):
        x = px + side * (6 + level * 1.4)
        crystal(p, x, cy + side * 5, 6 + level * 0.5, h * 0.8, RUNE if side > 0 else hx("#5b4a86"))
    # A dark ring binds the pair.
    for i in range(2 + level // 2):
        p.ring(px, cy, 12 + i * 5 + charge * 2, RUNE if i % 2 else hx("#6d5a9c"), 1.0)
    p.disc(px, cy, 3.4 + charge * 1.4, fill=hx("#e9dcff"))
    if level >= 4:
        for k in range(4):
            a = math.radians(k * 90 + 45)
            p.disc(px + math.cos(a) * (18 + level), cy + math.sin(a) * (18 + level), 1.9, fill=RUNE_L)
    if pose["flash"]:
        for k in range(6):
            a = math.radians(k * 60)
            p.line([(px + math.cos(a) * 10, cy + math.sin(a) * 10),
                    (px + math.cos(a) * 22, cy + math.sin(a) * 22)], hx("#e9dcff"), 1.4)
    return h * 0.6 + 8


def weapon_b_spikeTrap(p: Pen, level: int, pose):
    """Impalers: a dense grid of short spikes with one tall centre spike."""
    px, py = PIVOT
    rise = pose["rise"]
    cols = 2 + level // 2
    rows = 2
    span = 20 + level * 2.4
    for i in range(cols):
        for j in range(rows):
            x = px - span + i * (span * 2 / max(1, cols - 1))
            y = py + 10 - j * 7 + abs(i - (cols - 1) / 2) * 1.6
            height = 9 + rise * 14 + (3 if (i + j) % 2 else 0)
            p.poly([(x - 3.0, y), (x, y - height), (x + 3.0, y)], fill=STEEL_L if (i + j) % 2 else STEEL,
                   outline=OUTLINE, width=0.9)
            if pose["flash"]:
                # Barbs snap out on the strike, and the gore runs down the shaft:
                # a trap that fires has to look different from a trap at rest.
                p.line([(x - 4.4, y - height * 0.55), (x, y - height), (x + 4.4, y - height * 0.55)],
                       hx("#ffe1a6"), 1.3)
                p.disc(x, y - height, 1.6, fill=hx("#ffd0d0"))
    # The centre impaler.
    p.poly([(px - 4.2, py + 12), (px, py + 8 - 20 - rise * 16), (px + 4.2, py + 12)],
           fill=STEEL_L, outline=OUTLINE, width=1.1)
    if pose["flash"]:
        p.poly([(px - 9, py + 8), (px, py + 4 - 26 - rise * 12), (px + 9, py + 8)],
               fill=(*hx("#ffd9a0")[:3], 170))
    p.disc(px, py + 12, 3.2, fill=GOLD if level >= 5 else IRON)
    if level >= 4:
        p.rect(px - span - 4, py + 10, px + span + 4, py + 14, fill=IRON, outline=OUTLINE, width=1.0)
    return 24 + rise * 9


B_WEAPONS = {
    "royalArtillery": weapon_b_royalArtillery,
    "siegeBallista": weapon_b_siegeBallista,
    "arcaneSniper": weapon_b_arcaneSniper,
    "mortar": weapon_b_mortar,
    "rimeTower": weapon_b_rimeTower,
    "tesla": weapon_b_tesla,
    "skybreaker": weapon_b_skybreaker,
    "workshop": weapon_b_workshop,
    "obelisk": weapon_b_obelisk,
    "spikeTrap": weapon_b_spikeTrap,
}


POSES = [
    dict(rec=0.0, flash=False, charge=0.00, draw=0.00, swing=0.00, rise=0.00),   # 0 rest
    dict(rec=-2.0, flash=False, charge=0.35, draw=0.55, swing=0.45, rise=0.25),  # 1 prepare
    dict(rec=-3.0, flash=False, charge=0.80, draw=1.00, swing=0.95, rise=0.60),  # 2 charged
    dict(rec=9.0, flash=True, charge=0.60, draw=0.30, swing=1.45, rise=1.00),    # 3 release
    dict(rec=5.0, flash=False, charge=0.22, draw=0.08, swing=1.10, rise=0.75),   # 4 recoil
    dict(rec=1.0, flash=False, charge=0.04, draw=0.00, swing=0.18, rise=0.20),   # 5 settle
]


# --------------------------------------------------------------------------
# The eight art slots of a royal line
#
# L1 and L2 are shared; the branch is chosen at level 3. Branch A keeps the
# tier art the line shipped with (l3…l5); branch B has its own machine and its
# own atlas (b1…b3), so an upgrade inside a branch still changes the building.
# --------------------------------------------------------------------------

SLOTS = [
    ("lvl1", 1, "a"),
    ("lvl2", 2, "a"),
    ("spec-a", 3, "a"),
    ("spec-a2", 4, "a"),
    ("spec-a3", 5, "a"),
    ("spec-b", 3, "b"),
    ("spec-b2", 4, "b"),
    ("spec-b3", 5, "b"),
]


def slot_suffix(level: int, variant: str) -> str:
    return f"l{level}" if variant == "a" else f"b{level - 2}"


@dataclass
class Line:
    key: str
    base: callable
    weapon: callable
    kind: str            # 'rotating' | 'static'
    accent: str
    projectile: str | None
    muzzle: str
    # Branch B fires a different missile (its own silhouette, not a recolour).
    projectile_b: str | None = None


LINES = [
    Line("royalArtillery", base_royalArtillery, weapon_royalArtillery, "rotating", "#ff9d3c",
         "proj-royal-royalArtillery", "shell", "twin-shell"),
    Line("siegeBallista", base_siegeBallista, weapon_siegeBallista, "rotating", "#e7e2d2",
         "proj-royal-siegeBallista", "bolt", "triple-bolt"),
    Line("arcaneSniper", base_arcaneSniper, weapon_arcaneSniper, "rotating", "#a98cff",
         "proj-royal-arcaneSniper", "lance", "hex-orb"),
    Line("mortar", base_mortar, weapon_mortar, "rotating", "#ffb347",
         "proj-royal-mortar", "shell", "cluster-shell"),
    Line("rimeTower", base_rimeTower, weapon_rimeTower, "static", "#8fd4ee",
         "proj-royal-rimeTower", "shard", "shard-fan"),
    Line("tesla", base_tesla, weapon_tesla, "static", "#bfe9ff",
         "proj-royal-tesla", "arc", "arc-slug"),
    Line("skybreaker", base_skybreaker, weapon_skybreaker, "rotating", "#ffd47a",
         "proj-royal-skybreaker", "bolt", "flak-shell"),
    Line("workshop", base_workshop, weapon_workshop, "static", "#ffc46b",
         None, "hammer"),
    Line("obelisk", base_obelisk, weapon_obelisk, "static", "#c9a8ff",
         None, "rune"),
    Line("spikeTrap", base_spikeTrap, weapon_spikeTrap, "static", "#cfd6df",
         None, "spike"),
]


def render_base(line: Line, level: int, variant: str = "a"):
    image = new_base()
    p = Pen(image)
    mount_y = line.base(p, level, variant) if variant == "b" else line.base(p, level)
    flat = downsample(image)
    bbox = flat.getbbox()
    if not bbox:
        raise SystemExit(f"{line.key} L{level}: base drew nothing")
    left, top, right, bottom = bbox
    # Crop to ink, but keep the ground line flush with the bottom edge: `Tower`
    # anchors base sprites at (0.5, 1) on the tile's bottom edge.
    crop = flat.crop((left, top, right, bottom))
    # The soft contact shadow reaches a few pixels below the ground line, so the
    # crop's bottom edge is `bottom`, not `GROUND`. The mount is a distance from
    # the sprite's bottom edge (the tile's ground line), so subtract that slop —
    # a 4 px error there sits the whole gun 4 px too high.
    mount = (GROUND - mount_y) - (bottom - GROUND)
    # A structure wider than a tile and a bit will bleed into its neighbours on
    # a dense board. Clamp the footprint by scaling about the bottom edge, so
    # the drawing keeps its proportions and its ground line; the mount scales
    # with it because the pivot measured from the ground does too.
    if crop.width > MAX_BASE_W or crop.height > MAX_BASE_H:
        factor = min(MAX_BASE_W / crop.width, MAX_BASE_H / crop.height)
        crop = crop.resize(
            (max(1, int(round(crop.width * factor))), max(1, int(round(crop.height * factor)))),
            Image.LANCZOS,
        )
        mount *= factor
        # LANCZOS can leave the outermost row fully transparent; re-crop to the
        # ink so the base still sits flush on the tile.
        tight = crop.getbbox()
        if tight:
            crop = crop.crop(tight)
    return crop, mount


WEAPON_SCALE = 0.86


def render_weapon(line: Line, level: int, pose, variant: str = "a"):
    image = new_frame()
    p = Pen(image)
    tip = line.weapon(p, level, pose) if variant == "a" else B_WEAPONS[line.key](p, level, pose)
    flat = downsample(image)
    # Scale the machinery about its pivot: the art has to sit on a 64 px tile
    # without spilling over its neighbours, and the pivot must not move or the
    # muzzle geometry would no longer match the drawing.
    width = int(round(FRAME * WEAPON_SCALE))
    height = int(round(FRAME * WEAPON_SCALE))
    scaled = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    small = flat.resize((width, height), Image.LANCZOS)
    pivot_x = int(round(PIVOT[0] * WEAPON_SCALE))
    pivot_y = int(round(PIVOT[1] * WEAPON_SCALE))
    scaled.alpha_composite(small, (PIVOT[0] - pivot_x, PIVOT[1] - pivot_y))
    return scaled, tip * WEAPON_SCALE


# --------------------------------------------------------------------------
# effect art — one impact strip and one muzzle flash per line
# --------------------------------------------------------------------------

IMPACT_FRAMES = 10
IMPACT_SIZE = 128


def render_impact(line: Line, variant: str = "a"):
    """The hit.

    Branch B is not a recolour of branch A: it bursts on a six-spoke star with a
    brass inner ring, where branch A bursts on an eight-spoke ring, so the two
    branches of the same line read differently on the board.
    """
    strip = Image.new("RGBA", (IMPACT_SIZE * IMPACT_FRAMES * SS, IMPACT_SIZE * SS), (0, 0, 0, 0))
    accent = hx(line.accent)
    for index in range(IMPACT_FRAMES):
        frame = Image.new("RGBA", (IMPACT_SIZE * SS, IMPACT_SIZE * SS), (0, 0, 0, 0))
        p = Pen(frame)
        t = index / (IMPACT_FRAMES - 1)
        fade = int(95 + 160 * max(0.0, 1.0 - t ** 1.4))
        c = IMPACT_SIZE / 2
        if index == 0:
            p.disc(c, c, 6 if variant == "a" else 7.5, fill=(255, 255, 255, 235))
            if variant == "b":
                p.ring(c, c, 10, (*BRASS[:3], 200), 1.8)
        else:
            radius = 6 + t * 40
            width = max(1.8, 5.0 * (1 - t))
            if variant == "a":
                p.ring(c, c, radius, (*accent[:3], fade), width)
                p.ring(c, c, radius * 0.62, (*accent[:3], int(fade * 0.7)), max(1.0, width * 0.6))
                spokes = 8
                for k in range(spokes):
                    a = math.radians(k * (360 / spokes) + t * 40)
                    r0 = radius * 0.7
                    r1 = radius * (1.05 + 0.25 * (k % 2))
                    p.line([(c + math.cos(a) * r0, c + math.sin(a) * r0),
                            (c + math.cos(a) * r1, c + math.sin(a) * r1)], (*accent[:3], fade), max(1.0, width * 0.8))
            else:
                # Branch B: a six-point star with a brass ring closing on it.
                p.ring(c, c, radius * 0.92, (*BRASS[:3], int(fade * 0.85)), max(1.4, width * 0.7))
                spokes = 6
                for k in range(spokes):
                    a = math.radians(k * (360 / spokes) - t * 30)
                    r0 = radius * 0.35
                    r1 = radius * (1.10 + 0.16 * (k % 2))
                    p.line([(c + math.cos(a) * r0, c + math.sin(a) * r0),
                            (c + math.cos(a) * r1, c + math.sin(a) * r1)], (*accent[:3], fade), max(1.2, width * 0.9))
                p.ring(c, c, radius * 0.55, (*accent[:3], int(fade * 0.65)), max(1.0, width * 0.5))
            if line.key in ("mortar", "royalArtillery"):
                p.disc(c, c, radius * 0.4, fill=(120, 116, 108, int(fade * 0.35)))
        strip.paste(frame, (index * IMPACT_SIZE * SS, 0), frame)
    return downsample(strip)


RUIN_W, RUIN_H = 96, 64

# Each line falls in its own way: a gun emplacement collapses to a jagged wall
# stump, a workshop to a burnt timber heap, a stele snaps, a trap is a torn
# plate, and a crystal mount leaves its shattered cradle.
RUIN_STYLE = {
    "royalArtillery": "stump",
    "siegeBallista": "stump",
    "arcaneSniper": "stump",
    "mortar": "stump",
    "skybreaker": "stump",
    "rimeTower": "crystal",
    "tesla": "crystal",
    "workshop": "timber",
    "obelisk": "stele",
    "spikeTrap": "plate",
}


def render_ruin(line: Line, variant: str = "a"):
    """What is left when the line falls: its own wreck, not a generic puff.

    A destroyed royal building drops this on its tile for a moment (the tile is
    already free), so the player can see *what* they lost — a jagged broken
    stump, spilled masonry, charred beams, and the line's accent colour still
    glowing in the rubble.
    """
    image = Image.new("RGBA", (RUIN_W * SS, RUIN_H * SS), (0, 0, 0, 0))
    p = Pen(image)
    accent = hx(line.accent)
    base = RUIN_H - 5
    mid = RUIN_W // 2
    style = RUIN_STYLE.get(line.key, "stump")
    # Contact shadow.
    p.d.ellipse([10 * SS, (base - 5) * SS, (RUIN_W - 10) * SS, (base + 5) * SS], fill=(20, 18, 24, 100))

    if style == "stump":
        # Half-collapsed stump: a jagged wall stub, wider at the base.
        p.poly([(mid - 30, base), (mid - 26, base - 16), (mid - 18, base - 13), (mid - 12, base - 26),
                (mid - 2, base - 20), (mid + 6, base - 30), (mid + 14, base - 21), (mid + 22, base - 24),
                (mid + 28, base - 12), (mid + 32, base)],
               fill=shade(STONE, 0.8), outline=OUTLINE, width=1.8)
        # A few courses survive in the stump so it still reads as masonry.
        bricks(p, mid - 20, base - 18, mid + 20, base - 4, shade(STONE_D, 0.9), 6)
        p.poly([(mid - 24, base - 4), (mid - 14, base - 22), (mid - 6, base - 14), (mid + 4, base - 4)],
               fill=shade(STONE, 0.92))
    elif style == "timber":
        # Burnt shed: a collapsed roof plane and a few standing posts.
        p.poly([(mid - 34, base), (mid - 20, base - 14), (mid + 6, base - 22), (mid + 30, base - 6), (mid + 34, base)],
               fill=shade(WOOD_D, 0.9), outline=OUTLINE, width=1.6)
        p.poly([(mid - 20, base - 14), (mid + 6, base - 22), (mid + 2, base - 10), (mid - 18, base - 6)],
               fill=shade(WOOD, 0.75))
        for x in (-30, -12, 10, 28):
            p.rect(mid + x - 1.6, base - 20 - (x % 7), mid + x + 1.6, base - 2, fill=WOOD_D, outline=OUTLINE, width=0.9)
        for y in range(base - 16, base - 2, 6):
            p.line([(mid - 34, y), (mid + 34, y - 2)], shade(WOOD_D, 0.8), 0.8)
    elif style == "stele":
        # A snapped rune stele: the lower half stands, the crown lies in pieces.
        p.poly([(mid - 16, base), (mid - 14, base - 26), (mid - 8, base - 34), (mid + 6, base - 30),
                (mid + 12, base - 22), (mid + 16, base)],
               fill=hx("#4a4356"), outline=OUTLINE, width=1.7)
        p.poly([(mid - 14, base - 26), (mid - 8, base - 34), (mid - 2, base - 26), (mid - 6, base - 4)],
               fill=hx("#6b6379"))
        for y in (base - 10, base - 17, base - 23):
            p.line([(mid - 10, y), (mid + 10, y)], RUNE, 0.9)
        p.poly([(mid + 18, base - 2), (mid + 26, base - 12), (mid + 34, base - 6), (mid + 36, base - 2)],
               fill=hx("#4a4356"), outline=OUTLINE, width=1.2)
    elif style == "plate":
        # A torn spike plate: the frame split, spikes bent outward.
        p.rect(mid - 34, base - 7, mid - 2, base - 1, fill=IRON, outline=OUTLINE, width=1.3)
        p.rect(mid + 8, base - 5, mid + 32, base - 1, fill=IRON, outline=OUTLINE, width=1.3)
        p.poly([(mid - 2, base - 7), (mid + 4, base - 18), (mid + 8, base - 5)], fill=IRON, outline=OUTLINE, width=1.0)
        for x, h, lean in [(-26, 12, -4), (-14, 9, 3), (16, 11, 5), (26, 8, -3)]:
            p.poly([(mid + x - 2.2, base - 6), (mid + x + lean, base - 6 - h), (mid + x + 2.2, base - 6)],
                   fill=STEEL_L, outline=OUTLINE, width=1.0)
    else:
        # Shattered crystal cradle: the plinth split and the shards scattered.
        p.poly([(mid - 24, base), (mid - 20, base - 12), (mid - 6, base - 16), (mid + 8, base - 13),
                (mid + 22, base - 10), (mid + 26, base)],
               fill=shade(STONE, 0.78), outline=OUTLINE, width=1.7)
        bricks(p, mid - 18, base - 12, mid + 20, base - 3, shade(STONE_D, 0.9), 6)
        for x, y, w, h, tilt in [(-22, -16, 7, 18, -14), (10, -20, 8, 22, 12), (26, -10, 5, 13, 26)]:
            shard = [(mid + x, base + y - h / 2), (mid + x + w / 2, base + y), (mid + x, base + y + h / 2),
                     (mid + x - w / 2, base + y)]
            p.poly(shard, fill=accent, outline=OUTLINE, width=1.2)
    # Spilled blocks in front of it.
    for x, y, w, h in [(-34, -4, 12, 6), (-18, -2, 9, 5), (16, -3, 13, 6), (28, -6, 8, 5)]:
        p.rect(mid + x, base + y - h, mid + x + w, base + y, fill=STONE_L, outline=OUTLINE, width=1.0)
    # Charred beams, snapped at angles.
    for x0, y0, x1, y1, w in [(-26, -6, -38, -30, 3.4), (26, -8, 40, -26, 3.2), (-4, -18, 6, -38, 2.6)]:
        p.line([(mid + x0, base + y0), (mid + x1, base + y1)], WOOD_D, w)
        p.line([(mid + x0, base + y0), (mid + x1, base + y1)], INK, 0.8)
    # Each gun line leaves one recognisable broken part, so the wreck names the
    # weapon that fell instead of being five identical mason piles in different
    # accent colours.
    if variant == "b":
        # Branch B falls as its own machine, not as branch A with a brass ring.
        # A toppled drum, a split carriage and the barrel that broke off it are
        # a different outline from every branch-A wreck above.
        if style == "stump":
            p.rect(mid - 40, base - 20, mid + 6, base - 4, fill=shade(IRON, 1.1), outline=OUTLINE, width=1.6)
            p.rect(mid - 40, base - 20, mid + 6, base - 16, fill=BRASS, outline=OUTLINE, width=1.0)
            p.disc(mid - 40, base - 9, 5.4, fill=BRASS, outline=OUTLINE, width=1.2)
            p.rect(mid - 30, base - 13, mid - 12, base - 10, fill=BRASS, outline=None)
            p.rect(mid + 6, base - 22, mid + 15, base - 2, fill=STEEL, outline=OUTLINE, width=1.3)
            p.rect(mid + 8, base - 24, mid + 13, base - 2, fill=shade(STEEL, 0.7))
            p.disc(mid + 10.5, base - 24, 4.0, fill=INK, outline=OUTLINE, width=1.0)
        elif style == "timber":
            # The crane came down: its jib and pulley lie across the yard.
            p.poly([(mid - 36, base), (mid - 34, base - 8), (mid + 30, base - 20), (mid + 38, base - 6)],
                   fill=shade(WOOD_D, 0.95), outline=OUTLINE, width=1.6)
            for k in range(3):
                x = mid - 26 + k * 20
                p.line([(x, base - 4), (x + 8, base - 16)], shade(WOOD, 0.8), 2.4)
            p.disc(mid + 30, base - 15, 5.2, fill=BRASS, outline=OUTLINE, width=1.2)
            p.rect(mid + 34, base - 6, mid + 44, base - 1, fill=BRASS, outline=OUTLINE, width=1.0)
        elif style == "stele":
            # The null colossus: the stele snapped, and the void ring fell flat.
            p.poly([(mid - 20, base), (mid - 17, base - 20), (mid - 6, base - 26),
                    (mid + 8, base - 20), (mid + 20, base)], fill=hx("#4a4356"), outline=OUTLINE, width=1.7)
            p.d.ellipse([(mid - 46) * SS, (base - 30) * SS, (mid + 10) * SS, (base - 1) * SS],
                        outline=BRASS, width=3)
            p.line([(mid - 30, base - 15), (mid - 18, base - 6)], hx("#c9a8ff"), 1.8)
            p.rect(mid + 20, base - 10, mid + 40, base - 2, fill=hx("#4a4356"), outline=OUTLINE, width=1.2)
            p.poly([(mid + 24, base - 10), (mid + 30, base - 22), (mid + 37, base - 12)],
                   fill=hx("#6b6379"), outline=OUTLINE, width=1.0)
            # The upper third of the column, snapped off and lying across the
            # yard: the branch-B stele leaves a longer, lower wreck.
            p.poly([(mid - 44, base - 6), (mid - 26, base - 18), (mid - 6, base - 14),
                    (mid - 10, base - 4), (mid - 32, base - 1)],
                   fill=hx("#585064"), outline=OUTLINE, width=1.4)
            p.line([(mid - 36, base - 8), (mid - 14, base - 12)], RUNE, 1.4)
        elif style == "plate":
            # A torn caltrop field: the frame bent up at both ends.
            p.rect(mid - 42, base - 9, mid + 42, base - 1, fill=IRON, outline=OUTLINE, width=1.3)
            p.line([(mid - 42, base - 9), (mid - 34, base - 24)], BRASS, 3.0)
            p.line([(mid + 42, base - 9), (mid + 33, base - 26)], BRASS, 3.0)
            p.line([(mid - 42, base - 9), (mid - 34, base - 24)], OUTLINE, 0.9)
            p.line([(mid + 42, base - 9), (mid + 33, base - 26)], OUTLINE, 0.9)
            for x in (-32, -21, -10, 3, 14, 25, 34):
                p.poly([(mid + x - 3.0, base - 9), (mid + x, base - 22), (mid + x + 3.0, base - 9)],
                       fill=STEEL_L, outline=OUTLINE, width=0.9)
        else:
            # The crystal drum burst along its brass bands.
            p.rect(mid - 32, base - 12, mid + 12, base - 3, fill=shade(STONE, 0.82), outline=OUTLINE, width=1.5)
            p.line([(mid - 32, base - 9), (mid + 12, base - 6)], BRASS, 2.0)
            for x, y, w, h in [(-30, -20, 8, 20), (-10, -26, 9, 24), (14, -18, 7, 16), (28, -12, 5, 11)]:
                p.poly([(mid + x, base + y - h / 2), (mid + x + w / 2, base + y),
                        (mid + x, base + y + h / 2), (mid + x - w / 2, base + y)],
                       fill=accent, outline=OUTLINE, width=1.1)
        # Spilled blocks, charred beams and smoke are shared by both branches.
        for x, y, w, h in [(-34, -3, 12, 6), (-16, -2, 9, 5), (18, -3, 13, 6), (30, -4, 8, 5)]:
            p.rect(mid + x, base + y - h, mid + x + w, base + y, fill=STONE_L, outline=OUTLINE, width=1.0)
        for x0, y0, x1, y1, w in [(-26, -6, -38, -30, 3.4), (26, -8, 40, -26, 3.2)]:
            p.line([(mid + x0, base + y0), (mid + x1, base + y1)], WOOD_D, w)
            p.line([(mid + x0, base + y0), (mid + x1, base + y1)], INK, 0.8)
        for x, y, r in [(-22, -32, 3.4), (14, -34, 2.8), (30, -22, 2.2)]:
            p.disc(mid + x, base + y, r, fill=(92, 90, 98, 110))
        return downsample(image)

    if style == "stump":
        if line.key == "royalArtillery":
            # The barrel, thrown clear and split at the muzzle.
            p.d.ellipse([(mid - 40) * SS, (base - 15) * SS, (mid - 12) * SS, (base - 5) * SS], fill=shade(STONE_D, 0.9), outline=OUTLINE, width=2)
            p.rect(mid - 36, base - 14, mid - 16, base - 7, fill=IRON, outline=OUTLINE, width=1.4)
            p.rect(mid - 16, base - 15, mid - 11, base - 6, fill=shade(IRON, 1.25), outline=OUTLINE, width=1.2)
        elif line.key == "siegeBallista":
            # A snapped torsion limb with its string trailing off.
            p.line([(mid - 34, base - 4), (mid - 26, base - 15), (mid - 16, base - 19)], WOOD_D, 3.6)
            p.line([(mid - 34, base - 4), (mid - 26, base - 15), (mid - 16, base - 19)], INK, 0.8)
            p.line([(mid - 16, base - 19), (mid - 12, base - 6), (mid - 30, base - 2)], "#cfc6b0", 1.0)
        elif line.key == "arcaneSniper":
            # The sight ring, cracked across.
            p.d.ellipse([(mid + 8) * SS, (base - 20) * SS, (mid + 28) * SS, (base - 4) * SS], outline=IRON, width=2)
            p.line([(mid + 12, base - 16), (mid + 24, base - 7)], accent, 1.6)
        elif line.key == "mortar":
            # The tube, rolled off its bed, mouth scorched.
            p.rect(mid + 8, base - 12, mid + 36, base - 5, fill=IRON, outline=OUTLINE, width=1.5)
            p.d.ellipse([(mid + 33) * SS, (base - 13) * SS, (mid + 41) * SS, (base - 4) * SS], fill=shade(IRON, 0.7), outline=OUTLINE, width=2)
            p.disc(mid + 12, base - 8, 2.4, fill=(30, 28, 26, 200))
        elif line.key == "skybreaker":
            # The tracker ring, bent where it hit the ground.
            p.d.ellipse([(mid + 6) * SS, (base - 18) * SS, (mid + 30) * SS, (base - 2) * SS], outline=STEEL_L, width=2)
            p.line([(mid + 18, base - 18), (mid + 16, base - 9), (mid + 22, base - 4)], STEEL_L, 1.6)

    # The line's identity survives in its accent colour. Only the plain masonry
    # stumps need the free-standing shard — the crystal, stele and plate wrecks
    # already carry their own accent, and a second one just flattens them into
    # the same silhouette.
    if style == "stump":
        p.disc(mid + 2, base - 26, 9, fill=(*accent[:3], 45))
        p.poly([(mid + 2, base - 40), (mid + 9, base - 27), (mid + 2, base - 16), (mid - 5, base - 27)],
               fill=accent, outline=OUTLINE, width=1.2)
        p.poly([(mid + 2, base - 36), (mid + 5, base - 27), (mid + 2, base - 21)], fill=shade(accent, 1.4))
    elif style == "timber":
        # The workshop's own gear ring, thrown clear and still warm.
        p.disc(mid + 6, base - 30, 7.5, fill=(*accent[:3], 40))
        p.disc(mid + 6, base - 30, 5.4, fill=IRON, outline=OUTLINE, width=1.2)
        p.disc(mid + 6, base - 30, 2.2, fill=accent)
        for a in range(0, 360, 45):
            rad = math.radians(a)
            p.line([(mid + 6 + math.cos(rad) * 5.4, base - 30 + math.sin(rad) * 5.4),
                    (mid + 6 + math.cos(rad) * 8.2, base - 30 + math.sin(rad) * 8.2)], IRON, 1.8)
    # Smoke/ash.
    for x, y, r in [(-22, -32, 3.4), (14, -34, 2.8), (30, -22, 2.2)]:
        p.disc(mid + x, base + y, r, fill=(92, 90, 98, 110))
    return downsample(image)


TRAIL_SIZE = 48


def render_trail(line: Line, variant: str = "a"):
    """The streak a shot leaves behind it.

    Drawn pointing up (the art convention for missiles), so `Projectile` can
    reuse the sprite's rotation. It is deliberately soft: three stacked streaks
    with falling alpha, no hard outline, because a hard trail over a 64 px tile
    reads as a second projectile.
    """
    size = TRAIL_SIZE
    image = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    accent = hx(line.accent)
    cx = size / 2
    # Branch A leaves one wide streak; branch B leaves a tighter double strand,
    # so a salvo reads as a salvo in flight.
    layers = [
        (0.34, 0.26, 13.0, 245),
        (0.78, 0.48, 10.0, 190),
        (1.10, 0.72, 6.0, 130),
    ]
    if variant == "b":
        layers = [
            (0.26, 0.24, 9.0, 240),
            (0.60, 0.46, 7.0, 180),
            (0.86, 0.70, 4.5, 120),
        ]
    for width_scale, length_scale, radius, alpha in layers:
        top = size * 0.5 - size * length_scale * 0.75
        bottom = size * 0.5 + size * length_scale * 0.35
        p = Pen(image)
        if variant == "b":
            p.rect(cx - radius * width_scale - 5.0, top, cx - 2.0 + radius * width_scale, bottom,
                   fill=(*accent[:3], int(alpha * 0.8)))
            p.rect(cx + 2.0 - radius * width_scale, top, cx + radius * width_scale + 5.0, bottom,
                   fill=(*accent[:3], alpha))
        else:
            p.rect(cx - radius * width_scale, top, cx + radius * width_scale, bottom,
                   fill=(*accent[:3], alpha))
    # Soften the edges so the streak fades into the tile instead of ending flat.
    image = image.filter(ImageFilter.GaussianBlur(2.2 * SS))
    return downsample(image)


def render_muzzle(line: Line, variant: str = "a"):
    size = 48
    image = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    p = Pen(image)
    accent = hx(line.accent)
    c = size / 2
    if variant == "a":
        for k in range(6):
            a = math.radians(k * 60)
            p.line([(c, c), (c + math.cos(a) * 16, c + math.sin(a) * 16)], (*accent[:3], 220), 2.0)
        p.disc(c, c, 7, fill=(255, 250, 226, 240))
        p.ring(c, c, 12, (*accent[:3], 180), 1.6)
    else:
        # A twin-lobed flash on a brass ring: the branch-B barrels fire two at a
        # time, and the flash says so even when the volley is a single frame.
        for side in (-1, 1):
            p.line([(c + side * 5, c), (c + side * 9, c - 14)], (*accent[:3], 220), 2.2)
            p.line([(c + side * 5, c), (c + side * 9, c + 14)], (*accent[:3], 190), 1.8)
            p.disc(c + side * 5, c, 4.2, fill=(255, 250, 226, 220))
        p.disc(c, c, 5.4, fill=(255, 252, 235, 240))
        p.ring(c, c, 13, (*BRASS[:3], 200), 1.8)
    return downsample(image)


# --------------------------------------------------------------------------
# projectiles — each line's shot is its own silhouette
# --------------------------------------------------------------------------

# Each branch-B weapon fires a missile of its own, not a recoloured branch-A
# shot: a salvo shell pair, a bolt bundle, a hex orb, a cluster shell, a shard
# fan, an arc slug or a flak shell.
B_PROJECTILE_KINDS = {
    "twin-shell", "triple-bolt", "hex-orb", "cluster-shell",
    "shard-fan", "arc-slug", "flak-shell",
}


def _render_branch_b_projectile(p: Pen, kind: str, c, heavy: bool):
    size = (40, 64)
    cx, top = size[0] / 2, 4.0
    band = 2.0 if heavy else 1.0
    # Heavy tier: a brass collar around the whole missile, drawn last by the
    # caller so the silhouette stays one object.

    if kind == "twin-shell":
        for dx in (-7.0, 7.0):
            p.rect(cx + dx - 5, top + 8, cx + dx + 5, top + 36, fill=IRON, outline=OUTLINE, width=1.2)
            p.poly([(cx + dx - 5, top + 8), (cx + dx, top + 1), (cx + dx + 5, top + 8)],
                   fill=STEEL_L, outline=OUTLINE, width=1.0)
            p.rect(cx + dx - 5, top + 20 - band, cx + dx + 5, top + 21 + band, fill=BRASS)
        p.rect(cx - 9, top + 38, cx + 9, top + 43, fill=shade(IRON, 0.75), outline=OUTLINE, width=1.0)
        if heavy:
            # Tier 4/5: a third shell in the shared cradle.
            p.rect(cx - 4.6, top + 40, cx + 4.6, top + 54, fill=IRON, outline=OUTLINE, width=1.2)
            p.poly([(cx - 4.6, top + 40), (cx, top + 33), (cx + 4.6, top + 40)],
                   fill=STEEL_L, outline=OUTLINE, width=1.0)
            p.rect(cx - 4.6, top + 47, cx + 4.6, top + 48.6, fill=BRASS)
    elif kind == "triple-bolt":
        for dx, tilt in ((-7.0, -3.0), (0.0, 0.0), (7.0, 3.0)):
            p.rect(cx + dx - 1.2, top + 10, cx + dx + 1.2, top + 50, fill=WOOD_L, outline=OUTLINE, width=0.9)
            p.poly([(cx + dx - 3.4 + tilt, top + 12), (cx + dx + tilt, top + 2),
                    (cx + dx + 3.4 + tilt, top + 12)], fill=STEEL_L, outline=OUTLINE, width=0.9)
        p.rect(cx - 10, top + 34, cx + 10, top + 38 + band, fill=BRASS, outline=OUTLINE, width=0.9)
        if heavy:
            # Tier 4/5: a fourth bolt in the rack and a wider brass feeder.
            p.rect(cx - 12.5, top + 6, cx - 10.5, top + 40, fill=WOOD_L, outline=OUTLINE, width=0.8)
            p.poly([(cx - 15.5, top + 8), (cx - 11.5, top + 0), (cx - 10.5, top + 8)],
                   fill=STEEL_L, outline=OUTLINE, width=0.8)
            p.rect(cx - 13, top + 42, cx + 13, top + 45, fill=BRASS, outline=OUTLINE, width=0.7)
    elif kind == "hex-orb":
        points = []
        for k in range(6):
            a = math.radians(60 * k - 90)
            points.append((cx + math.cos(a) * 9, top + 24 + math.sin(a) * 9))
        p.poly(points, fill=shade(c, 0.85), outline=OUTLINE, width=1.3)
        p.poly([(cx, top + 17), (cx + 4.5, top + 24), (cx, top + 31), (cx - 4.5, top + 24)],
               fill=hx("#f5edff"), outline=None)
        for k in range(3):
            a = math.radians(90 * k + 30)
            p.line([(cx + math.cos(a) * 9.5, top + 24 + math.sin(a) * 9.5),
                    (cx + math.cos(a) * (13 + band), top + 24 + math.sin(a) * (13 + band))],
                   (*c[:3], 200), 1.4)
        if heavy:
            # Tier 4/5: a brass hex frame wraps the orb, so the upgraded shot is
            # a different outline, not a brighter hexagon.
            frame = []
            for k in range(6):
                a = math.radians(60 * k - 90)
                frame.append((cx + math.cos(a) * 17, top + 24 + math.sin(a) * 17))
            p.poly(frame, outline=BRASS, width=1.6)
            for k in range(3):
                a = math.radians(120 * k + 30)
                p.line([(cx + math.cos(a) * 11, top + 24 + math.sin(a) * 11),
                        (cx + math.cos(a) * 17, top + 24 + math.sin(a) * 17)], BRASS, 1.6)
    elif kind == "cluster-shell":
        p.rect(cx - 6, top + 4, cx + 6, top + 34, fill=IRON, outline=OUTLINE, width=1.3)
        p.poly([(cx - 6, top + 4), (cx, top - 2), (cx + 6, top + 4)], fill=STEEL_L, outline=OUTLINE, width=1.1)
        p.rect(cx - 6, top + 16 - band, cx + 6, top + 18 + band, fill=BRASS)
        bomblets = ((-9.0, top + 30), (9.0, top + 30))
        if heavy:
            bomblets = ((-11.0, top + 28), (11.0, top + 28), (-11.0, top + 40), (11.0, top + 40))
            for side in (-1, 1):
                p.poly([(cx + side * 5, top + 34), (cx + side * 15, top + 44),
                        (cx + side * 5, top + 42)], fill=STEEL, outline=OUTLINE, width=1.0)
        for dx, dy in bomblets:
            p.disc(cx + dx, dy, 4.2, fill=shade(IRON, 1.15), outline=OUTLINE, width=1.0)
            p.disc(cx + dx - 1, dy - 1, 1.6, fill=STEEL_L)
        p.rect(cx - 8, top + 36, cx + 8, top + 40, fill=shade(IRON, 0.7), outline=OUTLINE, width=0.9)
    elif kind == "shard-fan":
        fan = ((-8.0, -5.0, 26.0), (0.0, 0.0, 36.0), (8.0, 5.0, 26.0))
        if heavy:
            # Tier 4/5 sends a five-shard fan, not a wider three-shard one.
            fan = ((-13.0, -8.0, 20.0), (-6.5, -4.0, 30.0), (0.0, 0.0, 40.0), (6.5, 4.0, 30.0), (13.0, 8.0, 20.0))
        for dx, tilt, h in fan:
            p.poly([(cx + dx + tilt, top + 2), (cx + dx + 5 + tilt, top + h * 0.55),
                    (cx + dx + tilt, top + h), (cx + dx - 5 + tilt, top + h * 0.55)],
                   fill=c, outline=OUTLINE, width=1.1)
            p.poly([(cx + dx + tilt, top + 6), (cx + dx + 2 + tilt, top + h * 0.55),
                    (cx + dx + tilt, top + h - 6)], fill=hx("#eafcff"))
        p.rect(cx - 8, top + 40, cx + 8, top + 44 + band, fill=BRASS, outline=OUTLINE, width=0.9)
    elif kind == "arc-slug":
        p.rect(cx - 5, top + 8, cx + 5, top + 42, fill=shade(c, 0.9), outline=OUTLINE, width=1.2)
        p.poly([(cx - 5, top + 8), (cx, top), (cx + 5, top + 8)], fill=hx("#f4fdff"), outline=OUTLINE, width=1.0)
        p.rect(cx - 6, top + 24 - band, cx + 6, top + 26 + band, fill=BRASS)
        for side in (-1, 1):
            p.poly([(cx + side * 5, top + 14), (cx + side * (11 + band), top + 20),
                    (cx + side * 5, top + 24)], fill=STEEL_L, outline=OUTLINE, width=0.9)
        if heavy:
            # Tier 4/5: a longer slug and a second pair of fins.
            p.rect(cx - 4.2, top + 42, cx + 4.2, top + 56, fill=shade(c, 0.8), outline=OUTLINE, width=1.1)
            p.poly([(cx - 4.2, top + 56), (cx, top + 62), (cx + 4.2, top + 56)],
                   fill=hx("#f4fdff"), outline=OUTLINE, width=0.9)
            for side in (-1, 1):
                p.poly([(cx + side * 4, top + 44), (cx + side * 10, top + 50),
                        (cx + side * 4, top + 54)], fill=STEEL_L, outline=OUTLINE, width=0.8)
    else:
        # flak-shell: a squat shell inside a brass cradle, fused at the nose.
        p.rect(cx - 7, top + 10, cx + 7, top + 36, fill=IRON, outline=OUTLINE, width=1.3)
        p.poly([(cx - 7, top + 10), (cx, top + 1), (cx + 7, top + 10)], fill=STEEL_L, outline=OUTLINE, width=1.1)
        p.disc(cx, top + 6, 2.4, fill=BRASS, outline=OUTLINE, width=0.8)
        p.ring(cx, top + 22, 11 + band, BRASS, 1.5)
        p.rect(cx - 9, top + 34, cx + 9, top + 39, fill=shade(BRASS, 0.8), outline=OUTLINE, width=1.0)
        if heavy:
            # Tier 4/5: cradle arms folded out around the shell.
            for side in (-1, 1):
                p.line([(cx + side * 9, top + 34), (cx + side * 14, top + 26),
                        (cx + side * 13, top + 15)], BRASS, 2.0)
            p.rect(cx - 6, top + 42, cx + 6, top + 47, fill=shade(IRON, 0.8), outline=OUTLINE, width=1.0)
    if heavy:
        p.rect(cx - 1.4, top + 16, cx + 1.4, top + 34, fill=(*c[:3], 110))


def render_projectile(kind: str, accent: str, variant: str = "a", heavy: bool = False):
    """One shot, drawn pointing up.

    `variant` picks the branch: A fires the line's original missile, B fires the
    second branch's — a salvo shell, a bolt bundle, a hex orb. `heavy` is the
    level-4/5 version of the same missile: bigger casing, an extra band, a
    brighter core. Both are drawn on the same 40×64 canvas so the sprite's
    origin and rotation offset stay valid for every tier.
    """
    size = (40, 64)
    image = Image.new("RGBA", (size[0] * SS, size[1] * SS), (0, 0, 0, 0))
    p = Pen(image)
    c = hx(accent)
    cx, top = size[0] / 2, 4.0
    if variant == "b" and kind in B_PROJECTILE_KINDS:
        _render_branch_b_projectile(p, kind, c, heavy)
        return downsample(image)
    if kind == "shell":
        p.rect(cx - 6, top + 6, cx + 6, top + 34, fill=IRON, outline=OUTLINE, width=1.4)
        p.poly([(cx - 6, top + 6), (cx, top - 2), (cx + 6, top + 6)], fill=STEEL_L, outline=OUTLINE, width=1.2)
        p.rect(cx - 6, top + 18, cx + 6, top + 21, fill=GOLD)
        p.rect(cx - 7, top + 30, cx + 7, top + 36, fill=shade(IRON, 0.8), outline=OUTLINE, width=1.0)
    elif kind == "bolt":
        p.rect(cx - 1.6, top + 6, cx + 1.6, top + 52, fill=WOOD_L, outline=OUTLINE, width=1.0)
        p.poly([(cx - 4, top + 8), (cx, top), (cx + 4, top + 8)], fill=STEEL_L, outline=OUTLINE, width=1.0)
        p.poly([(cx - 2, top + 10), (cx - 7, top + 16), (cx - 2, top + 18)], fill=STEEL, outline=OUTLINE, width=0.8)
        p.poly([(cx + 2, top + 10), (cx + 7, top + 16), (cx + 2, top + 18)], fill=STEEL, outline=OUTLINE, width=0.8)
        p.line([(cx - 3, top + 50), (cx, top + 44), (cx + 3, top + 50)], hx("#e7e2d2"), 1.0)
    elif kind == "lance":
        p.poly([(cx, top), (cx + 5, top + 22), (cx, top + 54), (cx - 5, top + 22)], fill=c, outline=OUTLINE, width=1.2)
        p.poly([(cx, top + 4), (cx + 2.4, top + 22), (cx, top + 46), (cx - 2.4, top + 22)], fill=hx("#f2ecff"))
        for k in range(3):
            p.line([(cx - 8, top + 16 + k * 10), (cx + 8, top + 16 + k * 10)], (*c[:3], 120), 1.0)
    elif kind == "shard":
        p.poly([(cx, top), (cx + 6, top + 18), (cx + 2, top + 44), (cx - 2, top + 44), (cx - 6, top + 18)],
               fill=c, outline=OUTLINE, width=1.2)
        p.poly([(cx, top + 4), (cx + 2.5, top + 18), (cx, top + 38)], fill=hx("#eafcff"))
    elif kind == "arc":
        p.disc(cx, top + 20, 8, fill=hx("#eaffff"), outline=OUTLINE, width=1.0)
        for k in range(4):
            a = math.radians(k * 90 + 20)
            p.line([(cx, top + 20), (cx + math.cos(a) * 15, top + 20 + math.sin(a) * 15)], (*c[:3], 230), 1.6)
    else:
        p.disc(cx, top + 20, 7, fill=c)
    if heavy:
        # Tier 4/5: two brass driving bands close on the body and a hot core
        # runs down its spine. Nothing is drawn outside the missile, so the
        # heavier shot still reads as one object in flight.
        for y in (top + 13, top + 29):
            p.rect(cx - 5.5, y, cx + 5.5, y + 2.6, fill=BRASS, outline=OUTLINE, width=0.7)
        p.rect(cx - 1.6, top + 14, cx + 1.6, top + 28, fill=(*c[:3], 110))
    return downsample(image)


# --------------------------------------------------------------------------
# dock cards
# --------------------------------------------------------------------------

def render_card(base_img, weapon_img, mount, pivot=PIVOT):
    mount = int(round(mount))
    size = 64
    card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ground = 190
    composite = Image.new("RGBA", (200, 220), (0, 0, 0, 0))
    # Place the weapon's pivot on the base's shoulder so the card shows the
    # real tower instead of a floating turret.
    composite.alpha_composite(base_img, (int(100 - base_img.width // 2), int(ground - base_img.height)))
    composite.alpha_composite(weapon_img, (int(100 - pivot[0]), int(ground - mount - pivot[1])))
    bbox = composite.getbbox()
    if bbox:
        composite = composite.crop(bbox)
    scale = min(56 / composite.width, 56 / composite.height, 1.0)
    scaled = composite.resize((max(1, int(composite.width * scale)), max(1, int(composite.height * scale))), Image.LANCZOS)
    card.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return card


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def ensure_dirs():
    for path in (TOWER_DIR, PROJ_DIR, FX_DIR, UI_DIR, DATA_DIR):
        os.makedirs(path, exist_ok=True)


def js_num(value):
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def main():
    ensure_dirs()
    written = []
    art: dict[str, dict] = {}

    for line in LINES:
        tiers = {}
        for slot, level, variant in SLOTS:
            base_img, mount = render_base(line, level, variant)
            suffix = slot_suffix(level, variant)
            base_name = f"base_{line.key}-{suffix}.png"
            base_img.save(os.path.join(TOWER_DIR, base_name))
            written.append(os.path.join("public/assets/towers", base_name))

            frames = []
            tip = 0.0
            poses = POSES
            if line.key == "spikeTrap":
                # A trap at rest is still armed: the spikes stand proud so the
                # road hazard is readable before it ever fires.
                poses = [dict(pose, rise=max(pose["rise"], 0.55)) for pose in POSES]
            for pose in poses:
                frame, frame_tip = render_weapon(line, level, pose, variant)
                frames.append(frame)
                tip = max(tip, frame_tip)
            sheet = Image.new("RGBA", (FRAME * 6, FRAME), (0, 0, 0, 0))
            for index, frame in enumerate(frames):
                sheet.alpha_composite(frame, (index * FRAME, 0))
            weapon_name = f"weapon_{line.key}-{suffix}.png"
            sheet.save(os.path.join(TOWER_DIR, weapon_name))
            written.append(os.path.join("public/assets/towers", weapon_name))

            tiers[slot] = dict(
                base=base_name,
                weapon=weapon_name,
                fw=FRAME,
                fh=FRAME,
                frames=6,
                px=PIVOT[0],
                py=PIVOT[1],
                mount=int(round(mount)),
                muzzleY=int(round(-tip)),
                height=base_img.height,
                width=base_img.width,
            )
        art[line.key] = tiers

        card_base, card_mount = render_base(line, 3)
        card = render_card(card_base, render_weapon(line, 3, POSES[0])[0], card_mount)
        card_name = f"card_{line.key}.png"
        card.save(os.path.join(UI_DIR, card_name))
        written.append(os.path.join("public/assets/ui", card_name))

        # One shot per branch, and a heavier tier-4/5 version of each. The files
        # are written on the same 40×64 canvas so `Projectile` treats them all
        # alike.
        if line.projectile:
            for suffix, kind, variant, heavy in (
                ("", projectile_kind(line), "a", False),
                ("-2", projectile_kind(line), "a", True),
                ("-b", line.projectile_b, "b", False),
                ("-b2", line.projectile_b, "b", True),
            ):
                projectile = render_projectile(kind, line.accent, variant, heavy)
                projectile_name = f"{line.projectile}{suffix}.png"
                projectile.save(os.path.join(PROJ_DIR, projectile_name))
                written.append(os.path.join("public/assets/projectiles", projectile_name))

        for variant, suffix in (("a", ""), ("b", "-b")):
            impact = render_impact(line, variant)
            impact_name = f"fx-line-{line.key}{suffix}-impact.png"
            impact.save(os.path.join(FX_DIR, impact_name))
            written.append(os.path.join("public/assets/fx", impact_name))

            muzzle = render_muzzle(line, variant)
            muzzle_name = f"fx-line-{line.key}{suffix}-muzzle.png"
            muzzle.save(os.path.join(FX_DIR, muzzle_name))
            written.append(os.path.join("public/assets/fx", muzzle_name))

            ruin = render_ruin(line, variant)
            ruin_name = f"ruin_{line.key}{suffix}.png"
            ruin.save(os.path.join(TOWER_DIR, ruin_name))
            written.append(os.path.join("public/assets/towers", ruin_name))

            # Only a line that prints a projectile can leave a trail behind one.
            trail_name = f"fx-line-{line.key}{suffix}-trail.png"
            if line.projectile:
                trail = render_trail(line, variant)
                trail.save(os.path.join(FX_DIR, trail_name))
                written.append(os.path.join("public/assets/fx", trail_name))
            elif os.path.exists(os.path.join(FX_DIR, trail_name)):
                # A field building has no shot, so a stale streak from an older
                # run would be an unused file claiming to belong to it.
                os.remove(os.path.join(FX_DIR, trail_name))

    write_tower_art(art)
    write_fx(art)
    write_projectiles(art)
    print(f"wrote {len(written)} images + 3 data tables")
    for key in art:
        row = art[key]
        print(f"  {key:16s} A mounts {[row[slot]['mount'] for slot in ('lvl1', 'lvl2', 'spec-a', 'spec-a2', 'spec-a3')]}"
              f"  B mounts {[row[slot]['mount'] for slot in ('spec-b', 'spec-b2', 'spec-b3')]}"
              f"  heights {[row[slot]['height'] for slot, _, _ in SLOTS]}")


def projectile_kind(line: Line) -> str:
    return line.muzzle


def write_tower_art(art):
    lines = [
        "// GENERATED by scripts/build_royal_defences.py — do not edit by hand.",
        "",
        "/**",
        " * Geometry for the ten royal lines.",
        " *",
        " * `mount` is the weapon pivot's height above the tile's bottom edge, so",
        " * `Tower` places the machinery on the shoulder of its emplacement instead",
        " * of on the ground. `muzzleY` is the distance from that pivot to the drawn",
        " * tip, measured by the generator (negative = up).",
        " *",
        " * Slots: `lvl1`, `lvl2` are shared; `spec-a`/`spec-a2`/`spec-a3` and",
        " * `spec-b`/`spec-b2`/`spec-b3` are the two branches at L3/L4/L5.",
        " */",
        "",
        "export const ROYAL_ART = {",
    ]
    for key, tiers in art.items():
        lines.append(f"  {key}: {{")
        for slot, data in tiers.items():
            fields = ", ".join(f"{name}: {js_num(value) if not isinstance(value, str) else repr(value)}"
                               for name, value in data.items())
            lines.append(f"    '{slot}': {{ {fields} }},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    with open(os.path.join(DATA_DIR, "royalTowerArt.js"), "w") as handle:
        handle.write("\n".join(lines))


PROJECTILE_LINES = {
    "royalArtillery", "siegeBallista", "arcaneSniper", "mortar",
    "rimeTower", "tesla", "skybreaker",
}


def write_projectiles(art):
    """The royal shot table.

    Branch A and branch B of every shooting line fire their own missiles, and
    each branch upgrades its missile at level 4 — four keys per line. The royal
    generator owns this table; `data/projectileArt.js` (the older lines, from
    `scripts/build_projectiles.py`) does not list the royal lines any more, so
    there is exactly one owner per file.
    """
    lines = [
        "// GENERATED by scripts/build_royal_defences.py — do not edit by hand.",
        "",
        "/**",
        " * Royal shot art. `a` is branch A at level 3, `a2` the level-4/5 version",
        " * of it; `b` and `b2` are the same two tiers of branch B. `Projectile`",
        " * guards every key with textures.exists(), so a missing file falls back",
        " * to the line's base shot instead of crashing.",
        " */",
        "export const ROYAL_PROJECTILES = {",
    ]
    for key in art:
        if key not in PROJECTILE_LINES:
            continue
        lines.append(
            f"  {key}: {{ a: 'proj-royal-{key}', a2: 'proj-royal-{key}-2', "
            f"b: 'proj-royal-{key}-b', b2: 'proj-royal-{key}-b2' }},"
        )
    lines += [
        "};",
        "",
        "/**",
        " * Art key for a royal shot: the branch the tower took, at its tier.",
        " * Returns null for a line that does not shoot, so the caller falls back",
        " * to the shared type table.",
        " */",
        "export function royalProjectileArt(line, level, branch = 'spec-a') {",
        "  const tiers = ROYAL_PROJECTILES[line];",
        "  if (!tiers) return null;",
        "  const second = branch === 'spec-b';",
        "  if (level >= 4) return second ? tiers.b2 : tiers.a2;",
        "  return second ? tiers.b : tiers.a;",
        "}",
        "",
    ]
    with open(os.path.join(DATA_DIR, "royalProjectiles.js"), "w") as handle:
        handle.write("\n".join(lines))


def write_fx(art):
    lines = [
        "// GENERATED by scripts/build_royal_defences.py — do not edit by hand.",
        "",
        "/**",
        " * Royal effect atlases. Merged into `FX_SHEETS` by data/fxManifest.js so",
        " * `BattleArt` queues them with every other battle effect.",
        " */",
        "export const ROYAL_FX_SHEETS = {",
    ]
    for key in art:
        # Branch A keeps the line's own id; branch B is a distinct effect line
        # (`royalArtillery-b`), so the impact and the muzzle of the second
        # machine are its own art, not the first one's.
        for suffix in ("", "-b"):
            lines.append(
                f"  'fx-line-{key}{suffix}-impact': {{ file: 'fx-line-{key}{suffix}-impact.png', frameWidth: 128, frameHeight: 128, frames: {IMPACT_FRAMES}, frameRate: 30 }},"
            )
            lines.append(
                f"  'fx-line-{key}{suffix}-muzzle': {{ file: 'fx-line-{key}{suffix}-muzzle.png', frameWidth: 48, frameHeight: 48, frames: 1, frameRate: 1 }},"
            )
            if key in PROJECTILE_LINES:
                lines.append(
                    f"  'fx-line-{key}{suffix}-trail': {{ file: 'fx-line-{key}{suffix}-trail.png', frameWidth: 48, frameHeight: 48, frames: 1, frameRate: 1 }},"
                )
    lines.append("};")
    lines.append("")
    with open(os.path.join(DATA_DIR, "royalFx.js"), "w") as handle:
        handle.write("\n".join(lines))


if __name__ == "__main__":
    main()
