/**
 * asset-manifest.test.js — the licence ledger must match the files on disk.
 *
 * `src/data/assetManifest.js` is what the final report and `docs/asset-manifest.md`
 * quote, so the point of this test is that a claim in it can be *wrong*: a path
 * that does not exist, a frame grid the PNG does not have, or an animation row
 * the pack never drew will fail here instead of shipping as documentation.
 *
 * The same checks run in `scripts/write_asset_manifest.mjs` (which also writes
 * the Markdown); this file is the one CI sees.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_PACKS,
  enemyAnimationReport,
  towerAnimationReport,
  effectTextureReport,
  animationGapSummary,
} from '../src/data/assetManifest.js';

const ROOT = process.cwd();
const abs = (rel) => path.join(ROOT, rel);

/** Width/height straight out of the PNG's IHDR chunk. */
function pngSize(file) {
  const buffer = fs.readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('the asset manifest', () => {
  it('names a licence and a source for every pack', () => {
    const ids = new Set();
    for (const pack of ASSET_PACKS) {
      expect(pack.id, 'pack id').toBeTruthy();
      expect(ids.has(pack.id), `duplicate pack id ${pack.id}`).toBe(false);
      ids.add(pack.id);
      expect(pack.name).toBeTruthy();
      expect(pack.license, `${pack.id} licence`).toBeTruthy();
      expect(typeof pack.attributionRequired, `${pack.id} attribution flag`).toBe('boolean');
      expect(pack.attribution, `${pack.id} attribution text`).toBeTruthy();
      // A pack with no upstream page must say why (project-owned, or a known gap).
      if (!pack.url) expect(pack.note, `${pack.id} has no url and no note`).toBeTruthy();
    }
    expect(ASSET_PACKS.length).toBeGreaterThanOrEqual(10);
  });

  it('ships only CC0 or project-owned art', () => {
    const allowed = new Set(['CC0-1.0', 'Project-owned']);
    for (const pack of ASSET_PACKS) {
      expect(allowed.has(pack.license), `${pack.id}: ${pack.license}`).toBe(true);
    }
  });

  it('matches every creature strip to its real nine-row grid', () => {
    const report = enemyAnimationReport();
    expect(report).toHaveLength(20);
    for (const entry of report) {
      const file = abs(entry.file);
      expect(fs.existsSync(file), `${entry.file} exists`).toBe(true);
      const size = pngSize(file);
      expect(size, `${entry.file} is a PNG`).toBeTruthy();
      // Rows are (clip + direction) * cols; 9 rows is what the packs ship.
      expect(size.height, `${entry.key} row count`).toBe(entry.frameHeight * 9);
      expect(size.width % entry.frameWidth, `${entry.key} frame width divides the sheet`).toBe(0);
      expect(entry.clips.idle).toBeGreaterThan(1);
      expect(entry.clips.move).toBeGreaterThan(1);
      expect(entry.clips.death).toBeGreaterThan(1);
    }
  });

  it('states the missing attack and hit rows instead of omitting them', () => {
    const gap = animationGapSummary();
    expect(gap.creatures).toBe(20);
    expect(gap.withIdle).toBe(20);
    expect(gap.withMove).toBe(20);
    expect(gap.withDeath).toBe(20);
    // The Spire packs do not draw these two clips. If that ever changes, the
    // manifest must change with it — this is the tripwire.
    expect(gap.missingAttack).toBe(20);
    expect(gap.missingHit).toBe(20);
  });

  it('matches every tower base + weapon strip', () => {
    const report = towerAnimationReport();
    // 11 lines x 8 visual slots (lvl1, lvl2, four spec-a, two spec-b aliases).
    expect(report.length).toBeGreaterThanOrEqual(80);
    for (const entry of report) {
      expect(fs.existsSync(abs(entry.base)), `${entry.base} exists`).toBe(true);
      const size = pngSize(abs(entry.weapon));
      expect(size, `${entry.weapon} is a PNG`).toBeTruthy();
      expect(size.height, `${entry.weapon} strip height`).toBe(entry.frameHeight);
      expect(size.width, `${entry.weapon} strip width`).toBe(entry.frameWidth * entry.frames);
      // The base is a static image; only the weapon is a strip.
      expect(entry.baseStatic).toBe(true);
      expect(entry.clips.fire).toBe(entry.frames);
      expect(entry.clips.rest).toBe(1);
    }
  });

  it('matches every projectile, impact and effect strip', () => {
    const effects = effectTextureReport();
    expect(effects.projectiles.length).toBeGreaterThanOrEqual(10);
    expect(effects.strips.length).toBeGreaterThanOrEqual(20);
    const files = new Set([...effects.projectiles, ...effects.impacts, ...effects.strips].map((e) => e.file));
    for (const file of files) {
      expect(fs.existsSync(abs(file)), `${file} exists`).toBe(true);
    }
  });

  it('keeps the generated document in step with the data', () => {
    const doc = abs('docs/asset-manifest.md');
    expect(fs.existsSync(doc), 'docs/asset-manifest.md exists').toBe(true);
    const text = fs.readFileSync(doc, 'utf8');
    expect(text).toContain('Asset Manifest');
    for (const pack of ASSET_PACKS) {
      expect(text, `doc names ${pack.name}`).toContain(pack.name);
    }
    const gap = animationGapSummary();
    expect(text).toContain(String(gap.missingAttack));
    expect(text).toContain('20 creature sheets ship idle, move and death.');
  });
});
