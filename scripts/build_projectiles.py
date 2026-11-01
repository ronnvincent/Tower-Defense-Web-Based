#!/usr/bin/env python3
"""Build the tier-4 / tier-5 projectile art.

Each defence line already fires a different *behaviour*; this script makes sure
it also fires a visibly different *thing*, and that the thing changes again when
the tower reaches level 4 and level 5. A level-5 Frost Spire should not still be
spitting the same ice shard it fired at level 1.

All sprites point UP (taller than wide) so `Projectile.isPointingUp()` rotates
them into the flight direction; round shells are drawn square and spin instead.

    python3 scripts/build_projectiles.py

Requires Pillow. Writes `public/assets/projectiles/*.png` and the generated
lookup table `src/data/projectileArt.js`.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "projectiles")
MANIFEST = os.path.join(ROOT, "src", "data", "projectileArt.js")

# --- palette ---------------------------------------------------------------

STEEL_DARK = (74, 84, 104, 255)
STEEL = (168, 180, 198, 255)
STEEL_LIGHT = (232, 240, 250, 255)
WOOD_DARK = (92, 62, 38, 255)
WOOD = (152, 110, 66, 255)
GOLD_DARK = (140, 96, 28, 255)
GOLD = (226, 180, 78, 255)
GOLD_LIGHT = (255, 226, 150, 255)
IRON_DARK = (44, 46, 58, 255)
IRON = (86, 92, 110, 255)
IRON_LIGHT = (140, 148, 168, 255)
EMBER_DARK = (176, 62, 24, 255)
EMBER = (244, 122, 44, 255)
EMBER_LIGHT = (255, 196, 104, 255)
ICE_DEEP = (56, 132, 190, 255)
ICE = (128, 206, 240, 255)
ICE_LIGHT = (226, 248, 255, 255)
VOID_DARK = (44, 30, 74, 255)
VOID = (96, 72, 148, 255)
RUNE = (186, 150, 255, 255)
RUNE_LIGHT = (238, 228, 255, 255)
CREAM = (255, 240, 200, 255)


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(image: Image.Image, key: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    image.save(os.path.join(OUT, f"{key}.png"), optimize=True)


# --- archer: bolts ---------------------------------------------------------


def archer_4() -> Image.Image:
    """Twin barbed lance — two shafts, wider than the level-1 bolt."""
    image = blank(16, 54)
    draw = ImageDraw.Draw(image)
    for x, tip in ((4, 0), (10, 6)):
        draw.line([(x, 2), (x, 50)], fill=WOOD_DARK, width=2)
        draw.line([(x - 1, 4), (x - 1, 46)], fill=WOOD, width=1)
        draw.polygon([(x - 3, tip + 10), (x, tip), (x + 3, tip + 10)], fill=STEEL)
        draw.polygon([(x, tip), (x + 1, tip + 9), (x + 3, tip + 10)], fill=STEEL_LIGHT)
        draw.polygon([(x - 2, 12), (x, 8), (x + 2, 12), (x, 16)], fill=GOLD)
    draw.line([(3, 44), (13, 44)], fill=GOLD_DARK, width=1)
    return image


def archer_5() -> Image.Image:
    """Spirit javelin — a single heavy shaft with a glowing diamond head."""
    image = blank(20, 62)
    draw = ImageDraw.Draw(image)
    draw.line([(10, 8), (10, 58)], fill=WOOD_DARK, width=3)
    draw.line([(9, 10), (9, 54)], fill=WOOD, width=1)
    draw.polygon([(10, 0), (16, 11), (10, 20), (4, 11)], fill=STEEL)
    draw.polygon([(10, 2), (13, 11), (10, 17)], fill=STEEL_LIGHT)
    draw.polygon([(10, 8), (14, 13), (10, 18), (6, 13)], fill=GOLD_LIGHT)
    draw.polygon([(4, 22), (9, 16), (9, 30)], fill=GOLD)
    draw.polygon([(16, 22), (11, 16), (11, 30)], fill=GOLD_DARK)
    draw.line([(6, 46), (14, 46)], fill=GOLD, width=1)
    return image


# --- cannon: shells --------------------------------------------------------


def cannon_4() -> Image.Image:
    """Iron bomb with a lit fuse — reads as a heavier round than the sling stone."""
    image = blank(24, 26)
    draw = ImageDraw.Draw(image)
    draw.ellipse((2, 4, 21, 23), fill=IRON_DARK)
    draw.ellipse((3, 5, 20, 21), fill=IRON)
    draw.ellipse((6, 7, 15, 14), fill=IRON_LIGHT)
    for x, y in ((7, 18), (13, 19), (17, 14)):
        draw.rectangle((x, y, x + 1, y + 1), fill=IRON_DARK)
    draw.rectangle((11, 0, 12, 5), fill=(120, 90, 54, 255))
    draw.rectangle((12, 0, 13, 3), fill=EMBER)
    return image


def cannon_5() -> Image.Image:
    """Rune-bound mortar shell — iron core, burning seams, trailing ring."""
    image = blank(28, 30)
    draw = ImageDraw.Draw(image)
    draw.ellipse((1, 5, 26, 28), fill=IRON_DARK)
    draw.ellipse((2, 6, 25, 26), fill=IRON)
    draw.arc((4, 8, 23, 24), start=30, end=330, fill=EMBER, width=1)
    draw.arc((4, 8, 23, 24), start=150, end=250, fill=EMBER_LIGHT, width=1)
    draw.line([(14, 6), (14, 25)], fill=EMBER_DARK, width=1)
    draw.line([(3, 16), (25, 16)], fill=EMBER_DARK, width=1)
    draw.ellipse((10, 1, 18, 8), fill=GOLD)
    draw.ellipse((12, 3, 16, 6), fill=GOLD_LIGHT)
    return image


# --- frost: shards ---------------------------------------------------------


def frost_4() -> Image.Image:
    """Glacier lance — a long single icicle with a lit core."""
    image = blank(20, 50)
    draw = ImageDraw.Draw(image)
    draw.polygon([(10, 0), (18, 24), (14, 48), (6, 48), (2, 24)], fill=ICE_DEEP)
    draw.polygon([(10, 2), (16, 25), (12, 46), (8, 46), (4, 25)], fill=ICE)
    draw.polygon([(10, 4), (13, 25), (10, 44), (8, 25)], fill=ICE_LIGHT)
    draw.line([(3, 26), (6, 40)], fill=ICE_LIGHT, width=1)
    return image


def frost_5() -> Image.Image:
    """Blizzard crown shard — three prongs, clearly a bigger spell."""
    image = blank(26, 56)
    draw = ImageDraw.Draw(image)
    draw.polygon([(13, 0), (19, 22), (13, 54), (7, 22)], fill=ICE_DEEP)
    draw.polygon([(13, 3), (17, 22), (13, 50), (9, 22)], fill=ICE)
    draw.polygon([(4, 12), (12, 26), (7, 40), (0, 26)], fill=ICE_DEEP)
    draw.polygon([(6, 15), (11, 26), (7, 36), (3, 26)], fill=ICE)
    draw.polygon([(22, 12), (26, 26), (19, 40), (14, 26)], fill=ICE_DEEP)
    draw.polygon([(20, 15), (23, 26), (19, 36), (15, 26)], fill=ICE)
    draw.polygon([(13, 6), (15, 22), (13, 46), (11, 22)], fill=ICE_LIGHT)
    return image


# --- forge: hammers --------------------------------------------------------


def forge_4() -> Image.Image:
    """Molten warhammer — a blocky head on a single haft, ember cracks inside."""
    image = blank(32, 36)
    draw = ImageDraw.Draw(image)
    draw.rectangle((14, 20, 17, 34), fill=WOOD_DARK)
    draw.rectangle((15, 22, 16, 32), fill=WOOD)
    draw.rectangle((2, 4, 29, 20), fill=IRON_DARK)
    draw.rectangle((3, 5, 28, 18), fill=IRON)
    draw.rectangle((3, 5, 28, 8), fill=IRON_LIGHT)
    draw.rectangle((13, 6, 18, 17), fill=EMBER_DARK)
    draw.rectangle((14, 7, 17, 15), fill=EMBER)
    draw.rectangle((15, 8, 16, 13), fill=EMBER_LIGHT)
    return image


def forge_5() -> Image.Image:
    """Volcanic maul — a wide head on a heavy haft with a burning core."""
    image = blank(38, 40)
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 22, 21, 38), fill=WOOD_DARK)
    draw.rectangle((17, 24, 20, 36), fill=WOOD)
    draw.rectangle((15, 22, 22, 24), fill=GOLD_DARK)
    draw.rectangle((0, 3, 37, 22), fill=IRON_DARK)
    draw.rectangle((1, 4, 36, 20), fill=IRON)
    draw.rectangle((1, 4, 36, 7), fill=IRON_LIGHT)
    draw.ellipse((13, 7, 24, 18), fill=EMBER_DARK)
    draw.ellipse((14, 8, 23, 17), fill=EMBER)
    draw.ellipse((16, 10, 21, 15), fill=EMBER_LIGHT)
    for x in (5, 9, 28, 32):
        draw.rectangle((x, 10, x + 1, 15), fill=EMBER)
    draw.polygon([(19, 0), (24, 5), (19, 9), (14, 5)], fill=GOLD)
    return image


# --- runes: sigils ---------------------------------------------------------


def runes_4() -> Image.Image:
    """Greater sigil orb — a sphere with an orbiting ring."""
    image = blank(28, 28)
    draw = ImageDraw.Draw(image)
    draw.ellipse((4, 4, 23, 23), fill=VOID_DARK)
    draw.ellipse((5, 5, 22, 22), fill=VOID)
    draw.ellipse((8, 8, 19, 19), fill=RUNE)
    draw.ellipse((11, 11, 16, 16), fill=RUNE_LIGHT)
    draw.arc((0, 9, 27, 20), start=200, end=340, fill=RUNE_LIGHT, width=1)
    draw.arc((3, 1, 24, 26), start=20, end=160, fill=VOID, width=1)
    return image


def runes_5() -> Image.Image:
    """Void sigil — a big dark-shouldered diamond around a burning core."""
    image = blank(34, 34)
    draw = ImageDraw.Draw(image)
    draw.polygon([(17, 1), (32, 17), (17, 33), (2, 17)], fill=VOID_DARK)
    draw.polygon([(17, 4), (29, 17), (17, 30), (5, 17)], fill=VOID)
    draw.polygon([(17, 7), (26, 17), (17, 27), (8, 17)], fill=(24, 14, 44, 255))
    draw.polygon([(17, 10), (22, 17), (17, 23), (12, 17)], fill=RUNE)
    draw.polygon([(17, 12), (20, 17), (17, 21), (14, 17)], fill=RUNE_LIGHT)
    draw.line([(17, 1), (17, 6)], fill=RUNE_LIGHT, width=1)
    draw.line([(17, 28), (17, 33)], fill=RUNE_LIGHT, width=1)
    draw.line([(1, 17), (5, 17)], fill=RUNE_LIGHT, width=1)
    draw.line([(29, 17), (33, 17)], fill=RUNE_LIGHT, width=1)
    return image


# --- banner: golden bolts --------------------------------------------------


def banner_base() -> Image.Image:
    """Winged standard bolt — banner keeps fire their own golden dart."""
    image = blank(18, 48)
    draw = ImageDraw.Draw(image)
    draw.line([(9, 6), (9, 44)], fill=WOOD_DARK, width=2)
    draw.line([(8, 8), (8, 40)], fill=GOLD, width=1)
    draw.polygon([(9, 0), (14, 10), (9, 16), (4, 10)], fill=GOLD)
    draw.polygon([(9, 2), (11, 10), (9, 13)], fill=GOLD_LIGHT)
    draw.polygon([(0, 14), (8, 18), (8, 26)], fill=CREAM)
    draw.polygon([(18, 14), (10, 18), (10, 26)], fill=CREAM)
    draw.polygon([(2, 18), (8, 21), (8, 25)], fill=GOLD)
    draw.polygon([(16, 18), (10, 21), (10, 25)], fill=GOLD)
    return image


def banner_4() -> Image.Image:
    """Double standard — two gold shafts lashed together."""
    image = blank(24, 52)
    draw = ImageDraw.Draw(image)
    for x in (7, 16):
        draw.line([(x, 8), (x, 50)], fill=WOOD_DARK, width=2)
        draw.line([(x - 1, 10), (x - 1, 44)], fill=GOLD, width=1)
        draw.polygon([(x, 2), (x + 4, 11), (x, 16), (x - 4, 11)], fill=GOLD)
        draw.polygon([(x, 4), (x + 2, 11), (x, 14)], fill=GOLD_LIGHT)
    draw.rectangle((6, 24, 17, 26), fill=GOLD_DARK)
    draw.rectangle((6, 24, 17, 24), fill=GOLD)
    return image


def banner_5() -> Image.Image:
    """Royal lance — a broad pennant wrapped around a heavy shaft."""
    image = blank(30, 58)
    draw = ImageDraw.Draw(image)
    draw.line([(15, 10), (15, 56)], fill=WOOD_DARK, width=3)
    draw.line([(14, 12), (14, 50)], fill=GOLD, width=1)
    draw.polygon([(15, 0), (22, 12), (15, 22), (8, 12)], fill=GOLD)
    draw.polygon([(15, 2), (19, 12), (15, 19)], fill=GOLD_LIGHT)
    draw.polygon([(0, 18), (14, 24), (14, 38), (0, 44)], fill=CREAM)
    draw.polygon([(30, 18), (16, 24), (16, 38), (30, 44)], fill=CREAM)
    draw.polygon([(3, 22), (14, 26), (14, 36), (3, 40)], fill=GOLD)
    draw.polygon([(27, 22), (16, 26), (16, 36), (27, 40)], fill=GOLD)
    draw.ellipse((12, 26, 18, 32), fill=GOLD_LIGHT)
    return image


# --- engineer lines: tier 4 / 5 -------------------------------------------
#
# The five engineer defences shipped with their own level-1 shot but kept it all
# the way to level 5, so the last two upgrades of the line were invisible in
# flight while the base lines swapped art. Each pair below continues the line's
# own material: steel and brass for the crossbow, brass casings for the
# repeater, burning pitch for the siphon, glass and distillate for the still,
# and a roped harpoon for the winch.

TOXIN_DARK = (34, 84, 44, 255)
TOXIN = (110, 200, 92, 255)
TOXIN_LIGHT = (186, 250, 150, 255)
COPPER = (206, 118, 56, 255)
COPPER_LIGHT = (248, 172, 104, 255)
TEAL = (72, 170, 184, 255)
TEAL_LIGHT = (160, 232, 236, 255)


def crossbow_4() -> Image.Image:
    """Barbed quarrel: a heavier bolt with swept barbs and a brass nock."""
    image = blank(20, 46)
    draw = ImageDraw.Draw(image)
    draw.line([(10, 6), (10, 36)], fill=WOOD_DARK, width=3)
    draw.line([(9, 8), (9, 34)], fill=WOOD, width=1)
    draw.polygon([(10, 0), (15, 8), (10, 14), (5, 8)], fill=STEEL)
    draw.polygon([(10, 2), (13, 8), (10, 12)], fill=STEEL_LIGHT)
    draw.polygon([(10, 12), (16, 20), (12, 19), (10, 26)], fill=STEEL)
    draw.polygon([(10, 12), (4, 20), (8, 19), (10, 26)], fill=STEEL)
    draw.polygon([(10, 32), (14, 40), (10, 36), (6, 40)], fill=GOLD)
    draw.line([(7, 30), (13, 30)], fill=GOLD_DARK)
    return image


def crossbow_5() -> Image.Image:
    """Arbalest bolt: twin fins and a glowing brass tip."""
    image = blank(24, 54)
    draw = ImageDraw.Draw(image)
    draw.line([(12, 8), (12, 50)], fill=WOOD_DARK, width=3)
    draw.line([(11, 10), (11, 46)], fill=GOLD_DARK, width=1)
    draw.polygon([(12, 0), (18, 10), (12, 18), (6, 10)], fill=STEEL_LIGHT)
    draw.polygon([(12, 2), (15, 10), (12, 15)], fill=GOLD_LIGHT)
    for side in (-1, 1):
        x = 12 + side
        draw.polygon([(x, 16), (x + side * 10, 24), (x, 30)], fill=GOLD)
        draw.polygon([(x, 18), (x + side * 6, 24), (x, 28)], fill=GOLD_LIGHT)
    draw.polygon([(12, 40), (17, 48), (12, 44), (7, 48)], fill=GOLD)
    return image


def gatling_4() -> Image.Image:
    """Brass cased round with a copper penetrator — the repeater's belt round."""
    image = blank(14, 30)
    draw = ImageDraw.Draw(image)
    draw.rectangle((5, 6, 9, 22), fill=GOLD_DARK)
    draw.rectangle((6, 7, 8, 21), fill=GOLD)
    draw.rectangle((6, 16, 8, 21), fill=GOLD_LIGHT)
    draw.polygon([(7, 0), (11, 8), (7, 14), (3, 8)], fill=COPPER)
    draw.polygon([(7, 2), (9, 8), (7, 11)], fill=COPPER_LIGHT)
    draw.line([(4, 24), (10, 24)], fill=IRON_DARK)
    draw.line([(5, 26), (9, 26)], fill=IRON)
    return image


def gatling_5() -> Image.Image:
    """Belt cluster: three tracer rounds fanned out of a brass link."""
    image = blank(22, 40)
    draw = ImageDraw.Draw(image)
    for x, y0, y1 in ((4, 10, 34), (11, 2, 34), (18, 12, 34)):
        draw.rectangle((x - 2, y0 + 8, x + 2, y1), fill=GOLD_DARK)
        draw.rectangle((x - 1, y0 + 9, x + 1, y1 - 1), fill=GOLD)
        draw.polygon([(x, y0), (x + 3, y0 + 8), (x, y0 + 12), (x - 3, y0 + 8)], fill=EMBER)
        draw.polygon([(x, y0 + 1), (x + 1, y0 + 8), (x, y0 + 10)], fill=EMBER_LIGHT)
    draw.rectangle((1, 30, 21, 34), fill=IRON_DARK)
    draw.rectangle((2, 31, 20, 33), fill=GOLD_DARK)
    for x in range(4, 20, 5):
        draw.point((x, 32), fill=GOLD_LIGHT)
    return image


def flamer_4() -> Image.Image:
    """Pitch blob: a lumpy ember mass with a trailing tail."""
    image = blank(18, 34)
    draw = ImageDraw.Draw(image)
    draw.polygon([(9, 2), (16, 14), (13, 26), (6, 30), (2, 18)], fill=EMBER_DARK)
    draw.polygon([(9, 6), (14, 15), (12, 24), (7, 26), (4, 18)], fill=EMBER)
    draw.ellipse((6, 8, 12, 18), fill=EMBER_LIGHT)
    draw.line([(9, 26), (9, 33)], fill=EMBER_DARK, width=2)
    draw.point((7, 30), fill=EMBER)
    draw.point((11, 31), fill=EMBER)
    return image


def flamer_5() -> Image.Image:
    """White-hot core in a burning shell: the apex of the siphon."""
    image = blank(24, 44)
    draw = ImageDraw.Draw(image)
    draw.polygon([(12, 0), (22, 16), (18, 32), (12, 38), (6, 32), (2, 16)], fill=EMBER_DARK)
    draw.polygon([(12, 4), (19, 17), (16, 30), (12, 34), (8, 30), (5, 17)], fill=EMBER)
    draw.ellipse((8, 10, 16, 24), fill=EMBER_LIGHT)
    draw.ellipse((10, 13, 14, 21), fill=CREAM)
    for x in (5, 12, 19):
        draw.point((x, 38), fill=EMBER)
    draw.line([(12, 34), (12, 42)], fill=EMBER_DARK)
    return image


def venom_4() -> Image.Image:
    """Glass ampoule: distillate caught in a stoppered vial."""
    image = blank(14, 30)
    draw = ImageDraw.Draw(image)
    draw.rectangle((6, 2, 8, 6), fill=WOOD_DARK)
    draw.rectangle((5, 6, 9, 10), fill=TOXIN_DARK)
    draw.ellipse((2, 8, 12, 22), fill=TOXIN_DARK)
    draw.ellipse((3, 10, 11, 21), fill=TOXIN)
    draw.ellipse((4, 13, 10, 19), fill=TOXIN_LIGHT)
    draw.arc((3, 9, 11, 21), 200, 280, fill=CREAM)
    draw.polygon([(7, 22), (9, 28), (5, 28)], fill=TOXIN)
    return image


def venom_5() -> Image.Image:
    """Alchemical orb: a bubbling sphere trailing droplets."""
    image = blank(22, 36)
    draw = ImageDraw.Draw(image)
    draw.ellipse((2, 2, 20, 20), fill=TOXIN_DARK)
    draw.ellipse((3, 3, 19, 19), fill=TOXIN)
    draw.ellipse((5, 6, 12, 14), fill=TOXIN_LIGHT)
    draw.ellipse((7, 8, 10, 11), fill=CREAM)
    for x, y in ((6, 16), (13, 15), (10, 18)):
        draw.point((x, y), fill=TOXIN_LIGHT)
    draw.polygon([(11, 20), (15, 28), (11, 26), (7, 28)], fill=TOXIN)
    draw.line([(11, 26), (11, 34)], fill=TOXIN_DARK)
    draw.point((9, 32), fill=TOXIN)
    return image


def harpoon_4() -> Image.Image:
    """Roped harpoon: a barbed head with the line still attached."""
    image = blank(16, 48)
    draw = ImageDraw.Draw(image)
    draw.line([(8, 6), (8, 40)], fill=WOOD_DARK, width=2)
    draw.line([(7, 8), (7, 36)], fill=WOOD, width=1)
    draw.polygon([(8, 0), (12, 10), (8, 14), (4, 10)], fill=STEEL)
    draw.polygon([(8, 2), (10, 10), (8, 12)], fill=STEEL_LIGHT)
    draw.polygon([(8, 10), (14, 16), (10, 18)], fill=STEEL)
    draw.polygon([(8, 10), (2, 16), (6, 18)], fill=STEEL)
    for y in range(22, 44, 4):
        draw.line([(4, y), (11, y + 2)], fill=CREAM)
    return image


def harpoon_5() -> Image.Image:
    """Anchor lance: a broad fluke head on a chain-wrapped shaft."""
    image = blank(22, 56)
    draw = ImageDraw.Draw(image)
    draw.line([(11, 8), (11, 52)], fill=IRON_DARK, width=3)
    draw.line([(10, 10), (10, 48)], fill=IRON, width=1)
    draw.polygon([(11, 0), (17, 12), (11, 18), (5, 12)], fill=STEEL)
    draw.polygon([(11, 2), (14, 12), (11, 15)], fill=STEEL_LIGHT)
    for side in (-1, 1):
        x = 11 + side
        draw.polygon([(x, 14), (x + side * 10, 22), (x + side * 6, 26), (x, 22)], fill=STEEL)
    draw.ellipse((9, 12, 13, 16), fill=GOLD)
    for y in range(24, 50, 5):
        draw.arc((6, y, 16, y + 6), 200, 340, fill=TEAL)
        draw.point((11, y + 3), fill=TEAL_LIGHT)
    return image


ENGINEER_SPRITES = {
    "proj-line-crossbow-4": crossbow_4,
    "proj-line-crossbow-5": crossbow_5,
    "proj-line-gatling-4": gatling_4,
    "proj-line-gatling-5": gatling_5,
    "proj-line-flamer-4": flamer_4,
    "proj-line-flamer-5": flamer_5,
    "proj-line-venom-4": venom_4,
    "proj-line-venom-5": venom_5,
    "proj-line-harpoon-4": harpoon_4,
    "proj-line-harpoon-5": harpoon_5,
}

SPRITES = {
    "proj-line-archer-4": archer_4,
    "proj-line-archer-5": archer_5,
    "proj-line-cannon-4": cannon_4,
    "proj-line-cannon-5": cannon_5,
    "proj-line-frost-4": frost_4,
    "proj-line-frost-5": frost_5,
    "proj-line-forge-4": forge_4,
    "proj-line-forge-5": forge_5,
    "proj-line-runes-4": runes_4,
    "proj-line-runes-5": runes_5,
    "proj-banner": banner_base,
    "proj-line-banner-4": banner_4,
    "proj-line-banner-5": banner_5,
    **ENGINEER_SPRITES,
}

LINES = [
    "archer", "cannon", "frost", "forge", "runes", "banner",
    "crossbow", "gatling", "flamer", "venom", "harpoon",
]


def main() -> int:
    for key, factory in SPRITES.items():
        save(factory(), key)

    lines = [
        "/**",
        " * projectileArt.js — GENERATED by scripts/build_projectiles.py.",
        " * Do not edit by hand.",
        " *",
        " * Every defence line fires its own projectile art, and the art changes again",
        " * at level 4 and level 5 so an upgrade is visible in flight, not only on the",
        " * tower. `Projectile` guards each key with textures.exists(), so a missing",
        " * file costs a downgrade to the line's base bolt, never a crash.",
        " */",
        "",
        "/** Per-line base projectile for lines that do not share the type table. */",
        "export const LINE_BASE_PROJECTILE = {",
        "  banner: 'proj-banner',",
        "};",
        "",
        "/** Tier-4 / tier-5 projectile art per defence line. */",
        "export const TIERED_PROJECTILES = {",
    ]
    for line in LINES:
        lines.append(
            "  %s: { 4: 'proj-line-%s-4', 5: 'proj-line-%s-5' }," % (line, line, line)
        )
    lines += [
        "};",
        "",
        "/**",
        " * Art key for a shot from `line` at `level`.",
        " * Returns null when the line has no special art, so the caller falls back to",
        " * the shared type table in towerVisuals.js.",
        " */",
        "export function projectileArtFor(line, level) {",
        "  const tiered = TIERED_PROJECTILES[line];",
        "  if (tiered && tiered[level]) return tiered[level];",
        "  if (LINE_BASE_PROJECTILE[line]) return LINE_BASE_PROJECTILE[line];",
        "  return null;",
        "}",
        "",
    ]
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    print(f"wrote {len(SPRITES)} projectile sprites")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
