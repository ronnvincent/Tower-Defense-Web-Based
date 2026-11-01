# Req 50 — defences went silent when the enemy got close

Reported: *"hindi na umaatake yung mga defense ko kapag sobrang lapit na ng mga
kalaban, dapat kahit malapit nakakatira pa din sila."* — my defences stop
attacking once the enemies get very close.

It was not a glitch in the attack animation, and it was not a targeting mode.
It was one line of range filtering, added in Req 48, and it made a whole class
of towers blind at exactly the moment a creep reached them.

## The rule that broke it

Req 48 gave every siege line a **minimum range**, described as "a siege gun
cannot depress enough to shoot something standing on its own emplacement":

| Line | Floor before this pass |
|---|---|
| Mortar | 90 → 95 px |
| Royal Siege Artillery (branch A) | 100 → 110 px |
| Twin-Bore Battery (branch B) | 130 → 140 px |
| Same floors at L4/L5 via the ascension ladder | 115–140 px |

In `Tower.acquireTarget()`, any enemy closer than that was dropped:

```js
if (minRange > 0 && dist < minRange) continue;
```

## Why the floor could never work

The board is a 64 px grid, and a tower can only be raised on a tile. So the
closest a creep on the road can ever legally stand to a defence beside it is
**one tile: 64 px, centre to centre.**

Every floor in every line was wider than that. The rule did not describe an edge
case; it described *every walk-by in the game*. A mortar raised next to the road
fired at creeps approaching from far away, then held fire for the entire stretch
in which they were beside it and could actually reach the lane it was built to
cover.

The justification was also simply false. A shell, a bolt and a cannonball have
no depression arc in this game — they are launched at a target and fly to it. A
"dead zone" was a rule borrowed from real artillery and given to a projectile
that does not need it.

## The fix

The floor is gone, everywhere: the engine, both data files, the ascension
ladder, and the two shop descriptions that sold it ("a 130 px dead zone", "a
wider dead zone than the branch below").

Reach is now the only distance gate. A creep inside the ring is shootable at
any distance; a creep outside it is still untouchable, so nothing became
map-wide artillery. `Tower.minRange` no longer exists, and a test fails if any
tier reintroduces a `minRange` field or advertises a dead zone in its text.

## Proof

Headless, on the real `Tower` → `Projectile` → `Enemy` loop, a creep parked at a
fixed gap from each line (shots fired in 8 s):

| Line | 8 px | 30 px | 64 px | 90 px | 130 px | 200 px | reach |
|---|---|---|---|---|---|---|---|
| Mortar L1 | — | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 340 |
| Mortar L3 branch A | — | 1 ✓ | 1 ✓ | 1 ✓ | 1 ✓ | 1 ✓ | 390 |
| Royal Artillery L1 | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 1 ✓ | 1 ✓ | 620 |
| Twin-Bore Battery L3 | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 1 ✓ | 1 ✓ | 720 |

Before the fix every row in the 8–90 px band read **0**, and the twin-bore read
0 out to 130 px.

The regression test was verified against the bug: restoring the old gate makes
four of its eight cases fail, including
`royalArtillery @ 8px fired: expected 0 to be greater than 0`. With the fix in
place all eight pass, and the "still refuses anything outside its reach" case
keeps the ceiling honest.

In a real browser, on the built game (`level-1`, mortar built at row 9 col 12
with the road at row 9 col 13, `docs/req50/`):

* a creep pinned 40 px from the tower — inside the old 90 px floor — took a
  shell for **−55** and lost 85 of its 92 HP (`shell-in-flight.png`,
  `damage-at-point-blank.png`);
* the tower held the target (`currentTarget` locked) while the creep stood on
  top of it;
* console errors: none.

## What was checked and did not change

* A creep *outside* the ring is still refused on every offensive line — the
  ceiling was not touched.
* Air rules, the live GROUND/AIR panel filter, support buildings and walls are
  unaffected: the change is one distance comparison.
* 2 048 px board, all ranges as Req 48 left them (artillery 620/700/800/820/840,
  battery 720/740/760). The dead zone was removed; the reach it paid for was
  not taken back.

## Balance note

This is a real buff to the four siege lines: they now damage creeps they used
to ignore, and the towers that were already fine are untouched. On the mortar
line the difference is roughly the entire duration of a creep walking past it,
which was previously wasted reload time. It was not compensated with a nerf,
because the "dead zone" was never doing balance work — it was a rule that read
as intentional and behaved as a bug. If the siege lines feel too strong after
this, the correct lever is their reload or their reach, not re-introducing a
blind spot.

## Files

| File | Change |
|---|---|
| `src/entities/Tower.js` | dropped the `minRange` floor and the getter; reach is the only gate |
| `src/data/royalDefences.js` | removed 10 `minRange` fields, the contract line and the "130 px dead zone" claim |
| `src/data/towerAscension.js` | removed 6 `minRange` fields and the "wider dead zone" claim |
| `tests/point-blank.test.js` | **new** — 8 tests: every line fires at one tile, the whole old band, high tiers, the ceiling still holds, no field/text left |
| `tests/royal-defences.test.js` | the old "honours a minimum range" assertion now asserts the opposite, with the reason |
| `docs/royal-defences.md`, `docs/pseudocode.md`, `docs/req48/presence.md` | corrected the rule where it was written down |

Verified: `npx vitest run` → **125 files, 1 567 tests passed**; `npm run build` ✓;
real browser run with no console errors.
