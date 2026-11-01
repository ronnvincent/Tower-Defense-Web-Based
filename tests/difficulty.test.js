// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_KEY,
  difficultyFor,
  difficultyMultiplierLabel,
  difficultyShortLabel,
  DifficultyStore,
} from '../src/systems/Difficulty.js';
import { missionBriefingMarkup } from '../src/ui/MissionBriefingUI.js';
import { getLevel } from '../src/data/levelData.js';

/**
 * Difficulty presets.
 *
 * The specification fixes the numbers: Veteran is +25 % health / +15 % damage,
 * Nightmare +50 % / +30 %, and nothing else moves — gold and rewards stay the
 * same or a harder run would simply be a poorer run. These tests pin both the
 * table and the fact that the choice survives a reload without a migration.
 */

function fakeStorage() {
  const map = new Map();
  return {
    store: map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe('difficulty presets', () => {
  it('ships exactly the three specified presets, in order', () => {
    expect(DIFFICULTIES.map((preset) => preset.id)).toEqual(['normal', 'veteran', 'nightmare']);
    expect(DIFFICULTIES.map((preset) => preset.name)).toEqual(['Normal', 'Veteran', 'Nightmare']);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('uses the specified multipliers and touches nothing else', () => {
    const byId = Object.fromEntries(DIFFICULTIES.map((preset) => [preset.id, preset]));
    expect(byId.normal.healthScale).toBe(1);
    expect(byId.normal.damageScale).toBe(1);
    expect(byId.veteran.healthScale).toBe(1.25);
    expect(byId.veteran.damageScale).toBe(1.15);
    expect(byId.nightmare.healthScale).toBe(1.5);
    expect(byId.nightmare.damageScale).toBe(1.3);
    // Gold is deliberately absent: a harder run must not be a poorer run.
    for (const preset of DIFFICULTIES) {
      expect(preset).not.toHaveProperty('goldScale');
      expect(preset).not.toHaveProperty('rewardScale');
    }
  });

  it('falls back to Normal for anything unknown', () => {
    expect(difficultyFor('veteran').id).toBe('veteran');
    expect(difficultyFor('impossible').id).toBe('normal');
    expect(difficultyFor(undefined).id).toBe('normal');
    expect(difficultyFor(null).id).toBe('normal');
  });

  it('labels the multipliers without trailing zeroes', () => {
    expect(difficultyMultiplierLabel('normal')).toBe('Health ×1 · Damage ×1');
    expect(difficultyMultiplierLabel('veteran')).toBe('Health ×1.25 · Damage ×1.15');
    expect(difficultyShortLabel('nightmare')).toBe('×1.5 HP · ×1.3 DMG');
  });
});

describe('DifficultyStore', () => {
  it('starts on Normal when nothing is stored', () => {
    const store = new DifficultyStore({ storage: fakeStorage() });
    expect(store.id).toBe('normal');
    expect(store.preset.name).toBe('Normal');
  });

  it('persists the choice under its own versioned key', () => {
    const storage = fakeStorage();
    const store = new DifficultyStore({ storage });
    store.set('nightmare');
    expect(store.id).toBe('nightmare');
    expect(JSON.parse(storage.store.get(DIFFICULTY_KEY))).toEqual({ id: 'nightmare' });
    // A fresh store — the next page load — reads it back.
    expect(new DifficultyStore({ storage }).id).toBe('nightmare');
  });

  it('ignores corrupt or forged saves instead of throwing', () => {
    const storage = fakeStorage();
    storage.setItem(DIFFICULTY_KEY, '{not json');
    expect(new DifficultyStore({ storage }).id).toBe('normal');
    storage.setItem(DIFFICULTY_KEY, JSON.stringify({ id: 'godmode' }));
    expect(new DifficultyStore({ storage }).id).toBe('normal');
    storage.setItem(DIFFICULTY_KEY, JSON.stringify('veteran'));
    expect(new DifficultyStore({ storage }).id).toBe('normal');
  });

  it('survives a storage that refuses to write', () => {
    const store = new DifficultyStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
    });
    expect(() => store.set('veteran')).not.toThrow();
    expect(store.id).toBe('veteran');
  });

  it('normalises an unknown set() target before storing it', () => {
    const storage = fakeStorage();
    const store = new DifficultyStore({ storage });
    store.set('bogus');
    expect(store.id).toBe('normal');
    expect(JSON.parse(storage.store.get(DIFFICULTY_KEY))).toEqual({ id: 'normal' });
  });
});

describe('briefing difficulty picker', () => {
  const level = getLevel('level-1');
  const progress = { starsFor: () => 0, bestScoreFor: () => 0, profile: {} };

  it('renders one button per preset with the stored one pressed', () => {
    const html = missionBriefingMarkup(level, progress, { state: 'open', difficulty: 'veteran' });
    expect(html.match(/data-wm-difficulty=/g)).toHaveLength(3);
    expect(html).toContain('data-wm-difficulty="normal" aria-pressed="false"');
    expect(html).toContain('data-wm-difficulty="veteran" aria-pressed="true"');
    expect(html).toContain('data-wm-difficulty="nightmare" aria-pressed="false"');
    // The summary line names the preset that is actually in force.
    expect(html).toContain('Veteran');
    expect(html).toContain('×1.25 HP · ×1.15 DMG');
  });

  it('does not offer a preset on a locked stage', () => {
    const html = missionBriefingMarkup(level, progress, { state: 'locked', difficulty: 'normal' });
    expect(html).not.toContain('data-wm-difficulty=');
    expect(html).toMatch(/id="wm-deploy"[^>]*disabled/);
  });

  it('still renders on a store-less caller, on Normal', () => {
    const html = missionBriefingMarkup(level, progress, { state: 'open' });
    expect(html).toContain('data-wm-difficulty="normal" aria-pressed="true"');
    expect(html).toContain('×1 HP · ×1 DMG');
  });
});
