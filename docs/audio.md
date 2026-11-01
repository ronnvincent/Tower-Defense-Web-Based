# Audio — the mixer, the recordings, the states

Two layers make the sound of this game, and they have different jobs.

**Recordings** — 60 Ogg files in `public/assets/audio/{music,ui,walls,towers,enemies,cues}/`,
every one of them downloaded under CC0, converted once and verified. They carry
the music, the weapons, the walls, the horde and the interface. Their provenance
is in [`docs/audio-credits.md`](audio-credits.md), file by file.

**Synthesis** — `src/rendering/musicScenes.js` plus `MusicDirector` describe each
screen as a root, a mode and a tempo and render it with oscillators, and
`AmbienceDirector` renders place beds from filtered noise. This is the fallback
layer: it covers a state that has no recording, a file that failed to load, and
the 1-in-a-thousand case where audio is broken on the device entirely.

The game is playable with either layer missing. That is the design rule the rest
of this document is about.

---

## 1. The graph

```
                 ┌─ music   ─┐
recordings ──────┤           │
                 ├─ sfx     ─┼─▶ master ─▶ destination
oscillators ─────┤           │
                 └─ ambient ─┘
```

Four buses, created once in `AudioSynth.init()`, and **one** `AudioContext` for
the game. A voice carries only its own envelope shape; the level is applied once,
on its bus.

| Bus | Who writes to it | Default |
| --- | --- | --- |
| `master` | the mute switch and the master fader | 0.8 |
| `music` | `MusicDirector` (oscillators) and `TrackDirector` (recordings) | 0.5 |
| `sfx` | `AudioSynth` effects, `AudioSamples` recordings | 0.85 |
| `ambient` | `AmbienceDirector` | 0.45 |

Mute is a master-gain ramp to 0 (`setTargetAtTime`, ~50 ms), not a boolean check
inside each effect — so it also silences music and ambience, it never clicks, and
`AudioSamples.play()` refuses new voices while it is on. Measured in Chromium:
`master.gain` 0.8 → **0.000** on mute → **0.8** restored, with new sample plays
returning `false` in between.

### The save record

`td-dsalgo:settings:v1`:

```json
{ "muted": false, "volumes": { "master": 0.8, "music": 0.5, "sfx": 0.85, "ambient": 0.45 } }
```

A save from before the mixer stored `{ muted, volume }`; `volume` is read as the
master fader, so an old profile keeps the loudness it had. Missing, null and
non-numeric entries fall back to the default — a deliberate `0` is kept, because
"off" is a real setting.

---

## 2. The gesture rule (no autoplay)

Browsers refuse to start audio before an interaction, so:

1. nothing is created at boot (`AudioSynth.ctx` stays `null`);
2. `audioDirector.arm()` installs one-shot `pointerdown` / `keydown` /
   `touchstart` listeners;
3. the first gesture calls `unlock()`, which creates and resumes the context;
4. the pending scene and location are started immediately after (`#playTheme`);
5. `AudioContext`'s `statechange` is the recovery path: a phone that suspends
   audio in the background resumes into the right scene instead of silence;
6. `AudioSamples.preload()` is called once, after that gesture — before it, the
   bytes would only be fetched with no context to decode them in.

Measured: before the first click the context does not exist; after one real click
it is `running`, the menu recording is playing, and 50 samples are decoded.

---

## 3. Music states

A state is a **game fact**, never a timer. `GameScene.updateBattleMusic()` reads
the live state and is idempotent (it returns early when the mood has not changed,
so it can be called from any event without restarting anything):

| Mood | Condition (in order) | Recording |
| --- | --- | --- |
| `menu` | the menu / level-select screen | `music_menu.ogg` |
| `prep` | no wave has started, or a cleared wave on a level that waits for the player | `music_prep.ogg` |
| `battle` | a wave is running | `music_battle.ogg` |
| `intense` | bastion at or below **35 %** of its maximum | `music_intense.ogg` |
| `boss` | a living boss is on the board | `music_boss.ogg` |
| `victory` | the run was won | `music_victory.ogg` |
| `defeat` | the run was lost | *no recording* — procedural bed + `cue.defeat` |

The order matters: a boss in the last 35 % sings the boss theme, not the danger
one; danger outranks the wave state; the result outranks everything.

`forge` and `warroom` (map panels) are aliases that borrow the preparation bed,
and `realm` borrows the menu bed, so eight locations map onto six files
(`MUSIC_TRACKS`, `MUSIC_ALIASES` in `audioLibrary.js` / `musicScenes.js`).

Switching crossfades over **1.4 s** (`MUSIC_CROSSFADE`); the outgoing voice is
faded and `stop()`ed at the end of the ramp, so tracks never stack. Asking for
the state that is already playing is a no-op — there is one music voice, and
moving between `battle` and `boss` and back never restarts the loop from zero.

**What drives a switch**, all of it real state:

| Event | Where |
| --- | --- |
| wave called (`openWave`) | after `startNextWave()` returns true — the counter has to move first, or the first wave reads as wave 0 |
| bastion damaged | `handleEnemyHitBase` |
| base healed (wave mods, blessings) | `afterWaveCleared`, `buyBlessing` |
| boss spawns / boss dies | `spawnEnemy` callback, `onBossDefeated` |
| wave cleared | the `waveComplete` handler |
| result | `showResult` |

A run that ends stops the recorded bed and hands the moment to the sting: `showResult`
sets `victory`/`defeat`, and `TrackDirector.play()` fades out the previous
recording whenever the new state has no file. Without that rule the victory theme
would keep playing under the defeat card — it did, until a probe caught it.

---

## 4. Sound effects, and the four policies that stop them cluttering

`AUDIO_LIBRARY` in `src/rendering/audioLibrary.js` is the whole map. Readings
below are the shipped values.

| Family | Bus gain | Cooldown | Contents |
| --- | --- | --- | --- |
| `ui` | 0.55 | 45 ms | click, hover, confirm, cancel, error, place, upgrade, coins, panel open/close, wave start, warning |
| `wall` | 0.60 | 55 ms | wood hit ×3 variants, stone hit ×2, metal hit, wood break, stone break, build, upgrade |
| `tower` | 0.62 | 60 ms | one recording per defence line (21) |
| `enemy` | 0.40 | 90 ms | step ×3 variants, hit, death |
| `boss` | 0.80 | 400 ms | enter, hit |
| `cue` | 0.75 | 900 ms | victory, defeat, wave clear |

1. **Cooldown** — the same key cannot retrigger inside its family window, so a
   volley from eight towers is one clean shot instead of eight stacked copies.
2. **Variants** — a wall under sustained attack cycles its three recordings. The
   cycle only ever lands on a file that is already decoded; rotating onto one
   that was still loading used to burn the turn *and* the cursor, silencing two
   hits out of three.
3. **Voice cap** — at most `MAX_VOICES` (4) of one key and `MAX_ACTIVE` (24)
   across the bank. Voices are pruned by scheduled stop time, not by waiting for
   `onended`, which never arrives on a suspended context.
4. **Lazy load** — a sample that is still in flight does not play and does not
   queue. A late gunshot is worse than a missing one. The essential set is warmed
   after the first gesture — all UI, cues, walls, enemies, bosses and towers:
   54 files, 339 KiB encoded. Music is fetched per state, the first time that
   state is asked for.

### What fires what

| Event | Sample | Notes |
| --- | --- | --- |
| every defence's shot | `TOWER_SAMPLES[typeKey]` | each line has its own recording; the bank plays it, not a shared gunshot |
| a creep is hit / dies | `enemy.hit`, `enemy.death` | |
| a creep walks | `enemy.step` | once per 54 world px, attenuated by distance to the camera; a flyer reuses it at ×1.9, quieter |
| a boss is damaged | `boss.hit` | only while it lives and only when damage actually landed |
| a boss walks on | `boss.enter` | with the entrance cinematic |
| a wall or keep takes a hit | `wall.woodHit` / `wall.stoneHit` (+ variants) | inside the branch that applied damage, so a swing that dealt nothing is silent |
| a wall or keep breaks | `wall.woodBreak` / `wall.stoneBreak` | preloaded: a destruction sounds once per structure, so a cold file means the only break is silent |
| a structure is built | `wall.build` (palisade), `ui.place` (tower) | |
| an upgrade lands | `ui.upgrade` | |
| an invalid placement / not enough gold | `ui.error` | |
| a wave is called / cleared | `ui.waveStart` / `cue.waveClear` | |
| victory / defeat | `cue.victory` / `cue.defeat` | over the result card |
| the bastion is in danger | `ui.warning` | with the bastion flash |

No effect is scheduled on a per-frame path. Every hook sits inside the handler
that applied a real change: damage that resolved, a structure that was destroyed,
a tower that fired a real projectile, a result that was reached.

---

## 5. Ambience

A bed is a **place**, not a screen: opening the Forge panel on the map swaps the
open-country wind for fire and hammering while the realm's music keeps playing.
Entering and leaving a place crossfades over 1 s. Beds are procedural (six
layers of filtered noise, crackles and chirps); no ambience recordings shipped,
because that was not necessary to make the places distinct:

| Place | Beds |
| --- | --- |
| the open map | wind + birds |
| the keep (overview) | wind + birds |
| a stage banner (briefing) | wind |
| the Forge | fire + hammer |
| the War Room | fire |
| the Library / Champions / Monument / Arena | wind |
| the Shrine | water + portal |
| a battle | wind |
| victory / defeat | none — the sting carries it |
| the main menu | fire (the brazier) |

---

## 6. Failure policy

| Failure | What happens | What the player sees |
| --- | --- | --- |
| an SFX file 404s or will not decode | marked missing, never retried, `play()` returns `false` | the pre-existing oscillator version of that effect |
| a music file 404s | state marked missing; the procedural bed for that scene plays | the themed oscillator bed |
| the whole sample tree is unavailable | every `play()` returns `false` | the game sounds exactly as it did before this pass |
| the context is suspended | `statechange` → resume the wanted track and the bed | audio returns with the right theme |
| the tab is backgrounded | no notes are scheduled ahead | no burst on return |
| audio is muted | master ramps to 0; `play()` returns `false` before touching the graph | silence, no queue |

Nothing in the audio path can throw into the game loop: `load()`, `play()` and
the directors all catch, and a missing file is a downgrade rather than a crash.

---

## 7. The panel

`src/ui/SettingsUI.js` — the four faders and the mute switch, opened by the gear
key on the menu and on the map. It is mounted on `<body>`, not in
`#modal-container`, because several screens replace that container's markup; a
settings panel that a result screen can delete is worse than none.

Every change writes the save immediately, so closing the panel (or the tab)
mid-drag keeps the level. Escape closes it, focus returns to the key that opened
it, and each fader is a labelled range input — mouse, touch and arrow keys all
work.

---

## 8. Downloads: what worked, what did not

The sandbox this was built in can reach `github.com`, `api.github.com`,
`codeload.github.com`, `registry.npmjs.org` and `pypi.org`. Everything else is
blocked at the proxy, before TLS completes:

| Host | Result | Meaning |
| --- | --- | --- |
| `kenney.nl` | HTTP 000 (DNS resolves, TLS aborted by proxy) | official pack downloads unreachable |
| `pixabay.com`, `cdn.pixabay.com` | HTTP 000 | unreachable |
| `opengameart.org` | HTTP 000 | unreachable |
| `freesound.org` | HTTP 000 | unreachable |
| `mixkit.co`, `assets.mixkit.co` | HTTP 000 | unreachable |
| `raw.githubusercontent.com` | blocked | used `api.github.com` contents API instead |

So the download order from the brief was followed until step 3 and then a
*documented, licence-verified mirror* was used: the Boyquotes and Calinou GitHub
repositories are byte-identical copies of the official Kenney zips, and the
Efface Studios pack is published by its author on GitHub under CC0. Each file's
licence was checked in the pack it came from — not assumed from the category.

If you want the official zips instead (to re-derive the files yourself), these
are the official pages, and the files land in `public/assets/audio/` under the
names in `docs/audio-credits.md`:

- Kenney — Impact Sounds · https://kenney.nl/assets/impact-sounds
- Kenney — RPG Audio · https://kenney.nl/assets/rpg-audio
- Kenney — Digital Audio · https://kenney.nl/assets/digital-audio
- Kenney — Music Jingles · https://kenney.nl/assets/music-jingles
- Kenney — Interface Sounds · https://kenney.nl/assets/interface-sounds
- Kenney — UI Audio · https://kenney.nl/assets/ui-audio
- Efface Studios — Royalty Free Music Pack · https://github.com/effacestudios/Royalty-Free-Music-Pack

---

## 9. How this was verified

**Automated** (`npx vitest run` → 126 files, 1 595 tests):

- `tests/audio-library.test.js` — 29 tests: every catalogue path exists on disk,
  is ≥ 1 KiB, and starts with the `OggS` magic; the SFX bank stays under
  900 KiB and the music under 6.5 MiB; every offensive defence line is mapped and
  no two lines share a recording; cooldowns, variants, the voice cap, mute and
  the missing-file policy are exercised against a fake `AudioContext`;
  `TrackDirector` covers pending → playing, missing → no retry, and the
  no-recording case releasing the previous voice.
- `tests/audio-mix.test.js`, `tests/music-scenes.test.js`,
  `tests/ambience.test.js`, `tests/audio-director.test.js` — the four buses,
  legacy save migration, one pulse per scene, deterministic melody, ambience for
  every place, the gesture rule. Unchanged and still green.

**In a real browser** (Chromium 153, headless, production build served by
`vite preview`, a real click on the name gate, `?probe=1&hud=desktop`):

| Check | Result |
| --- | --- |
| menu music | `tracks.playing = "menu"`, one decoded buffer, `usingRecordedMusic = true` |
| samples after the gesture | 54 decoded, `missing = []` |
| audio requests | 69 requests, **all 200**, `requestfailed: []` |
| menu → level | `prep` / `prep` |
| wave 1 called | `battle` / `battle` |
| bastion ≤ 35 % | `intense` / `intense` |
| boss spawns | `boss` / `boss` |
| boss dies | `intense` / `intense` |
| healed above the line | `battle` / `battle` |
| pause → resume | same track before and after, no restart, one voice; `ui.toggle` heard on the flip |
| mute switch | `ui.toggle` heard muting and again unmuting; `master.gain` 0.8 → 0 → 0.8 |
| settings panel closed | `ui.cancel` |
| start-wave button | `ui.confirm`, then the wave-start bong; mood → `battle`, wave counter 1 |
| multi-tower combat | `tower.mortar` and `tower.tesla` each fired their own sample |
| wall hit / break | `wall.woodHit` then `wall.woodBreak` |
| wall upgraded / tower upgraded | `wall.upgrade` (latch) / `ui.upgrade` (chime), level 2 |
| wall built | `wall.build` |
| boss hit | `boss.hit`, mood stayed `boss` |
| footsteps | 7 steps over ~2 s of walking, not per frame |
| wave clear | `cue.waveClear` ×1 |
| victory | `tracks.playing = "victory"`, `cue.victory` ×1 |
| defeat (bastion destroyed) | recorded bed **stopped** (`tracks.current = null`, `voice = false`), `cue.defeat` ×1, scene `defeat` |
| world map after a battle | `realm`, one voice — no leftover battle bed |
| mute | `master.gain` 0 → 0.8, and `play()` returned `false` while muted |
| console | no errors attributable to audio |

**Not verified**, stated plainly:

- No **listening** test on real speakers; every check above is state, graph and
  request evidence, plus the recorded buffers actually existing and decoding.
- No mobile Safari / iOS check — the unlock path is written for it
  (`pointerdown` + `statechange`), but it was not run on a device.
- Nothing was committed for this pass: the brief said do not commit, so the
  working tree carries the change.
