#!/usr/bin/env python3
"""Fetch the Kenney effect sources used by `build_fx_assets.py`.

The game's defences needed a real effects library: the Spire pack ships nine
small impact strips and nothing else, so every hit looked like a puff of the
same smoke. Kenney's Explosion Pack and Particle Pack are CC0 and cover exactly
that gap — five explosion animations, muzzle flashes, sparks, smoke, magic,
rings and ground scorch.

Nothing here is loaded by the game directly. The raw frames land in
`src/assets/kenney/fx/` only so the shipped atlases can be rebuilt pixel-exactly
later; `scripts/build_fx_assets.py` downsamples and packs them into
`public/assets/fx/`.

Provenance is pinned:

    repo   shorepine/kenney  (mirror of kenney.nl, every file CC0)
    commit 3694c6879e487c108f55677be7dd2ca75b07cc3b
    packs  2d/Explosion Pack, 2d/Particle Pack

Usage:
    python3 scripts/fetch_kenney_fx.py            # download everything missing
    python3 scripts/fetch_kenney_fx.py --force    # refresh every file
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse

REPO = "shorepine/kenney"
COMMIT = "3694c6879e487c108f55677be7dd2ca75b07cc3b"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "assets", "kenney")

EXPLOSION = "2d/Explosion Pack"
PARTICLES = "2d/Particle Pack/PNG (Transparent)"

# Source path -> local file name. The names are what `build_fx_assets.py`
# expects, so the build never has to guess Kenney's numbering.
SOURCES: list[tuple[str, str]] = []

for idx in range(9):
    n = f"{idx:02d}"
    SOURCES += [
        (f"{EXPLOSION}/Regular explosion/regularExplosion{n}.png", f"blast-{n}.png"),
        (f"{EXPLOSION}/Simple explosion/simpleExplosion{n}.png", f"ember-{n}.png"),
        (f"{EXPLOSION}/Sonic explosion/sonicExplosion{n}.png", f"arcane-{n}.png"),
        (f"{EXPLOSION}/Pixel explosion/pixelExplosion{n}.png", f"pixel-{n}.png"),
        (f"{EXPLOSION}/Ground explosion/groundExplosion{n}.png", f"ground-{n}.png"),
    ]

# Particle singles: emitters in the game pick these by role, not by index, so
# the local names describe what the texture is *for*.
SOURCES += [
    (f"{PARTICLES}/muzzle_02.png", "muzzle.png"),
    (f"{PARTICLES}/muzzle_04.png", "muzzle-wide.png"),
    (f"{PARTICLES}/fire_02.png", "fire.png"),
    (f"{PARTICLES}/flame_03.png", "flame.png"),
    (f"{PARTICLES}/spark_04.png", "spark.png"),
    (f"{PARTICLES}/spark_06.png", "spark-soft.png"),
    (f"{PARTICLES}/star_05.png", "star.png"),
    (f"{PARTICLES}/circle_03.png", "ring.png"),
    (f"{PARTICLES}/light_02.png", "light.png"),
    (f"{PARTICLES}/magic_03.png", "magic.png"),
    (f"{PARTICLES}/magic_05.png", "magic-rune.png"),
    (f"{PARTICLES}/smoke_05.png", "smoke.png"),
    (f"{PARTICLES}/smoke_09.png", "smoke-light.png"),
    (f"{PARTICLES}/trace_04.png", "trace.png"),
    (f"{PARTICLES}/twirl_02.png", "twirl.png"),
    (f"{PARTICLES}/dirt_02.png", "dirt.png"),
    (f"{PARTICLES}/scorch_01.png", "scorch.png"),
    (f"{PARTICLES}/symbol_01.png", "symbol.png"),
]

LICENCE = """Kenney effect sources (CC0 1.0 Universal)
==========================================

Files in this folder come from the Kenney asset library, downloaded from the
mirror https://github.com/shorepine/kenney at commit
{commit}, packs "2d/Explosion Pack" and "2d/Particle Pack".

Created/distributed by Kenney (www.kenney.nl). License: Creative Commons Zero
(CC0 1.0 Universal) - https://creativecommons.org/publicdomain/zero/1.0/

You can use this content for personal, educational and commercial purposes.
Crediting 'Kenney' or 'www.kenney.nl' is appreciated but not required.
This project credits Kenney in the README and in docs/asset-integration.md.

The files here are the raw source frames only. The game loads the packed
atlases in public/assets/fx/, rebuilt by scripts/build_fx_assets.py.
""".format(commit=COMMIT)


def fetch(source_path: str, destination: str) -> None:
    url = "repos/{repo}/contents/{path}?ref={commit}".format(
        repo=REPO,
        path=urllib.parse.quote(source_path),
        commit=COMMIT,
    )
    result = subprocess.run(
        ["gh", "api", url, "-H", "Accept: application/vnd.github.raw"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        raise SystemExit(f"failed to fetch {source_path}: {result.stderr.decode()[:200]}")
    with open(destination, "wb") as handle:
        handle.write(result.stdout)


def main() -> int:
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    fetched = skipped = 0
    for source_path, name in SOURCES:
        destination = os.path.join(OUT, name)
        if os.path.exists(destination) and not force:
            skipped += 1
            continue
        fetch(source_path, destination)
        fetched += 1
        print(f"  {name:16s} <- {source_path}")
    with open(os.path.join(OUT, "LICENSE-CC0.txt"), "w", encoding="utf-8") as handle:
        handle.write(LICENCE)
    with open(os.path.join(OUT, "PROVENANCE.json"), "w", encoding="utf-8") as handle:
        json.dump(
            {
                "repo": REPO,
                "commit": COMMIT,
                "license": "CC0-1.0",
                "files": {name: path for path, name in SOURCES},
            },
            handle,
            indent=2,
        )
        handle.write("\n")
    print(f"fetched {fetched}, already present {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
