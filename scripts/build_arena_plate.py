#!/usr/bin/env python3
"""
build_arena_plate.py — the out-of-focus grass behind the letterbox bands.

WHY THIS EXISTS
---------------
`body::before` in `src/style.css` fills the area the camera keeps clear of the
rail and the forge with the battlefield's own turf, so the frame reads as a table
the board sits on instead of as a letterboxed video.

It used to be the raw 64 px grass tile with a CSS `filter: blur(20px) saturate()
brightness()` on the fixed, oversized pseudo-element. Two problems came out of
that:

  1. **It stopped painting.** Chromium drops the raster contents of that layer
     whenever the filter *value* changes at runtime — and the graphics profile
     rewrites it the moment a battle opens (`:root[data-quality='balanced']`).
     Measured in the real build: with `filter` untouched the plate renders; after
     any profile write the same element covers the viewport and paints nothing,
     so the bands sat on flat navy.
  2. It costs a full-screen 16 px blur *every frame* on the profile most laptops
     land on.

So the blur is baked once, here, and the browser only has to draw a texture. The
plate is seamless (the tile is blurred with wrap, and the low-frequency variation
is built from whole cycles that meet at the edges), which is what lets
`background-repeat` hide the seams at any window size.

    python3 scripts/build_arena_plate.py              # writes the plate
    python3 scripts/build_arena_plate.py --preview /tmp/plate.png

Requires Pillow (`pip install pillow`).
"""
from __future__ import annotations

import argparse
import math
import os
import random

from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'assets', 'tiles', 'grass.png')
OUT = os.path.join(ROOT, 'public', 'assets', 'ui-kit', 'arena-plate.png')

SIZE = 512          # the tile the stylesheet repeats
BLUR = 15.0         # gaussian sigma, in plate pixels
SEED = 20251029
DARKEN = 0.9        # close to the board's own turf: a brightness step at the edge is a straight line you can see
DESATURATE = 1.0


def seamless_base() -> Image.Image:
    """The grass tile laid out `SIZE`, with periodic light and shade on top."""
    rng = random.Random(SEED)
    tile = Image.open(SRC).convert('RGB')
    base = Image.new('RGB', (SIZE, SIZE))
    for y in range(0, SIZE, tile.height):
        for x in range(0, SIZE, tile.width):
            base.paste(tile, (x, y))

    # Low-frequency variation for the blurred result to keep: whole cycles across
    # SIZE, so the left edge and the right edge disagree by nothing.
    waves = []
    for _ in range(4):
        waves.append((
            rng.choice((1, 2, 3)),
            rng.choice((1, 2, 3)),
            rng.uniform(0.0, math.tau),
            rng.uniform(0.0, math.tau),
            rng.uniform(0.06, 0.16),
        ))
    px = base.load()
    for y in range(SIZE):
        fy = y / SIZE
        for x in range(SIZE):
            fx = x / SIZE
            shade = 0.0
            for kx, ky, phx, phy, amp in waves:
                shade += amp * math.sin(math.tau * (kx * fx + phx)) * math.cos(math.tau * (ky * fy + phy))
            r, g, b = px[x, y]
            m = 1.0 + shade
            px[x, y] = (
                max(0, min(255, int(r * m))),
                max(0, min(255, int(g * m))),
                max(0, min(255, int(b * m))),
            )
    return base


def blur_wrapped(base: Image.Image) -> Image.Image:
    """Blur without a seam: lay the tile 3×3 down, blur, keep the middle."""
    wide = Image.new('RGB', (SIZE * 3, SIZE * 3))
    for y in (0, SIZE, SIZE * 2):
        for x in (0, SIZE, SIZE * 2):
            wide.paste(base, (x, y))
    wide = wide.filter(ImageFilter.GaussianBlur(BLUR))
    return wide.crop((SIZE, SIZE, SIZE * 2, SIZE * 2))


def build() -> Image.Image:
    plate = blur_wrapped(seamless_base())
    plate = ImageEnhance.Color(plate).enhance(DESATURATE)
    plate = ImageEnhance.Brightness(plate).enhance(DARKEN)
    return plate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', help='write a PNG of the plate tiled 2×2 the way the page shows it')
    args = parser.parse_args()

    plate = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    plate.save(OUT, optimize=True)
    print(f'arena-plate.png: {plate.width}x{plate.height} → {OUT}')

    if args.preview:
        preview = Image.new('RGB', (SIZE * 2, SIZE * 2))
        for y in (0, SIZE):
            for x in (0, SIZE):
                preview.paste(plate, (x, y))
        preview.save(args.preview)
        print(f'preview → {args.preview}')


if __name__ == '__main__':
    main()
