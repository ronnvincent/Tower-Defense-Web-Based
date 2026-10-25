#!/usr/bin/env python3
"""Build the five engineer defence lines.

The Spire pack stops at six keeps, so the five new lines are authored here in the
same 64 px, side-view pixel idiom: chunky stone, iron banding and a coloured
accent that says which line the tower belongs to.

Unlike a re-grade, every slot is a different *drawing*: the geometry table below
gives each tier its own footprint, height and ornament set, so a level-5 Crossbow
Tower is a taller, wider, better-armed structure — not the level-3 art in another
palette. Weapons are horizontal animation strips (six frames, drawn pointing up)
that Phaser rotates around a pivot, exactly like the Spire sheets, so `TurretAim`
keeps working untouched.

    python3 scripts/build_engineer_towers.py

Writes `public/assets/towers/{base,weapon}_<line>-<slot>.png`, the dock icons
`public/assets/ui/card_<line>.png`, and the generated geometry table
`src/data/engineerTowerArt.js`.

Requires Pillow.
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWERS = os.path.join(ROOT, "public", "assets", "towers")
ICONS = os.path.join(ROOT, "public", "assets", "ui")
MANIFEST = os.path.join(ROOT, "src", "data", "engineerTowerArt.js")

# --------------------------------------------------------------------- palette

STONE_D = (40, 44, 58, 255)
STONE_M = (104, 112, 132, 255)
STONE_L = (163, 172, 194, 255)
STONE_XL = (212, 220, 236, 255)
IRON_D = (32, 35, 47, 255)
IRON_M = (84, 92, 110, 255)
IRON_L = (138, 146, 168, 255)
STEEL_D = (56, 66, 86, 255)
STEEL_M = (138, 154, 180, 255)
STEEL_L = (206, 220, 238, 255)
WOOD_D = (66, 46, 30, 255)
WOOD_M = (120, 84, 50, 255)
WOOD_L = (166, 122, 74, 255)
BRASS_D = (120, 88, 18, 255)
BRASS_M = (208, 162, 58, 255)
BRASS_L = (255, 216, 126, 255)
COPPER_D = (118, 62, 32, 255)
COPPER_M = (198, 112, 52, 255)
COPPER_L = (242, 166, 98, 255)
EMBER_D = (148, 42, 16, 255)
EMBER_M = (238, 100, 30, 255)
EMBER_L = (255, 188, 98, 255)
TOX_D = (30, 62, 34, 255)
TOX_M = (86, 156, 74, 255)
TOX_L = (168, 226, 124, 255)
TEAL_D = (24, 56, 68, 255)
TEAL_M = (60, 132, 148, 255)
TEAL_L = (134, 208, 216, 255)
ROPE = (198, 172, 122, 255)
GLOW = (255, 244, 200, 255)
WINDOW = (16, 18, 26, 255)


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(image: Image.Image, folder: str, name: str) -> None:
    os.makedirs(folder, exist_ok=True)
    image.save(os.path.join(folder, name), optimize=True)


def dim(colour, factor: float = 0.68):
    return (
        max(0, int(colour[0] * factor)),
        max(0, int(colour[1] * factor)),
        max(0, int(colour[2] * factor)),
        255,
    )


def lit(colour, factor: float = 1.22):
    return (
        min(255, int(colour[0] * factor)),
        min(255, int(colour[1] * factor)),
        min(255, int(colour[2] * factor)),
        255,
    )


# ------------------------------------------------------------------- brickwork


def brick_layer(size, face=STONE_M, joint=None, step: int = 8, course: int = 5) -> Image.Image:
    """A full-canvas brick pattern. Callers mask it to their silhouette."""
    joint = joint or dim(face, 0.66)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), fill=face)
    row = 0
    y = 0
    while y < size[1]:
        draw.line((0, y, size[0], y), fill=joint, width=1)
        offset = 0 if row % 2 == 0 else step // 2
        x = offset
        while x < size[0]:
            draw.line((x, y + 1, x, y + course - 1), fill=joint, width=1)
            x += step
        row += 1
        y += course
    return layer


def masked_stone(size, polygon, face=STONE_M, highlight=True) -> Image.Image:
    """Brickwork clipped to an arbitrary silhouette, with a lit left edge."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    bricks = brick_layer(size, face)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(bricks, (0, 0), mask)

    if highlight:
        shade = Image.new("RGBA", size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shade)
        xs = [p[0] for p in polygon]
        left, right = min(xs), max(xs)
        sd.polygon(polygon, fill=(255, 255, 255, 38))
        sd.rectangle((left, 0, left + 3, size[1]), fill=(0, 0, 0, 60))
        sd.rectangle((right - 2, 0, right, size[1]), fill=(0, 0, 0, 60))
        shade.putalpha(ImageChops.multiply(shade.getchannel("A"), mask))
        out.alpha_composite(shade)

    edge = ImageDraw.Draw(out)
    edge.line(polygon + [polygon[0]], fill=STONE_D, width=1)
    return out


# --------------------------------------------------------------- slot geometry
#
# `foot` is the half-width at the ground line, `shoulder` the half-width at the
# top of the shaft. Turrets, spires and banners are the per-tier silhouette.

SLOTS = ["lvl1", "lvl2", "spec-a", "spec-b", "spec-a2", "spec-a3", "spec-b2", "spec-b3"]

GEOMETRY = {
    #               canvas      shaft              turrets  spire  banner
    "lvl1": dict(w=60, h=94,  foot=17, shoulder=13, top=34, turrets=0, spire=False, banner=False),
    "lvl2": dict(w=70, h=108, foot=21, shoulder=16, top=30, turrets=1, spire=False, banner=False),
    "spec-a": dict(w=82, h=124, foot=24, shoulder=18, top=26, turrets=1, spire=False, banner=True),
    "spec-b": dict(w=94, h=116, foot=28, shoulder=22, top=28, turrets=2, spire=False, banner=True),
    "spec-a2": dict(w=96, h=138, foot=28, shoulder=21, top=22, turrets=2, spire=False, banner=True),
    "spec-b2": dict(w=106, h=132, foot=32, shoulder=25, top=24, turrets=2, spire=True, banner=True),
    "spec-a3": dict(w=108, h=152, foot=31, shoulder=23, top=16, turrets=2, spire=True, banner=True),
    "spec-b3": dict(w=118, h=148, foot=35, shoulder=27, top=18, turrets=3, spire=True, banner=True),
}


def accent_of(line: str, bright: bool = False):
    palette = {
        "crossbow": (BRASS_M, BRASS_L),
        "gatling": (COPPER_M, COPPER_L),
        "flamer": (EMBER_M, EMBER_L),
        "venom": (TOX_M, TOX_L),
        "harpoon": (TEAL_M, TEAL_L),
    }
    base, light = palette[line]
    return light if bright else base


# --------------------------------------------------------------- base ornaments


def merlons(draw: ImageDraw.ImageDraw, x0: int, x1: int, y: int, height: int, face=STONE_M) -> None:
    draw.rectangle((x0, y, x1, y + height), fill=dim(face, 0.85))
    span = x1 - x0
    count = max(4, span // 9)
    step = span / count
    for i in range(count):
        bx = int(x0 + i * step)
        bw = max(3, int(step) - 3)
        draw.rectangle((bx, y - 3, bx + bw, y + height), fill=face)
        draw.line((bx, y - 3, bx + bw, y - 3), fill=STONE_XL)
    draw.line((x0, y + height, x1, y + height), fill=STONE_D)


def turret(image: Image.Image, cx: int, top: int, bottom: int, width: int,
           accent, capped: bool) -> None:
    """A slim side tower: the clearest 'this tier is bigger' signal."""
    half = width // 2
    poly = [(cx - half, top), (cx + half, top), (cx + half, bottom), (cx - half, bottom)]
    image.alpha_composite(masked_stone(image.size, poly))
    draw = ImageDraw.Draw(image)
    merlons(draw, cx - half - 2, cx + half + 2, top - 5, 4, STONE_L)
    for wy in range(top + 6, bottom - 8, 12):
        draw.rectangle((cx - 2, wy, cx + 1, wy + 4), fill=WINDOW)
    if capped:
        draw.polygon([(cx - half - 3, top - 5), (cx + half + 3, top - 5), (cx, top - 20)], fill=accent)
        draw.polygon([(cx - half - 3, top - 5), (cx, top - 20), (cx - 2, top - 5)], fill=dim(accent, 0.8))


def flag(draw: ImageDraw.ImageDraw, x: int, y: int, height: int, colour) -> None:
    draw.line((x, y, x, y - height), fill=IRON_M)
    draw.polygon([(x + 1, y - height), (x + 13, y - height + 5), (x + 1, y - height + 10)], fill=colour)
    draw.line((x + 1, y - height, x + 1, y - height + 10), fill=dim(colour, 0.7))


def side_spire(image: Image.Image, cx: int, top: int, height: int, colour) -> None:
    """A slim pinnacle beside the crown — the tier's height, kept off-centre so
    the rotating weapon never hides it."""
    draw = ImageDraw.Draw(image)
    draw.polygon([(cx - 5, top), (cx + 5, top), (cx, top - height)], fill=colour)
    draw.polygon([(cx - 5, top), (cx, top - height), (cx - 1, top)], fill=dim(colour, 0.76))
    draw.line((cx, top - height, cx, top - height - 6), fill=IRON_M)
    draw.polygon([(cx + 1, top - height - 6), (cx + 8, top - height - 3),
                  (cx + 1, top - height)], fill=BRASS_M)


def machines(draw: ImageDraw.ImageDraw, line: str, cx: int, top: int, bottom: int,
             half: int, tier: int) -> None:
    """Line-specific machinery bolted to the keep. `tier` is 0..3."""
    accent = accent_of(line)
    bright = accent_of(line, True)
    left, right = cx - half, cx + half

    if line == "crossbow":
        # Windlass on the roof, growing a second wheel and a bolt rack.
        draw.rectangle((left + 3, top - 12, right - 3, top - 4), fill=WOOD_D)
        draw.rectangle((left + 4, top - 11, right - 4, top - 6), fill=WOOD_M)
        draw.line((left + 5, top - 10, right - 5, top - 10), fill=WOOD_L)
        wx = cx - 12
        draw.ellipse((wx - 7, top - 24, wx + 7, top - 10), outline=STEEL_M, width=2)
        draw.line((wx - 6, top - 17, wx + 6, top - 17), fill=STEEL_D)
        draw.line((wx, top - 23, wx, top - 11), fill=STEEL_D)
        draw.point((wx, top - 17), fill=STEEL_L)
        if tier >= 2:
            wx2 = cx + 12
            draw.ellipse((wx2 - 7, top - 24, wx2 + 7, top - 10), outline=STEEL_M, width=2)
            draw.line((wx2, top - 23, wx2, top - 11), fill=STEEL_D)
        if tier >= 3:
            for i, bx in enumerate((left - 2, left + 6)):
                draw.line((bx, bottom - 34, bx, bottom - 54), fill=STEEL_M, width=2)
                draw.polygon([(bx - 2, bottom - 56), (bx + 2, bottom - 56), (bx, bottom - 62)],
                             fill=STEEL_L)

    elif line == "gatling":
        # Boiler(s) + pressure dial; the crane arm appears at tier 3.
        for side in ([-1] if tier < 2 else [-1, 1]):
            bx = cx + side * (half - 8)
            draw.rectangle((bx - 6, top - 26, bx + 6, top - 2), fill=COPPER_D, outline=IRON_D)
            draw.rectangle((bx - 4, top - 24, bx + 4, top - 4), fill=COPPER_M)
            draw.rectangle((bx - 4, top - 16, bx + 4, top - 14), fill=BRASS_M)
            draw.ellipse((bx - 6, top - 28, bx + 6, top - 24), fill=COPPER_L, outline=IRON_D)
            draw.line((bx, top - 4, bx, top), fill=IRON_D)
        draw.ellipse((cx - 6, top - 16, cx + 6, top - 4), fill=BRASS_M, outline=BRASS_D)
        draw.line((cx, top - 10, cx + 3, top - 14), fill=BRASS_D)
        draw.point((cx, top - 10), fill=BRASS_D)
        if tier >= 3:
            draw.line((left, top - 20, left - 8, top - 34), fill=STEEL_D, width=2)
            draw.ellipse((left - 12, top - 40, left - 4, top - 32), fill=STEEL_M, outline=STEEL_D)

    elif line == "flamer":
        # Fuel drum(s) on the plinth and a lit burner channel up the face.
        drums = [-1] if tier < 2 else [-1, 1]
        for side in drums:
            dx = cx + side * (half + 2)
            draw.rectangle((dx - 5, bottom - 30, dx + 5, bottom - 6), fill=EMBER_D, outline=IRON_D)
            draw.rectangle((dx - 3, bottom - 28, dx + 3, bottom - 8), fill=COPPER_M)
            draw.rectangle((dx - 3, bottom - 20, dx + 3, bottom - 18), fill=EMBER_L)
            draw.ellipse((dx - 5, bottom - 32, dx + 5, bottom - 26), fill=EMBER_M, outline=IRON_D)
        draw.line((cx - 3, top + 6, cx - 3, bottom - 12), fill=EMBER_D, width=2)
        draw.line((cx + 3, top + 6, cx + 3, bottom - 12), fill=EMBER_D, width=2)
        for gy in range(top + 10, bottom - 14, 14):
            draw.point((cx - 3, gy), fill=EMBER_M)
            draw.point((cx + 3, gy), fill=EMBER_M)
        if tier >= 3:
            draw.ellipse((cx - 7, top - 18, cx + 7, top - 4), fill=EMBER_M, outline=EMBER_D)
            draw.ellipse((cx - 4, top - 15, cx + 4, top - 7), fill=EMBER_L)

    elif line == "venom":
        # Glass still with sloshing fluid; a second vat and pipes higher up.
        vats = 1 if tier < 2 else 2
        for i in range(vats):
            vx = cx - 16 if i == 0 else cx + 4
            vy = top - 22 if i == 0 else top - 34
            draw.rectangle((vx, vy, vx + 14, vy + 20), fill=TOX_D, outline=IRON_D)
            draw.rectangle((vx + 2, vy + 6, vx + 12, vy + 18), fill=TOX_M)
            draw.rectangle((vx + 3, vy + 7, vx + 11, vy + 10), fill=TOX_L)
            draw.line((vx + 14, vy + 14, min(vx + 24, right), vy + 14), fill=IRON_M, width=2)
        if tier >= 3:
            draw.ellipse((cx - 5, top - 44, cx + 5, top - 34), fill=TOX_L, outline=TOX_M)

    elif line == "harpoon":
        # Winch drum, coiled rope and a rack of spare spears.
        draw.rectangle((left + 1, top - 14, left + 21, top - 2), fill=WOOD_D, outline=WOOD_D)
        for i in range(3):
            draw.arc((left + 3, top - 13 + i * 3, left + 19, top - 3 + i * 3), 0, 180, fill=ROPE)
        draw.ellipse((left + 1, top - 14, left + 21, top - 2), outline=IRON_M)
        for i in range(3 if tier >= 2 else 2):
            sx = right - 3 - i * 4
            draw.line((sx, top - 2, sx, top - 20), fill=STEEL_M)
            draw.polygon([(sx - 2, top - 20), (sx + 2, top - 20), (sx, top - 26)], fill=STEEL_L)
        if tier >= 3:
            draw.line((cx, top - 30, cx, top - 2), fill=TEAL_M, width=1)
            draw.ellipse((cx - 8, top - 38, cx + 8, top - 22), outline=TEAL_L)


def window_grid(draw: ImageDraw.ImageDraw, left: int, right: int, top: int, bottom: int,
                tier: int) -> None:
    """Two columns of glowing arrow-slits; the apex gets a lit great window."""
    for wy in range(top + 14, bottom - 26, 20):
        for wx in (left + 5, right - 8):
            draw.rectangle((wx, wy, wx + 3, wy + 7), fill=WINDOW)
            draw.point((wx + 1, wy + 2), fill=GLOW)
    if tier >= 3:
        cx = (left + right) // 2
        wy = top + 26
        draw.ellipse((cx - 7, wy, cx + 7, wy + 12), fill=(24, 28, 38, 255))
        draw.ellipse((cx - 6, wy + 1, cx + 6, wy + 11), fill=GLOW)


def doorway(draw: ImageDraw.ImageDraw, cx: int, bottom: int, width: int = 14) -> None:
    half = width // 2
    draw.rectangle((cx - half, bottom - 16, cx + half, bottom - 2), fill=WOOD_D)
    draw.arc((cx - half, bottom - 26, cx + half, bottom - 6), 180, 360, fill=WOOD_M)
    draw.line((cx, bottom - 15, cx, bottom - 3), fill=WOOD_M)
    draw.rectangle((cx - half - 1, bottom - 17, cx + half + 1, bottom - 16), fill=STONE_L)


def draw_base(line: str, slot: str) -> Image.Image:
    geo = GEOMETRY[slot]
    w, h = geo["w"], geo["h"]
    cx = w // 2
    top = geo["top"]
    foot, shoulder = geo["foot"], geo["shoulder"]
    tier = [0, 0, 1, 1, 2, 3, 2, 3][SLOTS.index(slot)]
    accent = accent_of(line)
    bright = accent_of(line, True)
    bottom = h - 12  # keeping the last 12 px for the plinth

    image = blank(w, h)
    draw = ImageDraw.Draw(image)

    # --- side turrets first, so the keep's wall overlaps their inner edge ----
    turret_positions = {
        0: [],
        1: [(cx + shoulder + 4, top + 20)],
        2: [(cx - shoulder - 12, top + 24), (cx + shoulder + 4, top + 24)],
        3: [(cx - shoulder - 12, top + 30), (cx + shoulder + 4, top + 30), (cx + shoulder + 4, top + 4)],
    }[geo["turrets"]]
    for tx, ty in turret_positions:
        turret(image, tx + 4, ty, bottom - 4, 11, accent, capped=tier >= 2)
    draw = ImageDraw.Draw(image)

    # --- keep shaft ---------------------------------------------------------
    shaft = [(cx - shoulder, top), (cx + shoulder, top), (cx + foot, bottom), (cx - foot, bottom)]
    image.alpha_composite(masked_stone(image.size, shaft))
    draw = ImageDraw.Draw(image)

    # --- crown --------------------------------------------------------------
    merlons(draw, cx - shoulder - 3, cx + shoulder + 3, top - 7, 6, STONE_L)
    draw.rectangle((cx - shoulder - 4, top - 9, cx + shoulder + 4, top - 6), fill=STONE_D)

    # --- plinth -------------------------------------------------------------
    pw = foot + 7
    draw.rectangle((cx - pw, bottom, cx + pw, bottom + 8), fill=STONE_D)
    draw.rectangle((cx - pw + 1, bottom + 1, cx + pw - 1, bottom + 6), fill=STONE_M)
    draw.line((cx - pw + 2, bottom, cx + pw - 2, bottom), fill=STONE_L)
    for x in range(cx - pw + 3, cx + pw - 2, 6):
        draw.line((x, bottom + 2, x, bottom + 5), fill=dim(STONE_M))

    # --- line machinery -----------------------------------------------------
    machines(draw, line, cx, top, bottom, shoulder, tier)

    # --- openings -----------------------------------------------------------
    window_grid(draw, cx - foot + 2, cx + foot - 2, top, bottom, tier)
    doorway(draw, cx, bottom, 12 + tier * 2)

    # --- banners ------------------------------------------------------------
    if geo["banner"]:
        flag(draw, cx - shoulder - 2, top - 8, 16 + tier * 2, accent)
        if geo["turrets"] >= 2:
            flag(draw, cx + shoulder + 2, top - 8, 16 + tier * 2, dim(accent, 0.85))

    # --- spires -------------------------------------------------------------
    if geo["spire"]:
        # Off-centre on purpose: the weapon sprite is drawn over the tower's
        # middle, so a centred spire would be invisible in play.
        side_spire(image, cx - shoulder - 8, top - 4, 26, bright)
        side_spire(image, cx + shoulder + 8, top - 4, 22, dim(bright, 0.86))
        draw = ImageDraw.Draw(image)

    # --- apex crystal -------------------------------------------------------
    if tier >= 3:
        cyc = top - 32
        draw = ImageDraw.Draw(image)
        draw.polygon([(cx, cyc - 9), (cx + 6, cyc), (cx, cyc + 9), (cx - 6, cyc)], fill=bright)
        draw.polygon([(cx, cyc - 9), (cx + 6, cyc), (cx, cyc + 1)], fill=GLOW)
        draw.ellipse((cx - 12, cyc - 3, cx + 12, cyc + 3), outline=dim(bright, 0.9))

    # --- apex glow ----------------------------------------------------------
    if tier >= 3:
        glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        rgb = (bright[0], bright[1], bright[2])
        for step in range(3):
            r = 20 + step * 3
            gd.ellipse((cx - r, h - 9, cx + r, h - 1), outline=rgb + (90 - step * 26,), width=2)
        image.alpha_composite(glow)

    return image


# -------------------------------------------------------------------- weapons
#
# Frame is 128×128 for every slot so the larger tiers have room; the pivot sits
# low (64, 100) and matches the `px`/`py` fields written to the manifest.

WEAPON_FRAME = 128
PIVOT = (64, 100)
FRAMES = 6


class Pen:
    """ImageDraw with a pivot-relative scale, so one drawing serves every tier."""

    def __init__(self, draw: ImageDraw.ImageDraw, scale: float):
        self.d = draw
        self.s = scale

    def _pt(self, x: float, y: float):
        return (PIVOT[0] + (x - 48) * self.s, PIVOT[1] + (y - 74) * self.s)

    def _box(self, x0, y0, x1, y1):
        a = self._pt(x0, y0)
        b = self._pt(x1, y1)
        return (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))

    def line(self, xy, fill, width=1):
        pts = [self._pt(xy[i], xy[i + 1]) for i in range(0, len(xy), 2)]
        self.d.line(pts, fill=fill, width=max(1, int(round(width * self.s))))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.rectangle(self._box(x0, y0, x1, y1), fill=fill, outline=outline,
                         width=max(1, int(round(width * self.s))))

    def ellipse(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.ellipse(self._box(x0, y0, x1, y1), fill=fill, outline=outline,
                       width=max(1, int(round(width * self.s))))

    def polygon(self, points, fill):
        self.d.polygon([self._pt(x, y) for x, y in points], fill=fill)

    def point(self, x, y, fill):
        self.d.point(self._pt(x, y), fill=fill)

    def arc(self, x0, y0, x1, y1, start, end, fill, width=1):
        self.d.arc(self._box(x0, y0, x1, y1), start, end, fill=fill,
                   width=max(1, int(round(width * self.s))))


def _weapon_frame(pen: Pen, line: str, tier: int, phase: float) -> None:
    accent = accent_of(line)
    bright = accent_of(line, True)
    kick = math.sin(phase * math.tau)
    tau = math.tau

    # Mount collar shared by every weapon.
    pen.ellipse(36, 66, 60, 80, fill=IRON_D)
    pen.ellipse(38, 67, 58, 78, fill=IRON_M)
    pen.ellipse(43, 69, 53, 76, fill=BRASS_M if tier >= 3 else IRON_L)

    if line == "crossbow":
        # Two limbs and a string. The string snaps forward on release.
        pen.line((18, 40 + kick * 2, 78, 40 + kick * 2), fill=STEEL_D, width=3)
        for side in (-1, 1):
            pen.line((48 + side * 30, 40, 48 + side * 34, 56), fill=STEEL_M, width=3)
            pen.line((48 + side * 14, 32, 48 + side * 30, 40), fill=STEEL_L, width=2)
        pen.line((18, 40, 42, 34 - kick * 6), fill=(238, 234, 216, 255))
        pen.line((78, 40, 54, 34 - kick * 6), fill=(238, 234, 216, 255))
        pen.rect(45, 30, 51, 72, fill=WOOD_D)
        pen.rect(46, 32, 49, 70, fill=WOOD_M)
        pen.line((48, 40, 48, 8), fill=STEEL_L, width=2)
        pen.polygon([(48, 2), (52, 12), (48, 18), (44, 12)], fill=bright)
        if tier >= 2:
            pen.line((30, 30, 66, 30), fill=accent, width=1)
            pen.ellipse(16, 36, 22, 44, fill=BRASS_M)
            pen.ellipse(74, 36, 80, 44, fill=BRASS_M)
        if tier >= 3:
            pen.line((26, 20, 70, 20), fill=STEEL_D, width=2)
            pen.polygon([(24, 16), (28, 20), (24, 24)], fill=bright)

    elif line == "gatling":
        spin = phase * tau
        for i in range(6):
            angle = spin + i * tau / 6
            bx = 48 + math.cos(angle) * 8
            depth = 0.5 + 0.5 * math.sin(angle)
            shade = IRON_L if depth > 0.66 else IRON_M if depth > 0.33 else IRON_D
            pen.line((bx, 64, bx, 24), fill=shade, width=3)
            pen.rect(bx - 1.5, 18, bx + 1.5, 24, fill=STEEL_D)
        pen.rect(34, 28, 62, 62, fill=IRON_D)
        pen.rect(36, 30, 60, 60, fill=IRON_M)
        pen.ellipse(34, 24, 62, 36, fill=STEEL_D)
        pen.ellipse(37, 26, 59, 34, fill=STEEL_M)
        pen.line((36, 44, 60, 44), fill=BRASS_M)
        if tier >= 2:
            for side in (-1, 1):
                x0, x1 = sorted((48 + side * 14, 48 + side * 18))
                pen.rect(x0, 32, x1, 58, fill=COPPER_M)
        if tier >= 3:
            pen.ellipse(44, 38, 52, 46, fill=EMBER_L)
            pen.line((26, 40, 34, 40), fill=BRASS_M, width=2)
            pen.line((62, 40, 70, 40), fill=BRASS_M, width=2)

    elif line == "flamer":
        pen.rect(41, 40, 55, 72, fill=IRON_D)
        pen.rect(43, 42, 53, 70, fill=IRON_M)
        pen.polygon([(39, 40), (57, 40), (53, 28), (43, 28)], fill=STEEL_D)
        pen.line((40, 54, 32, 62), fill=COPPER_M, width=2)
        pen.line((56, 54, 64, 62), fill=COPPER_M, width=2)
        flare = 8 + 10 * (0.5 + 0.5 * math.sin(phase * tau))
        pen.polygon([(43, 28), (53, 28), (48, 28 - flare)], fill=EMBER_M)
        pen.polygon([(45, 28), (51, 28), (48, 28 - flare * 0.62)], fill=EMBER_L)
        if tier >= 2:
            pen.ellipse(36, 60, 60, 76, outline=COPPER_M)
        if tier >= 3:
            pen.line((34, 22, 62, 22), fill=EMBER_D, width=1)
            pen.ellipse(42, 34, 54, 44, fill=EMBER_M)

    elif line == "venom":
        pen.line((39, 66, 39, 52), fill=IRON_M, width=2)
        pen.line((57, 66, 57, 52), fill=IRON_M, width=2)
        pen.ellipse(33, 24, 63, 56, fill=(22, 40, 26, 255))
        pen.ellipse(35, 26, 61, 54, fill=TOX_D)
        level = 40 + math.sin(phase * tau) * 4
        pen.ellipse(37, level, 59, 54, fill=TOX_M)
        pen.ellipse(41, level + 3, 51, level + 10, fill=TOX_L)
        pen.ellipse(33, 24, 63, 56, outline=IRON_D)
        pen.rect(45, 16, 51, 26, fill=IRON_M)
        pen.polygon([(44, 16), (52, 16), (48, 8)], fill=TOX_L)
        if tier >= 2:
            pen.ellipse(30, 34, 66, 48, outline=accent)
        if tier >= 3:
            pen.ellipse(42, 32, 54, 46, fill=TOX_L)
            pen.ellipse(45, 36, 51, 42, fill=(255, 255, 255, 210))

    elif line == "harpoon":
        pen.rect(43, 46, 53, 68, fill=WOOD_D)
        pen.rect(44, 48, 52, 66, fill=WOOD_M)
        pen.ellipse(38, 58, 58, 74, fill=IRON_D)
        pen.ellipse(40, 60, 56, 72, fill=ROPE)
        tip = 14 + kick * 6
        pen.line((48, 58, 48, tip + 10), fill=STEEL_M, width=3)
        pen.polygon([(48, tip), (54, tip + 12), (48, tip + 8), (42, tip + 12)], fill=STEEL_L)
        pen.polygon([(48, tip + 8), (58, tip + 18), (48, tip + 15), (38, tip + 18)], fill=accent)
        if tier >= 2:
            pen.line((48, 58, 48, 66 + kick * 2), fill=ROPE)
            pen.ellipse(34, 44, 62, 60, outline=accent)
        if tier >= 3:
            pen.polygon([(48, 2), (52, 10), (48, 16), (44, 10)], fill=bright)


# How far above the drawing's pivot each line's muzzle sits, in pre-scale units.
# Used to publish an exact MUZZLE_OFFSET instead of guessing one.
TIP = {"crossbow": 98, "gatling": 84, "flamer": 90, "venom": 92, "harpoon": 98}

# The weapon is drawn ~100 px tall in its frame. At full size it would tower over
# its keep, so every slot is scaled to the same proportions as the Spire sheets
# (muzzle ≈ 1.05–1.35× the base height).
ART_SCALE = {
    "lvl1": 0.60, "lvl2": 0.64, "spec-a": 0.68, "spec-b": 0.68,
    "spec-a2": 0.72, "spec-b2": 0.72, "spec-a3": 0.78, "spec-b3": 0.78,
}


def draw_weapon(line: str, slot: str) -> Image.Image:
    tier = [0, 0, 1, 1, 2, 3, 2, 3][SLOTS.index(slot)]
    scale = ART_SCALE[slot]
    strip = blank(WEAPON_FRAME * FRAMES, WEAPON_FRAME)
    for index in range(FRAMES):
        frame = blank(WEAPON_FRAME, WEAPON_FRAME)
        draw = ImageDraw.Draw(frame)
        _weapon_frame(Pen(draw, scale), line, tier, index / FRAMES)
        strip.alpha_composite(frame, (index * WEAPON_FRAME, 0))
    return strip


# ---------------------------------------------------------------------- output

LINES = {
    "crossbow": "Iron Crossbow",
    "gatling": "Clockwork Repeater",
    "flamer": "Pitchfire Siphon",
    "venom": "Venom Still",
    "harpoon": "Harpoon Winch",
}


def main() -> int:
    os.makedirs(TOWERS, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)

    records = []
    for line in LINES:
        for slot in SLOTS:
            suffix = "" if slot == "lvl1" else f"-{slot}"
            base_name = f"base_{line}{suffix}.png"
            weapon_name = f"weapon_{line}{suffix}.png"
            base = draw_base(line, slot)
            weapon = draw_weapon(line, slot)
            save(base, TOWERS, base_name)
            save(weapon, TOWERS, weapon_name)
            records.append(
                dict(line=line, slot=slot, base=base_name, weapon=weapon_name,
                     fw=WEAPON_FRAME, fh=WEAPON_FRAME, frames=FRAMES,
                     px=PIVOT[0], py=PIVOT[1], mount=base.height - 30,
                     muzzleY=-round(TIP[line] * ART_SCALE[slot]),
                     height=base.height, width=base.width)
            )

        icon = blank(64, 64)
        art = Image.open(os.path.join(TOWERS, f"base_{line}-spec-a.png")).convert("RGBA")
        ratio = min(58 / art.width, 60 / art.height, 1.0)
        art = art.resize((max(1, int(art.width * ratio)), max(1, int(art.height * ratio))),
                         Image.LANCZOS)
        icon.alpha_composite(art, ((64 - art.width) // 2, 64 - art.height - 2))
        save(icon, ICONS, f"card_{line}.png")

    write_manifest(records)
    print(f"wrote {len(records)} base + {len(records)} weapon sheets, {len(LINES)} dock icons")
    return 0


def write_manifest(records) -> None:
    lines = [
        "/**",
        " * engineerTowerArt.js — GENERATED by scripts/build_engineer_towers.py.",
        " * Do not edit by hand: re-run the script after changing the art.",
        " *",
        " * Geometry for the five engineer lines. Every slot is a separate drawing, so",
        " * the canvas grows with the tier and `mount` (the weapon pivot height above",
        " * the tile's ground line) is measured from the art, never guessed.",
        " */",
        "",
        "export const ENGINEER_ART = {",
    ]
    by_line = {}
    for rec in records:
        by_line.setdefault(rec["line"], {})[rec["slot"]] = rec

    for line, slots in by_line.items():
        lines.append(f"  {line}: {{")
        for slot in SLOTS:
            r = slots[slot]
            lines.append(
                "    '%s': { base: '%s', weapon: '%s', fw: %d, fh: %d, frames: %d, "
                "px: %d, py: %d, mount: %d, muzzleY: %d, height: %d, width: %d },"
                % (slot, r["base"], r["weapon"], r["fw"], r["fh"], r["frames"],
                   r["px"], r["py"], r["mount"], r["muzzleY"], r["height"], r["width"])
            )
        lines.append("  },")
    lines += [
        "};",
        "",
        "/** Frame size of every engineer weapon sheet. */",
        f"export const ENGINEER_WEAPON_FRAME = {{ width: {WEAPON_FRAME}, height: {WEAPON_FRAME}, frames: {FRAMES} }};",
        "",
    ]
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


if __name__ == "__main__":
    raise SystemExit(main())
