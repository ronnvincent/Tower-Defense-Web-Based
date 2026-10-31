#!/usr/bin/env python3
"""Build the per-style "presence" art for every defence line.

Why a presence layer
--------------------
The keeps already ship eight art tiers each, but at 64 px on a busy board they
collapse into "a building with a coloured flag": the tier decoration (crown,
pennants, standard, braziers, shards) is the *same shape* for all twenty-one
lines, so two different families read as the same tower twice. Players said
exactly that — "parang halos same lahat magkakamukha".

This script draws the pieces that give each *family* its own silhouette, and
each *tier* one more of them:

    level 2  crest      a crown ornament that echoes the machine
    level 3  sigil      a ground sigil that claims the tile
    level 4  ring       an energy ring that turns slowly
    level 5  halo       a floating arc over the keep
    always   mote       a slow ambient fleck

Everything is drawn here, from primitives, in the same stone/iron/gold language
as the keeps, so it reads as architecture and not as a sticker. Colours are
deliberately low-chroma: the board already carries terrain, creeps, projectiles
and damage numbers, and a second set of saturated sprites is what makes art
"masakit sa mata". The alpha is baked low and the runtime blends additively at
a further reduced alpha.

    python3 scripts/build_tower_presence.py

Requires Pillow. Output: `public/assets/towers/deco/presence/*.png` plus
`src/data/towerPresenceArt.js` (generated key list).
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "towers", "deco", "presence")
MANIFEST = os.path.join(ROOT, "src", "data", "towerPresenceArt.js")

# --- shared palette -------------------------------------------------------
STONE_DARK = (34, 38, 52, 255)
STONE_MID = (92, 100, 120, 255)
STONE_LIGHT = (158, 168, 190, 255)
IRON_DARK = (28, 32, 44, 255)
GOLD_MID = (206, 158, 52, 255)
GOLD_LIGHT = (246, 208, 118, 255)
WHITE = (255, 252, 238, 255)

# One accent pair per family. `mid` is the shape, `hot` the highlight. These are
# the only saturated pixels in the set.
STYLES = {
    # bolts and bolts-adjacent machines: cold steel with a cyan edge
    "bolt": ((96, 176, 200), (168, 226, 238)),
    # siege engines: warm ember, never orange-red enough to read as fire damage
    "shell": ((196, 118, 66), (246, 176, 104)),
    # ice: pale azure, the lightest family on purpose
    "frost": ((124, 184, 216), (208, 240, 250)),
    # lightning / runes: indigo with a hot blue core
    "storm": ((112, 118, 210), (172, 178, 255)),
    # poison: mossy acid green, desaturated so it does not glow like a buff
    "venom": ((118, 168, 84), (178, 216, 118)),
    # smithy: amber gold, the closest family to the keep's own trim
    "forge": ((206, 152, 64), (250, 206, 120)),
    # harpoons and flak: sea teal
    "harpoon": ((86, 162, 152), (150, 216, 202)),
    # ground traps: bone steel
    "trap": ((142, 148, 160), (208, 214, 224)),
}

STYLE_ORDER = ["bolt", "shell", "frost", "storm", "venom", "forge", "harpoon", "trap"]


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(image: Image.Image, name: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    image.save(os.path.join(OUT, name), optimize=True)


def with_alpha(colour, alpha: int):
    return (colour[0], colour[1], colour[2], max(0, min(255, int(alpha))))


# --- crests: one 26x22 ornament per family --------------------------------
def crest(style: str) -> Image.Image:
    """A flanking roof ornament.

    Deliberately wider than it is tall and drawn as a *side* piece: the upgrade
    badge floats directly above a tower's art, so a centred medallion would be
    hidden the moment the player could afford the next tier.
    """
    mid, hot = STYLES[style]
    img = blank(30, 26)
    d = ImageDraw.Draw(img)

    # Every crest stands on the same small plinth so it sits on a crown cleanly.
    d.rectangle((4, 18, 21, 21), fill=STONE_DARK)
    d.rectangle((5, 18, 20, 19), fill=STONE_MID)
    d.rectangle((7, 20, 18, 20), fill=STONE_LIGHT)

    if style == "bolt":
        # Three stacked chevrons: a spearhead. Reads as "many shots, one line".
        for i, y in enumerate((15, 11, 7)):
            span = 8 - i
            d.line((13 - span, y, 13, y - 4), fill=with_alpha(mid, 255))
            d.line((13 + span, y, 13, y - 4), fill=with_alpha(mid, 255))
            d.line((13 - span + 1, y - 1, 13, y - 5), fill=with_alpha(hot, 255))
        d.rectangle((12, 2, 14, 5), fill=GOLD_LIGHT)
        d.rectangle((12, 6, 14, 7), fill=GOLD_MID)

    elif style == "shell":
        # A crowned mortar shell with a burning fuse.
        d.polygon([(8, 16), (18, 16), (19, 19), (7, 19)], fill=STONE_MID)
        d.polygon([(10, 15), (16, 15), (17, 9), (9, 9)], fill=with_alpha(mid, 255))
        d.polygon([(11, 10), (15, 10), (14, 6), (12, 6)], fill=with_alpha(hot, 245))
        d.rectangle((12, 3, 14, 5), fill=GOLD_LIGHT)
        # fuse sparks
        d.point((12, 2), fill=WHITE)
        d.point((14, 1), fill=GOLD_LIGHT)

    elif style == "frost":
        # Three icicle prongs around a pale core.
        for x, top in ((7, 8), (13, 5), (19, 8)):
            d.polygon([(x - 2, 16), (x + 2, 16), (x, top)], fill=with_alpha(mid, 255))
            d.line((x, top + 1, x, 15), fill=with_alpha(hot, 240))
        d.polygon([(13, 8), (16, 13), (13, 18), (10, 13)], fill=with_alpha(hot, 220))
        d.point((13, 12), fill=WHITE)
        d.rectangle((4, 17, 21, 18), fill=STONE_LIGHT)

    elif style == "storm":
        # Two prongs and the bolt that jumps between them.
        d.rectangle((5, 8, 7, 17), fill=STONE_MID)
        d.rectangle((18, 8, 20, 17), fill=STONE_MID)
        d.rectangle((5, 7, 7, 8), fill=with_alpha(hot, 255))
        d.rectangle((18, 7, 20, 8), fill=with_alpha(hot, 255))
        bolt = [(14, 4), (10, 11), (13, 11), (11, 17), (17, 9), (14, 9), (16, 4)]
        d.polygon(bolt, fill=with_alpha(mid, 255))
        d.line((14, 5, 12, 10), fill=with_alpha(hot, 230))
        d.line((14, 12, 13, 16), fill=with_alpha(hot, 230))
        d.rectangle((4, 17, 21, 18), fill=STONE_DARK)

    elif style == "venom":
        # A retort bulb with three rising bubbles.
        d.ellipse((8, 8, 18, 19), fill=with_alpha(mid, 235), outline=IRON_DARK)
        d.ellipse((10, 11, 16, 17), fill=with_alpha(hot, 245))
        d.rectangle((11, 4, 15, 9), fill=STONE_MID)
        d.ellipse((12, 6, 14, 9), fill=with_alpha(hot, 180))
        for cx, cy, r in ((7, 6, 1), (19, 5, 1), (17, 2, 1)):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=with_alpha(hot, 170))
        d.rectangle((6, 19, 19, 20), fill=STONE_DARK)

    elif style == "forge":
        # A hammer head over an anvil notch, with two squat chimneys.
        d.rectangle((5, 16, 20, 19), fill=STONE_MID)          # anvil body
        d.polygon([(9, 16), (16, 16), (14, 12), (11, 12)], fill=STONE_DARK)  # waist
        d.rectangle((6, 10, 19, 13), fill=with_alpha(mid, 255))              # hammer head
        d.rectangle((7, 10, 18, 11), fill=with_alpha(hot, 245))
        d.rectangle((12, 13, 13, 17), fill=GOLD_MID)                          # haft
        d.rectangle((3, 5, 5, 9), fill=STONE_DARK)
        d.rectangle((20, 4, 22, 9), fill=STONE_DARK)
        d.point((4, 3), fill=with_alpha(hot, 240))
        d.point((21, 2), fill=with_alpha(hot, 150))

    elif style == "harpoon":
        # Two crossed hooks and the link of the chain that pulls them.
        d.arc((3, 4, 15, 16), start=200, end=40, fill=with_alpha(mid, 255), width=2)
        d.arc((10, 4, 22, 16), start=140, end=340, fill=with_alpha(mid, 255), width=2)
        d.line((5, 13, 9, 17), fill=with_alpha(hot, 220))
        d.line((21, 13, 17, 17), fill=with_alpha(hot, 220))
        d.ellipse((11, 9, 15, 13), outline=GOLD_MID)
        d.ellipse((12, 10, 14, 12), fill=with_alpha(hot, 245))
        d.rectangle((4, 17, 21, 18), fill=STONE_DARK)

    else:  # trap
        # A crown of spikes over a hairline of ground.
        for x in (6, 13, 20):
            d.polygon([(x - 2, 18), (x + 2, 18), (x, 5)], fill=with_alpha(mid, 245))
            d.line((x, 7, x, 17), fill=with_alpha(hot, 170))
        d.rectangle((3, 18, 22, 19), fill=IRON_DARK)
        d.point((13, 3), fill=WHITE)
        d.point((6, 4), fill=with_alpha(hot, 160))

    return img


# --- rings: 52x52 circular, drawn to be rotated at runtime ----------------
RING_TICKS = {
    "bolt": "chevron",
    "shell": "square",
    "frost": "flake",
    "storm": "bolt",
    "venom": "dot",
    "forge": "tooth",
    "harpoon": "hook",
    "trap": "spike",
}


def ring(style: str) -> Image.Image:
    mid, hot = STYLES[style]
    size = 52
    img = blank(size, size)
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    r = 23

    # The band: an outer hairline, a dimmer inner hairline, nothing in between,
    # so a tower still reads through the ring.
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=with_alpha(mid, 235), width=2)
    d.ellipse((cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4), outline=with_alpha(mid, 110))

    ticks = 8
    for i in range(ticks):
        a = (math.tau / ticks) * i
        x = cx + round(math.cos(a) * r)
        y = cy + round(math.sin(a) * r)
        kind = RING_TICKS[style]
        if kind == "chevron":
            d.line((x - 2, y + 1, x, y - 2), fill=with_alpha(hot, 255))
            d.line((x + 2, y + 1, x, y - 2), fill=with_alpha(hot, 255))
        elif kind == "square":
            d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=with_alpha(hot, 245))
        elif kind == "flake":
            d.line((x - 2, y, x + 2, y), fill=with_alpha(hot, 245))
            d.line((x, y - 2, x, y + 2), fill=with_alpha(hot, 245))
        elif kind == "bolt":
            d.line((x - 2, y - 1, x, y + 1), fill=with_alpha(hot, 245))
            d.line((x, y + 1, x + 2, y - 1), fill=with_alpha(hot, 245))
        elif kind == "dot":
            d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=with_alpha(hot, 240))
        elif kind == "tooth":
            d.rectangle((x - 1, y - 2, x + 1, y + 2), fill=with_alpha(hot, 240))
        elif kind == "hook":
            d.arc((x - 2, y - 2, x + 2, y + 2), start=20, end=250, fill=with_alpha(hot, 245))
        else:  # spike
            d.polygon([(x - 1, y + 2), (x + 1, y + 2), (x, y - 2)], fill=with_alpha(hot, 245))

    return img


# --- sigils: 62x24 elliptical ground claim --------------------------------
def sigil(style: str) -> Image.Image:
    mid, hot = STYLES[style]
    w, h = 62, 24
    img = blank(w, h)
    d = ImageDraw.Draw(img)
    # A flattened ellipse reads as "on the ground" on a 2:1 projection.
    d.ellipse((2, 3, w - 3, h - 4), outline=with_alpha(mid, 210), width=2)
    d.ellipse((8, 8, w - 9, h - 9), outline=with_alpha(mid, 110))
    # Four compass ticks, so the sigil has an orientation even though it is flat.
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        x = w // 2 + dx * 28
        y = h // 2 + dy * 8
        d.line((x - dx * 3, y - dy * 3, x + dx * 3, y + dy * 3), fill=with_alpha(hot, 200), width=2)
    # Inner glyph: one small mark per family, at the centre.
    cx, cy = w // 2, h // 2
    if style == "bolt":
        d.polygon([(cx - 3, cy + 3), (cx + 3, cy + 3), (cx, cy - 3)], fill=with_alpha(hot, 230))
    elif style == "shell":
        d.rectangle((cx - 3, cy - 3, cx + 3, cy + 3), outline=with_alpha(hot, 230))
    elif style == "frost":
        d.line((cx - 4, cy, cx + 4, cy), fill=with_alpha(hot, 230))
        d.line((cx, cy - 3, cx, cy + 3), fill=with_alpha(hot, 230))
    elif style == "storm":
        d.line((cx - 3, cy - 3, cx + 1, cy), fill=with_alpha(hot, 230))
        d.line((cx + 1, cy, cx - 1, cy + 3), fill=with_alpha(hot, 230))
    elif style == "venom":
        d.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=with_alpha(hot, 230))
    elif style == "forge":
        d.arc((cx - 4, cy - 3, cx + 4, cy + 3), start=200, end=340, fill=with_alpha(hot, 230))
    elif style == "harpoon":
        d.arc((cx - 3, cy - 3, cx + 3, cy + 3), start=40, end=300, fill=with_alpha(hot, 230))
    else:
        d.polygon([(cx - 3, cy + 3), (cx, cy - 3), (cx + 3, cy + 3)], outline=with_alpha(hot, 230))
    return img


# --- halo: 30x30 arc for a maxed keep -------------------------------------
def halo(style: str) -> Image.Image:
    mid, hot = STYLES[style]
    size = 30
    img = blank(size, size)
    d = ImageDraw.Draw(img)
    d.arc((2, 4, size - 3, size + 2), start=200, end=340, fill=with_alpha(mid, 150), width=2)
    d.arc((5, 7, size - 6, size - 1), start=205, end=335, fill=with_alpha(hot, 110), width=1)
    # Three gems on the arc.
    for x, y in ((7, 9), (15, 6), (23, 9)):
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=with_alpha(hot, 245))
    return img


# --- mote: 5x5 ambient fleck ---------------------------------------------
def mote(style: str) -> Image.Image:
    mid, hot = STYLES[style]
    img = blank(5, 5)
    d = ImageDraw.Draw(img)
    d.ellipse((1, 1, 3, 3), fill=with_alpha(hot, 245))
    d.point((2, 0), fill=with_alpha(hot, 120))
    d.point((2, 4), fill=with_alpha(mid, 110))
    return img


# --- branch gem: the level-3 choice, visible on the crest -----------------
def gem(shape: str) -> Image.Image:
    """The specialisation marker on the keep's front.

    Nine pixels is too small for two shapes to read apart, so the two branches
    differ in *colour* as well: path I is warm amber, path II is cool teal. A
    player who has both branches built can tell them apart at fit zoom, which
    is the only zoom that matters on a phone.
    """
    img = blank(11, 11)
    d = ImageDraw.Draw(img)
    warm, warm_mid = GOLD_LIGHT, GOLD_MID
    cool, cool_mid = (150, 222, 236), (74, 152, 174)
    if shape == "round":
        light, mid = warm, warm_mid
        d.ellipse((2, 2, 8, 8), fill=with_alpha(light, 240), outline=mid)
        d.ellipse((4, 3, 6, 5), fill=with_alpha(WHITE, 210))
    else:
        light, mid = cool, cool_mid
        d.polygon([(5, 0), (10, 5), (5, 10), (0, 5)], fill=with_alpha(light, 240), outline=mid)
        d.polygon([(5, 2), (8, 5), (5, 6), (2, 5)], fill=with_alpha(WHITE, 190))
    return img


def main() -> None:
    keys: dict[str, str] = {}

    for style in STYLE_ORDER:
        for name, painter in (
            ("crest", crest),
            ("ring", ring),
            ("sigil", sigil),
            ("halo", halo),
            ("mote", mote),
        ):
            key = f"presence-{name}-{style}"
            filename = f"{key}.png"
            save(painter(style), filename)
            keys[key] = filename

    for shape in ("round", "diamond"):
        key = f"presence-gem-{shape}"
        save(gem(shape), f"{key}.png")
        keys[key] = f"{key}.png"

    lines = [
        "/**",
        " * towerPresenceArt.js — GENERATED by scripts/build_tower_presence.py.",
        " * Do not edit by hand: re-run the script after changing the art.",
        " *",
        " * Presence pieces are the per-family crown/ground/aura layers attached at",
        " * runtime (see Tower.refreshDecorations). Gameplay data lives in",
        " * towerData.js; family assignment and motion live in towerPresence.js.",
        " */",
        "",
        "/** Texture key -> file, all under assets/towers/deco/presence/. */",
        "export const PRESENCE_ART = {",
    ]
    for key in sorted(keys):
        lines.append(f"  '{key}': '{keys[key]}',")
    lines += [
        "};",
        "",
        "/** Every texture key the boot scene must load. */",
        "export const PRESENCE_TEXTURES = Object.keys(PRESENCE_ART);",
        "",
    ]
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(f"wrote {len(keys)} presence textures to {OUT}")
    print(f"wrote {MANIFEST}")


if __name__ == "__main__":
    main()
