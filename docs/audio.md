# Audio — the mixer, the scenes, the beds

There is no recorded soundtrack in this project, and there is not meant to be.
Everything you hear beyond the seven foley clips is **synthesised in the browser
from data**: `src/rendering/musicScenes.js` describes each screen, and
`MusicDirector` renders it with oscillators. That keeps the download small, the
licensing trivial (nothing to license), and lets the music react to a screen
without shipping a file per screen.

What is sampled, exactly: seven CC0 clips in `public/assets/audio/` — click,
toggle, coin, place, and three impacts (wood, metal, glass). Every other sound
in the game — waves, bosses, victories, arrows, cannons, frost, the shop, the
interface — is generated at runtime in `AudioSynth`.

---

## 1. The graph

```
music   ─┐
sfx     ─┼─▶ master ─▶ destination
ambient ─┘
```

Four buses, created once in `AudioSynth.init()`, and **one** `AudioContext` for
the game. Before this pass there was a single `volume` scalar folded into every
envelope, so music and effects could not be balanced; now a voice carries only
its own shape and every level is applied once, on its bus.

| Bus | Who writes to it | Default |
| --- | --- | --- |
| `master` | the mute switch and the master fader | 0.8 |
| `music` | `MusicDirector` | 0.5 |
| `sfx` | every effect in `AudioSynth`, and the foley buffers | 0.85 |
| `ambient` | `AmbienceDirector` | 0.45 |

Mute is a master-gain ramp to 0 over 40 ms (`setTargetAtTime`), not a boolean
check inside each effect — so it also silences music and ambience, and it never
clicks.

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
4. a request made before that is remembered in `MusicDirector.wanted` and
   replayed by `resume()` — the menu theme starts on the first tap, not never;
5. `AudioContext`'s `statechange` is the recovery path: a phone that suspends
   audio in the background resumes into the right scene instead of silence.

Measured in Chromium: before the first click the game's context does not exist;
after one real click it is `running`, exactly one context was created by the
game (Phaser has its own), and the music bus carries signal.

---

## 3. Music

One scene sounds at a time. Switching crossfades over 1.1 s, and the outgoing
layer stops its own oscillators and disconnects, so nothing stacks or leaks.
A 200 ms scheduler looks 700 ms ahead on the audio clock (the standard way to
keep musical time off the JavaScript timer's jitter); a hidden tab schedules
nothing, so a backgrounded game does not dump a burst of notes on return.

| Scene | Root | Mode | Tempo | Why |
| --- | --- | --- | --- | --- |
| `menu` | A2 110 | aeolian | 56 | low, unresolved — the keep at dusk |
| `realm` | G2 98 | dorian | 52 | lifts a fourth from the menu; wide and open |
| `forge` | F2 87.3 | phrygian | 66 | the flat second is the heat |
| `warroom` | C3 130.8 | mixolydian | 74 | the brightest mode in the set |
| `battle` | E2 82.4 | aeolian | 108 | the only scene with a pulse: kick + snare |
| `victory` | C3 130.8 | major | 84 | resolved, bright bells |
| `defeat` | Ab2 103.8 | aeolian | 46 | the flattened tonic of the set |

Two places own their theme: walking into the Forge or the War Room changes the
score, not just the bed, and leaving it returns to the screen's scene
(`MUSIC_FOR_LOCATION` in `audioDirector.js`). The screen's scene is kept, so the
map still knows what to come back to.

Each scene is a four-note pad (two detuned oscillators per note through a
lowpass, plus a 0.06 Hz drift so it breathes), a bass every bar on the tonic an
octave down, and a pluck on the even beats walking the mode. The phrase is
*deterministic* — the menu sounds like the menu every visit, which is what makes
it a theme rather than a random generator.

---

## 4. Ambience

A bed is a **place**, not a screen: opening the Forge panel on the map swaps the
open-country wind for fire and hammering while the realm's music keeps playing.
Entering and leaving a place crossfades over 1 s.

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

Six layers, no samples: brown-ish noise through a filter for wind and water
(with a slow swell on the level so it never gates to silence), a lowpassed roar
plus sparse crackles for fire, scheduled chirps for birds, a rhythmic metal
knock for the forge, and a pair of pure tones under a tremolo for the portal.
The noise loop is generated once and shared; a crackle is a 50 ms slice of it,
not a new buffer.

---

## 5. The panel

`src/ui/SettingsUI.js` — the four faders and the mute switch, opened by the gear
key on the menu and on the map. It is mounted on `<body>`, not in
`#modal-container`, because several screens replace that container's markup; a
settings panel that a result screen can delete is worse than none.

### Cues on the map

A landmark is a place, and moving the camera to it changes the ambience — so
the press needs a transient, or the Forge simply *becomes* loud:

| Action | Sound |
| --- | --- |
| a landmark under the cursor | a 30 ms tick at 0.05 gain, at most one per 90 ms |
| a landmark pressed / panel opened | a wooden tap (240 → 150 Hz) over a 1.4 kHz tick |
| the panel closed | the same tap lower and shorter (150 → 96 Hz) |

The hover tick returns early when there is no running context: a hover is not a
user gesture, so before the first click it must do nothing at all. Measured on
the `sfx` bus in Chromium: idle 0, panel open 0.086 RMS, panel close 0.057, and
0 with mute on.

Every change writes the save immediately, so closing the panel (or the tab)
mid-drag keeps the level. Escape closes it, focus returns to the key that opened
it, and each fader is a labelled range input — mouse, touch and arrow keys all
work.

---

## 6. What is *not* here

- **No recorded music.** If you want an orchestral theme, it has to be
  commissioned or downloaded under a licence that permits it; the structure to
  play one exists (`MusicDirector` crossfades any source), but no file is
  shipped.
- **No audio in the build output beyond the seven clips.** The music is code.
- **Spatial audio** (panning by tower position) is not implemented; every effect
  is mono through the `sfx` bus.

---

## 7. How this was verified

- `tests/audio-mix.test.js` — the four buses, defaults, clamping, the legacy
  save migration, persistence, and "a corrupt settings record does not silence
  the game".
- `tests/music-scenes.test.js` — every scene is playable (root, tempo, a real
  mode, gains under the effects), only the battle has a pulse, and the melody
  walk is deterministic and inside the mode.
- `tests/ambience.test.js` — every landmark panel has a bed, every named layer
  exists, unknown places fall back to the realm.
- `tests/audio-director.test.js` — the gesture rule, idempotent start, and a
  read-only state snapshot.
- In Chromium, with an `AnalyserNode` tapped onto the buses:
  music RMS ≈ 0.012 on the menu, **0** when muted, **0** when the music fader is
  pulled to 0, and ≈ 0.012 again when restored. The battle scene reports
  `scene: "battle"` with a wind bed; a real result screen reports
  `scene: "victory"` with zero ambience layers; returning to the map reports
  `scene: "realm"`. Opening the Forge reports `forge` with fire + hammer and
  five voices; the War Room reports `warroom` with fire; closing either returns
  to `realm`. The voice count never rises above five, so switching scenes does
  not stack layers.
