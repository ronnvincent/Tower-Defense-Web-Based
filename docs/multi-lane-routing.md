# Multi-lane routing (Request 5 → revised in Request 6)

The horde used to walk one road. Every creep and every boss followed the same
`computeMainPath()` route, so one wall of palisades and one cluster of towers
answered every wave on every map — the map was decoration, not a decision.

Each battlefield now derives **two or three loopless routes** from its own ASCII,
**one whole wave marches one route**, the next wave takes the next one, and the
gate is marked with an **entrance hint** that names the road the coming push
will use. It applies to the campaign, to Endless and to the three duel arenas.

What changed in Request 6, and why:

| Request 5 | Request 6 | Reason |
| --- | --- | --- |
| The spawner dealt the wave *across* lanes (`k % n`) | The whole wave takes **one** lane (`(wave − 1) % n`) | Dealing inside a wave spread every creep thin: three quiet streets instead of one push you can read and answer |
| Chevrons painted along **every** lane, the entire length | Beacon + four chevrons on the **first edges after the gate** of the lane in use | The indicator is a *hint for where the monsters come out*, not a trail painted over the whole network |

---

## 1. Finding the routes — Yen's k-shortest loopless paths

`PathfindingSystem.computeLanes({ max: 3, tolerance: 0.35, minDifference: 0.2 })`

| Piece | What it does |
| --- | --- |
| `computeMainPath()` | Unchanged BFS shortest path — still the first lane, still the classroom example. |
| Yen's loop | For every cell of the last accepted lane it re-searches to the core with the prefix pinned (`blocked` nodes) and the outgoing edge of every accepted lane blocked (`blockedEdges`). |
| `edgeKey(a, b)` | Canonical `a|b` key so an edge is blocked whichever way it is walked. |
| Tolerance | A lane may be at most `1 + 0.35`× the shortest. Longer than that and nobody would ever see it. |
| **Distinctness filter** | A candidate must own at least `max(4, 20 %)` of its cells. Without it a dense grid answers with corner-cut twins — three routes that differ by one tile, which is the single-path problem wearing a costume. |
| Determinism | BFS expands neighbours in a fixed order and every sort is stable on length, so both duel seats compute byte-identical lanes. |

`BFS.js` gained one option (`blockedEdges`) and one export (`edgeKey`); the
stats, `visitOrder` and `reconstructPath` contracts are untouched.

### Result on the eight battlefields

| Battlefield | Lanes | Cells |
| --- | --- | --- |
| grassland | 3 | 22 / 26 / 28 |
| desert | 2 | 24 / 24 |
| ice | 3 | 19 / 23 / 23 |
| volcanic (The Convergence) | 3 | 33 / 33 / 39 |
| crystal | 3 | 18 / 18 / 22 |
| arena: cinder-crown | 3 | 33 / 33 / 33 |
| arena: frostspine | 3 | 35 / 35 / 41 |
| arena: dust-meridian | 3 | 41 / 41 / 51 |

Ice, crystal and The Convergence were rebuilt as real forks (three frozen
canyons; a three-armed vault; a trident of three roads that part within the first
few tiles of the gate). Barricades still do not reroute anything — a palisade is
a wall on *its* lane, and the creep that meets it breaks it down; the other lanes
simply never meet it.

Measured cost of `computeLanes()` for the whole table, 20 runs per map on
Node 22: **0.13 – 1.29 ms** (`docs/algorithm-analysis.md` §5). It happens once
per battle scene, not per frame.

---

## 2. One lane per wave

```js
laneIndexForWave(wave, laneCount) = (wave - 1) % laneCount;   // 1-based
```

* Wave 1 → lane 0, wave 2 → lane 1, wave 3 → lane 2, wave 4 → lane 0 again.
* **Every** spawn of a wave uses it — the grunts, the runners, the boss and the
  minions a boss summons. There is no per-enemy cursor any more, so a boss can
  never walk a different road from its escort.
* Ordinal, never random. Both duel seats run the same wave script, so both boards
  send wave *w* down the same lane with **no lane data on the wire at all**.
* The rotation means every lane has to be defended over a run: by wave 3 the
  player has been attacked on all three roads.
* `laneIndexForWave` lives in `PathfindingSystem.js`, takes `(wave, laneCount)`
  and is pure, so `GameScene`, the tests and any future mode share one rule.

`routeCells` is the **union of every lane** (`laneCells`), which is what the
placement system uses: palisades may only be planted on a cell the horde can
actually walk — now every lane, not just the shortest one.

---

## 3. The entrance hint

`src/systems/LaneArrows.js` — geometry only, no Phaser types, so it is testable
against plain numbers.

* `paintLaneHint(graphics, lane, tileSize)` draws:
  * a **beacon** on the gate tile — two warm rings (`strokeCircle` at 0.46 and
    0.28 tiles) over the portal, so the eye finds the mouth of the lane even in a
    crowded HUD;
  * up to **four** shadowed chevrons on the **first four edges** after the gate
    (`lane[1] → lane[2] …`), pointing the direction the horde walks.
* Nothing is drawn past the entrance. The far two-thirds of the lane stays
  clean — the road itself already reads as road.
* Warm chevron `#ffe6a3` at 80 % over a dark keyline (`#0b0f14`, 42 %, offset
  1.5 px) — readable on grassland, glacier, dune and basalt alike.
* Drawn **once** into a single `Graphics` at depth 4 (above the terrain tiles at
  3, below the portals, core platform and units at 10+), then a single tween
  breathes its alpha 1 → 0.45. No per-frame redraw.
* `laneLabel(lanes, index)` names the lane from where it leaves the shortest
  route — `CENTRE`, `UPPER`, `LOWER`, `LEFT`, `RIGHT` — and the wave toast says
  `Wave 3: … · ⚑ UPPER LANE`, so the hint is spoken as well as drawn.

`GameScene` keeps exactly one hint object and repaints it at three moments:
scene start, when a wave opens (including an early call), and — between waves —
whenever the pending wave changes (`syncLaneHint` in the paused frame branch).
During the 5 s breather the beacon already sits on the lane the *next* push will
use, which is the whole point of a hint.

---

## 4. What the player sees

* One road fills with monsters per wave, the beacon tells you which one before
  they arrive, and the next wave opens a different road.
* Monsters still regroup only at the core.
* In a duel both boards show the same lane on the same wave with the same
  beacon, because both boards ran the same deterministic search on the same
  arena and use the same wave ordinal.

## 5. Tests

`tests/lane-routing.test.js` (26 tests) pins: two-to-three lanes on all eight
battlefields, lanes that start at the gate and end at the core without looping,
lanes that only cross road/gate/core tiles, comparable lengths, genuinely
distinct routes, deterministic re-computation, the union contract for build
placement, the **one-lane-per-wave rotation** (every lane reached within ten
waves, boss included, identical replay on both seats), every entrance-hint
property above (four chevrons at most, nothing past the entrance, correct
direction, beacon on the gate, draw order), and a source-level contract that
`spawnEnemy` uses the wave lane and that `finishDuel` paints the result card
*before* reporting to the room.

`tests/duel-result-freeze.test.js` (8 tests) pins the end-of-duel ordering: a
verdict is never overwritten by the half-time card, a knockout reads as a defeat
immediately, and a room that never answers says so after 9 s instead of waiting
in silence.
