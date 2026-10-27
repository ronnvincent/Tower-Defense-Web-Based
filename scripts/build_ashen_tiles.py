#!/usr/bin/env python3
"""build_ashen_tiles.py — terrain for the fifth campaign stage.

`build_spire_assets.py` regenerates every biome from the Spire source pack, which
needs the raw downloads present. The ashen tileset is pure `terrain.py` output,
so this script can rebuild just the one biome (plus its world-map thumbnail) from
a clean checkout:

    python3 scripts/build_ashen_tiles.py

It writes exactly the files the game asks for by suffix (`-ashen`), so it cannot
touch the other biomes: nine ground variants, 16 lane masks, 16 shoreline masks
plus the open-water fill, two boulders, three scatter props, the landmark prop,
and `public/assets/ui/map_ashen.png`.
"""

import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import terrain  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "assets", "tiles")
UI = os.path.join(ROOT, "public", "assets", "ui")
THEME = "ashen"


def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        raw += pixels[y * w * 4 : (y + 1) * w * 4]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        fh.write(chunk(b"IDAT", comp))
        fh.write(chunk(b"IEND", b""))


def save(name, pixels, size):
    write_png(os.path.join(OUT, f"{name}{terrain.suffix(THEME)}.png"), size, size, pixels)
    return pixels


def average(pixels, size=64, x0=20, y0=20, span=24):
    """Mean colour of a patch, ignoring transparent pixels."""
    r = g = b = n = 0
    for y in range(y0, min(size, y0 + span)):
        for x in range(x0, min(size, x0 + span)):
            i = (y * size + x) * 4
            if pixels[i + 3] < 200:
                continue
            r += pixels[i]
            g += pixels[i + 1]
            b += pixels[i + 2]
            n += 1
    if not n:
        return (0, 0, 0)
    return (r // n, g // n, b // n)


def boost(colour, factor):
    return tuple(min(255, round(c * factor)) for c in colour)


def caldera_layout():
    """The `caldera` ASCII block out of src/data/mapData.js."""
    src = open(os.path.join(ROOT, "src", "data", "mapData.js"), encoding="utf8").read()
    match = re.search(r"'caldera':\s*\[(.*?)\n  \]", src, re.S)
    if not match:
        raise SystemExit("caldera layout not found in src/data/mapData.js")
    rows = re.findall(r"^\s*'([^']*)',", match.group(1), re.M)
    if not rows:
        raise SystemExit("caldera layout parsed as empty")
    return rows


def build_thumbnail(palette, layout, cell=6):
    cols = max(len(row) for row in layout)
    width, height = cols * cell, len(layout) * cell
    out = bytearray(width * height * 4)
    spawn, base = (0xB3, 0x88, 0xFF), (0xF5, 0xC4, 0x51)
    for r, line in enumerate(layout):
        for c, ch in enumerate(line):
            if ch == "S":
                colour = spawn
            elif ch == "B":
                colour = base
            elif ch == "#":
                colour = palette["road"]
            elif ch == "~":
                colour = palette["water"]
            elif ch == "x":
                colour = palette["rock"]
            else:
                colour = palette["foliage"] if (r * 3 + c * 5) % 9 == 0 else palette["grass"]
            f = 0.92 if (r + c) % 2 else 1.0
            for y in range(r * cell, (r + 1) * cell):
                for x in range(c * cell, (c + 1) * cell):
                    i = (y * width + x) * 4
                    out[i] = min(255, round(colour[0] * f))
                    out[i + 1] = min(255, round(colour[1] * f))
                    out[i + 2] = min(255, round(colour[2] * f))
                    out[i + 3] = 255
    write_png(os.path.join(UI, f"map_{THEME}.png"), width, height, out)
    return width, height


def main():
    os.makedirs(OUT, exist_ok=True)
    count = 0

    for index, name in enumerate(("grass", "grass_2", "grass_3")):
        save(name, terrain.build_ground(THEME, index), terrain.TILE)
        count += 1
    for mask in range(16):
        save(f"road_{mask}", terrain.build_road(THEME, mask), terrain.TILE)
        save(f"water_{mask}", terrain.build_water(THEME, mask), terrain.TILE)
        count += 2
    water = save("water", terrain.build_water(THEME, 15), terrain.TILE)
    count += 1
    rock = save("rock", terrain.build_rock(THEME, 0), terrain.TILE)
    save("rock_2", terrain.build_rock(THEME, 1), terrain.TILE)
    count += 2
    for kind in terrain.DECOR_KINDS:
        save(f"decor_{kind}", terrain.build_decor(THEME, kind), terrain.DECOR)
        count += 1
    foliage = save("foliage", terrain.build_foliage(THEME), terrain.FOLIAGE)
    count += 1

    # The lane is lifted the same way the campaign thumbnails are (see
    # build_spire_assets.py): at 6 px a cell the road has to separate from the
    # ash ground, and the ashen lane measured only ~34 YCbCr apart unaided.
    palette = {
        "grass": average(save("_probe", terrain.build_ground(THEME, 0), terrain.TILE)),
        "road": boost(average(terrain.build_road(THEME, 15)), 1.25),
        "water": average(water),
        "rock": average(rock),
        "foliage": average(foliage, terrain.FOLIAGE, 16, 16, 32),
    }
    os.remove(os.path.join(OUT, f"_probe{terrain.suffix(THEME)}.png"))

    width, height = build_thumbnail(palette, caldera_layout())
    print(f"{count} tiles + foliage{terrain.suffix(THEME)}")
    print(f"map_{THEME}.png {width}x{height}  palette {palette}")


if __name__ == "__main__":
    main()
