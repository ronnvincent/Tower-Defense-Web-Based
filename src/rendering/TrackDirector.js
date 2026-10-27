/**
 * TrackDirector — the recorded soundtrack.
 *
 * `MusicDirector` renders music from data with oscillators and is still here:
 * it is the fallback, and it is what plays in the half second before a track
 * has decoded. This object plays the real recordings from `MUSIC_TRACKS` and
 * follows four rules the brief calls out:
 *
 *   - **one source at a time.** Starting a second track first ramps the first
 *     one out; nothing is ever left playing underneath a new scene;
 *   - **crossfades, not cuts.** Equal-power ramps over `MUSIC_CROSSFADE`, so a
 *     battle does not begin with a click;
 *   - **no restart on repeat.** Asking for the state that is already sounding
 *     is a no-op — screens call `setScene()` on every render;
 *   - **missing is not fatal.** A file that fails to load leaves `available`
 *     false for that state forever and the caller keeps the oscillator bed.
 *
 * The bytes are fetched lazily (music is 5 MB; loading the boss theme to play a
 * menu would be wrong), decoded once, and reused for the session.
 */

import { AUDIO_ROOT, MUSIC_CROSSFADE, MUSIC_TRACKS } from './audioLibrary.js';

/** Equal-power pan law for a fade of `t` in [0,1]. */
function fadeCurve(t, up) {
  const clamped = Math.min(1, Math.max(0, t));
  return up ? Math.sin(clamped * Math.PI / 2) : Math.cos(clamped * Math.PI / 2);
}

export class TrackDirector {
  /** @param {import('./AudioSynth.js').AudioSynth} synth */
  constructor(synth) {
    this.synth = synth;
    /** @type {Map<string, AudioBuffer>} file → decoded buffer */
    this.buffers = new Map();
    /** @type {Set<string>} files that will never load */
    this.missing = new Set();
    /** @type {Map<string, Promise<AudioBuffer|null>>} */
    this.loading = new Map();
    /** @type {string|null} the state that is sounding */
    this.current = null;
    /** @type {string|null} the state that was last requested */
    this.wanted = null;
    /** @type {{ source: AudioBufferSourceNode, gain: GainNode, file: string }|null} */
    this.voice = null;
    /** Called with the state id once a recording actually starts. */
    this.onStarted = null;
  }

  /** The music state currently sounding from a file, or null. */
  get playing() {
    return this.current;
  }

  /** True when this state has a decoded buffer ready right now. */
  ready(state) {
    const track = MUSIC_TRACKS[state];
    return Boolean(track && this.buffers.has(track.file));
  }

  /**
   * Ask for a state.
   *
   * @param {string} state key in `MUSIC_TRACKS`
   * @returns {'playing'|'pending'|'missing'} what happened right now:
   *   `playing` — a recording is sounding (or resumed) for this state;
   *   `pending` — the file is loading; the caller should keep the fallback bed
   *               running, this director will start the track when it arrives;
   *   `missing` — no track for this state (or a broken one): use the fallback.
   */
  play(state) {
    const track = MUSIC_TRACKS[state];
    // The wanted state moves even when it has no recording. Leaving it behind
    // let a track that was still decoding start under the *next* screen — a
    // battle bed appearing over a defeat card because its fetch finished late.
    this.wanted = state;

    if (!track) {
      // No recording for this state at all (defeat). Fade whatever was playing
      // out instead of letting the victory theme carry into the loss: the
      // caller owns this moment with its sting and the procedural bed.
      if (this.current || this.voice) this.stop();
      return 'missing';
    }

    if (this.current === state && this.voice) return 'playing';

    const buffer = this.buffers.get(track.file);
    if (buffer) {
      this.#start(state, track, buffer);
      return 'playing';
    }
    if (this.missing.has(track.file)) {
      if (this.current || this.voice) this.stop();
      return 'missing';
    }

    this.load(track.file).then((decoded) => {
      // The scene may have moved on while this decoded; only start if the state
      // this file belongs to is still the one being asked for.
      if (!decoded || this.wanted !== state) return;
      this.#start(state, MUSIC_TRACKS[state], decoded);
    });
    return 'pending';
  }

  /** Fetch + decode one music file, once. */
  load(file) {
    if (this.buffers.has(file)) return Promise.resolve(this.buffers.get(file));
    if (this.missing.has(file)) return Promise.resolve(null);
    if (this.loading.has(file)) return this.loading.get(file);

    const ctx = this.synth?.ctx;
    if (!ctx || typeof fetch === 'undefined') return Promise.resolve(null);

    const promise = (async () => {
      try {
        const response = await fetch(`${AUDIO_ROOT}/${file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(file, buffer);
        return buffer;
      } catch {
        this.missing.add(file);
        return null;
      } finally {
        this.loading.delete(file);
      }
    })();
    this.loading.set(file, promise);
    return promise;
  }

  /** True when the mixer can actually sound anything yet. */
  get ready() {
    return Boolean(this.synth?.ctx) && !this.synth?.muted;
  }

  /**
   * Fade the current recording out and stop it.
   * Used when the game wants silence (a result card that owns its own sting).
   */
  stop(fade = MUSIC_CROSSFADE) {
    this.wanted = null;
    this.current = null;
    const voice = this.voice;
    this.voice = null;
    if (!voice) return;
    const ctx = this.synth?.ctx;
    if (!ctx) return;
    try {
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
      voice.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
      voice.source.stop(ctx.currentTime + fade + 0.05);
    } catch {
      try {
        voice.source.stop();
      } catch {
        /* already gone */
      }
    }
  }

  /** Re-apply the current track after the browser suspended the context. */
  resume() {
    if (!this.synth?.ctx || this.synth.muted) return;
    if (this.wanted && this.buffers.has(MUSIC_TRACKS[this.wanted]?.file)) {
      if (this.current !== this.wanted) this.play(this.wanted);
    }
  }

  /** Was this state ever proven unloadable? (diagnostics + tests) */
  isMissing(state) {
    const track = MUSIC_TRACKS[state];
    return Boolean(track && this.missing.has(track.file));
  }

  /* ------------------------------------------------------------------ */

  #start(state, track, buffer) {
    const ctx = this.synth?.ctx;
    if (!ctx || this.synth.muted) return;

    const previous = this.voice;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // The loops are baked with a crossfaded seam (see docs/req44), so a plain
    // `loop = true` is sample-accurate and has no click to hide.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.synth.music);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + MUSIC_CROSSFADE);

    this.voice = { source, gain, file: track.file };
    this.current = state;

    if (previous) {
      try {
        previous.gain.gain.cancelScheduledValues(now);
        previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
        previous.gain.gain.linearRampToValueAtTime(0, now + MUSIC_CROSSFADE);
        previous.source.stop(now + MUSIC_CROSSFADE + 0.05);
      } catch {
        /* the old voice already ended */
      }
    }

    try {
      source.start(now);
    } catch {
      this.voice = null;
      this.current = null;
      return;
    }
    source.onended = () => {
      try {
        gain.disconnect();
        source.disconnect();
      } catch {
        /* torn down already */
      }
    };

    if (typeof this.onStarted === 'function') this.onStarted(state);
  }
}

export { fadeCurve };
