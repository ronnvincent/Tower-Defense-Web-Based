/**
 * RunMods.js — the run-long rule set every mode can bend.
 *
 * Rogue Siege stacks cards, Anomaly Waves drop one mutation per wave and
 * Ascension raises the stakes every ten waves. All three only ever produce
 * *numbers the scene already reads*: tower damage / range / cooldown, kill gold,
 * the score multiplier, and the horde's health & speed. Keeping them in one
 * immutable bag means:
 *
 *   - a card can never corrupt the tower stats (`refreshTowerAuras` reads the
 *     bag, it does not patch towers),
 *   - the HUD can describe a run from the bag alone,
 *   - and the whole thing is a pure function, so the maths is unit-tested
 *     without Phaser.
 *
 * Nothing here touches a `Tower`, a `GameStateManager` or the DOM.
 */

/** Neutral modifiers: every multiplier is 1, every flag is off. */
export const BASE_RUN_MODS = Object.freeze({
  damage: 1,
  range: 1,
  cooldown: 1,
  killGold: 1,
  score: 1,
  enemyHealth: 1,
  enemySpeed: 1,
  critChance: 0,
  healPerWave: 0,
  noBarricades: false,
  noPowerups: false,
  twinBoss: false,
  cards: Object.freeze([]),
  anomalies: Object.freeze([]),
  ascension: 0,
});

const MULTIPLIERS = ['damage', 'range', 'cooldown', 'killGold', 'score', 'enemyHealth', 'enemySpeed'];
const ADDITIVES = ['critChance', 'healPerWave'];
const FLAGS = ['noBarricades', 'noPowerups', 'twinBoss'];

function clampMultiplier(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // A card stack may never make a tower useless, and never make it free.
  return Math.min(3, Math.max(0.25, n));
}

/** A fresh, neutral bag (optionally seeded with overrides from a mode). */
export function createRunMods(overrides = {}) {
  const mods = { ...BASE_RUN_MODS, cards: [], anomalies: [] };
  for (const key of MULTIPLIERS) {
    if (overrides[key] != null) mods[key] = clampMultiplier(overrides[key]);
  }
  for (const key of ADDITIVES) {
    if (overrides[key] != null) mods[key] = Math.max(0, Number(overrides[key]) || 0);
  }
  for (const key of FLAGS) if (overrides[key] != null) mods[key] = Boolean(overrides[key]);
  mods.ascension = Math.max(0, Math.floor(Number(overrides.ascension) || 0));
  return mods;
}

/**
 * Fold one effect (`{ mods, flags, add }`) into the bag.
 *
 * `mods` multiply, `add` adds, `flags` OR. The input is never mutated, so a
 * caller can keep the previous bag around for an undo or a replay.
 */
export function applyEffect(mods, effect = {}) {
  const next = { ...(mods || BASE_RUN_MODS) };
  for (const key of MULTIPLIERS) {
    if (effect.mods?.[key] != null) {
      next[key] = clampMultiplier(clampMultiplier(next[key]) * clampMultiplier(effect.mods[key]));
    }
  }
  for (const key of ADDITIVES) {
    if (effect.add?.[key] != null) {
      next[key] = Math.max(0, (Number(next[key]) || 0) + (Number(effect.add[key]) || 0));
    }
  }
  for (const key of FLAGS) {
    if (effect.flags?.[key] != null) next[key] = Boolean(next[key]) || Boolean(effect.flags[key]);
  }
  return next;
}

/**
 * Fold a draft card into the bag and record it (for the HUD and the save).
 *
 * A card *wraps* its effect (`{ effect: { mods } }`) because it also carries a
 * name, rarity and blurb; a bare effect object is accepted too, so the same
 * function serves a card, an anomaly and a hand-written override.
 */
/**
 * How much of a repeat pick still lands.
 *
 * A common may be taken again and again, and stacking the same +10 % four times
 * is how a draft stops being a choice: the third copy is worth half, the fourth
 * a quarter, and the curve is flat by the fifth. Rare and uncommon cards are
 * one-shot (the draw never re-offers them), so they always count in full.
 */
export const REPEAT_FALLOFF = 0.5;

/** Effective weight of a card the player already owns `copies` times. */
export function repeatScale(copies) {
  const n = Math.max(0, Math.floor(Number(copies) || 0));
  if (n === 0) return 1;
  return Math.max(0.1, REPEAT_FALLOFF ** n);
}

/**
 * Scale one effect towards neutral: multipliers move towards 1, additives
 * towards 0. `instant` payouts are deliberately *not* scaled — gold and core HP
 * are finite, one-off, and a repeat is supposed to buy them.
 */
function dampEffect(effect, scale) {
  if (scale >= 1) return effect;
  const out = { ...effect };
  if (effect.mods) {
    out.mods = {};
    for (const [key, value] of Object.entries(effect.mods)) {
      out.mods[key] = 1 + (Number(value) - 1) * scale;
    }
  }
  if (effect.add) {
    out.add = {};
    for (const [key, value] of Object.entries(effect.add)) out.add[key] = Number(value) * scale;
  }
  return out;
}

export function applyCard(mods, card) {
  if (!card) return mods;
  const owned = mods?.cards || [];
  const copies = owned.filter((id) => id === card.id).length;
  const effect = dampEffect(card.effect || card, repeatScale(copies));
  const next = applyEffect(mods, effect);
  next.cards = [...owned, card.id];
  return next;
}

/** Fold a wave anomaly into the bag and remember it for the wave banner. */
export function applyAnomaly(mods, anomaly) {
  if (!anomaly) return mods;
  const next = applyEffect(mods, anomaly.effect || anomaly);
  next.anomalies = [...(mods?.anomalies || []), anomaly.id];
  return next;
}

/** Remove one wave anomaly without touching the draft stack. */
export function clearAnomaly(mods, anomaly) {
  if (!mods) return mods;
  const next = applyEffect(mods, {});
  next.anomalies = (mods.anomalies || []).filter((id) => id !== anomaly?.id);
  return next;
}

/**
 * Ascension: the Endless ladder's opt-in difficulty step.
 *
 * Each step makes the horde tougher *and* every point worth more, so climbing
 * is a choice about risk rather than a wall. Wave 10 of ascension 3 is not the
 * same fight as wave 10 of ascension 0.
 */
export function ascend(mods) {
  const step = Math.max(0, Math.floor(Number(mods?.ascension) || 0)) + 1;
  const next = applyEffect(mods, {
    mods: { enemyHealth: 1.25, enemySpeed: 1.04, score: 1.5, killGold: 1.1 },
  });
  next.ascension = step;
  return next;
}

/** How much a wave's horde is scaled by the bag (health, speed). */
export function hordeScaling(mods) {
  return {
    health: clampMultiplier(mods?.enemyHealth),
    speed: clampMultiplier(mods?.enemySpeed),
  };
}

/**
 * Human-readable chips for the HUD, biggest change first.
 *
 * Only multipliers that actually moved are listed, so a neutral bag prints
 * nothing at all instead of a wall of "+0%".
 */
export function summariseMods(mods) {
  const bag = mods || BASE_RUN_MODS;
  const rows = [];
  const pct = (value) => `${value >= 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;
  const labels = {
    damage: 'DMG',
    range: 'RNG',
    cooldown: 'ROF',
    killGold: 'GOLD',
    score: 'SCORE',
    enemyHealth: 'HORDE HP',
    enemySpeed: 'HORDE SPD',
  };
  for (const key of MULTIPLIERS) {
    const value = Number(bag[key]);
    if (!Number.isFinite(value) || Math.abs(value - 1) < 0.005) continue;
    rows.push({ key, label: `${labels[key]} ${pct(key === 'cooldown' ? 2 - value : value)}` });
  }
  if (bag.critChance > 0) rows.push({ key: 'crit', label: `CRIT ${Math.round(bag.critChance * 100)}%` });
  if (bag.noBarricades) rows.push({ key: 'noBarricades', label: 'NO WALLS' });
  if (bag.noPowerups) rows.push({ key: 'noPowerups', label: 'NO POWERUPS' });
  if (bag.twinBoss) rows.push({ key: 'twinBoss', label: 'TWIN BOSS' });
  if (bag.ascension > 0) rows.push({ key: 'ascension', label: `ASCENSION ${bag.ascension}` });
  return rows;
}
