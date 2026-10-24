import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UI-kit contract tests.
 *
 * The whole skin is CSS `border-image` over ~28 generated sprites. Nothing in
 * the build fails if a URL is typo'd or a sprite is regenerated at the wrong
 * size — the page just renders a blank plate, or a 9-slice whose corners are
 * stretched into mush. These tests pin the parts that must not drift:
 *
 *   1. every asset URL in src/style.css and index.html exists,
 *   2. each sliced sprite keeps the pixel dimensions its slice assumes,
 *   3. the main menu still exposes every id src/main.js binds to,
 *   4. the retired "Cozy UI" demo pack is not referenced anywhere.
 */

const read = (p) => readFileSync(p, 'utf8');

/** Minimal PNG header reader — width/height live in the IHDR chunk. */
function pngSize(path) {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const css = read('src/style.css');
const html = read('index.html');
const main = read('src/main.js');

/** Every `url('/assets/...')` in the stylesheet. */
const cssAssets = [...css.matchAll(/url\('(\/assets\/[^']+)'\)/g)].map((m) => m[1]);

/** Every `src="/assets/..."` in the markup. */
const htmlAssets = [...html.matchAll(/src="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

describe('UI kit — assets resolve', () => {
  it('every stylesheet asset URL exists on disk', () => {
    expect(cssAssets.length).toBeGreaterThan(10);
    const missing = cssAssets.filter((url) => !existsSync(join('public', url.replace(/^\//, ''))));
    expect(missing).toEqual([]);
  });

  it('every image referenced by index.html exists on disk', () => {
    expect(htmlAssets.length).toBeGreaterThan(5);
    const missing = htmlAssets.filter((url) => !existsSync(join('public', url.replace(/^\//, ''))));
    expect(missing).toEqual([]);
  });

  it('declares a --ui-* token for every kit sprite family the CSS uses', () => {
    const declared = [...css.matchAll(/--ui-[a-z-]+:\s*url\('([^']+)'\)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(15);
    for (const url of declared) {
      expect(existsSync(join('public', url.replace(/^\//, ''))), url).toBe(true);
    }
  });
});

describe('UI kit — 9-slice geometry', () => {
  // The slice values in style.css are measured against these exact canvases:
  // a sprite regenerated at another size would stretch every corner.
  const expected = {
    'frame_panel.png': [281, 292],
    'frame_panel_soft.png': [281, 292],
    'frame_panel_inset.png': [281, 292],
    'frame_note.png': [1090, 330],
    'frame_bar.png': [1511, 384],
    'btn_iron.png': [377, 160],
    'btn_gold.png': [377, 160],
    'btn_crimson.png': [377, 160],
    'btn_ghost.png': [377, 160],
    'btn_square.png': [152, 160],
    'card_iron.png': [281, 343],
    'card_crimson.png': [281, 342],
    'slot.png': [137, 148],
    'slot_sel.png': [138, 148],
  };

  for (const [file, [width, height]] of Object.entries(expected)) {
    it(`${file} is ${width}x${height}`, () => {
      const size = pngSize(join('public', 'assets', 'ui-kit', file));
      expect(size).toEqual({ width, height });
    });
  }

  it('ships the cursor and every menu glyph at a usable size', () => {
    for (const file of ['cursor.png', 'cursor_click.png']) {
      const { width, height } = pngSize(join('public', 'assets', 'ui-kit', file));
      expect(width).toBe(32);
      expect(height).toBe(32);
    }
    for (const glyph of ['anvil', 'medal', 'crown', 'scroll', 'book', 'gear', 'calendar', 'swords']) {
      const { width, height } = pngSize(join('public', 'assets', 'ui-kit', `glyph_${glyph}.png`));
      expect([width, height]).toEqual([64, 64]);
    }
  });

  it('slices each sprite well inside its own corners', () => {
    // slice must leave a stretchable middle: sliceX * 2 < width, same for Y.
    const slices = [
      { file: 'frame_panel.png', sx: 50, sy: 50 },
      { file: 'frame_panel_soft.png', sx: 30, sy: 30 },
      { file: 'frame_note.png', sx: 30, sy: 30 },
      { file: 'frame_bar.png', sx: 60, sy: 40 },
      { file: 'btn_iron.png', sx: 50, sy: 28 },
      { file: 'card_iron.png', sx: 30, sy: 35 },
      { file: 'slot.png', sx: 20, sy: 20 },
    ];
    for (const { file, sx, sy } of slices) {
      const { width, height } = pngSize(join('public', 'assets', 'ui-kit', file));
      expect(sx * 2, `${file} sliceX`).toBeLessThan(width);
      expect(sy * 2, `${file} sliceY`).toBeLessThan(height);
    }
  });
});

describe('Main menu — wiring contract', () => {
  // Every id src/main.js binds must exist once in the markup: the menu is the
  // only way into the game, so a renamed button is a soft-lock.
  const wiredIds = [...main.matchAll(/getElementById\('(menu-[a-z-]+)'\)/g)].map((m) => m[1]);
  const uniqueWired = [...new Set(wiredIds)];

  it('binds at least the nine original destinations', () => {
    expect(uniqueWired.length).toBeGreaterThanOrEqual(9);
  });

  for (const id of uniqueWired) {
    it(`index.html defines #${id} exactly once`, () => {
      const hits = html.match(new RegExp(`id="${id}"`, 'g')) || [];
      expect(hits.length).toBe(1);
    });
  }

  it('keeps PLAY as the only primary plate and the hub as a tile nav', () => {
    expect(html).toContain('class="menu-play"');
    // Six secondary destinations, all tiles — no stacked full-width buttons.
    const tiles = html.match(/class="menu-tile"/g) || [];
    expect(tiles.length).toBe(6);
  });

  it('does not reintroduce the old scrolling button column', () => {
    expect(html).not.toContain('menu-btn-list');
    expect(css).not.toContain('.menu-btn-list');
  });
});

describe('UI kit — the demo pack is retired', () => {
  it('no stylesheet token still points at cozy-ui', () => {
    expect(css).not.toMatch(/cozy/);
  });

  it('no markup still points at cozy-ui', () => {
    expect(html).not.toMatch(/cozy/);
  });

  it('the contrast audit measures ui-kit fills, not the old pack', () => {
    const script = read('scripts/check-contrast.mjs');
    expect(script).toContain('ui-kit');
    expect(script).not.toContain('cozy');
  });
});
