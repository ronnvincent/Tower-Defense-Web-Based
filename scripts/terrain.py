"""terrain.py — procedural pixel terrain for the campaign biomes.

The Spire sheet only ships one grass tile, one sand road and one water fill, and
the old build recoloured that single set four times. Every battlefield therefore
read as the same flat green grid with orange lanes. This module draws terrain in
the same pixel-art language (flat colour bands, hard edges, hand-placed detail)
with a real palette per biome:

    build_ground(theme, variant)   seamless 64 px ground, 3 variants per biome
    build_road(theme, mask)        dirt lane autotile, ragged grass fringe
    build_water(theme, mask)       lake autotile, shoreline foam
    build_rock(theme, variant)     boulder cluster with shadow
    build_decor(theme, kind)       32 px scatter props (tufts, cacti, shards)

Everything is deterministic: seeds come from ``zlib.crc32`` of stable strings, so
re-running the asset build produces byte-identical PNGs instead of churning the
repository.
"""

import math
import random
import zlib

TILE = 64
DECOR = 32

# --------------------------------------------------------------------- palettes

# Each ramp is shadow -> base -> light -> highlight.
RAMPS = {
    "grassland": ("", [(0x2F, 0x62, 0x35), (0x3B, 0x77, 0x3E), (0x48, 0x88, 0x46), (0x59, 0x9C, 0x4F)]),
    "desert": (
        "-desert",
        [(0x7A, 0x62, 0x36), (0x8B, 0x72, 0x40), (0x9E, 0x84, 0x4C), (0xB2, 0x98, 0x5C)],
    ),
    "ice": ("-ice", [(0x4C, 0x60, 0x76), (0x5A, 0x71, 0x89), (0x6B, 0x85, 0x9C), (0x82, 0x9E, 0xB4)]),
    "volcanic": (
        "-volcanic",
        [(0x22, 0x18, 0x1B), (0x2C, 0x1F, 0x23), (0x38, 0x27, 0x2B), (0x46, 0x2E, 0x2E)],
    ),
}

# Lane palettes are tuned against the biome ground so the lane is always the
# most legible surface on the map (luminance delta >= ~30): packed clay on
# grassland, dark trodden earth across bright sand, slate through the snow and
# warm ash on black rock. tests/terrain-contrast.test.js enforces the numbers.
ROAD_RAMPS = {
    "grassland": [(0x7A, 0x55, 0x35), (0xB8, 0x8C, 0x5E), (0xCC, 0xA2, 0x74), (0xE0, 0xBE, 0x92)],
    "desert": [(0x4A, 0x2E, 0x18), (0x6C, 0x48, 0x2A), (0x80, 0x58, 0x34), (0x9A, 0x70, 0x48)],
    "ice": [(0x2A, 0x36, 0x42), (0x3E, 0x4C, 0x5A), (0x52, 0x64, 0x74), (0x74, 0x8C, 0x9E)],
    # Cooled basalt, not sand: the caldera lane is ashen stone with ember
    # flecks, so it stays legible against black rock without changing biome.
    "volcanic": [(0x3A, 0x32, 0x33), (0x58, 0x4C, 0x4C), (0x6E, 0x5F, 0x5C), (0x8A, 0x78, 0x72)],
}

WATER_RAMPS = {
    "grassland": [(0x10, 0x35, 0x42), (0x18, 0x4C, 0x5C), (0x27, 0x72, 0x82), (0x7C, 0xCF, 0xC8)],
    "desert": [(0x0C, 0x35, 0x3D), (0x13, 0x4E, 0x59), (0x22, 0x72, 0x74), (0x86, 0xD6, 0xC6)],
    "ice": [(0x0A, 0x1C, 0x36), (0x12, 0x2C, 0x4E), (0x1F, 0x46, 0x6E), (0x9A, 0xD2, 0xF2)],
    "volcanic": [(0x6E, 0x14, 0x06), (0xC0, 0x38, 0x10), (0xE8, 0x62, 0x18), (0xFF, 0xBE, 0x6C)],
}

ROCK_RAMPS = {
    "grassland": [(0x3A, 0x3F, 0x44), (0x55, 0x5C, 0x62), (0x6F, 0x78, 0x7E), (0x93, 0x9C, 0xA1)],
    "desert": [(0x4E, 0x3C, 0x2A), (0x6C, 0x55, 0x3B), (0x8B, 0x71, 0x51), (0xB0, 0x96, 0x72)],
    "ice": [(0x2E, 0x3F, 0x52), (0x48, 0x5D, 0x72), (0x64, 0x7F, 0x96), (0x9C, 0xBC, 0xD2)],
    "volcanic": [(0x1A, 0x13, 0x15), (0x2C, 0x22, 0x24), (0x43, 0x34, 0x35), (0x63, 0x4B, 0x46)],
}

BIOMES = tuple(RAMPS)


def suffix(theme):
    return RAMPS[theme][0]


def seed_for(*parts):
    """Stable across processes (unlike ``hash()``)."""
    return zlib.crc32("|".join(str(p) for p in parts).encode())


# ---------------------------------------------------------------------- helpers


def _smooth(t):
    return t * t * (3 - 2 * t)


def periodic_noise(seed, cells, size, octaves=2):
    """Value noise that wraps every ``size`` px, so the tile stays seamless."""
    rng = random.Random(seed)
    out = [[0.0] * size for _ in range(size)]
    total, amp = 0.0, 1.0
    for o in range(octaves):
        c = cells * (2 ** o)
        grid = [[rng.random() for _ in range(c)] for _ in range(c)]
        for y in range(size):
            fy = y / size * c
            y0 = int(fy) % c
            y1 = (y0 + 1) % c
            ty = _smooth(fy - int(fy))
            row = out[y]
            for x in range(size):
                fx = x / size * c
                x0 = int(fx) % c
                x1 = (x0 + 1) % c
                tx = _smooth(fx - int(fx))
                a = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx
                b = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx
                row[x] += (a * (1 - ty) + b * ty) * amp
        total += amp
        amp *= 0.55
    for y in range(size):
        for x in range(size):
            out[y][x] /= total
    return out


def _put(pix, x, y, rgb, size=TILE):
    if 0 <= x < size and 0 <= y < size:
        i = (y * size + x) * 4
        pix[i : i + 4] = bytes((rgb[0] & 255, rgb[1] & 255, rgb[2] & 255, 255))


def _ellipse(pix, cx, cy, rx, ry, rgb, size=TILE):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx = (x + 0.5 - cx) / max(rx, 0.5)
            dy = (y + 0.5 - cy) / max(ry, 0.5)
            if dx * dx + dy * dy <= 1.0:
                _put(pix, x, y, rgb, size)


# ----------------------------------------------------------------------- ground


def _blade_cluster(pix, rng, x, y, ramp, count=(4, 7), height=(3, 7), size=TILE):
    """A clump of blades: a darker base stroke with a lighter tip and a lean."""
    dark, light = ramp[0], ramp[3]
    for _ in range(rng.randint(*count)):
        bx = x + rng.randint(-4, 4)
        by = y + rng.randint(-2, 2)
        h = rng.randint(*height)
        lean = rng.choice((-1, 0, 0, 1))
        for k in range(h):
            px = bx + (lean if k >= h - 2 else 0)
            _put(pix, px, by - k, dark if k < h - 1 else light, size)
            if k < h - 2:
                _put(pix, px + 1, by - k, dark, size)


def _pebbles(pix, rng, x, y, ramp, count=(2, 4)):
    for _ in range(rng.randint(*count)):
        px, py = x + rng.randint(-4, 4), y + rng.randint(-3, 3)
        _put(pix, px, py, ramp[0])
        _put(pix, px + 1, py, ramp[1])
        _put(pix, px, py + 1, ramp[0])


def build_ground(theme, variant=0):
    """One seamless 64 px ground tile.

    The base is a smooth blend between the ramp's shadow and highlight (no hard
    bands, so a field of tiles cannot read as camouflage), and all the character
    comes from hand-placed detail on top: blade clumps, cracks, frost needles or
    ember flecks.
    """
    ramp = RAMPS[theme][1]
    shadow, base, light, highlight = ramp
    pix = bytearray(TILE * TILE * 4)

    # Flat fill with a fine 2-colour dither. A low-frequency noise field reads as
    # camouflage and repeats visibly once a few tiles share it; a dither of single
    # pixels reads as texture and never forms a pattern.
    dither = random.Random(seed_for(theme, "dither", variant))
    for y in range(TILE):
        for x in range(TILE):
            c = base if dither.random() > 0.14 else light
            i = (y * TILE + x) * 4
            pix[i : i + 4] = bytes((c[0], c[1], c[2], 255))

    rng = random.Random(seed_for(theme, variant, "detail"))

    if theme == "grassland":
        for _ in range(9):
            _blade_cluster(pix, rng, rng.randrange(6, TILE - 6), rng.randrange(6, TILE - 6), ramp)
        for _ in range(3):
            # Tiny wildflowers: two pixels, one warm, one white.
            cx, cy = rng.randrange(5, TILE - 5), rng.randrange(5, TILE - 5)
            _put(pix, cx, cy, (0xF2, 0xE4, 0x8A) if rng.random() < 0.6 else (0xE8, 0xF2, 0xD8))
            _put(pix, cx + 1, cy, highlight)
        for _ in range(2):
            _pebbles(pix, rng, rng.randrange(8, TILE - 8), rng.randrange(8, TILE - 8), ramp)

    elif theme == "desert":
        for _ in range(6):
            x, y = rng.randrange(TILE), rng.randrange(TILE)
            for k in range(rng.randrange(5, 11)):
                _put(pix, (x + k) % TILE, (y + k // 4) % TILE, shadow)
        for _ in range(4):
            _pebbles(pix, rng, rng.randrange(8, TILE - 8), rng.randrange(8, TILE - 8), ramp, (1, 3))
        for _ in range(10):
            _put(pix, rng.randrange(TILE), rng.randrange(TILE), highlight)

    elif theme == "ice":
        # Long wind-scoured streaks, not dashes: fewer, longer, fainter.
        for _ in range(3):
            x, y = rng.randrange(4, TILE - 28), rng.randrange(6, TILE - 6)
            for k in range(rng.randrange(14, 26)):
                _put(pix, x + k, y + (1 if k % 7 == 6 else 0), (0xB6, 0xD2, 0xE6))
        for _ in range(10):
            _put(pix, rng.randrange(TILE), rng.randrange(TILE), (0xE8, 0xF6, 0xFF))
        for _ in range(2):
            cx, cy = rng.randrange(8, TILE - 8), rng.randrange(8, TILE - 8)
            _put(pix, cx, cy, (0xE6, 0xF4, 0xFF))
            _put(pix, cx + 1, cy, (0xCE, 0xE4, 0xF4))

    else:  # volcanic
        for _ in range(5):
            x, y = rng.randrange(TILE), rng.randrange(TILE)
            for k in range(rng.randrange(5, 12)):
                _put(pix, (x + k) % TILE, (y + k // 4 - 1) % TILE, (0x11, 0x0B, 0x0D))
        for _ in range(7):
            # Cooling embers: a hot pixel with a dimmer neighbour.
            x, y = rng.randrange(TILE), rng.randrange(TILE)
            _put(pix, x, y, (0xE8, 0x6A, 0x22))
            _put(pix, x + 1, y, (0x8C, 0x2A, 0x0C))
        for _ in range(3):
            cx, cy = rng.randrange(6, TILE - 6), rng.randrange(6, TILE - 6)
            _put(pix, cx, cy, (0x60, 0x40, 0x3C))

    return pix


# ------------------------------------------------------------------ lanes/water


def _fringe(seed, mask, size=TILE, depth=(6, 8), corner=None):
    """Per-pixel distance inside the tile from the sides that have no neighbour.

    Returns a callable ``inside(x, y) -> bool``: True where the *fill* (road or
    water) should be drawn, False where the neighbour's ground shows through.
    Bits are N=1, E=2, S=4, W=8; a set bit means "that neighbour is the same
    surface", so that side is not fringed.
    """
    rng = random.Random(seed)
    lo, hi = depth
    fringe = {side: lo + rng.randint(0, hi - lo) for side in "NESW"}
    wobble = {side: [rng.randint(-1, 1) for _ in range(size)] for side in "NESW"}

    def inside(x, y):
        # Probes walk one pixel past the tile edge. Beyond an edge the answer is
        # decided by the autotile mask, not by wrapping around: a wrapped probe
        # would report the far side of the same tile and paint a false rim along
        # every seam between two connected tiles.
        if x < 0:
            return bool(mask & 8)
        if x >= size:
            return bool(mask & 2)
        if y < 0:
            return bool(mask & 1)
        if y >= size:
            return bool(mask & 4)
        if not mask & 1 and y < fringe["N"] + wobble["N"][x]:
            return False
        if not mask & 4 and (size - 1 - y) < fringe["S"] + wobble["S"][x]:
            return False
        if not mask & 8 and x < fringe["W"] + wobble["W"][y]:
            return False
        if not mask & 2 and (size - 1 - x) < fringe["E"] + wobble["E"][y]:
            return False
        # Round the corners where two touching sides are both open ground.
        radius = corner if corner is not None else lo - 1
        for a, b, cx, cy in ((1, 8, 5, 5), (1, 2, size - 6, 5), (4, 8, 5, size - 6), (4, 2, size - 6, size - 6)):
            if not mask & a and not mask & b:
                if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 < radius:
                    return False
        return True

    return inside


def build_road(theme, mask):
    """Dirt lane autotile, drawn over the ground layer.

    The tile is transparent on the sides that face open ground: the renderer
    paints grass first and the lane on top, so the ragged edge is the real grass
    showing through instead of a painted-on border that can drift out of sync
    with the biome.
    """
    road = ROAD_RAMPS[theme]
    inside = _fringe(seed_for(theme, "road-edge", mask), mask)
    rng = random.Random(seed_for(theme, "road-detail", mask))

    pix = bytearray(TILE * TILE * 4)
    for y in range(TILE):
        for x in range(TILE):
            if not inside(x, y):
                continue
            # Flat dirt with a fine dither — no low-frequency noise, which would
            # read as camouflage at tile scale.
            c = road[1] if rng.random() > 0.18 else road[2]
            i = (y * TILE + x) * 4
            pix[i : i + 4] = bytes((c[0], c[1], c[2], 255))

    # Eroded rim: a dithered darker band just inside the edge.
    for y in range(TILE):
        for x in range(TILE):
            if not inside(x, y):
                continue
            depth = 0
            while depth < 3 and not all(
                inside(x + dx * (depth + 1), y + dy * (depth + 1))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                depth += 1
            if depth and (x + y + depth) % 2 == 0:
                _put(pix, x, y, road[0])

    # Pebbles and cart ruts.
    for _ in range(28):
        px, py = rng.randrange(TILE), rng.randrange(TILE)
        if inside(px, py) and inside(px + 1, py):
            _put(pix, px, py, road[0] if rng.random() < 0.6 else road[3])

    if theme == "volcanic":
        # Glowing fissures: two short ember seams per lane tile.
        for _ in range(2):
            sx, sy = rng.randrange(6, TILE - 14), rng.randrange(6, TILE - 6)
            for k in range(rng.randrange(6, 12)):
                if inside(sx + k, sy):
                    _put(pix, sx + k, sy, (0xC8, 0x44, 0x12))
                    _put(pix, sx + k, sy + 1, (0x6A, 0x1D, 0x06))
    return pix


def build_water(theme, mask=15):
    """Lake autotile: banded depth, ripples and a foam shoreline."""
    deep, mid, light, foam = WATER_RAMPS[theme]
    # Flat, banded water: a per-tile noise field tiles visibly (each cell shows
    # its own blobs, so a lake looks like a grid of puddles). Depth now comes
    # from a faint two-step gradient plus sparse ripple dashes instead.
    noise = periodic_noise(seed_for(theme, "water"), 1, TILE, 1)
    # Deeper fringe than a lane plus rounded corners: a lake should read as a
    # natural pool, not as a rectangle with the corners knocked off.
    # A single-cell pond (mask 0) is rounded hard so it reads as a pool rather
    # than a hole punched in the terrain; connected water keeps a soft corner.
    inside = _fringe(
        seed_for(theme, "water-edge", mask),
        mask,
        depth=(6, 9),
        corner=17 if mask == 0 else 10,
    )

    pix = bytearray(TILE * TILE * 4)
    for y in range(TILE):
        for x in range(TILE):
            if not inside(x, y):
                continue  # transparent: the ground layer shows through
            # Depth by distance from the shoreline: shallow (light) near the
            # edge, deep in the middle. That is what makes a pond read as water
            # with volume, and it is seam-free because it only depends on the
            # fringe, not on per-tile noise.
            # How far this pixel is from the shore, capped well above a tile so
            # the bands spread across the whole pond instead of saturating in
            # the middle of every 64 px cell.
            depth_px = 0
            while (
                depth_px < 22
                and inside(x - depth_px, y)
                and inside(x + depth_px, y)
                and inside(x, y - depth_px)
                and inside(x, y + depth_px)
            ):
                depth_px += 1
            if depth_px >= 8:
                c = deep
            elif depth_px >= 3:
                c = mid
            else:
                c = light
            # Broad, very faint tone drift so a large lake is not dead flat.
            if noise[y][x] > 0.72 and depth_px >= 6:
                c = mid
            i = (y * TILE + x) * 4
            pix[i : i + 4] = bytes((c[0], c[1], c[2], 255))

    # Foam lip along the shore: only where the water actually meets land, and
    # dithered so a small pond does not get a solid sticker border.
    for y in range(TILE):
        for x in range(TILE):
            if not inside(x, y):
                continue
            edge = not (inside(x - 1, y) and inside(x + 1, y) and inside(x, y - 1) and inside(x, y + 1))
            if edge and (x + y) % 2 == 0:
                _put(pix, x, y, foam)

    rng = random.Random(seed_for(theme, "ripple", mask))
    for _ in range(6):
        x, y = rng.randrange(8, TILE - 18), rng.randrange(8, TILE - 8)
        if not all(inside(x + k, y) for k in range(6)):
            continue
        for k in range(6):
            _put(pix, x + k, y, light)
        _put(pix, x + 2, y - 1, foam)
    return pix


# --------------------------------------------------------------- rocks & decor


def build_rock(theme, variant=0):
    """Irregular boulder cluster with a lit crown, dark base and soft shadow.

    Each stone is a polar blob whose radius wobbles with a few low harmonics —
    that gives a chipped, faceted outline instead of a rectangle or a perfect
    ellipse — then shaded by the angle from the light (top-left).
    """
    ramp = ROCK_RAMPS[theme]
    pix = bytearray(TILE * TILE * 4)
    rng = random.Random(seed_for(theme, "rock", variant))

    stones = [(TILE // 2 - 4, TILE - 21, 16, 13), (TILE // 2 + 12, TILE - 15, 11, 9), (TILE // 2 - 18, TILE - 14, 8, 7)]
    if variant % 2 == 1:
        stones = [(TILE // 2 + 3, TILE - 19, 15, 12), (TILE // 2 - 13, TILE - 14, 10, 8), (TILE // 2 + 17, TILE - 12, 7, 6)]
    stones.sort(key=lambda b: b[1])

    for cx, cy, rx, ry in stones:
        # Soft ground shadow.
        for y in range(int(cy - ry * 0.4), int(cy + ry * 0.9)):
            for x in range(cx - rx - 3, cx + rx + 4):
                dx = (x - cx) / (rx + 2.0)
                dy = (y - (cy + ry * 0.35)) / (ry * 0.55)
                if dx * dx + dy * dy <= 1 and 0 <= x < TILE and 0 <= y < TILE:
                    i = (y * TILE + x) * 4
                    _put(pix, x, y, (8, 10, 12))

        a1, a2, a3 = rng.uniform(0.10, 0.16), rng.uniform(0.05, 0.10), rng.uniform(0.02, 0.05)
        p1, p2, p3 = rng.uniform(0, 6.28), rng.uniform(0, 6.28), rng.uniform(0, 6.28)
        for y in range(cy - ry - 2, cy + ry + 3):
            for x in range(cx - rx - 2, cx + rx + 3):
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                r = (dx * dx + dy * dy) ** 0.5
                if r == 0:
                    r = 1e-6
                theta = math.atan2(dy, dx)
                edge = 1.0 + a1 * math.sin(3 * theta + p1) + a2 * math.sin(5 * theta + p2) + a3 * math.sin(7 * theta + p3)
                if r > edge:
                    continue
                # Shade from the top-left light.
                light = -(dx * 0.66 + dy * 0.75)
                if r > edge * 0.88:
                    col = ramp[0]
                elif light > 0.55:
                    col = ramp[3]
                elif light > -0.15:
                    col = ramp[2]
                else:
                    col = ramp[1]
                _put(pix, x, y, col)

        # Crown speckles + two hairline cracks.
        for _ in range(4):
            hx = cx + rng.randint(-rx // 2, 0)
            hy = cy - ry // 2 + rng.randint(-2, 2)
            _put(pix, hx, hy, ramp[3])
        for _ in range(2):
            sx = cx + rng.randint(-rx // 2, rx // 2)
            sy = cy - ry // 4
            for k in range(rng.randint(3, 6)):
                _put(pix, sx + k, sy + (k % 2), ramp[0])

    # Grass / gravel tufts at the base so the stones sit in the terrain.
    ground = RAMPS[theme][1]
    for _ in range(7):
        gx = TILE // 2 + rng.randint(-22, 22)
        gy = TILE - rng.randint(7, 13)
        _put(pix, gx, gy, ground[3])
        _put(pix, gx, gy + 1, ground[0])
    return pix


DECOR_KINDS = ("tuft", "bloom", "shard")


def build_decor(theme, kind):
    """32 px scatter prop: tufts, blooms/shrubs/crystals, and small stones."""
    pix = bytearray(DECOR * DECOR * 4)
    rng = random.Random(seed_for(theme, "decor", kind))
    ramp = RAMPS[theme][1]
    rock = ROCK_RAMPS[theme]

    if kind == "tuft":
        if theme == "grassland":
            for _ in range(3):
                _blade_cluster(
                    pix,
                    rng,
                    rng.randint(7, DECOR - 7),
                    rng.randint(DECOR - 8, DECOR - 3),
                    ramp,
                    count=(6, 9),
                    height=(7, 13),
                    size=DECOR,
                )
        elif theme == "desert":
            # Dry shrub: a tangle of branches from one root.
            col, tip = (0x8E, 0x7C, 0x50), (0xB8, 0xA6, 0x74)
            root = (DECOR // 2, DECOR - 4)
            for _ in range(22):
                x, y = root
                dx = rng.choice((-1, -1, 0, 0, 1, 1))
                for k in range(rng.randint(3, 7)):
                    _put(pix, x, y, tip if k >= 6 else col, DECOR)
                    x += dx if rng.random() < 0.5 else 0
                    y -= 1
        elif theme == "ice":
            col = (0xD8, 0xEC, 0xFB)
            for _ in range(8):
                x = rng.randint(8, DECOR - 9)
                y = rng.randint(16, DECOR - 6)
                for k in range(rng.randint(3, 6)):
                    _put(pix, x, y - k, col, DECOR)
        else:  # charred brush with embers
            col, ember = (0x14, 0x0E, 0x10), (0xD8, 0x5A, 0x1E)
            for _ in range(4):
                x, y = rng.randint(9, DECOR - 10), rng.randint(16, DECOR - 5)
                for k in range(rng.randint(4, 8)):
                    _put(pix, x + rng.choice((-1, 0, 0, 1)), y - k, col, DECOR)
            for _ in range(3):
                _put(pix, rng.randint(9, DECOR - 10), rng.randint(16, DECOR - 6), ember, DECOR)
    elif kind == "bloom":
        if theme == "grassland":
            petal, centre, stem = (0xF2, 0xE6, 0x7A), (0xE0, 0x8A, 0x3C), (0x2F, 0x5C, 0x30)
            for _ in range(4):
                cx, cy = rng.randint(8, DECOR - 9), rng.randint(9, DECOR - 8)
                for k in range(1, rng.randint(2, 5)):
                    _put(pix, cx, cy + k, stem, DECOR)
                _put(pix, cx, cy, centre, DECOR)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1)):
                    _put(pix, cx + dx, cy + dy, petal, DECOR)
        elif theme == "desert":
            # Barrel cactus: fat trunk, two arms, spines.
            body, dark, hi = (0x4C, 0x7A, 0x3C), (0x33, 0x54, 0x28), (0x7C, 0xAC, 0x5C)
            cx, base = DECOR // 2, DECOR - 4
            for y in range(base - 17, base):
                for dx in (-2, -1, 0, 1, 2):
                    col = dark if dx in (-2, 2) else (hi if dx == -1 else body)
                    _put(pix, cx + dx, y, col, DECOR)
            for cy in range(base - 13, base - 8):
                for dx in (-5, -4, -3):
                    _put(pix, cx + dx, cy, body if dx != -5 else dark, DECOR)
            for cy in range(base - 15, base - 10):
                for dx in (3, 4, 5):
                    _put(pix, cx + dx, cy, body if dx != 5 else dark, DECOR)
            for y in range(base - 17, base, 4):
                _put(pix, cx, y, hi, DECOR)
        elif theme == "ice":
            col, hi = (0xA8, 0xD8, 0xF2), (0xEC, 0xFA, 0xFF)
            for _ in range(3):
                cx, base = rng.randint(8, DECOR - 9), DECOR - 6
                h = rng.randint(6, 11)
                for k in range(h):
                    _put(pix, cx, base - k, col, DECOR)
                _put(pix, cx, base - h, hi, DECOR)
                _put(pix, cx - 1, base - h + 2, hi, DECOR)
                _put(pix, cx + 1, base - h + 2, hi, DECOR)
        else:  # magma crack
            glow, core = (0xC8, 0x44, 0x12), (0xFF, 0xB0, 0x54)
            x, y = 6, DECOR // 2
            for _ in range(20):
                _put(pix, x, y, glow, DECOR)
                _put(pix, x, y + 1, core, DECOR)
                x += rng.choice((1, 1, 0))
                y += rng.choice((-1, 0, 0, 1))
                if x >= DECOR - 4:
                    break
    else:  # shard -> small stones
        for _ in range(4):
            cx, cy = rng.randint(6, DECOR - 7), rng.randint(14, DECOR - 5)
            rx, ry = rng.randint(2, 4), rng.randint(1, 3)
            _ellipse(pix, cx, cy, rx, ry, rock[1], DECOR)
            _ellipse(pix, cx - 1, cy - 1, max(1, rx - 2), max(1, ry - 1), rock[2], DECOR)

    return pix


# ------------------------------------------------------------------- foliage
#
# One landmark prop per battle map. A recoloured broadleaf tree reads as "the same
# tree, tinted"; these are drawn per biome so a desert field has cacti, an ice
# field has snow-laden pines and a volcanic field has charred deadwood. The
# grassland keeps the hand-painted Spire oak (see scripts/build_spire_assets.py).

FOLIAGE = 64


def _shadow(pix, cx, cy, rx, ry, rgba=(0, 0, 0, 70)):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if not (0 <= x < FOLIAGE and 0 <= y < FOLIAGE):
                continue
            dx = (x - cx) / max(1, rx)
            dy = (y - cy) / max(1, ry)
            if dx * dx + dy * dy <= 1.0:
                i = (y * FOLIAGE + x) * 4
                alpha = pix[i + 3]
                if alpha == 0:
                    pix[i : i + 4] = bytes(rgba)


def _rect(pix, x0, y0, x1, y1, rgb):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            _put(pix, x, y, rgb, FOLIAGE)


def _build_cactus(rng):
    """Saguaro: ribbed column, two elbows, spines, warm sand shadow."""
    pix = bytearray(FOLIAGE * FOLIAGE * 4)
    dark, mid, light, glow = (0x24, 0x3C, 0x22), (0x3C, 0x5F, 0x2E), (0x5C, 0x86, 0x3E), (0x8F, 0xB5, 0x62)
    _shadow(pix, 32, 56, 15, 5)
    # Trunk
    _rect(pix, 27, 15, 37, 55, mid)
    _rect(pix, 27, 15, 30, 55, dark)
    _rect(pix, 35, 15, 37, 55, light)
    _rect(pix, 28, 14, 36, 14, light)
    # Elbows: right arm curves up, left arm lower
    _rect(pix, 37, 40, 45, 43, mid)
    _rect(pix, 43, 28, 46, 43, mid)
    _rect(pix, 43, 28, 46, 28, light)
    _rect(pix, 37, 40, 45, 40, dark)
    _rect(pix, 18, 46, 26, 49, mid)
    _rect(pix, 17, 33, 20, 49, mid)
    _rect(pix, 17, 33, 20, 33, light)
    _rect(pix, 18, 46, 26, 46, dark)
    # Ribs + spines
    for x in (29, 32, 34):
        for y in range(16, 55, 3):
            if pix[(y * FOLIAGE + x) * 4 + 3]:
                _put(pix, x, y, dark, FOLIAGE)
    for _ in range(46):
        x, y = rng.randint(16, 46), rng.randint(15, 55)
        i = (y * FOLIAGE + x) * 4
        if pix[i + 3] and rng.random() < 0.45:
            _put(pix, x, y, glow, FOLIAGE)
    # A bloom on the crown
    _ellipse(pix, 32, 12, 2, 2, (0xE8, 0x6A, 0x9A), FOLIAGE)
    _put(pix, 32, 11, (0xFF, 0xB2, 0xCF), FOLIAGE)
    return pix


def _build_conifer(rng):
    """Snow-laden fir: stacked needle tiers, white caps, drift at the base."""
    pix = bytearray(FOLIAGE * FOLIAGE * 4)
    trunk_dark, trunk = (0x2A, 0x2A, 0x33), (0x44, 0x40, 0x4C)
    deep, mid, tip = (0x16, 0x30, 0x38), (0x25, 0x4B, 0x4E), (0x36, 0x66, 0x5E)
    snow, snow_hi = (0xD9, 0xEA, 0xF6), (0xF4, 0xFB, 0xFF)
    _shadow(pix, 32, 58, 16, 4, (10, 20, 34, 80))
    _rect(pix, 30, 30, 34, 56, trunk)
    _rect(pix, 30, 30, 31, 56, trunk_dark)
    tiers = ((9, 26, 13), (19, 36, 16), (30, 46, 19), (41, 54, 22))
    for top, bottom, half in tiers:
        for y in range(top, bottom + 1):
            spread = int(half * (y - top) / max(1, bottom - top)) + 2
            for x in range(32 - spread, 33 + spread):
                edge = abs(x - 32) >= spread - 1
                _put(pix, x, y, deep if edge or (x + y) % 5 == 0 else mid, FOLIAGE)
        # Snow packs on the lower lip of every tier: solid on the rim, thinning
        # upward, so each branch reads as carrying weight.
        for y, chance in ((bottom, 1.0), (bottom - 1, 0.55), (bottom - 2, 0.2)):
            spread = int(half * (y - top) / max(1, bottom - top)) + 2
            for x in range(32 - spread, 33 - spread + 2 * spread + 1):
                if rng.random() < chance:
                    _put(pix, x, y, snow_hi if y == bottom and rng.random() < 0.4 else snow, FOLIAGE)
        for x in range(32 - half, 33 + half):
            if rng.random() < 0.3:
                _put(pix, x, top, tip, FOLIAGE)
    # Drift
    for x in range(14, 51):
        h = 2 if abs(x - 32) > 10 else 4
        for y in range(56 - h, 58):
            _put(pix, x, y, snow if y < 57 else snow_hi, FOLIAGE)
    return pix


def _build_charred(rng):
    """Charred deadwood: split trunk, bare claws, embers glowing in the cracks."""
    pix = bytearray(FOLIAGE * FOLIAGE * 4)
    ink, deep, mid = (0x14, 0x0E, 0x0E), (0x2C, 0x22, 0x21), (0x46, 0x36, 0x32)
    ember, ember_hi = (0xB4, 0x38, 0x10), (0xFF, 0x8A, 0x3C)
    _shadow(pix, 32, 58, 15, 4, (0, 0, 0, 90))
    # Trunk with a lean: wide enough to carry the ember hollow at 46 px on screen.
    for y in range(18, 57):
        lean = (y - 18) // 10
        for x in range(26 - lean, 38 - lean):
            _put(pix, x, y, mid if (-lean + x) % 4 else deep, FOLIAGE)
    # Broken crown: a splintered top edge instead of a flat cut.
    for x, top in ((27, 16), (29, 13), (32, 15), (35, 12), (37, 17)):
        for y in range(top, 19):
            _put(pix, x, y, mid, FOLIAGE)
    # Claw branches, two pixels thick so they survive down-scaling.
    for direction, starty, length in ((-1, 30, 14), (1, 24, 13), (-1, 20, 9), (1, 38, 10), (-1, 41, 8)):
        x, y = 32, starty
        for step in range(length):
            x += direction
            y -= 1 if step % 2 == 0 else 0
            _put(pix, x, y, mid if step % 3 else deep, FOLIAGE)
            _put(pix, x, y + 1, deep, FOLIAGE)
            if step in (4, 8):
                for k in range(1, 5):
                    _put(pix, x + direction * k, y - k, deep, FOLIAGE)
                    _put(pix, x + direction * k, y - k + 1, deep, FOLIAGE)
    # Hollow crack with embers
    for y in range(30, 52):
        _put(pix, 31, y, ink, FOLIAGE)
        if y % 6 == 0:
            _put(pix, 31, y, ember, FOLIAGE)
            _put(pix, 30, y, ember_hi, FOLIAGE)
    # Embers scattered in the ash at the base, half-buried.
    for _ in range(28):
        x, y = rng.randint(18, 48), rng.randint(48, 58)
        if rng.random() < 0.55:
            _put(pix, x, y, ember_hi if rng.random() < 0.4 else ember, FOLIAGE)
    return pix


def build_foliage(theme):
    """64x64 landmark prop for one battlefield."""
    rng = random.Random(seed_for(theme, "foliage"))
    if theme == "desert":
        return _build_cactus(rng)
    if theme == "ice":
        return _build_conifer(rng)
    if theme == "volcanic":
        return _build_charred(rng)
    return _build_conifer(rng)


# ------------------------------------------------------------------- contrast

def luminance(rgb):
    """Rec. 601 luma, the same weighting the HUD contrast audit uses."""
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def mean_luminance(ramp):
    return sum(luminance(c) for c in ramp) / len(ramp)


# How much of a surface each ramp stop actually covers on screen. Depth bands are
# mostly the two darkest stops, the top stop is only the foam/shore rim, so a flat
# mean would over-report contrast in both directions.
SURFACE_WEIGHTS = (0.55, 0.30, 0.10, 0.05)


def _weighted_mean(ramp):
    total = sum(SURFACE_WEIGHTS[: len(ramp)])
    return tuple(
        sum(c[k] * w for c, w in zip(ramp, SURFACE_WEIGHTS)) / total for k in range(3)
    )


def surface_contrast(theme, surface):
    """Perceptual gap (Y + Cb/Cr, 0-255 scale) between a surface and its ground.

    Luminance alone is a poor test: a saturated teal pond on green grass can sit at
    the same luma and still be immediately readable. YCbCr weights the colour
    channels too, which is what the eye actually uses to separate them, and the
    area weights above keep the thin foam rim from inflating the number.
    """
    ground = _weighted_mean(RAMPS[theme][1])
    ramp = ROAD_RAMPS[theme] if surface == "road" else WATER_RAMPS[theme]
    surf = _weighted_mean(ramp)

    def ycbcr(c):
        y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
        cb = 128 - 0.168736 * c[0] - 0.331264 * c[1] + 0.5 * c[2]
        cr = 128 + 0.5 * c[0] - 0.418688 * c[1] - 0.081312 * c[2]
        return y, cb, cr

    gy, gcb, gcr = ycbcr(ground)
    sy, scb, scr = ycbcr(surf)
    return ((gy - sy) ** 2 + (gcb - scb) ** 2 + (gcr - scr) ** 2) ** 0.5


SURFACE_CONTRAST_MIN = 26.0


if __name__ == "__main__":
    import json
    import sys

    if "--contrast" in sys.argv:
        table = {
            theme: {surface: round(surface_contrast(theme, surface), 1) for surface in ("road", "water")}
            for theme in RAMPS
        }
        print(json.dumps({"min": SURFACE_CONTRAST_MIN, "themes": table}))
