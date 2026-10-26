/**
 * The gesture rule and the screen wiring.
 *
 * Browsers refuse to start audio before an interaction, so the director has to
 * remember what was asked for and start it on the first tap *and* recover when
 * a phone suspends the context in the background. These tests use a fake synth:
 * the real one needs a browser, and what is worth pinning here is the policy,
 * not the oscillators.
 */

import { describe, expect, it, vi } from 'vitest';
import { AudioDirector } from '../src/rendering/audioDirector.js';

function fakeSynth() {
  return {
    ctx: null,
    context: null,
    volumes: { master: 0.8, music: 0.5, sfx: 0.85, ambient: 0.45 },
    muted: false,
    unlock: vi.fn(),
  };
}

describe('AudioDirector — the gesture rule', () => {
  it('arms without a window (node, SSR) and without throwing', () => {
    const director = new AudioDirector(fakeSynth());
    expect(() => director.arm()).not.toThrow();
    expect(director.armed).toBe(false); // no window, nothing to listen to
  });

  it('remembers the scene before the first gesture, then plays it', () => {
    const synth = fakeSynth();
    const director = new AudioDirector(synth);
    director.setScene('battle');
    expect(director.state.scene).toBe('battle');
    expect(director.music.playing).toBeNull(); // not started yet

    director.start();
    expect(synth.unlock).toHaveBeenCalledTimes(1);
    expect(director.started).toBe(true);
    // Still no AudioContext in node, so the request waits — but it is kept.
    expect(director.music.wanted).toBe('battle');
  });

  it('is idempotent: a second gesture does not restart anything', () => {
    const synth = fakeSynth();
    const director = new AudioDirector(synth);
    director.start();
    director.start();
    expect(synth.unlock).toHaveBeenCalledTimes(1);
  });

  it('tracks the location independently of the scene', () => {
    const director = new AudioDirector(fakeSynth());
    director.setScene('realm');
    director.setLocation('forge');
    expect(director.state.scene).toBe('realm');
    expect(director.state.location).toBe('forge');
    director.setLocation(null);
    expect(director.state.location).toBeNull();
  });

  it('reports the mix without exposing it', () => {
    const synth = fakeSynth();
    const director = new AudioDirector(synth);
    const state = director.state;
    expect(state.volumes.master).toBe(0.8);
    expect(state.muted).toBe(false);
    expect(state.unlocked).toBe(false);
    state.volumes.master = 0;
    expect(synth.volumes.master).toBe(0.8);
  });
});
