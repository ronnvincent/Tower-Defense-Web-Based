#!/usr/bin/env python3
"""build_bridges.py — one bridge deck per biome.

A crossing used to be a road tile squashed to 60 % and laid over a water tile.
At the campaign zoom that reads as a picture of a road floating in the river:
its edges never line up with the banks, and nothing about it says *built*.

`terrain.build_bridge()` draws a real deck instead — planks, two timber
parapets with posts, dressed stone sills at both mouths and a shadow that falls
into the water. The material comes from the biome's own paved ramp and rock
ramp, so a caldera bridge is ashen stone and a grassland bridge is dark oak;
nothing looks imported.

    python3 scripts/build_bridges.py        # every biome in terrain.py

The same function is called by `build_spire_assets.py` (campaign themes) and
`build_arena_tiles.py` (duel themes), so regenerating either also refreshes its
bridges. Output is deterministic: the only randomness is seeded from the theme
name.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import terrain  # noqa: E402
from build_arena_tiles import OUT, ROOT, write_png  # noqa: E402


def build_all(themes=None):
    themes = themes or terrain.BIOMES
    written = 0
    for theme in themes:
        sfx = terrain.suffix(theme)
        path = os.path.join(OUT, f"bridge{sfx}.png")
        write_png(path, terrain.TILE, terrain.TILE, terrain.build_bridge(theme))
        print(f"  {theme:9s} bridge{sfx}.png")
        written += 1
    return written


def main(argv):
    themes = [arg for arg in argv[1:] if arg in terrain.BIOMES]
    print(f"bridges -> {os.path.relpath(OUT, ROOT)}")
    print(f"  {build_all(themes or None)} files")


if __name__ == "__main__":
    main(sys.argv)
