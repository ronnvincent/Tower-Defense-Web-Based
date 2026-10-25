#!/usr/bin/env python3
"""
build_world_map.py — cut the landmark sprites out of the painted sheets.

WHY THIS EXISTS
---------------
The world map is one painted terrain plate plus *separate* landmark sprites, so
the landmarks can be hovered, focused, tinted per state and placed by data
instead of being welded into a background. The three source sheets come from an
image pass that draws each building on flat magenta; this script keys the
magenta out, cuts every connected island into its own PNG, trims it, and writes
the files `src/data/worldMap.js` names.

Deterministic: same sheets in, same PNGs out.

    python3 scripts/build_world_map.py

Source sheets live in `art-source/worldmap/` (they are ~7 MB of magenta-backed
paint, so they must not sit in `public/` where Vite would ship them to every
visitor); the cut sprites land in `public/assets/worldmap/`.

Requires Pillow.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

# Magenta key: the sheets are painted on #FF00FF. Anything within `NEAR` of it
# becomes transparent; the band between NEAR and FAR is a soft edge.
NEAR = 60.0
FAR = 135.0


def dist_to_key(px) -> float:
    r, g, b = px[0], px[1], px[2]
    # Weighted: magenta is (255,0,255). Green is the channel that carries the
    # signal (the buildings are stone, which is near-neutral in R/B).
    return ((255 - r) ** 2 + g * g + (255 - b) ** 2) ** 0.5


def key_out(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            d = dist_to_key((r, g, b))
            if d <= NEAR:
                px[x, y] = (0, 0, 0, 0)
                continue
            if d >= FAR:
                continue
            # Edge pixel: magenta spill desaturates toward grey, then the
            # coverage becomes alpha. Without the despill every building keeps
            # a hot pink halo at 1:1 zoom.
            if r > g + 30 and b > g + 30:
                r = g = b = (r + g + b) // 3
            a = int(255 * (d - NEAR) / max(1.0, FAR - NEAR))
            px[x, y] = (r, g, b, a)
    return img


def islands(img: Image.Image, min_area: int = 400, scale: int = 4):
    """Connected islands of alpha>16, found on a downscaled mask.

    Returns bounding boxes in full-resolution pixels, ordered top-to-bottom
    then left-to-right — which is exactly how the sheets are laid out.
    """
    w, h = img.size
    sw, sh = max(1, w // scale), max(1, h // scale)
    small = img.resize((sw, sh), Image.BOX)
    mask = small.load()
    solid = [[mask[x, y][3] > 24 for x in range(sw)] for y in range(sh)]
    seen = [[False] * sw for _ in range(sh)]
    boxes = []
    for y0 in range(sh):
        for x0 in range(sw):
            if not solid[y0][x0] or seen[y0][x0]:
                continue
            q = deque([(x0, y0)])
            seen[y0][x0] = True
            n = 0
            minx = maxx = x0
            miny = maxy = y0
            while q:
                x, y = q.popleft()
                n += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < sw and 0 <= ny < sh and solid[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if n * scale * scale >= min_area:
                boxes.append((minx * scale, miny * scale, (maxx + 1) * scale, (maxy + 1) * scale))
    return order_grid(boxes, h)


def order_grid(boxes, sheet_h):
    """Row-major reading order.

    The old key bucketed a box by `round(cy / (sheet_h / 2))`, which put the top
    and bottom row of a sheet in the *same* bucket whenever their centres fell
    near the middle of the image — and the banner sheet then handed the leaf to
    one name and the snowflake to another. Rows are now found by clustering the
    centres by y, which does not care how tall the sheet is.
    """
    if not boxes:
        return boxes
    rows = []
    for box in sorted(boxes, key=lambda b: (b[1] + b[3]) / 2):
        cy = (box[1] + box[3]) / 2
        for row in rows:
            if abs(cy - row['cy']) < sheet_h * 0.22:
                row['boxes'].append(box)
                row['cy'] = sum((b[1] + b[3]) / 2 for b in row['boxes']) / len(row['boxes'])
                break
        else:
            rows.append({'cy': cy, 'boxes': [box]})
    rows.sort(key=lambda row: row['cy'])
    return [box for row in rows for box in sorted(row['boxes'], key=lambda b: b[0])]


def trim(img: Image.Image, box, pad: int = 6):
    x0, y0, x1, y1 = box
    crop = img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))
    bbox = crop.getbbox()
    return crop.crop(bbox) if bbox else crop


def save(img: Image.Image, out_dir: str, name: str, max_w: int) -> tuple[int, int]:
    if img.width > max_w:
        h = round(img.height * max_w / img.width)
        img = img.resize((max_w, h), Image.LANCZOS)
    path = os.path.join(out_dir, f'landmark_{name}.png')
    img.save(path, optimize=True)
    return img.size


SHEETS = {
    'sheet-a.png': [('castle', 360), ('forge', 260), ('library', 220), ('arena', 260)],
    'sheet-b.png': [('warroom', 240), ('champions', 230), ('monument', 240), ('shrine', 220)],
    'sheet-c.png': [('banner-verdant', 150), ('banner-sunscorch', 150), ('banner-frostbite', 150),
                    ('banner-prism', 150), ('banner-endless', 150)],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='art-source/worldmap')
    ap.add_argument('--out', default='public/assets/worldmap')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    total = 0
    for sheet, names in SHEETS.items():
        path = os.path.join(args.src, sheet)
        if not os.path.exists(path):
            print(f'  ! missing {path}')
            continue
        keyed = key_out(Image.open(path))
        boxes = islands(keyed)
        if len(boxes) != len(names):
            print(f'  ! {sheet}: found {len(boxes)} islands, expected {len(names)}')
        for box, (name, max_w) in zip(boxes, names):
            w, h = save(trim(keyed, box), args.out, name, max_w)
            total += 1
            print(f'  {sheet:<12} -> landmark_{name}.png {w}x{h}')
    print(f'\n{total} landmark sprites -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
