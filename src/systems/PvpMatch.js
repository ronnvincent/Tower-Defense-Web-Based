/**
 * PvpMatch.js — the rules of a duel, as a pure state machine.
 *
 * Two players, one arena, one wave script. Each seat fights its own copy of the
 * identical horde; the only thing that crosses the wire is a seat's terminal
 * report (cleared the script, or core destroyed) plus a light progress tick for
 * the rival bar. The same module resolves the match on the client and on the
 * relay, so there is never a second opinion about who won.
 *
 * Win conditions, in order:
 *   1. Knockout — the first core that reaches 0 loses immediately.
 *   2. Points    — if both seats clear the script, the higher score wins.
 *   3. Core      — equal score, more core HP left wins.
 *   4. Time      — still tied, the faster clear wins.
 *
 * Nothing here imports Phaser or touches the DOM: `tests/pvp.test.js` drives it
 * directly.
 */

export const SEATS = ['p1', 'p2'];

export const MATCH_STATUS = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  LIVE: 'live',
  OVER: 'over',
});

export const WIN_REASON = Object.freeze({
  KNOCKOUT: 'knockout',
  POINTS: 'points',
  CORE: 'core-hp',
  TIME: 'time',
  FORFEIT: 'forfeit',
  // Co-op has no winner: the pair either holds the arena together or the pact
  // breaks when either core falls.
  PACT_HELD: 'pact-held',
  PACT_BROKEN: 'pact-broken',
});

/** The other seat. Unknown ids fall back to p2 so a bad message can't crash. */
export function opponentOf(seat) {
  return seat === SEATS[0] ? SEATS[1] : SEATS[0];
}

function emptySeat(id) {
  return {
    id,
    name: id === 'p1' ? 'Host' : 'Challenger',
    ready: false,
    /** Terminal report, or null while the seat is still fighting. */
    result: null,
    /** Latest progress tick — drives the rival bar and the minimap dots. */
    progress: { wave: 0, totalWaves: 0, score: 0, coreHp: null, alive: true },
  };
}

/**
 * @param {object} spec
 * @param {string} [spec.roomCode]
 * @param {string} spec.arenaId
 * @param {number} [spec.seed]
 * @param {number} [spec.totalWaves]
 */
export function createMatch({
  roomCode = null,
  arenaId,
  seed = 1,
  totalWaves = 0,
  coop = false,
  now = 0,
} = {}) {
  return {
    roomCode,
    arenaId,
    seed,
    totalWaves,
    coop: Boolean(coop),
    status: MATCH_STATUS.LOBBY,
    seats: [emptySeat(SEATS[0]), emptySeat(SEATS[1])],
    startedAt: 0,
    endedAt: 0,
    winner: null,
    loser: null,
    reason: null,
    createdAt: now,
  };
}

export function getSeat(match, seatId) {
  return match.seats.find((seat) => seat.id === seatId) || null;
}

export function renameSeat(match, seatId, name) {
  const seat = getSeat(match, seatId);
  const clean = String(name || '').trim().slice(0, 16);
  if (seat && clean) seat.name = clean;
  return match;
}

export function setReady(match, seatId, ready = true) {
  const seat = getSeat(match, seatId);
  if (!seat || match.status !== MATCH_STATUS.LOBBY) return { match, changed: false };
  if (seat.ready === Boolean(ready)) return { match, changed: false };
  seat.ready = Boolean(ready);
  return { match, changed: true };
}

export function bothReady(match) {
  return match.seats.every((seat) => seat.ready);
}

/** lobby → countdown. Both seats must be ready. */
export function beginCountdown(match, now = 0) {
  if (match.status !== MATCH_STATUS.LOBBY || !bothReady(match)) {
    return { match, started: false };
  }
  match.status = MATCH_STATUS.COUNTDOWN;
  match.startedAt = now;
  return { match, started: true };
}

/** lobby/countdown → live. A relay may start a match without a countdown. */
export function goLive(match, now = 0) {
  if (match.status !== MATCH_STATUS.COUNTDOWN && match.status !== MATCH_STATUS.LOBBY) return match;
  match.status = MATCH_STATUS.LIVE;
  match.startedAt = match.startedAt || now;
  return match;
}

/**
 * A progress tick from one seat. Ticks never end the match by themselves —
 * they are the "watch your rival" channel.
 */
export function reportProgress(match, seatId, progress = {}) {
  const seat = getSeat(match, seatId);
  if (!seat || match.status === MATCH_STATUS.OVER) return match;
  seat.progress = {
    wave: Math.max(0, Number(progress.wave) || 0),
    totalWaves: Math.max(0, Number(progress.totalWaves) || match.totalWaves || 0),
    score: Math.max(0, Number(progress.score) || 0),
    coreHp: Number.isFinite(progress.coreHp) ? Math.max(0, progress.coreHp) : seat.progress.coreHp,
    alive: progress.alive !== false,
  };
  return match;
}

function normaliseResult(match, seatId, report) {
  return {
    seat: seatId,
    outcome: report.outcome === 'ko' ? 'ko' : 'cleared',
    score: Math.max(0, Math.round(Number(report.score) || 0)),
    coreHp: Math.max(0, Math.round(Number(report.coreHp) || 0)),
    waves: Math.max(0, Number(report.waves) || 0),
    timeMs: Math.max(0, Math.round(Number(report.timeMs) || 0)),
    at: Date.now(),
  };
}

/**
 * Resolve a duel from two seats' states.
 *
 * @returns {{winner:string|null, loser:string|null, reason:string|null,
 *            decided:boolean, waiting:boolean}}
 */
export function resolve(match) {
  const [a, b] = match.seats;
  const ra = a.result;
  const rb = b.result;

  // 0. Co-op Siege: there is no winner, only a pact that holds or breaks.
  //    Either core down = both lose, because the two boards are one fate.
  //    Two clears = both win. Everything in between waits for both seats.
  if (match.coop) {
    if (ra?.outcome === 'ko' || rb?.outcome === 'ko') {
      return {
        winner: null,
        loser: null,
        reason: WIN_REASON.PACT_BROKEN,
        decided: true,
        waiting: false,
        draw: false,
        coop: true,
        pact: 'broken',
      };
    }
    if (ra?.outcome === 'cleared' && rb?.outcome === 'cleared') {
      return {
        winner: null,
        loser: null,
        reason: WIN_REASON.PACT_HELD,
        decided: true,
        waiting: false,
        draw: false,
        coop: true,
        pact: 'held',
      };
    }
    return { winner: null, loser: null, reason: null, decided: false, waiting: true, draw: false, coop: true };
  }

  // 1. Knockout ends the match the moment it happens, whoever has finished.
  if (ra?.outcome === 'ko' || rb?.outcome === 'ko') {
    // Two simultaneous KOs cannot happen in one room (the first report wins),
    // but if a malformed state contains both, nobody wins.
    if (ra?.outcome === 'ko' && rb?.outcome === 'ko') {
      return { winner: null, loser: null, reason: null, decided: true, waiting: false, draw: true };
    }
    const loser = ra?.outcome === 'ko' ? a : b;
    return {
      winner: opponentOf(loser.id),
      loser: loser.id,
      reason: WIN_REASON.KNOCKOUT,
      decided: true,
      waiting: false,
      draw: false,
    };
  }

  // 2. Both cleared → points, then core HP, then time.
  if (ra?.outcome === 'cleared' && rb?.outcome === 'cleared') {
    if (ra.score !== rb.score) {
      return {
        winner: ra.score > rb.score ? a.id : b.id,
        loser: ra.score > rb.score ? b.id : a.id,
        reason: WIN_REASON.POINTS,
        decided: true,
        waiting: false,
        draw: false,
      };
    }
    if (ra.coreHp !== rb.coreHp) {
      return {
        winner: ra.coreHp > rb.coreHp ? a.id : b.id,
        loser: ra.coreHp > rb.coreHp ? b.id : a.id,
        reason: WIN_REASON.CORE,
        decided: true,
        waiting: false,
        draw: false,
      };
    }
    if (ra.timeMs !== rb.timeMs) {
      return {
        winner: ra.timeMs < rb.timeMs ? a.id : b.id,
        loser: ra.timeMs < rb.timeMs ? b.id : a.id,
        reason: WIN_REASON.TIME,
        decided: true,
        waiting: false,
        draw: false,
      };
    }
    return { winner: null, loser: null, reason: null, decided: true, waiting: false, draw: true };
  }

  // 3. One seat finished, the other is still fighting: hold the match open.
  return { winner: null, loser: null, reason: null, decided: false, waiting: true, draw: false };
}

/**
 * Record a seat's terminal report and, if the match is decidable, close it.
 * @returns {{match:object, resolved:object|null, changed:boolean}}
 */
export function reportSeat(match, report, now = Date.now()) {
  const seat = getSeat(match, report?.seat);
  if (!seat || !report) return { match, resolved: null, changed: false };
  if (match.status === MATCH_STATUS.OVER || seat.result) {
    return { match, resolved: null, changed: false };
  }

  seat.result = normaliseResult(match, seat.id, report);
  seat.progress = {
    ...seat.progress,
    wave: seat.result.waves,
    score: seat.result.score,
    coreHp: seat.result.coreHp,
    alive: seat.result.outcome !== 'ko',
  };
  if (match.status === MATCH_STATUS.LOBBY || match.status === MATCH_STATUS.COUNTDOWN) {
    goLive(match, now);
  }

  const outcome = resolve(match);
  if (!outcome.decided) return { match, resolved: null, changed: true };

  match.status = MATCH_STATUS.OVER;
  match.endedAt = now;
  match.winner = outcome.winner;
  match.loser = outcome.loser;
  match.reason = outcome.reason;
  match.draw = Boolean(outcome.draw);
  return { match, resolved: outcome, changed: true };
}

/**
 * Close a match because a seat walked away (quit, closed tab, dropped socket).
 *
 * Walking out of a live duel is a loss, full stop: the player who stayed gets
 * the win and the arena. The alternative — a draw — would reward abandoning a
 * match you are losing, which is exactly the behaviour a ranked mode cannot
 * have.
 */
export function forfeit(match, seatId, now = Date.now()) {
  const seat = getSeat(match, seatId);
  if (!seat || match.status === MATCH_STATUS.OVER) return { match, resolved: null };
  const other = getSeat(match, opponentOf(seatId));
  match.status = MATCH_STATUS.OVER;
  match.endedAt = now;
  match.winner = other?.id || null;
  match.loser = seatId;
  match.reason = WIN_REASON.FORFEIT;
  match.draw = false;
  return {
    match,
    resolved: {
      winner: match.winner,
      loser: match.loser,
      reason: match.reason,
      decided: true,
      waiting: false,
      draw: false,
    },
  };
}

/** The score line the result panel prints, one row per seat. */
export function scoreboard(match) {
  return match.seats.map((seat) => {
    const result = seat.result || seat.progress;
    return {
      seat: seat.id,
      name: seat.name,
      score: result?.score ?? 0,
      coreHp: result?.coreHp ?? seat.progress.coreHp ?? 0,
      waves: result?.waves ?? seat.progress.wave ?? 0,
      outcome: seat.result?.outcome || (match.status === MATCH_STATUS.OVER ? 'dnf' : 'fighting'),
      winner: match.winner === seat.id,
    };
  });
}

/** Human-readable one-liner for the result panel. */
export function describeResult(match) {
  if (match.status !== MATCH_STATUS.OVER) return 'Match in progress';
  if (match.coop) {
    return match.reason === WIN_REASON.PACT_HELD
      ? 'Pact held — both cores stand'
      : 'Pact broken — a core fell';
  }
  if (match.draw) return 'Draw — nobody takes the arena';
  const winner = getSeat(match, match.winner);
  const label = winner?.name || match.winner;
  switch (match.reason) {
    case WIN_REASON.KNOCKOUT:
      return `${label} wins by knockout`;
    case WIN_REASON.POINTS:
      return `${label} wins on points`;
    case WIN_REASON.CORE:
      return `${label} wins on core integrity`;
    case WIN_REASON.TIME:
      return `${label} wins on clear time`;
    case WIN_REASON.FORFEIT:
      return `${label} wins by forfeit`;
    default:
      return `${label} wins`;
  }
}
