/**
 * DuelContracts.js — the side bets that make a duel more than a race.
 *
 * Both seats get the **same three contracts**, drawn from the room's seed, so
 * the extra objectives are part of the mirror rather than a private bonus. They
 * pay score — never gold — so a contract can change who wins on points without
 * ever handing one player a stronger board.
 *
 * Pure and deterministic: `contractsFor(seed)` returns the same list on both
 * phones, and `contractScore()` is the only thing the scene has to trust.
 */

/**
 * The pool. Every `stat` is something the scene already counts, so a contract
 * costs no extra bookkeeping in the hot loop.
 */
export const CONTRACT_POOL = Object.freeze([
  {
    id: 'slayer',
    name: 'SLAYER',
    goal: 'Defeat 70 creeps',
    stat: 'kills',
    target: 70,
    reward: 150,
  },
  {
    id: 'wavekeeper',
    name: 'WAVEKEEPER',
    goal: 'Clear 6 waves',
    stat: 'waves',
    target: 6,
    reward: 120,
  },
  {
    id: 'chain',
    name: 'CHAIN REACTION',
    goal: 'Reach a 12-kill chain',
    stat: 'bestChain',
    target: 12,
    reward: 180,
  },
  {
    id: 'bounty',
    name: 'BOUNTY HUNTER',
    goal: 'Clear both bounty waves',
    stat: 'bounties',
    target: 2,
    reward: 200,
  },
  {
    id: 'bloodless',
    name: 'BLOODLESS',
    goal: 'Clear 3 waves without a leak',
    stat: 'cleanWaves',
    target: 3,
    reward: 160,
  },
  {
    id: 'unbroken',
    name: 'UNBROKEN',
    goal: 'Finish with 15+ core HP',
    stat: 'coreHp',
    target: 15,
    reward: 150,
  },
]);

/** How many contracts a duel offers. */
export const CONTRACTS_PER_DUEL = 3;

/** xorshift32 — deterministic, one line, and identical on every device. */
function nextRandom(state) {
  let x = state >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/**
 * The three contracts for a seed.
 *
 * Same seed → same three, in the same order, on both seats. A different arena
 * (the host bumps the seed on rematch) deals a different hand.
 *
 * @param {number} seed
 * @param {number} [count]
 * @returns {Array<object>}
 */
export function contractsFor(seed = 1, count = CONTRACTS_PER_DUEL) {
  const pool = [...CONTRACT_POOL];
  let random = nextRandom((Number(seed) || 1) * 2654435761);
  const picked = [];
  const take = Math.max(1, Math.min(count, pool.length));
  for (let i = 0; i < take; i += 1) {
    random = nextRandom(random);
    const index = random % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/** Coerce a scene's live numbers into the shape the contracts read. */
export function normaliseStats(stats = {}) {
  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    kills: number(stats.kills),
    waves: number(stats.waves),
    bestChain: number(stats.bestChain),
    bounties: number(stats.bounties),
    cleanWaves: number(stats.cleanWaves),
    coreHp: number(stats.coreHp),
  };
}

/**
 * Progress for each contract, for the HUD, the lobby and the result card.
 *
 * @returns {Array<{id,name,goal,reward,current,target,done,ratio}>}
 */
export function contractProgress(contracts, stats) {
  const live = normaliseStats(stats);
  return (contracts || []).map((contract) => {
    const current = Math.max(0, Number(live[contract.stat]) || 0);
    const target = Math.max(1, Number(contract.target) || 1);
    return {
      id: contract.id,
      name: contract.name,
      goal: contract.goal,
      reward: contract.reward,
      current,
      target,
      done: current >= target,
      ratio: Math.min(1, current / target),
    };
  });
}

/**
 * The score a seat's contracts are worth, and which ones paid.
 *
 * @returns {{ total:number, done:string[] }}
 */
export function contractScore(contracts, stats) {
  const rows = contractProgress(contracts, stats);
  const done = rows.filter((row) => row.done);
  return {
    total: done.reduce((sum, row) => sum + (Number(row.reward) || 0), 0),
    done: done.map((row) => row.id),
  };
}
