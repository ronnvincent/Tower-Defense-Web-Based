#!/usr/bin/env bash
# build_unit_sheets.sh — compose the hero and companion animation sheets.
#
# WHY A SCRIPT
# ------------
# The hero used to be four frames of one painted pose: an idle and a bob. This
# game draws walking, attacking and dying units for every enemy on the board, so
# a commander that only bobs reads as a sticker next to them. The art now comes
# from Tiny Swords (Pixel Frog, CC0 1.0 — see
# `art-source/units/LICENSE-TinySwords-CC0.txt`), which ships each unit as one
# PNG per animation row. Phaser wants one texture per character with a row per
# clip, so this script re-packs the rows:
#
#   row 0 = idle, row 1 = walk, row 2 = attack
#
# Trailing empty columns are trimmed before the maximum frame count is taken, so
# a six-frame idle next to a seven-frame attack gets one transparent cell rather
# than a duplicated pose, and `generateFrameNumbers` never plays a blank frame.
#
# WHY NOT PYTHON
# --------------
# The other art scripts use Pillow, which is not installed on every machine that
# has to rebuild this. ImageMagick is, and everything here is crop/append.
#
#   bash scripts/build_unit_sheets.sh
#
# The generated sheets are committed; running this is only needed when the
# source pack changes.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SRC="$ROOT/art-source/units"
OUT="$ROOT/public/assets/units"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

# Highest frame index in `row` that still carries ink, in 1-based count.
frames_in_row() {
  local file="$1" fw="$2" row="$3" cols="$4" i alpha count=0
  for ((i = 0; i < cols; i++)); do
    alpha=$(convert "$file" -crop "${fw}x${fw}+$((i * fw))+$((row * fw))" +repage \
      -alpha extract -format "%[fx:maxima]" info:)
    if awk -v a="$alpha" 'BEGIN { exit !(a > 0.01) }'; then count=$((i + 1)); fi
  done
  echo "$count"
}

# One row of the finished sheet: the row's frames, padded to `sheet_cols` cells.
build_row() {
  local file="$1" fw="$2" row="$3" sheet_cols="$4" out="$5" strip
  strip=$(identify -format '%w' "$file")
  convert "$file" -crop "${strip}x${fw}+0+$((row * fw))" +repage \
    -background none -gravity west -extent "$((sheet_cols * fw))x${fw}" "$out"
}

# name|source|frame|idleRow|walkRow|attackRow|clips
# `clips` is how many sheet rows to emit: 3 (idle/walk/attack, the default) or 1
# for a one-shot effect like the fallen-knight skull.
SPECS=(
  "hero-vanguard|warrior_blue.png|192|0|1|2"
  "hero-captain|warrior_yellow.png|192|0|1|3"
  "hero-warlord|warrior_red.png|192|0|1|4"
  "hero-sentinel|warrior_purple.png|192|0|1|4"
  "hero-halberd|pawn_blue.png|192|0|1|3"
  "pet-squire|pawn_blue.png|192|0|1|3"
  "pet-fletch|archer_blue.png|192|0|1|2"
  "pet-ember|torch_blue.png|192|0|1|2"
  "pet-boomer|tnt_blue.png|192|0|1|2"
  "pet-wool|sheep_all.png|128|0|1|1"
  "fx-skull|dead.png|64|0|0|0|1"
)

printf '%-16s %-6s %-6s %-6s %-6s %s\n' unit idle walk attack sheet frames
for spec in "${SPECS[@]}"; do
  IFS='|' read -r name file fw idle walk attack clips <<<"$spec"
  clips=${clips:-3}
  cols=$(($(identify -format '%w' "$SRC/$file") / fw))
  n_idle=$(frames_in_row "$SRC/$file" "$fw" "$idle" "$cols")
  n_walk=$(frames_in_row "$SRC/$file" "$fw" "$walk" "$cols")
  n_attack=$(frames_in_row "$SRC/$file" "$fw" "$attack" "$cols")
  max=$n_idle
  for n in "$n_walk" "$n_attack"; do if [ "$n" -gt "$max" ]; then max=$n; fi; done
  [ "$max" -gt 0 ] || { echo "no frames for $name" >&2; exit 1; }

  build_row "$SRC/$file" "$fw" "$idle" "$max" "$TMP/${name}-0.png"
  convert "$TMP/${name}-0.png" -strip -depth 8 "$OUT/${name}.png"
  if [ "$clips" -gt 1 ]; then
    build_row "$SRC/$file" "$fw" "$walk" "$max" "$TMP/${name}-1.png"
    build_row "$SRC/$file" "$fw" "$attack" "$max" "$TMP/${name}-2.png"
    convert "$TMP/${name}-0.png" "$TMP/${name}-1.png" "$TMP/${name}-2.png" \
      -append -strip -depth 8 "$OUT/${name}.png"
  fi
  printf '%-16s %-6s %-6s %-6s %-6s %s\n' "$name" "$n_idle" "$n_walk" "$n_attack" "$max" \
    "$(identify -format '%wx%h' "$OUT/${name}.png")"
done

echo "wrote $(ls -1 "$OUT" | wc -l) sheets to public/assets/units"
