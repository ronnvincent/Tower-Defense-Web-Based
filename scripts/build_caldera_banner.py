#!/usr/bin/env python3
"""build_caldera_banner.py — the stage-V world-map banner.

The five original banners on `art-source/worldmap/sheet-c.png` cover stages I-IV
and Endless Siege. The fifth campaign stage needs a sixth, and the Ashen region
must not show the same red skull banner twice.

Provenance
----------
`art-source/worldmap/banner-caldera-raw.png` was generated for this project from
the three existing banner cut-outs used as style references (a compositional
reference only — no pixels from the sheet are reused). It is original content
made for this repository, so no third-party licence attaches to it; the source
render is kept in `art-source/` so the asset can be reproduced.

Keying
------
The source render is isolated on flat magenta. This script removes that key with
a soft distance matte (not a threshold: the cloth and stone edges are
anti-aliased), unspills the magenta fringe on partial pixels, crops to the
object, and resizes to the same 150 px width as the other banners using a
premultiplied resize so the alpha edge does not darken.

    python3 scripts/build_caldera_banner.py
"""

import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "art-source", "worldmap", "banner-caldera-raw.png")
OUT = os.path.join(ROOT, "public", "assets", "worldmap", "landmark_banner-caldera.png")

TARGET_WIDTH = 150
CROP_ALPHA = 12


def keyed(img):
    """RGBA copy with the magenta plate keyed out, despeckled and unspilled."""
    img = img.convert("RGB")
    w, h = img.size
    pixels = list(img.getdata())
    # Sample the plate from the corners instead of assuming pure magenta.
    corners = [pixels[0], pixels[w - 1], pixels[(h - 1) * w], pixels[-1]]
    key = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))

    def is_plate(r, g, b):
        d = math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
        return d < 110

    solid = [0 if is_plate(*px) else 1 for px in pixels]

    # Keep only the largest connected blob: the render can drop a stray speck of
    # paint a few hundred pixels away from the banner, and a lone pixel becomes a
    # visible dot on the world map.
    seen = bytearray(w * h)
    best = []
    for start_index in range(w * h):
        if not solid[start_index] or seen[start_index]:
            continue
        stack = [start_index]
        seen[start_index] = 1
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

    # Erode one pixel: the outermost ring of the matte is where the plate has
    # bled into the art, and a hard edge is cleaner than a pink fringe.
    eroded = bytearray(w * h)
    for i in best:
        x, y = i % w, i // w
        if x == 0 or y == 0 or x == w - 1 or y == h - 1:
            continue
        if mask[i - 1] and mask[i + 1] and mask[i - w] and mask[i + w]:
            eroded[i] = 1

    out = [(0, 0, 0, 0)] * (w * h)
    for i, on in enumerate(eroded):
        if not on:
            continue
        r, g, b = pixels[i]
        # Despill: neutralise whatever still leans magenta (red and blue above
        # green). Legitimate banner red keeps its green component, so this only
        # removes the plate's own tint.
        spill = min(r, b) - g
        if spill > 0:
            r = max(0, r - spill)
            b = max(0, b - spill)
        out[i] = (r, g, b, 255)

    result = Image.new("RGBA", (w, h))
    result.putdata(out)
    return result


def crop_to_content(img):
    alpha = img.getchannel("A")
    mask = alpha.point(lambda a: 255 if a > CROP_ALPHA else 0)
    box = mask.getbbox()
    if not box:
        raise SystemExit("key produced an empty matte")
    return img.crop(box)


def resize_premultiplied(img, width):
    height = max(1, round(img.height * width / img.width))
    return img.convert("RGBa").resize((width, height), Image.LANCZOS).convert("RGBA")


def main():
    src = Image.open(SRC)
    keyed_img = crop_to_content(keyed(src))
    out = resize_premultiplied(keyed_img, TARGET_WIDTH)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT)
    print(f"{os.path.basename(OUT)} {out.width}x{out.height} from {src.size[0]}x{src.size[1]}")


if __name__ == "__main__":
    main()
