#!/usr/bin/env python3
"""
build_spire_assets.py — turn the original Foozle "Spire" source sheets (CC0) into
the exact textures Forge Defense loads at runtime.

Nothing here is hand-drawn: every output pixel comes from the packs. The script
only crops, trims, re-canvases, palette-remaps (frost accent colours) and packs
sheets. All source sheets are kept unmodified in `src/assets/spire/`.

    python3 scripts/build_spire_assets.py

Geometry conventions used by the game (see src/entities/Tower.js):
  * base sprite  – bottom-centre origin, sits on the bottom edge of its tile
  * weapon sprite – full animation sheet, rotated around the mechanical pivot
                    declared in src/data/towerVisuals.js
"""

import re
import os
import struct
import sys
import zlib
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "assets", "spire")
OUT = os.path.join(ROOT, "public", "assets")

# ---------------------------------------------------------------- PNG helpers


def read_png(path):
    """Minimal RGBA PNG decoder (8-bit, non-interlaced) -> (w, h, bytearray)."""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos, idat, w, h, bitdepth, colourtype = 8, b"", 0, 0, 8, 6
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        if ctype == b"IHDR":
            w, h, bitdepth, colourtype = struct.unpack(">IIBB", chunk[:10])
        elif ctype == b"IDAT":
            idat += chunk
        pos += 12 + length
    assert bitdepth == 8, f"unsupported bit depth {bitdepth} in {path}"
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colourtype]
    raw = zlib.decompress(idat)
    stride = w * channels
    out = bytearray()
    prev = bytearray(stride)
    i = 0
    for _ in range(h):
        filt = raw[i]
        i += 1
        line = bytearray(raw[i : i + stride])
        i += stride
        if filt == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 255
        elif filt == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif filt == 4:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                c = prev[x - channels] if x >= channels else 0
                b = prev[x]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    if channels == 3:
        rgba = bytearray(w * h * 4)
        for i in range(w * h):
            rgba[i * 4 : i * 4 + 3] = out[i * 3 : i * 3 + 3]
            rgba[i * 4 + 3] = 255
        return w, h, rgba
    return w, h, bytes(out)


def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pixels[y * w * 4 : (y + 1) * w * 4]
    comp = zlib.compress(bytes(raw), 9)

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


def blank(w, h):
    return bytearray(w * h * 4)


def crop(pix, sw, sx, sy, w, h):
    out = blank(w, h)
    for y in range(h):
        src = ((sy + y) * sw + sx) * 4
        out[y * w * 4 : (y + 1) * w * 4] = pix[src : src + w * 4]
    return out


def blit(dst, dw, src, sw, sh, dx, dy):
    for y in range(sh):
        ty = dy + y
        if ty < 0:
            continue
        for x in range(sw):
            tx = dx + x
            if tx < 0:
                continue
            si = (y * sw + x) * 4
            a = src[si + 3]
            if not a:
                continue
            di = (ty * dw + tx) * 4
            if a == 255:
                dst[di : di + 4] = src[si : si + 4]
            else:
                ia = 255 - a
                for c in range(3):
                    dst[di + c] = (src[si + c] * a + dst[di + c] * ia) // 255
                dst[di + 3] = min(255, a + dst[di + 3] * ia // 255)


def recolour(pixels, mapping):
    lut = {
        (r, g, b): (v >> 16 & 255, v >> 8 & 255, v & 255)
        for (r, g, b), v in mapping.items()
    }
    out = bytearray(pixels)
    for i in range(0, len(out), 4):
        if out[i + 3] == 0:
            continue
        key = (out[i], out[i + 1], out[i + 2])
        if key in lut:
            out[i], out[i + 1], out[i + 2] = lut[key]
    return out


def content_bbox(pixels, w, h):
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if pixels[row + x * 4 + 3]:
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    return minx, miny, maxx, maxy


def trim(pixels, w, h):
    minx, miny, maxx, maxy = content_bbox(pixels, w, h)
    return crop(pixels, w, minx, miny, maxx - minx + 1, maxy - miny + 1), maxx - minx + 1, maxy - miny + 1


def save(path, pixels, w, h, note=""):
    write_png(path, w, h, pixels)
    tag = f"  {note}" if note else ""
    print(f"  {os.path.relpath(path, ROOT):58s} {w:4d}x{h:<4d}{tag}")


# ------------------------------------------------------------ source manifests

BASE_SHEETS = {
    1: ("bases/tower01.png", 64, 128),
    2: ("bases/tower02.png", 64, 192),
    3: ("bases/tower03.png", 64, 128),
    4: ("bases/tower04.png", 64, 128),
    5: ("bases/tower05.png", 64, 128),
    6: ("bases/tower06.png", 64, 128),
}

# (frame width, frame height) measured per sheet by alpha-column analysis.
WEAPON_SHEETS = {
    (1, 1): (96, 96), (1, 2): (96, 96), (1, 3): (96, 96),
    (2, 1): (48, 96), (2, 2): (64, 128), (2, 3): (64, 128),
    (3, 1): (96, 96), (3, 2): (96, 96), (3, 3): (96, 96),
    (4, 1): (128, 128), (4, 2): (128, 128), (4, 3): (128, 128),
    (5, 1): (96, 96), (5, 2): (96, 96), (5, 3): (96, 96),
    (6, 1): (64, 64), (6, 2): (96, 96), (6, 3): (96, 96),
}

# Tower families used per game slot: lvl1, lvl2, spec-a, spec-b.
TOWER_LAYOUT = {
    "archer": [(1, 1), (1, 2), (6, 3), (1, 3)],
    "cannon": [(3, 1), (3, 2), (3, 3), (4, 3)],
    "frost": [(2, 1), (2, 2), (2, 3), (5, 3)],
}

SLOT_SUFFIX = {0: "", 1: "-lvl2", 2: "-spec-a", 3: "-spec-b"}

FROST_REMAP = {
    # level 2 amber -> glacial violet
    (0xFF, 0xAD, 0x3B): 0x7FA8D8,
    (0xFF, 0xE5, 0x96): 0xD9ECFF,
    (0xDE, 0x6A, 0x38): 0x5B7FB0,
    (0xC9, 0x30, 0x38): 0x3E5C8A,
    # level 3 green -> deep glacial blue
    (0xB4, 0xD6, 0x45): 0x74CFF2,
    (0xFC, 0xF9, 0x60): 0xEAF8FF,
    (0x51, 0xC4, 0x3F): 0x3E8FC4,
    (0x30, 0x9C, 0x63): 0x2A6A9E,
    # level 1 cyan accents, cooled a touch
    (0x63, 0xC2, 0xC9): 0x8FD8F5,
}

LIGHTNING_REMAP = {
    (0xC9, 0x30, 0x38): 0x8E6BE8,
    (0x85, 0x2D, 0x66): 0x4B3A9E,
    (0xDE, 0x6A, 0x38): 0xC3A0FF,
}

ENEMY_SOURCES = {
    "grunt": ("leafbug", 64, 9),
    "runner": ("firebug", 128, 9),
    "brute": ("scorpion", 64, 9),
    "swarm": ("clampbeetle", 64, 9),
    "healer": ("voidbutterfly", 64, 9),
    "shield": ("magma_crab", 64, 9),
    "colossus": ("firewasp", 96, 9),
    "warlord": ("flying_locust", 64, 9),
}


# ---------------------------------------------------------------------- towers


def build_towers():
    print("towers")
    for game_key, slots in TOWER_LAYOUT.items():
        for idx, (family, level) in enumerate(slots):
            suffix = SLOT_SUFFIX[idx]

            sheet_path, fw, fh = BASE_SHEETS[family]
            sw, sh, sheet = read_png(os.path.join(SRC, sheet_path))
            assert sw == fw * 3, (sheet_path, sw)
            base = crop(sheet, sw, (level - 1) * fw, 0, fw, fh)

            weapon_path = os.path.join(SRC, "weapons", f"t{family:02d}_l{level:02d}_weapon.png")
            ww, wh, wsheet = read_png(weapon_path)
            wfw, wfh = WEAPON_SHEETS[(family, level)]
            assert ww % wfw == 0, (weapon_path, ww, wfw)
            if wh == wfh * 2:
                # Tower 05 L3 is exported as two stacked rows of 96x96 frames:
                # the idle loop on top, the firing animation underneath. Keep the
                # firing row so every weapon sheet in the game is one row tall.
                wsheet = crop(wsheet, ww, 0, wfh, ww, wfh)
                wh = wfh

            if game_key == "frost":
                base = recolour(base, FROST_REMAP)
                wsheet = recolour(wsheet, FROST_REMAP)
            if game_key == "frost" and idx == 3:
                base = recolour(base, LIGHTNING_REMAP)
                wsheet = recolour(wsheet, LIGHTNING_REMAP)

            # --- base: trimmed, 64 wide, bottom row = tile bottom
            tb, bw, bh = trim(base, fw, fh)
            if bw > 64:
                # Some level-3 keeps are 64 wide already; guard anyway.
                bw = 64
                tb = crop(tb, 64, 0, 0, 64, bh)
            out = blank(64, bh)
            blit(out, 64, tb, bw, bh, (64 - bw) // 2, 0)
            save(
                os.path.join(OUT, "towers", f"base_{game_key}{suffix}.png"),
                out, 64, bh,
                f"<- Tower {family:02d} L{level}",
            )

            # --- weapon: keep the full sheet for Phaser spritesheet loading
            save(
                os.path.join(OUT, "towers", f"weapon_{game_key}{suffix}.png"),
                wsheet, ww, wh,
                f"<- T{family:02d} L{level} {ww // wfw}f of {wfw}x{wfh}",
            )


def key_out_grass(sheet, w, h, tol=10):
    """Make the tileset's grass fringe transparent so a cropped module sits on
    the road instead of carrying a green halo."""
    out = bytearray(sheet)
    for i in range(0, w * h * 4, 4):
        r, g, b, a = out[i : i + 4]
        if a and g > r + tol and g > b + tol:
            out[i + 3] = 0
    return bytes(out)


def drop_shadow(sheet, w, h, cx, cy, rx, ry, alpha):
    """Paint a soft elliptical contact shadow underneath a sprite."""
    out = bytearray(sheet)
    for y in range(max(0, int(cy - ry)), min(h, int(cy + ry) + 1)):
        for x in range(max(0, int(cx - rx)), min(w, int(cx + rx) + 1)):
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            d = nx * nx + ny * ny
            if d > 1:
                continue
            i = (y * w + x) * 4
            fade = (1 - d) * alpha
            a = out[i + 3] / 255
            base = fade / 255
            if a <= 0:
                out[i], out[i + 1], out[i + 2] = 0, 0, 0
                out[i + 3] = int(fade)
            else:
                out[i + 3] = min(255, int(out[i + 3] + fade * (1 - a)))
    return out


def build_barricade():
    """Road obstacle.

    The Spire tileset ships no single-tile fence prop, but its wooden walkway
    section is a clean plank field with stone end-posts. Rotated a quarter turn
    those planks become the vertical stakes of a palisade, which is exactly the
    silhouette a barricade needs in top-down view. Level 2 is the same palisade
    with the timber iron-bound, so the upgrade reads as reinforcement.
    """
    print("barricade")
    gw, gh, grass = read_png(os.path.join(SRC, "tileset", "grass.png"))

    bay = crop(grass, gw, 512, 861, 64, 99)
    rot = blank(99, 64)
    for y in range(99):
        for x in range(64):
            si = (y * 64 + x) * 4
            if bay[si + 3] == 0:
                continue
            di = (x * 99 + (98 - y)) * 4
            rot[di : di + 4] = bay[si : si + 4]

    # Keep the plank field plus its stone post (x 34..94), dropping the walkway's
    # white inner edge on the left and the dirt shoulder on the right.
    panel = crop(rot, 99, 34, 0, 60, 64)
    # Cap the stakes with the walkway's stone coping, laid horizontally, so the
    # barrier has a readable top edge instead of a cut plank end.
    rail = crop(grass, gw, 512, 861, 60, 12)
    blit(panel, 60, rail, 60, 12, 0, 0)

    def ground(sheet):
        """Place the panel on a taller canvas so its contact shadow is visible."""
        out = blank(60, 72)
        blit(out, 60, sheet, 60, 64, 0, 0)
        return drop_shadow(out, 60, 72, 30, 66, 26, 6, 90)

    save(os.path.join(OUT, "towers", "barricade.png"), ground(panel), 60, 72, "<- wooden palisade")

    iron = recolour(
        panel,
        {
            (207, 117, 43): 0x8E96AE,
            (171, 81, 48): 0x5F6880,
            (245, 255, 232): 0xE4EAF6,
        },
    )
    save(os.path.join(OUT, "towers", "barricade_lvl2.png"), ground(iron), 60, 72, "<- iron-bound palisade")


# ---------------------------------------------------------------------- terrain


def build_tiles():
    print("terrain")
    gw, gh, grass = read_png(os.path.join(SRC, "tileset", "grass.png"))

    def tile(x, y, name, note=""):
        save(os.path.join(OUT, "tiles", f"{name}.png"), crop(grass, gw, x, y, 64, 64), 64, 64, note)

    SAND = crop(grass, gw, 384, 128, 64, 64)          # plain, borderless sand
    STRIP = {                                          # one ragged sand/grass edge
        "n": crop(grass, gw, 384, 64, 64, 64),
        "s": crop(grass, gw, 384, 192, 64, 64),
        "w": crop(grass, gw, 320, 128, 64, 64),
        "e": crop(grass, gw, 448, 128, 64, 64),
    }
    CORNER = {                                         # two adjacent ragged edges
        "nw": crop(grass, gw, 320, 64, 64, 64),
        "ne": crop(grass, gw, 448, 64, 64, 64),
        "sw": crop(grass, gw, 320, 192, 64, 64),
        "se": crop(grass, gw, 448, 192, 64, 64),
    }
    ISOLATED = crop(grass, gw, 128, 128, 64, 64)       # sand island, grass all round

    def overlay(base, layer):
        """Copy every pixel of `layer` that is not identical to plain sand."""
        out = bytearray(base)
        for i in range(0, len(out), 4):
            if layer[i : i + 4] != SAND[i : i + 4]:
                out[i : i + 4] = layer[i : i + 4]
        return out

    # Road autotile: `mask` bits say which neighbours are ROAD (1 = road).
    # A side needs the ragged grass border when that neighbour is grass.
    def road_tile(mask):
        grass_sides = [s for bit, s in ((1, "n"), (2, "e"), (4, "s"), (8, "w")) if not mask & bit]
        gs = set(grass_sides)
        if not grass_sides:
            return SAND
        if gs == {"n", "s"}:
            return overlay(overlay(SAND, STRIP["n"]), STRIP["s"])
        if gs == {"e", "w"}:
            return overlay(overlay(SAND, STRIP["e"]), STRIP["w"])
        if gs == {"n", "e", "s", "w"}:
            return ISOLATED
        corners = {"nw": ("n", "w"), "ne": ("n", "e"), "sw": ("s", "w"), "se": ("s", "e")}
        for name, (a, b) in corners.items():
            if gs == {a, b}:
                return CORNER[name]
        # Three-sided end caps (only 2 tiles on the shipped map): corner art plus
        # the missing strip, which reads correctly at a glance.
        if len(gs) == 3:
            missing = ({"n", "e", "s", "w"} - gs).pop()
            pair = {"n": "sw", "s": "nw", "e": "nw", "w": "ne"}[missing]
            return overlay(CORNER[pair], STRIP[missing])
        return overlay(SAND, STRIP[grass_sides[0]])

    for mask in range(16):
        save(os.path.join(OUT, "tiles", f"road_{mask}.png"), road_tile(mask), 64, 64, f"mask {mask:04b}")

    # Seamless plain grass / rock / foliage.
    tile(128, 64, "grass", "seamless")

    rock = crop(grass, gw, 848, 845, 33, 36)
    rock_out = blank(64, 64)
    blit(rock_out, 64, rock, 33, 36, 15, 18)
    save(os.path.join(OUT, "tiles", "rock.png"), rock_out, 64, 64, "<- boulder prop")

    # Water: a plain, borderless lake fill taken from inside the shoreline module.
    ww, wh, water = read_png(os.path.join(SRC, "tileset", "water.png"))
    save(os.path.join(OUT, "tiles", "water.png"), crop(water, ww, 184, 72, 64, 64), 64, 64, "lake fill")

    # Foliage: oak tree prop
    save(os.path.join(OUT, "tiles", "foliage.png"), crop(grass, gw, 832, 384, 64, 64), 64, 64, "tree prop")


# ------------------------------------------------------------------- projectiles


def split_columns(pixels, w, h):
    """Split a strip into the runs of columns that contain any pixel."""
    ink = []
    for x in range(w):
        col = False
        for y in range(h):
            if pixels[(y * w + x) * 4 + 3]:
                col = True
                break
        ink.append(col)
    runs = []
    start = None
    for x in range(w):
        if ink[x] and start is None:
            start = x
        elif not ink[x] and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, w - 1))
    return runs


def pick_frame(w, h, ink_runs, prefer="formed"):
    """Work out the frame size of a horizontal projectile/impact strip.

    Spire lays these out as square frames as tall as the sheet, so the frame
    count is width/height. Exception: the ballista bolt strips are taller than
    they are wide, so the frame width is the strip width divided by the number
    of ink runs. Returns (frame index, frame width).
    """
    if w % h == 0 and w // h >= 2:
        return (max(0, (w // h) // 2) if prefer == "middle" else min(1, w // h - 1)), h
    n = max(1, ink_runs)
    return (max(0, n // 2) if prefer == "middle" else 0), w // n


def build_projectiles():
    print("projectiles")
    jobs = [
        ("proj-arrow", 1, 1, "bolt (scout ballista)"),
        ("proj-rapid", 1, 2, "double bolt (twin ballista)"),
        ("proj-sniper", 1, 3, "heavy bolt (sniper)"),
        ("proj-cannonball", 3, 1, "sling stone"),
        ("proj-frost", 2, 1, "ice shard"),
        ("proj-frost-2", 2, 2, "ice shard (level 2)"),
        ("proj-frost-3", 2, 3, "ice shard (level 3)"),
        ("proj-lightning", 5, 1, "arcane orb + arc"),
        ("proj-hammer", 4, 3, "hammer shockwave"),
    ]
    for key, family, level, note in jobs:
        path = os.path.join(SRC, "weapons", f"t{family:02d}_l{level:02d}_Projectile.png")
        w, h, sheet = read_png(path)
        if family == 2:
            sheet = recolour(sheet, FROST_REMAP)
        if family == 5:
            sheet = recolour(sheet, LIGHTNING_REMAP)

        runs = split_columns(sheet, w, h)
        if not runs:
            print(f"  (skip {key}: empty sheet)")
            continue
        idx, fw = pick_frame(w, h, len(runs))
        src = crop(sheet, w, idx * fw, 0, fw, h)
        tb, tw, th = trim(src, fw, h)
        pad = 3
        out = blank(tw + pad * 2, th + pad * 2)
        blit(out, tw + pad * 2, tb, tw, th, pad, pad)
        save(os.path.join(OUT, "projectiles", f"{key}.png"), out, tw + pad * 2, th + pad * 2,
             f"{note} ({len(runs)} frames in strip)")


# ---------------------------------------------------------------------- enemies


def build_enemies():
    print("enemies")
    for key, (sprite, fw, frames) in ENEMY_SOURCES.items():
        path = os.path.join(SRC, "enemies", f"{sprite}.png")
        w, h, sheet = read_png(path)
        fh = h // frames
        assert h % frames == 0, (path, h, frames)
        # Copy the sheet verbatim, dropping only fully transparent padding rows
        # is unnecessary: Phaser slices it with frameWidth/frameHeight.
        save(
            os.path.join(OUT, "enemies", f"enemy-{key}.png"),
            sheet, w, h,
            f"<- {sprite} {w // fw}x{frames} frames of {fw}x{fh}",
        )


# ------------------------------------------------------------------- ui cards


def read_slot_layout():
    """Pull the per-slot base/weapon/mount data straight out of the JS contract so
    the HUD cards are composed the same way the game composes the tower."""
    src = open(os.path.join(ROOT, "src", "data", "towerVisuals.js")).read()
    layout = {}
    for m in re.finditer(
        r"\{ file: '([\w-]+)', base: '([\w.-]+)', weapon: '([\w.-]+)', "
        r"fw: \d+, fh: \d+, frames: \d+, px: (\d+), py: (\d+), mount: (\d+)",
        src,
    ):
        layout[m.group(1)] = {
            "base": m.group(2),
            "weapon": m.group(3),
            "px": int(m.group(4)),
            "py": int(m.group(5)),
            "mount": int(m.group(6)),
        }
    return layout


def build_ui_cards():
    """Build-menu icons: the tower's level-1 base with its weapon mounted, cropped
    to the upper part of the structure where the weapon reads."""
    print("ui cards")
    layout = read_slot_layout()
    size = 64
    for key, slot in (("archer", "archer"), ("cannon", "cannon"), ("frost", "frost")):
        v = layout[slot]
        bw, bh, base = read_png(os.path.join(OUT, "towers", v["base"]))
        ww, wh, wep = read_png(os.path.join(OUT, "towers", v["weapon"]))
        canvas_h = max(bh, v["mount"] + v["py"]) + 8
        comp = blank(64, canvas_h)
        blit(comp, 64, base, bw, bh, (64 - bw) // 2, canvas_h - bh)
        pivot_y = canvas_h - v["mount"]
        blit(comp, 64, wep, ww, v["py"], 32 - v["px"], pivot_y - v["py"])
        # Frame the icon on the weapon, with the platform under it.
        top = max(0, min(canvas_h - size, pivot_y - 36))
        card = crop(comp, 64, 0, top, 64, size)
        save(os.path.join(OUT, "ui", f"card_{key}.png"), card, size, size, "<- tower art")

    # Barricade has no weapon: show the fence centred in the icon.
    w, h, pix = read_png(os.path.join(OUT, "towers", "barricade.png"))
    tb, tw, th = trim(pix, w, h)
    card = blank(size, size)
    blit(card, size, tb, tw, th, (size - tw) // 2, size - th)
    save(os.path.join(OUT, "ui", "card_barricade.png"), card, size, size, "<- palisade art")


# --------------------------------------------------------------------- effects


def build_effects():
    """Impact animations, exported as square-frame strips so they can be played.

    Each Spire tower ships its own impact strip; towers 01 and 06 (the two
    archery towers) place it once per tower ("Weapon - Impact") instead of per
    level, so they are addressed by their own filename.
    """
    print("effects")
    jobs = [
        ("impact-arrow", "t01_Weapon__Impact.png", 0, "bolt impact"),
        ("impact-rapid", "t06_Weapon__Impact.png", 0, "rapid bolt impact"),
        ("impact-frost", "t02_l01_Projectile__Impact.png", 2, "ice shatter"),
        ("impact-frost-2", "t02_l02_Projectile__Impact.png", 2, "ice shatter (level 2)"),
        ("impact-frost-3", "t02_l03_Projectile__Impact.png", 2, "ice shatter (level 3)"),
        ("impact-cannon", "t03_l01_Projectile__Impact.png", 2, "stone shatter"),
        ("impact-cannon-2", "t04_l01_Projectile__Impact.png", 2, "explosive shell"),
        ("impact-lightning", "t05_l01_Projectile__Impact.png", 2, "lightning burst"),
        ("impact-hammer", "t04_l03_Projectile__Impact.png", 2, "heavy shell"),
    ]
    manifest = {}
    for key, filename, family, note in jobs:
        path = os.path.join(SRC, "weapons", filename)
        assert os.path.exists(path), path
        w, h, sheet = read_png(path)
        if family == 2:
            sheet = recolour(sheet, FROST_REMAP)
        assert w % h == 0, (path, w, h)
        frames = w // h
        save(os.path.join(OUT, "effects", f"{key}.png"), sheet, w, h, f"{note} ({frames} frames of {h}x{h})")
        manifest[key] = {"file": f"{key}.png", "frameWidth": h, "frameHeight": h, "frames": frames}
    return manifest


def build_enemy_manifest():
    """Measure every enemy strip: 9 rows = idle/move/death x 3 colour variants."""
    print("enemy manifest")
    manifest = {}
    for key, (sprite, fw, rows) in ENEMY_SOURCES.items():
        path = os.path.join(OUT, "enemies", f"enemy-{key}.png")
        w, h, pix = read_png(path)
        fh = h // rows
        cols = w // fw
        counts = []
        for row in range(rows):
            n = 0
            for col in range(cols):
                ink = 0
                for y in range(row * fh, (row + 1) * fh):
                    base = y * w + col * fw
                    for x in range(fw):
                        if pix[(base + x) * 4 + 3]:
                            ink += 1
                            break
                if ink:
                    n += 1
            counts.append(n)
        # Ink bounds of the first idle frame: the game scales sprites by their
        # drawn width, not the frame width, so a wide sheet (128 px) and a narrow
        # one (64 px) end up the same on-screen size.
        x0, y0, x1, y1 = fw, fh, -1, -1
        for y in range(fh):
            for x in range(fw):
                if pix[(y * w + x) * 4 + 3]:
                    x0, y0 = min(x0, x), min(y0, y)
                    x1, y1 = max(x1, x), max(y1, y)
        manifest[key] = {
            "file": os.path.basename(path),
            "frameWidth": fw,
            "frameHeight": fh,
            "artWidth": x1 - x0 + 1,
            "artHeight": y1 - y0 + 1,
            "idle": counts[0],
            "move": counts[3],
            "death": counts[6],
        }
        print(f"  {key:16s} {fw}x{fh} idle={counts[0]} move={counts[3]} death={counts[6]}")
    return manifest


def write_manifest(enemies, impacts):
    path = os.path.join(ROOT, "src", "data", "spireManifest.js")
    lines = [
        "/**",
        " * spireManifest.js — GENERATED by scripts/build_spire_assets.py.",
        " * Do not edit by hand: re-run the script after changing the source sheets.",
        " *",
        " * Frame sizes and frame counts measured from the real Foozle \"Spire\" PNGs.",
        " * Enemy strips hold 9 rows: idle / move / death x 3 colour variants.",
        " */",
        "",
        "export const ENEMY_SHEETS = {",
    ]
    for key, m in enemies.items():
        lines.append(
            f"  {key!r}: {{ file: {m['file']!r}, frameWidth: {m['frameWidth']}, "
            f"frameHeight: {m['frameHeight']}, artWidth: {m['artWidth']}, artHeight: {m['artHeight']}, "
            f"idle: {m['idle']}, move: {m['move']}, death: {m['death']} }},"
        )
    lines += ["};", "", "export const IMPACT_SHEETS = {"]
    for key, m in impacts.items():
        lines.append(
            f"  {key!r}: {{ file: {m['file']!r}, frameWidth: {m['frameWidth']}, "
            f"frameHeight: {m['frameHeight']}, frames: {m['frames']} }},"
        )
    lines += ["};", ""]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write("\n".join(lines))
    print(f"  wrote {os.path.relpath(path, ROOT)}")


def main():
    build_towers()
    build_barricade()
    build_tiles()
    build_projectiles()
    build_enemies()
    build_ui_cards()
    impacts = build_effects()
    enemies = build_enemy_manifest()
    write_manifest(enemies, impacts)
    print("done")


if __name__ == "__main__":
    main()
