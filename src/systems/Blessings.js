/**
 * Blessings.js — gold sinks *inside* a run.
 *
 * Gold normally goes into towers and upgrades; a blessing is the "I am about to
 * lose this wave" button that converts surplus gold into an immediate swing.
 * Each blessing has a per-run cap, so the run still has to be won with the
 * towers on the board rather than with a wallet.
 *
 * Pure functions: the scene owns the gold and the purchase counters.
 */

export const BLESSINGS = [
  {
    id: 'wrath',
    name: 'Blessing of Wrath',
    icon: '🔥',
    desc: '+20% tower damage for the rest of this battle.',
    cost: 120,
    max: 1,
    apply: { damage: 1.2 },
  },
  {
    id: 'plenty',
    name: 'Blessing of Plenty',
    icon: '💰',
    desc: '+15% gold from every kill for the rest of this battle.',
    cost: 100,
    max: 1,
    apply: { killGold: 1.15 },
  },
  {
    id: 'mend',
    name: 'Blessing of Mending',
    icon: '💚',
    desc: 'Restore 5 core HP.',
    cost: 150,
    max: 2,
    heal: 5,
  },
  {
    id: 'haste',
    name: 'Blessing of Haste',
    icon: '⚡',
    desc: '-8% tower cooldown for the rest of this battle.',
    cost: 110,
    max: 2,
    apply: { cooldown: 0.92 },
  },
];

export function getBlessing(id) {
  return BLESSINGS.find((b) => b.id === id) || null;
}

/** How many times this blessing has already been bought this run. */
export function blessingCount(purchased = {}, id) {
  const n = Math.floor(Number(purchased?.[id]) || 0);
  const def = getBlessing(id);
  return Math.max(0, Math.min(def?.max || 0, n));
}

/**
 * @returns {{ ok:boolean, cost:number|null, remaining:number, reason?:string }}
 */
export function canBuyBlessing(id, { gold = 0, purchased = {} } = {}) {
  const def = getBlessing(id);
  if (!def) return { ok: false, cost: null, remaining: 0, reason: 'unknown' };
  const bought = blessingCount(purchased, id);
  const remaining = def.max - bought;
  if (remaining <= 0) return { ok: false, cost: null, remaining: 0, reason: 'maxed' };
  if (!Number.isFinite(gold) || gold < def.cost) {
    return { ok: false, cost: def.cost, remaining, reason: 'gold' };
  }
  return { ok: true, cost: def.cost, remaining };
}

/**
 * Aggregate run multipliers from purchased blessings.
 * @returns {{ damage:number, killGold:number, cooldown:number }}
 */
export function blessingBonuses(purchased = {}) {
  const out = { damage: 1, killGold: 1, cooldown: 1 };
  for (const def of BLESSINGS) {
    const count = blessingCount(purchased, def.id);
    if (!count || !def.apply) continue;
    for (let i = 0; i < count; i += 1) {
      if (def.apply.damage) out.damage *= def.apply.damage;
      if (def.apply.killGold) out.killGold *= def.apply.killGold;
      if (def.apply.cooldown) out.cooldown *= def.apply.cooldown;
    }
  }
  return out;
}

/** Board for the in-battle panel: definition + affordability + already bought. */
export function blessingBoard({ gold = 0, purchased = {} } = {}) {
  return BLESSINGS.map((def) => {
    const check = canBuyBlessing(def.id, { gold, purchased });
    return {
      ...def,
      bought: blessingCount(purchased, def.id),
      remaining: check.remaining,
      affordable: check.ok,
      reason: check.reason || null,
    };
  });
}
