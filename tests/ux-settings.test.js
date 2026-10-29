// @vitest-environment jsdom
// The three field switches, and the one thing that can silently eat them: the
// settings record has two writers (the mixer and this module), so a fader move
// must not reset the switches and vice versa.
import { describe, it, expect, beforeEach } from 'vitest';
import { UxSettings, UX_DEFAULTS, normalizeUx } from '../src/config/uxSettings.js';
import { STORAGE_KEYS } from '../src/config/gameConfig.js';
import { createMemoryStorage } from '../src/utils/storage.js';
import { AudioSynth } from '../src/rendering/AudioSynth.js';

const read = (storage) => JSON.parse(storage.getItem(STORAGE_KEYS.settings) || '{}');

describe('normalizeUx', () => {
  it('gives every switch a safe default', () => {
    expect(normalizeUx()).toEqual(UX_DEFAULTS);
    expect(normalizeUx(null)).toEqual(UX_DEFAULTS);
    expect(normalizeUx('nonsense')).toEqual(UX_DEFAULTS);
  });

  it('accepts booleans and the obvious hand-edited strings', () => {
    expect(normalizeUx({ shake: false, damageNumbers: 'false', colourAssist: 1 })).toEqual({
      shake: false,
      damageNumbers: false,
      colourAssist: true,
    });
  });

  it('ignores keys it does not own', () => {
    expect(normalizeUx({ mastery: true })).toEqual(UX_DEFAULTS);
  });
});

describe('UxSettings', () => {
  let storage;
  let root;
  beforeEach(() => {
    storage = createMemoryStorage();
    root = { dataset: {} };
  });

  it('reads what a previous session saved', () => {
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ muted: true, volumes: { master: 0.2 }, ux: { shake: false } }),
    );
    const ux = new UxSettings({ storage, root });
    expect(ux.get('shake')).toBe(false);
    expect(ux.get('damageNumbers')).toBe(true);
  });

  it('persists a switch without dropping the mixer’s fields', () => {
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ muted: true, volumes: { master: 0.2 }, ux: {} }),
    );
    const ux = new UxSettings({ storage, root });
    const result = ux.set('shake', false);
    expect(result.changed).toBe(true);
    const record = read(storage);
    expect(record.ux.shake).toBe(false);
    expect(record.muted).toBe(true);
    expect(record.volumes.master).toBe(0.2);
  });

  it('reports a no-op set as unchanged and does not notify', () => {
    const ux = new UxSettings({ storage, root });
    let calls = 0;
    ux.subscribe(() => {
      calls += 1;
    });
    expect(ux.set('shake', true).changed).toBe(false);
    expect(ux.toggle('shake').changed).toBe(true);
    expect(calls).toBe(1);
  });

  it('paints the switches on the document root', () => {
    const ux = new UxSettings({ storage, root });
    expect(root.dataset.uxShake).toBe('on');
    ux.set('shake', false);
    ux.set('colourAssist', true);
    expect(root.dataset.uxShake).toBe('off');
    expect(root.dataset.uxColour).toBe('on');
    expect(root.dataset.uxDamage).toBe('on');
  });

  it('keeps the switches when the mixer writes its own fields', () => {
    const ux = new UxSettings({ storage, root });
    ux.set('damageNumbers', false);
    // A fader move goes through the mixer, which used to overwrite the record.
    const synth = new AudioSynth({ storage });
    synth.setBusVolume('music', 0.3);
    const record = read(storage);
    expect(record.ux.damageNumbers).toBe(false);
    expect(record.volumes.music).toBe(0.3);
  });
});
