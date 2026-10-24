/**
 * AudioSynth — Procedural Web Audio sound generator.
 *
 * Provides responsive sound effects synthesized at runtime using Web Audio oscillators
 * and noise buffers. Requires ZERO external audio files or downloads, ensuring the game
 * will never suffer broken 404 audio assets or licensing issues.
 */
import { STORAGE_KEYS } from '../config/gameConfig.js';
import { readJSON, writeJSON, getDefaultStorage } from '../utils/storage.js';

export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.storage = getDefaultStorage();
    const stored = readJSON(this.storage, STORAGE_KEYS.settings);
    this.muted = stored?.value?.muted ?? false;
    this.volume = stored?.value?.volume ?? 0.6;
    this.unlocked = false;
    this.buffers = new Map();
    this.loadingBuffers = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.unlocked = this.ctx.state === 'running';
        this.loadAudioBuffers();
      }
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
    }
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
      g.gain.value = Math.max(0, vol * this.volume);
      src.connect(g);
      g.connect(this.ctx.destination);
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
      });
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.#persist();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.#persist();
  }

  #persist() {
    writeJSON(this.storage, STORAGE_KEYS.settings, {
      muted: this.muted,
      volume: this.volume,
    });
  }

  #gain(v = 1) {
    if (!this.ctx || this.muted) return null;
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, v * this.volume);
    g.connect(this.ctx.destination);
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
    g.gain.setValueAtTime(0.2 * this.volume, now);
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
    g.gain.setValueAtTime(0.25 * this.volume, now);
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
    g.gain.setValueAtTime(0.4 * this.volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.12);
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

    const now = this.ctx?.currentTime;
    if (!now) return;

    if (type === 'archer') {
      const g = this.#gain(0.3);
      if (!g) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
      g.gain.setValueAtTime(0.25 * this.volume, now);
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
      g.gain.setValueAtTime(0.5 * this.volume, now);
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
      g.gain.setValueAtTime(0.25 * this.volume, now);
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

    g.gain.setValueAtTime(0.45 * this.volume, now);
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
    g.gain.setValueAtTime(0.25 * this.volume, now);
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
    g.gain.setValueAtTime(0.18 * this.volume, now);
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
    g.gain.setValueAtTime(0.2 * this.volume, now);
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
    g.gain.setValueAtTime(0.22 * this.volume, now);
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
    g.gain.setValueAtTime(0.35 * this.volume, now);
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
    g.gain.setValueAtTime(0.4 * this.volume, now);
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
    g.gain.setValueAtTime(0.4 * this.volume, now);
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
    g.gain.setValueAtTime(0.4 * this.volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  }
}

export const audio = new AudioSynth();
