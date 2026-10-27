/**
 * Vfx — the battlefield's light show.
 *
 * Why a module instead of a few tweens at the call sites?
 * -------------------------------------------------------
 * A tower shot has four moments the player reads at once: the flash at the
 * muzzle, the streak of the projectile, the burst where it lands, and the
 * element it belongs to. The old code had one 64 px puff and a fading circle
 * for all of them, which is why every defence felt the same no matter what it
 * cost.
 *
 * Every effect here is data-driven by *element* (physical, explosive, fire,
 * frost, lightning, arcane, true), so a new tower only has to say what its
 * damage type is. The artwork comes from `src/data/fxManifest.js` (Kenney CC0).
 *
 * The class is deliberately defensive: the unit tests run in Node with no
 * Phaser and no textures, and a missing asset must degrade to "no sparkle",
 * never to a crash mid-wave.
 */

import { FX_SHEETS, FX_PARTICLES } from '../data/fxManifest.js';

/** damageType -> effect element. Unknown types fall back to physical. */
export const ELEMENT_BY_DAMAGE = Object.freeze({
  physical: 'physical',
  explosive: 'explosive',
  fire: 'fire',
  frost: 'frost',
  lightning: 'lightning',
  magic: 'arcane',
  arcane: 'arcane',
  true: 'true',
});

/**
 * Particle tint per element, used where a single white particle texture has to
 * carry the colour of the hit.
 */
const ELEMENT_TINT = Object.freeze({
  physical: [0xdfe8f4, 0x8fa2bb],
  explosive: [0xffc46a, 0xff7a3c],
  fire: [0xffb057, 0xff5a1e],
  frost: [0xc9f2ff, 0x63c8ee],
  lightning: [0xfff3a8, 0xffd23f],
  arcane: [0xdcc7ff, 0x9a6bff],
  true: [0xffd6f4, 0xe06ad0],
});

/** How big an impact sprite is drawn relative to its 192 px atlas frame. */
const IMPACT_SCALE = {
  // Tuned against the 64 px tile: a physical hit should read as a spark on the
  // creep, an explosive hit as a crater roughly the size of its splash radius.
  // Single-target elements sit between the two — big enough to feel, small
  // enough that they never hide the enemy behind the flash.
  physical: 0.45,
  explosive: 0.95,
  fire: 0.8,
  frost: 0.6,
  lightning: 0.55,
  arcane: 0.62,
  true: 0.75,
};

/** How big a line's own impact strip is drawn (128 px atlas frame). */
const LINE_SCALE = {
  archer: 0.5,
  cannon: 0.86,
  frost: 0.66,
  forge: 0.8,
  runes: 0.7,
  banner: 0.62,
  // Engineer lines. A bullet hit is small and frequent; a harpoon hit is a
  // single, heavy punctuation — both read better at their own size.
  crossbow: 0.46,
  gatling: 0.34,
  flamer: 0.7,
  venom: 0.58,
  harpoon: 0.82,
  // Royal lines. The strip is 128 px either way; these numbers tune the *hit*
  // so a siege shell reads heavier than an arcane lance without a second art
  // pass. Siege and mortar are the two biggest, by design.
  royalArtillery: 1.05,
  siegeBallista: 0.7,
  arcaneSniper: 0.82,
  mortar: 1.0,
  rimeTower: 0.66,
  tesla: 0.74,
  skybreaker: 0.62,
  workshop: 0.5,
  obelisk: 0.86,
  spikeTrap: 0.6,
  // Branch B of each royal line hits under its own id, so it needs its own hit
  // size. A salvo pair reads a little smaller per shell; a cluster battery a
  // little wider; a spike field stays flat.
  'royalArtillery-b': 0.9,
  'siegeBallista-b': 0.58,
  'arcaneSniper-b': 0.74,
  'mortar-b': 0.86,
  'rimeTower-b': 0.6,
  'tesla-b': 0.66,
  'skybreaker-b': 0.56,
  'workshop-b': 0.5,
  'obelisk-b': 0.82,
  'spikeTrap-b': 0.56,
};

export class Vfx {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.emitters = new Map();
    this.enabled = Boolean(scene?.add?.particles && scene?.anims);
  }

  /** Is this effect sheet loaded and animated? */
  ready(key) {
    return Boolean(this.scene?.anims?.exists?.(`${key}-play`));
  }

  /** Lazily built, reused emitter — one per particle/behaviour pair. */
  emitter(id, texture, config) {
    if (!this.enabled) return null;
    const cached = this.emitters.get(id);
    if (cached && cached.scene) return cached;
    if (!this.scene.textures?.exists?.(texture)) return null;
    // One number from the graphics profile scales every burst in the game.
    // Fewer particles, same silhouette — never a blank explosion.
    const budget = globalThis.window?.gameQuality?.particleScale ?? 1;
    const tuned =
      budget < 1 && Number.isFinite(config.quantity)
        ? { ...config, quantity: Math.max(1, Math.round(config.quantity * budget)) }
        : config;
    const emitter = this.scene.add.particles(0, 0, texture, {
      emitting: false,
      ...tuned,
    });
    emitter.setDepth(tuned.depth ?? 46);
    this.emitters.set(id, emitter);
    return emitter;
  }

  /** Play a one-shot strip and destroy the sprite when it ends. */
  burst(x, y, key, scale = 1, { depth = 44, rotation = 0, alpha = 1, tint = null } = {}) {
    if (!this.enabled || !this.ready(key)) return null;
    const sprite = this.scene.add
      .sprite(x, y, key, 0)
      .setDepth(depth)
      .setScale(scale)
      .setRotation(rotation)
      .setAlpha(alpha);
    if (tint !== null) sprite.setTint(tint);
    sprite.play(`${key}-play`);
    sprite.once('animationcomplete', () => sprite.destroy());
    return sprite;
  }

  /**
   * Muzzle flash at the barrel tip.
   *
   * The flash is drawn along the barrel rather than at the pivot: a 96 px
   * muzzle sprite centred on the tower would cover the art the player paid to
   * upgrade.
   */
  muzzle(x, y, angle, element = 'physical', line = null, { scale = 0.6 } = {}) {
    if (!this.enabled) return;
    const tints = ELEMENT_TINT[element] || ELEMENT_TINT.physical;
    const lineTexture = line ? `fx-line-${line}-muzzle` : null;

    // Every line gets its own flash shape (needle fan, smoke ring, ice star,
    // ember cluster, rune diamond, rally ring). It is a single soft sprite
    // that fades in 120 ms — a bright animated flash over a 64 px tile is what
    // made the old shots hurt to look at.
    if (lineTexture && this.scene.textures.exists(lineTexture)) {
      const flash = this.scene.add
        .image(x, y, lineTexture)
        .setDepth(47)
        .setRotation(angle + Math.PI / 2)
        .setAlpha(0.85)
        .setScale(scale)
        .setBlendMode('ADD');
      this.scene.tweens?.add?.({
        targets: flash,
        alpha: 0,
        // Grows by a fixed share of its own size, so a level-5 keep's flash is
        // noticeably bigger than a fresh one without ever becoming a blob.
        scale: scale * 1.5,
        duration: 130,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });
    }

    const sparks = this.emitter(`spark-${element}`, 'fx-spark', {
      lifespan: { min: 100, max: 200 },
      speed: { min: 40, max: 130 },
      angle: {
        min: (angle * 180) / Math.PI - 16,
        max: (angle * 180) / Math.PI + 16,
      },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.7, end: 0 },
      blendMode: 'ADD',
      tint: tints[0],
      depth: 46,
    });
    sparks?.explode(element === 'physical' ? 2 : 3, x, y);
  }

  /**
   * The hit itself: an elemental burst, embers, and a puff of smoke that
   * lingers a beat longer than the flash.
   */
  impact(x, y, element = 'physical', { scale = 1, splash = 0, shake = true, line = null } = {}) {
    if (!this.enabled) return;
    // A defence's own strip wins over the generic element burst: that is what
    // makes a rune hit look like an implosion and a cannon hit like a crater.
    const lineKey = line ? `fx-line-${line}-impact` : null;
    const useLine = lineKey && this.ready(lineKey);
    const key = useLine ? lineKey : `fx-impact-${element}`;
    const base = useLine ? LINE_SCALE[line] ?? 0.62 : IMPACT_SCALE[element] ?? IMPACT_SCALE.physical;
    this.burst(x, y, key, base * scale, { depth: 43, alpha: 0.9 });

    const tints = ELEMENT_TINT[element] || ELEMENT_TINT.physical;
    const debris = this.emitter(`impact-${element}`, 'fx-spark', {
      lifespan: { min: 160, max: 320 },
      speed: { min: 40, max: 150 },
      scale: { start: 0.24, end: 0 },
      alpha: { start: 0.75, end: 0 },
      gravityY: 200,
      blendMode: 'ADD',
      tint: tints[1],
      depth: 45,
    });
    debris?.explode(Math.round((useLine ? 3 : 5) * scale), x, y);

    if (!useLine) {
      const smoke = this.emitter('impact-smoke', 'fx-smoke', {
        lifespan: { min: 380, max: 640 },
        speed: { min: 16, max: 70 },
        scale: { start: 0.28, end: 0.5 },
        alpha: { start: 0.22, end: 0 },
        rotate: { min: 0, max: 360 },
        depth: 41,
      });
      smoke?.explode(Math.round(2 * scale), x, y);
    }

    if (splash > 0) this.shockwave(x, y, Math.min(1.7, 0.55 + splash / 130), element);
    if (shake && scale >= 1.6 && this.scene.cameras?.main?.shake) {
      this.scene.cameras.main.shake(70, 0.002);
    }
  }

  /** Expanding ring on the ground — reads as "area damage" instantly. */
  shockwave(x, y, scale = 1, element = 'explosive') {
    if (!this.enabled) return;
    const tint = element === 'frost' ? 0x9fe6ff : element === 'arcane' ? 0xc3a4ff : 0xffd9a0;
    this.burst(x, y, 'fx-shockwave', 0.62 * scale, { depth: 40, tint });
  }

  /** Ice nova: the frost towers' level-5 signature. */
  nova(x, y, scale = 1) {
    if (!this.enabled) return;
    this.burst(x, y, 'fx-nova', 0.9 * scale, { depth: 44 });
    const shards = this.emitter('nova-shards', 'fx-star', {
      lifespan: { min: 260, max: 520 },
      speed: { min: 120, max: 320 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      tint: 0xd8f6ff,
      depth: 45,
    });
    shards?.explode(12, x, y);
  }

  /** Ground slam: leaves a scorch mark and throws dirt. */
  groundBlast(x, y, scale = 1) {
    if (!this.enabled) return;
    this.burst(x, y, 'fx-ground-blast', 0.8 * scale, { depth: 41 });
    const dirt = this.emitter('ground-dirt', 'fx-dirt', {
      lifespan: { min: 320, max: 620 },
      speed: { min: 60, max: 190 },
      angle: { min: 200, max: 340 },
      gravityY: 420,
      scale: { start: 0.3, end: 0.05 },
      alpha: { start: 0.9, end: 0 },
      depth: 40,
    });
    dirt?.explode(Math.round(8 * scale), x, y);
  }

  /** Death pop: one short burst in the creep's own colour family. */
  death(x, y, element = 'physical', scale = 1) {
    if (!this.enabled) return;
    const puff = this.emitter('death-puff', 'fx-smoke-light', {
      lifespan: { min: 300, max: 560 },
      speed: { min: 30, max: 120 },
      scale: { start: 0.4, end: 0.75 },
      alpha: { start: 0.5, end: 0 },
      tint: ELEMENT_TINT[element]?.[1] ?? 0x9aa6b8,
      depth: 39,
    });
    puff?.explode(Math.round(4 * scale), x, y);
  }

  /** Golden ring + glyph when a defence reaches a new tier. */
  levelUp(x, y) {
    if (!this.enabled) return;
    this.burst(x, y - 14, 'fx-levelup', 0.8, { depth: 48 });
    const sparks = this.emitter('level-sparks', 'fx-star', {
      lifespan: { min: 320, max: 640 },
      speed: { min: 80, max: 240 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      tint: 0xffe6a8,
      depth: 49,
    });
    sparks?.explode(14, x, y - 14);
  }

  /**
   * The moment a defence reaches a new tier.
   *
   * Read it as three beats: a ground ring that expands and fades, a short
   * column of light standing in the keep, and a small spray of sparks. There is
   * no screen flash and no camera shake below the last tier — an upgrade is a
   * reward, not a jumpscare, and a player upgrading eight towers in a row does
   * not want the screen pulsing eight times.
   *
   * @param {number} x world px
   * @param {number} y world px (tower centre)
   * @param {{ tier?: number, branch?: 'spec-a'|'spec-b'|null, height?: number }} [opts]
   */
  tierUp(x, y, { tier = 2, branch = null, height = 96 } = {}) {
    if (!this.enabled) return;

    // 1. Ground ring — widens past the tile so the upgrade is visible even at
    //    the pulled-back camera the phone shell uses.
    if (this.scene.textures?.exists?.('fx-aura-ring')) {
      const ring = this.scene.add.image(x, y + 18, 'fx-aura-ring');
      ring.setDepth(47).setBlendMode('ADD').setScale(0.35).setAlpha(0.85);
      ring.setTint(branch === 'spec-b' ? 0xa8e8ff : branch === 'spec-a' ? 0xffd79a : 0xffe9c4);
      this.scene.tweens?.add?.({
        targets: ring,
        scale: 1.25,
        alpha: 0,
        duration: 620,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }

    // 2. Light column — thin and short, so it marks the tower without washing
    //    out the lane behind it.
    if (this.scene.textures?.exists?.('fx-glow')) {
      const column = this.scene.add.image(x, y - height * 0.35, 'fx-glow');
      column.setDepth(46).setBlendMode('ADD').setAlpha(0.5);
      column.setScale(0.55, Math.max(0.8, height / 110));
      column.setTint(branch === 'spec-b' ? 0x9fdcff : 0xffe0aa);
      this.scene.tweens?.add?.({
        targets: column,
        alpha: 0,
        scaleY: Math.max(1.4, height / 70),
        duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => column.destroy(),
      });
    }

    // 3. Sparks, scaled with the tier: a level-2 keep gets a puff, a level-5
    //    one gets a proper shower.
    const count = 8 + tier * 4;
    const sparks = this.emitter(`tier-sparks-${tier}`, 'fx-star', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 60, max: 200 + tier * 20 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.95, end: 0 },
      blendMode: 'ADD',
      tint: branch === 'spec-b' ? 0xbfe8ff : 0xffe1a8,
      depth: 49,
    });
    sparks?.explode(count, x, y - height * 0.45);

    // Only the final tier is allowed a nudge — and a very small one.
    if (tier >= 5) this.scene.cameras?.main?.shake?.(110, 0.0025);
  }

  /** Persistent aura under a maxed tower: a slow breathing ring. */
  aura(tower) {
    if (!this.enabled || !this.scene.textures?.exists?.('fx-glow')) return null;
    const glow = this.scene.add.image(tower.x, tower.y + 14, 'fx-glow');
    glow.setDepth(11).setScale(0.9).setAlpha(0.35).setBlendMode('ADD');
    glow.setTint(0xffd79a);
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.22, to: 0.5 },
      scale: { from: 0.82, to: 1.02 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return glow;
  }

  /** Drop every emitter (scene shutdown). */
  destroy() {
    for (const emitter of this.emitters.values()) emitter?.destroy?.();
    this.emitters.clear();
    this.enabled = false;
  }
}

/** Texture key for an element's impact strip (also used by tests). */
export function impactKey(element) {
  return `fx-impact-${FX_SHEETS[`fx-impact-${element}`] ? element : 'physical'}`;
}

/** Every particle key the runtime expects the boot scene to have loaded. */
export function particleKeys() {
  return Object.keys(FX_PARTICLES);
}
