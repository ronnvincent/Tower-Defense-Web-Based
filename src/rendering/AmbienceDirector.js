/**
 * AmbienceDirector — the quiet bed under the music.
 *
 * Six procedural layers, no samples: filtered noise for wind and water, a
 * lowpassed roar plus sparse crackles for fire, scheduled chirps for birds, a
 * rhythmic metal knock for the forge, and a tremolo pair for the portal.
 *
 * A layer is a *place*, not a screen: opening the Forge panel on the map swaps
 * the wind for fire and hammering while the realm's music keeps playing, which
 * is what makes the map feel like a world instead of a page.
 *
 * Rules:
 *   - one instance of a layer at a time (`this.layers` is the guard);
 *   - entering/leaving crossfades over ~1 s, so a walk between buildings never
 *     clicks;
 *   - every source that stops is also disconnected, and the noise loop is made
 *     once for the whole session;
 *   - scheduled layers (birds, hammer, crackle) do nothing while the tab is
 *     hidden.
 */

export const AMBIENCE_LAYERS = Object.freeze(['wind', 'water', 'fire', 'birds', 'hammer', 'portal']);

/** Which layers a place wants. Keyed by world-map panel id (plus `menu`). */
export const AMBIENCE_FOR = Object.freeze({
  menu: ['fire'],
  realm: ['wind', 'birds'],
  null: ['wind', 'birds'],
  overview: ['wind', 'birds'],
  briefing: ['wind'],
  forge: ['fire', 'hammer'],
  library: ['wind'],
  warroom: ['fire'],
  champions: ['wind'],
  monument: ['wind'],
  shrine: ['water', 'portal'],
  arena: ['wind'],
  battle: ['wind'],
  victory: [],
  defeat: [],
});

/** Target level of each bed, before the ambient fader. */
const LEVELS = Object.freeze({
  wind: 0.1,
  water: 0.075,
  fire: 0.07,
  birds: 0.05,
  hammer: 0.055,
  portal: 0.03,
});

export const FADE_SECONDS = 1.0;

/**
 * @param {string|null|undefined} location map panel id, `menu`, `battle`, …
 * @returns {string[]} layer names, never undefined
 */
export function ambienceFor(location) {
  const key = location ?? 'null';
  return AMBIENCE_FOR[key] ? [...AMBIENCE_FOR[key]] : [...AMBIENCE_FOR.realm];
}

export class AmbienceDirector {
  /** @param {import('./AudioSynth.js').AudioSynth} synth */
  constructor(synth) {
    this.synth = synth;
    this.layers = new Map();
    /** @type {string|null} */
    this.location = null;
    this.noise = null;
    this.wanted = undefined; // undefined = never asked; null = asked for silence
    this.disposed = false;
  }

  /** Names of the beds currently sounding — used by the tests and the HUD. */
  get active() {
    return [...this.layers.keys()];
  }

  /**
   * Move the bed to a place. Repeated calls for the same place are free.
   * @param {string|null} location
   */
  play(location) {
    if (this.disposed) return this.active;
    const ctx = this.synth.context;
    if (!ctx) return this.active;
    this.wanted = location ?? null;
    if (ctx.state !== 'running') return this.active;
    this.#retune(location ?? null);
    return this.active;
  }

  /** Called after the context resumes: apply whatever was asked for first. */
  resume() {
    if (this.wanted === undefined) return this.active;
    this.#retune(this.wanted);
    return this.active;
  }

  stop(fade = FADE_SECONDS) {
    for (const [name, layer] of [...this.layers]) this.#stop(name, layer, fade);
    this.wanted = null;
    this.location = null;
  }

  dispose() {
    this.stop(0.2);
    this.disposed = true;
  }

  /* ------------------------------------------------------------------ internals */

  #retune(location) {
    const wanted = new Set(ambienceFor(location));
    for (const [name, layer] of [...this.layers]) {
      if (!wanted.has(name)) this.#stop(name, layer, FADE_SECONDS);
    }
    for (const name of wanted) {
      if (!this.layers.has(name)) this.#start(name);
    }
    this.location = location;
  }

  #fade(layer, target, seconds = FADE_SECONDS) {
    const ctx = this.synth.ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const param = layer.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
      param.linearRampToValueAtTime(Math.max(0.0001, target), now + seconds);
    } catch {
      /* closed context */
    }
  }

  #start(name) {
    const ctx = this.synth.ctx;
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.synth.ambientBus);
    const layer = { name, gain, nodes: [], timer: null, next: 0 };
    this.layers.set(name, layer);

    try {
      if (name === 'wind') this.#bed(layer, { type: 'lowpass', frequency: 420, q: 0.5, lfo: 0.07 });
      else if (name === 'water') this.#bed(layer, { type: 'bandpass', frequency: 900, q: 1.1, lfo: 0.33 });
      else if (name === 'fire') {
        this.#bed(layer, { type: 'lowpass', frequency: 1400, q: 0.6, lfo: 1.7, lfoDepth: 0.35 });
        layer.next = ctx.currentTime + 0.3;
        layer.timer = setInterval(() => this.#crackle(layer), 320);
      } else if (name === 'portal') {
        this.#portal(layer);
      } else if (name === 'birds') {
        layer.next = ctx.currentTime + 2.5;
        layer.timer = setInterval(() => this.#chirp(layer), 1000);
      } else if (name === 'hammer') {
        layer.next = ctx.currentTime + 1.2;
        layer.timer = setInterval(() => this.#hammer(layer), 520);
      }
    } catch {
      /* a context that closed mid-build leaves a silent layer, not a crash */
    }

    this.#fade(layer, LEVELS[name] ?? 0.05);
  }

  #stop(name, layer, seconds) {
    this.layers.delete(name);
    if (layer.timer) clearInterval(layer.timer);
    this.#fade(layer, 0, seconds);
    const ctx = this.synth.ctx;
    const now = ctx?.currentTime ?? 0;
    for (const node of layer.nodes) {
      try {
        node.stop(now + seconds + 0.05);
      } catch {
        /* not a source, or already stopped */
      }
    }
    setTimeout(() => {
      try {
        layer.gain.disconnect();
      } catch {
        /* already gone */
      }
    }, (seconds + 0.3) * 1000);
  }

  /** A looping noise bed through a filter, with a slow swell on its level. */
  #bed(layer, { type, frequency, q, lfo, lfoDepth = 0.4 }) {
    const ctx = this.synth.ctx;
    if (!this.noise) this.noise = this.#noiseBuffer(2.0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    // The swell: a slow oscillator on the bed's own gain, centred so it never
    // fully closes (a bed that gates to silence sounds like a broken radio).
    const swell = ctx.createGain();
    swell.gain.value = 1 - lfoDepth;
    const lfoNode = ctx.createOscillator();
    lfoNode.frequency.value = lfo;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = lfoDepth;
    lfoNode.connect(lfoGain);
    lfoGain.connect(swell.gain);
    src.connect(filter);
    filter.connect(swell);
    swell.connect(layer.gain);
    src.start();
    lfoNode.start();
    layer.nodes.push(src, lfoNode);
  }

  /** The portal: two pure tones a fifth apart, breathing. */
  #portal(layer) {
    const ctx = this.synth.ctx;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.6;
    tremolo.connect(layer.gain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(tremolo.gain);
    lfo.start();
    layer.nodes.push(lfo);
    for (const [freq, level] of [[660, 0.5], [990, 0.3]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(tremolo);
      osc.start();
      layer.nodes.push(osc);
    }
  }

  /** Fire crackle: a 30 ms noise spit through a bright bandpass. */
  #crackle(layer) {
    const ctx = this.synth.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = ctx.currentTime;
    if (now < layer.next) return;
    layer.next = now + 0.22 + Math.random() * 0.5;
    this.#burst(layer.gain, { start: now, duration: 0.05, gain: 0.5, frequency: 2400, q: 1.2 });
  }

  /** Birdsong: three falling chirps, every few seconds, never on a grid. */
  #chirp(layer) {
    const ctx = this.synth.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = ctx.currentTime;
    if (now < layer.next) return;
    layer.next = now + 4 + Math.random() * 6;
    const base = 1900 + Math.random() * 900;
    for (let i = 0; i < 3; i += 1) {
      this.#sweep(layer.gain, {
        start: now + i * 0.09,
        duration: 0.06,
        from: base,
        to: base * (0.72 + Math.random() * 0.16),
        gain: 0.35,
      });
    }
  }

  /** The anvil, from the ambience bus: a metal knock and a low body thump. */
  #hammer(layer) {
    const ctx = this.synth.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = ctx.currentTime;
    if (now < layer.next) return;
    layer.next = now + 1.7 + Math.random() * 0.8;
    this.#burst(layer.gain, { start: now, duration: 0.09, gain: 0.75, frequency: 3200, q: 2.4 });
    this.#sweep(layer.gain, { start: now, duration: 0.16, from: 190, to: 90, gain: 0.4 });
  }

  #noiseBuffer(seconds) {
    const ctx = this.synth.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: integrating white noise tilts the spectrum down, which
    // reads as wind and water rather than as a hiss.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  #burst(dest, { start, duration, gain, frequency, q }) {
    const ctx = this.synth.ctx;
    if (!ctx || !this.noise) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      src.connect(filter);
      filter.connect(env);
      env.connect(dest);
      src.start(start);
      src.stop(start + duration + 0.02);
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          env.disconnect();
        } catch {
          /* already gone */
        }
      };
    } catch {
      /* closed context */
    }
  }

  #sweep(dest, { start, duration, from, to, gain }) {
    const ctx = this.synth.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.01);
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
      /* closed context */
    }
  }
}
