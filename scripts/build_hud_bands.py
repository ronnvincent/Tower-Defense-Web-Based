#!/usr/bin/env python3
"""
build_hud_bands.py — the torn edge on the HUD's two black bands.

WHY THIS EXISTS
---------------
The top rail and the forge dock used to be plates: an engraved 9-slice frame on
the bar and another on the dock, then a heavy black gradient behind it. Request
62 cut the plates and asked for the cheapest possible backing instead — plain
black at about 15 %, only as tall as the content it backs, and with a **torn,
folded-paper edge** instead of a straight line.

A tear cannot be faked with a CSS gradient (the stops would have to repeat, and
a repeated tear reads as a pattern). It is an alpha mask instead: two PNGs that
`src/style.css` hangs on `#hud-container::before` (torn along its bottom edge)
and `.hud-dock::before` (torn along its top edge). The mask is stretched to the
band, so the band is as wide as the screen and the tear still reads at any size.

The edge is deterministic (fixed seed): rebuilding this file is byte-identical,
so the masks can live in the repo like every other sprite. Three of the peaks
are deliberately *straight* diagonal cuts — a fold in the paper, not another
random wiggle — which is what makes the edge read as torn and refolded rather
than as noise.

    python3 scripts/build_hud_bands.py            # writes both masks
    python3 scripts/build_hud_bands.py --preview /tmp/band.png

Requires Pillow (`pip install pillow`).
"""
from __future__ import annotations

import argparse
import os
import random

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'public', 'assets', 'ui-kit')

WIDTH = 1024
HEIGHT = 64
# Drawn 4x and downsampled, so the tear is soft the way torn paper is — a hard
# 1 px staircase reads as a JPEG artefact at HUD scale.
SCALE = 4
SEED = 20251029

# The paper is thinner where it was creased before it was torn.
FOLDS = ((0.19, 1.0), (0.52, -1.0), (0.79, 0.8))


def tear_profile(width: int) -> list[float]:
    """How deep the tear runs at each column, in *band* pixels from the top."""
    rng = random.Random(SEED)
    base = 46.0
    depth: list[float] = []
    drift = 0.0
    for _ in range(width):
        drift = drift * 0.72 + rng.uniform(-1.6, 1.6)
        base = max(40.0, min(58.0, base + rng.uniform(-0.55, 0.55) + drift * 0.12))
        depth.append(base)

    # The folds: a short, dead-straight ramp out and back, like a corner that was
    # folded over before the page was ripped.
    for centre, direction in FOLDS:
        start = int(width * centre)
        run = 26
        for i in range(run):
            x = (start + i) % width
            # A straight diagonal, then the rip continues from where it landed.
            depth[x] = depth[start] + direction * (i / run) * 13.0
    return depth


def build(tear_at_bottom: bool) -> Image.Image:
    """One mask. Opaque where the band is, transparent past the tear."""
    width = WIDTH * SCALE
    height = HEIGHT * SCALE
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    profile = tear_profile(width)
    for x, depth in enumerate(profile):
        edge = int(round(depth * SCALE))
        if tear_at_bottom:
            # Opaque from the top down to the tear.
            draw.line([(x, 0), (x, edge)], fill=(255, 255, 255, 255), width=1)
        else:
            # Opaque from the tear down to the bottom (the dock's band).
            draw.line([(x, edge), (x, height)], fill=(255, 255, 255, 255), width=1)
    return img.resize((WIDTH, HEIGHT), Image.LANCZOS)


def preview(masks: dict[str, Image.Image], path: str) -> None:
    """Both masks over a bright plate, the way they sit over the battlefield."""
    board = Image.new('RGBA', (WIDTH, HEIGHT * 2 + 24), (86, 132, 62, 255))
    band = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 38))  # ≈15 % black
    for index, (name, mask) in enumerate(masks.items()):
        top = index * (HEIGHT + 24)
        tile = Image.composite(band, Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0)), mask.split()[-1])
        board.alpha_composite(tile, (0, top))
    board.save(path)
    print(f'preview → {path}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', help='write a PNG of both masks over a board-coloured plate')
    args = parser.parse_args()

    masks = {
        'band-tear-bottom.png': build(tear_at_bottom=True),
        'band-tear-top.png': build(tear_at_bottom=False),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, img in masks.items():
        path = os.path.join(OUT_DIR, name)
        img.save(path)
        print(f'{name}: {img.width}x{img.height} → {path}')
    if args.preview:
        preview(masks, args.preview)


if __name__ == '__main__':
    main()
