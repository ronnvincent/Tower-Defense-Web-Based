import { describe, it, expect } from 'vitest';
import { bossFor, enemyPreviewFor, startingFor, threatFor } from '../src/ui/MissionBriefingUI.js';
import { LEVELS, getLevel } from '../src/data/levelData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';

/**
 * The stage briefing is the last screen before a battle, so everything on it has
 * to come from the same data the battle boots with. These tests pin the facts
 * that were added for the bastion conversion — starting resources and the enemy
 * scout — against the level data itself.
 */

describe('briefing facts are derived from the level, never invented', () => {
  it('reports the purse and the bastion HP the run really starts with', () => {
    for (const level of LEVELS) {
      expect(startingFor(level)).toEqual({ gold: level.startingCoins, hp: level.baseHealth });
    }
    expect(startingFor(getLevel('level-1'))).toEqual({ gold: 300, hp: 20 });
  });

  it('lists only enemies the stage actually spawns', () => {
    for (const level of LEVELS) {
      const { names } = enemyPreviewFor(level);
      const real = new Set();
      for (const wave of level.waves) for (const group of wave.groups) real.add(ENEMY_TYPES[group.type].name);
      for (const name of names) expect(real.has(name), `${level.id} previews ${name}`).toBe(true);
    }
  });

  it('introduces them in wave order and counts the rest instead of hiding them', () => {
    const level = getLevel('level-1');
    const firstType = level.waves[0].groups[0].type;
    const { names, extra } = enemyPreviewFor(level, 3);
    expect(names[0]).toBe(ENEMY_TYPES[firstType].name);
    expect(names).toHaveLength(3);
    expect(extra).toBeGreaterThan(0);
    // Asking for everything gives everything, with nothing left over.
    const all = enemyPreviewFor(level, 99);
    expect(all.extra).toBe(0);
    expect(all.names.length).toBeGreaterThan(3);
  });

  it('names the boss from the enemy table and degrades safely', () => {
    expect(bossFor(getLevel('level-1'))).toBe(ENEMY_TYPES.warlord.name);
    expect(bossFor({ boss: 'not-a-creep' })).toBe('None');
    expect(bossFor({})).toBe('None');
  });

  it('derives the threat pips from the stage health scale', () => {
    expect(threatFor({ enemyHealthScale: 1 }).label).toBe('Light');
    expect(threatFor({ enemyHealthScale: 1.15 }).label).toBe('Steady');
    expect(threatFor({ enemyHealthScale: 1.3 }).label).toBe('Harsh');
    expect(threatFor({ enemyHealthScale: 1.45 }).label).toBe('Savage');
  });
});
