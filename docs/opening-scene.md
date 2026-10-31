# The Opening Scene — Havenbrook

*Request 58. The first battle a new keeper ever sees, and the one screen in the
game that cannot be clicked past.*

---

## 1. Why it exists

A player who has never seen this game was being dropped onto Verdant Marches
with a forge full of twenty-two defences and no idea that a tower goes on grass,
that gold upgrades it, or that the wave button is what starts the fight. The
opening answers exactly those three questions, in that order, and then gets out
of the way.

It is **not** a campaign stage. It pays no stars, banks no reward, files nothing
on a leaderboard and never appears on the world map. It is a story beat that
happens to be played on a real battlefield, with the real rules and the real
forge.

## 2. Who sees it, and when

```
name gate → main menu → PLAY ─┬─ needsTutorial(profile) → Havenbrook (the opening)
                              └─ otherwise               → the realm map
```

`needsTutorial()` (`src/data/tutorialScript.js`) is structural, not a version
number:

* `profile.tutorialDone` must be false, **and**
* the save must have never cleared a stage (`Object.keys(profile.stars)` empty).

The second clause is what protects every existing player: a save that predates
this feature has stars and no flag, and must not be dragged through a tutorial
after a year of play. A save with no star ledger at all is a failed load, not a
new keeper, and is treated as "not new".

The redirect lives in `startLevel()` (`src/main.js`), not on the map, so no other
entry point — a replay, a daily, a deep link — can slip past it. `PLAY` skips the
map entirely for a new keeper: the story *is* the first battle.

## 3. The script

`src/data/tutorialScript.js` is the whole scene: five villagers, their lines,
where they stand, what the village is dressed with, and the three things the
player is taught. Nothing else in the codebase knows a line of dialogue.

| Beat | Who | What happens |
|---|---|---|
| `open` | narrator | *"Havenbrook. The last village this side of the ridge."* — the cast walks in |
| `mara-1` | Mara, miller | complaints about walls |
| `doren-1` | Old Doren, elder | *"Walls come after bread."* |
| `pip-1` | Pip, child | counts the raiders; there are a lot of them |
| `bram-1` | Bram, watch | *"Smoke on the east road."* — **alarm** |
| `mara-2` | Mara | names the player `{name}` and calls them the keeper — **the village scatters** |
| `doren-2` | Old Doren | where a defence may be raised |
| `step-place` | — | **guided step**: pick a defence, tap the meadow |
| `mara-3` | Mara | *"Now feed it coin"* — the village cheers |
| `step-upgrade` | — | **guided step**: tap the tower, take it a tier up |
| `doren-3` | Old Doren | *"Call them in before they pick the hour."* |
| `step-wave` | — | **guided step**: start the wave |
| `done` | — | the script hands the board over |

After the wave is called, two more lines arrive as **toasts** rather than cards
(`TUTORIAL_HOLD_QUIPS`) — by then the player is fighting, and a modal card over a
live battlefield is how a tutorial kills a new player.

## 4. The rules it enforces

* **Nothing is skipped.** `TutorialDirector` has no `skip()`, no `stop()` and no
  give-up timeout. A line retires on its own clock or on a tap; a step retires
  only when the real game action is reported (`place`, `upgrade`, `wave`), which
  is emitted from the branch that actually spent the gold or raised the tower.
* **An early action is remembered.** A player who builds during the opening lines
  never sees "raise a defence" afterwards.
* **The board is held, not paused.** While a line is on screen the simulation is
  skipped but the tutorial clock runs (`stepSimulation` → `tickTutorial`), so the
  horde cannot walk into the middle of a sentence. The HUD dims to 18 % and takes
  no pointers for those beats only (`:root.is-tutorial.is-line`).
* **A step hands the screen back.** The letterbox retracts, the HUD comes up to
  full brightness and the forge is fully clickable — the whole point of a step is
  that the player presses the button it names.
* **The horde waits for the lesson.** `openWave()` refuses to start a wave while
  the director is still on an earlier beat, even if the player finds the button.
* **The clock starts at the hand-over.** Havenbrook has no preparation timer while
  the village is talking; `endTutorialScene({ handOver: true })` arms the same
  `WavePrep` every other battlefield uses, so wave 2 arrives on its own 12 s later.
* **A loss is a retry, not a defeat.** Losing Havenbrook shows the epilogue card
  with TRY AGAIN; it writes no stats, no stars and no board entry.

## 5. What the player earns

| Outcome | Card | Save |
|---|---|---|
| Victory | *THE VILLAGE HOLDS* — epilogue, waves held, time, **ENTER THE REALM** | `profile.tutorialDone = true` |
| Defeat | *THE VILLAGE FELL* — epilogue, **TRY AGAIN** / **MAIN MENU** | nothing; walked through again |

## 6. The board

`HAVENBROOK_LAYOUT` in `src/data/mapData.js` is the only hand-laid battlefield in
the game — every other one is generated from the arena grammar's three winding
roads. Havenbrook is a village: three streets enter from the ridge, run straight
to a corner, and meet on one high street that fronts the keep. Right angles, not
switchbacks.

* 32 × 12, the same size as every other board, rock rim on all four sides.
* Three ground portals (columns 3, 15, 28) and two sky gates cut into the side
  walls.
* One keep, on the centre column, row 10.
* A duck pond and hedgerows on the horde's half — never in the build field.
* `tests/village-map.test.js` re-derives all of it: every portal reaches the keep
  by flood fill, every road cell belongs to an authored lane, and no cottage
  stands on a legal tower square.

The palette is its own: `THEMES.village` (`-village` tile suffix) covers ground,
cobbled road, water, rock, decor, foliage and the bridge deck, and the weather is
a dusk firefly drift rather than the campaign's pollen.

## 7. The set dressing

38 props, anchored in tile units, drawn once between the tiles and the build pads
(`systems/VillageDressing.js`) with one shared contact-shadow graphics object:

* **depth 3.4** — above the ground, below the build pads (4) and the lane arrows
  (4), so a cottage can never cover a tower square or hide the road;
* **nothing in the build field** — every prop is on the horde's half or the
  bottom rim, and `tests/tutorial.test.js` pins the anchors;
* **the five villagers at depth 12** — they stand on the high street in front of
  the keep, run into the side gutters when the alarm sounds, and are never over a
  legal square.

The speaker is lit with a pool of their own accent colour while they talk; the
rest of the cast eases back to 72 %. At battle zoom a one-tile pawn needs
something more than a name plate to say who is speaking.

## 8. Where the code lives

| File | What it owns |
|---|---|
| `src/data/tutorialScript.js` | cast, anchors, props, beats, accents, `needsTutorial()` |
| `src/systems/TutorialDirector.js` | the beat machine, the line clock, the step gates |
| `src/ui/TutorialUI.js` | the DOM card: letterbox, portrait, typewriter, objective |
| `src/systems/VillageDressing.js` | prop art map, loader queue, and the painter |
| `src/scenes/GameScene.js` | `beginTutorial` … `finishTutorial` — the scene side |
| `src/systems/Progression.js` | `profile.tutorialDone`, `completeTutorial()` |
| `src/ui/ResultScreenUI.js` | the epilogue card (`showTutorial`) |
| `src/main.js` | the PLAY redirect, the `startLevel` guard, overlay cleanup |

## 9. Tests

* `tests/tutorial.test.js` — cast and sheets against the PNG headers, the script's
  shape, the director's skip-proof behaviour, line dwell, and the profile gate.
* `tests/village-map.test.js` — the board's own rules: portals, keep, lanes,
  build field, rim, and the village palette's files.
