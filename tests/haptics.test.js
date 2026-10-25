import { describe, it, expect, vi } from 'vitest';
import { HAPTIC_PATTERNS, HAPTIC_PREF_KEY, Haptics, readHapticPref } from '../src/systems/Haptics.js';

/**
 * Touch feedback is the one "juice" a desktop build never exercises. These
 * tests pin the three things that go wrong with vibration on the web: buzzing
 * without a platform that supports it, buzzing after the player muted it, and
 * buzzing a pattern long enough to read as an error dialog.
 */

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    dump: () => Object.fromEntries(store),
  };
}

describe('haptic preference', () => {
  it('defaults to the device: on for a thumb, off for a mouse', () => {
    expect(readHapticPref(true, memoryStorage())).toBe(true);
    expect(readHapticPref(false, memoryStorage())).toBe(false);
  });

  it('lets a stored choice win over the device default', () => {
    expect(readHapticPref(false, memoryStorage({ [HAPTIC_PREF_KEY]: '1' }))).toBe(true);
    expect(readHapticPref(true, memoryStorage({ [HAPTIC_PREF_KEY]: '0' }))).toBe(false);
  });

  it('survives a storage that throws (private mode)', () => {
    const hostile = {
      getItem() {
        throw new Error('denied');
      },
    };
    expect(readHapticPref(true, hostile)).toBe(true);
  });
});

describe('Haptics', () => {
  it('fires a short tick for a tap and nothing at all without a vibrating platform', () => {
    const vibrate = vi.fn();
    const onPhone = new Haptics({ navigatorRef: { vibrate }, storage: memoryStorage(), coarsePointer: true });
    expect(onPhone.tap('tap')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.tap);

    const onDesktop = new Haptics({ navigatorRef: {}, storage: memoryStorage(), coarsePointer: false });
    expect(onDesktop.supported).toBe(false);
    expect(onDesktop.tap('tap')).toBe(false);
  });

  it('stays silent once switched off, and remembers that', () => {
    const vibrate = vi.fn();
    const storage = memoryStorage();
    const haptics = new Haptics({ navigatorRef: { vibrate }, storage, coarsePointer: true });
    haptics.setEnabled(false);
    expect(haptics.tap('deny')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(storage.dump()[HAPTIC_PREF_KEY]).toBe('0');
  });

  it('keeps every pattern short enough to read as feedback', () => {
    for (const [kind, pattern] of Object.entries(HAPTIC_PATTERNS)) {
      const total = Array.isArray(pattern)
        ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
        : pattern;
      expect(total, `${kind} buzzes for ${total} ms`).toBeLessThan(120);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('falls back to a plain tick for an unknown kind', () => {
    const vibrate = vi.fn();
    const haptics = new Haptics({ navigatorRef: { vibrate }, storage: memoryStorage(), coarsePointer: true });
    expect(haptics.tap('nonsense')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.tap);
  });

  it('never throws when the platform rejects the call', () => {
    const haptics = new Haptics({
      navigatorRef: {
        vibrate() {
          throw new Error('blocked by policy');
        },
      },
      storage: memoryStorage(),
      coarsePointer: true,
    });
    expect(haptics.tap('build')).toBe(false);
  });
});
