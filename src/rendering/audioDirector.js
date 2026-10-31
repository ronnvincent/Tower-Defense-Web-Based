/**
 * audioDirector.js — the one object the screens talk to.
 *
 * It owns the two directors and the gesture rule:
 *
 *   - nothing is created or resumed before the browser has seen a real
 *     interaction. `arm()` installs one-shot listeners; the first pointer or key
 *     unlocks the context and starts whatever scene was asked for;
 *   - `setScene()` / `setLocation()` are idempotent, so a screen can call them on
 *     every render without stacking layers;
 *   - the context's `statechange` is the recovery path: a phone that suspends
 *     audio when the app goes to the background resumes into the right scene
 *     instead of silence.
 *
 * Screens import this, never the directors.
 */

import { audio } from './AudioSynth.js';
import { MusicDirector } from './MusicDirector.js';
import { AmbienceDirector } from './AmbienceDirector.js';
import { TrackDirector } from './TrackDirector.js';

/**
 * Places that own their own music. The screen still decides the base scene —
 * the realm keeps its theme on the map — but inside the Forge or the War Room
 * the score changes to match the room, and changes back on the way out.
 */
export const MUSIC_FOR_LOCATION = Object.freeze({
  forge: 'forge',
  warroom: 'warroom',
});

export class AudioDirector {
  /** @param {import('./AudioSynth.js').AudioSynth} synth */
  constructor(synth) {
    this.synth = synth;
    this.music = new MusicDirector(synth);
    this.ambience = new AmbienceDirector(synth);
    // Request 44: the recorded soundtrack. `music` above is not dead — it is
    // the bed that plays while a track decodes, and the fallback for a state
    // whose file is missing.
    this.tracks = new TrackDirector(synth);
    this.scene = 'menu';
    this.location = null;
    this.armed = false;
    this.started = false;
  }

  /**
   * Install the first-gesture listeners. Safe to call once at boot; calling it
   * again does nothing, and on a server (no `window`) it simply returns.
   */
  arm() {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const kick = () => this.start();
    window.addEventListener('pointerdown', kick, { once: true, passive: true });
    window.addEventListener('keydown', kick, { once: true });
    window.addEventListener('touchstart', kick, { once: true, passive: true });
  }

  /** Unlock and start the pending scene/location. Idempotent. */
  start() {
    if (this.started) return;
    this.started = true;
    this.synth.unlock();
    const ctx = this.synth.ctx;
    if (ctx && typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', () => this.#onStateChange());
    }
    this.#playTheme();
    this.ambience.play(this.location);
    // `resume()` is asynchronous on most browsers; if the context was still
    // suspended above, this picks the requests up again once it is running.
    this.#onStateChange();
  }

  #onStateChange() {
    const ctx = this.synth.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.music.resume();
    this.tracks.resume();
    this.ambience.resume();
  }

  /** @param {string} id one of `MUSIC_SCENES` */
  setScene(id) {
    this.scene = id;
    this.sync();
    return this.scene;
  }

  /**
   * @param {string|null} location a world-map panel id, `menu`, `battle`, …
   */
  setLocation(location) {
    this.location = location ?? null;
    this.sync();
    return this.location;
  }

  /** What should be sounding right now, given both the screen and the place. */
  get theme() {
    return MUSIC_FOR_LOCATION[this.location] ?? this.scene;
  }

  /**
   * One place that decides both beds. Idempotent: both directors ignore a
   * request for what they are already playing, so this is safe to call on
   * every render.
   */
  sync() {
    if (!this.started) return;
    this.#playTheme();
    this.ambience.play(this.location);
  }

  /**
   * Music for the current theme: a recording if one is ready, the oscillator
   * bed otherwise.
   *
   * The order matters. Asking `tracks` first means a cached track starts at
   * once and the procedural bed is never heard at all; a track that still has
   * to load returns `pending`, so the bed covers the gap and is then faded out
   * by `MusicDirector.play()` seeing the track take over. The oscillator bed
   * also stays exactly as it was for any state with no track (`missing`), which
   * is what keeps the forge and the war room sounding like themselves.
   */
  #playTheme() {
    const theme = this.theme;
    const result = this.tracks.play(theme);
    if (result === 'playing') {
      // The recording owns the scene; silence the oscillator bed so the two do
      // not double the harmony in different keys.
      this.music.stop();
      return;
    }
    this.music.play(theme);
    if (result === 'pending') {
      this.tracks.onStarted = (state) => {
        if (state === this.theme) this.music.stop();
      };
    }
  }

  /** True when a recorded track (not the oscillator bed) is sounding. */
  get usingRecordedMusic() {
    return Boolean(this.tracks.playing);
  }

  /** Read-only snapshot for the settings panel, the HUD and the tests. */
  get state() {
    return {
      scene: this.scene,
      playing: this.music.playing,
      location: this.location,
      ambience: this.ambience.active,
      unlocked: Boolean(this.started && this.synth.ctx?.state === 'running'),
      muted: Boolean(this.synth.muted),
      // A copy: the snapshot is for reading, and a caller that edits it must not
      // be able to move the mixer.
      volumes: { ...this.synth.volumes },
    };
  }
}

export const audioDirector = new AudioDirector(audio);
