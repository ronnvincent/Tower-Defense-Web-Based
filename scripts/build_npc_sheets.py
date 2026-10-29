#!/usr/bin/env python3
"""build_npc_sheets.py — the five villagers of Havenbrook.

WHY THIS SCRIPT
---------------
The opening battle has people in it. Until now every human on the board was a
combatant: the Vanguard, the squire, the ranger. A tutorial that says "our
village" needs faces — a grandmother, an elder, a child — and Tiny Swords
(Pixel Frog, CC0 1.0, `art-source/units/LICENSE-TinySwords-CC0.txt`) ships
three bodies and no civilians at all.

So the villagers are *built*, not downloaded: the pack's own pawn, archer and
warrior sheets are re-paletted per character and re-packed into the two rows
this game animates (idle, walk). That is the same operation
`build_unit_sheets.sh` does for the heroes, done in Pillow because it also has
to rewrite the palette colour by colour.

Three silhouettes carry the cast — a hoodless peasant (pawn), a bowman (archer)
and a helm-and-shield guard (warrior) — and identity comes from the palette,
the scale the scene draws them at, and the portraits below, which are painted
here at 4x so a beard, a headscarf or a straw hat is legible.

WHAT IT WRITES
--------------
    public/assets/units/npc-<id>.png      two rows: idle (row 0), walk (row 1)
    public/assets/ui/portrait-<id>.png    128 px portrait for the dialogue card
    public/assets/units/npc-staff.png     the elder's walking stick

Deterministic: the same source sheets always produce byte-identical output.

    python3 scripts/build_npc_sheets.py
"""

import os
import struct
import sys
import zlib

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-source", "units")
UNITS = os.path.join(ROOT, "public", "assets", "units")
UI = os.path.join(ROOT, "public", "assets", "ui")

# --------------------------------------------------------------------- palettes
#
# The Tiny Swords sheets are flat colour art: seven to ten unique colours each,
# and the same seven mean the same thing on every body —
#
#   #161C2E  ink (outline, plus one 31 % alpha soft outline)
#   #EFE1AB  hair, lit                 #EDE6AC  hair, shaded
#   #D5B583  skin / leather            #977B6B  wood, soles, straps
#   #404E75  tunic, shaded             #3E8698  tunic, lit
#   #5AB3AC  tunic, highlight          #FFFFFF  eye whites and steel glints
#
# A villager is therefore a colour map, not a redraw. Every key below is a
# colour that exists in the source sheet; the value is what that pixel becomes.
INK = (0x16, 0x1C, 0x2E)

SKIN_DEFAULT = (0xD5, 0xB5, 0x83)
SKIN_TAN = (0xC6, 0x9A, 0x6C)
SKIN_OLD = (0xC8, 0xA9, 0x84)

# id -> body sheet, palette overrides, in-world scale, portrait styling
CAST = [
    {
        # Mara runs the mill and does the talking for the village green.
        "id": "mara",
        "name": "Mara",
        "role": "miller",
        "sheet": "pawn_blue",
        "frame": 192,
        "rows": (0, 1),
        "scale": 1.0,
        "palette": {
            (0xEF, 0xE1, 0xAB): (0xC9, 0x7A, 0x3E),
            (0xED, 0xE6, 0xAC): (0xAE, 0x63, 0x31),
            (0x40, 0x4E, 0x75): (0x7E, 0x45, 0x2A),
            (0x3E, 0x86, 0x98): (0xB2, 0x74, 0x3E),
            (0x5A, 0xB3, 0xAC): (0xDC, 0xA8, 0x69),
            (0x97, 0x7B, 0x6B): (0x6B, 0x45, 0x2C),
        },
        "portrait": {"bg": (0x3E, 0x5A, 0x38), "accent": (0xE2, 0xB0, 0x6A), "wear": "kerchief"},
    },
    {
        # Doren has watched nine winters from this bench.
        "id": "doren",
        "name": "Old Doren",
        "role": "elder",
        "sheet": "pawn_blue",
        "frame": 192,
        "rows": (0, 1),
        "scale": 0.94,
        "palette": {
            (0xEF, 0xE1, 0xAB): (0xD9, 0xD6, 0xCE),
            (0xED, 0xE6, 0xAC): (0xB2, 0xB0, 0xAC),
            (0xD5, 0xB5, 0x83): SKIN_OLD,
            (0x40, 0x4E, 0x75): (0x46, 0x51, 0x3E),
            (0x3E, 0x86, 0x98): (0x6C, 0x7A, 0x5C),
            (0x5A, 0xB3, 0xAC): (0x93, 0xA0, 0x7C),
            (0x97, 0x7B, 0x6B): (0x5C, 0x4A, 0x36),
        },
        "portrait": {"bg": (0x44, 0x4C, 0x58), "accent": (0xC9, 0xD2, 0xD8), "wear": "cap"},
    },
    {
        # Pip, who has never seen a raid and is not going to start today.
        "id": "pip",
        "name": "Pip",
        "role": "child",
        "sheet": "pawn_blue",
        "frame": 192,
        "rows": (0, 1),
        "scale": 0.66,
        "palette": {
            (0xEF, 0xE1, 0xAB): (0x6E, 0x4B, 0x2A),
            (0xED, 0xE6, 0xAC): (0x59, 0x3B, 0x1F),
            (0xD5, 0xB5, 0x83): (0xE2, 0xBE, 0x92),
            (0x40, 0x4E, 0x75): (0x3B, 0x73, 0x38),
            (0x3E, 0x86, 0x98): (0x6F, 0xB0, 0x4C),
            (0x5A, 0xB3, 0xAC): (0xA6, 0xD8, 0x72),
            (0x97, 0x7B, 0x6B): (0x7A, 0x4F, 0x30),
        },
        "portrait": {"bg": (0x37, 0x56, 0x2C), "accent": (0xA6, 0xD8, 0x72), "wear": "straw"},
    },
    {
        # Hollis keeps the wood and the bow; the first arrows are his.
        "id": "hollis",
        "name": "Hollis",
        "role": "hunter",
        "sheet": "archer_blue",
        "frame": 192,
        "rows": (0, 1),
        "scale": 1.0,
        "palette": {
            (0xEF, 0xE1, 0xAB): (0x5C, 0x3D, 0x24),
            (0xED, 0xE6, 0xAC): (0x47, 0x2E, 0x1A),
            (0xD5, 0xB5, 0x83): SKIN_TAN,
            (0x40, 0x4E, 0x75): (0x3F, 0x52, 0x32),
            (0x3E, 0x86, 0x98): (0x62, 0x7A, 0x44),
            (0x5A, 0xB3, 0xAC): (0x8C, 0xA6, 0x5E),
            (0x97, 0x7B, 0x6B): (0x5C, 0x42, 0x28),
        },
        "portrait": {"bg": (0x3A, 0x4A, 0x2E), "accent": (0x9E, 0xB8, 0x6A)},
    },
    {
        # Bram has one spear, one shield and the watchtower.
        "id": "bram",
        "name": "Bram",
        "role": "watch",
        "sheet": "warrior_blue",
        "frame": 192,
        "rows": (0, 1),
        "scale": 1.0,
        "palette": {
            (0xEF, 0xE1, 0xAB): (0xB8, 0x46, 0x2E),
            (0xED, 0xE6, 0xAC): (0x94, 0x30, 0x20),
            (0x40, 0x4E, 0x75): (0x2E, 0x4F, 0x36),
            (0x3E, 0x86, 0x98): (0x4A, 0x76, 0x4E),
            (0x5A, 0xB3, 0xAC): (0x76, 0xA4, 0x6A),
            (0x97, 0x7B, 0x6B): (0x5A, 0x46, 0x30),
        },
        "portrait": {"bg": (0x3C, 0x46, 0x50), "accent": (0xB8, 0x46, 0x2E)},
    },
]

PORTRAIT = 128


def write_png(path, image):
    """Minimal RGBA PNG writer — the same encoder the terrain builders use."""
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


def recolour(image, palette):
    """Swap every source colour for its mapped value; leave the rest alone."""
    out = image.copy()
    pixels = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            swap = palette.get((r, g, b))
            if swap:
                pixels[x, y] = (swap[0], swap[1], swap[2], a)
    return out


def row_span(image, frame, row):
    """Index of the last column in `row` that carries ink (0 when empty)."""
    last = 0
    for col in range(image.width // frame):
        cell = image.crop((col * frame, row * frame, (col + 1) * frame, (row + 1) * frame))
        if cell.getbbox():
            last = col
    return last + 1


def build_sheet(spec):
    """Re-pack idle + walk into the two-row sheet this game draws villagers from."""
    source = Image.open(os.path.join(SRC, f"{spec['sheet']}.png")).convert("RGBA")
    tinted = recolour(source, spec["palette"])
    frame = spec["frame"]
    idle_row, walk_row = spec["rows"]
    spans = [row_span(tinted, frame, idle_row), row_span(tinted, frame, walk_row)]
    cols = max(spans)
    if cols <= 0:
        raise SystemExit(f"no frames for {spec['id']}")

    sheet = Image.new("RGBA", (frame * cols, frame * 2), (0, 0, 0, 0))
    for index, row in enumerate((idle_row, walk_row)):
        strip = tinted.crop((0, row * frame, frame * spans[index], (row + 1) * frame))
        sheet.alpha_composite(strip, (0, index * frame))
    headwear = spec["portrait"].get("wear")
    if headwear:
        sheet = add_headwear(sheet, frame, cols, 2, headwear)
    return sheet, {"cols": cols, "idle": spans[0], "walk": spans[1]}


def head_crop(image, frame):
    """The head of the first idle frame, grown to a square portrait crop."""
    cell = image.crop((0, 0, frame, frame))
    bbox = cell.getbbox() or (0, 0, frame, frame)
    x0, y0, x1, y1 = bbox
    body_h = y1 - y0
    head_h = max(10, int(body_h * 0.52))
    left = x0 + (x1 - x0) // 2 - head_h // 2 - 2
    top = y0 - 2
    return cell.crop((left, top, left + head_h + 4, top + head_h))


def head_anchor(cell):
    """Where the top of the head actually is in one frame.

    The pawn walks with a two-pixel bob and the archer with a four-pixel one, so
    a hat drawn at fixed coordinates drifts off the skull in half the frames.
    The anchor is derived from the frame itself: the weighted centre of the top
    third of the inked pixels, which is the crown on every upright frame.
    """
    bbox = cell.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    width, height = x1 - x0, y1 - y0
    band = max(4, int(height * 0.34))
    pixels = cell.load()
    total = 0
    weighted = 0
    for y in range(y0, min(y0 + band, y1)):
        for x in range(x0, x1):
            if pixels[x, y][3] > 40:
                total += 1
                weighted += x
    cx = (weighted / total) if total else (x0 + x1) / 2
    return cx, y0, width, height


def add_headwear(sheet, frame, cols, rows, style):
    """Draw a kerchief, cap or straw hat on every upright frame.

    A hat is the cheapest silhouette in pixel art and the only one that survives
    a top-down camera: from above, three peasants in three tunics are three
    circles, but a straw brim, a knotted kerchief and a bare grey head are three
    different shapes at a glance.
    """
    draw = ImageDraw.Draw(sheet, "RGBA")
    for row in range(rows):
        for col in range(cols):
            box = (col * frame, row * frame, (col + 1) * frame, (row + 1) * frame)
            cell = sheet.crop(box)
            anchor = head_anchor(cell)
            if not anchor:
                continue
            cx, top, width, height = anchor
            cx += col * frame
            top += row * frame
            rx = width * 0.42
            ry = max(4.0, height * 0.115)
            if style == "kerchief":
                draw.ellipse((cx - rx * 0.92, top + height * 0.08, cx + rx * 0.92, top + height * 0.30), fill=(0x8E, 0x5A, 0x2C, 255))
                draw.ellipse((cx - rx * 0.84, top + height * 0.10, cx + rx * 0.84, top + height * 0.25), fill=(0xC9, 0x8E, 0x4E, 255))
                draw.ellipse((cx + rx * 0.55, top + height * 0.24, cx + rx * 1.02, top + height * 0.36), fill=(0x7E, 0x45, 0x2A, 255))
            elif style == "straw":
                draw.ellipse((cx - rx * 1.16, top + height * 0.14, cx + rx * 1.16, top + height * 0.14 + ry * 2.4), fill=(0xD9, 0xB0, 0x5A, 255))
                draw.ellipse((cx - rx * 0.68, top - height * 0.04, cx + rx * 0.68, top + height * 0.24), fill=(0xC9, 0x9C, 0x46, 255))
                draw.ellipse((cx - rx * 0.68, top + height * 0.16, cx + rx * 0.68, top + height * 0.24), fill=(0x8E, 0x5A, 0x2C, 255))
            elif style == "cap":
                draw.ellipse((cx - rx * 0.86, top + height * 0.05, cx + rx * 0.86, top + height * 0.26), fill=(0x51, 0x5C, 0x46, 255))
                draw.ellipse((cx - rx * 0.62, top - height * 0.02, cx + rx * 0.62, top + height * 0.16), fill=(0x64, 0x70, 0x54, 255))
    return sheet


def build_portrait(spec, sheet, frame):
    """A round portrait medallion: the villager's own sprite, lit from above.

    The game draws this cast from above, so a head-and-shoulders crop would be a
    picture of the brim of a hat. The portrait is therefore a token — the whole
    body at a size the card can read, the character's own backdrop, an accent
    ring and a cast shadow.

    `scale` is the number that used to be broken: the sprite is ~59 px tall in
    its 192 px cell, and an integer-only multiply rounded that up-scale down to
    1x, which is why every villager used to sit tiny in the middle of an empty
    plate. The body now fills 78 % of the medallion's height, whatever the
    source size is.
    """
    style = spec["portrait"]
    bg = style["bg"]
    accent = style["accent"]

    def mix(base, over, t):
        t = max(0.0, min(1.0, t))
        return tuple(int(round(base[i] + (over[i] - base[i]) * t)) for i in range(3))

    art = Image.new("RGBA", (PORTRAIT, PORTRAIT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(art, "RGBA")

    # Plate: a disc whose top is lit toward the accent and whose rim falls into
    # ink. Painted per pixel and *mixed* — Pillow's draw calls replace pixels
    # instead of blending, so a translucent fill would punch a hole through the
    # plate and leave the page's background showing.
    draw.ellipse((0, 0, PORTRAIT - 1, PORTRAIT - 1), fill=(bg[0], bg[1], bg[2], 255))
    pixels = art.load()
    centre = (PORTRAIT - 1) / 2
    radius = PORTRAIT / 2
    for y in range(PORTRAIT):
        for x in range(PORTRAIT):
            if pixels[x, y][3] == 0:
                continue
            # Normalised position inside the disc: -1 top-left, +1 bottom-right.
            nx = (x - centre) / radius
            ny = (y - centre) / radius
            dist = (nx * nx + ny * ny) ** 0.5
            if dist > 1.0:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            light = max(0.0, 0.5 - 0.5 * (ny - 0.35))  # brighter toward the top
            colour = mix(bg, accent, 0.36 * light)
            colour = mix(colour, (0, 0, 0), 0.42 * min(1.0, dist) ** 2)  # rim falloff
            pixels[x, y] = colour + (255,)

    # The body, lifted out of its 192 px cell and scaled to the medallion.
    cell = sheet.crop((0, 0, frame, frame))
    bbox = cell.getbbox() or (0, 0, frame, frame)
    body = cell.crop(bbox)
    target = PORTRAIT * 0.78
    scale = target / max(1, body.height)
    body = body.resize(
        (max(1, int(round(body.width * scale))), max(1, int(round(body.height * scale)))),
        Image.NEAREST,
    )
    sprite_x = (PORTRAIT - body.width) // 2
    sprite_y = PORTRAIT - body.height - 6
    shadow = mix(bg, (0, 0, 0), 0.6)
    draw.ellipse(
        (sprite_x + 2, sprite_y + body.height - 12, sprite_x + body.width - 2, sprite_y + body.height + 2),
        fill=shadow + (255,),
    )
    art.alpha_composite(body, (sprite_x, sprite_y))

    # Frame: ink rim, accent ring, and a soft inner glow so the token separates
    # from the dialogue card behind it.
    draw.ellipse((0, 0, PORTRAIT - 1, PORTRAIT - 1), outline=(0x16, 0x1C, 0x2E, 255), width=4)
    draw.ellipse((5, 5, PORTRAIT - 6, PORTRAIT - 6), outline=accent + (220,), width=2)
    return art


def build_staff():
    """Old Doren's walking stick: one crooked ash pole with an iron ferrule."""
    width, height = 24, 72
    art = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wood_dark, wood, wood_lit = (0x4A, 0x33, 0x1E), (0x74, 0x51, 0x2E), (0x9C, 0x74, 0x46)
    for y in range(6, height):
        wobble = 2 if y < 26 else (1 if y < 44 else 0)
        x = 10 + wobble
        art.putpixel((x, y), wood_dark + (255,))
        art.putpixel((x + 1, y), wood + (255,))
        art.putpixel((x + 2, y), wood_lit + (255,))
        art.putpixel((x + 3, y), wood_dark + (255,))
    for x in range(9, 16):
        art.putpixel((x, height - 4), (0x50, 0x4E, 0x4A, 255))
        art.putpixel((x, height - 3), (0x3A, 0x38, 0x36, 255))
    # A bound leather grip where the hand goes.
    for y in range(30, 40):
        for x in range(11, 15):
            art.putpixel((x, y), (0x7E, 0x2E, 0x22, 255) if y % 3 else (0x5C, 0x20, 0x18, 255))
    return art


def main():
    os.makedirs(UNITS, exist_ok=True)
    os.makedirs(UI, exist_ok=True)
    manifest = []
    for spec in CAST:
        sheet, info = build_sheet(spec)
        sheet_path = os.path.join(UNITS, f"npc-{spec['id']}.png")
        write_png(sheet_path, sheet)

        portrait = build_portrait(spec, sheet, spec["frame"])
        write_png(os.path.join(UI, f"portrait-{spec['id']}.png"), portrait)

        manifest.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "role": spec["role"],
                "path": f"assets/units/npc-{spec['id']}.png",
                "frame": spec["frame"],
                "cols": info["cols"],
                "idle": info["idle"],
                "walk": info["walk"],
                "scale": spec["scale"],
                "portrait": f"assets/ui/portrait-{spec['id']}.png",
            }
        )
        print(
            f"npc-{spec['id']:<8} {sheet.width}x{sheet.height}  "
            f"idle {info['idle']}  walk {info['walk']}  scale {spec['scale']}"
        )

    write_png(os.path.join(UNITS, "npc-staff.png"), build_staff())
    print(f"wrote {len(CAST)} villager sheets, {len(CAST)} portraits and the staff")
    print("manifest:", manifest)


if __name__ == "__main__":
    sys.exit(main())
