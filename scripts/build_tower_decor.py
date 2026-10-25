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


def pennant(colour: tuple[int, int, int]) -> Image.Image:
    """A hanging pennant: iron pole, cloth triangle with a lit face."""
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


def crystal(colour: tuple[int, int, int]) -> Image.Image:
    """A floating shard with a lit facet and a dark base."""
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


def cloth(colour: tuple[int, int, int]) -> Image.Image:
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

    bowl, flames = brazier()
    save(bowl, "brazier.png")
    for index, frame in enumerate(flames):
        save(frame, f"flame-{index}.png")
    save(plinth(), "plinth.png")
    save(parapet(), "parapet.png")

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
