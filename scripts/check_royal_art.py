#!/usr/bin/env python3
"""Validate the royal defence art before it is allowed into the game.

Run after `scripts/build_royal_defences.py`:

    python3 scripts/check_royal_art.py

What it refuses to let through (Request 43, Part 5):

* a sheet that is not RGBA, or has no transparency at all;
* a weapon strip whose width is not exactly six frames, or that has an empty
  frame (an empty frame is a sprite that blinks out mid-attack);
* a base whose ink does not reach the bottom edge — `Tower` anchors bases at
  (0.5, 1) on the tile's ground line, so a floating base renders in the air;
* an upgrade tier that is a recolour: consecutive levels must change the alpha
  silhouette by a real margin, not just the palette;
* a missing dock card, projectile or effect strip.

Exit code 1 on any failure, so CI can gate the build on it.
"""

from __future__ import annotations

import os
import sys
import warnings

from PIL import Image, ImageChops

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWER_DIR = os.path.join(ROOT, "public", "assets", "towers")
PROJ_DIR = os.path.join(ROOT, "public", "assets", "projectiles")
FX_DIR = os.path.join(ROOT, "public", "assets", "fx")
UI_DIR = os.path.join(ROOT, "public", "assets", "ui")

LINES = [
    "royalArtillery",
    "siegeBallista",
    "arcaneSniper",
    "mortar",
    "rimeTower",
    "tesla",
    "skybreaker",
    "workshop",
    "obelisk",
    "spikeTrap",
]

# Only the seven shooting lines print a projectile; the workshop, obelisk and
# trap are field effects and have no shot to draw.
PROJECTILES = {
    "royalArtillery": "proj-royal-royalArtillery",
    "siegeBallista": "proj-royal-siegeBallista",
    "arcaneSniper": "proj-royal-arcaneSniper",
    "mortar": "proj-royal-mortar",
    "rimeTower": "proj-royal-rimeTower",
    "tesla": "proj-royal-tesla",
    "skybreaker": "proj-royal-skybreaker",
}

FRAME = 128
FRAMES = 6
SILHOUETTE_MIN_DIFF = 0.06      # 6% of the canvas must change shape between tiers
EMPTY_FRAME_ALPHA = 12          # ink pixels above this alpha count as "drawn"

failures: list[str] = []
warnings: list[str] = []


def fail(message: str):
    failures.append(message)


def warn(message: str):
    warnings.append(message)


def load(path: str):
    if not os.path.exists(path):
        fail(f"missing file: {os.path.relpath(path, ROOT)}")
        return None
    image = Image.open(path)
    if image.mode != "RGBA":
        fail(f"not RGBA ({image.mode}): {os.path.relpath(path, ROOT)}")
        image = image.convert("RGBA")
    return image


def alpha_mask(image: Image.Image):
    return image.getchannel("A").point(lambda value: 255 if value > EMPTY_FRAME_ALPHA else 0)


def mask_diff_ratio(a: Image.Image, b: Image.Image) -> float:
    """Share of the canvas whose coverage differs — a silhouette change."""
    diff = ImageChops.difference(alpha_mask(a), alpha_mask(b))
    changed = sum(1 for value in diff.getdata() if value > 0)
    return changed / (a.width * a.height)


def check_base(line: str, level: int):
    path = os.path.join(TOWER_DIR, f"base_{line}-l{level}.png")
    image = load(path)
    if image is None:
        return None
    if image.getchannel("A").getextrema()[0] > 0:
        fail(f"{line} L{level} base has no transparency (opaque rectangle)")
    bbox = image.getbbox()
    if not bbox:
        fail(f"{line} L{level} base is empty")
        return image
    left, top, right, bottom = bbox
    if bottom < image.height:
        fail(f"{line} L{level} base ink stops {image.height - bottom}px above the ground edge")
    # The spike trap is a plate lying on the road on purpose; every other line
    # has to stand up like a building.
    min_height = 12 if line == "spikeTrap" else 30
    if image.height < min_height:
        fail(f"{line} L{level} base is only {image.height}px tall — reads as a puddle, not a building")
    return image


def check_weapon(line: str, level: int):
    path = os.path.join(TOWER_DIR, f"weapon_{line}-l{level}.png")
    image = load(path)
    if image is None:
        return None
    if image.width != FRAME * FRAMES or image.height != FRAME:
        fail(f"{line} L{level} weapon sheet is {image.width}x{image.height}, "
             f"expected {FRAME * FRAMES}x{FRAME}")
        return image
    frames = []
    for index in range(FRAMES):
        frame = image.crop((index * FRAME, 0, (index + 1) * FRAME, FRAME))
        drawn = sum(1 for value in frame.getchannel("A").getdata() if value > EMPTY_FRAME_ALPHA)
        if drawn < 40:
            fail(f"{line} L{level} frame {index} is empty")
        frames.append(frame)
    # The release frame must differ from the rest pose: a static "explosion"
    # pasted on an idle frame is exactly what the brief forbids.
    if frames and mask_diff_ratio(frames[0], frames[3]) < 0.005:
        fail(f"{line} L{level} release frame is identical to the rest pose")
    return image


def main():
    print(f"checking {len(LINES)} royal lines\n")
    previous_bases: dict[str, Image.Image] = {}

    for line in LINES:
        for level in range(1, 6):
            base = check_base(line, level)
            check_weapon(line, level)
            if base is not None:
                key = line
                if key in previous_bases:
                    ratio = mask_diff_ratio(previous_bases[key], base)
                    if ratio < SILHOUETTE_MIN_DIFF:
                        fail(f"{line} L{level} is a recolour of L{level - 1} "
                             f"(silhouette changed {ratio * 100:.1f}%)")
                previous_bases[key] = base

        ruin = load(os.path.join(TOWER_DIR, f"ruin_{line}.png"))
        if ruin:
            if ruin.getchannel("A").getextrema()[0] > 0:
                fail(f"{line} ruin has no transparency")
            bbox = ruin.getbbox()
            if not bbox:
                fail(f"{line} ruin is empty")
            elif bbox[3] < ruin.height:
                fail(f"{line} ruin ink stops above the ground edge")

        card = load(os.path.join(UI_DIR, f"card_{line}.png"))
        if card and (card.width != 64 or card.height != 64):
            fail(f"{line} card is {card.width}x{card.height}, expected 64x64")

        impact = load(os.path.join(FX_DIR, f"fx-line-{line}-impact.png"))
        if impact:
            if impact.width != FRAME * 10 or impact.height != FRAME:
                fail(f"{line} impact strip is {impact.width}x{impact.height}, expected {FRAME * 10}x{FRAME}")
            else:
                empty = [
                    index for index in range(10)
                    if sum(1 for v in impact.crop((index * FRAME, 0, (index + 1) * FRAME, FRAME))
                           .getchannel("A").getdata() if v > EMPTY_FRAME_ALPHA) < 6
                ]
                if empty:
                    fail(f"{line} impact frames empty: {empty}")
        muzzle = load(os.path.join(FX_DIR, f"fx-line-{line}-muzzle.png"))
        if muzzle and (muzzle.width, muzzle.height) != (48, 48):
            fail(f"{line} muzzle is {muzzle.width}x{muzzle.height}, expected 48x48")
        # Only the seven shooting lines print a shot, so only they may carry a
        # trail; a field building with a streak would be an unused file.
        projectile_key = PROJECTILES.get(line)
        trail_path = os.path.join(FX_DIR, f"fx-line-{line}-trail.png")
        trail = load(trail_path) if projectile_key else None
        if not projectile_key and os.path.exists(trail_path):
            fail(f"{line} is a field building but ships a projectile trail")
        if trail:
            if (trail.width, trail.height) != (48, 48):
                fail(f"{line} trail is {trail.width}x{trail.height}, expected 48x48")
            if trail.getchannel("A").getextrema()[0] > 0:
                fail(f"{line} trail has no transparent margin")
            if trail.getchannel("A").getextrema()[1] < 120:
                fail(f"{line} trail is too faint to see (peak alpha {trail.getchannel('A').getextrema()[1]})")

        if projectile_key:
            shot = load(os.path.join(PROJ_DIR, f"{projectile_key}.png"))
            if shot:
                if shot.height < 18:
                    fail(f"{line} projectile is too short to read ({shot.height}px)")
                if shot.getchannel("A").getextrema()[0] > 0:
                    fail(f"{line} projectile has no transparent margin")
        print(f"  {line:16s} bases+sheets+card+fx+trail{'+projectile' if projectile_key else '':10s} ok")

    print()
    for message in warnings:
        print(f"WARN {message}")
    if failures:
        print()
        for message in failures:
            print(f"FAIL {message}")
        print(f"\n{len(failures)} failure(s) — the art does not pass inspection.")
        return 1
    print("All royal art passed inspection.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
