# Mirror Arena — 1v1 PvP

Two players, one room, one horde. Each side defends its own core on its own half
of a **rotationally symmetric arena**; both sides fight the **identical** wave
script at the same time. Nothing is sent between players except readiness, the
arena pick and each seat's result — there are no units to send, no map to
sabotage, and therefore no way for a match to be decided by latency.

The mode lives on the main menu as **DUEL · 1v1 LOBBY**.

---

## 1. Rules

| Rule | Value | Why |
| --- | --- | --- |
| Waves | 8 (boss on 4 and 8) | Long enough for a build to mature, short enough for a rematch. |
| Starting gold | 260 | One extra tower over the campaign's 220 — the arenas are longer. |
| Core HP | 25 | Same as the campaign; a knocked-out core ends the match. |
| Relics / blessings | **Off** | The arena is the equaliser: no meta progression advantage. |
| Difficulty scale | ×1.00 on both sides | Identical health, speed and rewards. |
| Stats / achievements | **Not written** | Duels cannot farm campaign progress or boost a friend's profile. |

### Winning

1. **Knockout.** The first core that reaches 0 loses immediately — even if the
   rival has already finished their waves.
2. **Forfeit.** Walking out of a live match — quit, closed tab, dropped
   socket — loses it, and the player who stayed is awarded the win.
3. **Points.** If both seats clear all 8 waves, the higher score wins.
4. **Core integrity.** Equal score → the seat with more core HP wins.
5. **Clear time.** Still tied → the faster clear wins.
6. **Draw.** Identical on all four — nobody takes the arena.

Score is the normal in-run score (kills × kill-chain multiplier, wave clears,
plus the survival bonus for HP left).

Leaving a live duel from the pause card is a **forfeit**: the seat reports a
walk-out, the room closes and the player who stayed takes the win — never a
draw (a draw would reward abandoning a match you are losing). A dropped socket
is treated the same way, so a rival is never left guarding an empty arena.

---

## 2. The arenas

All three are **26 × 16 tiles (1664 × 1024 px)** — 73 % more ground than a
campaign map — and are generated as a 180° rotation pair so that the layout you
defend *is* the layout your rival defends, entered from the other gate.

| Arena | Theme | Route length | Buildable tiles | Final boss |
| --- | --- | --- | --- | --- |
| Cinder Crown | `caldera` | 35 cells | 178 | Magma Lord — *The Caldera Regent* |
| Frostspine | `glacier` | 37 cells | 218 | Frost Warden — *The Warden of the Pass* |
| Dust Meridian | `oasis` | 43 cells | 220 | Sand Wyrm — *The Meridian Wyrm* |

Each arena ships **its own tileset** — `scripts/build_arena_tiles.py` generates
`-caldera`, `-glacier` and `-oasis` from `terrain.py`'s palettes, so a duel never
looks like a campaign map wearing a different name:

| Theme | Ground | Lane | "Water" | Landmark |
| --- | --- | --- | --- | --- |
| `caldera` | cool ash basalt, magma fissures | pale ash track | molten lava | ember-lit obsidian obelisk |
| `glacier` | bright ice sheet, crevasses | dark trodden ice | deep navy meltwater | serac cluster |
| `oasis` | bleached dune sand, wind ripples | ochre caravan road | turquoise pool | date palm |

Enemy art is *not* duplicated per arena: `EnemySkins.ENEMY_THEME_ALIAS` maps
`caldera → volcanic`, `glacier → ice`, `oasis → desert`, so the horde keeps its
elemental regrades while the ground carries the new identity.

Every arena has:

- gates at `S(7,1)` and `B(8,24)` — one tile inside the rock frame, exact
  rotational images of each other,
- a water centrepiece that neither side can build on (so the halves mirror),
- an outer rock border and enough shelf per half to place a full defence.

Symmetry is **verified, not assumed**: `tests/pvp.test.js` re-derives the 180°
rotation from the ASCII (treating `S` and `B` as the same gate symbol), checks
the route exists, counts buildable tiles per half and rejects any arena whose
halves differ by more than two tiles.

---

## 3. Architecture

```
GameScene  ←— launch payload ——  PvpLobbyUI  ←— state ——  PvpRoom
     │                              │                        │
     └─ reportSeat / reportProgress ─┘                LobbyState (reducer)
                                                              │
                                                        transport:
                                                   BroadcastChannel | WebSocket
```

| File | Responsibility |
| --- | --- |
| `src/data/pvpArenas.js` | The three layouts, `PVP_RULES`, the 8-wave script, `getPvpLevel()`. |
| `src/systems/PvpMatch.js` | Pure rules: seats, readiness, knockout / points / core / time resolution. |
| `src/net/LobbyState.js` | Host-authoritative room reducer, snapshot + adopt, lobby view. |
| `src/net/PvpRoom.js` | Glue: intents, snapshots, countdown, launch, `over`. |
| `src/net/lobbyProtocol.js` | Room codes, message envelope, name sanitising. |
| `src/net/transports.js` | Link choice (`preferredMode`), `WebSocketTransport` (relay) and `BroadcastTransport` (same browser). |
| `src/ui/PvpLobbyUI.js` | Entry → room → countdown panel. |
| `src/ui/DuelResultUI.js` | Waiting state and final scoreboard / rematch. |
| `server/pvp-relay.mjs` | A dumb relay that pairs two sockets into a room. |

### Why host-authoritative?

A duel is a **race**, not a lockstep simulation. The shared facts are tiny:
which arena, which seed, who is ready, what each seat reported. The host folds
intents into `LobbyState` and broadcasts a snapshot; the challenger adopts it
verbatim. A reconnect is one snapshot away, and there is no replay log to keep
in sync.

### Why the scene never decides the winner

`GameScene.finishDuel()` publishes only its own terminal state:

```js
{ seat, outcome: 'cleared' | 'ko', score, coreHp, waves, timeMs }
```

The room compares the two seats with `PvpMatch.resolve()`. The same function
runs on the host and in the tests, so a rule change cannot drift between the
scoring code and the UI.

---

## 4. Running a duel

### Two devices (the default)

```bash
npm run pvp:relay     # ws://0.0.0.0:8787/pvp, next to the dev/preview server
npm run dev           # or: npm run preview
```

Open the same URL on both phones. The lobby's entry screen offers two links:

| Chip | What it is | When it works |
| --- | --- | --- |
| **ONLINE** (default) | `WebSocketTransport` → `/pvp` on the page's own origin | two devices, two networks, any host that runs the relay |
| **THIS BROWSER** | `BroadcastChannel` | two tabs of one browser; it can never reach another device |

`vite.config.js` proxies `/pvp` for both `dev` and `preview`, so the client only
ever needs its own page URL. A static host (Vercel, GitHub Pages) has no relay
process — build with `VITE_PVP_RELAY=wss://relay.example/pvp` and run
`server/pvp-relay.mjs` somewhere reachable. `?pvp=local` / `?pvp=relay` forces a
link for one tab, and the choice is remembered in `localStorage['td-duel-link']`.

The room board shows what is actually happening: `ONLINE · LINKED`,
`… · WAITING FOR HOST` (the relay is holding your socket until the code exists),
`… · LINK LOST`. A join that cannot work says so instead of waiting.

```
client → hello  {roomCode, name, host}
relay  → note   {state:'waiting'}      guest arrived before the host
relay  → welcome{seat:'p1'|'p2'}       seated
relay  → bye    {reason} then close    bad-code | code-taken | full | no-room | no-host
```

The relay only forwards envelopes; all rules stay on the host.

---

## 5. Camera: seeing your rival

The mirrored arena is bigger than the canvas, so the camera was made
map-aware:

- `CameraRig` now takes **map-pixel** bounds (`cols × TILE_SIZE`), not the
  viewport, so panning reaches both gates.
- `fitZoom(bounds, viewport)` computes the per-map minimum zoom:
  - campaign (1280 × 768 on a 1280 × 768 canvas) → `1×`, unchanged;
  - arena (1664 × 1024) → `0.75×`, the whole battlefield;
  - a 640 × 360 phone → clamped to the hard floor `0.45×`.
- `ZOOM_LIMITS.min` is now a floor rather than the framing, so a campaign map
  can never show dead space outside itself.
- `reset()` recentres at the fit zoom instead of scrolling to `(0,0)`.

On top of that, the HUD gains a **rival strip** (`HUD.setRivalState`): name,
wave, points, core-HP bar and a LIVE / FINISHED / KNOCKED OUT badge, refreshed
from ~1.4 Hz progress ticks.

---

## 6. Tests

`tests/pvp.test.js` (31) — arena geometry and symmetry, route and buildable
tile counts, level contract, wave/boss validity, camera fit and pan, match
resolution for every win condition.

`tests/lobby.test.js` (24) — room codes, envelopes, name sanitising, seat
assignment, readiness, host-only start and arena pick, countdown, snapshot
round-trip, rematch, forfeit, plus **two real `PvpRoom`s talking over
`BroadcastChannel`** end to end, and the watchdog that speaks up when no host
answers.

`tests/pvp-relay.test.js` (12) — **a real relay child process and two real
WebSocket clients**: create → join → 2 seats → ready → start → countdown →
launch on both → progress → knockout verdict on both → rematch; a guest held
before the host opens; an unknown code refused; a third challenger refused; a
host that vanishes mid-duel forfeiting to the remaining seat; and a dead relay
failing in ~3 s with instructions. Plus the link-choice table as pure functions.

`tests/duel-ui.test.js` (11) and `tests/duel-link.test.js` (6) — the lobby and
result panels in jsdom: seat labels, arena picker locking, live progress,
waiting state, scoreboard, name escaping, the ONLINE/THIS BROWSER chips and the
link badge.

Run them with:

```bash
npx vitest run tests/pvp.test.js tests/lobby.test.js tests/duel-ui.test.js \
  tests/duel-link.test.js tests/pvp-relay.test.js
```
