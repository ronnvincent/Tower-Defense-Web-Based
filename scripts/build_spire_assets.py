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
import shutil
import struct
import sys
import zlib
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "assets")
SRC = os.path.join(ASSETS, "spire")
OUT = os.path.join(ROOT, "public", "assets")

# ---------------------------------------------------------------- PNG helpers


ADAM7 = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))


def _unfilter_rows(raw, offset, width, height, channels):
    """Undo the per-scanline PNG filters for one (sub)image."""
    stride = width * channels
    rows = []
    prev = bytearray(stride)
    i = offset
    for _ in range(height):
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
        rows.append(line)
        prev = line
    return rows, i


def read_png(path):
    """Minimal RGBA PNG decoder (8-bit) -> (w, h, bytearray).

    Handles the three layouts the CC0 packs actually ship: RGBA, RGB and
    Adam7 interlacing (every Kenney "towerDefense_tile" is interlaced, so
    skipping this decodes them into rainbow noise instead of art).
    """
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos, idat, w, h, bitdepth, colourtype, interlace = 8, b"", 0, 0, 8, 6, 0
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        if ctype == b"IHDR":
            w, h, bitdepth, colourtype, _, _, interlace = struct.unpack(">IIBBBBB", chunk[:13])
        elif ctype == b"IDAT":
            idat += chunk
        pos += 12 + length
    assert bitdepth == 8, f"unsupported bit depth {bitdepth} in {path}"
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colourtype]
    raw = zlib.decompress(idat)

    if interlace == 0:
        rows, _ = _unfilter_rows(raw, 0, w, h, channels)
        out = b"".join(rows)
    else:
        merged = bytearray(w * h * channels)
        offset = 0
        for x0, y0, dx, dy in ADAM7:
            pw = (w - x0 + dx - 1) // dx
            ph = (h - y0 + dy - 1) // dy
            if pw <= 0 or ph <= 0:
                continue
            rows, offset = _unfilter_rows(raw, offset, pw, ph, channels)
            for ry, row in enumerate(rows):
                dst_y = y0 + ry * dy
                for rx in range(pw):
                    dst_x = x0 + rx * dx
                    di = (dst_y * w + dst_x) * channels
                    merged[di : di + channels] = row[rx * channels : (rx + 1) * channels]
        out = bytes(merged)

    if channels == 3:
        rgba = bytearray(w * h * 4)
        for i in range(w * h):
            rgba[i * 4 : i * 4 + 3] = out[i * 3 : i * 3 + 3]
            rgba[i * 4 + 3] = 255
        return w, h, rgba
    assert channels == 4, f"unsupported colour type {colourtype} in {path}"
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


def hsl(r, g, b):
    """RGB (0-255) -> (hue 0..1, saturation 0..1, lightness 0..1)."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(rf, gf, bf), min(rf, gf, bf)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    sat = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == rf:
        h = ((gf - bf) / d) % 6
    elif mx == gf:
        h = (bf - rf) / d + 2
    else:
        h = (rf - gf) / d + 4
    return h / 6.0, sat, l


def rgb_from_hsl(h, s, l):
    if s <= 0:
        v = round(max(0.0, min(1.0, l)) * 255)
        return v, v, v
    q = l * (1 + s) if l < 0.5 else l + s - l * s
    p = 2 * l - q

    def channel(t):
        t %= 1.0
        if t < 1 / 6:
            v = p + (q - p) * 6 * t
        elif t < 1 / 2:
            v = q
        elif t < 2 / 3:
            v = p + (q - p) * (2 / 3 - t) * 6
        else:
            v = p
        return round(max(0.0, min(1.0, v)) * 255)

    return channel(h + 1 / 3), channel(h), channel(h - 1 / 3)


def hex_to_rgb(value):
    return (value >> 16) & 255, (value >> 8) & 255, value & 255


def mix(stops, t):
    """Sample a dark -> light ramp of `stops` (RGB tuples) at t in [0, 1]."""
    t = max(0.0, min(1.0, t))
    pos = t * (len(stops) - 1)
    i = min(len(stops) - 2, int(pos))
    f = pos - i
    a, b = stops[i], stops[i + 1]
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))


def scale_pixels(pixels, w, h, factor):
    """Nearest-neighbour upscale — keeps the pixel-art grid intact."""
    nw, nh = w * factor, h * factor
    out = bytearray(nw * nh * 4)
    for y in range(nh):
        row = (y // factor) * w
        for x in range(nw):
            si = (row + x // factor) * 4
            di = (y * nw + x) * 4
            out[di : di + 4] = pixels[si : si + 4]
    return nw, nh, out


def tint_pixels(pixels, value, alpha=255):
    """Replace RGB with a flat colour, optionally scaling the source alpha."""
    r, g, b = hex_to_rgb(value)
    out = bytearray(pixels)
    for i in range(0, len(out), 4):
        out[i], out[i + 1], out[i + 2] = r, g, b
        out[i + 3] = out[i + 3] * alpha // 255
    return out


def hue_transform(pixels, dh, sat_scale=1.0, light_add=0.0, light_scale=1.0):
    """Rotate every pixel's hue and re-grade it — a whole-sheet palette shift.

    Used for the bosses: the same silhouettes as the elite creeps, recoloured
    into their own element so a boss never reads as "a big grunt".
    """
    out = bytearray(pixels)
    lut = {}
    for i in range(0, len(out), 4):
        if out[i + 3] == 0:
            continue
        key = (out[i], out[i + 1], out[i + 2])
        rgb = lut.get(key)
        if rgb is None:
            h, s, l = hsl(*key)
            h = (h + dh) % 1.0
            s = max(0.0, min(1.0, s * sat_scale))
            l = max(0.0, min(1.0, l * light_scale + light_add))
            rgb = rgb_from_hsl(h, s, l)
            lut[key] = rgb
        out[i], out[i + 1], out[i + 2] = rgb
    return out


def duotone(pixels, stops):
    """Re-grade a sheet onto a single dark -> light ramp (alpha untouched).

    Bosses use this: the elite silhouettes keep their shape but lose their
    original colours, so a 2x giant never reads as "the same creep again".
    """
    ramp = [hex_to_rgb(value) for value in stops]
    out = bytearray(pixels)
    lut = {}
    for i in range(0, len(out), 4):
        if out[i + 3] == 0:
            continue
        key = (out[i], out[i + 1], out[i + 2])
        rgb = lut.get(key)
        if rgb is None:
            rgb = mix(ramp, hsl(*key)[2])
            lut[key] = rgb
        out[i], out[i + 1], out[i + 2] = rgb
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
    # Forge lines — the three extra defences from the "make it gentler" pass.
    # T04 (hammer keep) is the only family with a hammer weapon, so the two
    # Hammerforge branches share its level-3 sheet and are told apart by the
    # STORM recolour; the same trick separates the two Banner Keep branches.
    "forge": [(4, 1), (4, 2), (4, 3), (4, 3)],
    "runes": [(5, 1), (5, 2), (5, 3), (5, 3)],
    "banner": [(6, 1), (6, 2), (6, 3), (6, 3)],
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

# Storm-blue shift for the Thunderforge branch (T04 level 3 green -> electric).
STORM_REMAP = {
    (0xB4, 0xD6, 0x45): 0x5FD8FF,
    (0xFC, 0xF9, 0x60): 0xE9FBFF,
    (0x51, 0xC4, 0x3F): 0x3FA9D8,
    (0x30, 0x9C, 0x63): 0x2A6A9E,
}

# Violet shift for the Arcane Nova branch (T05 level 3 crimson -> arcane).
ARCANE_REMAP = {
    (0xDE, 0x6A, 0x38): 0xC3A0FF,
    (0xC9, 0x30, 0x38): 0x8E6BE8,
    (0xF7, 0xA4, 0x8B): 0xE3D6FF,
    (0xC2, 0x71, 0x82): 0x7B5FC4,
}

# Royal shift for the Muster Camp branch (T06 level 3 leather -> gold/navy).
GOLD_REMAP = {
    (0xB5, 0x80, 0x57): 0xF0C060,
    (0x8A, 0x50, 0x3E): 0xB8862F,
    (0x2B, 0x2E, 0x42): 0x2E3F73,
}

# Keyed by output file stem (`<game_key><suffix>`) so only the *second*
# specialisation is recoloured — banner-spec-a keeps the stock blue banner.
TOWER_SLOT_REMAPS = {
    "forge-spec-b": STORM_REMAP,
    "runes-spec-b": ARCANE_REMAP,
    "banner-spec-b": GOLD_REMAP,
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
            slot_remap = TOWER_SLOT_REMAPS.get(f"{game_key}{suffix}")
            if slot_remap:
                base = recolour(base, slot_remap)
                wsheet = recolour(wsheet, slot_remap)

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


# ---------------------------------------------------------------- terrain themes

# Every colour the two Spire terrain sheets use, tagged with its job. Terrain
# needs per-role ramps (a road must stay a road), so a blanket hue rotation is
# not an option; instead each role is re-graded onto the level's own ramp.
TERRAIN_ROLES = {
    "ground": [0x63AB3F, 0x3B7D4F, 0xC8D45D],
    "road": [0xFFAE70, 0xCF752B, 0xAB5130],
    "stone": [0xA3A7C2, 0x686F99, 0x404973, 0x2C354D, 0x14182E],
    "accent": [0xBD6A62, 0x8F4D57, 0x7D3833],
    "water": [0x92E8C0, 0xD7F8DC, 0xAFEECB, 0xC4F3D4],
    "ink_dark": [0x21181B, 0x3B2027, 0x52333F, 0x2F5753],
    "ink_light": [0xDFE0E8, 0xF5FFE8],
}

# dark -> mid -> light per role. The grassland keeps the untouched artwork.
THEME_RAMPS = {
    "desert": {
        "ground": [0x5E5326, 0x8C7C3C, 0xC9B063],
        "road": [0x7A4B24, 0xC08A4E, 0xF2D9A6],
        "stone": [0x6E6355, 0x9E9078, 0xE8D8B6],
        "accent": [0x5E2417, 0x9C4026, 0xD9784A],
        "water": [0x2F7E74, 0x53A996, 0x9FDFC6],
        "ink_dark": [0x1E150C, 0x332515, 0x4A3720],
        "ink_light": [0xE8D9B8, 0xF7EDD6, 0xFFF8E8],
    },
    "ice": {
        "ground": [0x4E6273, 0x8AA3B8, 0xE4F1FA],
        "road": [0x6C8496, 0x9FB6C9, 0xE9F6FF],
        "stone": [0x4B5A66, 0x7E93A2, 0xD9E9F3],
        "accent": [0x473A5C, 0x6E5A8F, 0xB79BD8],
        "water": [0x1B4A6E, 0x2E6D96, 0x4E93BD],
        "ink_dark": [0x0D161E, 0x1B2A36, 0x2C3F4E],
        "ink_light": [0xE6F3FB, 0xF6FCFF, 0xFFFFFF],
    },
    "volcanic": {
        "ground": [0x1E181B, 0x3A3036, 0x5E5258],
        "road": [0x4A2418, 0x7E3A22, 0xB5613A],
        "stone": [0x322C30, 0x554B51, 0x877A80],
        "accent": [0x6E1508, 0xC03A15, 0xFFAE5C],
        "water": [0x5E0F05, 0xB83410, 0xFF8A3C],
        "ink_dark": [0x080506, 0x120C0E, 0x1E151A],
        "ink_light": [0xD9C6B8, 0xF0DFCD, 0xFFF0DE],
    },
}

ROLE_OF_COLOUR = {}
for _role, _colours in TERRAIN_ROLES.items():
    for _hex in _colours:
        ROLE_OF_COLOUR[hex_to_rgb(_hex)] = _role


def role_of(rgb):
    role = ROLE_OF_COLOUR.get(rgb)
    if role:
        return role
    h, sat, light = hsl(*rgb)
    if light > 0.88 and sat < 0.25:
        return "ink_light"
    if light < 0.14:
        return "ink_dark"
    deg = h * 360
    if 65 <= deg <= 175:
        return "ground"
    if 15 <= deg < 65:
        return "road"
    if deg >= 300 or deg < 15:
        return "accent"
    if 175 <= deg < 235:
        return "water"
    return "stone"


def theme_mapping(sheets, ramps):
    """Build a {(r,g,b): 0xRRGGBB} LUT that re-grades a whole tileset."""
    colours = set()
    for pixels in sheets:
        for i in range(0, len(pixels), 4):
            if pixels[i + 3]:
                colours.add((pixels[i], pixels[i + 1], pixels[i + 2]))

    groups = {}
    for colour in colours:
        groups.setdefault(role_of(colour), []).append(colour)

    mapping = {}
    for role, members in groups.items():
        stops = [hex_to_rgb(value) for value in ramps[role]]
        if role in ("ink_light", "ink_dark"):
            for colour in members:
                mapping[colour] = mix(stops, hsl(*colour)[2])
            continue
        lights = [hsl(*colour)[2] for colour in members]
        lo, hi = min(lights), max(lights)
        for colour in members:
            light = hsl(*colour)[2]
            t = 0.5 if hi - lo < 1e-6 else (light - lo) / (hi - lo)
            mapping[colour] = mix(stops, t)
    return {colour: (v[0] << 16 | v[1] << 8 | v[2]) for colour, v in mapping.items()}


def build_tiles():
    print("terrain")
    gw, gh, grass = read_png(os.path.join(SRC, "tileset", "grass.png"))
    ww, wh, water = read_png(os.path.join(SRC, "tileset", "water.png"))

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

    # 1. Compose the grassland set once, in memory.
    tiles = {f"road_{mask}": road_tile(mask) for mask in range(16)}
    tiles["grass"] = crop(grass, gw, 128, 64, 64, 64)   # seamless

    rock = crop(grass, gw, 848, 845, 33, 36)
    rock_out = blank(64, 64)
    blit(rock_out, 64, rock, 33, 36, 15, 18)
    tiles["rock"] = rock_out

    # Water: a plain, borderless lake fill taken from inside the shoreline module.
    tiles["water"] = crop(water, ww, 184, 72, 64, 64)

    # Foliage: oak tree prop
    tiles["foliage"] = crop(grass, gw, 832, 384, 64, 64)

    sheets = [tiles["road_15"], tiles["grass"], tiles["water"], tiles["rock"], tiles["foliage"]]

    # 2. Write grassland under the plain keys, then one recoloured set per theme.
    for name, pixels in tiles.items():
        note = "seamless" if name == "grass" else ""
        save(os.path.join(OUT, "tiles", f"{name}.png"), pixels, 64, 64, note)

    for theme, ramps in THEME_RAMPS.items():
        lut = theme_mapping(sheets, ramps)
        for name, pixels in tiles.items():
            save(
                os.path.join(OUT, "tiles", f"{name}-{theme}.png"),
                recolour(pixels, lut),
                64,
                64,
                f"{theme} variant",
            )


# ------------------------------------------------------------------------ bosses

# Bosses are the same Foozle strips as the elite creeps, pulled bigger and
# re-graded into their own element: the player reads "that one is different"
# from the silhouette + colour at a glance, without a second art pack.
# key: (source sprite, source frame width, rows, upscale, duotone ramp)
BOSS_SOURCES = {
    "sandwyrm": ("scorpion", 64, 9, 2, (0x2A1A0C, 0x8A5A2A, 0xFFD98A, 0xFFF3D0)),
    "frostwarden": ("magma_crab", 64, 9, 2, (0x10202E, 0x33607F, 0x9FD4EF, 0xF2FBFF)),
    "magmalord": ("firewasp", 96, 9, 2, (0x1E0806, 0x8C2A0E, 0xFFA23C, 0xFFE9B0)),
}


def build_bosses():
    print("bosses")
    for key, (sprite, fw, rows, scale, ramp) in BOSS_SOURCES.items():
        path = os.path.join(SRC, "enemies", f"{sprite}.png")
        w, h, sheet = read_png(path)
        assert w % fw == 0, (path, w, fw)
        graded = duotone(sheet, ramp)
        nw, nh, big = scale_pixels(graded, w, h, scale)
        save(
            os.path.join(OUT, "enemies", f"enemy-{key}.png"),
            big,
            nw,
            nh,
            f"<- {sprite} x{scale} ({fw * scale}px frames)",
        )


# ----------------------------------------------------------------------- UI art

def read_map_layouts():
    """Pull the ASCII battlefields out of src/data/mapData.js (single source)."""
    src = open(os.path.join(ROOT, "src", "data", "mapData.js")).read()
    base = re.search(r"export const MAP_LAYOUT = \[(.*?)\n\];", src, re.S).group(1)
    layouts = {"grassland": re.findall(r"'([^']*)'", base)}
    body = re.search(r"export const MAPS = \{(.*?)\n\};", src, re.S).group(1)
    parts = re.split(r"\n\s{2}(\w+):\s*", "\n" + body)
    for i in range(1, len(parts) - 1, 2):
        name, chunk = parts[i], parts[i + 1]
        if "MAP_LAYOUT" in chunk:
            layouts[name] = layouts["grassland"]
        else:
            layouts[name] = re.findall(r"'([^']*)'", chunk)
    return layouts


def average_colour(pixels, w, h, x0, y0, size):
    r = g = b = n = 0
    for y in range(y0, min(h, y0 + size)):
        for x in range(x0, min(w, x0 + size)):
            i = (y * w + x) * 4
            if pixels[i + 3] < 200:
                continue
            r += pixels[i]
            g += pixels[i + 1]
            b += pixels[i + 2]
            n += 1
    if not n:
        return (24, 22, 28)
    return (r // n, g // n, b // n)


def build_ui_icons():
    """Stars / lock / gem for the campaign screens, all from the CC0 packs."""
    print("ui icons")
    icons = os.path.join(ASSETS, "kenney_game-icons", "PNG", "White", "1x")
    for name, source, tint, alpha in (
        ("star_gold", "star.png", 0xF5C451, 255),
        ("star_empty", "star.png", 0x5C544A, 170),
        ("lock", "locked.png", 0xE9D9AE, 255),
    ):
        w, h, pixels = read_png(os.path.join(icons, source))
        save(
            os.path.join(OUT, "ui", f"{name}.png"),
            tint_pixels(pixels, tint, alpha),
            w,
            h,
            f"<- {source}",
        )

    # Gem: the blue diamond prop from the Kenney top-down set, re-graded to a
    # violet/cyan gem and centred on a square canvas.
    tile = os.path.join(
        ASSETS, "kenney_tower-defense-top-down", "PNG", "Default size", "towerDefense_tile183.png"
    )
    w, h, pixels = read_png(tile)
    pixels = hue_transform(pixels, 0.44, 1.9, -0.02, 1.0)
    trimmed, tw, th = trim(pixels, w, h)
    gem = blank(64, 64)
    blit(gem, 64, trimmed, tw, th, (64 - tw) // 2, (64 - th) // 2)
    save(os.path.join(OUT, "ui", "icon_gem.png"), gem, 64, 64, "<- Kenney TD gem")

    # World-map thumbnails: a 6 px-per-cell minimap rendered from the same ASCII
    # battlefield and the same recoloured tiles the game loads.
    print("map thumbnails")
    layouts = read_map_layouts()
    cell = 6
    for theme in ("grassland", "desert", "ice", "volcanic"):
        layout = layouts["grassland" if theme == "volcanic" else theme]
        suffix = "" if theme == "grassland" else f"-{theme}"

        def tile_colour(name, x, y, size=16):
            tw2, th2, pix = read_png(os.path.join(OUT, "tiles", f"{name}{suffix}.png"))
            return average_colour(pix, tw2, th2, x, y, size)

        grass = tile_colour("grass", 24, 24)
        # The horde's lane has to read as a lane at thumbnail size; the volcanic
        # road is nearly as dark as its ash ground, so lift it harder there.
        boost = {"grassland": 1.15, "desert": 1.05, "ice": 1.1, "volcanic": 1.85}[theme]
        road = tuple(min(255, round(channel * boost)) for channel in tile_colour("road_15", 24, 24))
        water = tile_colour("water", 24, 24)
        rock = tile_colour("rock", 24, 24)
        tree = tile_colour("foliage", 24, 24)
        spawn = (0xB3, 0x88, 0xFF)
        base = (0xF5, 0xC4, 0x51)

        cols = max(len(row) for row in layout)
        rows = len(layout)
        width, height = cols * cell, rows * cell
        out = blank(width, height)
        for r, line in enumerate(layout):
            for c, ch in enumerate(line):
                if ch == "S":
                    colour = spawn
                elif ch == "B":
                    colour = base
                elif ch == "#":
                    colour = road
                elif ch == "~":
                    colour = water
                elif ch == "x":
                    colour = rock
                else:
                    folliage = (r * 3 + c * 5) % 9 == 0
                    colour = tree if folliage else grass
                # A touch of checker shading keeps a flat minimap from reading
                # like a solid blob at 120 px.
                f = 0.92 if (r + c) % 2 else 1.0
                for y in range(r * cell, (r + 1) * cell):
                    for x in range(c * cell, (c + 1) * cell):
                        i = (y * width + x) * 4
                        out[i] = min(255, round(colour[0] * f))
                        out[i + 1] = min(255, round(colour[1] * f))
                        out[i + 2] = min(255, round(colour[2] * f))
                        out[i + 3] = 255
        save(os.path.join(OUT, "ui", f"map_{theme}.png"), out, width, height, "<- battlefield minimap")


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

    # The forge lines borrow pack art that already reads correctly, under names
    # that say which tower fires them.
    for alias, source, note in [
        ("proj-forge", "proj-lightning", "hammer throw (T05 impact glyph)"),
        ("proj-rune", "proj-cannonball", "rune orb (magenta sphere)"),
    ]:
        dst = os.path.join(OUT, "projectiles", f"{alias}.png")
        shutil.copyfile(os.path.join(OUT, "projectiles", f"{source}.png"), dst)
        print(f"  {os.path.relpath(dst, ROOT):58s} alias of {source}   {note}")


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
    for key, slot in [(k, k) for k in TOWER_LAYOUT]:
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
    jobs = [(key, fw, rows) for key, (sprite, fw, rows) in ENEMY_SOURCES.items()]
    jobs += [(key, fw * scale, rows) for key, (sprite, fw, rows, scale, ramp) in BOSS_SOURCES.items()]
    for key, fw, rows in jobs:
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
    build_bosses()
    build_projectiles()
    build_enemies()
    build_ui_cards()
    build_ui_icons()
    impacts = build_effects()
    enemies = build_enemy_manifest()
    write_manifest(enemies, impacts)
    print("done")


if __name__ == "__main__":
    main()
