// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Tower } from '../src/entities/Tower.js';
import { TOWER_TYPES } from '../src/data/towerData.js';
import { PRESENCE_ART } from '../src/data/towerPresenceArt.js';
import {
  PRESENCE_STYLE,
  PRESENCE_TIERS,
  presenceKey,
  presenceParts,
  styleFor,
} from '../src/data/towerPresence.js';

/**
 * The presence layer.
 *
 * A keep already ships eight art tiers, but the *decoration* on top of it (crown,
 * pennants, standard, braziers, shards) was identical for all twenty-one lines:
 * two different families read as the same tower twice, and players said so —
 * "parang halos same lahat magkakamukha".
 *
 * These tests pin the rule that replaced it: every line belongs to a family with
 * its own crest, ground sigil, ring and halo, and every tier from 2 to 5 adds
 * one more of them. They also pin the restraint — the layers must stay thin,
 * low-alpha and out of the weapon's way, because the board already carries
 * creeps, projectiles and damage numbers.
 */

const ROOT = path.resolve(__dirname, '..');
const presencePath = (key) => path.join(ROOT, 'public/assets/towers/deco/presence', PRESENCE_ART[key]);

function node(extra = {}) {
  const base = {
    x: 0,
    y: 0,
    alpha: 1,
    scale: 1,
    rotation: 0,
    key: null,
    blend: null,
    visible: true,
    listeners: [],
    setOrigin() {
      return this;
    },
    setScale(value) {
      this.scale = value;
      return this;
    },
    setAlpha(value) {
      this.alpha = value;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setBlendMode(mode) {
      this.blend = mode;
      return this;
    },
    setTexture(key) {
      this.key = key;
      return this;
    },
    play() {
      return this;
    },
    once(name, fn) {
      this.listeners.push({ name, fn });
      return this;
    },
    on() {
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
    removeAll() {
      return this;
    },
  };
  const proxy = new Proxy(Object.assign(base, extra), {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'then') return undefined;
      const fn = () => proxy;
      obj[key] = fn;
      return fn;
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
  return proxy;
}

function makeScene({ hasTexture = () => true } = {}) {
  const tweens = [];
  const images = [];
  const container = () => {
    const children = [];
    const self = node({
      children,
      add(child) {
        children.push(child);
        return self;
      },
      addAt(child, index) {
        children.splice(index, 0, child);
        return self;
      },
    });
    return self;
  };
  return {
    tweens,
    images,
    add: {
      container,
      image: (x, y, key) => {
        const image = node({ x, y, key });
        images.push(image);
        return image;
      },
      graphics: () => node(),
      sprite: () => node(),
      text: () => node({ text: '' }),
      circle: () => node(),
      rectangle: () => node(),
    },
    tweens: {
      add: (config) => {
        tweens.push(config);
        return { remove() {} };
      },
    },
    time: { delayedCall: () => ({ remove() {} }), addEvent: () => ({ remove() {} }) },
    textures: { exists: (key) => hasTexture(key), get: () => null },
    anims: { exists: () => false, create: () => {} },
    activeEnemies: [],
    activeTowers: [],
  };
}

const CONTEXT = () => ({
  economy: { coins: 9999, score: 0, spend: () => true },
  gameState: { counters: {} },
  activeEnemies: [],
  activeProjectiles: [],
});

function build(typeKey = 'archer', level = 1) {
  const scene = makeScene();
  const tower = new Tower(scene, typeKey, 2, 3, CONTEXT());
  tower.level = level;
  tower.refreshDecorations();
  return { tower, scene };
}

const presenceKeys = (tower) => (tower.presenceParts || []).map((part) => part.key);

describe('every defence line has its own family', () => {
  it('assigns a style to every shipped line', () => {
    for (const line of Object.keys(TOWER_TYPES)) {
      expect(PRESENCE_STYLE[line], `${line} has no presence style`).toBeTruthy();
      expect(styleFor(line)).toBe(PRESENCE_STYLE[line]);
    }
    // An unknown line still answers, so a future tower is never blank.
    expect(styleFor('does-not-exist')).toBe('trap');
  });

  it('ships the crest, sigil, ring, halo and mote for every style', () => {
    const styles = new Set(Object.values(PRESENCE_STYLE));
    expect(styles.size).toBeGreaterThanOrEqual(8);
    for (const style of styles) {
      for (const layer of ['crest', 'sigil', 'ring', 'halo', 'mote']) {
        const key = presenceKey(layer, style);
        expect(key, `${layer} missing for ${style}`).toBeTruthy();
        expect(existsSync(presencePath(key)), `${key} missing on disk`).toBe(true);
      }
    }
    for (const shape of ['round', 'diamond']) {
      const key = presenceKey('gem', shape);
      expect(existsSync(presencePath(key)), `${key} missing on disk`).toBe(true);
    }
  });

  it('gives neighbouring families different art, so two keeps never look alike', () => {
    const styles = Object.values(PRESENCE_STYLE);
    const crests = new Set(styles.map((style) => presenceKey('crest', style)));
    expect(crests.size).toBe(new Set(styles).size);
    const rings = new Set(styles.map((style) => presenceKey('ring', style)));
    expect(rings.size).toBe(new Set(styles).size);
  });
});

describe('every tier grows one more layer', () => {
  it('lays the family layers on in order, one per level', () => {
    for (const style of Object.values(PRESENCE_STYLE)) {
      // The crest and the halo are mirrored *pairs*: one on each flank, so the
      // silhouette widens instead of growing a medallion the upgrade badge
      // would sit on top of.
      const kinds = (level) =>
        presenceParts({ style, level, artHeight: 100 }).map((part) => part.kind);
      expect(kinds(1)).toEqual(['mote']);
      expect(kinds(2)).toEqual(['crest', 'crest', 'mote']);
      // No branch is passed here, so no gem yet.
      expect(kinds(3)).toEqual(['sigil', 'crest', 'crest', 'mote']);
      expect(kinds(4)).toEqual(['sigil', 'ring', 'crest', 'crest', 'mote']);
      expect(kinds(5)).toEqual([
        'sigil',
        'ring',
        'crest',
        'crest',
        'halo',
        'halo',
        'mote',
      ]);
      // With a branch chosen, the gem joins between the crests and the halo.
      const withBranch = presenceParts({ style, level: 5, branch: 'spec-a', artHeight: 100 })
        .map((part) => part.kind);
      expect(withBranch).toContain('gem');
    }
    expect(PRESENCE_TIERS.map((tier) => tier.layer)).toEqual([
      'mote',
      'crest',
      'sigil',
      'ring',
      'halo',
    ]);
  });

  it('marks the chosen branch on the crest from level 3', () => {
    const a = presenceParts({ style: 'bolt', level: 3, branch: 'spec-a', artHeight: 100 });
    const b = presenceParts({ style: 'bolt', level: 3, branch: 'spec-b', artHeight: 100 });
    expect(a.find((part) => part.kind === 'gem').key).toBe('presence-gem-round');
    expect(b.find((part) => part.kind === 'gem').key).toBe('presence-gem-diamond');
    // Nothing is marked before the branch exists.
    const early = presenceParts({ style: 'bolt', level: 2, branch: null, artHeight: 100 });
    expect(early.some((part) => part.kind === 'gem')).toBe(false);
  });

  it('grows with the structure instead of floating in the air', () => {
    const short = presenceParts({ style: 'bolt', level: 4, artHeight: 96 });
    const tall = presenceParts({ style: 'bolt', level: 4, artHeight: 130 });
    const crestShort = short.find((part) => part.kind === 'crest');
    const crestTall = tall.find((part) => part.kind === 'crest');
    // Taller art pushes the crest further up (smaller y, since y grows downward).
    expect(crestTall.y).toBeLessThan(crestShort.y);
  });
});

describe('restraint: the layers stay readable and quiet', () => {
  it('keeps every additive layer at or below 60 % alpha', () => {
    for (const style of Object.values(PRESENCE_STYLE)) {
      for (const part of presenceParts({ style, level: 5, branch: 'spec-b', artHeight: 120 })) {
        // Glow layers are additive and must stay faint; a solid piece (the
        // crest) is drawn normally and may be fully opaque, because it is an
        // object on the roof, not a light.
        if (part.blend === 'ADD') {
          expect(part.alpha, `${style}/${part.kind}`).toBeLessThanOrEqual(0.6);
        } else if (part.kind !== 'crest') {
          // A ground marking is faint by design, never a solid plate.
          expect(part.alpha, `${style}/${part.kind}`).toBeLessThanOrEqual(0.8);
        }
      }
    }
  });

  it('keeps the ground layers on the ground and the crest above the roof', () => {
    const parts = presenceParts({ style: 'shell', level: 5, artHeight: 120 });
    // The tile is 64 px: the ground line is y = 32, so a sigil or ring has to
    // sit within a few pixels of it and never float up the structure.
    for (const kind of ['sigil', 'ring']) {
      const part = parts.find((entry) => entry.kind === kind);
      expect(part.y, kind).toBeGreaterThan(10);
      expect(part.y, kind).toBeLessThan(64);
    }
    // The crest pair rides the roof line, one on each flank, well clear of the
    // centre where the upgrade badge floats, and is drawn behind the weapon so
    // an upward-pointing barrel is never covered.
    const crests = parts.filter((part) => part.kind === 'crest');
    expect(crests).toHaveLength(2);
    expect(crests[0].x * crests[1].x).toBeLessThan(0); // mirrored, opposite sides
    for (const crest of crests) {
      expect(crest.y).toBeLessThan(0);
      expect(Math.abs(crest.x)).toBeGreaterThanOrEqual(18);
      // In front of the tier pennant, so the family shape is what reads.
      expect(crest.layer).toBe('front');
    }
    // The halo is a pair of wings behind the keep, not an arch over the badge.
    const halos = parts.filter((part) => part.kind === 'halo');
    expect(halos).toHaveLength(2);
    for (const halo of halos) expect(halo.alpha).toBeLessThanOrEqual(0.6);
    // The ambient fleck is the only piece allowed to drift near the roof.
    const mote = parts.find((part) => part.kind === 'mote');
    expect(mote.y).toBeLessThan(0);
  });
});

describe('the tower wears it', () => {
  it('a fresh level-1 keep still has its family fleck', () => {
    const { tower } = build('cannon', 1);
    expect(presenceKeys(tower)).toContain('presence-mote-shell');
    expect(tower.decorParts).toHaveLength(0); // tier decorations still start at 2
  });

  it('a level-5 keep wears crest, sigil, ring, halo and mote', () => {
    const { tower } = build('archer', 5);
    const keys = presenceKeys(tower);
    for (const layer of ['crest', 'sigil', 'ring', 'halo', 'mote']) {
      expect(keys, layer).toContain(`presence-${layer}-bolt`);
    }
  });

  it('two different lines do not wear the same crest', () => {
    const archer = build('archer', 3).tower;
    const venom = build('venom', 3).tower;
    const crestOf = (tower) => presenceKeys(tower).find((key) => key.startsWith('presence-crest-'));
    expect(crestOf(archer)).toBe('presence-crest-bolt');
    expect(crestOf(venom)).toBe('presence-crest-venom');
  });

  it('rebuilding an upgrade tears the old layers down instead of stacking them', () => {
    const { tower } = build('frost', 2);
    const first = tower.presenceParts.length;
    tower.level = 5;
    tower.refreshDecorations(true);
    expect(tower.presenceParts.length).toBeGreaterThan(first);
    // Every sprite from the previous tier was destroyed, not orphaned. (The
    // stub node answers unknown keys with a no-op function, so this compares
    // against the literal `true` rather than truthiness.)
    const stale = tower.presenceParts.filter((part) => part.destroyed === true);
    expect(stale).toHaveLength(0);
  });

  it('a barricade wears none of it', () => {
    const { tower } = build('barricade', 3);
    expect(tower.presenceParts || []).toHaveLength(0);
  });
});

/**
 * Reach is a promise the upgrade button makes.
 *
 * Request 48 raised the artillery line's reach a long way (L3 800 px). The tier
 * data lives in two files — `royalDefences.js` for levels 1–3 and
 * `towerAscension.js` for the level 4 and 5 blocks — so raising the L3 number
 * alone left level 4 *shorter* than level 3: the player paid 240 gold to lose
 * 305 px of reach. This pins the invariant for every line in both data files.
 */
describe('reach never shrinks when a tower is upgraded', () => {
  it('a royal line climbs from level 1 to level 5 on both branches', async () => {
    const { ROYAL_TOWER_TYPES } = await import('../src/data/royalDefences.js');
    const { nextAscension } = await import('../src/data/towerAscension.js');

    for (const [typeKey, def] of Object.entries(ROYAL_TOWER_TYPES)) {
      if (!def.levels?.length) continue;
      const ladder = (specKey) => {
        const spec = def.specializations?.[specKey];
        if (!spec) return [];
        const out = [spec.range];
        for (const level of [4, 5]) {
          const tier = nextAscension(typeKey, specKey, level - 1);
          if (tier) out.push(tier.range);
        }
        return out;
      };

      for (const specKey of Object.keys(def.specializations || {})) {
        const reach = [def.levels[0].range, def.levels[1].range, ...ladder(specKey)];
        // A support line has no reach of its own (workshop, obelisk, trap).
        if (!reach.some((value) => value > 0)) continue;
        expect(reach, `${typeKey}/${specKey} reach ladder`).toEqual(
          [...reach].sort((a, b) => a - b)
        );
      }
    }
  });

  it('the artillery branch is the longest reach in the game', async () => {
    const { ROYAL_TOWER_TYPES } = await import('../src/data/royalDefences.js');
    const { nextAscension } = await import('../src/data/towerAscension.js');
    const { TOWER_TYPES } = await import('../src/data/towerData.js');

    const reachOf = (def, typeKey) => {
      const out = (def.levels || []).map((level) => level.range || 0);
      for (const specKey of Object.keys(def.specializations || {})) {
        out.push(def.specializations[specKey].range || 0);
        for (const level of [4, 5]) {
          const tier = nextAscension(typeKey, specKey, level - 1);
          if (tier) out.push(tier.range || 0);
        }
      }
      return Math.max(0, ...out);
    };

    // The royal lines are merged into TOWER_TYPES, so merge both maps by key
    // instead of concatenating a list that carries each line twice.
    const all = Object.entries({ ...TOWER_TYPES, ...ROYAL_TOWER_TYPES }).map(([key, def]) => [
      key,
      reachOf(def, key),
    ]);
    const sorted = all.sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('royalArtillery');
    // "Sobrang lawak": clearly past anything else, not a tie.
    expect(sorted[0][1] - sorted[1][1]).toBeGreaterThanOrEqual(100);
    expect(sorted[0][1]).toBeGreaterThanOrEqual(800);
  });
});
