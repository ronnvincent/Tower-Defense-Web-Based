#!/usr/bin/env python3
"""normalize_icon_padding.py — stop UI icons from rendering as specks.

THE BUG THIS FIXES
------------------
`ui/icon_coin.png` is a Kenney 64x64 tile: the coin is 16x16, dead centre, in a
canvas that is 94% transparent. Every caller sizes the *canvas* (13-22 px), so
the coin itself was painted at 4-6 px while the gem beside it was painted at
18 px. The hub's purse read "a dot, a gem, a star" — which is what a designer
sees as "the resource icons are too small". Raising the CSS width alone cannot
fix it, because three quarters of the file is empty space.

This script removes that empty space: it crops the canvas back to the artwork
plus a small transparent margin. The art pixels are copied byte for byte — no
resampling, no redrawing, nothing that can soften a sprite — so an icon that
was 16x16 in a 64x64 canvas becomes 16x16 in a 20x20 canvas and renders at the
size the UI asks for.

    python3 scripts/normalize_icon_padding.py public/assets/ui/icon_coin.png
    python3 scripts/normalize_icon_padding.py --pad 3 file.png     # more margin
    python3 scripts/normalize_icon_padding.py --dry-run file.png   # measure

Stdlib only (zlib). Accepts 8-bit RGBA PNG, plain or Adam7-interlaced (the
Kenney tile is interlaced), and writes a plain one. Idempotent: a normalised
icon is already art + pad, so a second run changes nothing.
"""

import argparse
import struct
import sys
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
DEFAULT_PAD = 2

# Adam7 pass grid: (x start, y start, x step, y step).
ADAM7 = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))


def _unfilter(data, cursor, width, height, path):
    """Un-filter one (sub)image's scanlines; returns (rgba, next cursor)."""
    stride = width * 4
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    for y in range(height):
        ftype = data[cursor]
        cursor += 1
        line = bytearray(data[cursor : cursor + stride])
        cursor += stride
        if ftype == 1:  # Sub
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 0xFF
        elif ftype == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:  # Average
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:  # Paeth
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                b = prev[i]
                c = prev[i - 4] if i >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif ftype != 0:
            raise SystemExit(f"{path}: unknown filter {ftype} on row {y}")
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return out, cursor


def read_png(path):
    """Return (width, height, pixels) with pixels as a bytearray of RGBA."""
    raw = open(path, "rb").read()
    if raw[:8] != SIGNATURE:
        raise SystemExit(f"{path}: not a PNG")
    pos = 8
    width = height = None
    interlace = 0
    idat = bytearray()
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos : pos + 4])
        kind = raw[pos + 4 : pos + 8]
        data = raw[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _comp, _filter, interlace = struct.unpack(
                ">IIBBBBB", data
            )
            if depth != 8 or color != 6:
                raise SystemExit(
                    f"{path}: need 8-bit RGBA (got depth {depth}, colour type {color})"
                )
        elif kind == b"IDAT":
            idat += data
        elif kind == b"IEND":
            break
        pos += 12 + length
    if width is None:
        raise SystemExit(f"{path}: no IHDR")

    data = zlib.decompress(bytes(idat))
    if not interlace:
        pixels, _ = _unfilter(data, 0, width, height, path)
        return width, height, pixels

    # Adam7: seven sub-images, each its own filtered block, woven back together.
    pixels = bytearray(width * height * 4)
    cursor = 0
    for x0, y0, dx, dy in ADAM7:
        sub_w = (width - x0 + dx - 1) // dx
        sub_h = (height - y0 + dy - 1) // dy
        if sub_w <= 0 or sub_h <= 0:
            continue
        block, cursor = _unfilter(data, cursor, sub_w, sub_h, path)
        for y in range(sub_h):
            for x in range(sub_w):
                si = (y * sub_w + x) * 4
                di = ((y0 + y * dy) * width + (x0 + x * dx)) * 4
                pixels[di : di + 4] = block[si : si + 4]
    return width, height, pixels


def write_png(path, width, height, pixels):
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride : (y + 1) * stride]

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = SIGNATURE
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def alpha_bbox(width, height, pixels):
    minx, miny, maxx, maxy = width, height, -1, -1
    for y in range(height):
        row = y * width * 4
        for x in range(width):
            if pixels[row + x * 4 + 3]:
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return None
    return minx, miny, maxx + 1, maxy + 1


def normalize(path, pad=DEFAULT_PAD, dry_run=False):
    width, height, pixels = read_png(path)
    box = alpha_bbox(width, height, pixels)
    if box is None:
        raise SystemExit(f"{path}: fully transparent, nothing to normalize")
    x0, y0, x1, y1 = box
    art_w, art_h = x1 - x0, y1 - y0
    out_w, out_h = art_w + pad * 2, art_h + pad * 2
    print(
        f"{path}: {width}x{height}, art {art_w}x{art_h} at {x0},{y0} "
        f"({art_w * art_h / (width * height):.0%} of the canvas) → {out_w}x{out_h}"
    )
    if (out_w, out_h) == (width, height):
        print("  canvas already hugs the art — nothing to do")
        return False
    if (out_w, out_h) > (width, height):
        raise SystemExit(f"{path}: art is wider than --pad allows; the canvas would grow")

    canvas = bytearray(out_w * out_h * 4)
    for y in range(art_h):
        src = ((y0 + y) * width + x0) * 4
        dst = ((y + pad) * out_w + pad) * 4
        canvas[dst : dst + art_w * 4] = pixels[src : src + art_w * 4]

    if not dry_run:
        write_png(path, out_w, out_h, canvas)
        print(f"  wrote {path}")
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="+")
    parser.add_argument(
        "--pad",
        type=int,
        default=DEFAULT_PAD,
        help="transparent margin in pixels around the art (default 2)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.pad < 0:
        raise SystemExit("--pad cannot be negative")
    changed = 0
    for path in args.paths:
        changed += 1 if normalize(path, args.pad, args.dry_run) else 0
    print(f"{changed} icon(s) {'would be ' if args.dry_run else ''}normalized")
    return 0


if __name__ == "__main__":
    sys.exit(main())
