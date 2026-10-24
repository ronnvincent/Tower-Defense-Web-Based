# Asset Integration — Foozle "Spire" art set

This document records exactly which third-party files the game ships, where each
one came from, and how it is used. It replaces the earlier placeholder art
(Kenney "Tower Defense Top Down" plus procedural canvas textures).

Every file listed here is **CC0 1.0 Universal** (public domain dedication).
Attribution is not required; the artist is credited voluntarily.

- Artist: **David / chroma_dave**, commissioned and distributed by **Foozle**
  (<https://foozlecc.itch.io/>)
- Licence text: <https://creativecommons.org/publicdomain/zero/1.0/>
- Commercial use is permitted; each pack's `Readme.txt` states the CC0 terms.

## 1. Source packs

| Pack | itch.io page | Shipped archive | What we use |
| --- | --- | --- | --- |
| Spire Tower Pack 1 | <https://foozlecc.itch.io/spire-tower-pack-1> | `Foozle_2DS0017_Spire_TowerPack_1.zip` | Towers 01–02 (base + weapon + projectile + impact) |
| Spire Tower Pack 2 | <https://foozlecc.itch.io/spire-tower-pack-2> | `Foozle_2DS0018_Spire_TowerPack_2.zip` | Towers 03–04 |
| Spire Tower Pack 3 | <https://foozlecc.itch.io/spire-tower-pack-3> | `Foozle_2DS0019_Spire_TowerPack_3.zip` | Towers 05–06 |
| Spire Enemy Pack 1 | <https://foozlecc.itch.io/spire-enemy-pack-1> | `Foozle_2DC0027_Spire_EnemyPack_1_Flying.zip` | Firewasp (boss), Flying Locust (boss), Clampbeetle, Voidbutterfly |
| Spire Enemy Pack 2 | <https://foozlecc.itch.io/spire-enemy-pack-2> | `Foozle_2DC0028_Spire_EnemyPack_2_Ground.zip` | Leafbug, Firebug, Scorpion, Magma Crab |
| Spire Tileset 1 | <https://foozlecc.itch.io/spire-tileset-1> | `Foozle_2DT0012_Spire_Tileset_1.zip` | Grass, road, rock, water, foliage, palisade parts |

The original archives stay outside the repository. Only the files below are
committed, all under `src/assets/spire/` (unmodified sources) and
`public/assets/` (cropped/derived runtime art).

![Asset preview](asset-integration/asset-preview.png)

The composed battlefield (terrain autotiles, towers, palisade and props, drawn
by a canvas port of the in-game placement rules):

![Map preview](asset-integration/map-preview.png)

## 2. Tower mapping

Game slots are `lvl1 → lvl2 → spec-a / spec-b`. Art data lives in
[`src/data/towerVisuals.js`](../src/data/towerVisuals.js); the generator is
[`scripts/build_spire_assets.py`](../scripts/build_spire_assets.py).

| Game tower | Art family | Slots | Reads as |
| --- | --- | --- | --- |
| **Ballista Tower** (`archer`) | Tower 01 (L1, L2, L3), Tower 06 (L3) | `t01_l01`, `t01_l02`, `t06_l03`, `t01_l03` | Stone platform + rotating ballista with bolt arms |
| **Boulder Sling** (`cannon`) | Tower 03 (L1, L2, L3), Tower 04 (L3) | `t03_l01`, `t03_l02`, `t03_l03`, `t04_l03` | Timber platform + counterweight sling; the level-3 branch becomes a wall-mounted swivel gun |
| **Frost Bastion** (`frost`) | Tower 02 (L1, L2, L3), Tower 05 (L3) | `t02_l01`, `t02_l02`, `t02_l03`, `t05_l03` | Shrine bowl + levitating ice crystal; the level-3 branch is a rune obelisk with a conductor orb |
| **Palisade** (`barricade`) | Tileset 1 walkway planks + stone coping | one sprite per tier | Vertical stakes with a stone cap, standing on the road |

Mechanics are untouched: ranges, damage, cooldowns, upgrades, targeting,
hitboxes and the DSALGO pathfinding all use the same numbers as before the
restyle. Only presentation changed.

### Placement contract

`TOWER_VISUALS[type][slot]` gives, per slot:

- `base` / `weapon` — file names under `public/assets/towers/`
- `fw`, `fh`, `frames` — weapon spritesheet geometry (frames are horizontal)
- `px`, `py` — the weapon's rotation pivot inside its frame
- `mount` — how far above the tile's ground line that pivot sits

The base sprite is bottom-anchored at the tile's ground line; the weapon is
drawn with its pivot at `(tileCentreX, tileBottomY − mount)` and rotates about
it. `MUZZLE_OFFSET` lists where each weapon's projectile leaves the art
(relative to the pivot), so shots start at the weapon rather than the tile
centre. Frost crystals never rotate (`NON_ROTATING_TYPES`) and simply bob.

### Projectiles and impacts

| Game projectile | Art | Impact strip |
| --- | --- | --- |
| `arrow` / `sniper` | `proj-arrow`, `proj-sniper` (Tower 01) | `impact-arrow` |
| `rapid` | `proj-rapid` (Tower 06) | `impact-rapid` |
| `cannonball` | `proj-cannonball` (Tower 03) | `impact-cannon` |
| `frost` | `proj-frost`, `-2`, `-3` per tier (Tower 02) | `impact-frost`, `-2`, `-3` |
| `lightning` | `proj-lightning` (Tower 05) | `impact-lightning` |

## 3. Enemies

`src/data/spireManifest.js` is generated from the real sheets and records frame
size plus the frame count of each animation band.

| Game archetype | Creature | Sheet | Frames (idle / move / death) |
| --- | --- | --- | --- |
| `grunt` | Leafbug | `enemy-grunt.png` | 6 / 8 / 7 |
| `runner` | Firebug | `enemy-runner.png` (128×64 frames) | 6 / 8 / 11 |
| `brute` | Scorpion | `enemy-brute.png` | 8 / 8 / 8 |
| `swarm` | Clampbeetle | `enemy-swarm.png` | 8 / 8 / 13 |
| `healer` | Voidbutterfly | `enemy-healer.png` | 6 / 4 / 12 |
| `shield` | Magma Crab | `enemy-shield.png` | 8 / 8 / 10 |
| `boss-colossus` | Firewasp | `enemy-colossus.png` (96×96 frames) | 12 / 8 / 12 |
| `boss-warlord` | Flying Locust | `enemy-warlord.png` | 12 / 8 / 14 |

Each strip holds nine rows: idle, walk and death, each in three colour
variants. The game plays variant 0. Frame size differs per creature (the
Firebug sheet is 128×64 per frame, the Firewasp 96×96), so the manifest also
records the drawn width/height of the art. Sprites are scaled by that drawn
width to match the existing collision radius, and rotated +90° because the art
faces up.

Display names in `src/data/enemyData.js` stay thematic; the insect artwork is
accepted as part of the "Spire" look.

## 4. Terrain

Every tile is 64×64 and derived from `tileset/grass.png` / `water.png`:

- `grass.png` — base ground for the whole board
- `road_0.png` … `road_15.png` — road autotiles indexed by a 4-bit neighbour
  mask (N=1, E=2, S=4, W=8); the ragged grass border comes from the pack art
- `rock.png`, `water.png` — obstacles and hazards
- `foliage.png` — scattered decoration on grass tiles

## 5. Known gaps and deliberate choices

1. **No dedicated barricade prop.** Spire Tileset 1 has no single-tile fence or
   spike barrier. The palisade is therefore composed from the walkway's vertical
   planks plus its stone coping, and given a contact shadow. It reads as a
   staked fence rather than a manufactured barricade; a dedicated prop would be
   needed for a stronger silhouette.
2. **Tower 05 L3 ships two animation rows** (96×96 frames: idle on top, firing
   below). The generator keeps the firing row so every weapon sheet is one row.
3. **Archer impact art exists only per tower** (`Weapon - Impact`), not per
   level, so `arrow` and `sniper` share one strip.
4. **No enemy shadow sprites** are shipped in the packs; the existing renderer
   draws none, matching the source game.
5. **Cropped, not repainted.** Bases are trimmed to 64 px wide and weapons are
   recoloured only for the frost/lightning branches (hue remap in the
   generator), so no art is invented.

## 6. Regenerating the art

```bash
python3 scripts/build_spire_assets.py
```

Requires only the standard library plus the unpacked source packs in
`src/assets/spire/`. The script prints one line per output file — treat that as
the manifest — and rewrites `src/data/spireManifest.js`.
