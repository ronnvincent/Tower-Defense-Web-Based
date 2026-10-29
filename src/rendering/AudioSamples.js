/**
 * AudioSamples — the recorded half of the mixer.
 *
 * `AudioSynth` still owns the graph, the buses, the faders and the gesture rule.
 * This object owns only the *files*: it fetches one on first use, decodes it
 * once, and replays it from a cache. Everything it does is best-effort — a
 * missing, corrupt or un-decodable sample returns `false`, and the caller falls
 * back to the oscillator it used before Request 44. A soundtrack must never be
 * able to stop the game from starting.
 *
 * Three policies live here rather than at the call sites, because they are the
 * difference between "a battle" and "a wall of noise":
 *
 *   - **cooldown** — the same key cannot retrigger inside its family's window,
 *     so eight towers firing on one frame is one clean shot, not eight stacked;
 *   - **variants** — a wall taking sustained hits cycles through three
 *     recordings instead of repeating one;
 *   - **voice cap** — at most `MAX_VOICES` of the same key may sound at once,
 *     which bounds the object count under a full-board volley.
 */

import { AUDIO_LIBRARY, AUDIO_ROOT, FAMILY, soundEntry } from './audioLibrary.js';

/** Hard ceiling of simultaneously sounding instances per key. */
export const MAX_VOICES = 4;

/** How many keys may be in flight at once across the whole bank. */
export const MAX_ACTIVE = 24;

export class AudioSamples {
  /**
   * @param {import('./AudioSynth.js').AudioSynth} synth
   *   The mixer to attach to: its `ctx`, its `sfx` bus and its mute flag.
   */
  constructor(synth) {
    this.synth = synth;
    /** @type {Map<string, AudioBuffer>} key → decoded buffer (key = file path) */
    this.buffers = new Map();
    /** @type {Set<string>} files that 404'd or failed to decode — never retried */
    this.missing = new Set();
    /** @type {Map<string, Promise<AudioBuffer|null>>} in-flight loads */
    this.loading = new Map();
    /** @type {Map<string, number>} catalogue id → earliest next play (ctx time) */
    this.nextAt = new Map();
    /** @type {Map<string, number>} catalogue id → next variant index */
    this.variantCursor = new Map();
    /** @type {Map<string, number[]>} catalogue id → live source stop times */
    this.voices = new Map();
    /** @type {Map<any, number>} live source node → the time it stops */
    this.active = new Map();
  }

  /** True once a context exists and the bank can do anything at all. */
  get ready() {
    return Boolean(this.synth?.ctx);
  }

  /** How many files have been decoded and are ready to play. */
  get loadedCount() {
    return this.buffers.size;
  }

  /**
   * Fetch + decode one file, once.
   *
   * Concurrent callers share the same promise, so a frame where ten towers ask
   * for the same sample issues exactly one request.
   *
   * @param {string} file path relative to `AUDIO_ROOT`
   * @returns {Promise<AudioBuffer|null>} null when the file is unavailable
   */
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
        const bytes = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        this.buffers.set(file, buffer);
        return buffer;
      } catch {
        // A missing sample is a downgrade, never a crash: the caller synthesises.
        this.missing.add(file);
        return null;
      } finally {
        this.loading.delete(file);
      }
    })();

    this.loading.set(file, promise);
    return promise;
  }

  /**
   * Warm the cache for a list of catalogue ids without blocking anything.
   * Called with the UI set after the first gesture, so the first click is not
   * the one that has to wait for a network round trip.
   *
   * @param {string[]} ids
   */
  preload(ids) {
    for (const id of ids) {
      const entry = soundEntry(id);
      if (!entry) continue;
      this.load(entry.file);
      // Variants too: a wall hit that rotates onto a file nobody warmed would
      // be silent on the first pass, which is exactly when the wall matters.
      for (const variant of entry.variants || []) this.load(variant);
    }
  }

  /**
   * Play one catalogue entry.
   *
   * @param {string} id key in `AUDIO_LIBRARY`
   * @param {{ gain?: number, rate?: number, detune?: number, pan?: number,
   *           jitter?: number }} [options]
   *   `pan` places the voice across the stereo field (-1 … 1), `jitter` gives
   *   this one shot a random ±n pitch so a volley is a crowd and not a chirp.
   * @returns {boolean} true when a sound actually started
   */
  play(id, options = {}) {
    const entry = soundEntry(id);
    if (!entry) return false;
    const ctx = this.synth?.ctx;
    if (!ctx || this.synth.muted) return false;

    // Anti-spam: the family window, widened if the entry asks for more.
    const family = FAMILY[entry.family] || FAMILY.ui;
    const cooldown = (entry.cooldownMs ?? family.cooldownMs) / 1000;
    const now = ctx.currentTime;
    const nextAllowed = this.nextAt.get(id) ?? 0;
    if (now < nextAllowed) return false;

    // A sample that is still loading simply does not play this time (it will be
    // ready for the next shot). Queueing it would put a stale gunshot on screen.
    const file = this.#pickFile(id, entry);
    const buffer = this.buffers.get(file);
    if (!buffer) {
      this.load(file);
      return false;
    }

    if (!this.#hasVoice(id, now)) return false;

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // Jitter is per shot, and only ever a few percent: enough that eight
      // archers on one frame do not phase into a single tone, small enough that
      // the cue still reads as the same weapon.
      const jitter = Number(options.jitter) > 0 ? 1 + (Math.random() * 2 - 1) * options.jitter : 1;
      source.playbackRate.value = Math.max(0.25, (entry.rate ?? 1) * (options.rate ?? 1) * jitter);
      if (options.detune) source.detune.value = options.detune;

      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, (entry.gain ?? family.gain) * (options.gain ?? 1));
      source.connect(gain);
      const pan = Number(options.pan);
      let panner = null;
      if (Number.isFinite(pan) && Math.abs(pan) > 0.01 && ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        panner.connect(this.synth.sfx);
      } else {
        gain.connect(this.synth.sfx);
      }

      const stopAt = now + buffer.duration / source.playbackRate.value;
      this.#addVoice(id, now, stopAt);
      this.active.set(source, stopAt);

      source.onended = () => {
        this.active.delete(source);
        try {
          gain.disconnect();
          panner?.disconnect?.();
          source.disconnect();
        } catch {
          /* already torn down */
        }
      };

      source.start(now);
      this.nextAt.set(id, now + cooldown);
      return true;
    } catch {
      return false;
    }
  }

  /** Stop everything this bank started (scene change, or the mute switch). */
  stopAll() {
    for (const source of this.active.keys()) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active.clear();
    this.voices.clear();
  }

  /** Which file to use this time: cycles `variants` when a key has them. */
  #pickFile(id, entry) {
    const candidates = entry.variants?.length ? entry.variants : [entry.file];
    if (candidates.length === 1) return candidates[0];

    // Rotate over variants that are actually decoded. Advancing onto a file that
    // has not arrived yet used to burn the turn *and* the cursor, so two hits in
    // three were silent until the whole set happened to be warm.
    const cursor = this.variantCursor.get(id) ?? 0;
    for (let step = 0; step < candidates.length; step += 1) {
      const index = (cursor + step) % candidates.length;
      if (this.buffers.has(candidates[index])) {
        this.variantCursor.set(id, (index + 1) % candidates.length);
        return candidates[index];
      }
    }

    // Nothing decoded yet: warm the whole set, then let the caller skip this one.
    for (const file of candidates) this.load(file);
    return candidates[cursor % candidates.length];
  }

  /** True while this key is under its `MAX_VOICES` ceiling. */
  #hasVoice(id, now) {
    const live = (this.voices.get(id) || []).filter((stopAt) => stopAt > now);
    this.voices.set(id, live);
    return live.length < MAX_VOICES;
  }

  #addVoice(id, startAt, stopAt) {
    const live = this.voices.get(id) || [];
    live.push(stopAt);
    this.voices.set(id, live);

    // Retire whatever has already finished sounding. `onended` does this in a
    // real browser, but a suspended context, a stubbed test or a source that
    // was cut early would leave the map growing forever — so the bookkeeping
    // cannot depend on the event arriving.
    for (const [source, endsAt] of this.active) {
      if (endsAt <= startAt) this.active.delete(source);
    }

    // Global ceiling across every key: a full board cannot exceed it.
    while (this.active.size >= MAX_ACTIVE) {
      const oldest = this.active.keys().next().value;
      if (oldest === undefined) break;
      try {
        oldest.stop();
      } catch {
        /* already stopped */
      }
      this.active.delete(oldest);
    }
  }
}

/** Convenience: the families worth warming after the first gesture. */
export const PRELOAD_IDS = Object.freeze([
  'ui.click',
  'ui.hover',
  'ui.confirm',
  'ui.error',
  'ui.place',
  'ui.upgrade',
  'ui.coins',
  'ui.panelOpen',
  'ui.panelClose',
  'ui.waveStart',
  'ui.toggle',
  'ui.cancel',
  'ui.warning',
  'cue.victory',
  'cue.defeat',
  'cue.waveClear',
  // Combat essentials. A destruction sound plays once per structure, so if its
  // file is not already decoded the first — and only — break is silent. The
  // whole wall + enemy set is ~125 KB encoded, cheaper than one music bar.
  'wall.woodHit',
  'wall.woodBreak',
  'wall.stoneHit',
  'wall.stoneBreak',
  'wall.metalHit',
  'wall.build',
  'wall.upgrade',
  'enemy.step',
  'enemy.hit',
  'enemy.death',
  'boss.enter',
  'boss.hit',
  ...Object.keys(AUDIO_LIBRARY).filter((id) => id.startsWith('tower.')),
]);
