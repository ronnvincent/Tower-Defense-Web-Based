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


def foundation(p: Pen, level: int, stone=True, profile=None):
    """One real structural step per tier, so L1…L5 are not a tint ramp.

    L1 timber deck → L2 stone footing + iron brackets → L3 stepped emplacement
    with a railing → L4 bastion with buttresses and crenellations → L5 royal
    bastion with a gold band, carved emblem and corner spires.
    """
    mid = BASE_W / 2
    profile = profile or DEFAULT_PROFILE
    w = FOUND_W[level] * profile.get("w", 1.0)
    h = FOUND_H[level] * profile.get("h", 1.0)
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

    if level == 3:
        return top

    # L4+ — buttresses and crenellations.
    for x in (left + 3, right - 3):
        p.poly([(x - 5, GROUND - 8), (x + 5, GROUND - 8), (x + 3, top + 6), (x - 3, top + 6)],
               fill=STONE_L, outline=OUTLINE, width=1.2)
        p.rect(x - 5.5, top + 14, x + 5.5, top + 18, fill=IRON, outline=OUTLINE, width=0.8)
    _crest(p, level, profile.get("crest", "round"), left, right, top)
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


def base_royalArtillery(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["royalArtillery"])
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

def base_siegeBallista(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["siegeBallista"])
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

def base_arcaneSniper(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["arcaneSniper"])
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

def base_mortar(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["mortar"])
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

def base_rimeTower(p: Pen, level: int):
    top = foundation(p, level, stone=False)
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

def base_tesla(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["tesla"])
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

def base_skybreaker(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["skybreaker"])
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

def base_workshop(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["workshop"])
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

def base_obelisk(p: Pen, level: int):
    top = foundation(p, level, profile=PROFILES["obelisk"])
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

def base_spikeTrap(p: Pen, level: int):
    mid = BASE_W / 2
    w = [40, 48, 56, 64, 74][level - 1]
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

POSES = [
    dict(rec=0.0, flash=False, charge=0.00, draw=0.00, swing=0.00, rise=0.00),   # 0 rest
    dict(rec=-2.0, flash=False, charge=0.35, draw=0.55, swing=0.45, rise=0.25),  # 1 prepare
    dict(rec=-3.0, flash=False, charge=0.80, draw=1.00, swing=0.95, rise=0.60),  # 2 charged
    dict(rec=9.0, flash=True, charge=0.60, draw=0.30, swing=1.45, rise=1.00),    # 3 release
    dict(rec=5.0, flash=False, charge=0.22, draw=0.08, swing=1.10, rise=0.75),   # 4 recoil
    dict(rec=1.0, flash=False, charge=0.04, draw=0.00, swing=0.18, rise=0.20),   # 5 settle
]


@dataclass
class Line:
    key: str
    base: callable
    weapon: callable
    kind: str            # 'rotating' | 'static'
    accent: str
    projectile: str | None
    muzzle: str


LINES = [
    Line("royalArtillery", base_royalArtillery, weapon_royalArtillery, "rotating", "#ff9d3c",
         "proj-royal-royalArtillery", "shell"),
    Line("siegeBallista", base_siegeBallista, weapon_siegeBallista, "rotating", "#e7e2d2",
         "proj-royal-siegeBallista", "bolt"),
    Line("arcaneSniper", base_arcaneSniper, weapon_arcaneSniper, "rotating", "#a98cff",
         "proj-royal-arcaneSniper", "lance"),
    Line("mortar", base_mortar, weapon_mortar, "rotating", "#ffb347",
         "proj-royal-mortar", "shell"),
    Line("rimeTower", base_rimeTower, weapon_rimeTower, "static", "#8fd4ee",
         "proj-royal-rimeTower", "shard"),
    Line("tesla", base_tesla, weapon_tesla, "static", "#bfe9ff",
         "proj-royal-tesla", "arc"),
    Line("skybreaker", base_skybreaker, weapon_skybreaker, "rotating", "#ffd47a",
         "proj-royal-skybreaker", "bolt"),
    Line("workshop", base_workshop, weapon_workshop, "static", "#ffc46b",
         None, "hammer"),
    Line("obelisk", base_obelisk, weapon_obelisk, "static", "#c9a8ff",
         None, "rune"),
    Line("spikeTrap", base_spikeTrap, weapon_spikeTrap, "static", "#cfd6df",
         None, "spike"),
]


def render_base(line: Line, level: int):
    image = new_base()
    p = Pen(image)
    mount_y = line.base(p, level)
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


def render_weapon(line: Line, level: int, pose):
    image = new_frame()
    p = Pen(image)
    tip = line.weapon(p, level, pose)
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


def render_impact(line: Line):
    strip = Image.new("RGBA", (IMPACT_SIZE * IMPACT_FRAMES * SS, IMPACT_SIZE * SS), (0, 0, 0, 0))
    accent = hx(line.accent)
    for index in range(IMPACT_FRAMES):
        frame = Image.new("RGBA", (IMPACT_SIZE * SS, IMPACT_SIZE * SS), (0, 0, 0, 0))
        p = Pen(frame)
        t = index / (IMPACT_FRAMES - 1)
        fade = int(95 + 160 * max(0.0, 1.0 - t ** 1.4))
        c = IMPACT_SIZE / 2
        if index == 0:
            p.disc(c, c, 6, fill=(255, 255, 255, 235))
        else:
            radius = 6 + t * 40
            width = max(1.8, 5.0 * (1 - t))
            p.ring(c, c, radius, (*accent[:3], fade), width)
            p.ring(c, c, radius * 0.62, (*accent[:3], int(fade * 0.7)), max(1.0, width * 0.6))
            spokes = 8
            for k in range(spokes):
                a = math.radians(k * (360 / spokes) + t * 40)
                r0 = radius * 0.7
                r1 = radius * (1.05 + 0.25 * (k % 2))
                p.line([(c + math.cos(a) * r0, c + math.sin(a) * r0),
                        (c + math.cos(a) * r1, c + math.sin(a) * r1)], (*accent[:3], fade), max(1.0, width * 0.8))
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


def render_ruin(line: Line):
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


def render_trail(line: Line):
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
    layers = [
        (0.34, 0.26, 13.0, 245),
        (0.78, 0.48, 10.0, 190),
        (1.10, 0.72, 6.0, 130),
    ]
    for width_scale, length_scale, radius, alpha in layers:
        top = size * 0.5 - size * length_scale * 0.75
        bottom = size * 0.5 + size * length_scale * 0.35
        p = Pen(image)
        p.rect(cx - radius * width_scale, top, cx + radius * width_scale, bottom,
               fill=(*accent[:3], alpha))
    # Soften the edges so the streak fades into the tile instead of ending flat.
    image = image.filter(ImageFilter.GaussianBlur(2.2 * SS))
    return downsample(image)


def render_muzzle(line: Line):
    size = 48
    image = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    p = Pen(image)
    accent = hx(line.accent)
    c = size / 2
    for k in range(6):
        a = math.radians(k * 60)
        p.line([(c, c), (c + math.cos(a) * 16, c + math.sin(a) * 16)], (*accent[:3], 220), 2.0)
    p.disc(c, c, 7, fill=(255, 250, 226, 240))
    p.ring(c, c, 12, (*accent[:3], 180), 1.6)
    return downsample(image)


# --------------------------------------------------------------------------
# projectiles — each line's shot is its own silhouette
# --------------------------------------------------------------------------

def render_projectile(kind: str, accent: str):
    size = (40, 64)
    image = Image.new("RGBA", (size[0] * SS, size[1] * SS), (0, 0, 0, 0))
    p = Pen(image)
    c = hx(accent)
    cx, top = size[0] / 2, 4.0
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
        for level in range(1, 6):
            base_img, mount = render_base(line, level)
            base_name = f"base_{line.key}-l{level}.png"
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
                frame, frame_tip = render_weapon(line, level, pose)
                frames.append(frame)
                tip = max(tip, frame_tip)
            sheet = Image.new("RGBA", (FRAME * 6, FRAME), (0, 0, 0, 0))
            for index, frame in enumerate(frames):
                sheet.alpha_composite(frame, (index * FRAME, 0))
            weapon_name = f"weapon_{line.key}-l{level}.png"
            sheet.save(os.path.join(TOWER_DIR, weapon_name))
            written.append(os.path.join("public/assets/towers", weapon_name))

            tiers[f"lvl{level}"] = dict(
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

        card = render_card(render_base(line, 3)[0], render_weapon(line, 3, POSES[0])[0], render_base(line, 3)[1])
        card_name = f"card_{line.key}.png"
        card.save(os.path.join(UI_DIR, card_name))
        written.append(os.path.join("public/assets/ui", card_name))

        if line.projectile:
            projectile = render_projectile(projectile_kind(line), line.accent)
            projectile_name = f"{line.projectile}.png"
            projectile.save(os.path.join(PROJ_DIR, projectile_name))
            written.append(os.path.join("public/assets/projectiles", projectile_name))

        impact = render_impact(line)
        impact_name = f"fx-line-{line.key}-impact.png"
        impact.save(os.path.join(FX_DIR, impact_name))
        written.append(os.path.join("public/assets/fx", impact_name))

        muzzle = render_muzzle(line)
        muzzle_name = f"fx-line-{line.key}-muzzle.png"
        muzzle.save(os.path.join(FX_DIR, muzzle_name))
        written.append(os.path.join("public/assets/fx", muzzle_name))

        ruin = render_ruin(line)
        ruin_name = f"ruin_{line.key}.png"
        ruin.save(os.path.join(TOWER_DIR, ruin_name))
        written.append(os.path.join("public/assets/towers", ruin_name))

        # Only a line that prints a projectile can leave a trail behind one.
        trail_name = f"fx-line-{line.key}-trail.png"
        if line.projectile:
            trail = render_trail(line)
            trail.save(os.path.join(FX_DIR, trail_name))
            written.append(os.path.join("public/assets/fx", trail_name))
        elif os.path.exists(os.path.join(FX_DIR, trail_name)):
            # A field building has no shot, so a stale streak from an older run
            # would be an unused file claiming to belong to it.
            os.remove(os.path.join(FX_DIR, trail_name))

    write_tower_art(art)
    write_fx(art)
    print(f"wrote {len(written)} images + 2 data tables")
    for key in art:
        row = art[key]
        print(f"  {key:16s} mounts {[row[f'lvl{n}']['mount'] for n in range(1, 6)]}"
              f"  heights {[row[f'lvl{n}']['height'] for n in range(1, 6)]}")


def projectile_kind(line: Line) -> str:
    return line.muzzle


def write_tower_art(art):
    lines = [
        "// GENERATED by scripts/build_royal_defences.py — do not edit by hand.",
        "",
        "/**",
        " * Geometry for the ten royal lines, five authored tiers each.",
        " *",
        " * `mount` is the weapon pivot's height above the tile's bottom edge, so",
        " * `Tower` places the machinery on the shoulder of its emplacement instead",
        " * of on the ground. `muzzleY` is the distance from that pivot to the drawn",
        " * tip, measured by the generator (negative = up).",
        " */",
        "",
        "export const ROYAL_ART = {",
    ]
    for key, tiers in art.items():
        lines.append(f"  {key}: {{")
        for slot, data in tiers.items():
            fields = ", ".join(f"{name}: {js_num(value) if not isinstance(value, str) else repr(value)}"
                               for name, value in data.items())
            lines.append(f"    {slot}: {{ {fields} }},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    with open(os.path.join(DATA_DIR, "royalTowerArt.js"), "w") as handle:
        handle.write("\n".join(lines))


PROJECTILE_LINES = {
    "royalArtillery", "siegeBallista", "arcaneSniper", "mortar",
    "rimeTower", "tesla", "skybreaker",
}


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
        lines.append(
            f"  'fx-line-{key}-impact': {{ file: 'fx-line-{key}-impact.png', frameWidth: 128, frameHeight: 128, frames: {IMPACT_FRAMES}, frameRate: 30 }},"
        )
        lines.append(
            f"  'fx-line-{key}-muzzle': {{ file: 'fx-line-{key}-muzzle.png', frameWidth: 48, frameHeight: 48, frames: 1, frameRate: 1 }},"
        )
        if key in PROJECTILE_LINES:
            lines.append(
                f"  'fx-line-{key}-trail': {{ file: 'fx-line-{key}-trail.png', frameWidth: 48, frameHeight: 48, frames: 1, frameRate: 1 }},"
            )
    lines.append("};")
    lines.append("")
    with open(os.path.join(DATA_DIR, "royalFx.js"), "w") as handle:
        handle.write("\n".join(lines))


if __name__ == "__main__":
    main()
