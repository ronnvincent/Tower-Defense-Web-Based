#!/usr/bin/env bash
# build_arena_art.sh — compose the animated portal vortex atlas.
#
# THE PROBLEM
# -----------
# The portal used to be a canvas texture: four spiral strokes painted once. It
# could only spin as one flat image, which is exactly what makes a placeholder
# read as a placeholder next to real animated art.
#
# THE BUILD
# ---------
# 32 frames are composited from the CC0 Kenney particle art the game already
# ships (twirl, ring, glow, spark — see docs/asset-integration.md), each frame
# rotating the two vortices at different speeds and letting a handful of sparks
# orbit and fade. The frames are then packed into one 8x4 spritesheet, which
# Phaser plays as `portal-vortex-idle` (30 fps, loop).
#
# Deterministic: same inputs, same sheet. Requires ImageMagick 6.
#
#   bash scripts/build_arena_art.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# The rasteriser drives the sandbox Chromium, which needs its own shared libs on
# the loader path (libnss3 and friends are unpacked next to the binary).
CHROME_LIBS="${CHROME_LIBS:-/tmp/chrome/libs/lib:/tmp/chrome}"

FX=public/assets/fx
OUT=public/assets/arena
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FRAMES=32
SIZE=144

for ((i = 0; i < FRAMES; i++)); do
  # 0..1 progress and the two rotation angles
  ANGLE_A=$(awk -v i="$i" 'BEGIN { printf "%.2f", i * 360 / 32 }')
  ANGLE_B=$(awk -v i="$i" 'BEGIN { printf "%.2f", -i * 360 * 1.5 / 32 }')
  PULSE=$(awk -v i="$i" 'BEGIN { printf "%.3f", 1 + 0.05 * sin(i * 2 * 3.14159265 / 32) }')
  RING_A=$(awk -v i="$i" 'BEGIN { printf "%.2f", 0.30 + 0.14 * sin(i * 2 * 3.14159265 / 16) }')

  # 1. soft core glow — the sheet is composed on BLACK and played with ADD in
  # Phaser, so every frame keeps its full colour instead of washing out.
  convert "$FX/fx-glow.png" -resize ${SIZE}x${SIZE} \
    -fill '#7b2cff' -colorize 100 -background black -alpha remove -alpha off "$WORK/core.png"

  # 2. big violet vortex
  convert "$FX/fx-twirl.png" -resize 100x100 -background none -rotate "$ANGLE_A" \
    -fill '#b06bff' -colorize 100 -modulate 150 -background black -alpha remove -alpha off "$WORK/a.png"

  # 3. counter-rotating magenta vortex
  convert "$FX/fx-twirl.png" -resize 72x72 -background none -rotate "$ANGLE_B" \
    -fill '#ff5ad0' -colorize 100 -modulate 120 -background black -alpha remove -alpha off "$WORK/b.png"

  # 4. rim
  convert "$FX/fx-ring.png" -resize "138x138" -fill '#6fd8ff' -colorize 100 \
    -modulate "$(awk -v a="$RING_A" 'BEGIN { printf "%.0f", 60 + a * 120 }')" \
    -background black -alpha remove -alpha off "$WORK/ring.png"

  # 5. orbiting sparks
  convert -size ${SIZE}x${SIZE} xc:none "$WORK/sparks.png"
  for ((k = 0; k < 7; k++)); do
    R=$(awk -v k="$k" -v i="$i" 'BEGIN { printf "%.2f", 52 + 8 * sin((k * 1.7 + i * 0.5)) }')
    A=$(awk -v k="$k" -v i="$i" 'BEGIN { printf "%.3f", (k * 2 * 3.14159265 / 7) + i * 0.30 }')
    X=$(awk -v r="$R" -v a="$A" 'BEGIN { printf "%.1f", 72 + r * cos(a) }')
    Y=$(awk -v r="$R" -v a="$A" 'BEGIN { printf "%.1f", 72 + r * sin(a) }')
    S=$(awk -v k="$k" -v i="$i" 'BEGIN { printf "%.0f", 4 + 6 * (0.5 + 0.5 * sin(k + i * 0.4)) }')
    AL=$(awk -v k="$k" -v i="$i" 'BEGIN { printf "%.2f", 0.35 + 0.45 * (0.5 + 0.5 * sin(k * 2 + i * 0.6)) }')
    convert "$FX/fx-spark.png" -resize "${S}x${S}" -fill '#e8dcff' -colorize 100 \
      -channel A -evaluate multiply "$AL" +channel "$WORK/s.png"
    convert "$WORK/sparks.png" "$WORK/s.png" -geometry "+$X+$Y" -compose over -composite "$WORK/sparks.png"
  done

  # 6. stack them additively
  convert -size ${SIZE}x${SIZE} xc:black \
    "$WORK/core.png" -geometry +0+0 -compose screen -composite \
    "$WORK/a.png" -geometry +22+22 -compose screen -composite \
    "$WORK/b.png" -geometry +36+36 -compose screen -composite \
    "$WORK/ring.png" -geometry +3+3 -compose screen -composite \
    -resize ${SIZE}x${SIZE}! "$WORK/stack.png"
  # scale the pulsing ring around the centre by baking it into the stack size
  convert "$WORK/stack.png" -resize "$(awk -v p="$PULSE" 'BEGIN { printf "%.0f", 144 * p }')x" -gravity center \
    -background black -extent ${SIZE}x${SIZE} "$WORK/base.png"
  convert "$WORK/base.png" "$WORK/sparks.png" -compose screen -composite "$WORK/frame_$(printf '%02d' "$i").png"
done

montage "$WORK"/frame_*.png -tile 8x4 -geometry +0+0 -background black -depth 8 "$OUT/portal-vortex.png"
echo "wrote $OUT/portal-vortex.png ($(identify -format '%wx%h' "$OUT/portal-vortex.png"))"

# ---------------------------------------------------------------------------
# 2. The bastion keep — a REAL hand-drawn building, not a canvas painting.
#
# Source: OpenGameArt "Fortress" (CC0), shipped as a flat vector SVG in
# `art-source/arena/fortress.svg`. Rasterising the vector at 2x the on-screen
# size keeps every battlement crisp, and the outlined walls match the map's flat,
# outlined tiles far better than the painted castle that used to stand here.
# The walled *city* that was tried first is still in `art-source/arena/` — at the
# 225 px the board actually draws, its roofs blurred into one pale clump, while
# the fortress reads as a single silhouette with a gate on the road.
#
# The keep is composed with a soft elliptical ground shadow, because a building
# pasted on grass with no contact shadow reads as a sticker.
# ---------------------------------------------------------------------------
LD_LIBRARY_PATH="$CHROME_LIBS" node scripts/svg-to-png.mjs art-source/arena/fortress.svg "$WORK/keep.png" 420 0.02

KEEP_W=$(identify -format '%w' "$WORK/keep.png")
KEEP_H=$(identify -format '%h' "$WORK/keep.png")
PAD_X=$((KEEP_W / 12))
PAD_Y=$((KEEP_H / 8))
CANVAS_W=$((KEEP_W + PAD_X * 2))
CANVAS_H=$((KEEP_H + PAD_Y * 2))

# Ground shadow: an ellipse blurred hard, tinted, then composited under the art.
convert -size ${CANVAS_W}x${CANVAS_H} xc:none \
  -fill 'rgba(8,12,6,0.55)' -draw "ellipse $((CANVAS_W / 2)),$((CANVAS_H - PAD_Y / 2)) $((KEEP_W * 34 / 100)),$((KEEP_H * 12 / 100)) 0,360" \
  -blur 0x9 "$WORK/shadow.png"

convert "$WORK/shadow.png" "$WORK/keep.png" -geometry +${PAD_X}+${PAD_Y} -compose over -composite \
  -depth 8 "$OUT/bastion-fortress.png"
echo "wrote $OUT/bastion-fortress.png ($(identify -format '%wx%h' "$OUT/bastion-fortress.png"))"

# ---------------------------------------------------------------------------
# 3. The river flow — a seamless, tileable ripple layer.
#
# The river splits the board, so it has to look like it is *moving* or the split
# reads as a painted stripe. The source is the CC0 Kenney water-caustics mask
# the game already ships; it is mirrored into a 2x2 block, which makes any
# texture tile seamlessly by construction (edge pixels are duplicated, not
# butted against a different edge), then tinted to the rift's deep teal.
# ---------------------------------------------------------------------------
CAUSTICS=public/assets/fx/fx-water-caustics.png
if [ -f "$CAUSTICS" ]; then
  convert "$CAUSTICS" -resize 256x256 "$WORK/caus.png"
  # mirror-tile: [A B / B A] with each edge flipped onto itself
  convert "$WORK/caus.png" \( "$WORK/caus.png" -flop \) +append "$WORK/row1.png"
  convert "$WORK/row1.png" \( "$WORK/row1.png" -flip \) -append "$WORK/tile.png"
  # The mask is white-on-black, so its own luminance becomes the alpha channel
  # and the colour is a pale river cyan. The result is a transparent ripple
  # layer the scene can scroll over the water, not a second water tile.
  convert "$WORK/tile.png" -colorspace gray -level 6%,86% -blur 0x0.4 "$WORK/mask.png"
  convert "$WORK/mask.png" -fill '#a9e9ff' -colorize 100 "$WORK/tint.png"
  convert "$WORK/tint.png" "$WORK/mask.png" -alpha off -compose CopyOpacity -composite \
    -depth 8 "$OUT/river-flow.png"
  echo "wrote $OUT/river-flow.png ($(identify -format '%wx%h' "$OUT/river-flow.png"))"
else
  echo "skip river-flow: $CAUSTICS missing" >&2
fi
