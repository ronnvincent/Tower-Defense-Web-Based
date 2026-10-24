/**
 * Kill-combo meter.
 *
 * Chain kills inside a rolling window and the payout multiplier climbs. The
 * point is not just score: a combo that breaks when the player misses a kill
 * turns ordinary wave clearing into a skill expression, and it gives the HUD
 * something to celebrate every few seconds.
 *
 * Pure state machine — no timers of its own, the caller passes `nowMs` — so the
 * windowing rules can be tested without a scene.
 */

/** Kills must land within this window of the previous kill to chain. */
export const COMBO_WINDOW_MS = 2600;

/** Chain length needed for each multiplier step. */
export const COMBO_THRESHOLDS = [3, 6, 10];

/** Multiplier per tier: 0-2 kills → 1×, 3-5 → 1.25×, 6-9 → 1.5×, 10+ → 2×. */
export const COMBO_MULTIPLIERS = [1, 1.25, 1.5, 2];

/** A chain this long is worth an extra call-out on the HUD. */
export const COMBO_HOT_CHAIN = 10;

export function createComboState() {
  return { chain: 0, best: 0, lastKillAt: -Infinity, visible: false };
}

/** Tier 0-3 for a chain length. */
export function comboTier(chain) {
  const n = Math.max(0, Math.floor(Number(chain) || 0));
  let tier = 0;
  for (let i = 0; i < COMBO_THRESHOLDS.length; i += 1) {
    if (n >= COMBO_THRESHOLDS[i]) tier = i + 1;
  }
  return tier;
}

/** Multiplier for a chain length (1 when there is no chain). */
export function comboMultiplier(chain) {
  return COMBO_MULTIPLIERS[comboTier(chain)];
}

/**
 * Register a kill.
 * @returns {{chain:number, best:number, tier:number, multiplier:number, extended:boolean}}
 *   `extended` is false when this kill started a fresh chain.
 */
export function registerKill(state, nowMs) {
  const now = Number(nowMs) || 0;
  const chained = state.chain > 0 && now - state.lastKillAt <= COMBO_WINDOW_MS;
  state.chain = chained ? state.chain + 1 : 1;
  state.lastKillAt = now;
  state.best = Math.max(state.best, state.chain);
  state.visible = true;
  return describe(state, false, chained);
}

/**
 * Advance the meter. Drops the chain once the window lapses.
 * @returns {{chain:number, best:number, tier:number, multiplier:number,
 *            remainingMs:number, expired:boolean}}
 */
export function tickCombo(state, nowMs) {
  const now = Number(nowMs) || 0;
  const remainingMs =
    state.chain > 0 ? Math.max(0, COMBO_WINDOW_MS - (now - state.lastKillAt)) : 0;
  const expired = state.chain > 0 && remainingMs <= 0;
  if (expired) {
    state.chain = 0;
    state.visible = false;
  }
  return { ...describe(state, false, false), remainingMs, expired };
}

/** Clear the chain immediately (base damage, wave end, pause reset). */
export function resetCombo(state) {
  state.chain = 0;
  state.lastKillAt = -Infinity;
  state.visible = false;
  return { chain: 0, best: state.best, tier: 0, multiplier: 1 };
}

/** Reset the per-wave "best chain" record. */
export function startNewWave(state) {
  state.chain = 0;
  state.best = 0;
  state.lastKillAt = -Infinity;
  state.visible = false;
  return state;
}

/**
 * Split a base reward into the part the combo earned.
 *
 * The base reward is always paid; this returns only the *extra* the multiplier
 * adds, so a kill is never worth less than its listed bounty.
 */
export function comboBonus(baseAmount, multiplier) {
  const base = Number(baseAmount) || 0;
  const extra = Math.max(0, (Number(multiplier) || 1) - 1);
  return Math.round(base * extra);
}

/** End-of-wave payout for the best chain of that wave. */
export function waveComboPayout(bestChain) {
  const best = Math.max(0, Math.floor(Number(bestChain) || 0));
  if (best < COMBO_THRESHOLDS[0]) return 0;
  return Math.min(90, (best - COMBO_THRESHOLDS[0] + 1) * 4);
}

function describe(state, expired, extended) {
  const tier = comboTier(state.chain);
  return {
    chain: state.chain,
    best: state.best,
    tier,
    multiplier: COMBO_MULTIPLIERS[tier],
    expired,
    extended,
  };
}
