#!/usr/bin/env python3
"""build_hero.py — the Bastion Vanguard sprite strip.

Why the hero is drawn from a painted source
-------------------------------------------
Every creature sheet in `public/assets/enemies/` is hostile: there is no friendly
soldier anywhere in the art library, and the licence-clean packs reachable from
this build box (Kenney, OGA) have no painted knight in this game's 3/4 view. The
first pass drew the Vanguard procedurally in the interface palette; on the
battlefield it read as a flat sticker next to the painted horde, so it was
replaced with a single painted figure.

`art-source/hero/vanguard-raw.png` is original art made for this project (the
same workflow as the stage-V banner: a painted render on a flat magenta plate,
kept in `art-source/` so the asset is reproducible). No third-party licence
attaches to it.

Layout
------
4 frames of 96x112 in one 384x112 strip: frame 0 is the idle pose used by the
HUD portrait, frames 1-3 are the walk cycle the scene plays at 8 fps while the
hero has a move order. The walk is a bob plus a one-degree lean — a painted
single pose cannot be re-posed, and a sliding frame would be worse than a
straight bob. The strip's feet line is fixed so the hero never floats.

    python3 scripts/build_hero.py --preview /tmp/hero.png
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from art_key import crop_to_content, key_magenta, resize_premultiplied  # noqa: E402

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "art-source", "hero", "vanguard-raw.png")

FW, FH = 96, 112
FRAMES = 4
TARGET_H = 100
BASELINE = 104  # feet line inside the frame, in 1x pixels
BOB = (0, -2, 0, -2)
LEAN = (0.0, 0.012, 0.0, -0.012)
SWAY = (0, 1, 0, -1)


def source_figure() -> Image.Image:
    raw = Image.open(SRC)
    return crop_to_content(key_magenta(raw))


def build(out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    figure = resize_premultiplied(source_figure(), height=TARGET_H)

    strip = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for index in range(FRAMES):
        frame = figure
        if LEAN[index]:
            # A one-degree shear about the feet: the shoulder line leans into
            # the step while the boots stay planted.
            pad = 4
            widened = figure.transform(
                (figure.width + pad * 2, figure.height),
                Image.AFFINE,
                (1, LEAN[index], -pad, 0, 1, 0),
                resample=Image.BICUBIC,
            )
            frame = widened
        x = index * FW + round((FW - frame.width) / 2 + SWAY[index])
        y = BASELINE - frame.height + BOB[index]
        strip.alpha_composite(frame, (max(0, x), max(0, y)))

    path = os.path.join(out_dir, "vanguard.png")
    strip.save(path, optimize=True)
    return path


def preview(path: str, dest: str, scale: int = 3) -> str:
    image = Image.open(path)
    image = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
    image.save(dest)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="public/assets/hero")
    parser.add_argument("--preview")
    args = parser.parse_args()
    written = build(args.out)
    print(f"hero -> {written}")
    if args.preview:
        print(f"preview -> {preview(written, args.preview)}")
