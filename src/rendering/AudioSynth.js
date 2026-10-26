/**
 * AudioSynth — procedural Web Audio sound effects and the mix bus.
 *
 * Every effect is synthesised at runtime from oscillators and noise buffers, so
 * the game needs no audio downloads: nothing to 404, nothing to license.
 *
 * The mix
 * -------
 * One AudioContext, four buses, created once in `init()`:
 *
 *     music ─┐
 *     sfx ───┼─▶ master ─▶ destination
 *     ambient┘
 *
 * `master` is the mute switch; every effect in this file routes into `sfx`;
 * `music` and `ambient` are driven by `MusicDirector` and `AmbienceDirector`.
 * A voice therefore carries only its own envelope — the mix levels are applied
 * once, on a bus, instead of being multiplied into every oscillator (which also
 * meant the old single `volume` could never be split into music vs effects).
 *
 * Settings live in one record (`td-dsalgo:settings:v1`):
 *
 *     { muted: false, volumes: { master, music, sfx, ambient } }
 *
 * A save from before the mixer stored a single `volume`; it is read as the
 * master level, so an old profile keeps the loudness it had.
 */
import { STORAGE_KEYS } from '../config/gameConfig.js';
import { readJSON, writeJSON, getDefaultStorage } from '../utils/storage.js';

/** The four faders the settings panel shows, in signal order. */
export const AUDIO_BUSES = Object.freeze(['master', 'music', 'sfx', 'ambient']);

/**
 * Defaults, chosen so a first boot is audible but never startling: music sits
 * under the effects, and ambience sits under the music.
 */
export const DEFAULT_LEVELS = Object.freeze({
  master: 0.8,
  music: 0.5,
  sfx: 0.85,
  ambient: 0.45,
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * Coerce a saved (or hand-edited) volume record into four usable faders.
 * Missing and non-numeric entries fall back to the default; a deliberate 0 is a
 * real value and is kept.
 */
export function normalizeLevels(raw = {}) {
  const out = { ...DEFAULT_LEVELS };
  for (const bus of AUDIO_BUSES) {
    const value = raw?.[bus];
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) out[bus] = clamp01(num);
  }
  return out;
}

export class AudioSynth {
  /**
   * @param {{ storage?: Storage }} [options] injectable for tests and for a
   *   future in-memory profile; the browser singleton passes nothing.
   */
  constructor({ storage = getDefaultStorage() } = {}) {
    this.ctx = null;
    this.storage = storage;
    const stored = readJSON(this.storage, STORAGE_KEYS.settings)?.value ?? {};
    this.muted = Boolean(stored.muted);
    // `stored.volume` is the pre-mixer save shape.
    this.levels = normalizeLevels(stored.volumes ?? { master: stored.volume });
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.ambient = null;
    this.unlocked = false;
    this.buffers = new Map();
    this.loadingBuffers = false;
  }

  init() {
    if (this.ctx) return;
    if (typeof window === 'undefined') return; // unit tests, SSR
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.#createBuses();
        this.unlocked = this.ctx.state === 'running';
        this.loadAudioBuffers();
      }
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
    }
  }

  /** Build the four-bus graph. Called exactly once, from `init()`. */
  #createBuses() {
    const ctx = this.ctx;
    const bus = (level) => {
      const node = ctx.createGain();
      node.gain.value = level;
      return node;
    };
    this.master = bus(this.muted ? 0 : this.levels.master);
    this.music = bus(this.levels.music);
    this.sfx = bus(this.levels.sfx);
    this.ambient = bus(this.levels.ambient);
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.ambient.connect(this.master);
    this.master.connect(ctx.destination);
  }

  /** The context, initialising on demand. For the music/ambience directors. */
  get context() {
    this.init();
    return this.ctx;
  }

  get musicBus() {
    this.init();
    return this.music;
  }

  get ambientBus() {
    this.init();
    return this.ambient;
  }

  get volumes() {
    return { ...this.levels };
  }

  /** Legacy scalar reader — the master fader. */
  get volume() {
    return this.levels.master;
  }

  /** Push the four fader values into the graph, with a short anti-click ramp. */
  applyGains() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const ramp = (param, value) => {
      try {
        param.cancelScheduledValues(now);
        param.setTargetAtTime(clamp01(value), now, 0.05);
      } catch {
        param.value = clamp01(value);
      }
    };
    ramp(this.master.gain, this.muted ? 0 : this.levels.master);
    ramp(this.sfx.gain, this.levels.sfx);
    ramp(this.music.gain, this.levels.music);
    ramp(this.ambient.gain, this.levels.ambient);
  }

  async loadAudioBuffers() {
    if (!this.ctx || this.loadingBuffers || typeof fetch === 'undefined') return;
    this.loadingBuffers = true;
    const soundFiles = {
      click: '/assets/audio/click.ogg',
      toggle: '/assets/audio/toggle.ogg',
      wood: '/assets/audio/impact_wood.ogg',
      metal: '/assets/audio/impact_metal.ogg',
      glass: '/assets/audio/impact_glass.ogg',
      coin: '/assets/audio/coin.ogg',
      place: '/assets/audio/place.ogg',
    };
    for (const [key, path] of Object.entries(soundFiles)) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          this.buffers.set(key, audioBuf);
        }
      } catch {
        // Fallback to synth silently
      }
    }
  }

  playBuffer(key, vol = 1, playbackRate = 1) {
    if (!this.ctx || this.muted) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = playbackRate;
      const g = this.ctx.createGain();
      g.gain.value = Math.max(0, vol);
      src.connect(g);
      g.connect(this.sfx);
      src.start();
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.unlocked = true;
        // The faders may have moved while the context was suspended (a slider
        // drag on a phone before the first tap); re-apply them on resume.
        this.applyGains();
      });
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.applyGains();
    this.#persist();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Set one fader. Unknown bus names and non-numeric values are ignored so a
   * typo in a caller can never silence the game.
   * @param {'master'|'music'|'sfx'|'ambient'} bus
   * @param {number} value 0..1
   */
  setBusVolume(bus, value) {
    if (!AUDIO_BUSES.includes(bus)) return this.levels;
    const num = Number(value);
    if (!Number.isFinite(num)) return this.levels;
    this.levels[bus] = clamp01(num);
    this.applyGains();
    this.#persist();
    return this.levels;
  }

  /** Legacy alias: `setVolume(v)` is the master fader. */
  setVolume(vol) {
    return this.setBusVolume('master', vol);
  }

  #persist() {
    writeJSON(this.storage, STORAGE_KEYS.settings, {
      muted: this.muted,
      volumes: { ...this.levels },
    });
  }

  #gain(v = 1) {
    if (!this.ctx || this.muted) return null;
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, v);
    g.connect(this.sfx);
    return g;
  }

  playClick() {
    this.unlock();
    if (this.playBuffer('click', 0.45)) return;
    const g = this.#gain(0.2);
    if (!g) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playError() {
    this.unlock();
    const g = this.#gain(0.25);
    if (!g) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.setValueAtTime(110, now + 0.06);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playPlace() {
    this.unlock();
    if (this.playBuffer('place', 0.7)) return;
    const g = this.#gain(0.4);
    if (!g) return;
    const now = this.ctx.currentTime;
    // Thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * A map panel opening: a wooden tap with a breath of air under it. The map's
   * own cues exist because the ambience changes on the same click — without a
   * transient the Forge simply "becomes" loud, which reads as a bug.
   */
  playPanelOpen() {
    this.unlock();
    this.#panelCue(240, 150, 1400, 0.26);
  }

  /** The same tap, lower and shorter: the panel is being put away. */
  playPanelClose() {
    this.unlock();
    this.#panelCue(150, 96, 700, 0.2);
  }

  /**
   * A landmark under the cursor. Deliberately quiet, and it never creates a
   * context: a hover is not a user gesture, so before the first click there is
   * nothing to play and nothing to beep.
   */
  playHover() {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const g = this.#gain(0.05);
    if (!g) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(960, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.03);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  #panelCue(fromHz, toHz, tickHz, life) {
    const g = this.#gain(0.22);
    if (!g) return;
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + life);
    const body = this.ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(fromHz, now);
    body.frequency.exponentialRampToValueAtTime(toHz, now + life * 0.85);
    body.connect(g);
    body.start(now);
    body.stop(now + life);
    const tick = this.ctx.createOscillator();
    tick.type = 'triangle';
    tick.frequency.setValueAtTime(tickHz, now);
    tick.frequency.exponentialRampToValueAtTime(tickHz * 0.64, now + 0.03);
    const tickGain = this.ctx.createGain();
    tickGain.gain.setValueAtTime(0.12, now);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    tick.connect(tickGain);
    tickGain.connect(g);
    tick.start(now);
    tick.stop(now + 0.06);
  }

  playShoot(type) {
    this.unlock();
    if (type === 'archer' && this.playBuffer('wood', 0.5, 1.6)) return;
    if (type === 'cannon' && this.playBuffer('wood', 0.75, 0.6)) return;
    if (type === 'frost' && this.playBuffer('glass', 0.5, 1.3)) return;
    // Forge lines reuse the pack foley: a metal clang for the hammer, a glassy
    // chime for the rune orb and a short wood knock for the banner bolt.
    if (type === 'forge' && this.playBuffer('metal', 0.7, 0.8)) return;
    if (type === 'runes' && this.playBuffer('glass', 0.45, 0.9)) return;
    if (type === 'banner' && this.playBuffer('wood', 0.4, 1.4)) return;
    // Engineer lines. Each one is a different machine, so each gets a different
    // sample: the crossbow's wooden thunk, the repeater's metal tick, the
    // siphon's airy whoosh (wood pitched up), the still's glassy bubble, and the
    // winch's rope-and-metal slap.
    if (type === 'crossbow' && this.playBuffer('wood', 0.55, 1.15)) return;
    if (type === 'gatling' && this.playBuffer('metal', 0.4, 1.7)) return;
    if (type === 'flamer' && this.playBuffer('wood', 0.45, 0.35)) return;
    if (type === 'venom' && this.playBuffer('glass', 0.4, 0.7)) return;
    if (type === 'harpoon' && this.playBuffer('metal', 0.8, 0.45)) return;

    const now = this.ctx?.currentTime;
    if (!now) return;

    if (type === 'archer') {
      const g = this.#gain(0.3);
      if (!g) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'cannon') {
      const g = this.#gain(0.5);
      if (!g) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.22);
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'frost') {
      const g = this.#gain(0.25);
      if (!g) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  playExplosion() {
    this.unlock();
    const g = this.#gain(0.45);
    if (!g) return;
    const now = this.ctx.currentTime;
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.linearRampToValueAtTime(80, now + 0.25);

    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    whiteNoise.connect(filter);
    filter.connect(g);
    whiteNoise.start(now);
    whiteNoise.stop(now + 0.25);
  }

  playCoin() {
    this.unlock();
    if (this.playBuffer('coin', 0.65)) return;
    const g = this.#gain(0.3);
    if (!g) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc2.frequency.setValueAtTime(1318.51, now + 0.06); // E6
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(g);
    osc2.connect(g);
    osc1.start(now);
    osc1.stop(now + 0.08);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.2);
  }

  playEnemyHit() {
    this.unlock();
    if (this.playBuffer('metal', 0.4, 1.25)) return;
    const g = this.#gain(0.18);
    if (!g) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.05);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Combo stinger. Pitch climbs with the tier, so the third chain step is
   * audibly "higher" than the first without a new sample.
   */
  playCombo(tier = 1) {
    this.unlock();
    const g = this.#gain(0.22);
    if (!g) return;
    const now = this.ctx.currentTime;
    const base = 523.25 * Math.pow(1.2, Math.max(0, Math.min(3, tier) - 1)); // C5 -> up
    [1, 1.5].forEach((ratio, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * ratio, now + index * 0.02);
      osc.connect(g);
      osc.start(now + index * 0.02);
      osc.stop(now + 0.12);
    });
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  }

  /** Two-note "tempo" flourish for calling the next wave early. */
  playCallEarly() {
    this.unlock();
    const g = this.#gain(0.25);
    if (!g) return;
    const now = this.ctx.currentTime;
    [392, 587.33].forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);
      osc.connect(g);
      osc.start(now + index * 0.08);
      osc.stop(now + 0.16 + index * 0.08);
    });
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  }

  playWaveStart() {
    this.unlock();
    const g = this.#gain(0.35);
    if (!g) return;
    const now = this.ctx.currentTime;
    // Brass rally fanfare chord
    [220, 277.18, 329.63].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.05, now + 0.4);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.45);
    });
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  }

  playVictory() {
    this.unlock();
    const g = this.#gain(0.4);
    if (!g) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25]; // C E G C
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.12;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(g);
      osc.start(start);
      osc.stop(start + 0.28);
    });
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  }

  playDefeat() {
    this.unlock();
    const g = this.#gain(0.45);
    if (!g) return;
    const now = this.ctx.currentTime;
    const notes = [311.13, 293.66, 277.18, 246.94];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.16;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(g);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
  }

  playWarning() {
    this.unlock();
    const g = this.#gain(0.4);
    if (!g) return;
    const now = this.ctx.currentTime;
    [110, 116.54].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.9, now + 0.4);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.45);
    });
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  }
}

export const audio = new AudioSynth();
