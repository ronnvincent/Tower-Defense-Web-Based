import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every texture the scenes ask for must exist.
 *
 * Phaser answers a lookup for an unloaded key with its `__MISSING` placeholder —
 * a black square crossed by bright green diagonals — and logs it at debug level
 * only, so a typo ships silently and shows up as a black box taped over a
 * monster. That is exactly how `shield-barrier` reached players: `Enemy`
 * created the bubble for every shielded creep, but nothing ever drew the
 * texture, so shields, the obsidian boss and the void herald walked the lanes
 * wearing a black box.
 *
 * These tests read the source instead of booting Phaser: they collect every
 * literal key passed to `scene.add.*`, then check it against the keys the
 * `TextureFactory` bakes and the keys `BootScene` loads. Anything that is
 * referenced but never produced fails here instead of on a player's screen.
 *
 * Keys passed through a variable (the Spire sheets, whose names come from
 * `spireManifest`) cannot be checked statically and are skipped — they are
 * covered by the roster tests.
 */

const SRC = new URL('../src/', import.meta.url).pathname;

function sourceFiles(dir = SRC) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

const FILES = sourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/** Keys the factory draws at boot. */
function bakedKeys() {
  const keys = new Set();
  for (const { text } of FILES) {
    for (const m of text.matchAll(/canvasTexture\(\s*scene\s*,\s*'([^']+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/generateTexture\(\s*'([^']+)'/g)) keys.add(m[1]);
  }
  return keys;
}

/** Keys loaded from disk in BootScene. */
function loadedKeys() {
  const boot = FILES.find((file) => file.path.endsWith('BootScene.js'))?.text || '';
  const keys = new Set();
  for (const m of boot.matchAll(/load\.(?:image|spritesheet|atlas|multiatlas)\(\s*'([^']+)'/g)) keys.add(m[1]);
  return keys;
}

/** Literal keys handed to a `scene.add.*` factory. */
function referencedKeys() {
  const found = new Map();
  for (const { path, text } of FILES) {
    const patterns = [
      // add.image(x, y, 'key') / add.sprite(x, y, 'key') / add.tileSprite(...)
      /add\.(?:image|sprite|tileSprite)\(\s*[^,()]+,\s*[^,()]+,\s*'([A-Za-z0-9\-_]+)'/g,
      // add.existing('key') / add.particles(x, y, 'key')
      /add\.existing\(\s*'([A-Za-z0-9\-_]+)'/g,
      /add\.particles\(\s*[^,()]+,\s*[^,()]+,\s*'([A-Za-z0-9\-_]+)'/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) found.set(m[1], path.replace(SRC, 'src/'));
    }
  }
  return found;
}

describe('texture key contract', () => {
  it('never references a texture nothing draws or loads', () => {
    const available = new Set([...bakedKeys(), ...loadedKeys()]);
    const missing = [...referencedKeys()].filter(([key]) => !available.has(key));
    expect(
      missing.map(([key, file]) => `${key} (${file})`),
      'these keys reach Phaser unbuilt, so it draws its missing-texture placeholder'
    ).toEqual([]);
  });

  it('bakes the shield bubble and the ascension ring', () => {
    const baked = bakedKeys();
    // Both were referenced for a long time before anything drew them.
    expect(baked.has('shield-barrier')).toBe(true);
    expect(baked.has('fx-aura-ring')).toBe(true);
  });

  it('draws the shield bubble in white so it can be tinted per element', () => {
    const factory = FILES.find((file) => file.path.endsWith('TextureFactory.js')).text;
    const block = factory.slice(factory.indexOf("'shield-barrier'"));
    const body = block.slice(0, block.indexOf('});'));
    // A pre-coloured bubble would fight `setTint(0x4ee1ff)`; the art stays white
    // and every colour decision stays with the enemy.
    expect(body).toMatch(/rgba\(255,\s*255,\s*255/);
  });
});
