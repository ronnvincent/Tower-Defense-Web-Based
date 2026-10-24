import { describe, it, expect } from 'vitest';
import {
  PVP_ARENAS,
  PVP_RULES,
  getArena,
  getPvpLevel,
  arenaSize,
  DEFAULT_ARENA_ID,
} from '../src/data/pvpArenas.js';
import { parseMap, TILE } from '../src/data/mapData.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { getLevel, THEMES } from '../src/data/levelData.js';
import { ZOOM_LIMITS, clampScroll, fitZoom, worldView, zoomLimitsFor } from '../src/camera/cameraMath.js';
import {
  MATCH_STATUS,
  WIN_REASON,
  beginCountdown,
  createMatch,
  describeResult,
  forfeit,
  goLive,
  renameSeat,
  reportProgress,
  reportSeat,
  resolve,
  scoreboard,
  setReady,
} from '../src/systems/PvpMatch.js';

/** S and B are a mirrored pair, so symmetry is checked on a shared symbol. */
const gate = (ch) => (ch === 'S' || ch === 'B' ? 'G' : ch);

const isSymmetric = (layout) => {
  const rows = layout.length;
  const cols = layout[0].length;
  return layout.every((row, r) =>
    row.split('').every((ch, c) => gate(layout[rows - 1 - r][cols - 1 - c]) === gate(ch))
  );
};

const statsOf = (arena) => {
  const map = parseMap(arena.layout);
  const path = new PathfindingSystem(map).computeMainPath();
  const buildable = map.tiles.flat().filter((tile) => tile === TILE.GRASS).length;
  return { map, path, buildable };
};

describe('duel arenas', () => {
  it('ships at least three arenas with unique ids and themes', () => {
    expect(PVP_ARENAS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PVP_ARENAS.map((a) => a.id)).size).toBe(PVP_ARENAS.length);
    expect(new Set(PVP_ARENAS.map((a) => a.theme)).size).toBeGreaterThanOrEqual(3);
    for (const arena of PVP_ARENAS) {
      expect(THEMES[arena.theme], `${arena.id} has an unknown theme`).toBeTruthy();
    }
  });

  it('are all 26 x 16 — a third larger than a campaign map on both axes', () => {
    for (const arena of PVP_ARENAS) {
      const size = arenaSize(arena);
      expect(size, arena.id).toEqual({ rows: 16, cols: 26 });
      expect(arena.layout.every((row) => row.length === 26), `${arena.id} ragged`).toBe(true);
    }
  });

  it('are 180-degree symmetric, so both seats get exactly the same battlefield', () => {
    for (const arena of PVP_ARENAS) {
      expect(isSymmetric(arena.layout), `${arena.id} is not symmetric`).toBe(true);
    }
  });

  it('mirror the gates: one spawn and one base, each other\'s rotation', () => {
    for (const arena of PVP_ARENAS) {
      const { map } = statsOf(arena);
      expect(map.spawn, arena.id).toEqual({ row: 7, col: 1 });
      expect(map.base, arena.id).toEqual({ row: 8, col: 24 });
    }
  });

  it('have a real walking route from spawn to base', () => {
    for (const arena of PVP_ARENAS) {
      const { path } = statsOf(arena);
      expect(path.found, `${arena.id} has no route`).toBe(true);
      expect(path.path.length).toBeGreaterThan(28);
    }
  });

  it('leave enough shelf to build a real defence on both halves', () => {
    for (const arena of PVP_ARENAS) {
      const { map, buildable } = statsOf(arena);
      expect(buildable, arena.id).toBeGreaterThan(150);
      // Both halves must be usable, not just the side the gates happen to favour.
      const half = Math.floor(map.cols / 2);
      const left = map.tiles.flatMap((row) => row.slice(0, half)).filter((t) => t === TILE.GRASS).length;
      const right = map.tiles.flatMap((row) => row.slice(half)).filter((t) => t === TILE.GRASS).length;
      expect(Math.abs(left - right), `${arena.id} halves are lopsided`).toBeLessThanOrEqual(2);
    }
  });

  it('do not reuse a campaign layout', () => {
    const campaign = new Set(
      ['level-1', 'level-2', 'level-3', 'level-4', 'level-5']
        .map((id) => {
          const level = getLevel(id);
          return level?.mapLayout ? level.mapLayout.join('|') : null;
        })
        .filter(Boolean)
    );
    for (const arena of PVP_ARENAS) {
      expect(campaign.has(arena.layout.join('|')), `${arena.id} duplicates a campaign map`).toBe(false);
    }
  });
});

describe('duel level contract', () => {
  it('gives both seats byte-identical rules', () => {
    for (const arena of PVP_ARENAS) {
      const a = getPvpLevel(arena.id);
      const b = getPvpLevel(arena.id);
      expect(a).toEqual(b);
      expect(a.startingCoins).toBe(PVP_RULES.startingCoins);
      expect(a.baseHealth).toBe(PVP_RULES.baseHealth);
      expect(a.enemyHealthScale).toBe(PVP_RULES.enemyHealthScale);
      expect(a.pvp).toBe(true);
    }
  });

  it('runs the same eight-wave script with a real boss on the last wave', () => {
    for (const arena of PVP_ARENAS) {
      const level = getPvpLevel(arena.id);
      expect(level.waves).toHaveLength(PVP_RULES.waves);
      expect(level.waves.at(-1).bossWave).toBe(true);
      expect(level.waves.at(-1).bossKey).toBe(arena.bossKey);
      expect(ENEMY_TYPES[arena.bossKey], `${arena.bossKey} is not an enemy`).toBeTruthy();
      expect(ENEMY_TYPES[arena.bossKey].isBoss || ENEMY_TYPES[arena.bossKey].boss).toBeTruthy();
    }
  });

  it('only spawns enemy types that exist', () => {
    for (const arena of PVP_ARENAS) {
      for (const wave of getPvpLevel(arena.id).waves) {
        for (const group of wave.groups) {
          expect(ENEMY_TYPES[group.type], `${wave.name}: ${group.type}`).toBeTruthy();
          expect(group.count).toBeGreaterThan(0);
        }
      }
    }
  });

  it('falls back to the first arena for an unknown id', () => {
    expect(getArena('nope').id).toBe(DEFAULT_ARENA_ID);
    expect(getPvpLevel('nope').arenaId).toBe(DEFAULT_ARENA_ID);
  });
});

describe('camera fit for larger maps', () => {
  const VIEWPORT = { width: 1280, height: 768 };
  const CAMPAIGN = { x: 0, y: 0, width: 20 * 64, height: 12 * 64 };
  const ARENA = { x: 0, y: 0, width: 26 * 64, height: 16 * 64 };

  it('keeps the campaign framed at exactly 1x', () => {
    expect(fitZoom(CAMPAIGN, VIEWPORT)).toBe(1);
    expect(zoomLimitsFor(CAMPAIGN, VIEWPORT).min).toBe(1);
  });

  it('pulls a duel arena back so the whole battlefield fits', () => {
    const fit = fitZoom(ARENA, VIEWPORT);
    expect(fit).toBeCloseTo(0.75, 5);
    expect(fit).toBeLessThan(1);
    // At the fit zoom the arena fills the canvas exactly on its tight axis.
    expect(ARENA.height * fit).toBeCloseTo(VIEWPORT.height, 5);
  });

  it('never zooms out below the hard floor on a tiny screen', () => {
    const phone = { width: 844, height: 390 };
    expect(fitZoom(ARENA, phone)).toBe(ZOOM_LIMITS.min);
    expect(ZOOM_LIMITS.min).toBeLessThan(1);
  });

  it('lets the arena pan from one gate to the other', () => {
    const view = { ...VIEWPORT, zoom: 1.5 };
    const atMin = clampScroll({ x: -9999, y: -9999 }, view, view.zoom, ARENA);
    const atMax = clampScroll({ x: 9999, y: 9999 }, view, view.zoom, ARENA);
    const left = worldView({ ...view, scrollX: atMin.x, scrollY: atMin.y });
    const right = worldView({ ...view, scrollX: atMax.x, scrollY: atMax.y });

    expect(left.x).toBeCloseTo(0, 5);
    expect(left.y).toBeCloseTo(0, 5);
    expect(right.x + right.width).toBeCloseTo(ARENA.width, 5);
    expect(right.y + right.height).toBeCloseTo(ARENA.height, 5);
    expect(right.x).toBeGreaterThan(left.x);
  });

  it('shows the entire arena at the fit zoom, with nothing clamped away', () => {
    const fit = fitZoom(ARENA, VIEWPORT);
    const view = { ...VIEWPORT, zoom: fit };
    const scroll = clampScroll({ x: 0, y: 0 }, view, fit, ARENA);
    const rect = worldView({ ...view, scrollX: scroll.x, scrollY: scroll.y });
    expect(rect.x).toBeLessThanOrEqual(0.001);
    expect(rect.y).toBeLessThanOrEqual(0.001);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(ARENA.width - 0.001);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(ARENA.height - 0.001);
  });
});

describe('duel match state machine', () => {
  const match = () =>
    createMatch({ roomCode: 'ABCD', arenaId: 'frostspine', seed: 7, totalWaves: 8 });

  const cleared = (seat, over = {}) => ({
    seat,
    outcome: 'cleared',
    score: 1000,
    coreHp: 20,
    waves: 8,
    timeMs: 300000,
    ...over,
  });

  it('starts in the lobby with two empty seats', () => {
    const m = match();
    expect(m.status).toBe(MATCH_STATUS.LOBBY);
    expect(m.seats.map((s) => s.id)).toEqual(['p1', 'p2']);
    expect(m.seats.every((s) => !s.ready && !s.result)).toBe(true);
  });

  it('needs both seats ready before the countdown', () => {
    const m = match();
    expect(beginCountdown(m).started).toBe(false);
    setReady(m, 'p1');
    expect(beginCountdown(m).started).toBe(false);
    setReady(m, 'p2');
    expect(beginCountdown(m, 100).started).toBe(true);
    expect(m.status).toBe(MATCH_STATUS.COUNTDOWN);
    goLive(m, 200);
    expect(m.status).toBe(MATCH_STATUS.LIVE);
    expect(m.startedAt).toBe(100);
  });

  it('ignores ready toggles outside the lobby', () => {
    const m = match();
    setReady(m, 'p1');
    setReady(m, 'p2');
    beginCountdown(m);
    const before = m.seats[0].ready;
    setReady(m, 'p1', false);
    expect(m.seats[0].ready).toBe(before);
  });

  it('ends on the first knockout', () => {
    const m = match();
    goLive(m);
    const { resolved } = reportSeat(m, { seat: 'p2', outcome: 'ko', score: 300, coreHp: 0, waves: 4 });
    expect(resolved.winner).toBe('p1');
    expect(resolved.reason).toBe(WIN_REASON.KNOCKOUT);
    expect(m.status).toBe(MATCH_STATUS.OVER);
    expect(m.loser).toBe('p2');
  });

  it('knocks out immediately even if the rival already cleared', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1'));
    expect(m.status).toBe(MATCH_STATUS.LIVE); // waiting for p2
    const { resolved } = reportSeat(m, { seat: 'p2', outcome: 'ko', score: 9000, coreHp: 0, waves: 7 });
    expect(resolved.winner).toBe('p1');
    expect(resolved.reason).toBe(WIN_REASON.KNOCKOUT);
  });

  it('holds the match open while one seat is still fighting', () => {
    const m = match();
    goLive(m);
    m.seats[1].progress = { ...m.seats[1].progress, wave: 5 };
    const out = reportSeat(m, cleared('p1'));
    expect(out.resolved).toBeNull();
    expect(resolve(m).waiting).toBe(true);
    expect(m.status).toBe(MATCH_STATUS.LIVE);
  });

  it('decides two clears on points', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1', { score: 1000 }));
    const { resolved } = reportSeat(m, cleared('p2', { score: 1400 }));
    expect(resolved.winner).toBe('p2');
    expect(resolved.reason).toBe(WIN_REASON.POINTS);
  });

  it('breaks a points tie on core integrity, then on time', () => {
    const coreTie = match();
    goLive(coreTie);
    reportSeat(coreTie, cleared('p1', { score: 1000, coreHp: 25 }));
    expect(reportSeat(coreTie, cleared('p2', { score: 1000, coreHp: 18 })).resolved).toMatchObject({
      winner: 'p1',
      reason: WIN_REASON.CORE,
    });

    const timeTie = match();
    goLive(timeTie);
    reportSeat(timeTie, cleared('p1', { score: 1000, coreHp: 20, timeMs: 400000 }));
    expect(reportSeat(timeTie, cleared('p2', { score: 1000, coreHp: 20, timeMs: 320000 })).resolved).toMatchObject({
      winner: 'p2',
      reason: WIN_REASON.TIME,
    });
  });

  it('calls an exact tie a draw', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1'));
    const { resolved } = reportSeat(m, cleared('p2'));
    expect(resolved.draw).toBe(true);
    expect(m.winner).toBeNull();
    expect(m.status).toBe(MATCH_STATUS.OVER);
  });

  it('ignores a second report from the same seat', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1'));
    const snapshot = JSON.stringify(m.seats[0].result);
    reportSeat(m, cleared('p1', { score: 99999 }));
    expect(JSON.stringify(m.seats[0].result)).toBe(snapshot);
  });

  it('forfeits a seat that never reported, awarding the seat that finished', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1'));
    const { resolved } = forfeit(m, 'p2');
    expect(resolved.winner).toBe('p1');
    expect(resolved.reason).toBe(WIN_REASON.FORFEIT);
    expect(m.status).toBe(MATCH_STATUS.OVER);
  });

  it('awards a walk-out to the player who stayed, never a draw', () => {
    const m = match();
    goLive(m);
    const { resolved } = forfeit(m, 'p1');
    expect(resolved.draw).toBe(false);
    expect(m.winner).toBe('p2');
    expect(m.loser).toBe('p1');
    expect(describeResult(m)).toBe('Challenger wins by forfeit');
  });

  it('tracks rival progress without ending the match', () => {
    const m = match();
    goLive(m);
    reportProgress(m, 'p2', { wave: 3, totalWaves: 8, score: 420, coreHp: 22, alive: true });
    expect(m.seats[1].progress).toMatchObject({ wave: 3, score: 420, coreHp: 22 });
    expect(m.status).toBe(MATCH_STATUS.LIVE);
    expect(m.seats[1].result).toBeNull();
  });

  it('builds a readable scoreboard and summary line', () => {
    const m = match();
    renameSeat(m, 'p1', 'Ronn');
    renameSeat(m, 'p2', 'Kai');
    goLive(m);
    reportSeat(m, cleared('p1', { score: 1200 }));
    reportSeat(m, cleared('p2', { score: 900 }));
    const board = scoreboard(m);
    expect(board[0]).toMatchObject({ name: 'Ronn', score: 1200, outcome: 'cleared', winner: true });
    expect(board[1]).toMatchObject({ name: 'Kai', score: 900, winner: false });
    expect(describeResult(m)).toBe('Ronn wins on points');
  });

  it('clamps a garbage report instead of trusting it', () => {
    const m = match();
    goLive(m);
    reportSeat(m, { seat: 'p1', outcome: 'cleared', score: -50, coreHp: NaN, waves: 'x', timeMs: -1 });
    expect(m.seats[0].result).toMatchObject({ score: 0, coreHp: 0, waves: 0, timeMs: 0 });
  });
});
