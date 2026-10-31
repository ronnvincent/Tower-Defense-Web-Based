#!/usr/bin/env python3
"""build_village_tiles.py — the Havenbrook tile set.

`terrain.py` owns every palette and every drawing routine; this script only
decides which files the village theme needs and writes them, exactly the way
`build_ashen_tiles.py` does for the caldera.

    -village   mown spring meadow, laid cobble streets, a limestone field wall,
               daisies in the verge and an orchard broadleaf as the landmark

It writes 52 files — three ground variants, 16 lane masks, 16 shoreline masks
plus the open-water fill, two boulders, three scatter props, the landmark and
the bridge deck — and nothing else: the suffix keeps it away from every other
biome's art.

The world-map thumbnail is built by `scripts/build_village_thumb.mjs`, which
reads the board straight out of `src/data/mapData.js`; re-deriving the layout
here would let the picture and the battlefield drift apart.

    python3 scripts/build_village_tiles.py
"""

import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import terrain  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "assets", "tiles")
THEME = "village"


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
    save("water", terrain.build_water(THEME, 15), terrain.TILE)
    save("rock", terrain.build_rock(THEME, 0), terrain.TILE)
    save("rock_2", terrain.build_rock(THEME, 1), terrain.TILE)
    save("foliage", terrain.build_foliage(THEME), terrain.FOLIAGE)
    save("bridge", terrain.build_bridge(THEME), terrain.TILE)
    count += 5
    for kind in ("tuft", "bloom", "shard"):
        save(f"decor_{kind}", terrain.build_decor(THEME, kind), terrain.DECOR)
        count += 1

    print(f"wrote {count} village tiles to public/assets/tiles (suffix {terrain.suffix(THEME)})")


if __name__ == "__main__":
    main()
