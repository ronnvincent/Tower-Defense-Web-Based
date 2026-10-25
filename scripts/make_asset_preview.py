#!/usr/bin/env python3
"""
make_asset_preview.py — render docs/asset-integration/asset-preview.png.

The preview is generated, never hand-composed: it reads `src/data/towerVisuals.js`
for the slot geometry, then composites each tower exactly the way `Tower.js` does
(base bottom-aligned on the tile, weapon pinned to its pivot at `mount` px above
the ground line). Changing a mount value and re-running the asset builder is
enough to keep this sheet honest.

    python3 scripts/make_asset_preview.py
"""
from __future__ import annotations

import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - dev tooling only
    sys.exit("Pillow is required: python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWERS = os.path.join(ROOT, "public", "assets", "towers")
UI = os.path.join(ROOT, "public", "assets", "ui")
ENEMIES = os.path.join(ROOT, "public", "assets", "enemies")
OUT = os.path.join(ROOT, "docs", "asset-integration", "asset-preview.png")

TILE = 64
BG = (26, 33, 51, 255)
PANEL = (32, 41, 62, 255)
GOLD = (240, 196, 81, 255)
INK = (222, 229, 240, 255)
DIM = (140, 155, 178, 255)

LINES = [
    ("ARCHER", "archer"),
    ("IRON CROSSBOW", "crossbow"),
    ("CLOCKWORK REPEATER", "gatling"),
    ("PITCHFIRE SIPHON", "flamer"),
    ("VENOM STILL", "venom"),
    ("HARPOON WINCH", "harpoon"),
    ("CANNON", "cannon"),
    ("FROST", "frost"),
    ("HAMMERFORGE", "forge"),
    ("RUNESTONE", "runes"),
    ("BANNER KEEP", "banner"),
]
SLOTS = ["lvl1", "lvl2", "spec-a", "spec-b"]

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
def font(size, bold=False):
    path = os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def read_slot_layout():
    """Same contract the asset builder parses: literal `{ file: ... }` entries."""
    src = open(os.path.join(ROOT, "src", "data", "towerVisuals.js")).read()
    layout = {}
    for m in re.finditer(
        r"\{ file: '([\w-]+)', base: '([\w.-]+)', weapon: '([\w.-]+)', "
        r"fw: (\d+), fh: (\d+), frames: (\d+), px: (\d+), py: (\d+), mount: (\d+)",
        src,
    ):
        layout[m.group(1)] = {
            "base": m.group(2),
            "weapon": m.group(3),
            "fw": int(m.group(4)),
            "fh": int(m.group(5)),
            "frames": int(m.group(6)),
            "px": int(m.group(7)),
            "py": int(m.group(8)),
            "mount": int(m.group(9)),
        }
    # The engineer lines live in their own generated manifest (their slots are
    # 128 px weapon frames with measured pivots), so fold them into the same map.
    engineer_src = open(os.path.join(ROOT, "src", "data", "engineerTowerArt.js")).read()
    for line, body in re.findall(r"  (\w+): \{\n(.*?)\n  \},", engineer_src, re.S):
        for m in re.finditer(
            r"'([\w-]+)': \{ base: '([\w.-]+)', weapon: '([\w.-]+)', fw: (\d+), fh: (\d+), "
            r"frames: (\d+), px: (\d+), py: (\d+), mount: (\d+)",
            body,
        ):
            slot_name = m.group(1)
            # Level 1 is keyed by the line alone, exactly like the keep slots.
            layout[line if slot_name == "lvl1" else f"{line}-{slot_name}"] = {
                "base": m.group(2),
                "weapon": m.group(3),
                "fw": int(m.group(4)),
                "fh": int(m.group(5)),
                "frames": int(m.group(6)),
                "px": int(m.group(7)),
                "py": int(m.group(8)),
                "mount": int(m.group(9)),
            }
    return layout


def compose_slot(slot, height=190):
    """Return a 96×height tile with the tower placed the way the game does."""
    canvas = Image.new("RGBA", (96, height), (0, 0, 0, 0))
    ground = height - 26
    base = Image.open(os.path.join(TOWERS, slot["base"])).convert("RGBA")
    canvas.alpha_composite(base, ((96 - base.width) // 2, ground - base.height))
    weapon = Image.open(os.path.join(TOWERS, slot["weapon"])).convert("RGBA")
    frame = weapon.crop((0, 0, slot["fw"], slot["fh"]))
    pivot_x = 48 - slot["px"]
    pivot_y = ground - slot["mount"] - slot["py"]
    canvas.alpha_composite(frame, (pivot_x, pivot_y))
    return canvas, base


def main():
    layout = read_slot_layout()
    width, margin = 1181, 40
    row_h, slot_w = 250, 220
    body = Image.new("RGBA", (width, 3000), BG)
    draw = ImageDraw.Draw(body)
    y = 24

    draw.text((margin - 20, y), "Spire asset integration — towers, barricades, enemies, shots",
              font=font(26, True), fill=GOLD)
    y += 46

    for title, key in LINES:
        draw.text((margin - 20, y), title, font=font(20, True), fill=GOLD)
        y += 30
        draw.rounded_rectangle([margin - 20, y, width - margin + 20, y + row_h],
                               radius=10, fill=PANEL)
        for i, slot_name in enumerate(SLOTS):
            v = layout[f"{key}" if slot_name == "lvl1" else f"{key}-{slot_name}"]
            art, base = compose_slot(v)
            x = margin + 10 + i * slot_w
            body.alpha_composite(art, (x, y + 12))
            label = f"{slot_name} · {v['frames']}f · m{v['mount']} · {base.width}×{base.height}"
            draw.text((x, y + row_h - 26), label, font=font(13), fill=DIM)
        y += row_h + 14

    # ------------------------------------------------------------ palisade + cards
    draw.text((margin - 20, y), "PALISADE + HUD CARDS", font=font(20, True), fill=GOLD)
    y += 30
    draw.rounded_rectangle([margin - 20, y, width - margin + 20, y + 150], radius=10, fill=PANEL)
    for i, name in enumerate(["barricade.png", "barricade_lvl2.png"]):
        art = Image.open(os.path.join(TOWERS, name)).convert("RGBA")
        body.alpha_composite(art, (margin + 20 + i * 90, y + 20))
        draw.text((margin + 8 + i * 90, y + 104),
                  "L1 wood" if i == 0 else "L2 iron", font=font(13), fill=DIM)
    for i, key in enumerate(["archer", "crossbow", "gatling", "flamer", "venom", "harpoon", "cannon", "frost", "barricade", "forge", "runes", "banner"]):
        card = Image.open(os.path.join(UI, f"card_{key}.png")).convert("RGBA")
        x = margin + 210 + i * 84
        body.alpha_composite(card, (x, y + 20))
        draw.text((x - 6, y + 96), key, font=font(13), fill=DIM)
    y += 164

    # ------------------------------------------------------------------- enemies
    manifest = open(os.path.join(ROOT, "src", "data", "spireManifest.js")).read()
    manifest = manifest.split("IMPACT_SHEETS")[0]  # only the enemy block
    entries = re.findall(
        r"'?(?!enemies)(\w+)'?: \{\s*file: '([\w.-]+)',\s*frameWidth: (\d+),\s*frameHeight: (\d+),",
        manifest,
    )
    draw.text((margin - 20, y), "ENEMIES (move frame · sheet frames)", font=font(20, True), fill=GOLD)
    y += 34
    draw.rounded_rectangle([margin - 20, y, width - margin + 20, y + 300], radius=10, fill=PANEL)
    for i, (key, file, fw, fh) in enumerate(entries):
        sheet = Image.open(os.path.join(ENEMIES, file)).convert("RGBA")
        frame = sheet.crop((0, 0, int(fw), int(fh)))  # idle, first colour variant
        frame.thumbnail((92, 92), Image.NEAREST)
        x = margin + 10 + (i % 4) * 280
        yy = y + 16 + (i // 4) * 140
        body.alpha_composite(frame, (x + 20, yy))
        cols = sheet.width // int(fw)
        draw.text((x, yy + 104), f"{key}  {fw}×{fh}  {cols} cols",
                  font=font(13), fill=INK)
    y += 316

    preview = body.crop((0, 0, width, y + 20))
    preview.convert("RGB").save(OUT, optimize=True)
    print(f"  {os.path.relpath(OUT, ROOT)}  {preview.width}x{preview.height}")


if __name__ == "__main__":
    main()
