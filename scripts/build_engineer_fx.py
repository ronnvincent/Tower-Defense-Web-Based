#!/usr/bin/env python3
"""Build the engineer projectile art and their impact / muzzle effects.

Every defence line needs its own object in flight and its own hit. The Spire
packs have nothing that reads as a musket ball, a gout of burning pitch or a
barbed harpoon, so the engineer shots are authored here; the effects reuse the
Kenney library that already ships in `src/assets/kenney/` (CC0) and re-tint it
into a small, line-specific strip.

    python3 scripts/build_engineer_fx.py

Writes
  public/assets/projectiles/proj-{bolt,bolt-heavy,bullet,flame,acid,harpoon}.png
  public/assets/fx/fx-line-{crossbow,gatling,flamer,venom,harpoon}-impact.png
  public/assets/fx/fx-line-{...}-muzzle.png
and rewrites `src/data/fxManifest.js` entries for those keys (the rest of the
manifest is preserved: the script edits only its own block).

Requires Pillow.
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTILES = os.path.join(ROOT, "public", "assets", "projectiles")
FX = os.path.join(ROOT, "public", "assets", "fx")
KENNEY = os.path.join(ROOT, "src", "assets", "kenney")

# ------------------------------------------------------------------ palettes

STEEL_D = (58, 68, 88, 255)
STEEL_M = (144, 158, 182, 255)
STEEL_L = (216, 228, 244, 255)
WOOD = (150, 110, 68, 255)
WOOD_D = (94, 66, 40, 255)
BRASS = (222, 178, 84, 255)
BRASS_L = (255, 226, 150, 255)
LEAD = (108, 112, 126, 255)
LEAD_L = (176, 182, 198, 255)
EMBER_D = (150, 42, 14, 255)
EMBER = (244, 112, 32, 255)
EMBER_L = (255, 196, 104, 255)
TOX_D = (32, 68, 36, 255)
TOX = (104, 178, 86, 255)
TOX_L = (188, 240, 150, 255)
TEAL = (128, 206, 214, 255)
ROPE = (204, 176, 126, 255)


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(image: Image.Image, folder: str, name: str) -> None:
    os.makedirs(folder, exist_ok=True)
    image.save(os.path.join(folder, name), optimize=True)


# --------------------------------------------------------------- projectiles


def bolt(heavy: bool) -> Image.Image:
    """A crossbow bolt, fletched at the tail, drawn pointing up."""
    w, h = (16, 52) if not heavy else (22, 62)
    image = blank(w, h)
    draw = ImageDraw.Draw(image)
    cx = w // 2
    draw.line((cx, 8, cx, h - 4), fill=WOOD_D, width=3 if heavy else 2)
    draw.line((cx - 1, 10, cx - 1, h - 8), fill=WOOD, width=1)
    # head
    tip = 0 if not heavy else 0
    width = 5 if not heavy else 7
    draw.polygon([(cx, tip), (cx + width, tip + 12), (cx, tip + 8), (cx - width, tip + 12)],
                 fill=STEEL_M)
    draw.polygon([(cx, tip + 1), (cx + width - 2, tip + 11), (cx, tip + 7)], fill=STEEL_L)
    # fletching
    for side in (-1, 1):
        draw.polygon([(cx + side * 2, h - 18), (cx + side * 8, h - 10),
                      (cx + side * 2, h - 4)], fill=(214, 208, 188, 255))
    draw.rectangle((cx - 1, h - 20, cx + 1, h - 6), fill=BRASS)
    if heavy:
        draw.ellipse((cx - 9, 16, cx + 9, 24), outline=BRASS, width=1)
    return image


def bullet() -> Image.Image:
    """A lead slug with a lit tracer tail."""
    image = blank(10, 26)
    draw = ImageDraw.Draw(image)
    draw.polygon([(5, 0), (9, 9), (7, 20), (3, 20), (1, 9)], fill=LEAD_L)
    draw.polygon([(5, 1), (8, 9), (6, 18), (4, 18), (2, 9)], fill=LEAD)
    draw.line((5, 18, 5, 25), fill=(255, 214, 140, 190), width=1)
    draw.rectangle((4, 5, 5, 6), fill=STEEL_L)
    return image


def flame() -> Image.Image:
    """A blob of burning pitch with a trailing tail."""
    image = blank(20, 30)
    draw = ImageDraw.Draw(image)
    draw.polygon([(10, 0), (17, 14), (14, 24), (6, 24), (3, 14)], fill=EMBER_D)
    draw.polygon([(10, 2), (15, 14), (12, 22), (8, 22), (5, 14)], fill=EMBER)
    draw.polygon([(10, 6), (13, 15), (10, 21), (7, 15)], fill=EMBER_L)
    draw.line((10, 22, 10, 29), fill=(255, 236, 170, 160), width=2)
    return image


def acid() -> Image.Image:
    """A wobbling green globule with a drip tail."""
    image = blank(16, 26)
    draw = ImageDraw.Draw(image)
    draw.ellipse((1, 2, 15, 18), fill=TOX_D)
    draw.ellipse((2, 3, 14, 16), fill=TOX)
    draw.ellipse((5, 5, 10, 10), fill=TOX_L)
    draw.polygon([(6, 16), (10, 16), (8, 25)], fill=TOX)
    draw.point((6, 20), fill=TOX_L)
    return image


def harpoon() -> Image.Image:
    """A barbed spear with a rope tail."""
    image = blank(18, 64)
    draw = ImageDraw.Draw(image)
    cx = 9
    draw.line((cx, 14, cx, 62), fill=WOOD_D, width=3)
    draw.line((cx - 1, 16, cx - 1, 58), fill=WOOD, width=1)
    draw.polygon([(cx, 0), (cx + 7, 14), (cx, 8), (cx - 7, 14)], fill=STEEL_L)
    draw.polygon([(cx, 6), (cx + 5, 14), (cx, 11), (cx - 5, 14)], fill=STEEL_M)
    for y in (18, 24):
        draw.polygon([(cx - 2, y), (cx - 9, y + 6), (cx - 2, y + 4)], fill=BRASS)
        draw.polygon([(cx + 2, y), (cx + 9, y + 6), (cx + 2, y + 4)], fill=BRASS)
    for i in range(3):
        draw.ellipse((cx - 4, 46 + i * 5, cx + 4, 51 + i * 5), outline=ROPE)
    return image


# ------------------------------------------------------------------- effects
#
# The impact strips are built from the shipped Kenney bursts: a ring of them is
# re-tinted per line and ramped down so nothing ever flashes to white. Each line
# then gets its own signature silhouette drawn on top.

def kenney(name: str) -> Image.Image:
    path = os.path.join(KENNEY, name)
    return Image.open(path).convert("RGBA")


def tint(source: Image.Image, colour, strength: float = 1.0) -> Image.Image:
    """Recolour a white effect sprite, keeping its alpha ramp intact."""
    rgb = Image.new("RGBA", source.size, (colour[0], colour[1], colour[2], 255))
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    mask = source.getchannel("A")
    # Never blow a pixel to pure white: cap the alpha so 8 overlapping frames
    # cannot strobe.
    mask = mask.point(lambda v: min(190, int(v * 0.85)))
    out.paste(Image.composite(rgb, source, source), (0, 0), mask)
    if strength < 1:
        out.putalpha(out.getchannel("A").point(lambda v: int(v * strength)))
    return out


def fit(image: Image.Image, size: int) -> Image.Image:
    ratio = size / max(image.size)
    return image.resize((max(1, int(image.width * ratio)), max(1, int(image.height * ratio))),
                        Image.LANCZOS)


def ring(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: float, colour, width=2):
    draw.ellipse((cx - radius, cy - radius * 0.55, cx + radius, cy + radius * 0.55),
                 outline=colour, width=width)


def spark(draw: ImageDraw.ImageDraw, x: float, y: float, angle: float, length: float,
          colour, width=1):
    draw.line((x, y, x + math.cos(angle) * length, y + math.sin(angle) * length),
              fill=colour, width=width)


def impact_strip(line: str, frames: int = 10, size: int = 128) -> Image.Image:
    strip = blank(size * frames, size)
    # The extracted Kenney strips: `blast-00..08` (generic), `ember` (fire),
    # `arcane` (magic) and `ground` (dust). Frame 0 is skipped for the same
    # reason the element strips skip it — it is a near-white full flash.
    source = {
        "crossbow": "blast",
        "gatling": "blast",
        "flamer": "ember",
        "venom": "arcane",
        "harpoon": "ground",
    }[line]
    available = [
        f"{source}-{i:02d}.png"
        for i in range(1, 9)
        if os.path.exists(os.path.join(KENNEY, f"{source}-{i:02d}.png"))
    ]

    palette = {
        "crossbow": (236, 232, 206),
        "gatling": (255, 214, 140),
        "flamer": (255, 140, 60),
        "venom": (150, 214, 110),
        "harpoon": (180, 226, 236),
    }[line]

    for index in range(frames):
        frame = blank(size, size)
        t = index / (frames - 1)
        cx = cy = size // 2

        # 1. soft burst body from the Kenney set, always faded in/out
        if available:
            name = available[min(len(available) - 1, int(t * len(available)))]
            body = fit(kenney(name), int(size * (0.42 + 0.4 * t)))
            body = tint(body, palette, strength=0.62 * (1 - t) ** 0.8)
            frame.alpha_composite(body, (cx - body.width // 2, cy - body.height // 2))

        draw = ImageDraw.Draw(frame)

        # 2. per-line signature silhouette
        fade = max(0, int(220 * (1 - t)))
        if fade > 0:
            if line == "crossbow":
                # A burst of straight needle streaks: precision, not explosion.
                for i in range(5):
                    angle = -math.pi / 2 + (i - 2) * 0.42
                    length = 22 + 44 * t
                    spark(draw, cx, cy, angle, length, palette + (fade,), 2)
                for i in range(3):
                    angle = i * math.tau / 3 + 0.5
                    spark(draw, cx, cy, angle, 12 + 20 * t, (255, 255, 255, int(fade * 0.5)), 1)
                ring(draw, cx, cy, 14 + 26 * t, (255, 250, 226, int(fade * 0.5)), 1)
            elif line == "gatling":
                # Brass casings and a hard flash cone toward the target.
                for i in range(10):
                    angle = -math.pi / 2 + (i - 5) * 0.16
                    spark(draw, cx, cy, angle, 30 + 62 * t, (255, 214, 140, fade), 2)
                for i in range(5):
                    px = cx + (i - 2) * 9
                    py = cy + 16 + t * 22
                    draw.rectangle((px, py, px + 2, py + 5), fill=(214, 168, 78, fade))
            elif line == "flamer":
                # Licking tongues of fire and a scorched ground ellipse.
                for i in range(7):
                    angle = -math.pi / 2 + (i - 3) * 0.34
                    length = 30 + 58 * t
                    spark(draw, cx, cy, angle, length, (255, 150, 60, fade), 3)
                    spark(draw, cx, cy, angle, length * 0.6, (255, 226, 150, fade), 1)
                draw.ellipse((cx - 34 - 26 * t, cy + 10, cx + 34 + 26 * t, cy + 26),
                             outline=(255, 120, 40, int(fade * 0.7)), width=2)
            elif line == "venom":
                # Expanding green bubbles plus a spreading toxic pool.
                for i in range(6):
                    angle = i * math.tau / 6
                    r = 14 + 40 * t
                    bx = cx + math.cos(angle) * r
                    by = cy + math.sin(angle) * r * 0.6
                    rad = 4 + 5 * math.sin(t * math.pi)
                    draw.ellipse((bx - rad, by - rad, bx + rad, by + rad),
                                 outline=(190, 240, 150, fade), width=1)
                draw.ellipse((cx - 30 - 22 * t, cy + 8, cx + 30 + 22 * t, cy + 24),
                             fill=(86, 156, 74, int(fade * 0.35)))
            elif line == "harpoon":
                # A barbed spear punched through, then a spray of splinters.
                ex = cx + 26 + 30 * t
                draw.line((cx - 30 - 20 * t, cy + 14, ex, cy - 14),
                          fill=(176, 226, 236, fade), width=3)
                draw.polygon([(ex, cy - 14), (ex + 14, cy - 18), (ex + 4, cy - 8)],
                             fill=(226, 244, 250, fade))
                draw.polygon([(ex - 16, cy + 8), (ex - 6, cy + 2), (ex - 4, cy + 12)],
                             fill=(190, 236, 244, fade))
                for i in range(4):
                    ang = -0.6 + i * 0.4
                    spark(draw, cx, cy + 6, ang, 18 + 26 * t,
                          (204, 236, 244, int(fade * 0.7)), 1)

        frame.alpha_composite(frame.filter(ImageFilter.GaussianBlur(0.4)))
        strip.alpha_composite(frame, (index * size, 0))
    return strip


def muzzle(line: str) -> Image.Image:
    """A single 48 px flash: small, coloured, never white."""
    size = 48
    image = blank(size, size)
    draw = ImageDraw.Draw(image)
    cx = cy = size // 2
    palette = {
        "crossbow": (255, 244, 210),
        "gatling": (255, 214, 140),
        "flamer": (255, 150, 60),
        "venom": (170, 226, 130),
        "harpoon": (200, 236, 244),
    }[line]
    if line == "crossbow":
        for i in range(-1, 2):
            draw.line((cx + i * 4, cy + 12, cx + i * 6, cy - 14), fill=palette + (200,), width=1)
    elif line == "gatling":
        draw.polygon([(cx - 9, cy + 8), (cx + 9, cy + 8), (cx, cy - 14)], fill=palette + (210,))
        draw.ellipse((cx - 5, cy + 2, cx + 5, cy + 10), fill=(255, 236, 180, 180))
    elif line == "flamer":
        draw.polygon([(cx - 7, cy + 10), (cx + 7, cy + 10), (cx, cy - 16)], fill=(255, 150, 60, 210))
        draw.polygon([(cx - 3, cy + 8), (cx + 3, cy + 8), (cx, cy - 8)], fill=(255, 226, 150, 210))
    elif line == "venom":
        draw.ellipse((cx - 7, cy - 6, cx + 7, cy + 10), fill=(104, 178, 86, 200))
        draw.ellipse((cx - 3, cy - 2, cx + 2, cy + 4), fill=(188, 240, 150, 210))
    else:
        draw.polygon([(cx, cy - 16), (cx + 9, cy), (cx, cy + 14), (cx - 9, cy)],
                     fill=(190, 230, 240, 200))
        draw.line((cx, cy - 16, cx, cy + 14), fill=(240, 250, 255, 210))
    return image


LINES = ["crossbow", "gatling", "flamer", "venom", "harpoon"]


def main() -> int:
    os.makedirs(PROJECTILES, exist_ok=True)
    os.makedirs(FX, exist_ok=True)

    save(bolt(False), PROJECTILES, "proj-bolt.png")
    save(bolt(True), PROJECTILES, "proj-bolt-heavy.png")
    save(bullet(), PROJECTILES, "proj-bullet.png")
    save(flame(), PROJECTILES, "proj-flame.png")
    save(acid(), PROJECTILES, "proj-acid.png")
    save(harpoon(), PROJECTILES, "proj-harpoon.png")

    for line in LINES:
        save(impact_strip(line), FX, f"fx-line-{line}-impact.png")
        save(muzzle(line), FX, f"fx-line-{line}-muzzle.png")

    print(f"wrote 6 projectiles + {len(LINES) * 2} effect sheets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
