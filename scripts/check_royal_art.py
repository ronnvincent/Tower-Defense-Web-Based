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
* an upgrade tier that is a recolour: consecutive tiers must change the alpha
  silhouette by a real margin, not just the palette;
* a branch that is a recolour of the other branch: the two level-3 buildings,
  wrecks, effects and shots must all be different drawings;
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
BRANCH_MIN_DIFF = 0.04          # 4% of the canvas must change shape between branches

# The eight art slots. Branch A is the line's own machine at L3/L4/L5, branch B
# the second machine; both ladders are drawn from the same generator run.
SLOTS = {
    "spec-a": (3, "a"), "spec-a2": (4, "a"), "spec-a3": (5, "a"),
    "spec-b": (3, "b"), "spec-b2": (4, "b"), "spec-b3": (5, "b"),
}
BRANCH_LADDER = {
    "a": ["lvl1", "lvl2", "spec-a", "spec-a2", "spec-a3"],
    "b": ["spec-b", "spec-b2", "spec-b3"],
}
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


def slot_suffix(slot: str, level: int, variant: str) -> str:
    return f"l{level}" if variant == "a" else f"b{level - 2}"


def check_base(line: str, slot: str, level: int, variant: str):
    suffix = slot_suffix(slot, level, variant)
    path = os.path.join(TOWER_DIR, f"base_{line}-{suffix}.png")
    image = load(path)
    if image is None:
        return None
    label = f"{line} {slot} ({suffix})"
    if image.getchannel("A").getextrema()[0] > 0:
        fail(f"{label} base has no transparency (opaque rectangle)")
    bbox = image.getbbox()
    if not bbox:
        fail(f"{label} base is empty")
        return image
    left, top, right, bottom = bbox
    if bottom < image.height:
        fail(f"{label} base ink stops {image.height - bottom}px above the ground edge")
    # The spike trap is a plate lying on the road on purpose; every other line
    # has to stand up like a building.
    min_height = 12 if line == "spikeTrap" else 30
    if image.height < min_height:
        fail(f"{label} base is only {image.height}px tall — reads as a puddle, not a building")
    return image


def check_weapon(line: str, slot: str, level: int, variant: str):
    suffix = slot_suffix(slot, level, variant)
    path = os.path.join(TOWER_DIR, f"weapon_{line}-{suffix}.png")
    image = load(path)
    if image is None:
        return None
    label = f"{line} {slot} ({suffix})"
    if image.width != FRAME * FRAMES or image.height != FRAME:
        fail(f"{label} weapon sheet is {image.width}x{image.height}, "
             f"expected {FRAME * FRAMES}x{FRAME}")
        return image
    frames = []
    for index in range(FRAMES):
        frame = image.crop((index * FRAME, 0, (index + 1) * FRAME, FRAME))
        drawn = sum(1 for value in frame.getchannel("A").getdata() if value > EMPTY_FRAME_ALPHA)
        if drawn < 40:
            fail(f"{label} frame {index} is empty")
        frames.append(frame)
    # The release frame must differ from the rest pose: a static "explosion"
    # pasted on an idle frame is exactly what the brief forbids.
    if frames and mask_diff_ratio(frames[0], frames[3]) < 0.005:
        fail(f"{label} release frame is identical to the rest pose")
    return image


def align_bottom_center(images: list[Image.Image]) -> list[Image.Image]:
    """Put drawings on one canvas the way the game does: bottom-centre, unstretched.

    A taller tier is drawn on a taller sheet; stretching one onto the other would
    invent or erase shape and make the silhouette test lie in both directions.
    """
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    aligned = []
    for image in images:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((width - image.width) // 2, height - image.height))
        aligned.append(canvas)
    return aligned


def check_pair(a: Image.Image | None, b: Image.Image | None, what: str, minimum: float):
    """Refuse a second drawing that is only a palette swap of the first."""
    if a is None or b is None:
        return
    a, b = align_bottom_center([a, b])
    ratio = mask_diff_ratio(a, b)
    if ratio < minimum:
        fail(f"{what} is a recolour (silhouette changed {ratio * 100:.1f}%, "
             f"needs {minimum * 100:.0f}%)")


def main():
    print(f"checking {len(LINES)} royal lines × 2 branches\n")
    previous_bases: dict[str, Image.Image] = {}

    for line in LINES:
        bases: dict[str, Image.Image | None] = {}
        for slot, (level, variant) in SLOTS.items():
            bases[slot] = check_base(line, slot, level, variant)
            check_weapon(line, slot, level, variant)
            if level == 3 and variant == "a":
                bases.setdefault("lvl1", load(os.path.join(TOWER_DIR, f"base_{line}-l1.png")))
        # The shared tiers.
        for slot, level in (("lvl1", 1), ("lvl2", 2)):
            bases[slot] = check_base(line, slot, level, "a")
            check_weapon(line, slot, level, "a")

        # Within each branch, every tier must be a different building.
        for ladder in BRANCH_LADDER.values():
            for lower, higher in zip(ladder, ladder[1:]):
                check_pair(bases.get(lower), bases.get(higher), f"{line} {higher} vs {lower}",
                           SILHOUETTE_MIN_DIFF)
        # And the two branches must not be the same drawing in a new palette.
        check_pair(bases.get("spec-a"), bases.get("spec-b"), f"{line} branch B vs branch A",
                   BRANCH_MIN_DIFF)
        check_pair(bases.get("spec-a3"), bases.get("spec-b3"), f"{line} branch B L5 vs branch A L5",
                   BRANCH_MIN_DIFF)

        ruin = load(os.path.join(TOWER_DIR, f"ruin_{line}.png"))
        ruin_b = load(os.path.join(TOWER_DIR, f"ruin_{line}-b.png"))
        if ruin_b is None:
            fail(f"{line} branch B has no wreck (ruin_{line}-b.png)")
        for label, wreck in ((f"{line} ruin", ruin), (f"{line} branch-B ruin", ruin_b)):
            if not wreck:
                continue
            if wreck.getchannel("A").getextrema()[0] > 0:
                fail(f"{label} has no transparency")
            bbox = wreck.getbbox()
            if not bbox:
                fail(f"{label} is empty")
            elif bbox[3] < wreck.height:
                fail(f"{label} ink stops above the ground edge")
        check_pair(ruin, ruin_b, f"{line} branch-B ruin vs branch-A ruin", BRANCH_MIN_DIFF)

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
        impact_b = load(os.path.join(FX_DIR, f"fx-line-{line}-b-impact.png"))
        if impact_b:
            if impact_b.width != FRAME * 10 or impact_b.height != FRAME:
                fail(f"{line} branch-B impact strip is {impact_b.width}x{impact_b.height}, "
                     f"expected {FRAME * 10}x{FRAME}")
            else:
                empty = [
                    index for index in range(10)
                    if sum(1 for v in impact_b.crop((index * FRAME, 0, (index + 1) * FRAME, FRAME))
                           .getchannel("A").getdata() if v > EMPTY_FRAME_ALPHA) < 6
                ]
                if empty:
                    fail(f"{line} branch-B impact frames empty: {empty}")
            check_pair(impact, impact_b, f"{line} branch-B impact vs branch-A impact", BRANCH_MIN_DIFF)

        muzzle = load(os.path.join(FX_DIR, f"fx-line-{line}-muzzle.png"))
        if muzzle and (muzzle.width, muzzle.height) != (48, 48):
            fail(f"{line} muzzle is {muzzle.width}x{muzzle.height}, expected 48x48")
        muzzle_b = load(os.path.join(FX_DIR, f"fx-line-{line}-b-muzzle.png"))
        if muzzle_b:
            if (muzzle_b.width, muzzle_b.height) != (48, 48):
                fail(f"{line} branch-B muzzle is {muzzle_b.width}x{muzzle_b.height}, expected 48x48")
            check_pair(muzzle, muzzle_b, f"{line} branch-B muzzle vs branch-A muzzle", BRANCH_MIN_DIFF)
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
            trail_b = load(os.path.join(FX_DIR, f"fx-line-{line}-b-trail.png"))
            if trail_b is None:
                fail(f"{line} branch B has no trail although the line shoots")
            else:
                if (trail_b.width, trail_b.height) != (48, 48):
                    fail(f"{line} branch-B trail is {trail_b.width}x{trail_b.height}, expected 48x48")
                if trail_b.getchannel("A").getextrema()[1] < 120:
                    fail(f"{line} branch-B trail is too faint to see")
                check_pair(trail, trail_b, f"{line} branch-B trail vs branch-A trail", BRANCH_MIN_DIFF)

        if projectile_key:
            shot = load(os.path.join(PROJ_DIR, f"{projectile_key}.png"))
            if shot:
                if shot.height < 18:
                    fail(f"{line} projectile is too short to read ({shot.height}px)")
                if shot.getchannel("A").getextrema()[0] > 0:
                    fail(f"{line} projectile has no transparent margin")
            from_b = load(os.path.join(PROJ_DIR, f"{projectile_key}-b.png"))
            heavy_a = load(os.path.join(PROJ_DIR, f"{projectile_key}-2.png"))
            heavy_b = load(os.path.join(PROJ_DIR, f"{projectile_key}-b2.png"))
            for label, image in (("branch-B shot", from_b), ("tier-4/5 shot", heavy_a),
                                 ("tier-4/5 branch-B shot", heavy_b)):
                if image is None:
                    fail(f"{line} has no {label}")
                elif image.getchannel("A").getextrema()[0] > 0:
                    fail(f"{line} {label} has no transparent margin")
            check_pair(shot, from_b, f"{line} branch-B shot vs branch-A shot", BRANCH_MIN_DIFF)
            check_pair(from_b, heavy_b, f"{line} tier-4/5 branch-B shot vs its level-3 shot",
                       SILHOUETTE_MIN_DIFF)
        print(f"  {line:16s} 8 slots + 2 wrecks + A/B effects{'+projectiles' if projectile_key else '':14s} ok")

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
