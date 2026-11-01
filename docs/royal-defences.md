# The Ten Royal Defences

Request 43 adds ten base defences to the Forge. This document is the reference
for what each one does, the numbers behind it, the rules the shared combat
system enforces, and how the art is produced and inspected.

Everything below is wired into the live battle loop — the dock, the economy, the
placement validator, target acquisition, projectiles, damage and the inspector
all read the same data in `src/data/royalDefences.js`.

---

## 1. The roster

| Line | Type key | Cost | Role | Range ceiling | Weakness |
|---|---|---|---|---|---|
| Royal Siege Artillery | `royalArtillery` | 260 | Boss/elite single-target burst | **840** | Slow reload, minimum range, no splash |
| Siege Ballista | `siegeBallista` | 150 | Armour-piercing single target | 340 | Short reach, single target only |
| Arcane Sniper Tower | `arcaneSniper` | 210 | Long-range magic sniping | 430 | Tiny DPS against groups |
| Mortar Tower | `mortar` | 200 | Ground area denial | 430 | Ground only, minimum range, poor single target |
| Frost Tower | `rimeTower` | 130 | Slow field | 230 | Lowest damage of the ten |
| Tesla Tower | `tesla` | 190 | Chained crowd damage | 235 | Short reach, falloff per hop |
| Skybreaker Tower | `skybreaker` | 170 | Dedicated anti-air | 360 | Air only (no ground branch by default) |
| Engineer Workshop | `workshop` | 160 | Support: fire-rate/range aura, repairs | aura 200–300 | Deals no damage at all |
| Warding Obelisk | `obelisk` | 180 | Armour/resistance debuff field | aura 190–270 | No direct damage |
| Spike Trap | `spikeTrap` | 70 | Road hazard with a cooldown | trigger 48–60 | Ground only, one trigger per re-arm |

Ten new lines that branch at level 3, exactly like the eleven older ones: two
shared tiers (`lvl1`, `lvl2`), then a choice between the line's own machine
(branch A) and a second, different machine (branch B), each with its own
art, its own shot and its own level 4 and 5. Request 45 added the branches;
§2b carries the branch-B numbers and §6 the upgrade flow.

### Note on names

Three of these names collided with an existing ascension title, and two lines
would have shipped with the same name on two different towers. The ascension
titles were renamed (the tower identity is unchanged, only the label text):

* Archer `spec-b` L3 `Sniper Tower` → **Marksman Tower**
* Archer `spec-b` L4 `Ballista Marksman` → **Longshot Marksman**
* Archer `spec-b` L5 `Siege Ballista` → **Great Arbalest**
* Forge `spec-b` L5 `Skybreaker` → **Thunderforge**

The enemy creature `skybreaker` is unrelated to the tower and kept its name.

---

## 2. Stats — branch A (the line's own machine)

Base damage, range and interval per tier. DPS is `damage ÷ interval` before
armour, buffs or debuffs; the game computes real damage through
`CombatCalculator`, never from this table. Levels 1–2 are shared by both
branches; levels 3–5 below are branch A. Branch B is in §2b.

### Royal Siege Artillery — `royalArtillery` (260g)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Pen |
|---|---|---|---|---|---|---|---|
| 1 | Field Bombard | 260 | 620 | 4.20 s | 62 | — | 25 % |
| 2 | Banded Siege Gun | 360 | 700 | 4.00 s | 90 | 140 g | 30 % |
| 3 | Bastion Culverin | 480 | 800 | 3.80 s | 126 | 190 g | 40 % |
| 4 | Counterweight Bombard | 640 | 820 | 3.60 s | 178 | 240 g | 50 % |
| 5 | Royal Siege Battery | 900 | 840 | 3.40 s | 265 | 290 g | 60 % |

Reach is deliberately enormous on this line and **never shrinks** on the way up:
620 → 700 → 800 → 820 → 840 px, against a 2 048 px wide board. `battery`
(counterweight shells) gives up some of that reach for rate: 720 → 740 → 760 px.
There is **no dead zone**. Reach is the only gate: a creep inside the ring is
shootable however close it stands. An earlier pass gave the line a minimum range
(90–140 px, "a siege gun cannot depress onto its own emplacement"), which looked
harmless on paper and was not: a tower stands on a tile and a creep on the road
beside it is one tile away — **64 px** — so the floor was wider than the nearest
legal walk-by and the piece was silent for every creep that passed it. Req 50
removed it.

Ground **and** air, both filtered by the panel.
Titan bonus per tier: +26 % / +30 % / +34 % at levels 3 / 4 / 5.

### Siege Ballista — `siegeBallista` (150g)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Pen | Boss bonus |
|---|---|---|---|---|---|---|---|---|
| 1 | Field Ballista | 70 | 270 | 1.45 s | 48 | — | 55 % | +15 % |
| 2 | Windlass Ballista | 100 | 290 | 1.38 s | 72 | 90 g | 62 % | +20 % |
| 3 | Steel-Proof Arbalest | 140 | 300 | 1.30 s | 108 | 140 g | 70 % | +26 % |
| 4 | Torsion Siege Bow | 225 | 320 | 1.18 s | 191 | 200 g | 78 % | +33 % |
| 5 | Colossus Ballista | 250 | 340 | 1.05 s | 238 | 280 g | 85 % | +40 % |

Armour penetration is applied by `calculateEffectiveArmor`, so 85 % penetration
against a 40-armour guard leaves 6 armour, not "ignore armour".

### Arcane Sniper Tower — `arcaneSniper` (210g)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Pen |
|---|---|---|---|---|---|---|---|
| 1 | Rune Focus | 105 | 340 | 2.00 s | 53 | — | 30 % |
| 2 | Clawed Focus | 150 | 360 | 1.90 s | 79 | 120 g | 35 % |
| 3 | Trine Prism | 210 | 385 | 1.80 s | 117 | 180 g | 45 % |
| 4 | Astral Lattice | 290 | 410 | 1.65 s | 176 | 250 g | 52 % |
| 5 | Arcane Longshot Spire | 400 | 430 | 1.50 s | 267 | 340 g | 60 % |

Magic damage, so resistances (not armour) are the mitigation that matters.

### Mortar Tower — `mortar` (200g)

| L | Name | DMG | Range | Interval | DPS | Splash | Upgrade |
|---|---|---|---|---|---|---|---|
| 1 | Iron Bed Mortar | 55 | 340 | 2.60 s | 21 | 95 px | — |
| 2 | Banded Bombard | 75 | 360 | 2.50 s | 30 | 105 px | 110 g |
| 3 | Stone Emplacement | 100 | 390 | 2.35 s | 43 | 115 px | 160 g |
| 4 | Twin-Vent Mortar | 135 | 410 | 2.15 s | 63 | 130 px | 240 g |
| 5 | Royal Siege Mortar | 180 | 430 | 1.95 s | 92 | 150 px | 330 g |

Ground only, minimum range 90 → 100 px, and the blast is resolved at the
**coordinates the shell was aimed at**, not at the tower.

### Frost Tower — `rimeTower` (130g)

| L | Name | DMG | Range | Interval | DPS | Slow | Duration | Splash | Upgrade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Rime Shard | 24 | 180 | 0.90 s | 27 | 30 % | 1.0 s | — | — |
| 2 | Glacier Cluster | 32 | 195 | 0.87 s | 37 | 35 % | 1.2 s | — | 80 g |
| 3 | Frost Spine | 42 | 208 | 0.84 s | 50 | 40 % | 1.5 s | 62 px | 120 g |
| 4 | Winter Core | 54 | 220 | 0.80 s | 68 | 45 % | 1.8 s | 72 px | 170 g |
| 5 | Hoarfrost Crown | 70 | 230 | 0.76 s | 92 | 50 % | 2.2 s | 80 px | 220 g |

### Tesla Tower — `tesla` (190g)

| L | Name | DMG | Range | Interval | DPS | Hits | Chain reach | Falloff | Upgrade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Copper Coil | 42 | 175 | 1.40 s | 30 | 2 | 95 px | 60 % | — |
| 2 | Insulated Spire | 58 | 190 | 1.32 s | 44 | 2 | 105 px | 64 % | 90 g |
| 3 | Arc Lattice | 78 | 205 | 1.25 s | 62 | 3 | 112 px | 68 % | 140 g |
| 4 | Storm Cage | 100 | 220 | 1.15 s | 87 | 4 | 122 px | 72 % | 200 g |
| 5 | Thunderhead | 130 | 235 | 1.05 s | 124 | 5 | 130 px | 75 % | 280 g |

### Skybreaker Tower — `skybreaker` (170g)

| L | Name | DMG | Range | Interval | DPS | Boss bonus | Upgrade |
|---|---|---|---|---|---|---|---|
| 1 | Tracker Mount | 60 | 300 | 1.20 s | 50 | +25 % | — |
| 2 | Twin Harpoon Mount | 85 | 315 | 1.15 s | 74 | +25 % | 100 g |
| 3 | Quad Tracker | 115 | 330 | 1.08 s | 106 | +30 % | 150 g |
| 4 | Radar Battery | 155 | 345 | 1.00 s | 155 | +35 % | 220 g |
| 5 | Sky Citadel | 205 | 360 | 0.92 s | 223 | +40 % | 310 g |

Air only by data (`targetsGround: false`), which the shared target filter
enforces for direct hits, splash and chain alike.

### Engineer Workshop — `workshop` (160g)

| L | Name | Aura radius | Fire rate | Range | Repair | Upgrade |
|---|---|---|---|---|---|---|
| 1 | Tool Shed | 200 px | +10 % | +8 % | — | — |
| 2 | Machinist Bench | 220 px | +14 % | +10 % | — | 120 g |
| 3 | Repair Yard | 240 px | +18 % | +12 % | 20 HP/s @ 200 px | 180 g |
| 4 | Siege Workshop | 260 px | +22 % | +15 % | 36 HP/s @ 240 px | 250 g |
| 5 | Royal Foundry | 300 px | +28 % | +18 % | 52 HP/s @ 280 px | 340 g |

### Warding Obelisk — `obelisk` (180g)

| L | Name | Radius | Armour break | Resistance break | Upgrade |
|---|---|---|---|---|---|
| 1 | Carved Ward | 190 px | −8 | −10 % | — |
| 2 | Rune Circle | 210 px | −12 | −14 % | 130 g |
| 3 | Glyph Stele | 230 px | −16 | −18 % | 190 g |
| 4 | Sigil Monolith | 250 px | −20 | −24 % | 260 g |
| 5 | Warding Colossus | 270 px | −26 | −30 % | 350 g |

### Spike Trap — `spikeTrap` (70g)

| L | Name | Trigger damage | Trigger radius | Re-arm | Sustained DPS | Upgrade |
|---|---|---|---|---|---|---|
| 1 | Spike Plate | 110 | 48 px | 6.0 s | 18 | — |
| 2 | Serrated Plate | 160 | 50 px | 5.6 s | 29 | 100 g |
| 3 | Spring Harrow | 220 | 52 px | 5.2 s | 42 | 160 g |
| 4 | Iron Maw | 300 | 56 px | 4.6 s | 65 | 240 g |
| 5 | Royal Caltrop Field | 420 | 60 px | 4.0 s | 105 | 330 g |

---

## 2b. Stats — branch B (the second machine)

Every royal line offers a second machine at level 3. It is a *trade*, not a
bigger version of branch A: the siege gun gives up shell weight for a two-shell
salvo, the ballista gives up penetration for rate, the mortar gives up blast
width for a fanned pair, the workshop splits its aura and its repair crew, the
obelisk splits armour-off from resistance-off, and the trap turns a single maw
into a spike field. Each one has its own building, its own weapon sheet, its own
shot art and its own hit effect (`proj-royal-<line>-b*`,
`fx-line-<line>-b-*`), so a player can tell the two branches apart on the board.

`DMG` is per shot; `DPS` counts the volley, so a "pair" tier fires twice.

### Royal Siege Artillery → Twin-Bore Battery — branch B (`battery`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Twin-Bore Battery | 210 | 720 | 2.90 s | 145 | 180 g | min range 130 px |
| 4 | Salvo Culverin | 265 | 740 | 2.70 s | 196 | 230 g | min range 135 px |
| 5 | Royal Salvo Battery | 380 | 760 | 2.50 s | 304 | 280 g | min range 140 px |

### Siege Ballista → Repeater Ballista — branch B (`repeater`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Repeater Ballista | 95 | 290 | 0.70 s | 136 | 130 g | — |
| 4 | Windlass Repeater | 110 | 300 | 0.90 s | 244 | 190 g | — |
| 5 | Hailstorm Ballista | 120 | 310 | 0.80 s | 300 | 270 g | — |

### Arcane Sniper Tower → Hex Weaver — branch B (`hexweaver`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Hex Weaver | 120 | 365 | 1.60 s | 75 | 170 g | splash 60 px; slow 18 % for 900 ms |
| 4 | Curse Lattice | 155 | 375 | 1.50 s | 103 | 240 g | splash 70 px; slow 22 % for 1000 ms |
| 5 | Hex Spire | 200 | 385 | 1.40 s | 143 | 330 g | splash 85 px; slow 26 % for 1100 ms |

### Mortar Tower → Cluster Battery — branch B (`cluster`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Cluster Battery | 52 | 360 | 1.90 s | 55 | 150 g | splash 55 px; min range 95 px; ground only |
| 4 | Fanned Mortar | 62 | 370 | 1.80 s | 69 | 230 g | splash 65 px; min range 96 px; ground only |
| 5 | Royal Cluster Battery | 96 | 380 | 1.70 s | 113 | 320 g | splash 78 px; min range 98 px; ground only |

### Frost Tower → Frost Tempest — branch B (`tempest`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Frost Tempest | 34 | 200 | 0.70 s | 49 | 110 g | splash 90 px |
| 4 | Rime Gale | 44 | 212 | 0.66 s | 67 | 160 g | splash 105 px |
| 5 | Winter Tempest | 56 | 224 | 0.62 s | 90 | 210 g | splash 120 px |

### Tesla Tower → Arc Cannon — branch B (`arccannon`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Arc Cannon | 120 | 220 | 1.30 s | 92 | 130 g | chains 1 (falloff 55 %) |
| 4 | Thunder Lance | 155 | 230 | 1.20 s | 129 | 190 g | chains 1 (falloff 60 %) |
| 5 | Storm Cannon | 200 | 240 | 1.10 s | 182 | 270 g | chains 2 (falloff 65 %) |

### Skybreaker Tower → Flak Battery — branch B (`flak`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Flak Battery | 40 | 315 | 0.76 s | 105 | 140 g | splash 55 px; +15 % vs titans |
| 4 | Burst Battery | 50 | 325 | 0.70 s | 143 | 210 g | splash 65 px; +18 % vs titans |
| 5 | Royal Flak Battery | 55 | 335 | 0.64 s | 172 | 300 g | splash 78 px; +20 % vs titans |

### Engineer Workshop → Field Engineer — branch B (`engineer`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Field Engineer | — | — | — | — | 170 g | aura 270 px (+24 % rate, +16 % range); repairs 12 HP/s within 190 px |
| 4 | Engineer Company | — | — | — | — | 240 g | aura 300 px (+30 % rate, +20 % range); repairs 18 HP/s within 210 px |
| 5 | Royal Engineer Corps | — | — | — | — | 330 g | aura 330 px (+36 % rate, +24 % range); repairs 26 HP/s within 230 px |

### Warding Obelisk → Null Obelisk — branch B (`nullify`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Null Obelisk | — | — | — | — | 180 g | ward 200 px (−10 armour, −30 % resist) |
| 4 | Void Monolith | — | — | — | — | 250 g | ward 215 px (−12 armour, −40 % resist) |
| 5 | Null Colossus | — | — | — | — | 340 g | ward 235 px (−15 armour, −50 % resist) |

### Spike Trap → Caltrop Field — branch B (`caltrop`)

| L | Name | DMG | Range | Interval | DPS | Upgrade | Also |
|---|---|---|---|---|---|---|---|
| 3 | Caltrop Field | 110 | 0 | 3.00 s | 37 | 150 g | ground only; field 78 px |
| 4 | Spike Field | 150 | 0 | 2.70 s | 56 | 230 g | ground only; field 86 px |
| 5 | Royal Spike Field | 210 | 0 | 2.40 s | 88 | 320 g | ground only; field 96 px |


--- 

## 3. Balance reasoning

The ten lines are not a straight upgrade over the eleven existing ones — they
trade raw efficiency for a job.

* **DPS per gold.** Archer L1 is 26 DPS for 60 g (0.43 DPS/g). The royal
  shooters sit at 0.12–0.32 DPS/g, and are deliberately worse per gold in a
  straight fight. What they buy is reach (artillery 520 px vs archer 155 px),
  penetration (ballista 55–85 % vs archer 0 %), magic (sniper), or area
  (mortar, tesla, frost).
* **Burst versus sustained.** Artillery is 62 DPS at L1 but 260 damage in one
  hit; against a 40-armour elite that alpha strike is what breaks a shield
  phase. Its 4.2 s reload means it wastes most of a swarm wave, which is the
  point of the weakness.
* **Support is not scored on DPS.** The workshop deals zero damage by design.
  Its value is multiplicative: a 28 % fire-rate aura on a Tesla or an Arcane
  Sniper is worth more than a second cheap tower in that slot, but only if the
  player is willing to spend a build slot and 160 g on something that cannot
  defend itself.
* **Debuff is bounded.** The obelisk reduces armour by up to 26 and resistance
  by up to 30 points. Applying it to a guard with 35 % physical resistance
  leaves 5 %, which is a 1.46× multiplier on that guard. It cannot stack with a
  second obelisk: the highest break wins, and it expires 1.4 s after the creep
  leaves the field, so a creep cannot be permanently stripped.
* **No single defence replaces the roster.** Skybreaker cannot touch ground;
  mortar cannot touch air; the trap cannot touch air and fires once per 4–6 s;
  the artillery cannot hit anything standing on its own emplacement. The tests
  in `tests/royal-defences.test.js` pin those limits.
* **A branch is a trade, not an upgrade.** Request 45 gave every royal line a
  second machine at level 3, and the two were measured against each other rather
  than against the line's own history: each branch declares a niche in
  `tests/helpers/balance.js` and has to beat its sibling on that column by 8 % at
  levels 3, 4 and 5. The salvo battery out-shoots the bombard against a single
  unarmoured body while the bombard keeps the titan bonus and the bigger shell;
  the cluster battery wins the single-target column while the great mortar keeps
  the wider blast; the arc cannon drops chain targets for a heavier bolt; the
  field engineer keeps the wider aura and hands the repair crew to the repair
  yard. Neither branch is ever the cheaper *and* better one — that is asserted,
  not assumed.
* **Support branches are scored on the field they hand out.** A workshop deals
  no damage, so dividing its DPS by its gold is a division by zero. `supportPower`
  in `tests/helpers/balance.js` prices an aura at the fire rate and range it
  grants a reference turret, a repair crew at the health it restores, a ward at
  the effective damage its armour/resistance break unlocks across the roster, and
  a coin aura at the extra gold per kill — all scaled by the area the field
  covers. That number is what the power-per-gold band and the "is the upgrade
  worth it?" test read for the four support branches.

---

## 4. Targeting

### Priorities

`src/entities/TowerTargeting.js` owns the sort. Every line with a `targeting`
block in its data gets a panel in the inspector; the six priorities are:

| Mode | Meaning |
|---|---|
| `boss` | Boss/elite first, then distance |
| `strongest` | Highest max HP first |
| `weakest` | Lowest current HP first |
| `nearest` | Closest to the tower |
| `fastest` | Highest move speed first |
| `first` | Furthest along the path |

### The category filter always wins

`Tower.canEngage()` applies the defence's own ceiling (`targetsGround` /
`targetsAir` from data) **and then** the instance filter the player picks
(`both` / `ground` / `air`). A priority can never pull in an illegal target: an
air-only skybreaker set to "Strongest" still ignores the strongest ground creep
in the world.

### In-flight shots keep the filter they were fired under

When a tower fires, the shot copies the live `engagedTargets` snapshot and the
aimed coordinates. Two consequences:

1. A mortar shell that lands after the player switches the tower to `GROUND`
   still damages what it was fired at — it does not re-check the panel mid-air,
   and it cannot gain air targets it never aimed at.
2. Area and chain damage obey the same snapshot, so a ground-only splash never
   clips a flyer that happened to be over the blast.

Target selection itself is re-validated every frame; a dead, removed or
out-of-range target is dropped and the tower re-acquires (no stale reference can
freeze a turret).

---

## 5. Mechanics, exactly

**Mortar.** The shell is aimed at the creep's position at release. Travel time
comes from `projectileSpeed`; on impact, damage is resolved inside
`groundTarget` with a real radius. Because the datum is the road, only ground
creeps can be hit even when a flyer is directly overhead.

**Tesla.** `chainTargets` counts the **total** hits including the initial one
(L1 = 2). Each hop must be within `chainRange` of the previous victim and is
multiplied by `chainFalloff` (0.60 → 0.75). A creep can be hit at most once per
discharge, so a chain can never loop and cannot double-damage a single target.

**Frost.** The slow is written through the real status field on the enemy
(`slowFactor` / `slowUntil`). A new hit **refreshes** the duration and the
stronger slow wins; it never stacks into a permanent freeze, and a boss immune
to slow stays immune because immunity is checked before the write.

**Warding Obelisk.** Every 250 ms the field writes a ward onto each enemy in
radius: `armorBreak` points, `resistanceBreak` fraction, 1.4 s duration. Wards
do not stack — the strongest break is kept and refreshed. The break is applied
inside `Enemy.applyDamage`, before resistances, which is why it changes real
mitigation rather than a display number.

**Engineer Workshop.** The aura is recomputed on every build, upgrade, sell and
destruction (`refreshTowerAuras`), so bonuses always match what is on the board;
buffs do not accumulate when two workshops overlap — the strongest aura wins.
Repairs (L3+) heal the single most-damaged **non-destroyed** structure in range
at `perSecond`, halved while that structure is under attack
(`REPAIR_UNDER_FIRE = 0.5`). A destroyed building is never resurrected.

A repair is *visible work*, driven by the heal that actually landed and not by a
timer: the crew's hammer clip plays (`playWorkAnimation`) and a short additive
arc runs from the workshop to the building it patched (`playRepairBeam`), fading
in 240 ms. Beams are capped at eight live objects, so a row of workshops cannot
flood the scene. `wasRepairing` stays true for two ticks after the last heal so
the indicator does not flicker between 500 ms beats.

**Spike Trap.** Ground enemies only. Fires when an eligible creep is inside the
trigger radius and the trap is off cooldown; the pulse damages each enemy once
(no per-frame re-trigger), then the trap plays its trigger clip and re-arms
after `trapCooldown`. Flyers passing over take nothing.

---

## 6. Progression and the upgrade flow

* Levels 1 and 2 are shared (`levels: [L1, L2]`). At level 3 the tower *chooses*:
  `nextUpgrades` returns both branches, each with its own `specKey`, `branch`,
  price and description, and the HUD draws them as two cards.
* `Tower.get stats` then reads `specializations[specKey]` and, at levels 4 and 5,
  merges the tier from `ASCENSION[line][specKey]` on top of it — the same
  `elite`/`apex` ladder the eleven older lines use. A tower that somehow carries
  a level with no branch falls back to the last shared tier rather than
  returning `undefined` into the damage path.
* `canUpgrade()` asks the economy. The click is guarded by `upgradeLock`
  (260 ms), and the cost is deducted exactly once, only on success.
* Health is carried across tiers as a ratio, so an upgraded tower does not heal
  itself.
* Each tier of each branch has its own base art and weapon sheet, and
  `visualSlot` maps them to `lvl1`, `lvl2`, then `spec-a` / `spec-a2` / `spec-a3`
  or `spec-b` / `spec-b2` / `spec-b3`. `Tower.artLine` returns
  `<line>-b` for branch B, which is what selects the branch-B impact, muzzle,
  trail, shot and wreck. `Tower.projectileArt` asks
  `royalProjectileArt(line, level, branch)`.

---

## 7. Art

### Pipeline

| Step | Command | Output |
|---|---|---|
| 1. Draw | `python3 scripts/build_royal_defences.py` | 80 bases, 80 weapon strips (8 slots × 10 lines), 10 dock cards, 28 shots (4 × 7 shooting lines), 20 impact strips, 20 muzzle flashes, 14 trails, 20 wrecks — 214 images plus `src/data/royalTowerArt.js`, `src/data/royalFx.js`, `src/data/royalProjectiles.js` |
| 2. Inspect | `python3 scripts/check_royal_art.py` | exit 1 on any failed sheet |

Both scripts need Pillow (`python3 -m venv .venv && .venv/bin/pip install pillow`).
Nothing is downloaded: every pixel is original work generated in this
repository, which is why the licence section of the manifest lists it as
project art rather than a third-party pack.

### Conventions

* Base image: RGBA, ink flush with the bottom edge (ground line), origin
  `(0.5, 1)` on the tile's bottom edge. The footprint is clamped to 80 px wide
  and 142 px tall (`MAX_BASE_W` / `MAX_BASE_H`) — the older Spire keeps are
  70 × 129 px, so a royal bastion reads as larger without painting over its
  neighbour's tile. The clamp scales about the ground line and scales `mount`
  with it, so the muzzle geometry stays correct.
* Weapon sheet: `6 × 128 px` frames — rest, prepare, charged, release, recoil,
  settle — pivot at `(64, 104)`, muzzle distance measured by the generator and
  written into `royalTowerArt.js`.
* `-fire` clips play frames `0 … n-2` at 16 fps; frame 0 is the resting pose.
* Non-rotating lines (Frost, Workshop, Obelisk, Spike Trap) carry their action in
  the animation and never spin toward a target.
* Eight slots per line: `lvl1`, `lvl2`, then `spec-a`/`spec-a2`/`spec-a3` and
  `spec-b`/`spec-b2`/`spec-b3`. Branch B is drawn as a *different machine* — its
  own frame, its own weapon geometry, its own accent — never a tint or a mirror
  of branch A.

### Trails

A shooting line ships one 48×48 streak (`fx-line-<line>-trail.png`) that
`Projectile` drops behind the shot: additive, alpha 0.55 → 0, scale 0.9 → 0.38,
life 240 ms, at most one every 40 ms and never more than 64 live at once
(`TRAIL_BUDGET`). The three field buildings (workshop, obelisk, spike trap) have
no projectile, so they ship no trail — a streak file for them would be an asset
that nothing can ever draw, and the inspector rejects it. The tabletop-only
spike trap deliberately stays off the list for the same reason its damage is
ground-only: it has nothing to fly anywhere.

### Wrecks

Every line ships its own `ruin_<line>.png` (96 × 64). When a royal building is
destroyed the scene drops that wreck on the tile (`ruin-<key>`, origin bottom
centre, 0.95 alpha, gone after 1.2 s + 0.9 s fade). It is decoration only: the
tile, the collision and the occupancy are already released before the sprite
appears, so a wreck can never block a lane or a rebuild.

The wrecks are not one image in ten tints. Five collapse styles cover the ten
lines — a jagged masonry stump (the five gun lines, each with its own thrown
part: artillery barrel, snapped ballista limb and string, cracked sight ring,
scorched mortar tube, bent tracker ring), a shattered crystal cradle (Frost,
Tesla), a burnt timber heap with the workshop's gear thrown clear, a snapped rune
stele (Obelisk), and a torn spike plate with bent spikes (Spike Trap). The
line's accent colour survives in the rubble, so the loss is identifiable at a
glance.

### What the inspector checks (`check_royal_art.py`)

* every file exists and is RGBA with real transparency;
* bases reach the ground edge (a floating base renders in mid-air);
* weapon sheets are exactly six frames wide and no frame is empty;
* the release frame differs from the rest pose (>0.5 % of the canvas) — a
  static explosion pasted over an idle frame fails;
* every tier changes the **silhouette** by at least 6 % of the canvas versus
  the tier below it — a recolour fails;
* branch B differs from branch A on the base, the wreck, the impact, the muzzle,
  the trail and the shot by at least 4 % of the canvas, compared bottom-centre
  aligned (`align_bottom_center`) — a mirrored or recoloured twin fails;
* impact strips are `10 × 128 px` with no blank frame, muzzles are 48×48, cards
  are 64×64;
* trails are 48×48 with a transparent margin and a visible peak alpha, and only
  the seven shooting lines ship one — a field building with a streak would be an
  unused file;
* wrecks are RGBA with real transparency and their ink reaches the ground edge,
  so a wreck never floats above the tile it fell on;
* the seven shooting lines have their own projectile with a transparent margin,
  in both branches and both tiers; the `-b` / `-b2` shots keep a transparent
  edge so the salvo reads as a shot in flight, not a decal;
* only shooting lines ship a trail, and a branch-B building trails under
  `fx-line-<line>-b-trail`.

Current status: all twenty branches pass, and both sheets sets load cleanly in
`BootScene`.

### What each tier adds

Every line grows by one real structural step, along the branch it took: timber deck → stone footing with
iron straps → stepped emplacement with a railing → bastion with buttresses and
crenellations → royal bastion with a gold band, carved emblem and corner
spires. The machinery on top changes too (a barrel gains bands, springs and a
counterweight; a ballista gains limb pairs; a tesla gains prongs; a workshop
gains a chimney, a crane and a gear train), so no tier is a tint of the one
before it.

---

## 8. Verification

| Kind | What | Where |
|---|---|---|
| Automated | Roster shape, five tiers, rising cost, art on disk, strip geometry read from the PNG headers, category precedence, minimum range, all sort modes, chain falloff and no-repeat, mortar ground coordinates, ward mitigation and expiry, repair rules, trap re-arm | `tests/royal-defences.test.js` |
| Automated | Shared target filter, ground/air rosters, ascension unaffected | `tests/target-categories.test.js`, `tests/tower-ascension.test.js` |
| Browser | Ten lines built and upgraded to L5 on the Verdant Marches battlefield; waves cleared without leaks; `projectilesFired` rising; wards, traps and slows observed on live creeps; inspector panel and dock tab exercised | Probe runs against the Vite dev server (screenshots kept outside the repo) |
| Browser | Trails in flight: peak 6 live streaks during a volley, back to 0 afterwards | Same probe, counting `scene.__trailSprites` |
| Browser | Wrecks: four lines destroyed on the board, each dropped its own `ruin-*` sprite, tile released, no page errors | Destroyed through `damageStructure` |
| Browser | Repair is visible: workshop L5 healed a gun 343 → 423 HP, hammer clip `tower-top-workshop-l5-fire` playing, one live beam, back to 0 after the fade | `:beams` counter and a screenshot |
| Browser | Branch B on a live board (Request 45): `royalArtillery` → `battery`, `tesla` → `arccannon` and `mortar` → `cluster` built through `attemptBuild`, each upgraded to L5. Slots walked `lvl1 → lvl2 → spec-b → spec-b2 → spec-b3`, art keys `tower-base-<line>-b1…b3`, shots `proj-royal-<line>-b` then `-b2`, `artLine` `<line>-b`. Shots seen in flight with `fx-line-<line>-b-trail`, hits delivered with `fx-line-<line>-b-impact`, and a destroyed salvo battery dropped `ruin-royalArtillery-b`. Zero page errors | Probe against the Vite preview build, screenshots kept outside the repo |
| Automated | Every branch of every line declares a niche and beats its sibling there at L3/4/5; no branch is dominated; support branches are scored on the field they hand out (`supportPower`), not on damage they never deal | `tests/branch-niche.test.js`, `tests/engineer-defenses.test.js` |
| Not verified | Real mobile touch input, and a full 8-wave campaign playthrough with only royal towers | Needs a device / a longer session |

The browser probes are **not** a substitute for a natural playthrough: they
place towers through the scene's own `attemptBuild` (so the economy and the
validator are real), but they step the wave clock faster than a player would.
