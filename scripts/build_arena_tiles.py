#!/usr/bin/env python3
"""build_arena_tiles.py — tilesets for the three mirrored duel arenas.

The PvP battlefields must not look like the campaign maps, so they get their own
palettes and their own landmarks instead of borrowing `-volcanic`, `-ice` and
`-desert`:

    -caldera   ash basalt split by magma fissures, molten "water", ember obelisk
    -glacier   bright ice sheet with crevasses, meltwater pools, serac clusters
    -oasis     bleached dune sand, ochre caravan road, turquoise pools, palms

`terrain.py` owns every palette and drawing routine; this script only decides
which files a theme needs and writes them. It is deterministic (seeds come from
the theme name), so re-running it produces byte-identical PNGs.

    python3 scripts/build_arena_tiles.py            # all three themes
    python3 scripts/build_arena_tiles.py glacier    # just one

Needs no third-party packages: the PNG encoder below is the same one the Spire
builder uses.
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

GROUND_NAMES = ("grass", "grass_2", "grass_3")
DECOR_KINDS = ("tuft", "bloom", "shard")
ARENA_THEMES = ("caldera", "glacier", "oasis")


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


def build_theme(theme):
    sfx = terrain.suffix(theme)
    written = 0

    def save(name, pixels, size):
        write_png(os.path.join(OUT, f"{name}{sfx}.png"), size, size, pixels)

    for index, name in enumerate(GROUND_NAMES):
        save(name, terrain.build_ground(theme, index), terrain.TILE)
        written += 1

    for mask in range(16):
        save(f"road_{mask}", terrain.build_road(theme, mask), terrain.TILE)
        save(f"water_{mask}", terrain.build_water(theme, mask), terrain.TILE)
        written += 2

    save("water", terrain.build_water(theme, 15), terrain.TILE)
    save("rock", terrain.build_rock(theme, 0), terrain.TILE)
    save("rock_2", terrain.build_rock(theme, 1), terrain.TILE)
    save("foliage", terrain.build_foliage(theme), terrain.FOLIAGE)
    written += 4

    for kind in DECOR_KINDS:
        save(f"decor_{kind}", terrain.build_decor(theme, kind), terrain.DECOR)
        written += 1

    print(f"  {theme:8s} {sfx:10s} {written:3d} tiles")
    return written


def main(argv):
    themes = [arg for arg in argv[1:] if arg in ARENA_THEMES] or list(ARENA_THEMES)
    print(f"arena tiles -> {os.path.relpath(OUT, ROOT)}")
    total = 0
    for theme in themes:
        total += build_theme(theme)
    print(f"  {total} files")


if __name__ == "__main__":
    main(sys.argv)
