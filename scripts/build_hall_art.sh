#!/usr/bin/env bash
# build_hall_art.sh — the Champions' Hall plates.
#
# WHY THIS EXISTS
# ---------------
# The ranking screen was a table inside the shared 860 px dialog: cramped, and
# on a landscape phone the table frame collapsed to a 51 px sliver. It is now a
# hall with three separate frames (podium, the ranks, your standing), which
# needs two pieces of art that the UI kit does not have:
#
#   hall_ledger.webp    the wide wall behind the hall's header: torch-lit
#                       masonry, one gold banner, empty dark space on the left
#                       for the title.
#   banner_rank_*.webp  the same banner in three metals for the podium cards.
#                       A single photograph of a banner cannot be re-lit per
#                       rank, so each metal is a duotone of the *luminance* of
#                       the original — the folds, embroidery and firelight all
#                       survive, only the hue changes.
#
# Source art (tracked, so a rebuild needs no network):
#   art-source/ui-kit/leaderboard-hall-raw.png
#   art-source/ui-kit/leaderboard-banner-raw.png
#
# Run from the repository root:
#   bash scripts/build_hall_art.sh
#
# Outputs (checked in, referenced by src/style.css and LeaderboardUI.js):
#   public/assets/ui-kit/hall_ledger.webp      1600x560
#   public/assets/ui-kit/banner_rank_gold.webp   420x420
#   public/assets/ui-kit/banner_rank_silver.webp
#   public/assets/ui-kit/banner_rank_bronze.webp
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/art-source/ui-kit"
out="$root/public/assets/ui-kit"

hall="$src/leaderboard-hall-raw.png"
banner="$src/leaderboard-banner-raw.png"

[ -f "$hall" ] || { echo "missing $hall" >&2; exit 1; }
[ -f "$banner" ] || { echo "missing $banner" >&2; exit 1; }

# ---------------------------------------------------------------- hall plate
# Crop to the wall + banner + floor and drop the dead empty sky, then downscale
# to a size that is still crisp on a 2x phone but cheap over the wire.
convert "$hall" \
  -gravity south -crop 1915x670+0+0 +repage \
  -resize 1600x560\! \
  -modulate 100,104,100 \
  -quality 82 \
  "$out/hall_ledger.webp"

# ------------------------------------------------------------ podium banners
# A square around the sun medallion — the one part of the banner that still
# reads at 64 px. A cover-fitted card shows the emblem, not the empty pole.
crop="460x460+285+410"

duotone() { # <shade> <highlight> <file>
  # Grey first, then back to sRGB: `+level-colors` on a Gray-colorspace image
  # writes a grey ramp, which is how the first build came out colourless.
  convert "$banner" \
    -crop "$crop" +repage \
    -colorspace Gray \
    -normalize \
    -colorspace sRGB \
    +level-colors "$1","$2" \
    -resize 420x420 \
    -quality 84 \
    "$out/$3"
}

# The three metals. The shadows stay near-black so the card's own frame reads as
# the edge; the highlights carry the rank colour.
duotone '#080b11' '#ffd977' banner_rank_gold.webp
duotone '#0a0d13' '#dfe8f2' banner_rank_silver.webp
duotone '#0b0906' '#e2a068' banner_rank_bronze.webp

echo "hall_ledger.webp"      $(wc -c < "$out/hall_ledger.webp")
for f in banner_rank_gold banner_rank_silver banner_rank_bronze; do
  echo "$f.webp" $(wc -c < "$out/$f.webp")
done
