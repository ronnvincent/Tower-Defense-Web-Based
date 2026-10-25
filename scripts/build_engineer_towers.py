#!/usr/bin/env python3
"""Build the five engineer defence lines.

Each line is a *different building*, drawn from the ground line up:

    crossbow   Iron Crossbow        tall, narrow arbalest tower, great bow on top
    gatling    Clockwork Repeater   squat iron bunker, six-hole drum, smokestack
    flamer     Pitchfire Siphon     round riveted boiler, chimney, lit firebox
    venom      Venom Still          glass distillate vats on a copper stand
    harpoon    Harpoon Winch        timber winch, rope reel, long tilted gantry

That is the point of the pass: the five used to share one generic keep and differ
only in pennant colour, which made them unreadable at 64 px. Canvases are now
derived from each line's own proportions (see `geometry()`), so the set is also
~35 % smaller than the old 60–118 px towers and no longer collides with the
upgrade badges on the board. Every tier adds structure — a second winch, a bigger
drum, another flask — so an upgrade changes the silhouette, not just the palette.

Weapons are horizontal animation strips (six frames, drawn pointing up) that
Phaser rotates around a pivot, exactly like the Spire sheets, so `TurretAim`
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

# ------------------------------------------------------------------ proportions
#
# The complaint that started this pass: all five lines were the *same keep* with a
# differently coloured pennant, and every tier was that same keep grown wider
# (up to 118 px, so the towers and their badge labels collided on the board).
# A tower now gets its footprint from its own proportions — the bunker is wide
# and squat, the arbalest tower is tall and narrow — and the whole set is ~35 %
# smaller than before, which is what stops the labels overlapping.
#
# `foot`    half-width at the ground line
# `spread`  how far the line's machinery reaches past the shaft
# `head`    how tall the machinery above the crown is
LINES = {
    "crossbow": "Iron Crossbow",
    "gatling": "Clockwork Repeater",
    "flamer": "Pitchfire Siphon",
    "venom": "Venom Still",
    "harpoon": "Harpoon Winch",
}

PROPORTIONS = {
    #                       ground   reach  crown
    "crossbow": dict(foot=14, spread=10, head=46),   # tall, thin arbalest tower
    "gatling": dict(foot=17, spread=6, head=42),     # wide, squat iron bunker
    "flamer": dict(foot=15, spread=8, head=48),      # round boiler + chimney
    "venom": dict(foot=14, spread=8, head=54),       # stacked glass vats
    "harpoon": dict(foot=15, spread=12, head=46),    # timber winch + long gantry
}

SLOTS = ["lvl1", "lvl2", "spec-a", "spec-b", "spec-a2", "spec-b2", "spec-a3", "spec-b3"]

# Growth is carried by the shaft, not by the canvas: the wall gets taller and
# thicker, the machinery scales with it. Both lists are strictly increasing on
# the chains the art test walks (lvl1 → lvl2 → spec-a → spec-a2 → spec-a3 for
# height, lvl1 → lvl2 → spec-b → spec-b2 → spec-b3 for width).
SLOT_SCALE = {
    "lvl1": 0.84, "lvl2": 0.90, "spec-a": 0.96, "spec-b": 1.00,
    "spec-a2": 1.06, "spec-b2": 1.10, "spec-a3": 1.18, "spec-b3": 1.22,
}
SLOT_SHAFT = {
    "lvl1": 30, "lvl2": 34, "spec-a": 38, "spec-b": 34,
    "spec-a2": 44, "spec-b2": 38, "spec-a3": 50, "spec-b3": 42,
}

TIER = dict(zip(SLOTS, [0, 0, 1, 1, 2, 3, 2, 3]))


def geometry(line: str, slot: str) -> dict:
    """Canvas and ground-line geometry for one line at one tier.

    Derived, never hand-written, so a change to the proportions cannot leave the
    five lines with mismatched canvases. `mount` is the distance from the tile's
    ground line up to the deck the weapon pivots on.
    """
    prop = PROPORTIONS[line]
    scale = SLOT_SCALE[slot]
    foot = max(10, round(prop["foot"] * scale))
    shoulder = max(7, foot - 3)
    spread = max(4, round(prop["spread"] * scale))
    head = round(prop["head"] * scale)
    shaft = SLOT_SHAFT[slot]
    height = 15 + shaft + head
    width = 2 * (foot + spread) + 4
    return dict(
        w=width, h=height, cx=width // 2, ground=height - 1,
        top=height - 12 - shaft, foot=foot, shoulder=max(7, shoulder),
        spread=spread, head=head, shaft=shaft, mount=shaft + 11,
    )


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


# -------------------------------------------------------------------- masonry


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



# ------------------------------------------------------------------- structures


def masonry(image: Image.Image, cx: int, top: int, bottom: int, foot: int, shoulder: int,
            face=STONE_M) -> None:
    """The stone shaft. Every line stands on one — it is the family resemblance."""
    poly = [(cx - shoulder, top), (cx + shoulder, top), (cx + foot, bottom), (cx - foot, bottom)]
    image.alpha_composite(masked_stone(image.size, poly, face))
    draw = ImageDraw.Draw(image)
    draw.line((cx - shoulder, top, cx - foot, bottom), fill=STONE_D)
    draw.line((cx + shoulder, top, cx + foot, bottom), fill=STONE_D)


def plinth(draw: ImageDraw.ImageDraw, cx: int, bottom: int, foot: int) -> None:
    pw = foot + 6
    draw.rectangle((cx - pw, bottom, cx + pw, bottom + 7), fill=STONE_D)
    draw.rectangle((cx - pw + 1, bottom + 1, cx + pw - 1, bottom + 5), fill=STONE_M)
    draw.line((cx - pw + 2, bottom, cx + pw - 2, bottom), fill=STONE_L)
    for x in range(cx - pw + 3, cx + pw - 2, 6):
        draw.line((x, bottom + 2, x, bottom + 4), fill=dim(STONE_M))


def rivets(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int, step: int = 6,
           colour=None) -> None:
    colour = colour or dim(IRON_L, 0.9)
    for x in range(x0 + 2, x1 - 1, step):
        draw.point((x, y0 + 1), fill=colour)
        draw.point((x, y1 - 1), fill=colour)
    for y in range(y0 + 2, y1 - 1, step):
        draw.point((x0 + 1, y), fill=colour)
        draw.point((x1 - 1, y), fill=colour)


def gear(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, teeth: int = 8,
         face=BRASS_M, dark=BRASS_D) -> None:
    """A cog. The gatling line is clockwork; its wall is covered in them."""
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=dark)
    draw.ellipse((cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1), fill=face)
    for i in range(teeth):
        a = i * math.tau / teeth
        tx = cx + round((r + 1) * math.cos(a))
        ty = cy + round((r + 1) * math.sin(a))
        draw.point((tx, ty), fill=face)
    draw.ellipse((cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2), fill=dark)


def pipe(draw: ImageDraw.ImageDraw, points, width: int = 3, face=COPPER_M, edge=COPPER_D) -> None:
    draw.line(points, fill=edge, width=width + 2, joint="curve")
    draw.line(points, fill=face, width=width, joint="curve")


def bloom(image: Image.Image, cx: int, cy: int, radius: int, colour, alpha: int = 90) -> None:
    """A soft radial glow. Kept small and dim — no full-tile flashes."""
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    rgb = (colour[0], colour[1], colour[2])
    for step in range(radius, 0, -1):
        fade = int(alpha * (1 - step / (radius + 1)) ** 1.7)
        if fade > 0:
            gd.ellipse((cx - step, cy - step, cx + step, cy + step), fill=rgb + (fade,))
    image.alpha_composite(glow)


def window_grid(draw: ImageDraw.ImageDraw, left: int, right: int, top: int, bottom: int,
                tier: int) -> None:
    """Two columns of arrow-slits; the apex gets one lit great window."""
    for wy in range(top + 12, bottom - 20, 16):
        for wx in (left + 4, right - 7):
            draw.rectangle((wx, wy, wx + 3, wy + 6), fill=WINDOW)
            draw.point((wx + 1, wy + 2), fill=GLOW)
    if tier >= 3:
        cx = (left + right) // 2
        wy = top + 20
        draw.ellipse((cx - 5, wy, cx + 5, wy + 9), fill=(24, 28, 38, 255))
        draw.ellipse((cx - 4, wy + 1, cx + 4, wy + 8), fill=GLOW)


def doorway(draw: ImageDraw.ImageDraw, cx: int, bottom: int, width: int = 12) -> None:
    half = width // 2
    draw.rectangle((cx - half, bottom - 14, cx + half, bottom - 1), fill=WOOD_D)
    draw.arc((cx - half, bottom - 23, cx + half, bottom - 5), 180, 360, fill=WOOD_M)
    draw.line((cx, bottom - 13, cx, bottom - 2), fill=WOOD_M)
    draw.rectangle((cx - half - 1, bottom - 15, cx + half + 1, bottom - 14), fill=STONE_L)


def crown(draw: ImageDraw.ImageDraw, cx: int, shoulder: int, top: int, face=STONE_L) -> None:
    merlons(draw, cx - shoulder - 2, cx + shoulder + 2, top - 5, 4, face)
    draw.rectangle((cx - shoulder - 3, top - 7, cx + shoulder + 3, top - 5), fill=STONE_D)


# --------------------------------------------------------------------- crossbow
# Iron Crossbow: a tall, narrow arbalest tower. A great bow spans the crown with
# limbs reaching past the wall, a stock down the middle and winches on the deck.


CREAM = (238, 234, 216, 255)


def wall_bands(draw, cx, foot, shoulder, top, ground, colour=IRON_D, band=7):
    """Iron hoops around the shaft — the bunker and the boiler wear them."""
    for y in range(top + band, ground - 10, band + 4):
        half = shoulder + (foot - shoulder) * (y - top) // max(1, (ground - 10 - top))
        draw.line((cx - half, y, cx + half, y), fill=colour)


def streaks(draw, cx, foot, shoulder, top, ground, colour):
    """Weathering down the wall: this line's own mark on the stone."""
    for i in range(3):
        x = cx - foot + 3 + i * 5
        draw.line((x, top + 6 + i * 3, x, top + 14 + i * 4), fill=colour)


def build_crossbow(image, g, tier):
    cx, top, ground = g["cx"], g["top"], g["ground"]
    foot, shoulder, head = g["foot"], g["shoulder"], g["head"]
    draw = ImageDraw.Draw(image)
    bright = accent_of("crossbow", True)

    masonry(image, cx, top, ground - 7, foot, shoulder)
    draw = ImageDraw.Draw(image)
    crown(draw, cx, shoulder, top)

    # Tall narrow buttresses: the arbalest tower is the slender one.
    for side in (-1, 1):
        bx = cx + side * (foot - 1)
        draw.line((bx, top + 4, bx, ground - 8), fill=STONE_L)
        draw.line((bx + side, top + 4, bx + side, ground - 8), fill=STONE_D)

    # Timber firing deck.
    deck = shoulder + 3
    draw.rectangle((cx - deck, top - 4, cx + deck, top + 2), fill=WOOD_D)
    draw.rectangle((cx - deck + 1, top - 3, cx + deck - 1, top + 1), fill=WOOD_M)
    draw.line((cx - deck + 2, top - 2, cx + deck - 2, top - 2), fill=WOOD_L)

    # The prod: a thick bow across the full canvas width, tips drooping, string
    # pulled back into a deep V on the nut. This is the shape that has to read at
    # 64 px, so it is a filled band, not a hairline.
    bow_y = top - round(head * 0.20)
    span = g["w"] // 2 - 1
    draw.line((cx - span, bow_y + 1, cx + span, bow_y + 1), fill=STEEL_D, width=4)
    draw.line((cx - span, bow_y - 1, cx + span, bow_y - 1), fill=STEEL_M, width=3)
    draw.line((cx - span + 2, bow_y - 2, cx + span - 2, bow_y - 2), fill=STEEL_L)
    for side in (-1, 1):
        tx = cx + side * span
        draw.line((tx, bow_y - 2, tx, bow_y + 5), fill=BRASS_D, width=2)
        draw.point((tx, bow_y + 5), fill=BRASS_L)
    # Stock, from the deck up through the prod, with the nut at the catch point.
    draw.rectangle((cx - 2, bow_y - 3, cx + 2, top + 2), fill=WOOD_D)
    draw.rectangle((cx - 1, bow_y - 4, cx + 1, top + 2), fill=WOOD_M)
    draw.rectangle((cx - 3, bow_y + 5, cx + 3, bow_y + 8), fill=BRASS_D)
    draw.rectangle((cx - 2, bow_y + 5, cx + 2, bow_y + 7), fill=BRASS_M)
    draw.line((cx - span, bow_y + 4, cx - 2, bow_y + 7), fill=CREAM)
    draw.line((cx + span, bow_y + 4, cx + 2, bow_y + 7), fill=CREAM)
    # Loaded bolt: a short shaft with fletching, not a mast.
    tip = bow_y - round(head * 0.52)
    draw.rectangle((cx - 1, tip + 4, cx + 1, bow_y + 1), fill=WOOD_L)
    draw.polygon([(cx, tip), (cx + 2, tip + 4), (cx + 1, tip + 4), (cx, tip + 3),
                  (cx - 1, tip + 4), (cx - 2, tip + 4)], fill=STEEL_L)
    draw.line((cx - 1, bow_y, cx - 2, bow_y - 3), fill=CREAM)
    draw.line((cx + 1, bow_y, cx + 2, bow_y - 3), fill=CREAM)

    # Winch wheels on the deck; one for the arbalest, two for the battery.
    wheels = [(cx - shoulder + 1, top - 9)]
    if tier >= 2:
        wheels.append((cx + shoulder - 1, top - 9))
    for wx, wy in wheels:
        r = 4 if tier < 3 else 5
        draw.ellipse((wx - r, wy - r, wx + r, wy + r), fill=IRON_D)
        draw.ellipse((wx - r + 1, wy - r + 1, wx + r - 1, wy + r - 1), fill=BRASS_D)
        draw.ellipse((wx - 2, wy - 2, wx + 2, wy + 2), fill=BRASS_M)
        draw.line((wx - r + 1, wy, wx + r - 1, wy), fill=BRASS_L)

    # Bolt rack bolted to the wall — one bolt per tier.
    rack_y = top + 12
    draw.rectangle((cx - shoulder - 1, rack_y, cx - shoulder + 9, rack_y + 2), fill=IRON_D)
    for i in range(min(4, tier + 1)):
        bx = cx - shoulder + i * 3
        draw.line((bx, rack_y - 5, bx, rack_y + 1), fill=WOOD_L)
        draw.point((bx, rack_y - 6), fill=STEEL_L)

    window_grid(draw, cx - foot, cx + foot, top, ground - 8, tier)
    doorway(draw, cx, ground - 7, 9 + tier)

    if tier >= 3:
        # Counterweight and a second string plane: the siege arbalest.
        wy = top + 22
        draw.ellipse((cx + foot - 5, wy - 6, cx + foot + 5, wy + 6), fill=IRON_D)
        draw.ellipse((cx + foot - 4, wy - 5, cx + foot + 4, wy + 5), fill=IRON_M)
        draw.line((cx + foot - 3, wy - 3, cx + foot + 3, wy + 3), fill=STEEL_D)
        draw.line((cx - span + 1, bow_y + 10, cx + span - 1, bow_y + 10), fill=STEEL_D)
        bloom(image, cx, tip - 2, 6, BRASS_L, 55)


def build_gatling(image, g, tier):
    cx, top, ground = g["cx"], g["top"], g["ground"]
    foot, shoulder, head = g["foot"], g["shoulder"], g["head"]
    draw = ImageDraw.Draw(image)
    bright = accent_of("gatling", True)

    masonry(image, cx, top, ground - 7, foot, shoulder)
    draw = ImageDraw.Draw(image)
    # Iron hoops: the bunker is banded, the arbalest tower is not.
    wall_bands(draw, cx, foot, shoulder, top, ground - 7)

    # Flat armour plate instead of crenellations: the drum is the silhouette.
    draw.rectangle((cx - shoulder - 2, top - 5, cx + shoulder + 2, top + 1), fill=IRON_D)
    draw.rectangle((cx - shoulder - 1, top - 4, cx + shoulder + 1, top), fill=IRON_M)
    draw.line((cx - shoulder, top - 3, cx + shoulder, top - 3), fill=IRON_L)
    rivets(draw, cx - shoulder - 1, top - 4, cx + shoulder + 1, top, 6)

    # The drum: iron body, copper rings, brass hub. (The flamer's boiler is the
    # copper one, so the two must not be the same colour.)
    r = max(7, round(head * 0.29))
    dy = top - 3 - r
    draw.ellipse((cx - r, dy - r, cx + r, dy + r), fill=IRON_D)
    draw.ellipse((cx - r + 1, dy - r + 1, cx + r - 1, dy + r - 1), fill=COPPER_D)
    draw.ellipse((cx - r + 2, dy - r + 2, cx + r - 2, dy + r - 2), fill=STEEL_M)
    draw.arc((cx - r + 1, dy - r + 1, cx + r - 1, dy + r - 1), 195, 285, fill=STEEL_L)
    # Six barrel mouths in a ring: the Gatling signature.
    for i in range(6):
        a = i * math.tau / 6 + 0.35
        hx = cx + round(math.cos(a) * (r - 4))
        hy = dy + round(math.sin(a) * (r - 4))
        draw.ellipse((hx - 2, hy - 2, hx + 2, hy + 2), fill=IRON_D)
        draw.point((hx, hy + 1), fill=STEEL_L)
    draw.ellipse((cx - 3, dy - 3, cx + 3, dy + 3), fill=BRASS_D)
    draw.ellipse((cx - 2, dy - 2, cx + 2, dy + 2), fill=BRASS_M)

    # Smokestack, taller every tier — a chimney, not a mast.
    sx = cx + shoulder - 2
    sh = round(head * 0.66)
    draw.rectangle((sx - 2, top - sh, sx + 2, top - 3), fill=IRON_D)
    draw.rectangle((sx - 1, top - sh + 1, sx + 1, top - 3), fill=COPPER_D)
    draw.rectangle((sx - 3, top - sh - 2, sx + 3, top - sh), fill=IRON_D)
    draw.rectangle((sx - 2, top - sh - 1, sx + 2, top - sh), fill=EMBER_M)
    bloom(image, sx, top - sh - 3, 4 + tier, EMBER_L, 85)

    # Cogs in the wall — this is the clockwork line.
    gear(draw, cx - shoulder + 3, top + 9, 4, 7)
    if tier >= 1:
        gear(draw, cx - shoulder + 9, top + 16, 3, 6, COPPER_L, COPPER_D)
    if tier >= 2:
        gear(draw, cx + shoulder - 5, top + 12, 5, 8, BRASS_L, BRASS_D)

    # Ammunition belt running from the hopper into the drum.
    draw.rectangle((cx - 5, top + 1, cx + 5, top + 7), fill=IRON_D)
    draw.rectangle((cx - 4, top + 2, cx + 4, top + 6), fill=COPPER_M)
    for i in range(min(4, tier + 2)):
        draw.rectangle((cx - 5 + i * 3, top + 3, cx - 4 + i * 3, top + 5), fill=BRASS_L)
    draw.line((cx - 4, top + 1, cx - 4, dy + r - 3), fill=BRASS_D)

    window_grid(draw, cx - foot, cx + foot, top + 4, ground - 8, tier)
    doorway(draw, cx, ground - 7, 11 + tier)

    if tier >= 3:
        # A second drum on the flank: the bullet-tempest tier.
        ex = cx - shoulder - 2
        ey = top + 24
        draw.ellipse((ex - 6, ey - 6, ex + 6, ey + 6), fill=IRON_D)
        draw.ellipse((ex - 5, ey - 5, ex + 5, ey + 5), fill=IRON_M)
        draw.ellipse((ex - 2, ey - 2, ex + 2, ey + 2), fill=BRASS_L)
        bloom(image, cx, dy, r + 4, bright, 40)


def build_flamer(image, g, tier):
    cx, top, ground = g["cx"], g["top"], g["ground"]
    foot, shoulder, head = g["foot"], g["shoulder"], g["head"]
    draw = ImageDraw.Draw(image)
    bright = accent_of("flamer", True)

    masonry(image, cx, top, ground - 7, foot, shoulder)
    draw = ImageDraw.Draw(image)
    streaks(draw, cx, foot, shoulder, top, ground, dim(COPPER_D, 0.55))

    # The boiler: a domed copper tank with a riveted belly. Round on top, unlike
    # the bunker's flat plate, so the silhouette alone tells them apart.
    half = min(g["w"] // 2 - 4, shoulder + 1)
    tank_h = round(head * 0.62)
    bottom = top + 1
    ty = bottom - tank_h
    draw.rounded_rectangle((cx - half, ty + 3, cx + half, bottom), radius=3, fill=IRON_D)
    draw.rounded_rectangle((cx - half + 1, ty + 4, cx + half - 1, bottom - 1), radius=3, fill=COPPER_D)
    draw.ellipse((cx - half, ty, cx + half, ty + 8), fill=IRON_D)
    draw.ellipse((cx - half + 1, ty + 1, cx + half - 1, ty + 7), fill=COPPER_M)
    draw.rounded_rectangle((cx - half + 2, ty + 4, cx + half - 2, bottom - 2), radius=3, fill=COPPER_M)
    draw.line((cx - half + 3, ty + 6, cx - half + 3, bottom - 4), fill=COPPER_L)
    draw.line((cx + half - 3, ty + 6, cx + half - 3, bottom - 4), fill=dim(COPPER_D, 0.9))
    rivets(draw, cx - half + 2, ty + 5, cx + half - 2, bottom - 2, 5, COPPER_L)
    for by in (ty + tank_h // 3, ty + (tank_h * 2) // 3):
        draw.line((cx - half + 1, by, cx + half - 1, by), fill=IRON_D)
        draw.line((cx - half + 1, by + 1, cx + half - 1, by + 1), fill=dim(EMBER_L, 0.7))

    # Chimney with a lit fire mouth.
    chx = cx + half - 2
    ch_h = round(head * 0.24)
    draw.rectangle((chx - 2, ty - ch_h, chx + 2, ty + 3), fill=IRON_D)
    draw.rectangle((chx - 1, ty - ch_h + 1, chx + 1, ty + 2), fill=COPPER_D)
    draw.rectangle((chx - 3, ty - ch_h - 2, chx + 3, ty - ch_h), fill=IRON_D)
    draw.rectangle((chx - 2, ty - ch_h - 1, chx + 2, ty - ch_h), fill=EMBER_M)
    bloom(image, chx, ty - ch_h - 4, 5 + tier, EMBER_L, 95)

    # Lit firebox door: the grate is what says "this one burns".
    fby = bottom - max(7, tank_h // 3)
    draw.rectangle((cx - 5, fby, cx + 5, bottom - 2), fill=IRON_D)
    draw.rectangle((cx - 4, fby + 1, cx + 4, bottom - 3), fill=EMBER_D)
    for gx in range(cx - 3, cx + 4, 2):
        draw.line((gx, fby + 2, gx, bottom - 4), fill=EMBER_L)
    bloom(image, cx, (fby + bottom) // 2, 7, EMBER_L, 75)

    # Pipes: boiler → wall → plinth.
    pipe(draw, [(cx - half + 1, bottom - 4), (cx - shoulder - 2, bottom - 4),
                (cx - shoulder - 2, ground - 14)], 2)
    if tier >= 1:
        pipe(draw, [(cx + half - 1, bottom - 7), (cx + shoulder + 2, bottom - 7),
                    (cx + shoulder + 2, ground - 18)], 2, COPPER_D, IRON_D)

    window_grid(draw, cx - foot, cx + foot, top + 3, ground - 8, tier)
    doorway(draw, cx, ground - 7, 10 + tier)

    if tier >= 2:
        # Bellows bolted to the flank.
        bx = cx - shoulder - 5
        draw.polygon([(bx, top + 15), (bx + 6, top + 12), (bx + 6, top + 24), (bx, top + 21)],
                     fill=WOOD_D)
        draw.polygon([(bx + 1, top + 16), (bx + 5, top + 14), (bx + 5, top + 22), (bx + 1, top + 20)],
                     fill=WOOD_M)
    if tier >= 3:
        # A second pressure tank: two vessels is what says "siphon battery".
        px = cx - half - 3
        py = bottom - 12
        draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=IRON_D)
        draw.ellipse((px - 4, py - 4, px + 4, py + 4), fill=COPPER_M)
        draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=EMBER_L)
        bloom(image, px, py, 6, EMBER_L, 60)


def build_venom(image, g, tier):
    cx, top, ground = g["cx"], g["top"], g["ground"]
    foot, shoulder, head = g["foot"], g["shoulder"], g["head"]
    draw = ImageDraw.Draw(image)
    bright = accent_of("venom", True)

    masonry(image, cx, top, ground - 7, foot, shoulder)
    draw = ImageDraw.Draw(image)
    streaks(draw, cx, foot, shoulder, top, ground, dim(TOX_D, 0.85))

    # Copper stand on the crown.
    stand = top - 2
    draw.rectangle((cx - shoulder, stand, cx + shoulder, stand + 2), fill=COPPER_D)
    draw.line((cx - shoulder + 1, stand, cx + shoulder - 1, stand), fill=COPPER_M)
    for lx in (cx - shoulder + 1, cx + shoulder - 1):
        draw.line((lx, stand + 2, lx, top + 4), fill=COPPER_D)

    # The great glass flask: a narrow copper neck over a round glass belly, with
    # the distillate filling the bottom half. A still, not a green dome.
    r = max(6, round(head * 0.25))
    vy = stand - 2 - r
    # Copper tripod legs from the belly down to the stand.
    for lx in (cx - r + 2, cx + r - 2):
        draw.line((lx, vy + r - 2, lx + (2 if lx > cx else -2), stand), fill=COPPER_D)
    # Neck and cork, drawn first so the belly laps over their base.
    draw.rectangle((cx - 2, vy - r - 6, cx + 2, vy - r + 3), fill=IRON_D)
    draw.rectangle((cx - 1, vy - r - 5, cx + 1, vy - r + 3), fill=COPPER_M)
    draw.rectangle((cx - 3, vy - r - 8, cx + 3, vy - r - 5), fill=WOOD_D)
    draw.rectangle((cx - 2, vy - r - 8, cx + 2, vy - r - 6), fill=WOOD_M)
    # Glass belly: dark glass above the fill line, bright distillate below.
    draw.ellipse((cx - r, vy - r, cx + r, vy + r), fill=IRON_D)
    draw.ellipse((cx - r + 1, vy - r + 1, cx + r - 1, vy + r - 1), fill=dim(TOX_D, 0.55))
    liquid = vy - round(r * 0.15)
    draw.ellipse((cx - r + 2, liquid, cx + r - 2, vy + r - 2), fill=TOX_M)
    draw.line((cx - r + 3, liquid, cx + r - 3, liquid), fill=TOX_L)
    draw.arc((cx - r + 2, vy - r + 2, cx + r - 2, vy + r - 2), 200, 280, fill=(226, 255, 236, 190))
    # Bubbles rising through the distillate.
    for i in range(2 + tier):
        bx = cx - r + 3 + (i * 5) % max(3, r * 2 - 6)
        draw.point((bx, liquid + 3 + (i * 3) % max(2, r - 2)), fill=TOX_L)
    bloom(image, cx, liquid + 2, r + 2, TOX_L, 40)

    # Condenser coil on the right: one extra turn per tier.
    coil_x = cx + shoulder - 1
    for i in range(2 + tier):
        cy = stand - 5 - i * 4
        draw.arc((coil_x - 5, cy, coil_x + 5, cy + 5), 0, 180, fill=COPPER_M)

    # Drip pipe into a catch basin on the left.
    drip_x = cx - shoulder - 2
    draw.line((drip_x, stand - 9, drip_x, stand + 2), fill=COPPER_D, width=2)
    draw.line((drip_x + 1, stand - 9, drip_x + 1, stand + 2), fill=COPPER_M)
    draw.rectangle((drip_x - 3, stand + 2, drip_x + 3, stand + 5), fill=IRON_D)
    draw.rectangle((drip_x - 2, stand + 3, drip_x + 2, stand + 4), fill=TOX_M)

    window_grid(draw, cx - foot, cx + foot, top + 2, ground - 8, tier)
    doorway(draw, cx, ground - 7, 10 + tier)

    if tier >= 2:
        # A second flask: two vessels is what says "refinery".
        sx = cx - shoulder + 1
        sy = top + 9
        draw.ellipse((sx - 5, sy - 5, sx + 5, sy + 5), fill=IRON_D)
        draw.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), fill=dim(TOX_D, 0.9))
        draw.ellipse((sx - 4, sy - 1, sx + 4, sy + 3), fill=TOX_M)
        draw.point((sx - 1, sy + 1), fill=TOX_L)
    if tier >= 3:
        # Alchemical sigil hovering over the vat.
        sy = vy - r - 10
        draw.ellipse((cx - 6, sy - 4, cx + 6, sy + 4), outline=bright)
        draw.line((cx - 3, sy, cx + 3, sy), fill=TOX_L)
        bloom(image, cx, sy, 8, TOX_L, 55)


def build_harpoon(image, g, tier):
    cx, top, ground = g["cx"], g["top"], g["ground"]
    foot, shoulder, head = g["foot"], g["shoulder"], g["head"]
    draw = ImageDraw.Draw(image)
    bright = accent_of("harpoon", True)

    masonry(image, cx, top, ground - 7, foot, shoulder)
    draw = ImageDraw.Draw(image)
    # Timber props leaning against the wall: the dockyard look.
    for side in (-1, 1):
        px = cx + side * (foot - 2)
        draw.line((px, top + 8, px + side * 2, ground - 9), fill=WOOD_M, width=2)

    # Timber marquee: a frame standing on the stone, not a wall.
    frame = top - 3
    draw.rectangle((cx - shoulder - 1, frame, cx + shoulder + 1, frame + 4), fill=WOOD_D)
    draw.rectangle((cx - shoulder, frame + 1, cx + shoulder, frame + 3), fill=WOOD_M)
    draw.line((cx - shoulder + 1, frame + 1, cx + shoulder - 1, frame + 1), fill=WOOD_L)
    for side in (-1, 1):
        px = cx + side * (shoulder - 1)
        draw.rectangle((px - 1, frame + 3, px + 1, top + 8), fill=WOOD_D)
        draw.point((px, frame + 5), fill=WOOD_L)

    # Crane, not antenna: a king post with a horizontal jib and a diagonal stay.
    gx1 = min(g["w"] // 2 - 2, cx + shoulder + round(head * 0.40))
    post = frame - round(head * 0.52)
    draw.rectangle((cx - 2, post, cx + 2, frame), fill=WOOD_D)
    draw.rectangle((cx - 1, post + 1, cx + 1, frame), fill=WOOD_M)
    draw.line((cx - 3, post, cx + 3, post), fill=WOOD_L)
    draw.line((cx - 2, post + 1, gx1, post + 1), fill=WOOD_D, width=4)
    draw.line((cx - 2, post, gx1, post), fill=WOOD_M, width=2)
    draw.line((cx - 4, post + 4, gx1 - 4, post + 4), fill=WOOD_D)
    # Diagonal stay back down to the roof.
    draw.line((cx + 1, post + 3, cx + shoulder, frame - 1), fill=WOOD_D, width=2)
    draw.line((cx + 1, post + 2, cx + shoulder, frame - 2), fill=WOOD_M)
    # Counterweight at the short end of the jib.
    draw.rectangle((cx - 6, post + 3, cx - 2, post + 8), fill=IRON_D)
    draw.point((cx - 4, post + 5), fill=IRON_L)
    # Pulley and a hanging hook.
    draw.ellipse((gx1 - 4, post - 1, gx1 + 2, post + 5), fill=IRON_D)
    draw.ellipse((gx1 - 3, post, gx1 + 1, post + 4), fill=BRASS_M)
    draw.point((gx1 - 1, post + 2), fill=BRASS_L)
    rope = round(head * 0.26) + tier * 2
    draw.line((gx1 - 1, post + 4, gx1 - 1, post + 4 + rope), fill=ROPE)
    hay = post + 4 + rope
    draw.arc((gx1 - 4, hay, gx1 + 2, hay + 6), 0, 170, fill=STEEL_L, width=1)
    draw.line((gx1 - 3, hay + 4, gx1 - 3, hay + 1), fill=STEEL_M)

    # Rope reel — the anchor of the silhouette.
    ry = top + 12
    rr = 5 + min(tier, 3)
    draw.ellipse((cx - rr, ry - rr, cx + rr, ry + rr), fill=IRON_D)
    draw.ellipse((cx - rr + 1, ry - rr + 1, cx + rr - 1, ry + rr - 1), fill=WOOD_D)
    draw.ellipse((cx - rr + 2, ry - rr + 2, cx + rr - 2, ry + rr - 2), fill=ROPE)
    for i in range(2):
        yy = ry - 1 + i * 2
        draw.line((cx - rr + 2, yy, cx + rr - 2, yy), fill=dim(ROPE, 0.8))
    draw.ellipse((cx - 1, ry - 1, cx + 1, ry + 1), fill=IRON_M)
    if tier >= 2:
        ry2 = ry + 2 * rr + 2
        draw.ellipse((cx - 3, ry2 - 3, cx + 3, ry2 + 3), fill=IRON_D)
        draw.ellipse((cx - 2, ry2 - 2, cx + 2, ry2 + 2), fill=ROPE)

    # Harpoon rack on the right wall.
    for i in range(min(4, tier + 1)):
        hx = cx + shoulder - 2 - i * 3
        hy = top + 8 + i
        draw.line((hx, hy, hx + 1, hy + 10), fill=WOOD_M)
        draw.polygon([(hx, hy - 3), (hx + 2, hy), (hx - 2, hy)], fill=STEEL_L)

    # Water barrel at the foot on the left.
    bx = cx - foot - 2
    draw.rectangle((bx - 3, ground - 15, bx + 3, ground - 8), fill=WOOD_D)
    draw.rectangle((bx - 2, ground - 14, bx + 2, ground - 9), fill=WOOD_M)
    draw.line((bx - 2, ground - 12, bx + 2, ground - 12), fill=IRON_M)

    window_grid(draw, cx - foot, cx + foot, top + 2, ground - 8, tier)
    doorway(draw, cx, ground - 7, 9 + tier)

    if tier >= 3:
        # Harbour lantern hanging from the gantry.
        lx, ly = gx1 - 7, post + 6
        draw.line((lx, ly, lx, ly + 4), fill=IRON_D)
        draw.rectangle((lx - 3, ly + 4, lx + 3, ly + 10), fill=IRON_D)
        draw.rectangle((lx - 2, ly + 5, lx + 2, ly + 9), fill=bright)
        bloom(image, lx, ly + 7, 8, (255, 226, 150), 80)


BUILDERS = {
    "crossbow": build_crossbow,
    "gatling": build_gatling,
    "flamer": build_flamer,
    "venom": build_venom,
    "harpoon": build_harpoon,
}


def draw_base(line: str, slot: str):
    """Draw one line at one tier. Returns (image, mount)."""
    g = geometry(line, slot)
    tier = TIER[slot]
    image = blank(g["w"], g["h"])
    BUILDERS[line](image, g, tier)

    draw = ImageDraw.Draw(image)
    plinth(draw, g["cx"], g["ground"] - 7, g["foot"])

    # Apex tiers leave a faint ring of their accent on the ground: the same
    # visual language as the Spire keeps' level-5 aura, at a fraction of the
    # brightness so a board full of them does not strobe.
    if tier >= 3:
        accent = accent_of(line, True)
        rgb = (accent[0], accent[1], accent[2])
        for step in range(2):
            rr = g["foot"] + 4 + step * 3
            image_draw = ImageDraw.Draw(image)
            image_draw.ellipse((g["cx"] - rr, g["ground"] - 4, g["cx"] + rr, g["ground"] + 1),
                               outline=rgb + (70 - step * 30,))
    return image, g["mount"]


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
    "lvl1": 0.52, "lvl2": 0.55, "spec-a": 0.58, "spec-b": 0.58,
    "spec-a2": 0.62, "spec-b2": 0.62, "spec-a3": 0.68, "spec-b3": 0.68,
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


def make_card(line: str) -> Image.Image:
    """A 64×64 dock icon that is *the line's crown*, zoomed.

    The old card shrank the whole tower into the tile, so five different
    buildings became five grey slivers — and because they were all one keep, the
    icons were identical. The dock tile only has 64 px to say "this is the
    harpoon winch, not the boiler", so it shows the signature and fills the
    frame with it: the prod, the drum, the chimney, the flask, the crane.
    """
    slot = "spec-a"
    g = geometry(line, slot)
    art = Image.open(os.path.join(TOWERS, f"base_{line}-spec-a.png")).convert("RGBA")

    # Band around the crown: the machinery plus the top of the wall under it.
    y0 = max(0, g["top"] - g["head"] - 2)
    y1 = min(art.height, g["top"] + round(g["shaft"] * 0.62))
    band = art.crop((0, y0, art.width, y1))
    inner = band.crop(band.getbbox() or (0, 0, band.width, band.height))

    ratio = min(60 / inner.width, 56 / inner.height)
    size = (max(1, round(inner.width * ratio)), max(1, round(inner.height * ratio)))
    inner = inner.resize(size, Image.NEAREST)

    icon = blank(64, 64)
    shade = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse((32 - inner.width // 2, 57, 32 + inner.width // 2, 62),
                                  fill=(0, 0, 0, 70))
    icon.alpha_composite(shade)
    icon.alpha_composite(inner, ((64 - inner.width) // 2, 58 - inner.height))
    return icon


def check_growth(records) -> None:
    """Fail the build if a proportion change breaks the tier-growth contract.

    `tests/engineer-defenses.test.js` asserts every tier chain gets strictly
    taller / wider; catching it here means the art never ships out of contract.
    """
    by_line = {}
    for rec in records:
        by_line.setdefault(rec["line"], {})[rec["slot"]] = rec
    for line, slots in by_line.items():
        for chain, key in ((["lvl1", "lvl2", "spec-a", "spec-a2", "spec-a3"], "height"),
                           (["lvl1", "lvl2", "spec-b", "spec-b2", "spec-b3"], "width")):
            sizes = [slots[slot][key] for slot in chain]
            if any(b <= a for a, b in zip(sizes, sizes[1:])):
                raise SystemExit(f"{line}: {key} does not grow along {chain}: {sizes}")


def main() -> int:
    os.makedirs(TOWERS, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)

    records = []
    for line in LINES:
        for slot in SLOTS:
            suffix = "" if slot == "lvl1" else f"-{slot}"
            base_name = f"base_{line}{suffix}.png"
            weapon_name = f"weapon_{line}{suffix}.png"
            base, mount = draw_base(line, slot)
            weapon = draw_weapon(line, slot)
            save(base, TOWERS, base_name)
            save(weapon, TOWERS, weapon_name)
            records.append(
                dict(line=line, slot=slot, base=base_name, weapon=weapon_name,
                     fw=WEAPON_FRAME, fh=WEAPON_FRAME, frames=FRAMES,
                     px=PIVOT[0], py=PIVOT[1], mount=mount,
                     muzzleY=-round(TIP[line] * ART_SCALE[slot]),
                     height=base.height, width=base.width)
            )

        save(make_card(line), ICONS, f"card_{line}.png")

    check_growth(records)
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
