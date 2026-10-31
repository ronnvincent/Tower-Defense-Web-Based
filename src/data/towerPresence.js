import { PRESENCE_ART } from './towerPresenceArt.js';

/**
 * Presence: the per-family silhouette layer for every defence.
 *
 * The keeps already ship eight art tiers each, but at 64 px on a crowded board
 * they read as "a building with a coloured flag" — the tier decoration (crown,
 * pennants, standard, braziers, shards) is the *same shape* for every line, so
 * two different families look like the same tower twice. That is exactly what
 * players reported: "parang halos same lahat magkakamukha".
 *
 * This module gives each family its own crest, ground sigil, ring and halo, and
 * each tier one more of them. Nothing here is gameplay: ranges, damage and
 * cooldowns stay in `towerData.js`.
 *
 * Design rules that keep it from becoming noise:
 *   - one accent colour per family, low chroma, never more than a few hundred
 *     saturated pixels on screen;
 *   - the layers are *thin* (hairlines and arcs, not filled plates) so the board
 *     and the creeps stay readable underneath;
 *   - every layer sits either under the structure (ground) or above its roof
 *     (crest, halo), never over the weapon or the tile next door;
 *   - motion is slow (2–9 s cycles) and only on three layers, so sixty towers
 *     do not turn the battlefield into a strobe.
 */

/** Which presence family a line belongs to. Every line has one, by design. */
export const PRESENCE_STYLE = {
  // bolts, arrows, repeater guns: cold steel and a cyan edge
  archer: 'bolt',
  crossbow: 'bolt',
  gatling: 'bolt',
  siegeBallista: 'bolt',
  // siege engines lobbing weight
  cannon: 'shell',
  mortar: 'shell',
  royalArtillery: 'shell',
  // ice
  frost: 'frost',
  rimeTower: 'frost',
  // lightning, runes, wards, arcane sights
  tesla: 'storm',
  runes: 'storm',
  obelisk: 'storm',
  skybreaker: 'storm',
  arcaneSniper: 'storm',
  // poison and fire pots
  venom: 'venom',
  flamer: 'venom',
  // smithy, engineers, the banner
  forge: 'forge',
  workshop: 'forge',
  banner: 'forge',
  // harpoons and flak
  harpoon: 'harpoon',
  // ground traps
  spikeTrap: 'trap',
};

/** Rows of the presence atlas, in the order a tower grows them. */
export const PRESENCE_TIERS = [
  { level: 1, layer: 'mote', title: 'ambient fleck' },
  { level: 2, layer: 'crest', title: 'family crest' },
  { level: 3, layer: 'sigil', title: 'ground sigil' },
  { level: 4, layer: 'ring', title: 'energy ring' },
  { level: 5, layer: 'halo', title: 'ascendant halo' },
];

/** Does the shipped art contain this key? */
export function presenceKey(name, style) {
  const key = `presence-${name}-${style}`;
  return PRESENCE_ART[key] ? key : null;
}

const TILE = 64;

/**
 * The parts a tower of this tier wears.
 *
 * Pure geometry: returns plain objects so a headless test can assert the
 * silhouette rules without a renderer, and `Tower.refreshPresence` is the only
 * thing that turns them into sprites.
 *
 * @param {object} spec
 * @param {string} spec.style  one of PRESENCE_STYLE values
 * @param {number} spec.level  1–5
 * @param {string|null} [spec.branch] 'spec-a' | 'spec-b' once specialised
 * @param {number} [spec.artHeight] height of the structure art in px
 * @returns {Array<object>} parts, back-to-front
 */
export function presenceParts({ style, level = 1, branch = null, artHeight = TILE } = {}) {
  if (!style) return [];
  const parts = [];
  const ground = TILE / 2;
  // Everything that sits "on the roof" is anchored to the top edge of the art,
  // so a 121 px specialisation and a 98 px starter both look deliberate.
  const roof = ground - Math.max(TILE, artHeight || TILE);

  // --- ground sigil: the tile is claimed --------------------------------
  if (level >= 3) {
    const key = presenceKey('sigil', style);
    if (key) {
      parts.push({
        layer: 'back',
        kind: 'sigil',
        key,
        x: 0,
        y: ground + 5,
        originY: 0.5,
        scale: 1 + (level - 3) * 0.05,
        alpha: 0.8,
        blend: 'NORMAL',
        anim: 'breathe',
      });
    }
  }

  // --- ring: an energy band that turns ----------------------------------
  if (level >= 4) {
    const key = presenceKey('ring', style);
    if (key) {
      parts.push({
        layer: 'back',
        kind: 'ring',
        key,
        x: 0,
        y: ground - 6,
        originY: 0.5,
        scale: level >= 5 ? 1.18 : 1.04,
        alpha: 0.6,
        blend: 'ADD',
        anim: 'spin',
      });
    }
  }

  // --- crest: a pair of flanking roof ornaments --------------------------
  // Two, not one, and out at the corners: the upgrade badge floats directly
  // above the art, so a centred medallion would be hidden exactly when the
  // player can afford the next tier. Flanking pieces also widen the silhouette,
  // which is what makes two families distinguishable at play zoom.
  if (level >= 2) {
    const key = presenceKey('crest', style);
    if (key) {
      const spread = 26 + (level - 2) * 1.5;
      for (const side of [-1, 1]) {
        parts.push({
          // In front, not behind: the tier decor already hangs a gold pennant in
          // this exact spot, and a crest hidden under it is a crest nobody sees.
          // Front also means the family's own shape — ice spikes, lightning,
          // anvil, hook, barb — is what the eye reads at the top of the keep,
          // instead of the same gold pennant on all eight lines.
          layer: 'front',
          kind: 'crest',
          key,
          x: side * spread,
          // Planted 14 px into the masonry so the crest's own base plate meets
          // the parapet: an ornament that hovers over the roof reads as a
          // rendering fault, not as a finial.
          y: roof + 14,
          originY: 1,
          // The keep is 98-121 px tall on a 64 px tile, so a 30 px crest reads
          // as a thumbnail at 1:1. 1.15 puts ~36 px of named shape on the
          // shoulder without the pair colliding with the next tile over.
          scale: 1.15 + (level - 2) * 0.08,
          flipX: side < 0,
          alpha: 0.95,
          blend: 'NORMAL',
          anim: null,
        });
      }
    }
    // The branch the player chose is readable right under the crown: a round
    // gem for path I, a diamond for path II.
    if (level >= 3 && branch) {
      const gem = presenceKey('gem', branch === 'spec-b' ? 'diamond' : 'round');
      if (gem) {
        parts.push({
          layer: 'front',
          kind: 'gem',
          key: gem,
          x: 0,
          y: roof + 16,
          originY: 0.5,
          scale: 1.1,
          // Additive but faint: the gem marks the branch, it does not glow like
          // a powerup.
          alpha: 0.6,
          blend: 'ADD',
          anim: 'glint',
        });
      }
    }
  }

  // --- halo: only a maxed keep earns one --------------------------------
  // Drawn as a wide pair of energetic wings *behind* the keep rather than an
  // arch above it: above is the badge (and the boss bar on tall lines), behind
  // is empty space that belongs to the tower.
  if (level >= 5) {
    const key = presenceKey('halo', style);
    if (key) {
      for (const side of [-1, 1]) {
        parts.push({
          layer: 'back',
          kind: 'halo',
          key,
          x: side * 30,
          y: roof + 34,
          originY: 0.5,
          scale: 2.15,
          flipX: side < 0,
          alpha: 0.42,
          blend: 'ADD',
          anim: 'breathe',
        });
      }
    }
  }

  // --- mote: one slow fleck, from level 1, so nothing looks dead --------
  const mote = presenceKey('mote', style);
  if (mote) {
    parts.push({
      layer: 'back',
      kind: 'mote',
      key: mote,
      x: 16,
      y: roof + 16,
      originY: 0.5,
      scale: 1.3,
      alpha: 0.6,
      blend: 'ADD',
      anim: 'float',
    });
  }

  return parts;
}

/**
 * A tower's presence family: its own style, or the family of the machine it
 * was built from. Unknown lines fall back to `trap` rather than vanishing, so a
 * future line without an entry still gets an ambient fleck.
 */
export function styleFor(typeKey) {
  return PRESENCE_STYLE[typeKey] || 'trap';
}
