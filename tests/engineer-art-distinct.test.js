import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ENGINEER_LINES } from '../src/data/engineerDefenses.js';
import { ENGINEER_ART } from '../src/data/engineerTowerArt.js';
import { projectileArtFor } from '../src/data/projectileArt.js';
import { readPngAlpha, silhouetteDifferenceAnchored } from './helpers/png.js';

/**
 * The complaint this file guards against, in the user's words: the five engineer
 * defences "magkakamukha ng itsura" — looked the same — and did not match their
 * names. Every line shared one generic keep and differed only in pennant colour,
 * so at 64 px the Crossbow and the Harpoon Winch were the same grey tower.
 *
 * `engineer-defenses.test.js` already checks that the *canvas* grows with the
 * tier. Canvas size is not shape: art can grow by four pixels and keep the exact
 * same drawing. These tests read the alpha channel of the generated PNGs and
 * assert that the ink actually moves — across lines at level 1, and between
 * consecutive upgrades.
 *
 * All comparisons are bottom-centre anchored (`silhouetteDifferenceAnchored`)
 * because a tower stands on the tile's ground line; comparing from the top-left
 * would count the transparent margin of the narrower sprite as difference.
 * `band: 0.55` measures only the crown — the part that says *which building*
 * this is — since the straight masonry shaft below it is the deliberate family
 * resemblance.
 */

const TOWER_DIR = path.resolve(process.cwd(), 'public/assets/towers');
const PROJ_DIR = path.resolve(process.cwd(), 'public/assets/projectiles');
const CARD_DIR = path.resolve(process.cwd(), 'public/assets/ui');
const SLOTS = ['lvl1', 'lvl2', 'spec-a', 'spec-b', 'spec-a2', 'spec-b2', 'spec-a3', 'spec-b3'];

const file = (line, slot) => `base_${line}${slot === 'lvl1' ? '' : `-${slot}`}.png`;
const maskOf = (dir, name) => readPngAlpha(path.join(dir, name));

describe('the five engineer defences are five buildings', () => {
  it('gives every pair of lines a different crown at level 1', () => {
    for (let i = 0; i < ENGINEER_LINES.length; i += 1) {
      for (let j = i + 1; j < ENGINEER_LINES.length; j += 1) {
        const a = ENGINEER_LINES[i];
        const b = ENGINEER_LINES[j];
        const difference = silhouetteDifferenceAnchored(
          maskOf(TOWER_DIR, file(a, 'lvl1')),
          maskOf(TOWER_DIR, file(b, 'lvl1')),
          { band: 0.55 }
        );
        // Measured at the time of writing: 0.218 (Gatling vs Flamer) to 0.645.
        // Not one pair of paint jobs gets near this.
        expect(difference, `${a} and ${b} share a silhouette`).toBeGreaterThan(0.15);
      }
    }
  });

  it('stops the five lines sharing one dock icon', () => {
    for (let i = 0; i < ENGINEER_LINES.length; i += 1) {
      for (let j = i + 1; j < ENGINEER_LINES.length; j += 1) {
        const a = ENGINEER_LINES[i];
        const b = ENGINEER_LINES[j];
        const difference = silhouetteDifferenceAnchored(
          maskOf(CARD_DIR, `card_${a}.png`),
          maskOf(CARD_DIR, `card_${b}.png`)
        );
        // Measured 0.240–0.456. The old cards were the same keep: ~0.01.
        expect(difference, `${a} and ${b} share a dock card`).toBeGreaterThan(0.15);
      }
    }
  });

  it('moves the silhouette at every upgrade along both branches', () => {
    const chains = [
      ['lvl1', 'lvl2', 'spec-a', 'spec-a2', 'spec-a3'],
      ['lvl1', 'lvl2', 'spec-b', 'spec-b2', 'spec-b3'],
    ];
    for (const line of ENGINEER_LINES) {
      for (const chain of chains) {
        for (let i = 1; i < chain.length; i += 1) {
          const difference = silhouetteDifferenceAnchored(
            maskOf(TOWER_DIR, file(line, chain[i - 1])),
            maskOf(TOWER_DIR, file(line, chain[i])),
            { band: 0.6 }
          );
          expect(
            difference,
            `${line} ${chain[i - 1]} → ${chain[i]} is a recolour, not an upgrade`
          ).toBeGreaterThan(0.1);
        }
      }
    }
  });

  it('keeps every tier small enough that the upgrade label clears its neighbours', () => {
    // The screenshot that started this sprint: 335 / 180 / 160 / 90 badges
    // overlapping because a spec-b3 keep was 118 px wide on a 64 px tile.
    for (const line of ENGINEER_LINES) {
      for (const slot of SLOTS) {
        const art = ENGINEER_ART[line][slot];
        expect(art.width, `${line}.${slot} too wide`).toBeLessThanOrEqual(72);
        expect(art.height, `${line}.${slot} too tall`).toBeLessThanOrEqual(130);
        expect(existsSync(path.join(TOWER_DIR, art.base))).toBe(true);
      }
    }
  });

  it('mounts the weapon on the crown instead of floating it', () => {
    // `mount` is measured from each drawing's own ground line; the old table
    // hard-coded `height - 30`, which drifted as soon as a canvas changed size.
    // The deck sits just under the crown, so the pivot lands at ~47 % of the
    // art's height for every line and tier (41/84 … 61/129 measured).
    for (const line of ENGINEER_LINES) {
      for (const slot of SLOTS) {
        const art = ENGINEER_ART[line][slot];
        const ratio = art.mount / art.height;
        expect(ratio, `${line}.${slot} weapon is off the deck`).toBeGreaterThan(0.35);
        expect(ratio, `${line}.${slot} weapon is buried`).toBeLessThan(0.65);
      }
    }
  });
});

describe('engineer shots grow with the tower', () => {
  // The base lines already swapped projectile art at level 4 and 5; the five
  // engineer lines kept their level-1 bolt all the way to the apex, so the last
  // two upgrades were invisible in flight.
  it('ships a heavier round for tier 4 and a different one again for tier 5', () => {
    for (const line of ENGINEER_LINES) {
      const four = projectileArtFor(line, 4);
      const five = projectileArtFor(line, 5);
      expect(four, `${line} has no tier-4 shot`).toBeTruthy();
      expect(five, `${line} has no tier-5 shot`).toBeTruthy();
      expect(four).not.toBe(five);
      for (const key of [four, five]) {
        expect(existsSync(path.join(PROJ_DIR, `${key}.png`)), key).toBe(true);
      }
      const difference = silhouetteDifferenceAnchored(
        maskOf(PROJ_DIR, `${four}.png`),
        maskOf(PROJ_DIR, `${five}.png`)
      );
      expect(difference, `${line}: the apex shot is a recolour`).toBeGreaterThan(0.1);
    }
  });

  it('never gives two lines the same tier-4 shot', () => {
    const keys = ENGINEER_LINES.map((line) => projectileArtFor(line, 4));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
