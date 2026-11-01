# Req 49 — A leaderboard category for every mode of play

The brief: *"tapos sa leaderboard natin lagyan mo ng category for every mode of
play natin"* — every mode of play gets its own leaderboard category.

## The problem was not cosmetic

The device leaderboard was one ranked list. That is not a neutral default, it is
a wrong comparison: an Endless run that reached wave 61 scores 184 000, so it sat
above a Campaign clear forever. The Campaign board was permanently owned by a run
from a different game, and no Campaign player could ever take it back.

The fix is a board per mode, and a ranking per board.

## The roster

Twelve boards. Eleven are playable modes, plus the unfiled bucket for runs that
predate this change.

| Board | Filled by | Key |
|---|---|---|
| `campaign` | any story level (`level-1` … `level-5`) | CAMPAIGN |
| `endless` | the Endless Siege level | ENDLESS |
| `titan` | Titan Rush | TITAN RUSH |
| `timeattack` | Time Attack | TIME ATTACK |
| `rogue` | Rogue Siege | ROGUE |
| `anomaly` | Anomaly Waves | ANOMALY |
| `ascension` | Ascension | ASCENSION |
| `contracts` | Contract Board | CONTRACTS |
| `duel` | a PvP arena | DUEL |
| `coop` | a co-op room | CO-OP |
| `puzzle` | a Blueprint puzzle | BLUEPRINT |
| `unknown` | runs recorded before this existed | (hidden while empty) |

`ALL RUNS` is a **view**, not a stored board: it is the overview key, and a
record is never filed under it.

The roster is *derived*, not invented. `src/data/leaderboardCategories.js` reads
the modes the game actually ships — `modeData.js` (the War Room catalogue),
`levelData.js`, `pvpArenas.js`, `puzzles.js` — and `resolveCategory()` maps a
finished run onto a board from the run's own fields. The unit suite asserts that
every `MODES` entry resolves to a board that exists, so adding a mode without a
board fails the build instead of silently filing its runs as unfiled.

## How a run is filed

`resolveCategory({ mode, level, pvp, coop })`, in order:

1. an explicit `mode` label wins (`runModeLabel()` hands back `time-attack`,
   `contracts`, `puzzle`, …);
2. `coop` / `pvp` flags;
3. the level's own shape: `level.puzzle` → puzzle, `level.pvp` → duel, then
   `level.mode`, then `id === 'titan-rush'` → titan, then `level.endless` →
   endless, and any other level with an id is a campaign map.

A run it cannot place is `unknown`, **never** `campaign`: guessing would put an
old Endless score on the campaign board and own it forever.

Every spelling of a mode lands on one board — `time-attack`, `TIME ATTACK` and
`timeattack` are all `timeattack` — so a run is never filed somewhere nobody can
open.

## What the hall shows

* A **strip of keys**, one per board, each with the number of runs on it. Empty
  boards keep their key (the point is to show every mode the game plays),
  drawn quieter; clicking one explains what fills it rather than printing an
  empty table.
* The table is **filtered to that board before it is sorted**, so the merge-sort
  telemetry, the rank numbers and the "of N" all describe that board alone.
* On `ALL RUNS` every row prints the board it belongs to under the commander's
  name — the board is the one thing a row on the overview cannot imply.
* A finished run **opens the hall on its own board** with that row lit, and the
  summary says `FILED UNDER <board>` before the player presses RECORD.

### Three real bugs this exposed

1. **With a ledger configured, the hall opened on the REALM tab** — which has no
   run summary and no RECORD key. A player who just finished a run saw no way to
   record it. `show(result)` now opens on THIS DEVICE whenever a run is waiting.
2. **`X / 6` was printed on every mode.** The old summary hard-coded six waves,
   so an Endless defeat at wave 31 read `31 / 6`. The total is now printed only
   when the mode has one (`5 / 5` for a titan run, plain `31` for Endless).
3. **A fade that dimmed what it was meant to protect.** The "the list continues"
   gradient was drawn over the whole device block, which dimmed the merge-sort
   telemetry line into an unreadable smudge — and on a short window the frame
   never overflows at all, so the mask was on the wrong element entirely. The
   affordance now belongs to whatever actually scrolls, measured after paint, and
   disappears at the end of the list.

## Layout

Twelve keys do not fit a landscape phone, so the strip is a **single horizontal
scroll row**, never a wrapping grid: a wrapped grid would eat the table's height.
A right-edge fade appears only when the row really overflows, so a key sliced in
half reads as "there is more", not as a clipped control. On `max-height: 620px`
the keys shrink first (7 px, tighter padding) and the board note is dropped, so
the table keeps its rows.

The summary's title and board line share one row, and the three stats are capped
at 480 px wide — left at full width the middle stat floated alone over the RECORD
key.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` | **124 files, 1 559 tests passed** |
| `npm run build` | ✓ 7.0 s |
| `tests/leaderboard-modes.test.js` | **27** new tests: roster, filing, filtering, persist, strip, layout |
| Browser, desktop 1366×768 | `docs/req49/all-runs.png`, `rogue-board.png` |
| Browser, short landscape 900×430 | `docs/req49/short-landscape.png` — no overflow, strip fades, rows intact |
| Browser, 820×360 (shorter than the hall needs) | `docs/req49/phone-360.png` — scrolls, fades at the edge, no dimming once at the end |
| Browser, real run end to end | launched `time-attack`, broke the base, pressed RECORD: `docs/req49/run-filed.png` — board went to `timeattack`, count 1, row lit |
| Console during every capture | `errors: []` |

Not claimed: a two-device duel or co-op run recorded to a board (the boards
exist and are unit-tested, but no live room was played this pass), and the
Supabase realm ranking stays career-level by design — it has no per-run rows to
split.

## Files

| File | What changed |
|---|---|
| `src/data/leaderboardCategories.js` | **new** — the roster, aliases, `resolveCategory`, `normalizeCategory` |
| `src/systems/Leaderboard.js` | `mode` on records, `getRanked(category)`, `getTop(limit, category)`, `getCounts()`, per-board rank on save |
| `src/ui/LeaderboardUI.js` | category strip, filtered table, per-board empty state, board tag on rows, `FILED UNDER`, opens on the run's board |
| `src/main.js` | forwards `mode` / `level` / `pvp` / `coop` / `totalWaves` from the result screen |
| `src/scenes/GameScene.js` | the fallback result card forwards the same fields |
| `src/style.css` | `.lb-modes`, `.lb-mode`, `.lb-run-mode`, `.lb-result-head`, conditional scroll fades |
| `tests/leaderboard-modes.test.js` | **new** — 27 tests |
