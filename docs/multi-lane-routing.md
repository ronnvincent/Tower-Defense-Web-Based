# Multi-lane routing (Request 5)

The horde used to walk one road. Every creep and every boss followed the same
`computeMainPath()` route, so one wall of palisades and one cluster of towers
answered every wave on every map — the map was decoration, not a decision.

Now each battlefield derives **two or three loopless routes** from its own ASCII,
the spawner **deals the wave across them in a fixed order**, and the road itself
is marked with **direction chevrons**. It applies to the campaign, to Endless and
to the three duel arenas alike.

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

Ice and crystal were rebuilt as real forks (three frozen canyons; a three-armed
vault), and The Convergence's single 54-cell snake became a trident of three
roads that part within the first few tiles of the gate. Barricades still do not
reroute anything — a palisade is a wall on *its* lane, and the creep that meets
it breaks it down; the other lanes simply never meet it.

---

## 2. Dealing the horde across the lanes

`GameScene.spawnEnemy()` picks the lane by **ordinal, never by randomness**:

```
lane = lanes[cursor % lanes.length]      // cursor resets at the start of a wave
```

The k-th spawn of wave *w* therefore walks lane *k % n* on every device. Both
duel seats run the same wave script in the same order, so seat A and seat B see
the same enemy on the same route — the mirror holds without a single byte of
lane data on the wire. Bosses and summoned minions go through the same spawner,
so a titan is dealt a lane like anything else.

`routeCells` is now the **union of every lane** (`laneCells`), which is what the
placement system uses: palisades may only be planted on a cell the horde can
actually walk, and that is now every lane, not just the shortest one.

---

## 3. Direction chevrons

`src/systems/LaneArrows.js` — geometry only, no Phaser types, so it is testable
against plain numbers.

* One chevron every **2 cells** of every lane, anchored on the **edge between two
  cells** rather than on a cell. That is what lets a fork tile show one arrow per
  exit instead of one muddled marker in the middle.
* The gate tile is left bare (the portal sprite sits on it), and an edge shared
  by two lanes is painted once, so converging routes do not double-stamp.
* Warm chevron `#ffe6a3` at 72 % over a dark keyline offset by 1.5 px — readable
  on grassland, glacier, dune and basalt alike.
* Drawn **once** into a single `Graphics` at depth 4: above the terrain tiles
  (3), below the portals, core platform and units (10+). Zero per-frame cost.

The BFS overlay (`drawBFSVisualization`) now traces every lane — cyan, ember and
pale green under the gold shortest path — so the classroom view shows the same
split the monsters walk.

---

## 4. What the player sees

* Monsters leave the gate in three files and only regroup at the core.
* The arrows make each route readable before the first creep arrives, so a bad
  build order is a mistake the player can *see* rather than discover.
* In a duel both boards show the same three lanes with the same arrows, because
  both boards ran the same deterministic search on the same arena.

## 5. Tests

`tests/lane-routing.test.js` (22 tests) pins: two-to-three lanes on all eight
battlefields, lanes that start at the gate and end at the core without looping,
lanes that only cross road/gate/core tiles, comparable lengths, genuinely
distinct routes, an early split, deterministic re-computation, the union
contract for build placement, the dealing rule (including the duel replay),
and every arrow property above. `tests/endless-map.test.js` was updated for the
new trident (shortest road > 30 cells, still under 75 s at creep speed).
