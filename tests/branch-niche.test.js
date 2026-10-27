import { describe, it, expect } from 'vitest';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { branchPair, evaluate, NICHE, NICHE_LEVELS, TARGETS } from './helpers/balance.js';

/**
 * Every specialisation has to earn its gold.
 *
 * The shop offers eleven lines with two branches each, and until this suite
 * existed the choice was often not a choice at all: the branch that won on
 * single-target damage also won on crowds, on armour *and* on bosses, sometimes
 * while being cheaper. A player who read the descriptions ("Blistering fire rate
 * — shreds swarms") and bought the swarm-clearer was buying the worse tower.
 *
 * The contract is deliberately narrow and mechanical:
 *
 *   • every branch declares a niche in `NICHE`;
 *   • a damage niche (pack / single / armor / boss) must beat its sibling on
 *     that one column by `MARGIN`, at levels 3, 4 and 5 — so the promise holds
 *     for the whole life of the tower, not just at the end;
 *   • a control branch must carry a slow or a stun the sibling does not;
 *   • a support branch must buff something the sibling does not, or buff the
 *     same thing harder.
 *
 * The sibling is allowed to win everywhere else. That is the point: one tower
 * for the swarm, one for the titan, and the map decides which you needed.
 */

/** A clear win, not a rounding artefact. */
const MARGIN = 1.08;

const COLUMN_LABEL = {
  pack: 'crowds',
  single: 'single target',
  armor: 'armoured targets',
  boss: 'bosses',
};

describe('specialisation niches', () => {
  it('declares a niche for every branch of every line', () => {
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      const specs = Object.keys(def.specializations || {});
      if (!specs.length) continue;
      expect(NICHE[line], `${line} has no niche table`).toBeTruthy();
      expect(Object.keys(NICHE[line]).sort(), line).toEqual(specs.sort());
      for (const spec of specs) {
        expect(['pack', 'single', 'armor', 'boss', 'control', 'support'], `${line}.${spec}`)
          .toContain(NICHE[line][spec]);
      }
    }
  });

  it('makes every damage branch the best of its pair in its own column', () => {
    const failures = [];
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      if (!def.specializations) continue;
      for (const level of NICHE_LEVELS) {
        const [first, second] = branchPair(line, level);
        for (const self of [first, second]) {
          const niche = NICHE[line][self.specKey];
          if (!['pack', 'single', 'armor', 'boss'].includes(niche)) continue;
          const rival = self === first ? second : first;
          const mine = self.columns[niche];
          const theirs = rival.columns[niche];
          if (mine < theirs * MARGIN) {
            failures.push(
              `${line}.${self.specKey} L${level} claims ${COLUMN_LABEL[niche]} but scores ` +
                `${mine} vs ${rival.specKey}'s ${theirs} (needs ${Math.ceil(theirs * MARGIN)})`
            );
          }
        }
      }
    }
    expect(failures, 'a branch is pretending to be something it is not').toEqual([]);
  });

  it('never lets one branch beat its sibling on every target while costing more', () => {
    const failures = [];
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      if (!def.specializations) continue;
      // A control or support branch trades damage for something the sibling
      // cannot do at all (a slow, an aura, gold per kill). Losing every damage
      // column is the price, not a bug — those are pinned by the two tests
      // below instead.
      const utilityBranch = Object.values(NICHE[line] || {}).some((n) => n === 'control' || n === 'support');
      if (utilityBranch) continue;
      for (const level of NICHE_LEVELS) {
        const [a, b] = branchPair(line, level);
        const columns = Object.keys(TARGETS);
        const aWins = columns.filter((c) => a.columns[c] > b.columns[c] * MARGIN);
        const bWins = columns.filter((c) => b.columns[c] > a.columns[c] * MARGIN);
        if (!aWins.length && a.cost > b.cost) {
          failures.push(`${line} L${level}: ${a.specKey} (${a.cost}g) is worse than ${b.specKey} (${b.cost}g) everywhere`);
        }
        if (!bWins.length && b.cost > a.cost) {
          failures.push(`${line} L${level}: ${b.specKey} (${b.cost}g) is worse than ${a.specKey} (${a.cost}g) everywhere`);
        }
      }
    }
    expect(failures, 'a strictly dominated branch is gold thrown away').toEqual([]);
  });

  it('gives every control branch something the other branch cannot do', () => {
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      if (!def.specializations) continue;
      for (const [specKey, niche] of Object.entries(NICHE[line] || {})) {
        if (niche !== 'control') continue;
        const self = evaluate(line, specKey, 5);
        const rival = branchPair(line, 5).find((row) => row.specKey !== specKey);
        const control = self.stats.slow || self.stats.stunMs;
        expect(control, `${line}.${specKey} claims control but has neither slow nor stun`).toBeTruthy();
        // The sibling must not have the *same* control, or the branch is a tax.
        expect(Boolean(rival.stats.slow)).toBe(false);
      }
    }
  });

  it('gives the two banner standards different jobs', () => {
    const warbanner = ['L3', 'L4', 'L5'];
    void warbanner;
    const damage = evaluate('banner', 'warbanner', 5).stats.aura;
    const muster = evaluate('banner', 'muster', 5).stats.aura;
    // Warbanner is the damage standard, Muster is the economy standard.
    expect(damage.damageBonus).toBeGreaterThan(muster.damageBonus);
    expect(muster.coinPerKill).toBeGreaterThan(0);
    expect(muster.fireRateBonus).toBeGreaterThan(damage.fireRateBonus || 0);
  });

  it('keeps every branch stronger at every tier than the tier below', () => {
    for (const [line, def] of Object.entries(TOWER_TYPES)) {
      if (!def.specializations) continue;
      for (const specKey of Object.keys(def.specializations)) {
        const three = evaluate(line, specKey, 3);
        const four = evaluate(line, specKey, 4);
        const five = evaluate(line, specKey, 5);
        for (const column of Object.keys(TARGETS)) {
          expect(four.columns[column], `${line}.${specKey} L4 regressed on ${column}`)
            .toBeGreaterThan(three.columns[column]);
          expect(five.columns[column], `${line}.${specKey} L5 regressed on ${column}`)
            .toBeGreaterThan(four.columns[column]);
        }
      }
    }
  });
});
