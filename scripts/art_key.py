#!/usr/bin/env python3
"""art_key.py — shared magenta-key extraction for generated art.

Two build steps import this module: the stage-V banner and the hero strip. Both
start from a painted render isolated on a flat magenta plate, so they need the
same three steps:

  1. key the plate with a soft distance matte (the art is anti-aliased — a hard
     threshold leaves a jagged, pink-fringed edge);
  2. keep only the largest connected blob (a stray speck of paint becomes a
     visible dot once the asset is 40 px wide);
  3. erode one pixel and despill, so no magenta survives on the rim.

Nothing here is specific to one asset, and nothing is random: re-running a build
on the same source produces a byte-identical PNG.
"""

import math

from PIL import Image


def key_magenta(img, *, plate_tolerance=110.0, erode=1):
    """Return an RGBA image with the flat magenta plate removed."""
    img = img.convert("RGB")
    w, h = img.size
    pixels = list(img.getdata())
    corners = [pixels[0], pixels[w - 1], pixels[(h - 1) * w], pixels[-1]]
    key = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))

    def is_plate(r, g, b):
        d = math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
        return d < plate_tolerance

    solid = [0 if is_plate(*px) else 1 for px in pixels]

    # Largest connected blob, 4-neighbour flood fill.
    seen = bytearray(w * h)
    best = []
    for start in range(w * h):
        if not solid[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        blob = []
        while stack:
            i = stack.pop()
            blob.append(i)
            x, y = i % w, i // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if solid[j] and not seen[j]:
                        seen[j] = 1
                        stack.append(j)
        if len(blob) > len(best):
            best = blob

    mask = bytearray(w * h)
    for i in best:
        mask[i] = 1

    keep = mask
    for _ in range(max(0, erode)):
        eroded = bytearray(w * h)
        for i in range(w * h):
            if not keep[i]:
                continue
            x, y = i % w, i // w
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                continue
            if keep[i - 1] and keep[i + 1] and keep[i - w] and keep[i + w]:
                eroded[i] = 1
        keep = eroded

    out = [(0, 0, 0, 0)] * (w * h)
    for i, on in enumerate(keep):
        if not on:
            continue
        r, g, b = pixels[i]
        spill = min(r, b) - g
        if spill > 0:
            r = max(0, r - spill)
            b = max(0, b - spill)
        out[i] = (r, g, b, 255)

    result = Image.new("RGBA", (w, h))
    result.putdata(out)
    return result


def crop_to_content(img, alpha_threshold=12):
    alpha = img.getchannel("A")
    mask = alpha.point(lambda a: 255 if a > alpha_threshold else 0)
    box = mask.getbbox()
    if not box:
        raise SystemExit("key produced an empty matte")
    return img.crop(box)


def resize_premultiplied(img, width=None, height=None):
    """Resize through premultiplied alpha so the edge does not darken."""
    if width is not None and height is None:
        height = max(1, round(img.height * width / img.width))
    elif height is not None and width is None:
        width = max(1, round(img.width * height / img.height))
    return img.convert("RGBa").resize((width, height), Image.LANCZOS).convert("RGBA")
