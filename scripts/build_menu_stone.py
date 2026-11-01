#!/usr/bin/env python3
"""build_menu_stone.py — the granite panel behind the main-menu lockup.

The menu's left column sits on bare sky in the key art, which is beautiful and
impossible to read type against. This paints a slab of dark granite so the title
has ground under it: fine grain, broad mottling, a handful of hairline cracks and
nothing else. Deliberately **no blocks and no grid** — an earlier pass cut a
masonry pattern into it, and at 64 % width the mortar lines read as a wireframe
table once the title was on top.

Deterministic: the same seed always produces the same file, so a rebuild is a
no-op in git. Rebuild with:

    python3 scripts/build_menu_stone.py

Requires Pillow. Output: public/assets/ui-kit/menu-stone.jpg (640 x 1024).
"""

from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageChops, ImageFilter

W, H = 640, 1024
SEED = 20251026
BASE = (22, 25, 33)
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'public', 'assets', 'ui-kit', 'menu-stone.jpg',
)


def coarse_mottle(rng: random.Random) -> Image.Image:
    """Large, soft light/dark patches — the thing that makes stone read as stone."""
    small = Image.new('L', (12, 20))
    small.putdata([rng.randint(96, 168) for _ in range(12 * 20)])
    return small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(28))


def grain(rng: random.Random) -> Image.Image:
    """Per-pixel tooth, scaled so it averages to neutral around 128."""
    noise = Image.effect_noise((W, H), 26).filter(ImageFilter.GaussianBlur(0.6))
    # `effect_noise` is mean-128 already; keep it centred.
    return noise


def cracks(rng: random.Random) -> Image.Image:
    """A few hairline fractures. Thin, short and rare — never a pattern."""
    layer = Image.new('L', (W, H), 0)
    px = layer.load()
    for _ in range(7):
        x = rng.uniform(0, W)
        y = rng.uniform(0, H)
        angle = rng.uniform(0, math.tau)
        for _step in range(rng.randint(70, 210)):
            xi, yi = int(x), int(y)
            if 0 <= xi < W and 0 <= yi < H:
                px[xi, yi] = 255
            angle += rng.uniform(-0.09, 0.09)
            x += math.cos(angle)
            y += math.sin(angle)
    return layer.filter(ImageFilter.GaussianBlur(0.8))


def build() -> Image.Image:
    rng = random.Random(SEED)

    # Base + broad mottling. The slab is *dark* by design: the key art behind it
    # is what the eye should read, this only has to give the type a floor.
    mottle = coarse_mottle(rng)
    base = Image.new('RGB', (W, H), BASE)
    shade = Image.eval(mottle, lambda v: int((v - 128) * 0.24))
    stone = ImageChops.add(base, Image.merge('RGB', (shade, shade, shade)), scale=1.0, offset=0)

    # Fine tooth.
    tooth = Image.eval(grain(rng), lambda v: int((v - 128) * 0.38))
    stone = ImageChops.add(stone, Image.merge('RGB', (tooth, tooth, tooth)), scale=1.0, offset=0)

    # Hairline fractures — darker than the stone, never brighter.
    mask = cracks(rng)
    stone = Image.composite(
        Image.new('RGB', (W, H), (5, 6, 9)),
        stone,
        mask.point(lambda v: 150 if v > 60 else 0),
    )

    # A gentle vertical falloff so the slab fades into the sky at both ends
    # instead of ending on a straight edge.
    falloff = Image.new('L', (1, H))
    falloff.putdata(
        [int(255 * (0.62 + 0.38 * math.sin(math.pi * (y / (H - 1))) ** 0.6)) for y in range(H)]
    )
    grey = falloff.resize((W, H))
    stone = ImageChops.multiply(stone, Image.merge('RGB', (grey, grey, grey)))

    return stone


def main() -> None:
    stone = build()
    stone.save(OUT, quality=90, optimize=True, progressive=True, subsampling=0)
    mean = tuple(round(c) for c in stone.resize((1, 1), Image.BOX).getpixel((0, 0)))
    print(f'{os.path.relpath(OUT)}  {stone.width}x{stone.height}  '
          f'{os.path.getsize(OUT) // 1024} KB  mean {mean}')


if __name__ == '__main__':
    main()
