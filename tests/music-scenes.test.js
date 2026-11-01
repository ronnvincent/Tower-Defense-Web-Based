/**
 * The music scenes are data, not samples: `MusicDirector` renders them with
 * oscillators. That makes them testable — a scene with a tempo of 0 or a
 * negative root would be audible nonsense, and a missing scene would leave a
 * screen silent.
 */

import { describe, expect, it } from 'vitest';
import {
  MUSIC_SCENES,
  MUSIC_SCENE_IDS,
  melodyOffset,
  musicScene,
  noteHz,
} from '../src/rendering/musicScenes.js';

describe('Music scenes — the catalogue', () => {
  it('covers every screen that asks for music', () => {
    // These are the ids `main.js` and `GameScene.setScene` call for.
    for (const id of ['menu', 'realm', 'battle', 'victory', 'defeat']) {
      expect(MUSIC_SCENE_IDS, `${id} has no scene`).toContain(id);
    }
    expect(MUSIC_SCENE_IDS.length).toBeGreaterThanOrEqual(7);
  });

  it('gives every scene a playable root, tempo, mode and mix level', () => {
    for (const [id, scene] of Object.entries(MUSIC_SCENES)) {
      expect(scene.id, id).toBe(id);
      expect(scene.root).toBeGreaterThan(40);
      expect(scene.root).toBeLessThan(400);
      expect(scene.tempo).toBeGreaterThanOrEqual(30);
      expect(scene.tempo).toBeLessThanOrEqual(180);
      expect(scene.chord.length).toBeGreaterThanOrEqual(3);
      // A mode is a set of small semitone offsets, ascending, inside an octave.
      expect(scene.scale.length).toBeGreaterThanOrEqual(5);
      expect(scene.scale[0]).toBe(0);
      for (let i = 1; i < scene.scale.length; i += 1) {
        expect(scene.scale[i]).toBeGreaterThan(scene.scale[i - 1]);
      }
      expect(Math.max(...scene.scale)).toBeLessThan(12);
      // Nothing is allowed to be loud enough to drown an effect.
      expect(scene.padGain).toBeGreaterThan(0);
      expect(scene.padGain).toBeLessThanOrEqual(0.25);
      expect(scene.bellGain).toBeLessThanOrEqual(0.15);
      expect(scene.bassGain).toBeLessThanOrEqual(0.2);
    }
  });

  it('only gives the battle a pulse, and the battle is the fastest scene', () => {
    const pulsing = Object.values(MUSIC_SCENES).filter((scene) => scene.pulse);
    expect(pulsing.map((scene) => scene.id)).toEqual(['battle']);
    const slowest = Math.min(...MUSIC_SCENE_IDS.map((id) => MUSIC_SCENES[id].tempo));
    expect(MUSIC_SCENES.battle.tempo).toBeGreaterThan(slowest * 1.5);
  });

  it('falls back to the realm rather than to silence', () => {
    expect(musicScene('nope')).toBe(MUSIC_SCENES.realm);
    expect(musicScene(undefined)).toBe(MUSIC_SCENES.realm);
  });
});

describe('Music scenes — notes', () => {
  it('treats semitones as equal temperament', () => {
    expect(noteHz(100, 0)).toBe(100);
    expect(noteHz(100, 12)).toBeCloseTo(200, 6);
    expect(noteHz(100, -12)).toBeCloseTo(50, 6);
  });

  it('keeps the melody inside the mode, two octaves up by default', () => {
    const scale = MUSIC_SCENES.realm;
    const offsets = new Set();
    for (let beat = 0; beat < 16; beat += 1) {
      const offset = melodyOffset(scale, beat);
      expect(offset).toBeGreaterThanOrEqual(24);
      expect(offset).toBeLessThan(36);
      offsets.add(offset);
    }
    // A phrase, not a drone: at least four different pitches across two bars.
    expect(offsets.size).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic — the menu has an identity', () => {
    for (let beat = 0; beat < 12; beat += 1) {
      expect(melodyOffset(MUSIC_SCENES.menu, beat)).toBe(melodyOffset(MUSIC_SCENES.menu, beat));
    }
  });

  it('drops an octave for the battle so the tune stays out of the effects', () => {
    const same = melodyOffset(MUSIC_SCENES.battle, 2, 1);
    expect(same).toBe(melodyOffset(MUSIC_SCENES.battle, 2, 2) - 12);
  });
});
