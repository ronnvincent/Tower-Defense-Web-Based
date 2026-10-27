# Bastion overhaul — what shipped in this pass

Request 36 ("Defense of Kingdom: DSALGO Bastion Edition") is larger than one
session. This file records what was **actually built and measured** in this pass,
what was left alone on purpose, and what is still open. Nothing here is a plan
dressed up as a result: every number below came out of a headless run of the
real game, and the runs are named so they can be repeated.

## 1. Ground / air is now a single rule

Before this pass the flying archetype existed as data (`ENEMY_TYPES[*].flying`,
`TOWER_TYPES[*].targetsAir`) and was honoured by exactly one place: a tower
picking its next target. Everything that happened **without an aim** ignored it.

| where | before | after |
| --- | --- | --- |
| `Tower.acquireTarget` | checked `e.flying && !canReachAir` inline | `canTarget(def, enemy)` |
| `Projectile.impact` splash loop | damaged every creep in the radius | `projectileCanHit(stats, enemy)` |
| `Projectile.frostNova` (L5 frost ring) | froze every creep in the ring | `projectileCanHit(stats, enemy)` |
| `Projectile.executeChainLightning` | walked the array once, no category test, no nearest-first | nearest valid creep, visited set, category test |
| `Tower.checkBarricadeThorns` | hit anything within 58 px | skips flyers — spikes are in the road |
| `Tower.fire` | stats carried no category | copies `targetsGround` / `targetsAir` onto the shot |
| Palisade definition | silent ⇒ defaulted to "hits air" | `targetsAir: false` |

`src/systems/TargetCategories.js` owns the rule and the two labels the UI prints
(`targetLabel` for a sentence, `targetBadge` for a dock card). A definition that
says nothing still hits everything — that is the compatibility default, so old
saves and any tower added tomorrow keep working.

**Why the flags ride on the shot:** by the time a slow shell lands, the tower may
be sold, destroyed, or the run may have been restarted. The blast has to know
whose shell it is, so `Tower.fire` copies the two booleans into the projectile's
stats. `splashIgnoresTargeting: true` is the documented escape hatch for a shell
that is *meant* to sweep the sky.

### Proof it is enforced, not just declared

`tests/target-categories.test.js` runs the real `Tower`, `Projectile` and `Enemy`
classes over the headless combat harness:

* a ground-only 40-damage shell with an 80 px splash damages a grunt standing in
  the blast and leaves a wraith 10 px away at full health;
* a dual-purpose shell damages both;
* a ground-locked keep's chain arc skips the wraith and still hits the ground
  creep behind it (a filter, not a dead ability);
* five allowed hops still land exactly one hit on a lone creep (measured against
  a one-hop control run, so armour cannot make the number brittle);
* palisade thorns skip the flyer and still burn the walker;
* an explicit opt-out keeps the "sweeps the sky" shell working.

## 2. Air is a route, not a flag

`src/systems/AirRoutes.js` derives **three sky lanes per board** from the board
itself: three mouths across the top rim, a vertical drop, then a diagonal into
the bastion cell. No hand-drawn table, so every stage has air routes, and the
derivation is deterministic (both duel seats must agree).

`GameScene.spawnEnemy` now sends a flying creep down the sky lane for the same
wave ordinal the ground horde uses, and the ground lanes are untouched.

Measured on level 1 (26 × 12 board), in the browser:

| | first cell | waypoints | ends on |
| --- | --- | --- | --- |
| ground lane (wave 4) | `2,4` | 25 | `9,21` |
| sky lane (wave 4) | `1,12` | 15 | `9,21` (the bastion) |

`tests/air-routes.test.js` (15 tests) pins: ≥ 2 lanes on every campaign board,
every lane ends on the bastion cell, every lane starts on the top rim, at least
one cell of every board's sky network is **not walkable ground** (otherwise the
feature would quietly degrade to "a creep with a taller sprite"), the sky lane is
never identical to the road lane, and the whole derivation is deterministic.

### Air in the campaign, not only in stage 5

| stage | air groups added |
| --- | --- |
| 1 Verdant Marches | 2 wraiths (wave 5), 5 (wave 7) |
| 2 Sunscorch Mesa | 4 wraiths (The Shieldwall) |
| 3 Frostbite Hollow | 4 wraiths (Iron Cold) |
| 4 Prism Depths | 9 wraiths (Shatterpoint) |
| 5 Ashen Caldera | unchanged (already had 3 sky waves) |

`tests/flying.test.js` no longer asserts "wraith is stage-5 only"; it asserts the
wraith appears in ≥ 4 stages **and** that its first wave is never one of the
first three (the debut is late in each stage).

## 3. The player can see the rule

* **Dock cards** print `BOTH` / `GROUND` / `AIR` under the price, colour-coded,
  and the button's `aria-label` reads "Hits ground + air creeps". On the phone
  shell the badge moves to the top-right corner (the hotkey's old slot — a touch
  player has no keyboard) so it costs no vertical space: measured card 96 × 70
  with the badge 26 × 14 at the corner, nothing clipped.
* **Inspector header** shows the same words beside the tower level, so the answer
  is visible the moment a defence is tapped.
* **Inspector stats** gained a `TARGETS` cell (`GROUND + AIR`).
* **Scout strip** (`#wave-preview`) heads the next-wave report with `AIR` and
  marks each flyer chip in sky-blue with a leading ▲, so a ground-only dock is
  warned during prep instead of during the leak.

## 4. Mobile inspector: measured, then rebuilt

The complaint was that the upgrade UI on a phone needed scrolling and a new
player would not find it. Measured at 844 × 390 before this pass: sheet 203 px,
body 151 px, upgrade button at y = 409 on a 390 px screen — 224 px of scrolling
away. After this pass:

| viewport | sheet | body | upgrade row | targeting | stat rows above the fold | path cards |
| --- | --- | --- | --- | --- | --- | --- |
| 844 × 390 | 273 | 221 | y 118–162 | y 168–213 | both numeric rows + TARGETS | 108 px each, both visible |
| 667 × 375 | 263 | 211 | y 114–158 | y 164–209 | both numeric rows + TARGETS | 108 px each, both visible |
| 568 × 320 | 224 | 172 | y 97–141 | y 147–192 | both numeric rows | 108 px each, both visible |

Changes: sheet cap `58vh / 250px` → `70vh / 280px`; stats grid 3 across in ~30 px
cells instead of 4 rows of 36 px; targeting chips 34 → 30 px; a `COMBAT DETAILS`
heading before the prose cells; the category badge in the title row. The prose
(`SPECIAL PERK`, `SIGNATURE`) and SELL still scroll — they are labelled detail,
not the action — and the fade that says "there is more" only paints while the
body really overflows.

Badge text was also fixed on the way: a specialisation used to read
`SIEGE BALLISTA ★3 Siege Ballista` (name twice), and a palisade printed
`RATE NaN → NaN` in its upgrade card. Both are covered by
`tests/inspector-sheet.test.js`.

## 5. The battlefield, measured

| fact | value |
| --- | --- |
| board grammar | 26 columns × 12 rows × 64 px = **1664 × 768** world px |
| tile area | 49 152 px² vs 30 720 px² for a 20 × 12 board → **1.60 ×** |
| usable grass on level 1 | 176 tiles |
| road tiles | 38 |
| water / rock | 26 / 70 |
| ground lanes | 2–3 per board (BFS/Yen's k-shortest) |
| sky lanes | 3 per board |
| build pads | 16 per board, rows 6–9, ≥ 2 tiles apart |

Rendered at 844 × 390 the board occupies 657 × 303 CSS px (camera zoom 0.622).
It is height-bound, not width-bound: the board is 2.17:1 and the authored stage
is 5:3, so a landscape phone letterboxes. Changing the authored stage to
1664 × 768 would close that gap on phones but would letterbox a 16:9 desktop
(1366 × 768 currently fills the height exactly). That trade-off is **not made in
this pass** — it needs a decision, not a sneak edit.

## 6. What is NOT done (stated plainly)

* Specialisation branches, heroes/spells, wave scripting depth and bastion
  destruction polish were **not** rebuilt this pass. They exist in the codebase
  and keep passing their tests, but nothing in them was reworked for this
  request.
* New licensed CC0 art was **not** added. `opengameart.org`, `kenney.nl`,
  `itch.io` and `raw.githubusercontent.com` are unreachable from this sandbox;
  only GitHub's API can supply packs. Rather than substitute random images, this
  pass ships behaviour and reuses the 20 enemy sheets and 11 tower lines already
  in the repo.
* The authored-stage aspect trade-off above is open.
* Desktop was CSS-reviewed (the new title-row badge sits in a `flex-wrap` group;
  the measured desktop header is still 43 px on one row) but **not** re-tested
  end to end this pass, because the desktop menu flow could not be driven from
  the headless probe (the battle never started under `?hud=desktop`, so the HUD
  layer stayed hidden and every inspector rect measured 0).
