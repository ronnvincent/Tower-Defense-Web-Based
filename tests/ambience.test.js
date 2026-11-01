/**
 * The ambience map: every place the player can stand must have a bed, and every
 * bed must be a layer the director can actually build.
 */

import { describe, expect, it } from 'vitest';
import {
  AMBIENCE_FOR,
  AMBIENCE_LAYERS,
  ambienceFor,
} from '../src/rendering/AmbienceDirector.js';
import { LANDMARKS } from '../src/data/worldMap.js';

describe('Ambience — places', () => {
  it('gives the open map wind and birds', () => {
    expect(ambienceFor(null)).toEqual(['wind', 'birds']);
    expect(ambienceFor(undefined)).toEqual(['wind', 'birds']);
    expect(ambienceFor('realm')).toEqual(['wind', 'birds']);
  });

  it('gives the forge fire and hammering, and the shrine water and a portal', () => {
    expect(ambienceFor('forge')).toEqual(['fire', 'hammer']);
    expect(ambienceFor('shrine')).toEqual(['water', 'portal']);
  });

  it('maps every landmark panel to a bed (no silent building)', () => {
    for (const landmark of LANDMARKS) {
      expect(AMBIENCE_FOR, `${landmark.id} panel ${landmark.panel} has no ambience`).toHaveProperty(
        landmark.panel
      );
    }
  });

  it('only ever names layers the director can build', () => {
    for (const [place, layers] of Object.entries(AMBIENCE_FOR)) {
      for (const layer of layers) {
        expect(AMBIENCE_LAYERS, `${place} asks for unknown layer ${layer}`).toContain(layer);
      }
    }
  });

  it('falls back to the realm for a place it has never heard of', () => {
    expect(ambienceFor('atlantis')).toEqual(['wind', 'birds']);
  });

  it('leaves the result screens to the music', () => {
    expect(ambienceFor('victory')).toEqual([]);
    expect(ambienceFor('defeat')).toEqual([]);
  });

  it('returns a fresh array, so a caller cannot edit the table', () => {
    const layers = ambienceFor('forge');
    layers.push('portal');
    expect(ambienceFor('forge')).toEqual(['fire', 'hammer']);
  });
});
