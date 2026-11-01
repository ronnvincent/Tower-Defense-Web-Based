#!/usr/bin/env python3
"""Build the game's effect atlases from the Kenney CC0 sources.

Before this script the game had nine impact strips lifted from the Spire pack
and nothing else: every hit — an arrow, a boulder, a bolt of lightning — ended
in the same small puff, and the only muzzle feedback was a two-pixel recoil
tween. Defences looked weak because they *sounded* weak, not because the towers
were quiet.

This builds a real effect library:

  * one 9-frame impact strip per damage family, duotoned from Kenney's explosion
    sheets so fire, frost, lightning, arcane and physical hits each read as
    their own element;
  * a ground blast, a shockwave, an implosion, an ice nova and a level-up burst;
  * a soft radial glow and an aura ring for tower states;
  * fourteen particle textures (spark, ember, smoke, magic, star, twirl, …) that
    the runtime feeds to Phaser emitters.

Sources live in `src/assets/kenney/` (fetched by `scripts/fetch_kenney_fx.py`,
CC0). Output is `public/assets/fx/` plus `src/data/fxManifest.js`.

    python3 scripts/build_fx_assets.py

Requires Pillow.
"""

from __future__ import annotations

import json
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "assets", "kenney")
OUT = os.path.join(ROOT, "public", "assets", "fx")
MANIFEST = os.path.join(ROOT, "src", "data", "fxManifest.js")

# --------------------------------------------------------------------- helpers


def load(name: str) -> Image.Image:
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def ramp(stops: list[str]) -> list[tuple[int, int, int]]:
    return [hex_rgb(stop) for stop in stops]


def duotone(image: Image.Image, stops: list[tuple[int, int, int]], strength: float = 1.0) -> Image.Image:
    """Map luminance through a colour ramp, keeping the source alpha.

    The Kenney sheets are flat-shaded (a bright core, a saturated ring, a soft
    shadow), so mapping luminance keeps that structure while the ramp makes the
    result belong to one element instead of "orange explosion for everything".
    """
    src = image.convert("RGBA")
    px = src.load()
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    dst = out.load()
    n = len(stops)
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            pos = min(1.0, max(0.0, lum)) * (n - 1)
            i = int(pos)
            j = min(n - 1, i + 1)
            t = pos - i
            colour = tuple(
                round(stops[i][k] * (1 - t) + stops[j][k] * t) for k in range(3)
            )
            if strength < 1.0:
                colour = tuple(
                    round((r, g, b)[k] * (1 - strength) + colour[k] * strength) for k in range(3)
                )
            dst[x, y] = (*colour, a)
    return out


def frame_box(frames: list[Image.Image], size: int | None = None, bottom: bool = False) -> int:
    """Square frame size that fits every frame, rounded up to a multiple of 4."""
    if size:
        return size
    widest = max(f.width for f in frames)
    tallest = max(f.height for f in frames)
    side = max(widest, tallest)
    return (side + 3) // 4 * 4


def strip(
    frames: list[Image.Image],
    side: int,
    bottom: bool = False,
    glow: float = 0.0,
) -> Image.Image:
    """Lay frames into one horizontal strip on a uniform, centred canvas.

    `bottom=True` anchors each frame to the bottom edge, which is what a ground
    explosion needs: the fire has to stay on the tile while it grows, not float
    up through the floor.
    """
    canvas = Image.new("RGBA", (side * len(frames), side), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        scaled = frame
        if frame.width > side or frame.height > side:
            scaled = frame.copy()
            scaled.thumbnail((side, side), Image.LANCZOS)
        if glow > 0:
            halo = Image.new("RGBA", scaled.size, (0, 0, 0, 0))
            alpha = scaled.getchannel("A").filter(ImageFilter.GaussianBlur(max(1, side // 32)))
            halo.putalpha(alpha.point(lambda a, g=glow: int(a * g)))
            scaled = Image.alpha_composite(halo, scaled)
        x = index * side + (side - scaled.width) // 2
        y = side - scaled.height if bottom else (side - scaled.height) // 2
        canvas.alpha_composite(scaled, (x, y))
    return canvas


def save(image: Image.Image, name: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    image.save(os.path.join(OUT, name), optimize=True)


def radial_glow(size: int, colour: tuple[int, int, int]) -> Image.Image:
    """Soft additive-friendly halo used for auras and muzzle light."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = image.load()
    centre = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            dist = ((x - centre) ** 2 + (y - centre) ** 2) ** 0.5 / centre
            if dist >= 1:
                continue
            alpha = int(255 * (1 - dist) ** 2.4)
            px[x, y] = (*colour, alpha)
    return image


def ring(size: int, colour: tuple[int, int, int], width: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = width // 2 + 1
    draw.ellipse((pad, pad, size - 1 - pad, size - 1 - pad), outline=(*colour, 235), width=width)
    return image.filter(ImageFilter.GaussianBlur(0.6))


def star_burst(size: int, colour: tuple[int, int, int], spikes: int = 8) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    centre = size / 2
    import math

    for i in range(spikes):
        angle = (i / spikes) * math.tau
        length = centre * (0.92 if i % 2 == 0 else 0.5)
        inner = centre * 0.12
        x1 = centre + math.cos(angle) * inner
        y1 = centre + math.sin(angle) * inner
        x2 = centre + math.cos(angle) * length
        y2 = centre + math.sin(angle) * length
        spread = 0.06
        draw.polygon(
            [
                (x1, y1),
                (centre + math.cos(angle - spread) * length, centre + math.sin(angle - spread) * length),
                (centre + math.cos(angle + spread) * length, centre + math.sin(angle + spread) * length),
            ],
            fill=(*colour, 255),
        )
    draw.ellipse((centre * 0.62, centre * 0.62, centre * 1.38, centre * 1.38), fill=(*colour, 255))
    return image.filter(ImageFilter.GaussianBlur(0.5))


# ------------------------------------------------------------------ palettes

ELEMENTS = {
    "physical": {
        "source": "pixel",
        "side": 96,
        "ramp": ["#10141c", "#46505f", "#b9c6d8", "#ffffff"],
        "glow": 0.0,
        "frameRate": 34,
    },
    "explosive": {
        "source": "blast",
        "side": 192,
        "ramp": ["#170806", "#7a2a10", "#ff8a2b", "#ffe9b0"],
        "glow": 0.28,
        "frameRate": 28,
    },
    "fire": {
        "source": "ember",
        "side": 160,
        "ramp": ["#1a0604", "#8c1f0a", "#ff6a1e", "#fff0b8"],
        "glow": 0.34,
        "frameRate": 30,
    },
    "frost": {
        "source": "blast",
        "side": 176,
        "ramp": ["#04121c", "#12506e", "#6fd0f2", "#f2fdff"],
        "glow": 0.3,
        "frameRate": 26,
    },
    "lightning": {
        "source": "ember",
        "side": 160,
        "ramp": ["#141003", "#6b5a08", "#ffe14a", "#ffffff"],
        "glow": 0.32,
        "frameRate": 34,
    },
    "arcane": {
        "source": "ember",
        "side": 176,
        "ramp": ["#0a0518", "#341a6b", "#9a6bff", "#efe4ff"],
        "glow": 0.3,
        "frameRate": 26,
    },
    "true": {
        "source": "blast",
        "side": 176,
        "ramp": ["#120a14", "#5a2a4e", "#e06ad0", "#fff0fb"],
        "glow": 0.3,
        "frameRate": 28,
    },
}

PARTICLES = {
    "fx-spark": ("spark.png", 64),
    "fx-spark-soft": ("spark-soft.png", 96),
    "fx-ember": ("flame.png", 64),
    "fx-fire": ("fire.png", 96),
    "fx-smoke": ("smoke.png", 128),
    "fx-smoke-light": ("smoke-light.png", 128),
    "fx-magic": ("magic.png", 96),
    "fx-rune": ("magic-rune.png", 96),
    "fx-star": ("star.png", 64),
    "fx-ring": ("ring.png", 128),
    "fx-light": ("light.png", 128),
    "fx-trace": ("trace.png", 64),
    "fx-twirl": ("twirl.png", 96),
    "fx-dirt": ("dirt.png", 96),
    "fx-scorch": ("scorch.png", 128),
    "fx-muzzle": ("muzzle.png", 96),
    "fx-muzzle-wide": ("muzzle-wide.png", 128),
    "fx-symbol": ("symbol.png", 96),
}


# ---------------------------------------------------------------- line effects

# Each defence answers with its own silhouette. The element strips above are
# still there (enemy hits, boss abilities, splash fallbacks) but a tower's own
# impact is drawn from scratch so no two lines share a burst: a ballista leaves
# needles, a sling leaves a dust crater, a frost spire leaves shards, a forge
# throws molten blobs, a rune implodes and a banner answers with a pure ring.
#
# Everything here is authored *dim*: no full-white frames, alpha capped around
# 200 and edges blurred, because the board is 64 px per tile and a bright,
# high-contrast burst over it reads as a strobe instead of an impact.
LINE_FX = {
    "archer": {"frame": 128, "frames": 10, "frameRate": 36},
    "cannon": {"frame": 128, "frames": 10, "frameRate": 24},
    "frost": {"frame": 128, "frames": 10, "frameRate": 28},
    "forge": {"frame": 128, "frames": 10, "frameRate": 30},
    "runes": {"frame": 128, "frames": 10, "frameRate": 26},
    "banner": {"frame": 128, "frames": 10, "frameRate": 20},
}


def _ease(t: float) -> float:
    return 1 - (1 - t) ** 2


def _line_frame(kind: str, index: int, frames: int, side: int) -> Image.Image:
    import math

    t = index / (frames - 1)
    image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cx = cy = side / 2
    fade = max(0.0, 1 - t) ** 1.15

    if kind == "archer":
        # Four needle streaks out and a puff of pale dust: precise, quick, small.
        for k in range(4):
            angle = math.pi / 4 + k * math.pi / 2
            reach = 12 + _ease(t) * 42
            width = max(1, int(3 * (1 - t)))
            draw.line(
                [
                    (cx + math.cos(angle) * 8, cy + math.sin(angle) * 8),
                    (cx + math.cos(angle) * reach, cy + math.sin(angle) * reach),
                ],
                fill=(214, 226, 240, int(210 * fade)),
                width=width,
            )
        draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=(240, 246, 255, int(150 * fade)))

    elif kind == "cannon":
        # A ring of earth and six chunks of road thrown outward.
        radius = 8 + _ease(t) * 46
        draw.ellipse(
            (cx - radius, cy - radius * 0.72, cx + radius, cy + radius * 0.72),
            outline=(176, 129, 82, int(170 * fade)),
            width=max(2, int(5 * (1 - t))),
        )
        for k in range(6):
            angle = k * math.tau / 6 + 0.4
            dist = 10 + _ease(t) * 40
            size = max(2, int(6 * (1 - 0.6 * t)))
            px = cx + math.cos(angle) * dist
            py = cy + math.sin(angle) * dist * 0.72 - math.sin(math.pi * t) * 14
            draw.rectangle((px - size, py - size, px + size, py + size), fill=(104, 74, 48, int(210 * fade)))

    elif kind == "frost":
        # Six shards, each with a bright tip: reads as ice, never as fire.
        for k in range(6):
            angle = k * math.tau / 6 + t * 0.5
            inner = 6
            reach = 16 + _ease(t) * 40
            half = max(1.5, 4.5 * (1 - t))
            ax = cx + math.cos(angle) * inner
            ay = cy + math.sin(angle) * inner
            bx = cx + math.cos(angle) * reach
            by = cy + math.sin(angle) * reach
            nx, ny = math.cos(angle + math.pi / 2) * half, math.sin(angle + math.pi / 2) * half
            draw.polygon([(ax + nx, ay + ny), (bx, by), (ax - nx, ay - ny)], fill=(186, 230, 248, int(205 * fade)))
        radius = 10 + _ease(t) * 34
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            outline=(150, 205, 228, int(120 * fade)),
            width=2,
        )

    elif kind == "forge":
        # Molten blobs on ballistic arcs plus a low shock ellipse on the ground.
        for k in range(7):
            spread = (k - 3) / 3
            px = cx + spread * (10 + _ease(t) * 40)
            py = cy - math.sin(math.pi * min(1, t * 1.1)) * (24 + abs(spread) * 10) + t * 26
            size = max(2, int(6 * (1 - 0.55 * t)))
            colour = (255, 156, 72, int(215 * fade)) if k % 2 else (255, 196, 118, int(225 * fade))
            draw.ellipse((px - size, py - size, px + size, py + size), fill=colour)
        radius = 8 + _ease(t) * 40
        draw.ellipse(
            (cx - radius, cy + 18 - radius * 0.3, cx + radius, cy + 18 + radius * 0.3),
            outline=(255, 150, 70, int(150 * fade)),
            width=2,
        )

    elif kind == "runes":
        # An implosion: the ring falls inward while four motes keep their orbit,
        # so the hit looks like the target was pulled into the rune, not blown up.
        radius = 56 * (1 - _ease(t)) + 8
        alpha = int(190 * min(1, t * 3) * (1 - t * 0.85))
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            outline=(168, 136, 255, max(0, alpha)),
            width=max(2, int(4 * (1 - t * 0.5))),
        )
        for k in range(4):
            angle = k * math.tau / 4 + t * 2.4
            px = cx + math.cos(angle) * 22
            py = cy + math.sin(angle) * 22
            draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(206, 186, 255, int(210 * fade)))
        if t < 0.75:
            glyph = 14 * (1 - t)
            draw.polygon(
                [(cx, cy - glyph), (cx + glyph, cy), (cx, cy + glyph), (cx - glyph, cy)],
                outline=(214, 196, 255, int(200 * (1 - t))),
                width=2,
            )

    else:  # banner — a pure rally ring, no debris at all
        for k in range(2):
            phase = t - k * 0.18
            if phase <= 0:
                continue
            radius = 10 + _ease(min(1, phase)) * 46
            alpha = int(150 * max(0.0, 1 - phase) ** 1.2)
            draw.ellipse(
                (cx - radius, cy - radius, cx + radius, cy + radius),
                outline=(255, 214, 130, alpha),
                width=max(1, int(4 * (1 - phase))),
            )
        for k in range(3):
            y = cy + 18 - _ease(t) * 46 - k * 6
            alpha = int(170 * fade)
            draw.line([(cx - 10, y), (cx, y - 7), (cx + 10, y)], fill=(255, 226, 160, alpha), width=2)

    return image.filter(ImageFilter.GaussianBlur(0.4 if kind != "archer" else 0.2))


def _line_muzzle(kind: str, side: int = 48) -> Image.Image:
    image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cx = cy = side / 2
    if kind == "archer":
        for k in range(3):
            x = cx + (k - 1) * 7
            draw.line([(x, cy - 9), (x, cy + 9)], fill=(226, 236, 248, 200), width=2)
    elif kind == "cannon":
        draw.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), outline=(178, 150, 120, 150), width=3)
        draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=(232, 206, 168, 120))
    elif kind == "frost":
        for k in range(4):
            angle = k * math_pi_over_2()
            draw.polygon(
                [
                    (cx + _cos(angle) * 4, cy + _sin(angle) * 4),
                    (cx + _cos(angle + 0.35) * 16, cy + _sin(angle + 0.35) * 16),
                    (cx + _cos(angle - 0.35) * 16, cy + _sin(angle - 0.35) * 16),
                ],
                fill=(186, 230, 248, 190),
            )
    elif kind == "forge":
        for k in range(5):
            angle = k * (math_tau() / 5)
            px = cx + _cos(angle) * 8
            py = cy + _sin(angle) * 8
            draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(255, 176, 96, 190))
        draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(255, 222, 168, 210))
    elif kind == "runes":
        draw.polygon([(cx, cy - 13), (cx + 11, cy), (cx, cy + 13), (cx - 11, cy)], outline=(196, 170, 255, 210), width=2)
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=(224, 208, 255, 210))
    else:
        draw.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), outline=(255, 214, 130, 180), width=3)
    return image.filter(ImageFilter.GaussianBlur(0.4))


def math_pi_over_2():
    import math

    return math.pi / 2


def math_tau():
    import math

    return math.tau


def _cos(value):
    import math

    return math.cos(value)


def _sin(value):
    import math

    return math.sin(value)


def build_line_fx(sheets: dict) -> None:
    """Per-defence impacts and muzzle flashes."""
    print("line effects")
    for kind, spec in LINE_FX.items():
        side = spec["frame"]
        frames = [_line_frame(kind, i, spec["frames"], side) for i in range(spec["frames"])]
        name = f"fx-line-{kind}-impact.png"
        save(strip(frames, side), name)
        sheets[f"fx-line-{kind}-impact"] = {
            "file": name,
            "frameWidth": side,
            "frameHeight": side,
            "frames": spec["frames"],
            "frameRate": spec["frameRate"],
        }

        muzzle = _line_muzzle(kind)
        muzzle_name = f"fx-line-{kind}-muzzle.png"
        save(muzzle, muzzle_name)
        sheets[f"fx-line-{kind}-muzzle"] = {
            "file": muzzle_name,
            "frameWidth": muzzle.width,
            "frameHeight": muzzle.height,
            "frames": 1,
            "frameRate": 1,
        }
        print(f"  {kind:8s} impact + muzzle")


def build() -> dict:
    os.makedirs(OUT, exist_ok=True)
    sheets: dict[str, dict] = {}

    # ---- impact strips -----------------------------------------------------
    for element, spec in ELEMENTS.items():
        source = spec["source"]
        frames = []
        # Frame 0 of every Kenney explosion is a full-white flash. Played at
        # 28 fps over a 64 px battlefield it is a strobe, not a hit — the strip
        # starts one frame later and the ramp's lightest stop is warm off-white
        # instead of pure white.
        for index in range(1, 9):
            image = load(f"{source}-{index:02d}.png")
            frames.append(duotone(image, ramp(spec["ramp"]), 1.0))
        side = spec["side"]
        sheet = strip(frames, side, glow=spec["glow"])
        name = f"fx-impact-{element}.png"
        save(sheet, name)
        sheets[f"fx-impact-{element}"] = {
            "file": name,
            "frameWidth": side,
            "frameHeight": side,
            "frames": 8,
            "frameRate": spec["frameRate"],
        }

    # ---- ground blast (kept on the floor) ----------------------------------
    ground_frames = [load(f"ground-{i:02d}.png") for i in range(9)]
    ground_side = 192
    ground = strip(
        [duotone(f, ramp(["#1a0a05", "#7a2a10", "#ff9a3c", "#ffe9b0"])) for f in ground_frames],
        ground_side,
        bottom=True,
        glow=0.22,
    )
    save(ground, "fx-ground-blast.png")
    sheets["fx-ground-blast"] = {
        "file": "fx-ground-blast.png",
        "frameWidth": ground_side,
        "frameHeight": ground_side,
        "frames": 9,
        "frameRate": 24,
    }

    # ---- shockwave: the sonic explosion, tinted, drawn around the hit point --
    shock_frames = [
        duotone(load(f"arcane-{i:02d}.png"), ramp(["#0a0f1c", "#1d6f96", "#7fe4ff", "#ffffff"]))
        for i in range(9)
    ]
    shock = strip(shock_frames, 192, glow=0.18)
    save(shock, "fx-shockwave.png")
    sheets["fx-shockwave"] = {
        "file": "fx-shockwave.png",
        "frameWidth": 192,
        "frameHeight": 192,
        "frames": 9,
        "frameRate": 32,
    }

    # ---- implosion: the same sheet played backwards (rune towers) ----------
    save(shock.transpose(Image.FLIP_LEFT_RIGHT), "fx-implosion.png")
    sheets["fx-implosion"] = {
        "file": "fx-implosion.png",
        "frameWidth": 192,
        "frameHeight": 192,
        "frames": 9,
        "frameRate": 32,
    }

    # ---- ice nova: crystal shards flung out of a frozen core --------------
    nova_frames = []
    import math

    shards = []
    for i in range(9):
        angle = (i / 9) * math.tau
        shards.append(angle)
    for i in range(10):
        t = i / 9
        size = 176
        frame = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        centre = size / 2
        # The core flash burns out in the first three frames, the ring races to
        # the edge, and the shards travel at a third of the ring's speed so the
        # burst keeps a readable silhouette instead of collapsing to a line.
        if i < 4:
            core = radial_glow(int(96 - i * 16), (232, 250, 255))
            core.putalpha(core.getchannel("A").point(lambda a, k=(1 - i / 4): int(a * k)))
            frame.alpha_composite(core, ((size - core.width) // 2, (size - core.height) // 2))
        r = 18 + t * (centre - 16)
        draw = ImageDraw.Draw(frame)
        draw.ellipse(
            (centre - r, centre - r, centre + r, centre + r),
            outline=(150, 214, 240, int(150 * (1 - t) ** 0.6)),
            width=max(2, int(4 * (1 - t))),
        )
        # Shards are the silhouette: long, tapered, and thrown out ahead of the
        # ring so the nova reads as ice bursting out rather than a halo fading.
        shard_dist = 4 + t * (centre - 34)
        for angle in shards:
            length = 62 * (1 - 0.5 * t)
            half = 9 * (1 - 0.6 * t)
            tip_x = centre + math.cos(angle) * (shard_dist + length)
            tip_y = centre + math.sin(angle) * (shard_dist + length)
            side_a = angle + math.pi / 2
            base_x = centre + math.cos(angle) * shard_dist
            base_y = centre + math.sin(angle) * shard_dist
            alpha = int(245 * (1 - t) ** 0.55)
            draw.polygon(
                [
                    (base_x + math.cos(side_a) * half, base_y + math.sin(side_a) * half),
                    (tip_x, tip_y),
                    (base_x - math.cos(side_a) * half, base_y - math.sin(side_a) * half),
                ],
                fill=(226, 250, 255, alpha),
            )
        nova_frames.append(frame)
    nova = strip(nova_frames, 176)
    save(nova, "fx-nova.png")
    sheets["fx-nova"] = {
        "file": "fx-nova.png",
        "frameWidth": 176,
        "frameHeight": 176,
        "frames": 10,
        "frameRate": 30,
    }

    # ---- level-up burst: gold ring + star + symbol ------------------------
    level_frames = []
    base_symbol = load("symbol.png")
    for i in range(12):
        t = i / 11
        size = 192
        frame = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        r = int(28 + t * 74)
        alpha = int(230 * (1 - t) ** 0.8)
        draw = ImageDraw.Draw(frame)
        draw.ellipse(
            (size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r),
            outline=(255, 214, 120, alpha),
            width=max(2, int(8 * (1 - t))),
        )
        if i < 7:
            burst = star_burst(int(140 - i * 14), (255, 244, 205))
            burst.putalpha(burst.getchannel("A").point(lambda a, k=(1 - i / 7): int(a * k)))
            frame.alpha_composite(burst, ((size - burst.width) // 2, (size - burst.height) // 2))
        if i < 5:
            glyph = base_symbol.copy()
            glyph.thumbnail((96, 96), Image.LANCZOS)
            glyph = duotone(glyph, ramp(["#4a2a06", "#c48a24", "#ffe9a8", "#ffffff"]))
            glyph.putalpha(glyph.getchannel("A").point(lambda a, k=(1 - i / 5): int(a * k)))
            frame.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
        level_frames.append(frame)
    level = strip(level_frames, 192)
    save(level, "fx-levelup.png")
    sheets["fx-levelup"] = {
        "file": "fx-levelup.png",
        "frameWidth": 192,
        "frameHeight": 192,
        "frames": 12,
        "frameRate": 26,
    }

    # ---- aura glow + selection ring ---------------------------------------
    save(radial_glow(128, (120, 220, 255)), "fx-glow.png")
    sheets["fx-glow"] = {"file": "fx-glow.png", "frameWidth": 128, "frameHeight": 128, "frames": 1, "frameRate": 1}
    save(radial_glow(128, (255, 196, 96)), "fx-glow-gold.png")
    sheets["fx-glow-gold"] = {
        "file": "fx-glow-gold.png",
        "frameWidth": 128,
        "frameHeight": 128,
        "frames": 1,
        "frameRate": 1,
    }
    save(ring(160, (126, 226, 255), 4), "fx-aura-ring.png")
    sheets["fx-aura-ring"] = {
        "file": "fx-aura-ring.png",
        "frameWidth": 160,
        "frameHeight": 160,
        "frames": 1,
        "frameRate": 1,
    }

    # ---- per-defence effects ----------------------------------------------
    build_line_fx(sheets)

    # ---- particle singles --------------------------------------------------
    particles = {}
    for key, (file_name, size) in PARTICLES.items():
        image = load(file_name)
        image.thumbnail((size, size), Image.LANCZOS)
        save(image, f"{key}.png")
        particles[key] = f"{key}.png"

    return {"sheets": sheets, "particles": particles}


def write_manifest(data: dict) -> None:
    lines = [
        "/**",
        " * fxManifest.js — GENERATED by scripts/build_fx_assets.py.",
        " * Do not edit by hand: re-run the script after changing the sources.",
        " *",
        " * Effect atlases built from the Kenney CC0 packs in src/assets/kenney.",
        " * `frames` is the number of drawn frames in the strip; `frameRate` is the",
        " * authored playback speed in frames per second.",
        " */",
        "",
        "export const FX_SHEETS = {",
    ]
    for key, sheet in data["sheets"].items():
        lines.append(
            "  '{key}': {{ file: '{file}', frameWidth: {frameWidth}, frameHeight: {frameHeight}, "
            "frames: {frames}, frameRate: {frameRate} }},".format(key=key, **sheet)
        )
    lines += ["};", "", "/** Particle textures (single frames) fed to Phaser emitters. */", "export const FX_PARTICLES = {"]
    for key, file_name in data["particles"].items():
        lines.append(f"  '{key}': '{file_name}',")
    lines += ["};", ""]
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main() -> int:
    data = build()
    write_manifest(data)
    total = sum(
        os.path.getsize(os.path.join(OUT, name)) for name in os.listdir(OUT) if name.endswith(".png")
    )
    print(f"wrote {len(data['sheets'])} sheets + {len(data['particles'])} particles, {total / 1024:.0f} KB")
    for key in data["sheets"]:
        print("  ", key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
