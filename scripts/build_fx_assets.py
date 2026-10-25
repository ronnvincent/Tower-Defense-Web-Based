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


def build() -> dict:
    os.makedirs(OUT, exist_ok=True)
    sheets: dict[str, dict] = {}

    # ---- impact strips -----------------------------------------------------
    for element, spec in ELEMENTS.items():
        source = spec["source"]
        frames = []
        for index in range(9):
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
            "frames": 9,
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
