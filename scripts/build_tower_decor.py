#!/usr/bin/env python3
"""Build the per-tier tower decorations.

Why decorations at all?
-----------------------
A re-graded tower still reads as "the same building, warmer". Players judged the
first pass exactly that way: the silhouette never changed, so the upgrade did
not feel like an upgrade. Re-authoring 48 tower sheets was not an option — every
pivot, mount and muzzle in `towerVisuals.js` is measured against the shipped
art — so the tiers now *grow parts* instead:

    level 2  pennants on the parapet
    level 3  the branch colour reaches the pennants and a gold band appears
    level 4  twin braziers with animated flame at the base corners
    level 5  floating crystals orbiting above the keep

Each line carries a *silhouette*, not just a colour: the six Spire keeps fly a
plain cloth, while the five engineer lines fly a cloth stamped with their own
workshop mark (bolt, cog, flame, bubbles, barb) and hang a sprit that matches
their machine. The engineer family also swaps the stone merlon crown for an
iron gun rail, so a gun emplacement never wears castle battlements.

Each piece is a small, palette-locked sprite drawn here, then attached to the
tower container at runtime (see `Tower.rebuildDecorations`). Because they are
separate sprites they can move: the flames flicker, the crystals bob and the
pennants swing, which is what sells "this defence is alive" far better than a
static re-colour ever could.

    python3 scripts/build_tower_decor.py

Requires Pillow. Output: `public/assets/towers/deco/*.png` plus
`src/data/towerDecor.js` (generated metadata: frame counts and anchors).
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "towers", "deco")
MANIFEST = os.path.join(ROOT, "src", "data", "towerDecor.js")

# Shared palette: the same stone/iron/gold the Spire keeps already use, so the
# pieces read as part of the architecture instead of stickers on top of it.
STONE_DARK = (43, 47, 63, 255)
STONE_MID = (107, 115, 135, 255)
STONE_LIGHT = (169, 178, 198, 255)
IRON_DARK = (36, 40, 54, 255)
IRON_MID = (90, 98, 120, 255)
GOLD_DARK = (122, 90, 18, 255)
GOLD_MID = (214, 166, 52, 255)
GOLD_LIGHT = (255, 214, 120, 255)
CLOTH_SHADE = (0, 0, 0, 0)  # replaced per line


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(image: Image.Image, name: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    image.save(os.path.join(OUT, name), optimize=True)


def shade(colour: tuple[int, int, int], factor: float) -> tuple[int, int, int, int]:
    return (
        max(0, min(255, round(colour[0] * factor))),
        max(0, min(255, round(colour[1] * factor))),
        max(0, min(255, round(colour[2] * factor))),
        255,
    )


def glyph(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    mark: str,
    colour: tuple[int, int, int, int] = GOLD_LIGHT,
    span: int = 5,
) -> None:
    """Stamp a workshop mark.

    The mark is what separates the engineer pennants from the keeps': at 30 px a
    colour change is invisible in a crowded board, but a bolt or a cog reads at a
    glance. `span` is the half-width in pixels, so the same drawing works on the
    large standard (span 5) and on the small pennant (span 3).
    """
    s = max(2, span)
    if mark == "bolt":
        # A crossbow bolt: shaft, head, and two fletching strokes.
        draw.line((cx - s, cy, cx + s - 2, cy), fill=colour, width=1)
        draw.polygon([(cx + s, cy), (cx + s - 3, cy - 2), (cx + s - 3, cy + 2)], fill=colour)
        draw.line((cx - s, cy, cx - s + 2, cy - 2), fill=colour)
        draw.line((cx - s, cy, cx - s + 2, cy + 2), fill=colour)
    elif mark == "cog":
        # A gear: ring, four teeth, hub.
        draw.ellipse((cx - s + 1, cy - s + 1, cx + s - 1, cy + s - 1), outline=colour)
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            draw.line((cx + dx * (s - 2), cy + dy * (s - 2), cx + dx * s, cy + dy * s), fill=colour)
        draw.ellipse((cx - 1, cy - 1, cx + 1, cy + 1), fill=colour)
    elif mark == "flame":
        # A filled tongue with a hot core.
        draw.polygon(
            [(cx, cy - s), (cx + s, cy + 1), (cx + s - 2, cy + s), (cx - s + 2, cy + s), (cx - s, cy + 1)],
            fill=colour,
        )
        draw.polygon([(cx, cy - 1), (cx + 2, cy + 2), (cx, cy + s - 1), (cx - 2, cy + 2)], fill=(255, 255, 232, 255))
    elif mark == "bubbles":
        # Three bubbles rising out of a shallow pool: poison, not fire.
        draw.ellipse((cx - s, cy, cx - 1, cy + s), outline=colour)
        draw.ellipse((cx, cy - s, cx + s - 1, cy - 1), outline=colour)
        draw.ellipse((cx + 1, cy + 1, cx + s, cy + s), fill=colour)
    elif mark == "barb":
        # A hooked harpoon: curved shank, straight barb, short rope.
        draw.arc((cx - s, cy - s, cx + s, cy + s), start=210, end=30, fill=colour)
        draw.line((cx + (s // 2) + 1, cy - 2, cx + (s // 2) + 1, cy + 2), fill=colour)
        draw.line((cx - s, cy - 1, cx - s - 1, cy + s), fill=colour)
    else:
        # Fallback mark: a small chevron, the keeps' emblem.
        draw.polygon(
            [(cx, cy - s), (cx + s, cy + s - 1), (cx + 1, cy + 1), (cx - s + 1, cy + s - 1)],
            fill=colour,
        )


def pennant(colour: tuple[int, int, int], mark: str | None = None) -> Image.Image:
    """A hanging pennant: iron pole, cloth triangle with a lit face.

    The keeps fly the plain 14 x 30 cloth. A line with a workshop `mark` flies a
    larger 18 x 36 standard with the mark stamped in gold, so an engineer tower
    is recognisable from the flag alone even in a crowded corner.
    """
    if mark:
        w, h = 18, 36
        image = blank(w, h)
        draw = ImageDraw.Draw(image)
        draw.rectangle((3, 0, 4, h - 1), fill=IRON_MID)
        draw.rectangle((3, 0, 3, h - 1), fill=IRON_DARK)
        draw.polygon([(5, 2), (17, 8), (5, 18)], fill=shade(colour, 1.0))
        draw.polygon([(5, 2), (12, 5), (5, 9)], fill=shade(colour, 1.25))
        draw.line([(5, 18), (17, 8)], fill=shade(colour, 0.55), width=1)
        draw.line([(17, 8), (17, 9)], fill=shade(colour, 0.55), width=1)
        draw.rectangle((2, 0, 5, 1), fill=GOLD_MID)
        draw.ellipse((2, 0, 6, 4), outline=GOLD_MID)
        glyph(draw, 10, 9, mark, span=3)
        return image

    w, h = 14, 30
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    draw.rectangle((2, 0, 3, h - 1), fill=IRON_MID)
    draw.rectangle((2, 0, 2, h - 1), fill=IRON_DARK)
    draw.polygon([(4, 2), (13, 7), (4, 15)], fill=shade(colour, 1.0))
    draw.polygon([(4, 2), (9, 5), (4, 8)], fill=shade(colour, 1.25))
    draw.line([(4, 15), (13, 7)], fill=shade(colour, 0.55), width=1)
    draw.rectangle((1, 0, 4, 1), fill=GOLD_MID)
    return image


def brazier() -> tuple[Image.Image, list[Image.Image]]:
    """A shallow iron bowl plus a three-frame flame."""
    bowl = blank(18, 12)
    draw = ImageDraw.Draw(bowl)
    draw.polygon([(1, 4), (16, 4), (13, 11), (4, 11)], fill=IRON_MID)
    draw.polygon([(1, 4), (16, 4), (13, 11), (4, 11)], outline=IRON_DARK)
    draw.rectangle((1, 3, 16, 4), fill=GOLD_MID)
    draw.rectangle((5, 0, 12, 3), fill=IRON_DARK)
    draw.rectangle((6, 1, 11, 3), fill=(255, 120, 40, 200))

    frames = []
    for index, (height, width, tint) in enumerate(
        [(9, 7, (255, 138, 48, 235)), (11, 6, (255, 168, 72, 235)), (8, 8, (255, 196, 110, 235))]
    ):
        flame = blank(14, 16)
        fd = ImageDraw.Draw(flame)
        fd.polygon([(7, 0), (12, 8), (10, 15), (4, 15), (2, 8)], fill=tint)
        fd.polygon([(7, 3), (10, 9), (8, 14), (6, 14), (4, 9)], fill=(255, 224, 160, 235))
        fd.ellipse((5, 10, 9, 15), fill=(255, 246, 214, 220))
        frames.append(flame)
    return bowl, frames


def crystal(colour: tuple[int, int, int], shape: str = "shard") -> Image.Image:
    """A floating sprit with a lit facet and a dark base.

    `shape` is the family silhouette: the keeps float a classic four-facet
    shard, while each engineer line floats something its machine would emit —
    a lance tip, a cog, an ember, a droplet, a barbed hook. Engineer sprits are
    drawn on a taller canvas with a dark rim so the shape survives on a busy
    battlefield.
    """
    if shape != "shard":
        w, h = 20, 28
        image = blank(w, h)
        draw = ImageDraw.Draw(image)
        rim = shade(colour, 0.4)
        hot = shade(colour, 1.55)
        mid = shade(colour, 1.0)
        dark = shade(colour, 0.65)

        if shape == "lance":
            # A bolt head standing on its tip, with swept fins at the shoulder.
            draw.polygon([(10, 0), (18, 34)], fill=None)
            draw.polygon([(10, 0), (15, 13), (10, 27), (5, 13)], fill=rim)
            draw.polygon([(10, 2), (14, 13), (10, 25), (6, 13)], fill=mid)
            draw.polygon([(10, 2), (14, 13), (10, 16)], fill=hot)
            draw.polygon([(10, 16), (14, 13), (10, 25)], fill=dark)
            draw.polygon([(10, 7), (19, 18), (10, 14)], fill=rim)
            draw.polygon([(10, 7), (19, 18), (10, 14)], fill=mid)
            draw.polygon([(10, 7), (1, 18), (10, 14)], fill=rim)
            draw.polygon([(10, 7), (1, 18), (10, 14)], fill=hot)
        elif shape == "cog":
            # Ten-toothed gear with a dark bore.
            teeth = []
            import math

            for index in range(20):
                angle = math.pi * index / 10
                radius = 9.5 if index % 2 == 0 else 6.6
                teeth.append((10 + math.cos(angle) * radius, 14 + math.sin(angle) * radius))
            draw.polygon(teeth, fill=rim)
            inner = [(8.2 if i % 2 == 0 else 5.6, 0) for i in range(0)]
            scaled = []
            for index in range(20):
                angle = math.pi * index / 10
                radius = 8.2 if index % 2 == 0 else 5.6
                scaled.append((10 + math.cos(angle) * radius, 14 + math.sin(angle) * radius))
            draw.polygon(scaled, fill=mid)
            draw.polygon([(10, 5), (16, 10), (10, 14)], fill=hot)
            draw.ellipse((7, 11, 13, 17), fill=rim)
            draw.ellipse((8, 12, 12, 16), fill=hot)
        elif shape == "ember":
            # A flame gem with a licking, concave flank — a teardrop would read
            # as the venom droplet, so the silhouette has to be jagged.
            draw.polygon(
                [(10, 0), (14, 8), (13, 13), (18, 18), (14, 28), (6, 28), (2, 18), (7, 13), (6, 8)],
                fill=rim,
            )
            draw.polygon(
                [(10, 2), (13, 9), (12, 14), (16, 18), (12, 26), (8, 26), (4, 18), (8, 14), (7, 9)],
                fill=mid,
            )
            draw.polygon([(10, 2), (13, 9), (12, 14), (10, 17)], fill=hot)
            draw.polygon([(10, 9), (13, 18), (10, 26), (7, 18)], fill=hot)
        elif shape == "drop":
            # A rising cluster of three bubbles, not a droplet: poison should
            # read as fizzing liquid, and the round lumps are unmistakable next
            # to the flame's jagged flank.
            draw.ellipse((3, 13, 17, 28), fill=rim)
            draw.ellipse((7, 1, 18, 13), fill=rim)
            draw.ellipse((0, 5, 8, 14), fill=rim)
            draw.ellipse((4, 14, 16, 27), fill=mid)
            draw.ellipse((8, 2, 17, 12), fill=mid)
            draw.ellipse((1, 6, 7, 13), fill=mid)
            draw.ellipse((6, 16, 11, 21), fill=hot)
            draw.ellipse((10, 4, 14, 8), fill=hot)
            draw.ellipse((2, 8, 5, 11), fill=hot)
        else:  # barb
            # A shard with two hooks still buried in it.
            draw.polygon([(10, 0), (17, 11), (10, 27), (3, 11)], fill=rim)
            draw.polygon([(10, 2), (15, 11), (10, 25), (5, 11)], fill=mid)
            draw.polygon([(10, 2), (15, 11), (10, 15)], fill=hot)
            draw.polygon([(10, 15), (15, 11), (10, 25)], fill=dark)
            draw.line((3, 11, 0, 20), fill=rim, width=3)
            draw.line((3, 11, 0, 20), fill=hot, width=1)
            draw.line((17, 11, 20, 20), fill=rim, width=3)
            draw.line((17, 11, 20, 20), fill=dark, width=1)
        return image

    w, h = 16, 24
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    draw.polygon([(8, 0), (15, 9), (8, 23), (1, 9)], fill=shade(colour, 0.9))
    draw.polygon([(8, 0), (15, 9), (8, 12)], fill=shade(colour, 1.35))
    draw.polygon([(8, 12), (15, 9), (8, 23)], fill=shade(colour, 0.6))
    draw.line([(8, 1), (8, 22)], fill=shade(colour, 1.5), width=1)
    return image


def plinth() -> Image.Image:
    """A wide fortified footing: stone slab with a gold lip and corner posts.

    Sits *behind* the tower at ground level, so it widens the base without
    crossing the keep's face (a band across the middle read as a fence).
    """
    w, h = 76, 16
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 6, w - 1, h - 1), fill=STONE_DARK)
    draw.rectangle((2, 4, w - 3, h - 3), fill=STONE_MID)
    draw.rectangle((3, 4, w - 4, 5), fill=GOLD_MID)
    draw.rectangle((3, h - 4, w - 4, h - 3), fill=STONE_DARK)
    for x in (0, w - 6):
        draw.rectangle((x, 0, x + 5, h - 1), fill=STONE_MID)
        draw.rectangle((x, 0, x + 5, 1), fill=STONE_LIGHT)
        draw.rectangle((x + 1, 2, x + 2, h - 2), fill=STONE_DARK)
    return image


def cloth(colour: tuple[int, int, int], mark: str | None = None) -> Image.Image:
    """A long battle standard hung down the keep's front face."""
    w, h = 22, 38
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    draw.rectangle((1, 0, 20, 32), fill=shade(colour, 0.85))
    draw.rectangle((1, 0, 2, 32), fill=shade(colour, 0.55))
    draw.rectangle((19, 0, 20, 32), fill=shade(colour, 0.6))
    draw.polygon([(1, 32), (20, 32), (11, 37)], fill=shade(colour, 0.75))
    draw.rectangle((0, 0, 21, 3), fill=GOLD_MID)
    draw.rectangle((0, 0, 21, 1), fill=GOLD_LIGHT)
    if mark:
        # Engineer standard: the workshop mark in gold, with no chevron.
        draw.ellipse((6, 9, 16, 19), fill=shade(colour, 0.6))
        draw.ellipse((6, 9, 16, 19), outline=GOLD_MID)
        glyph(draw, 11, 14, mark, span=4)
    else:
        # Emblem: a gold chevron over a pale disc.
        draw.ellipse((7, 9, 15, 17), fill=shade(colour, 1.3))
        draw.polygon([(11, 20), (16, 26), (11, 24), (6, 26)], fill=GOLD_MID)
    return image


def parapet() -> Image.Image:
    """A merlon crown that widens the silhouette at level 2."""
    w, h = 64, 14
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    for index in range(8):
        x = index * 8
        draw.rectangle((x + 1, 2, x + 6, h - 1), fill=STONE_MID)
        draw.rectangle((x + 1, 2, x + 6, 3), fill=STONE_LIGHT)
        draw.rectangle((x + 1, h - 2, x + 6, h - 1), fill=STONE_DARK)
    draw.rectangle((0, h - 3, w - 1, h - 2), fill=STONE_DARK)
    return image


def rail() -> Image.Image:
    """An iron gun rail: the engineer family's answer to a merlon crown.

    A riveted top beam on six posts, with a low cradle in the middle for the
    barrel to sit in — so a repeater or a siphon reads as a gun emplacement
    rather than a castle.
    """
    w, h = 64, 14
    image = blank(w, h)
    draw = ImageDraw.Draw(image)

    # Top beam.
    draw.rectangle((0, 2, w - 1, 6), fill=IRON_MID)
    draw.rectangle((0, 2, w - 1, 3), fill=STONE_LIGHT)
    draw.rectangle((0, 5, w - 1, 6), fill=IRON_DARK)

    # Posts, with the two middle ones framing the cradle.
    for x in (1, 11, 21, 39, 49, 59):
        draw.rectangle((x, 6, x + 2, h - 1), fill=IRON_MID)
        draw.rectangle((x, 6, x, h - 1), fill=IRON_DARK)
        draw.rectangle((x + 1, 2, x + 1, 4), fill=GOLD_MID)

    # Cradle: a shallow iron saddle between the middle posts.
    draw.rectangle((24, 9, 38, h - 1), fill=IRON_MID)
    draw.rectangle((24, 9, 38, 9), fill=STONE_LIGHT)
    draw.rectangle((24, 12, 38, h - 1), fill=IRON_DARK)

    # Foot beam.
    draw.rectangle((0, h - 2, w - 1, h - 1), fill=IRON_DARK)
    return image


def main() -> int:
    os.makedirs(OUT, exist_ok=True)

    # One pennant set per line: the cloth carries the line's own accent, which
    # is the cheapest "this one is the frost tower" signal on a crowded board.
    accents = {
        "archer": (223, 196, 120),
        "cannon": (198, 120, 72),
        "frost": (150, 214, 238),
        "forge": (232, 132, 72),
        "runes": (176, 146, 255),
        "banner": (255, 206, 120),
    }
    # The engineer lines are machines, not castles: their own accent, their own
    # workshop mark on the cloth, and a sprit shaped like something the tower
    # would actually emit. Recolouring the keep decorations was not enough —
    # a venom still flying a plain cloth reads as an archer tower.
    engineer = {
        "crossbow": ((208, 162, 58), "bolt", "lance"),
        "gatling": ((198, 112, 52), "cog", "cog"),
        "flamer": ((238, 100, 30), "flame", "ember"),
        "venom": ((86, 156, 74), "bubbles", "drop"),
        "harpoon": ((60, 132, 148), "barb", "barb"),
    }

    sheets = {}
    for line, colour in accents.items():
        save(pennant(colour), f"pennant-{line}.png")
        save(crystal(colour), f"crystal-{line}.png")
        save(cloth(colour), f"cloth-{line}.png")
        sheets[line] = {
            "pennant": f"pennant-{line}.png",
            "crystal": f"crystal-{line}.png",
            "cloth": f"cloth-{line}.png",
        }

    for line, (colour, mark, shape) in engineer.items():
        save(pennant(colour, mark), f"pennant-{line}.png")
        save(crystal(colour, shape), f"crystal-{line}.png")
        save(cloth(colour, mark), f"cloth-{line}.png")
        sheets[line] = {
            "pennant": f"pennant-{line}.png",
            "crystal": f"crystal-{line}.png",
            "cloth": f"cloth-{line}.png",
        }

    bowl, flames = brazier()
    save(bowl, "brazier.png")
    for index, frame in enumerate(flames):
        save(frame, f"flame-{index}.png")
    save(plinth(), "plinth.png")
    save(parapet(), "parapet.png")
    save(rail(), "rail.png")

    lines = [
        "/**",
        " * towerDecor.js — GENERATED by scripts/build_tower_decor.py.",
        " * Do not edit by hand: re-run the script after changing the art.",
        " *",
        " * Decorations are attached to a tower's container at runtime, one tier at a",
        " * time, so an upgrade changes the silhouette instead of only its palette.",
        " */",
        "",
        "/** Static pieces shared by every line: texture key -> file. */",
        "export const DECOR_ART = {",
        "  'deco-parapet': 'parapet.png',",
        "  'deco-rail': 'rail.png',",
        "  'deco-plinth': 'plinth.png',",
        "  'deco-brazier': 'brazier.png',",
        "  'deco-flame-0': 'flame-0.png',",
        "  'deco-flame-1': 'flame-1.png',",
        "  'deco-flame-2': 'flame-2.png',",
    ]
    for line, entry in sheets.items():
        lines.append(f"  'pennant-{line}': '{entry['pennant']}',")
        lines.append(f"  'crystal-{line}': '{entry['crystal']}',")
        lines.append(f"  'cloth-{line}': '{entry['cloth']}',")
    lines += [
        "};",
        "",
        "/** Which crown each family wears: castle battlements vs an iron gun rail. */",
        "export const DECOR_CROWN = { core: 'deco-parapet', engineer: 'deco-rail' };",
        "",
        "/** Number of flame frames in the flicker loop. */",
        "export const FLAME_FRAMES = 3;",
        "",
        "/** Every texture key the boot scene must load from assets/towers/deco/. */",
        "export const DECOR_TEXTURES = Object.keys(DECOR_ART);",
        "",
    ]
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    count = len([name for name in os.listdir(OUT) if name.endswith(".png")])
    print(f"wrote {count} decoration sprites")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
