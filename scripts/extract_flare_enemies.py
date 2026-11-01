#!/usr/bin/env python3
"""Import monsters from the Flare game's CC-BY-SA art into our horde format.

The game's sprites are 9-row strips (idle / move / death x 3 colour variants),
sliced by `frameWidth`/`frameHeight` at runtime. Flare ships the opposite: one
packed atlas per creature plus an `.txt` file listing a rectangle and a foot
offset for every frame of every animation and every one of eight facings.

This script bridges the two, once, at author time:

    python3 scripts/extract_flare_enemies.py --source /path/to/flare-game

Output: `src/assets/flare/enemies/<name>.png`. After that the creature is an
ordinary source strip to `scripts/build_spire_assets.py` — the biomes, tiers,
boss grading and manifest all work unchanged.

Why this shape:

* **Three facings, not eight.** Flare bakes eight facings into every atlas. The
  game's strip format carries exactly three (south / north / profile), and
  `Enemy.faceTravel()` picks the row that matches the heading instead of
  rotating the sprite. Importing only the full-front pose is what made the
  minotaur look like it was sliding sideways: its body stayed square to the
  camera while it travelled east. Three rows fix that for a third of the
  pixels: front (dir 6), back (dir 2) and side (dir 4, drawn facing east).
* **Baked shadows are removed.** Flare paints a soft black ellipse under every
  creature. The game draws its own shadow, and a baked one would rotate with
  the body — a tilted ground shadow reads as a bug. Only low-alpha near-black
  pixels are dropped, so published outlines (alpha 255) survive.
* **Blank tail columns, not repeated frames.** Animations in one atlas have
  different lengths (4-frame stance, 8-frame run, 6-frame death). The runtime
  measures how many columns actually carry ink, so padding with empty columns
  keeps the real frame count; repeating the last frame would add a dead beat to
  the loop.

Requires Pillow (author-time only — the built strips are committed).
"""

import argparse
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "assets", "flare", "enemies")

# Which creatures to import and where they live inside Flare.
#
# `dir` is the facing index to lift. Flare's eight facings start with the back
# to the camera (0) and reach the full front at 6, which is the pose our
# `facing: 'south'` contract expects.
SPEC = {
    "thrall": {"mod": "fantasycore", "file": "zombie"},
    "raider": {"mod": "fantasycore", "file": "goblin"},
    "bonearcher": {"mod": "fantasycore", "file": "skeleton_archer"},
    "ironhorn": {"mod": "fantasycore", "file": "minotaur"},
    "ashwing": {"mod": "fantasycore", "file": "wyvern"},
    "gravesworn": {"mod": "empyrean_campaign", "file": "skeleton_knight_boss"},
}

# Flare's eight facings run counter-clockwise from the back: 0/1 back-left and
# back-right, 2 straight away, 3/5 the two rear three-quarters, 4 the left
# profile (drawn facing east), 6 the full front, 7 the right profile.
# Our strip wants front / away / side, in that order.
DIRECTIONS = (
    ("south", 6),
    ("north", 2),
    ("profile", 4),
)

# Animation name -> the sections that can stand in for it, best first.
CLIPS = {
    "idle": ("stance", "block", "spawn"),
    "move": ("run", "stance"),
    "death": ("die", "critdie"),
}

# A pixel this dark and this translucent is the painted ground shadow, not art.
SHADOW_MAX_RGB = 30
SHADOW_MAX_ALPHA = 200

FRAME_RE = re.compile(r"^frame=(\d+),(\d+),(-?\d+),(-?\d+),(\d+),(\d+),(-?\d+),(-?\d+)$")
SECTION_RE = re.compile(r"^\[(\w+)\]$(.*?)(?=^\[|\Z)", re.M | re.S)


def parse_atlas(path):
    """{(section, direction): [(x, y, w, h, ox, oy), ...]} sorted by frame."""
    text = open(path, encoding="utf-8").read()
    sections = {}
    for match in SECTION_RE.finditer(text):
        name = match.group(1)
        for line in match.group(2).splitlines():
            found = FRAME_RE.match(line.strip())
            if not found:
                continue
            index, direction, x, y, w, h, ox, oy = (int(v) for v in found.groups())
            sections.setdefault((name, direction), []).append((index, (x, y, w, h, ox, oy)))
    return {key: [rect for _, rect in sorted(frames)] for key, frames in sections.items()}


def pick_clip(sections, name, direction):
    for section in CLIPS[name]:
        if (section, direction) in sections:
            return sections[(section, direction)]
    raise SystemExit(f"no {name} animation for direction {direction}")


def strip_shadow(image):
    """Drop the baked ground shadow, keep the (opaque) outlines."""
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a and a < SHADOW_MAX_ALPHA and max(r, g, b) < SHADOW_MAX_RGB:
                pixels[x, y] = (r, g, b, 0)
    return image


def build(name, spec, source_root):
    atlas_path = os.path.join(
        source_root, "mods", spec["mod"], "images", "enemies", f"{spec['file']}.png"
    )
    anim_path = os.path.join(
        source_root, "mods", spec["mod"], "animations", "enemies", f"{spec['file']}.txt"
    )
    if not os.path.exists(atlas_path):
        raise SystemExit(f"missing atlas: {atlas_path} (is --source a flare-game checkout?)")

    atlas = Image.open(atlas_path).convert("RGBA")
    sections = parse_atlas(anim_path)

    # clips[facing][clip] -> frames, one entry per facing we import.
    clips = {}
    for facing, direction in DIRECTIONS:
        clips[facing] = {
            clip: pick_clip(sections, clip, direction) for clip in CLIPS
        }

    # Foot anchor space: a frame's rect is drawn at (-ox, -oy) relative to the
    # creature's feet. The union **over every facing** gives one cell that never
    # clips art, which is required: a strip is a rigid grid, so all three rows
    # have to share a cell.
    left = top = 1 << 30
    right = bottom = -(1 << 30)
    for per_clip in clips.values():
        for frames in per_clip.values():
            for (_, _, w, h, ox, oy) in frames:
                left, right = min(left, -ox), max(right, w - ox)
                top, bottom = min(top, -oy), max(bottom, h - oy)

    pad = 2
    cell_w = right - left + pad * 2
    cell_h = bottom - top + pad * 2
    # Square-ish cells keep Phaser's frame slicing simple and the sheet tidy.
    cell = max(cell_w, cell_h)
    anchor_x = -left + (cell - cell_w) // 2 + pad
    anchor_y = -top + (cell - cell_h) // 2 + pad

    cols = max(
        len(frames)
        for per_clip in clips.values()
        for frames in per_clip.values()
    )
    rows = 9
    sheet = Image.new("RGBA", (cell * cols, cell * rows), (0, 0, 0, 0))

    # Rows 0-2 idle (south / north / profile), 3-5 move, 6-8 death — the layout
    # `BootScene.createEnemyClips()` and `Enemy.faceTravel()` expect.
    for row_start, clip in ((0, "idle"), (3, "move"), (6, "death")):
        for palette, (facing, _) in enumerate(DIRECTIONS):
            for index, (x, y, w, h, ox, oy) in enumerate(clips[facing][clip]):
                piece = strip_shadow(atlas.crop((x, y, x + w, y + h)))
                sheet.alpha_composite(
                    piece,
                    (
                        index * cell + anchor_x - ox,
                        (row_start + palette) * cell + anchor_y - oy,
                    ),
                )

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{name}.png")
    sheet.save(out)
    idle = len(clips["south"]["idle"])
    move = len(clips["south"]["move"])
    death = len(clips["south"]["death"])
    print(
        f"  {name:12s} <- {spec['mod']}/{spec['file']} "
        f"{cols}x{rows} of {cell}x{cell} "
        f"(idle {idle}, move {move}, death {death}, 3 facings)"
    )
    return sheet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=os.environ.get("FLARE_SRC", "/tmp/flare-game"),
        help="path to a clintbellanger/flare-game checkout (default: $FLARE_SRC)",
    )
    parser.add_argument("--only", action="append", help="import just these names")
    parser.add_argument("--preview", help="write a contact sheet for eyeballing")
    args = parser.parse_args()

    names = args.only or list(SPEC)
    made = []
    for name in names:
        if name not in SPEC:
            raise SystemExit(f"unknown creature {name}; known: {', '.join(SPEC)}")
        made.append((name, build(name, SPEC[name], args.source)))

    if args.preview:
        pad = 6
        cell_w = max(sheet.width // (max(1, sheet.width // 1)) for _, sheet in made)
        width = max(sheet.width for _, sheet in made) + pad * 2
        height = sum(sheet.height + pad for _, sheet in made) + pad
        page = Image.new("RGBA", (width, height), (26, 28, 34, 255))
        y = pad
        for _, sheet in made:
            page.alpha_composite(sheet, (pad, y))
            y += sheet.height + pad
        page.save(args.preview)
        print(f"preview -> {args.preview} ({page.width}x{page.height})")


if __name__ == "__main__":
    sys.exit(main())
