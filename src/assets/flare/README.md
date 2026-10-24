# Flare monsters (CC-BY-SA 3.0)

Six creatures imported from [FLARE](https://github.com/clintbellanger/flare-game),
the open-source action RPG by Clint Bellanger and contributors. The pack fills a
gap the Spire set could not: the Spire horde is all insects, so every wave read
as the same brood in a different colour.

**Licence:** all Flare art and data files are CC-BY-SA 3.0 (later versions
permitted) — see `LICENSE.txt` and
`https://github.com/clintbellanger/flare-game#copyright-and-license`.
Attribution and ShareAlike apply to the files below and to anything derived from
them. Everything here is a derivative work (see *Modifications*), so the same
licence carries through to `public/assets/enemies/enemy-thrall*.png` and
friends.

## Files used

| Game key | Flare source (`mods/…`) | Frames lifted |
|---|---|---|
| `thrall` | `fantasycore/images/enemies/zombie.png` + `animations/enemies/zombie.txt` | stance, run, die (direction 6) |
| `raider` | `fantasycore/images/enemies/goblin.png` + `…/goblin.txt` | stance, run, die (direction 6) |
| `bonearcher` | `fantasycore/images/enemies/skeleton_archer.png` + `…/skeleton_archer.txt` | stance, run, die (direction 6) |
| `ironhorn` | `fantasycore/images/enemies/minotaur.png` + `…/minotaur.txt` | stance, run, die (direction 6) |
| `ashwing` | `fantasycore/images/enemies/wyvern.png` + `…/wyvern.txt` | stance, run, die (direction 6) |
| `gravesworn` | `empyrean_campaign/images/enemies/skeleton_knight_boss.png` + `animations/enemies/skeleton_knight_boss.txt` | stance, run, die (direction 6) |

Flare's atlases are packed rectangles with a per-frame foot offset; the
animation `.txt` files name the rectangle for every frame of every one of eight
facings.

## Modifications

`scripts/extract_flare_enemies.py` regenerates the strips in `enemies/`:

1. **One facing.** Only direction 6 (full front) is lifted. The game ships one
   strip per creature, and Flare's art is upright, so these sheets declare
   `facing: 'camera'`: `Enemy.faceTravel()` mirrors them left/right instead of
   rotating them, which would lay a walking minotaur on its side. Keeping all
   eight facings would have to be baked into every biome × tier sheet — four
   times the pixels per creature for a difference only visible from behind.
2. **Shadows removed.** Flare bakes a soft black ellipse under each creature;
   the game draws its own shadow and a baked one would rotate with the body.
   Only low-alpha near-black pixels are dropped.
3. **Recomposited.** Every clip is re-laid into the game's 9-row strip
   (idle / move / death × 3 palette slots) on a square, foot-anchored cell.
   Blank tail columns keep the real frame count instead of padding the loop.
4. **Recoloured.** Creeps are re-graded per biome by
   `scripts/build_spire_assets.py`; bosses are graded 50–55 % toward their
   element ramp instead of the full duotone the Spire giants get.

Re-running the importer needs a Flare checkout and Pillow:

```bash
git clone --depth 1 https://github.com/clintbellanger/flare-game /tmp/flare-game
python3 scripts/extract_flare_enemies.py --source /tmp/flare-game
python3 scripts/build_spire_assets.py
```

## Credit

> Enemy art from FLARE (https://github.com/clintbellanger/flare-game),
> © Clint Bellanger and contributors, licensed CC-BY-SA 3.0. Modified: one
> facing lifted, baked shadows removed, frames recomposited and recoloured.
