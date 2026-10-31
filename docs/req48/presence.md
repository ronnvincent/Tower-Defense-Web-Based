# Req 48 — Tower presence, tier moments, and the artillery reach

The brief, in the player's words: *"masyadong boring yung dinagdag mo na defenses,
parang halos same lahat magkakamukha, wala man lang kabuhay buhay, wala rin
masyadong effects… gawan mo ng maangas pero wag naman yung masyadong masakit sa
mata… sa artillery natin dapat sobrang lawak ng range as in."*

Three separate complaints, three separate causes:

| Complaint | Real cause | Fix |
|---|---|---|
| "halos same lahat magkakamukha" | every line wore the **same decoration stack** (crown → pennants → standard → braziers → shards) in the same places | a per-family **presence layer** (`src/data/towerPresence.js`) |
| "wala man lang kabuhay buhay" | a keep that had not upgraded yet was completely static | ambient motion from level 1 + a real arrival moment per tier |
| "wala masyadong effects" | the only upgrade feedback was a small pop on the decorations | `Vfx.tierUp()` — ring, light column, spark count scaled by tier |
| "sobrang lawak ng range" (artillery) | 520 px on a 2 048 px board, i.e. a quarter of the map | 620 → 700 → 800 → 820 → 840 px, plus a matching ladder on every siege line |

Nothing here touches damage, cooldowns or the economy. Reach is the only
gameplay number that moved, and it only moved on the siege lines.

---

## 1. The presence layer

The old decoration stack was shared by all twenty-one lines. Two different
families therefore grew the *same* gold pennant in the *same* place at level 2,
which is exactly why the board read as "the same tower twice".

Presence replaces that with eight families. Every line belongs to one, and a line
without an entry falls back to `trap` rather than silently getting nothing:

| Style | Lines | Accent |
|---|---|---|
| `bolt` | archer, crossbow, gatling, siegeBallista | cold steel, cyan edge |
| `shell` | cannon, mortar, royalArtillery | warm ember |
| `frost` | frost, rimeTower | pale azure |
| `storm` | tesla, runes, obelisk, skybreaker, arcaneSniper | indigo, hot blue core |
| `venom` | venom, flamer | mossy acid green |
| `forge` | forge, workshop, banner | amber gold |
| `harpoon` | harpoon | sea teal |
| `trap` | spikeTrap (and the fallback) | iron grey |

Each family owns five textures — `crest`, `sigil`, `ring`, `halo`, `mote` — with
a **different shape**, not a recolour of one shape:

* `bolt` — crossed bolts over a firing bar
* `shell` — a mortar tube on a base plate
* `frost` — a cluster of ice spikes
* `storm` — a lightning bolt between two conductors
* `venom` — a bubbling cauldron
* `forge` — an anvil
* `harpoon` — a barbed hook in a ring of rope
* `trap` — three upright spikes

### What each tier puts on the keep

| Level | Layer | Size | Motion |
|---|---|---|---|
| 1 | `mote` — an ambient fleck | 5×5 | float, 2.2 s |
| 2 | `crest` — a mirrored pair of family finials | 30×26 | static |
| 3 | `sigil` (ground) + branch `gem` | 62×24 / 11×11 | breathe / glint |
| 4 | `ring` — a turning energy band | 52×52 | spin, 12 s |
| 5 | `halo` — a mirrored pair of wings behind the keep | 30×26 | breathe, 2.6 s |

Two design decisions worth recording, because both were bugs first:

1. **The crest is a mirrored pair, not a centred medallion.** The upgrade badge
   floats directly above a tower's art (`UpgradeBadge.badgeAnchorY`), so a
   centred crest was hidden exactly when the player could afford the next tier —
   the ornament you most want to see was the one you never saw. Putting the pair
   on the shoulders also *widens* the silhouette, which is what distinguishes two
   families at 54 % zoom.
2. **The crest is drawn in front of the tier decor.** It was behind at first, and
   the level-2 gold pennant sits in exactly the same spot: the family shape was
   completely covered. Front means the finial is what the eye reads at the top of
   the keep instead of the shared pennant.

### Restraint rules (the "wag masakit sa mata" half)

* the two branch gems are **different colours** — amber round for `spec-a`, teal
  diamond for `spec-b`. Nine pixels is too small for two shapes alone to read
  apart, and the branch a player picked should be legible on the board, not only
  in the inspector;
* every additive layer stays at **≤ 0.6 alpha** (`tests/tower-presence.test.js`
  enforces it). They are hairlines and arcs, never filled plates;
* only three of the five layers animate, and every cycle is 1.4 s or slower;
* ground layers sit under the structure; roof layers sit on the art's roof line
  or behind the keep. Nothing drifts over the road, the weapon or the tile next
  door;
* a barricade gets **no presence at all** — it is a wall, not a keep.

## 2. The tier-up moment

Before: an upgrade popped a few decorations. Now `Vfx.tierUp(x, y, { tier,
branch, height })` plays three beats, and only one of them is loud:

1. a ground ring that widens past the tile (620 ms), tinted by branch;
2. a short, thin light column (520 ms) — short on purpose, so it marks the keep
   without washing out the lane behind it;
3. sparks, `8 + tier * 4` of them, so a level-2 keep gets a puff and a maxed one
   gets a shower.

A camera shake is allowed **only at tier 5**, and it is 110 ms at 0.0025 — a
nudge, not a punch. Below 5 the upgrade stays a local event; with sixty keeps on
the board, a shake per upgrade would be nauseating.

The muzzle flash also grows with rank: `0.52 + (level - 1) * 0.07`, i.e. 0.52 →
0.80. Verified in the browser, not just in a unit test: a real wave was started,
`Vfx.muzzle` was wrapped, and an L1 archer fired at 0.52 while an L5 archer fired
at 0.8.

## 3. Reach

Artillery is the fantasy: it is supposed to cover most of the board.

| Tier | Reach | Branch |
|---|---|---|
| 1 Field Bombard | 620 | — |
| 2 Banded Siege Gun | 700 | — |
| 3 Bastion Culverin | **800** | A (`bombard`) |
| 4 Counterweight Bombard | 820 | A |
| 5 Royal Siege Battery | 840 | A |
| 3 Twin-Bore Battery | 720 | B (`battery`) |
| 4 Salvo Culverin | 740 | B |
| 5 Royal Salvo Battery | 760 | B |

The board is 2 048 × 768, so 840 px is more than a third of the map in a straight
line: a single maxed bombard covers a whole flank. It pays for that with the
slowest reload in the game (3.4 s).

> **Amended by Req 50.** This pass also gave the line a 120 px dead zone. That
> was wrong and has been removed: the nearest a creep can legally stand to a
> tower is one tile (64 px), so the floor covered every walk-by and the piece
> went silent on anything that got close. Reach is the only gate now.

Every other siege line was lifted to keep the ordering sane, and the rest of the
roster was left alone:

| Line | L1 → L5 (branch A) | L3 → L5 (branch B) |
|---|---|---|
| Mortar | 340 → 360 → 390 → 410 → 430 | 360 → 370 → 380 |
| Siege Ballista | 270 → 290 → 300 → 320 → 340 | 290 → 300 → 310 |
| Skybreaker | 300 → 315 → 330 → 345 → 360 | 315 → 325 → 335 |
| Arcane Sniper | 340 → 360 → 385 → 410 → 430 | 365 → 375 → 385 |
| Rime Tower | 180 → 195 → 208 → 220 → 230 | 200 → 212 → 224 |
| Tesla | 175 → 190 → 205 → 220 → 235 | 220 → 230 → 240 |

### The bug that reaching further exposed

Tier numbers live in **two** files: `royalDefences.js` holds levels 1–3 and
`towerAscension.js` holds the level 4 and 5 blocks. Raising the level-3 number
alone left branch A of the artillery reading 800 → **495** → 520: a player who
paid 240 gold for level 4 *lost 305 px of reach*. The same mistake hid two more
drops — `hexweaver` (level 2 at 360 px, level 3 at 330 px) and a second-place
range that was a tie.

`tests/tower-presence.test.js` now pins the invariant for every line in both
files: **reach never shrinks when a tower is upgraded**, and the artillery line
must be the longest reach in the game by at least 100 px.

## 4. Verification

| Gate | Result |
|---|---|
| `npx vitest run` | **123 files, 1 532 tests passed** |
| `npm run build` | ✓ 7.2 s, `index-*.js` 701.54 kB |
| `python3 scripts/build_tower_presence.py` | 42 textures + `src/data/towerPresenceArt.js` |
| Browser, families at L4 | `docs/req48/families.png` |
| Browser, archer L1 → L5 | `docs/req48/tiers-archer.png` |
| Browser, cannon L1 → L5 (branch B) | `docs/req48/tiers-cannon.png` |
| Browser, real wave on the board | muzzle scales 0.52 (L1) / 0.80 (L5); artillery fired at 800 px (`docs/req48/volley.png`) |
| Browser, inspector | reads `RANGE 800px`, ring drawn on the board (`docs/req48/reach-800.png`) |
| Browser, upgrade moment | `docs/req48/tier-up.png` — 6 frames, 0 → 420 ms |
| Console during every capture | `errors: []` |

The three sheets are cropped from `vite preview` against the production build,
with upgrade badges hidden so the silhouette is unobstructed — the roofs are what
the request was about, and the badges cover them by design.

Not verified, and therefore not claimed: natural mobile touch, a royal-only wave
clearing on its own, and a Vercel build of this commit.

## 5. Files

| File | What changed |
|---|---|
| `scripts/build_tower_presence.py` | generates the five layers × eight families + two gems |
| `src/data/towerPresenceArt.js` | generated manifest (key → file) |
| `public/assets/towers/deco/presence/*.png` | 42 textures |
| `src/data/towerPresence.js` | families, tier table, `presenceParts`, `styleFor` |
| `src/entities/Tower.js` | `refreshPresence`, arrival spring, mirrored pieces, muzzle scale |
| `src/scenes/BootScene.js` | loads the presence textures |
| `src/systems/Vfx.js` | `tierUp`, `muzzle({ scale })` |
| `src/data/royalDefences.js` | siege reach + truthful descriptions |
| `src/data/towerAscension.js` | level 4/5 reach so the ladder never drops |
| `tests/tower-presence.test.js` | 15 tests: layers, order, alpha cap, assets on disk, reach invariants |
| `docs/royal-defences.md` | every reach row re-synced to config (56 rows checked, 0 mismatches) |
