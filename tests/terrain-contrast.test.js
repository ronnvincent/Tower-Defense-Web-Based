import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * Battlefield readability audit.
 *
 * A lane and a pond have to separate from the ground they sit on, or the map
 * reads as one flat colour and the player loses the path. `scripts/terrain.py`
 * owns the palettes, so this suite asks the generator itself — deriving the
 * numbers a second way would let the two drift apart.
 *
 * The metric is a YCbCr distance, not a luminance delta: a saturated teal pond on
 * green grass sits at almost the same luma and is still instantly readable, so a
 * pure brightness test would reject palettes that look right and accept grey mud.
 */

const PY = process.env.PYTHON || 'python3';

function contrastTable() {
  const out = execFileSync(PY, ['scripts/terrain.py', '--contrast'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  return JSON.parse(out);
}

describe('terrain surface contrast', () => {
  const table = contrastTable();

  it('audits every battle map', () => {
    expect(Object.keys(table.themes).sort()).toEqual([
      'crystal',
      'desert',
      'grassland',
      'ice',
      'volcanic',
    ]);
  });

  it('keeps every lane readable against its own ground', () => {
    for (const [theme, surfaces] of Object.entries(table.themes)) {
      expect(surfaces.road, `${theme} lane too close to its ground`).toBeGreaterThanOrEqual(table.min);
    }
  });

  it('keeps every pond readable against its own ground', () => {
    for (const [theme, surfaces] of Object.entries(table.themes)) {
      expect(surfaces.water, `${theme} water too close to its ground`).toBeGreaterThanOrEqual(
        table.min
      );
    }
  });

  it('does not let two biomes share a surface palette', () => {
    const roads = Object.values(table.themes).map((s) => s.road);
    const water = Object.values(table.themes).map((s) => s.water);
    expect(new Set(roads).size).toBe(roads.length);
    expect(new Set(water).size).toBe(water.length);
  });
});
