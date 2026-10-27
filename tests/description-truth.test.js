import { describe, it, expect } from 'vitest';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { ASCENSION } from '../src/data/towerAscension.js';

/**
 * The shop card must not lie about the tower.
 *
 * Every tier ships a `description`, and the description is the *only* thing a
 * player reads before spending gold. When the numbers were rebalanced after the
 * niche pass, five of them kept quoting the old stat: the Thunderforge
 * advertised a 100 px shockwave while firing a 72 px one, the Twin Repeater sold
 * "175 DPS" at 258, the Titan Breaker promised 480 damage and dealt 545. None of
 * that fails a type check, and none of it is visible in a screenshot of the
 * damage — it is just a shop that lies.
 *
 * The rule is narrow on purpose. A description that quotes a number for a stat
 * the same object carries has to agree with it; anything else is prose and is
 * left alone.
 */

/** Every tier object of every line, with a readable name. */
function tiers() {
  const out = [];
  for (const [line, def] of Object.entries(TOWER_TYPES)) {
    for (const level of def.levels || []) {
      out.push({ name: `${line} L${level.level}`, text: level.description, stats: level });
    }
    for (const [specKey, spec] of Object.entries(def.specializations || {})) {
      out.push({ name: `${line}.${specKey}`, text: spec.description, stats: spec });
      const asc = ASCENSION[line]?.[specKey];
      if (!asc) continue;
      out.push({ name: `${line}.${specKey} L4`, text: asc.elite?.description, stats: asc.elite });
      out.push({ name: `${line}.${specKey} L5`, text: asc.apex?.description, stats: asc.apex });
    }
  }
  return out;
}

describe('tower descriptions match their numbers', () => {
  it('quotes the real blast radius whenever it mentions a radius', () => {
    const wrong = [];
    for (const { name, text, stats } of tiers()) {
      const quoted = /(\d+)\s?px/i.exec(text || '');
      if (!quoted || stats.splash === undefined) continue;
      if (Number(quoted[1]) !== stats.splash) {
        wrong.push(`${name}: says ${quoted[1]}px, fires ${stats.splash}px`);
      }
    }
    expect(wrong, 'the card advertises a blast the tower does not have').toEqual([]);
  });

  it('quotes the real armour break whenever it mentions one', () => {
    const wrong = [];
    for (const { name, text, stats } of tiers()) {
      // "strips 30 armour", "Breaks 40 armour", "Eats 30 armour", "shatters 32 armour"
      const quoted = /(?:strips|breaks|eats|shatters|softens|melts)\s+(\d+)\s+armou?r/i.exec(text || '');
      if (!quoted || stats.armorBreak === undefined) continue;
      if (Number(quoted[1]) !== stats.armorBreak) {
        wrong.push(`${name}: says ${quoted[1]} armour, breaks ${stats.armorBreak}`);
      }
    }
    expect(wrong, 'the card advertises an armour break the tower does not have').toEqual([]);
  });

  it('quotes the real damage whenever it opens with a raw damage figure', () => {
    const wrong = [];
    for (const { name, text, stats } of tiers()) {
      // Constructions like "545 damage and 40 armour off" or "420 damage in one bolt".
      const quoted = /(\d{3,4})\s+damage/i.exec(text || '');
      if (!quoted || stats.damage === undefined) continue;
      if (Number(quoted[1]) !== stats.damage) {
        wrong.push(`${name}: says ${quoted[1]} damage, deals ${stats.damage}`);
      }
    }
    expect(wrong, 'the card advertises damage the tower does not deal').toEqual([]);
  });

  it('gives every choice something to read', () => {
    // Levels 1-2 are named, not described: the shop card shows the line's own
    // `description` and the inspector shows `title`. The branches are the ones
    // the player picks from a menu, so those carry the prose.
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      for (const level of def.levels || []) {
        expect(level.title, `${line} L${level.level} has no title`).toBeTruthy();
      }
      for (const { name, text } of tiers()) {
        if (!name.startsWith(`${line}.`)) continue;
        expect(typeof text, `${name} has no description`).toBe('string');
        expect(text.length, `${name} has an empty description`).toBeGreaterThan(20);
      }
    }
  });
});
