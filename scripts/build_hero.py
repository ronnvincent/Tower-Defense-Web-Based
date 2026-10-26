#!/usr/bin/env python3
"""
build_hero.py — the Bastion Vanguard sprite strip.

WHY THIS EXISTS
---------------
Every creature sheet in `public/assets/enemies/` is a hostile: there is no
friendly soldier anywhere in the art library, and the licence-clean packs that
are reachable from this build box (Kenney, OGA, FLARE) have no painted knight in
the same 3/4 view. Rather than repaint an enemy sheet and call it a hero — which
would read as a bug on the battlefield — the Vanguard is drawn here, in the same
"Obsidian & Gold" palette as the interface kit, at exactly one frame size.

Layout: 4 frames of 96x112 in a single 384x112 strip (frame 0 is the idle pose,
frames 1-3 are the walk cycle, played at 8 fps while the hero has a move order).
Drawn at 4x and downsampled once, so the outline stays smooth at 1x; there is no
RNG, so rebuilding is byte identical.

    python3 scripts/build_hero.py --preview /tmp/hero.png
"""
from __future__ import annotations

import argparse
import os

from PIL import Image, ImageDraw

# --------------------------------------------------------------- palette

INK = (10, 12, 16, 255)
STEEL_HI = (186, 198, 214, 255)
STEEL = (140, 152, 170, 255)
STEEL_LO = (92, 103, 120, 255)
STEEL_DK = (58, 66, 80, 255)
GOLD_HI = (255, 226, 150, 255)
GOLD = (228, 178, 74, 255)
GOLD_LO = (150, 108, 34, 255)
CRIMSON = (156, 40, 36, 255)
CRIMSON_LO = (104, 24, 24, 255)
CRIMSON_HI = (198, 68, 56, 255)
WOOD = (104, 74, 46, 255)
SKIN = (206, 160, 118, 255)
SHADOW = (0, 0, 0, 90)

S = 4  # supersample factor
FW, FH = 96, 112  # one frame at 1x
FRAMES = 4


def rect(draw, box, fill, outline=INK, width=1):
    draw.rectangle(box, fill=fill, outline=outline, width=width)


def rrect(draw, box, radius, fill, outline=INK, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def poly(draw, points, fill, outline=INK, width=1):
    draw.polygon(points, fill=fill)
    if outline is not None:
        draw.line(list(points) + [points[0]], fill=outline, width=width, joint="curve")


def sxy(x, y):
    return x * S, y * S


def scaled(box):
    x0, y0, x1, y1 = box
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def pts(points):
    return [(x * S, y * S) for x, y in points]


def draw_hero(draw, step):
    """One frame. `step` shifts the legs and the cape so the cycle reads."""
    lift = (0, -2, 0, 2)[step]
    cape_sway = (0, 2, 3, 1)[step]

    # --- shadow ---------------------------------------------------------
    draw.ellipse(scaled((24, 100, 74, 110)), fill=SHADOW)

    # --- cape (behind everything) --------------------------------------
    poly(
        draw,
        pts(
            [
                (34, 46),
                (66, 46),
                (68 + cape_sway, 96),
                (54 + cape_sway, 92),
                (46 + cape_sway, 98),
                (30 + cape_sway, 92),
            ]
        ),
        CRIMSON_LO,
        INK,
        2 * S,
    )
    poly(draw, pts([(36, 48), (64, 48), (64, 88), (50, 90), (36, 86)]), CRIMSON, None)

    # --- legs -----------------------------------------------------------
    for i, x0 in enumerate((38, 52)):
        off = lift if i == 0 else -lift
        rect(draw, scaled((x0, 78, x0 + 10, 98 - off)), STEEL_LO, INK, 2 * S)
        rrect(draw, scaled((x0 - 1, 94 - off, x0 + 11, 101 - off)), 3 * S, INK, INK, 1)
        rect(draw, scaled((x0 + 1, 96 - off, x0 + 9, 99 - off)), STEEL_DK, None, 0)

    # --- torso ----------------------------------------------------------
    poly(
        draw,
        pts([(33, 46), (63, 46), (67, 62), (61, 82), (35, 82), (29, 62)]),
        STEEL,
        INK,
        2 * S,
    )
    # lit left edge, shadowed right edge
    poly(draw, pts([(34, 48), (42, 48), (42, 80), (36, 80), (31, 62)]), STEEL_HI, None)
    poly(draw, pts([(58, 48), (64, 48), (66, 62), (60, 80), (56, 80)]), STEEL_DK, None)
    # gold belt + buckle
    rect(draw, scaled((32, 74, 64, 79)), GOLD_LO, INK, 2 * S)
    rrect(draw, scaled((43, 72, 53, 81)), 2 * S, GOLD, INK, 2 * S)
    # crest on the breastplate
    poly(draw, pts([(48, 52), (54, 58), (48, 66), (42, 58)]), GOLD, INK, 2 * S)

    # --- pauldrons ------------------------------------------------------
    rrect(draw, scaled((26, 44, 42, 58)), 5 * S, STEEL_HI, INK, 2 * S)
    rrect(draw, scaled((56, 44, 72, 58)), 5 * S, STEEL, INK, 2 * S)

    # --- spear (right hand, planted) -----------------------------------
    rect(draw, scaled((74, 22, 78, 98)), WOOD, INK, 2 * S)
    poly(draw, pts([(76, 8), (83, 26), (76, 24), (69, 26)]), STEEL_HI, INK, 2 * S)
    rect(draw, scaled((72, 26, 80, 29)), GOLD, INK, 2 * S)
    rrect(draw, scaled((68, 58, 80, 66)), 3 * S, STEEL_LO, INK, 2 * S)

    # --- kite shield (left side, facing the horde) ----------------------
    poly(
        draw,
        pts([(14, 50), (40, 50), (40, 76), (27, 92), (14, 76)]),
        CRIMSON,
        INK,
        2 * S,
    )
    poly(draw, pts([(17, 53), (37, 53), (37, 75), (27, 88), (17, 75)]), CRIMSON_HI, None)
    poly(draw, pts([(27, 58), (33, 64), (27, 72), (21, 64)]), GOLD, INK, 2 * S)
    draw.line(pts([(14, 50), (40, 50)]), fill=GOLD_HI, width=2 * S)

    # --- arm holding the shield ----------------------------------------
    rrect(draw, scaled((36, 54, 46, 64)), 4 * S, STEEL_HI, INK, 2 * S)

    # --- head -----------------------------------------------------------
    rrect(draw, scaled((38, 24, 58, 46)), 7 * S, STEEL, INK, 2 * S)
    poly(draw, pts([(38, 30), (58, 30), (58, 34), (38, 34)]), STEEL_DK, None)  # visor
    rect(draw, scaled((44, 30, 52, 33)), (24, 28, 36, 255), None, 0)  # eye slit
    rect(draw, scaled((46, 24, 50, 44)), GOLD, INK, 2 * S)  # nasal ridge
    # plume
    poly(
        draw,
        pts([(48, 22), (50, 10), (56, 14), (54, 24)]),
        CRIMSON,
        INK,
        2 * S,
    )
    # chin guard
    rrect(draw, scaled((41, 40, 55, 46)), 2 * S, STEEL_LO, INK, 2 * S)
    # a sliver of face under the visor
    rect(draw, scaled((47, 34, 49, 38)), SKIN, None, 0)


def build(out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    strip = Image.new("RGBA", (FW * FRAMES * S, FH * S), (0, 0, 0, 0))
    for index in range(FRAMES):
        frame = Image.new("RGBA", (FW * S, FH * S), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame)
        # frame 0 is the idle pose: no lift, no sway
        draw_hero(draw, step=index)
        strip.alpha_composite(frame, (index * FW * S, 0))

    strip = strip.resize((FW * FRAMES, FH), Image.LANCZOS)
    path = os.path.join(out_dir, "vanguard.png")
    strip.save(path, optimize=True)
    return path


def preview(path: str, dest: str, scale: int = 4) -> str:
    image = Image.open(path)
    image = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
    image.save(dest)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="public/assets/hero")
    parser.add_argument("--preview")
    args = parser.parse_args()
    path = build(args.out)
    print(f"hero -> {path}")
    if args.preview:
        print(f"preview -> {preview(path, args.preview)}")
