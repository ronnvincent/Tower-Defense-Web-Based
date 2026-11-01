/**
 * The recorded library (Request 44).
 *
 * The dangerous failure with a sample bank is quiet: a path is renamed, the
 * fetch 404s, the bank falls back to synthesis, and nobody notices for months
 * because the game still makes a noise. So the first thing pinned here is that
 * every path in the catalogue resolves to a real file on disk.
 *
 * The second is coverage: every offensive defence line must have its own
 * recording. A tower added without one is a gun that fires silently, which is
 * exactly the "references nonexistent files" failure the brief forbids.
 *
 * The rest pins the policies that stop a battle becoming a wall of noise —
 * cooldowns, variants and the voice cap — against a fake AudioContext, because
 * those are decisions about numbers and can be tested without a speaker.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  AUDIO_LIBRARY,
  AUDIO_ROOT,
  FAMILY,
  MUSIC_TRACKS,
  TOWER_SAMPLES,
  libraryFiles,
  musicFiles,
  soundEntry,
  towerSample,
} from '../src/rendering/audioLibrary.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ROYAL_TOWER_TYPES } from '../src/data/royalDefences.js';
import { AudioSamples, MAX_VOICES } from '../src/rendering/AudioSamples.js';
import { TrackDirector } from '../src/rendering/TrackDirector.js';
import { TOWER_SAMPLES } from '../src/rendering/audioLibrary.js';

const PUBLIC_ROOT = join(process.cwd(), 'public');

/** Absolute path on disk for a catalogue-relative file. */
const diskPath = (file) => join(PUBLIC_ROOT, AUDIO_ROOT.replace(/^\//, ''), file);

/* ------------------------------------------------------------------ files */

describe('the catalogue points at real files', () => {
  it('every sound file exists and is not empty', () => {
    const missing = [];
    const empty = [];
    for (const file of libraryFiles()) {
      const path = diskPath(file);
      if (!existsSync(path)) missing.push(file);
      else if (statSync(path).size < 1024) empty.push(file);
    }
    expect(missing, 'catalogue entries with no file').toEqual([]);
    expect(empty, 'sample files too small to be audio').toEqual([]);
  });

  it('every music track exists', () => {
    const missing = musicFiles().filter((file) => !existsSync(diskPath(file)));
    expect(missing).toEqual([]);
  });

  it('every file is really an Ogg stream', () => {
    // A renamed WAV would 404 at decode time and degrade to synthesis silently.
    const notOgg = libraryFiles().filter((file) => {
      const path = diskPath(file);
      if (!existsSync(path)) return false;
      const head = statSync(path).isFile()
        ? require('node:fs').readFileSync(path, { encoding: null }).subarray(0, 4).toString('latin1')
        : '';
      return head !== 'OggS';
    });
    expect(notOgg).toEqual([]);
  });

  it('keeps the library small enough to ship', () => {
    const bytes = libraryFiles().reduce((total, file) => {
      const path = diskPath(file);
      return total + (existsSync(path) ? statSync(path).size : 0);
    }, 0);
    // Effects only: the music is measured separately below.
    expect(bytes).toBeLessThan(900 * 1024);
  });

  it('keeps the music under a sane budget for a browser game', () => {
    const bytes = musicFiles().reduce((total, file) => total + statSync(diskPath(file)).size, 0);
    expect(bytes).toBeLessThan(6.5 * 1024 * 1024);
    for (const file of musicFiles()) {
      expect(statSync(diskPath(file)).size, `${file} is too big to preload`).toBeLessThan(1.2 * 1024 * 1024);
    }
  });
});

/* --------------------------------------------------------------- coverage */

describe('every defence that shoots has a voice of its own', () => {
  const lines = () => {
    const out = new Map();
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      if (def.supportOnly || def.trap) continue;
      out.set(line, def);
    }
    for (const [line, def] of Object.entries(ROYAL_TOWER_TYPES)) {
      if (def.supportOnly || def.trap) continue;
      if (def.barricade || def.placement === 'wall') continue;
      out.set(line, def);
    }
    return out;
  };

  it('maps every offensive line to a catalogue entry', () => {
    const unmapped = [...lines().keys()].filter((line) => !TOWER_SAMPLES[line]);
    expect(unmapped).toEqual([]);
  });

  it('lets no two offensive lines share a recording', () => {
    // A mortar and a cannon sounding identical defeats the point of the pass:
    // the brief asks for a distinct identity per defence.
    const used = new Map();
    const clashes = [];
    for (const line of lines().keys()) {
      const id = TOWER_SAMPLES[line];
      if (!id) continue;
      const file = soundEntry(id)?.file;
      if (used.has(file)) clashes.push([used.get(file), line, file]);
      else used.set(file, line);
    }
    expect(clashes).toEqual([]);
  });

  it('resolves each mapping to a real entry', () => {
    for (const [line, id] of Object.entries(TOWER_SAMPLES)) {
      expect(soundEntry(id), `${line} → ${id}`).not.toBeNull();
    }
    expect(towerSample('mortar')?.file).toBe('towers/tower_mortar.ogg');
    expect(towerSample('not-a-tower')).toBeNull();
  });
});

/* ------------------------------------------------------------- catalogue */

describe('the catalogue is well formed', () => {
  it('gives every entry a family that exists', () => {
    for (const [id, entry] of Object.entries(AUDIO_LIBRARY)) {
      expect(Object.keys(FAMILY), id).toContain(entry.family);
      expect(entry.file, id).toMatch(/\.ogg$/);
      expect(entry.pack, `${id} has no pack recorded`).toBeTruthy();
    }
  });

  it('keeps every variant beside its base file', () => {
    for (const [id, entry] of Object.entries(AUDIO_LIBRARY)) {
      for (const variant of entry.variants || []) {
        expect(existsSync(diskPath(variant)), `${id} variant ${variant}`).toBe(true);
      }
    }
  });

  it('never sets a gain that could drown an effect', () => {
    for (const [id, entry] of Object.entries(AUDIO_LIBRARY)) {
      const gain = entry.gain ?? FAMILY[entry.family].gain;
      expect(gain, id).toBeGreaterThan(0);
      expect(gain, id).toBeLessThanOrEqual(1);
    }
  });

  it('covers exactly the states the game asks for', () => {
    const required = ['menu', 'realm', 'prep', 'battle', 'intense', 'boss', 'victory'];
    for (const state of required) {
      expect(Object.keys(MUSIC_TRACKS), state).toContain(state);
    }
  });
});

/* --------------------------------------------------------------- playback */

/** A minimal AudioContext: enough for the bank's scheduling policy. */
function fakeCtx() {
  const started = [];
  let now = 0;
  const ctx = {
    get currentTime() {
      return now;
    },
    advance(seconds) {
      now += seconds;
    },
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        detune: { value: 0 },
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => started.push(source)),
        stop: vi.fn(),
      };
      return source;
    },
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    },
    decodeAudioData: vi.fn(async () => ({ duration: 0.5 })),
    state: 'running',
  };
  return { ctx, started };
}

function fakeSynth() {
  const { ctx, started } = fakeCtx();
  return {
    ctx,
    started,
    muted: false,
    sfx: { connect: vi.fn() },
    music: { connect: vi.fn() },
    volumes: { master: 0.8, music: 0.5, sfx: 0.85, ambient: 0.45 },
    unlock: vi.fn(),
  };
}

/** Prime the bank with a decoded buffer so `play` has something to schedule. */
function primed(bank, file) {
  bank.buffers.set(file, { duration: 0.4 });
}

describe('the sample bank keeps a fight from becoming a wall of noise', () => {
  it('plays a cached sample and reports it', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    primed(bank, AUDIO_LIBRARY['tower.mortar'].file);
    expect(bank.play('tower.mortar')).toBe(true);
    expect(synth.started.length).toBe(1);
  });

  it('refuses a second shot inside the cooldown', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    primed(bank, AUDIO_LIBRARY['tower.mortar'].file);
    expect(bank.play('tower.mortar')).toBe(true);
    expect(bank.play('tower.mortar'), 'second shot on the same frame').toBe(false);
    synth.ctx.advance(0.11);
    expect(bank.play('tower.mortar'), 'after the window').toBe(true);
    expect(synth.started.length).toBe(2);
  });

  it('lets different weapons fire at once', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    for (const id of ['tower.mortar', 'tower.archer', 'tower.tesla']) primed(bank, AUDIO_LIBRARY[id].file);
    expect(bank.play('tower.mortar')).toBe(true);
    expect(bank.play('tower.archer')).toBe(true);
    expect(bank.play('tower.tesla')).toBe(true);
    expect(synth.started.length).toBe(3);
  });

  it('cycles wall-hit variants instead of repeating one sample', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    for (const variant of AUDIO_LIBRARY['wall.woodHit'].variants) primed(bank, variant);
    const used = [];
    for (let i = 0; i < 3; i += 1) {
      synth.ctx.advance(0.2);
      expect(bank.play('wall.woodHit')).toBe(true);
      used.push(synth.started[synth.started.length - 1].buffer);
    }
    // Three consecutive hits must not be the same recording three times.
    expect(new Set(used).size).toBe(3);
  });

  it('has a real caller for every catalogue entry', async () => {
    // Preloading a sample nobody ever triggers is dead weight and a silent bug
    // in waiting: `ui.toggle` and `ui.cancel` shipped preloaded but unplayed
    // until this test existed. Tower lines are played through `TOWER_SAMPLES`,
    // so they are checked against that map instead of against the source text.
    const { readFileSync } = await import('node:fs');
    const synth = readFileSync('src/rendering/AudioSynth.js', 'utf8');
    const dead = Object.keys(AUDIO_LIBRARY)
      .filter((id) => !id.startsWith('tower.'))
      .filter((id) => !synth.includes(`'${id}'`));
    expect(dead, 'catalogue entries nothing ever plays').toEqual([]);

    const mapped = new Set(Object.values(TOWER_SAMPLES));
    const unplayed = Object.keys(AUDIO_LIBRARY)
      .filter((id) => id.startsWith('tower.'))
      .filter((id) => !mapped.has(id));
    expect(unplayed, 'towers with a sample nobody plays').toEqual([]);
  });

  it('never rotates onto a variant that has not been decoded', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    const entry = AUDIO_LIBRARY['wall.woodHit'];
    // Only the primary file is warm, exactly as it is on the first wall hit.
    primed(bank, entry.file);
    const used = new Set();
    for (let i = 0; i < 6; i += 1) {
      synth.ctx.advance(0.2);
      const played = bank.play('wall.woodHit');
      if (played) used.add(synth.started[synth.started.length - 1].buffer);
    }
    // A cold variant must not eat the turn: every attempt that plays is audible.
    expect(used.size).toBe(1);
    expect(synth.started.length).toBe(6);
  });

  it('warms every variant when a key is preloaded', () => {
    const bank = new AudioSamples(fakeSynth());
    bank.preload(['wall.woodHit']);
    const requested = [...bank.loading.keys(), ...bank.buffers.keys()];
    for (const variant of AUDIO_LIBRARY['wall.woodHit'].variants) {
      expect(requested, `${variant} was not warmed`).toContain(variant);
    }
  });

  it('caps simultaneous voices of one key', () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    primed(bank, AUDIO_LIBRARY['enemy.hit'].file);
    bank.play('enemy.hit');
    // Pretend the family cooldown is not what is stopping the rest: the cap is.
    for (let i = 0; i < 10; i += 1) {
      synth.ctx.advance(0.1);
      bank.play('enemy.hit');
    }
    expect(bank.active.size).toBeLessThanOrEqual(MAX_VOICES);
  });

  it('is silent, not broken, when a file is missing', async () => {
    const synth = fakeSynth();
    const bank = new AudioSamples(synth);
    const id = 'tower.mortar';
    bank.missing.add(AUDIO_LIBRARY[id].file);
    expect(bank.play(id)).toBe(false);
    expect(synth.started.length).toBe(0);
  });

  it('does nothing at all before the gesture creates a context', () => {
    const bank = new AudioSamples({ ctx: null, muted: false, sfx: null });
    expect(bank.play('ui.click')).toBe(false);
  });

  it('stays silent while muted', () => {
    const synth = fakeSynth();
    synth.muted = true;
    const bank = new AudioSamples(synth);
    primed(bank, AUDIO_LIBRARY['ui.click'].file);
    expect(bank.play('ui.click')).toBe(false);
  });

  it('ignores an unknown id rather than throwing', () => {
    const bank = new AudioSamples(fakeSynth());
    expect(bank.play('does.not.exist')).toBe(false);
  });

  it('loads each file exactly once even when ten towers ask together', async () => {
    const synth = fakeSynth();
    const caller = [];
    globalThis.fetch = vi.fn(async () => {
      caller.push(1);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    const bank = new AudioSamples(synth);
    await Promise.all(Array.from({ length: 10 }, () => bank.load('towers/tower_mortar.ogg')));
    expect(caller.length).toBe(1);
    expect(bank.loadedCount).toBe(1);
  });
});

describe('the track director', () => {
  it('reports a state with no track as missing', () => {
    const director = new TrackDirector(fakeSynth());
    expect(director.play('defeat')).toBe('missing');
    expect(director.play('nonsense')).toBe('missing');
  });

  it('reports pending before the file has decoded, and starts it after', async () => {
    const synth = fakeSynth();
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const director = new TrackDirector(synth);
    expect(director.play('battle')).toBe('pending');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(director.playing).toBe('battle');
    expect(director.play('battle'), 'asking again is a no-op').toBe('playing');
  });

  it('marks a broken file missing and never retries it', async () => {
    const synth = fakeSynth();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const director = new TrackDirector(synth);
    director.play('boss');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(director.isMissing('boss')).toBe(true);
    expect(director.play('boss')).toBe('missing');
  });

  it('fades the previous track out when the new state has no recording', async () => {
    const synth = fakeSynth();
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const director = new TrackDirector(synth);
    director.play('victory');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(director.playing).toBe('victory');
    // Defeat ships no recording: the win theme must not carry into the loss card.
    expect(director.play('defeat')).toBe('missing');
    expect(director.playing).toBeNull();
    expect(director.voice, 'the stale voice is released, not left running').toBeNull();
  });

  it('stops cleanly and can start again', async () => {
    const synth = fakeSynth();
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const director = new TrackDirector(synth);
    director.play('menu');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(director.playing).toBe('menu');
    director.stop(0);
    expect(director.playing).toBeNull();
    expect(director.play('menu')).toBe('playing');
  });
});
