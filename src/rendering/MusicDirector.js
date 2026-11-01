/**
 * MusicDirector — renders `musicScenes.js` with oscillators.
 *
 * No audio file is ever fetched. One scene is a four-note pad (two detuned
 * oscillators per note, through a lowpass), a bass every bar, a melody on the
 * even beats and — in battle only — a kick and a snare. A 200 ms scheduler looks
 * 700 ms ahead on the AudioContext clock, which is the standard way to keep
 * musical time off the JavaScript timer's jitter.
 *
 * Rules this file keeps:
 *   - exactly one scene sounds at a time; switching crossfades over 1.1 s and
 *     the old layer stops its own oscillators, so nothing stacks or leaks;
 *   - nothing starts until the context is actually `running`, i.e. until the
 *     browser has seen a gesture. A request made before that is remembered in
 *     `wanted` and replayed by `resume()` — never silently dropped;
 *   - a hidden tab schedules nothing (a background tab would otherwise queue a
 *     burst of notes and play them all at once when it returns);
 *   - every node that ends is disconnected, and the noise buffer is built once
 *     and reused.
 */

import { melodyOffset, musicScene, noteHz } from './musicScenes.js';

const FADE_SECONDS = 1.1;
const LOOKAHEAD = 0.7;
const TICK_MS = 200;

export class MusicDirector {
  /** @param {import('./AudioSynth.js').AudioSynth} synth */
  constructor(synth) {
    this.synth = synth;
    /** @type {string|null} the scene that is actually sounding */
    this.current = null;
    /** @type {string|null} the scene requested before the context was running */
    this.wanted = null;
    /** @type {object|null} */
    this.layer = null;
    this.noiseBuffer = null;
    this.disposed = false;
  }

  /** The scene currently sounding (null until the first gesture). */
  get playing() {
    return this.current;
  }

  /**
   * Ask for a scene. Safe to call on every screen change: asking for the scene
   * that is already playing does nothing.
   * @param {string} id
   * @returns {string|null} the scene now playing, or null if it is waiting
   */
  play(id) {
    if (this.disposed) return null;
    const scene = musicScene(id);
    if (this.current === scene.id && this.layer) return this.current;

    const ctx = this.synth.context;
    if (!ctx) {
      // No AudioContext at all (a blocked browser, or a unit test). Keep the
      // request so `resume()` can honour it the moment one exists.
      this.wanted = scene.id;
      return null;
    }
    if (ctx.state !== 'running') {
      // Autoplay policy: remember the request, start it on the first gesture.
      this.wanted = scene.id;
      return null;
    }

    this.#fadeOut(this.layer, FADE_SECONDS);
    this.layer = this.#start(ctx, scene);
    this.current = scene.id;
    this.wanted = null;
    return this.current;
  }

  /** Replay a request that was made before the context resumed. */
  resume() {
    if (!this.wanted) return null;
    const id = this.wanted;
    this.wanted = null;
    this.current = null;
    return this.play(id);
  }

  /** Fade everything out (used when the game is muted or torn down). */
  stop(fade = FADE_SECONDS) {
    this.#fadeOut(this.layer, fade);
    this.layer = null;
    this.current = null;
    this.wanted = null;
  }

  dispose() {
    this.stop(0.2);
    this.disposed = true;
  }

  /* ------------------------------------------------------------------ internals */

  #start(ctx, scene) {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(scene.padGain, now + FADE_SECONDS);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = scene.id === 'battle' ? 2600 : 1600;
    filter.Q.value = 0.4;
    filter.connect(gain);
    gain.connect(this.synth.musicBus);

    const voices = [];
    scene.chord.forEach((semitone, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = noteHz(scene.root, semitone);
      osc.detune.value = (index - (scene.chord.length - 1) / 2) * 3;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = (index === 0 ? 0.5 : 0.3) / scene.chord.length;
      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start(now);
      voices.push(osc);
    });

    // A 0.06 Hz drift on every pad voice: the chord breathes instead of sitting
    // still like a test tone.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 2.5;
    lfo.connect(lfoDepth);
    for (const voice of voices) lfoDepth.connect(voice.detune);
    lfo.start(now);

    const layer = {
      scene,
      gain,
      filter,
      voices: [...voices, lfo],
      timer: null,
      nextAt: now + 0.25,
      beat: 0,
    };
    layer.timer = setInterval(() => this.#schedule(layer, ctx), TICK_MS);
    this.#schedule(layer, ctx);
    return layer;
  }

  #fadeOut(layer, seconds) {
    if (!layer) return;
    const ctx = this.synth.ctx;
    if (!ctx) return;
    if (layer.timer) clearInterval(layer.timer);
    const now = ctx.currentTime;
    const fade = Math.max(0.05, seconds);
    try {
      const param = layer.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
      param.exponentialRampToValueAtTime(0.0001, now + fade);
    } catch {
      /* already torn down */
    }
    for (const voice of layer.voices) {
      try {
        voice.stop(now + fade + 0.05);
      } catch {
        /* not started */
      }
    }
    // Give the ramp time, then drop the whole layer out of the graph.
    setTimeout(() => {
      try {
        layer.gain.disconnect();
        layer.filter.disconnect();
      } catch {
        /* disconnected already */
      }
    }, (fade + 0.25) * 1000);
  }

  #schedule(layer, ctx) {
    if (this.layer !== layer) return;
    if (ctx.state !== 'running') {
      // Suspended (backgrounded, or the tab lost focus): do not queue notes.
      layer.nextAt = ctx.currentTime + 0.2;
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      layer.nextAt = ctx.currentTime + 0.2;
      layer.beat = 0;
      return;
    }

    const beatSeconds = 60 / layer.scene.tempo;
    const horizon = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (layer.nextAt < horizon && guard < 8) {
      const at = layer.nextAt;
      if (at >= ctx.currentTime - 0.02) this.#beatVoice(ctx, layer, at, layer.beat);
      layer.nextAt += beatSeconds;
      layer.beat = (layer.beat + 1) % 64;
      guard += 1;
    }
  }

  #beatVoice(ctx, layer, at, beat) {
    const { scene } = layer;
    const out = layer.filter;

    // Bass: the tonic an octave down, once a bar.
    if (beat % 4 === 0) {
      this.#blip(ctx, out, {
        freq: noteHz(scene.root, 0) / 2,
        start: at,
        duration: 1.5,
        type: 'sine',
        gain: scene.bassGain,
      });
    }

    // Melody: a pluck every other beat, walking the mode.
    if (beat % 2 === 0) {
      const octave = scene.id === 'battle' ? 1 : 2;
      this.#blip(ctx, out, {
        freq: noteHz(scene.root, melodyOffset(scene, beat, octave)),
        start: at,
        duration: 0.42,
        type: 'triangle',
        gain: scene.bellGain,
      });
    }

    if (!scene.pulse) return;

    // Battle only: a march, not a groove. Kick on every beat, a snare on 2 and 4.
    this.#blip(ctx, out, {
      freq: 132,
      sweepTo: 46,
      start: at,
      duration: 0.17,
      type: 'sine',
      gain: 0.15,
    });
    if (beat % 4 === 2) {
      this.#noise(ctx, out, {
        start: at,
        duration: 0.11,
        gain: 0.055,
        frequency: 1900,
        q: 0.9,
      });
    }
  }

  #blip(ctx, dest, { freq, start, duration, type, gain, sweepTo = null }) {
    try {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(env);
      env.connect(dest);
      osc.start(start);
      osc.stop(start + duration + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          /* already gone */
        }
      };
    } catch {
      /* a closed context — nothing to do */
    }
  }

  #noise(ctx, dest, { start, duration, gain, frequency = 1600, q = 0.7 }) {
    try {
      // One buffer for the whole session: a snare is a slice of it, not a new
      // 0.25 s of random samples every beat.
      if (!this.noiseBuffer) {
        const length = Math.floor(ctx.sampleRate * 0.4);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      src.connect(band);
      band.connect(env);
      env.connect(dest);
      src.start(start);
      src.stop(start + duration + 0.02);
      src.onended = () => {
        try {
          src.disconnect();
          band.disconnect();
          env.disconnect();
        } catch {
          /* already gone */
        }
      };
    } catch {
      /* a closed context — nothing to do */
    }
  }
}
