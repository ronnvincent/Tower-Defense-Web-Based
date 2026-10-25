# Asset Library — free art, downloaded and licence-checked

This document records what third-party art was **downloaded for evaluation** (as
distinct from `docs/asset-integration.md`, which records what the build actually
*ships*). The library lives at `/home/user/asset-library`, outside the
repository, so 26 MB of raw packs never reach the git history or the bundle.

Rebuild it at any time with:

```bash
python3 scripts/fetch_asset_library.py           # writes ../asset-library
python3 scripts/fetch_asset_library.py --list    # just print the pack table
```

## 1. The network constraint, stated plainly

The build sandbox runs behind an **egress allowlist**. Every host below
*resolves* — DNS is fine — but the TLS handshake is dropped after the Client
Hello, so the original download pages are unreachable:

| Host | DNS | HTTPS | Note |
|---|:-:|:-:|---|
| `github.com` | ✅ | **200** | reachable |
| `api.github.com` | ✅ | **200** | reachable |
| `codeload.github.com` | ✅ | **301** | reachable (tarballs) |
| `registry.npmjs.org` | ✅ | **200** | reachable |
| `pypi.org` | ✅ | **200** | reachable |
| `raw.githubusercontent.com` | ✅ | **000** | blocked |
| `opengameart.org` | ✅ | **000** | blocked |
| `kenney.nl` | ✅ | **000** | blocked |
| `itch.io` | ✅ | **000** | blocked |
| `craftpix.net` | ✅ | **000** | blocked |

```
$ curl -sv https://kenney.nl
* Connected to kenney.nl (149.210.216.123) port 443
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to kenney.nl:443
```

So the only viable route is a **GitHub-hosted mirror** of the same packs:

- [`Tiddybub/2d-assets`](https://github.com/Tiddybub/2d-assets) — 1,101 packs,
  each with an untouched `SOURCE.md` naming the upstream page, licence and
  credit. 142 packs are Kenney, 959 are OpenGameArt.
- Fetched with a **blobless sparse clone** (`--depth 1 --filter=blob:none
  --sparse`) so only the selected packs transfer.

The licence is the upstream one either way: every pack below is **CC0**
(Kenney `CC0-1.0`, OpenGameArt `CC0`) — commercial use, no attribution required.

## 2. The selection run

The whole mirror was inventoried before anything was copied: 1,101 catalog
entries, 437 pack folders checked out, **44,068 png + 176 jpg + 414 gif + 4,872
svg** on disk (1.4 GB).

Packs were scored by tag/genre relevance to a top-down medieval-fantasy tower
defence and filtered by hard exclusions:

| Dropped | Reason | Packs |
|---|---|--:|
| 3D meshes (`Static Mesh`) | cannot render on a 2D battlefield | 105 |
| Audio, fonts, photo packs | not art | — |
| Sci-fi / space / vehicles | wrong setting | 469 sci-fi-tagged |
| `Retina/`, `Vector/`, `TIF Sources/` | the same art at 2× / in SVG | — |
| Packs with no raster image at all (svg/text only) | nothing the renderer can slice | 107 of 437 |

431 pack paths were materialised for review; **11 were kept**.

## 3. What was kept

| Folder | Title | Origin | Licence | Images | Size | Common tile sizes |
|---|---|---|:-:|--:|--:|---|
| `kenney-tower-defense-top-down` | Tower Defense (Top-Down) | Kenney | CC0-1.0 | 304 | 2.1 MB | 64×64 ×299 |
| `kenney-map-pack` | Map Pack | Kenney | CC0-1.0 | 194 | 2.1 MB | 64×64 ×188, atlas 896² |
| `kenney-medieval-rts` | Medieval RTS | Kenney | CC0-1.0 | 133 | 1.2 MB | 64×64 ×126 |
| `kenney-foliage-pack` | Foliage Pack | Kenney | CC0-1.0 | 113 | 1.3 MB | 64×64 ×44 |
| `kenney-foliage-sprites` | Foliage Sprites | Kenney | CC0-1.0 | 102 | 2.4 MB | 1024² ×100 |
| `kenney-game-icons-expansion` | Game Icons Expansion | Kenney | CC0-1.0 | 790 | 6.7 MB | 50×50 / 100×100 |
| `oga-magic-skill-icons` | Magic Skill & Item Icons | OpenGameArt | CC0 | 584 | 9.1 MB | 64×64 ×573 |
| `oga-osare-weapon-icons` | OSARE weapon & armour | OpenGameArt | CC0 | 19 | 0.3 MB | 60×60 ×17 |
| `kenney-splat-pack` | Splat Pack | Kenney | CC0-1.0 | 73 | 0.3 MB | 256² and 512² |
| `oga-flare-cracked-tiles` | FLARE cracked tileset | OpenGameArt | CC0 | 2 | 0.2 MB | 666×371, 320×128 |
| `kenney-micro-roguelike` | Micro Roguelike | Kenney | CC0-1.0 | 166 | 0.1 MB | 8×8 ×160 |

**2,480 images, 25.9 MB, 11 packs, 2 origins.**

### Verdict per pack

- **`kenney-tower-defense-top-down`** — the single most on-genre pack in the
  library: 299 tiles at exactly the game's 64 px grid, with grass / dirt / sand
  / stone / water autotile edges, tower bases, range rings and spawn markers.
  Its flat vector look does **not** match the Spire pixel art, so it is a
  candidate for a whole-mode restyle, never a drop-in swap.
- **`kenney-medieval-rts`** — 23 structures and 21 environment pieces at 64 px.
  Useful as *decor* on maps: houses, walls, fences, ore, gems, trees.
- **`kenney-map-pack`** — overworld autotile (grass / sand / snow / water /
  road). Right size, wrong register: it carries penguins and slimes, so it reads
  as a cute overworld rather than a battlefield.
- **`kenney-game-icons-expansion`** — 790 monochrome glyphs at 50 and 100 px.
  The one pack that could be adopted immediately: HUD chips, card corners and
  tooltips all currently use hand-built glyphs.
- **`oga-magic-skill-icons` / `oga-osare-weapon-icons`** — 64 px and 60 px item
  icons. Card art, mastery badges, Forge tier pips.
- **`kenney-splat-pack`**, **`oga-flare-cracked-tiles`** — impact and ground
  effects; the cracked tiles are FLARE-styled, matching the Flare creatures
  already in the game.
- **`kenney-micro-roguelike`** — 8×8 tiles, too small for this grid.

## 4. Not adopted yet

Nothing in this library is wired into the game. Promoting a pack means copying
only the needed sprites into `public/assets/…`, re-encoding at the size the
renderer slices (64 px terrain, 32 px props, 50/100 px glyphs), and — if it
becomes a terrain theme — adding its palette to `scripts/terrain.py` so the full
42-tile autotile set stays consistent with the rest of the game.

The honest summary: the reachable library is **two origins, both CC0**, and the
strongest tileset in it (`tower-defense-top-down`) is stylistically incompatible
with the shipped art. It is a second visual language, not a replacement.
