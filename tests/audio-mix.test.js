/**
 * The audio mixer.
 *
 * Until this pass the whole game shared one `volume` scalar: music and effects
 * could not be balanced, and every method folded that scalar into its own
 * envelope. These tests pin the four-bus model and the save format, including
 * the migration from the old single-value save — a profile that had already
 * turned the sound down must keep its loudness.
 */

import { describe, expect, it } from 'vitest';
import {
  AUDIO_BUSES,
  AudioSynth,
  DEFAULT_LEVELS,
  normalizeLevels,
} from '../src/rendering/AudioSynth.js';
import { STORAGE_KEYS } from '../src/config/gameConfig.js';
import { createMemoryStorage, readJSON, writeJSON } from '../src/utils/storage.js';

function synthWith(settings) {
  const storage = createMemoryStorage();
  if (settings) writeJSON(storage, STORAGE_KEYS.settings, settings);
  return { synth: new AudioSynth({ storage }), storage };
}

const persisted = (storage) => readJSON(storage, STORAGE_KEYS.settings).value;

describe('Audio mixer — levels', () => {
  it('starts from the documented defaults', () => {
    const { synth } = synthWith();
    expect(synth.volumes).toEqual({ ...DEFAULT_LEVELS });
    expect(synth.muted).toBe(false);
  });

  it('has exactly four buses, master first', () => {
    expect([...AUDIO_BUSES]).toEqual(['master', 'music', 'sfx', 'ambient']);
  });

  it('migrates the pre-mixer single volume into the master fader', () => {
    const { synth } = synthWith({ muted: true, volume: 0.25 });
    expect(synth.volumes.master).toBe(0.25);
    expect(synth.muted).toBe(true);
    // The other buses were never stored, so they keep their defaults.
    expect(synth.volumes.music).toBe(DEFAULT_LEVELS.music);
    expect(synth.volumes.sfx).toBe(DEFAULT_LEVELS.sfx);
  });

  it('clamps out-of-range and ignores junk instead of going silent', () => {
    expect(normalizeLevels({ master: 4 }).master).toBe(1);
    expect(normalizeLevels({ music: -2 }).music).toBe(0);
    expect(normalizeLevels({ sfx: 'loud' }).sfx).toBe(DEFAULT_LEVELS.sfx);
    expect(normalizeLevels({ ambient: null }).ambient).toBe(DEFAULT_LEVELS.ambient);
    // A deliberate zero is a real value, not a missing one.
    expect(normalizeLevels({ ambient: 0 }).ambient).toBe(0);
  });

  it('persists every change, on the bus that was changed', () => {
    const { synth, storage } = synthWith();
    synth.setBusVolume('music', 0.2);
    expect(synth.volumes.music).toBe(0.2);
    expect(persisted(storage).volumes).toEqual({ ...DEFAULT_LEVELS, music: 0.2 });
    expect(persisted(storage).muted).toBe(false);
  });

  it('ignores an unknown bus and a non-numeric level', () => {
    const { synth, storage } = synthWith();
    const before = synth.volumes;
    synth.setBusVolume('reverb', 0.9);
    synth.setBusVolume('music', Number.NaN);
    expect(synth.volumes).toEqual(before);
    // …and it does not write a broken record either.
    expect(persisted(storage)?.volumes).toBeUndefined();
  });

  it('keeps `setVolume` working as the master alias', () => {
    const { synth, storage } = synthWith();
    synth.setVolume(0.33);
    expect(synth.volumes.master).toBe(0.33);
    expect(synth.volume).toBe(0.33);
    expect(persisted(storage).volumes.master).toBe(0.33);
  });

  it('persists mute and keeps the faders untouched', () => {
    const { synth, storage } = synthWith();
    synth.setBusVolume('sfx', 0.4);
    expect(synth.toggleMute()).toBe(true);
    expect(persisted(storage)).toEqual({
      muted: true,
      volumes: { ...DEFAULT_LEVELS, sfx: 0.4 },
    });
    expect(synth.toggleMute()).toBe(false);
  });

  it('hands out a copy, so callers cannot reach into the mix', () => {
    const { synth } = synthWith();
    const volumes = synth.volumes;
    volumes.master = 0;
    expect(synth.volumes.master).toBe(DEFAULT_LEVELS.master);
  });

  it('survives a corrupt settings record', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.settings, '{not json');
    const synth = new AudioSynth({ storage });
    expect(synth.volumes).toEqual({ ...DEFAULT_LEVELS });
  });

  it('does nothing dangerous without an AudioContext (node, SSR)', () => {
    const { synth } = synthWith();
    expect(synth.context).toBeNull();
    expect(() => synth.applyGains()).not.toThrow();
    expect(() => synth.playClick()).not.toThrow();
    expect(() => synth.unlock()).not.toThrow();
  });
});
