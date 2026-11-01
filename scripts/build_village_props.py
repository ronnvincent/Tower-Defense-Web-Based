#!/usr/bin/env python3
"""build_village_props.py — the set dressing for Havenbrook.

The tutorial battlefield is the only board in the game with a town on it, and a
town is not a tile set: it is buildings, fences, a well and somebody's pumpkins.
Everything here comes from one of two places, and each output says which:

  1. **Tiny Swords** (Pixel Frog, CC0 1.0) — the cottage, the ruined watchtower,
     the mine, the pines, the mushrooms/pumpkins and the sheep. The pack is
     already the source of this game's hero sheets, so the village is drawn in
     the same hand as the units standing in it. Sources are vendored in
     `art-source/village/` with their licence; nothing is downloaded at build
     time.

  2. **Drawn here** — the well, the fence run and the haystack. The pack has no
     village furniture, and a town square without a well reads as scenery rather
     than as a place people live. They are painted in the pack's own language:
     a hard ink outline, three flat shades per material, and a cast shadow.

Output goes to `public/assets/village/`, one PNG per prop, cropped tight so the
scene can anchor each one on its base tile.

    python3 scripts/build_village_props.py
"""

import os
import struct
import zlib

from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-source", "village")
OUT = os.path.join(ROOT, "public", "assets", "village")

INK = (0x16, 0x1C, 0x2E, 255)
WOOD_DARK = (0x4A, 0x33, 0x1E, 255)
WOOD = (0x74, 0x51, 0x2E, 255)
WOOD_LIT = (0x9C, 0x74, 0x46, 255)
STONE_DARK = (0x4C, 0x46, 0x3C, 255)
STONE = (0x84, 0x7A, 0x68, 255)
STONE_LIT = (0xB6, 0xAA, 0x90, 255)
STRAW_DARK = (0xA8, 0x7E, 0x34, 255)
STRAW = (0xD2, 0xA8, 0x56, 255)
STRAW_LIT = (0xEE, 0xC8, 0x7C, 255)
WATER = (0x2B, 0x77, 0x74, 255)


def write_png(path, image):
    """Minimal RGBA PNG writer — the same encoder the other art builders use."""
    w, h = image.size
    raw = image.tobytes()
    pixels = bytearray()
    for y in range(h):
        pixels.append(0)
        pixels += raw[y * w * 4 : (y + 1) * w * 4]
    comp = zlib.compress(bytes(pixels), 9)

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        fh.write(chunk(b"IDAT", comp))
        fh.write(chunk(b"IEND", b""))


def crop(path):
    image = Image.open(path).convert("RGBA")
    box = image.getbbox()
    return image.crop(box) if box else image


def cell(path, frame, col, row):
    """One 192 px cell of a sheet (the tree sheet is a 4x3 grid of pines)."""
    image = Image.open(path).convert("RGBA")
    box = (col * frame, row * frame, (col + 1) * frame, (row + 1) * frame)
    return crop_cell(image.crop(box))


def crop_cell(image):
    box = image.getbbox()
    return image.crop(box) if box else image


# ------------------------------------------------------------------ originals


def _outline(image, colour=INK):
    """One-pixel ink border around the silhouette, the pack's own edge."""
    alpha = image.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(grown, alpha)
    edge = Image.new("RGBA", image.size, colour)
    edge.putalpha(ring)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.alpha_composite(edge)
    out.alpha_composite(image)
    return out


def build_well():
    """A stone well: round kerb, two posts, a tiled roof and a bucket."""
    w, h = 96, 104
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = art.load()

    def put(x, y, colour):
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = colour

    def fill(x0, y0, x1, y1, colour):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                put(x, y, colour)

    def disc(cx, cy, rx, ry, colour):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    put(x, y, colour)

    # Kerb: three courses of dressed stone around an elliptical mouth.
    disc(48, 88, 30, 13, STONE_DARK)
    disc(48, 86, 30, 12, STONE)
    disc(48, 82, 30, 11, STONE_LIT)
    disc(48, 82, 22, 7, STONE)
    disc(48, 83, 22, 6, WATER)
    disc(44, 81, 12, 3, (0x3E, 0x94, 0x8C, 255))
    # Stone joints on the kerb face.
    for x in range(22, 76, 9):
        for y in range(84, 98):
            if px[x, y][3]:
                put(x, y, STONE_DARK)
    # Posts and lintel.
    fill(18, 40, 22, 84, WOOD)
    fill(18, 40, 19, 84, WOOD_LIT)
    fill(74, 40, 78, 84, WOOD)
    fill(74, 40, 75, 84, WOOD_LIT)
    fill(14, 36, 82, 40, WOOD)
    fill(14, 36, 82, 37, WOOD_LIT)
    # Roof: a shallow gable in slate, lit on the left.
    for i in range(18):
        y = 18 + i
        half = 12 + i * 2
        fill(48 - half, y, 48 + half, y, STONE if i % 2 else STONE_DARK)
        fill(48 - half, y, 48 - half + 2, y, STONE_LIT)
    fill(6, 34, 90, 36, STONE_DARK)
    # Bucket on a rope.
    fill(46, 44, 50, 50, WOOD)
    fill(46, 50, 50, 56, WOOD_DARK)
    fill(47, 41, 49, 44, (0x6A, 0x5A, 0x40, 255))
    return _outline(art)


def build_fence():
    """A four-post run of rail fence, tiled side by side along a street."""
    w, h = 64, 56
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = draw.load()

    def fill(x0, y0, x1, y1, colour):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[x, y] = colour

    for x in (6, 26, 46):
        fill(x, 18, x + 5, 52, WOOD)
        fill(x, 18, x + 1, 52, WOOD_LIT)
        fill(x + 4, 18, x + 5, 52, WOOD_DARK)
        fill(x, 14, x + 5, 18, WOOD_LIT)
    for y in (24, 38):
        fill(4, y, 60, y + 4, WOOD)
        fill(4, y, 60, y, WOOD_LIT)
        fill(4, y + 4, 60, y + 4, WOOD_DARK)
    return _outline(draw)


def build_haystack():
    """A thatched haystack with a pitchfork leaning in it."""
    w, h = 88, 84
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = art.load()

    def put(x, y, colour):
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = colour

    # Stack: a squat dome of straw over a cut base.
    for y in range(24, 78):
        t = (y - 24) / 54
        half = int(8 + 34 * (t ** 0.55))
        for x in range(44 - half, 44 + half):
            shade = STRAW_LIT if (x - 44) < -half * 0.35 else (STRAW if (x - 44) < half * 0.5 else STRAW_DARK)
            put(x, y, shade)
    # Straw strokes: short light dashes so it reads as cut grass, not a blob.
    for y in range(28, 76, 4):
        for x in range(14, 74, 7):
            if px[x, y][3]:
                put(x, y, STRAW_LIT)
    # Cut base + shadow.
    for x in range(10, 78):
        put(x, 78, STRAW_DARK)
        put(x, 79, (0x6E, 0x50, 0x22, 255))
    # Pitchfork: a lean pole with three tines.
    for i in range(34):
        put(70 + i // 3, 74 - i, WOOD_DARK)
        put(71 + i // 3, 74 - i, WOOD)
    for k in range(3):
        for i in range(7):
            put(78 + k * 3, 40 - i, STONE_LIT if i > 4 else STONE)
    return _outline(art)


def build_sheep():
    """The pack's sheep, cropped to a still frame for grazing in the meadow."""
    sheet = Image.open(os.path.join(ROOT, "art-source", "units", "sheep_all.png")).convert("RGBA")
    fine = crop_cell(sheet.crop((0, 0, 128, 128)))
    return fine


def main():
    os.makedirs(OUT, exist_ok=True)
    written = []

    def save(name, image):
        write_png(os.path.join(OUT, f"{name}.png"), image)
        written.append((name, image.size))

    # 1. Tiny Swords buildings and scatter, cropped tight.
    save("house", crop(os.path.join(SRC, "house.png")))
    save("watchtower", crop(os.path.join(SRC, "watchtower.png")))
    save("mine", crop(os.path.join(SRC, "mine.png")))
    trees = os.path.join(SRC, "trees.png")
    for index, (col, row) in enumerate([(0, 0), (1, 0), (2, 0), (0, 1)]):
        save(f"tree-{index + 1}", cell(trees, 192, col, row))
    save("mushroom", crop(os.path.join(SRC, "deco-01.png")))
    save("mushroom-big", crop(os.path.join(SRC, "deco-03.png")))
    save("bush", crop(os.path.join(SRC, "deco-11.png")))
    save("pumpkin", crop(os.path.join(SRC, "deco-12.png")))
    save("pumpkin-big", crop(os.path.join(SRC, "deco-13.png")))
    save("sheep", build_sheep())

    # 2. Drawn here, in the pack's palette.
    save("well", build_well())
    save("fence", build_fence())
    save("haystack", build_haystack())

    for name, size in written:
        print(f"{name:<14} {size[0]:>4}x{size[1]:<4}")
    print(f"wrote {len(written)} village props to public/assets/village")


if __name__ == "__main__":
    main()
