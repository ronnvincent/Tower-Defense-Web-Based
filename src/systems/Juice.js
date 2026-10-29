/**
 * Juice — the arithmetic behind the game's moment-to-moment feedback.
 *
 * Everything in this file is a pure function of numbers the battle already
 * computes. That is deliberate: the feel work of Phase 4 has to be *readable*
 * and *testable* without a canvas, and none of it may touch combat maths. If a
 * helper here disagrees with the HUD, the test that compares them fails before
 * the player ever sees the difference.
 */

/** Health bar geometry, shared by the creep bars and the boss strip. */
export const HP_BAR = Object.freeze({
  /** Total height in world px. The old bar was 5 px tall with a 3 px fill. */
  height: 6,
  /** Corner radius; a rounded end is what makes a 6 px bar read as a gauge. */
  radius: 3,
  /** The dark outline that keeps the bar legible on sand, snow and grass. */
  border: 1,
  /** Distance above the sprite's radius. */
  offset: 8,
  /** How long the chipped (lost) segment lingers before it drains away. */
  chipDelayMs: 130,
  chipMs: 260,
});

/**
 * How much of the bar is health, and how much is the draining "chip" segment.
 *
 * The chip never sits *below* the fill: a heal that overshoots the trailing
 * segment must snap the chip forward, otherwise the bar would paint a longer
 * ghost than the creep ever had.
 *
 * @param {{ barWidth:number, health:number, maxHealth:number, chipPct?:number }} input
 * @returns {{ fill:number, chip:number, pct:number, visible:boolean }}
 */
export function hpBarWidths({ barWidth, health, maxHealth, chipPct = null }) {
  const width = Math.max(0, Number(barWidth) || 0);
  const max = Math.max(1, Number(maxHealth) || 1);
  const hp = Math.max(0, Math.min(max, Number(health) || 0));
  const pct = hp / max;
  const chip = Math.max(pct, Math.min(1, Number.isFinite(chipPct) ? Number(chipPct) : pct));
  return {
    pct,
    fill: width * pct,
    chip: width * chip,
    // A full bar is noise: 24 creeps each wearing a green strip hides the road.
    // The bar appears on the first hit and stays until the creep dies.
    visible: pct < 0.999,
  };
}

/** Colour of the health fill, matching the bastion bar's own three states. */
export function hpBarColor(pct) {
  if (pct < 0.3) return 0xff5470;
  if (pct < 0.6) return 0xf5c451;
  return 0x5cf2a6;
}

/**
 * Style for a floating damage number.
 *
 * There is no critical-hit roll in this game and adding one would be a balance
 * change, so "heavy" is a *classification of the number the player just saw*:
 * a hit that takes a real share of the target's health reads gold and large; a
 * hit that armour ate reads grey and small. Same damage, honest presentation.
 *
 * @param {{ damage:number, raw?:number, maxHealth?:number, color?:number }} input
 */
export function damageNumberStyle({ damage, raw = null, maxHealth = null, color = 0xffffff } = {}) {
  const value = Math.max(0, Number(damage) || 0);
  const base = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : value;
  const share = maxHealth && maxHealth > 0 ? value / maxHealth : 0;
  const mitigated = base > 0 ? value / base : 1;
  if (mitigated < 0.75) {
    return { size: 13, color: 0xc9ccd6, heavy: false, armored: true };
  }
  if (share >= 0.12 || value >= 40) {
    return { size: 20, color: 0xffd76a, heavy: true, armored: false };
  }
  return { size: 15, color, heavy: false, armored: false };
}

/** The label for the "+8" that floats off a creep as its bounty lands. */
export function goldFloatLabel(amount) {
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) return '';
  return value >= 1000 ? `+${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `+${value}`;
}
