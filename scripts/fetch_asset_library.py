#!/usr/bin/env python3
"""
fetch_asset_library.py — rebuild the free art library used for reference.

The game itself only ships the tiles it draws (see `public/assets/tiles`), but
choosing which tiles to promote needs the whole pack on disk. This script pulls
the licence-checked selection from the `Tiddybub/2d-assets` GitHub mirror into
`../asset-library/` (outside the repository, so 26 MB of raw packs never reach
git) and writes the pack index.

    python3 scripts/fetch_asset_library.py
    python3 scripts/fetch_asset_library.py --dest ~/asset-library --list

Why a mirror: the build sandbox has an egress allowlist. `kenney.nl`,
`opengameart.org` and `itch.io` resolve but their TLS handshakes are dropped, so
the original hosts are unreachable; `github.com` is. The mirror keeps each
pack's upstream `SOURCE.md` (source URL, licence, credit) beside the art, and
that file is copied through untouched — the licence is the upstream one, not
something this script decides.

Every pack here is CC0 (Kenney: CC0-1.0, OpenGameArt: CC0): commercial use,
no attribution required.

Requires `git` and network access to github.com. It does **not** need Pillow.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request

MIRROR = "https://github.com/Tiddybub/2d-assets.git"
CATALOG = "https://api.github.com/repos/Tiddybub/2d-assets/contents/catalog.json"

# (path inside the mirror, folder name in the library)
PACKS = [
    ("misc/tower-defense-top-down", "kenney-tower-defense-top-down"),
    ("tiles-terrain/map-pack", "kenney-map-pack"),
    ("fantasy/medieval-rts", "kenney-medieval-rts"),
    ("nature/foliage-pack", "kenney-foliage-pack"),
    ("effects/foliage-sprites", "kenney-foliage-sprites"),
    ("ui/game-icons-expansion", "kenney-game-icons-expansion"),
    ("ui/oga-modified-and-cliped-magic-skill-item-icons", "oga-magic-skill-icons"),
    ("ui/oga-osare-weapon-icons", "oga-osare-weapon-icons"),
    ("effects/splat-pack", "kenney-splat-pack"),
    ("effects/oga-cracked-tiles-flare-tileset", "oga-flare-cracked-tiles"),
    ("fantasy/micro-roguelike", "kenney-micro-roguelike"),
]

# Folders inside a pack that are the same art at another size, or source files
# in a format the game cannot load. Dropping them is what keeps 26 MB from
# becoming 90.
DROP_DIRS = {
    "retina",
    "vector",
    "tif_sources_unpacked",
    "tif sources",
    "monochrome",
    "playdate pulp",
}

# Everything the game might slice, plus the licence/credit files that have to
# travel with it.
KEEP_EXT = {".png", ".jpg", ".jpeg", ".md", ".txt", ".xml", ".json"}


def run(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd)}\n{result.stderr.strip()}")
    return result.stdout


def clone(workdir):
    """Blobless sparse clone: the pack list is fetched, the art is not."""
    if os.path.isdir(os.path.join(workdir, ".git")):
        return
    os.makedirs(os.path.dirname(workdir) or ".", exist_ok=True)
    print(f"cloning {MIRROR} (blobless)…")
    run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", MIRROR, workdir])


def fetch(workdir, paths):
    """Materialise only the requested pack directories."""
    with open(os.path.join(workdir, ".fetch-patterns"), "w") as fh:
        for path in paths:
            fh.write(path + "\n")
    print(f"checking out {len(paths)} packs…")
    with open(os.path.join(workdir, ".fetch-patterns"), "rb") as stdin:
        result = subprocess.run(
            ["git", "sparse-checkout", "set", "--no-cone", "--stdin"],
            cwd=workdir,
            stdin=stdin,
            capture_output=True,
            text=True,
        )
    if result.returncode != 0:
        sys.exit(f"sparse-checkout failed:\n{result.stderr.strip()}")


def catalog():
    """The mirror's pack index: title, licence, credit and upstream URL."""
    try:
        request = urllib.request.Request(CATALOG, headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
        import base64

        raw = json.loads(base64.b64decode(payload["content"]).decode("utf-8"))
        return {entry["path"]: entry for entry in raw["assets"]}
    except Exception as error:  # noqa: BLE001 - offline still copies the art
        print(f"  (catalog unavailable: {error}; writing what the tree says)")
        return {}


def copy_pack(src, dst):
    files = 0
    size = 0
    for root, dirs, names in os.walk(src):
        dirs[:] = [d for d in dirs if d.lower() not in DROP_DIRS]
        rel = os.path.relpath(root, src)
        for name in names:
            if os.path.splitext(name)[1].lower() not in KEEP_EXT:
                continue
            source = os.path.join(root, name)
            target = os.path.join(dst, rel, name) if rel != "." else os.path.join(dst, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(source, target)
            files += 1
            size += os.path.getsize(source)
    return files, size


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dest",
        default=os.path.join(here, "..", "asset-library"),
        help="library folder (default: ../asset-library, outside the repo)",
    )
    parser.add_argument("--list", action="store_true", help="print the pack table and exit")
    parser.add_argument(
        "--keep-mirror",
        action="store_true",
        help="keep the 1.4 GB mirror checkout under /tmp instead of deleting it",
    )
    args = parser.parse_args()
    dest = os.path.abspath(args.dest)
    work = "/tmp/2d-assets-mirror"

    if args.list:
        for path, name in PACKS:
            print(f"{name:34s} <- {path}")
        return

    clone(work)
    fetch(work, [path for path, _ in PACKS])
    meta = catalog()

    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest, exist_ok=True)

    index = []
    total_files = 0
    total_bytes = 0
    for path, name in PACKS:
        src = os.path.join(work, path)
        if not os.path.isdir(src):
            print(f"  MISSING {path} (skipped)")
            continue
        files, size = copy_pack(src, os.path.join(dest, name))
        total_files += files
        total_bytes += size
        entry = meta.get(path, {})
        index.append(
            {
                "folder": name,
                "mirrorPath": path,
                "title": entry.get("title"),
                "source": "OpenGameArt"
                if "opengameart" in (entry.get("source_page") or "")
                else "Kenney",
                "license": entry.get("license"),
                "credit": entry.get("credit"),
                "url": entry.get("source_page"),
                "files": files,
                "bytes": size,
            }
        )
        print(f"  {name:34s} {files:5d} files {size / 1e6:7.2f} MB")

    with open(os.path.join(dest, "index.json"), "w") as fh:
        json.dump({"mirror": MIRROR, "packs": index}, fh, indent=1)

    print(f"\nlibrary -> {dest}")
    print(f"  {total_files} files, {total_bytes / 1e6:.1f} MB across {len(index)} packs")

    if not args.keep_mirror:
        shutil.rmtree(work, ignore_errors=True)
        print("  mirror checkout removed (pass --keep-mirror to keep it)")


if __name__ == "__main__":
    main()
