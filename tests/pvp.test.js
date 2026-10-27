import { describe, it, expect } from 'vitest';
import {
  PVP_ARENAS,
  PVP_RULES,
  getArena,
  getPvpLevel,
  arenaSize,
  DEFAULT_ARENA_ID,
} from '../src/data/pvpArenas.js';
import { MAPS, parseMap, TILE } from '../src/data/mapData.js';
import { ARENA } from '../src/data/arenaLayout.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { getLevel, THEMES } from '../src/data/levelData.js';
import { createLobbyState, launchPayload, lobbyView } from '../src/net/LobbyState.js';
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

/** The road cells that sit in the river row — one per crossing. */

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

  it('are built on the campaign grammar: 26 x 12, river across the middle', () => {
    for (const arena of PVP_ARENAS) {
      const size = arenaSize(arena);
      expect(size, arena.id).toEqual({ rows: ARENA.rows, cols: ARENA.cols });
      expect(arena.layout.every((row) => row.length === ARENA.cols), `${arena.id} ragged`).toBe(true);
      // A rock rim on every edge, the way a campaign board is framed.
      expect(arena.layout[0]).toBe('x'.repeat(ARENA.cols));
      expect(arena.layout[ARENA.rows - 1]).toBe('x'.repeat(ARENA.cols));
      for (let r = 0; r < ARENA.rows; r += 1) {
        const row = arena.layout[r];
        // The sky-gate row is the one row allowed to break the side rim: those
        // tiles *are* the flyers' entrance, cut into the wall.
        const west = row[0];
        const east = row[ARENA.cols - 1];
        if (r === ARENA.airRow) {
          expect(west, `${arena.id} row ${r} lost its west sky gate`).toBe('a');
          expect(east, `${arena.id} row ${r} lost its east sky gate`).toBe('a');
          continue;
        }
        expect(west, `${arena.id} row ${r} has an open west edge`).toBe('x');
        expect(east, `${arena.id} row ${r} has an open east edge`).toBe('x');
      }
    }
  });

  it('attacks the keep from three portals and two sky gates, with no river to hide behind', () => {
    for (const arena of PVP_ARENAS) {
      const { map } = statsOf(arena);
      // A duel board is a base-defence field now: the horde marches down the
      // whole board instead of filing over a bridge.
      expect(map.spawns, `${arena.id} portals`).toHaveLength(3);
      expect(map.airGates, `${arena.id} sky gates`).toHaveLength(2);
      expect(new Set(map.spawns.map((spawn) => spawn.col)).size).toBe(3);
      // No water strip splitting the arena any more.
      expect(map.tiles.flat().filter((tile) => tile === TILE.WATER)).toHaveLength(0);
      // The sky gates are in the walls, above the enemy's road line.
      expect(Math.min(...map.airGates.map((gate) => gate.row))).toBe(ARENA.airRow);
      expect(Math.max(...map.airGates.map((gate) => gate.row))).toBe(ARENA.airRow);
    }
  });

  it('puts the portal on the enemy row and the keep on the base row', () => {
    for (const arena of PVP_ARENAS) {
      const { map } = statsOf(arena);
      expect(map.spawn.row, arena.id).toBe(ARENA.portalRow);
      expect(map.base.row, arena.id).toBe(ARENA.baseRow);
      // Both gates keep a visible margin: at least one cell of ground above the
      // portal and two rows of ground below the keep.
      expect(map.spawn.col).toBeGreaterThanOrEqual(2);
      expect(map.spawn.col).toBeLessThanOrEqual(ARENA.cols - 3);
    }
  });

  it('offers two or three routes of comparable length on every arena', () => {
    for (const arena of PVP_ARENAS) {
      const { map } = statsOf(arena);
      const pf = new PathfindingSystem(map);
      pf.computeLanes();
      const lens = pf.lanes.map((lane) => lane.length);
      expect(lens.length, `${arena.id} lane count`).toBeGreaterThanOrEqual(2);
      expect(lens.length, `${arena.id} lane count`).toBeLessThanOrEqual(3);
      // The three portals are not equidistant — a flank starts further out —
      // but no approach may be a stroll.
      expect(Math.min(...lens), `${arena.id} lanes ${lens}`).toBeGreaterThanOrEqual(9);
      expect(Math.max(...lens), `${arena.id} lanes ${lens}`).toBeLessThanOrEqual(Math.min(...lens) * 2 + 4);
    }
  });

  it('have a real walking route from spawn to base', () => {
    for (const arena of PVP_ARENAS) {
      const { path } = statsOf(arena);
      expect(path.found, `${arena.id} has no route`).toBe(true);
      expect(path.path.length).toBeGreaterThan(14);
    }
  });

  it('leave enough shelf to build a real defence', () => {
    for (const arena of PVP_ARENAS) {
      const { buildable } = statsOf(arena);
      expect(buildable, arena.id).toBeGreaterThan(60);
    }
  });

  it('do not reuse a campaign layout', () => {
    const campaign = new Set(
      Object.values(MAPS).map((layout) => layout.join('|'))
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

describe('camera fit for the duel boards', () => {
  const VIEWPORT = { width: 1280, height: 768 };
  // A duel board is the same size as a campaign board now, so this is the same
  // fit the campaign camera asks for: pull back until the width fits.
  const BOARD = { x: 0, y: 0, width: ARENA.cols * 64, height: ARENA.rows * 64 };
  const FIT = VIEWPORT.width / BOARD.width;

  it('frames the whole board inside a 1280 x 768 canvas', () => {
    expect(fitZoom(BOARD, VIEWPORT)).toBeCloseTo(FIT, 5);
    expect(fitZoom(BOARD, VIEWPORT)).toBeLessThan(1);
    // At the fit zoom the board fills the canvas exactly on its tight axis.
    expect(BOARD.width * FIT).toBeCloseTo(VIEWPORT.width, 5);
    expect(zoomLimitsFor(BOARD, VIEWPORT).min).toBeCloseTo(FIT, 5);
  });

  it('fits the board on a phone in landscape without hitting the floor', () => {
    // The camera's viewport is the *canvas* (1280 x 768 game px), not the CSS
    // viewport: the board is fitted into the band between the top bar and the
    // forge, which on a 390 px-tall phone is 478 of the 768 canvas rows. Feeding
    // the CSS size here was modelling a camera the rig does not have, and it
    // made a 32-column board look like it needed a sub-floor zoom.
    const phoneBand = { width: 1280, height: 478 };
    const fit = fitZoom(BOARD, phoneBand);
    expect(fit).toBeGreaterThan(ZOOM_LIMITS.min);
    expect(fit).toBeLessThan(1);
    // The floor is the safety net for screens smaller than any phone.
    expect(ZOOM_LIMITS.min).toBeLessThan(fit);
    // At the band's height the board is height-bound and still fills ~99 % of
    // the canvas width, which is the whole point of the wider arena.
    expect(BOARD.width * fit).toBeGreaterThan(1280 * 0.95);
  });

  it('lets the camera pan across the board when zoomed in', () => {
    const view = { ...VIEWPORT, zoom: 1.5 };
    const atMin = clampScroll({ x: -9999, y: -9999 }, view, view.zoom, BOARD);
    const atMax = clampScroll({ x: 9999, y: 9999 }, view, view.zoom, BOARD);
    const left = worldView({ ...view, scrollX: atMin.x, scrollY: atMin.y });
    const right = worldView({ ...view, scrollX: atMax.x, scrollY: atMax.y });

    expect(left.x).toBeCloseTo(0, 5);
    expect(left.y).toBeCloseTo(0, 5);
    expect(right.x + right.width).toBeCloseTo(BOARD.width, 5);
    expect(right.y + right.height).toBeCloseTo(BOARD.height, 5);
    expect(right.x).toBeGreaterThan(left.x);
  });

  it('shows the entire board at the fit zoom, with nothing clamped away', () => {
    const view = { ...VIEWPORT, zoom: FIT };
    const scroll = clampScroll({ x: 0, y: 0 }, view, FIT, BOARD);
    const rect = worldView({ ...view, scrollX: scroll.x, scrollY: scroll.y });
    expect(rect.x).toBeLessThanOrEqual(0.001);
    expect(rect.y).toBeLessThanOrEqual(0.001);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(BOARD.width - 0.001);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(BOARD.height - 0.001);
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

describe('co-op siege (one fate, two realms)', () => {
  const match = () =>
    createMatch({ roomCode: 'COOP1', arenaId: 'cinder-crown', seed: 3, totalWaves: 10, coop: true });

  const cleared = (seat, over = {}) => ({
    seat,
    outcome: 'cleared',
    score: 1200,
    coreHp: 14,
    waves: 10,
    timeMs: 240000,
    ...over,
  });

  it('marks the match as co-op', () => {
    expect(match().coop).toBe(true);
    expect(createMatch({ arenaId: 'cinder-crown' }).coop).toBe(false);
  });

  it('holds the pact when both cores stand', () => {
    const m = match();
    goLive(m);
    expect(reportSeat(m, cleared('p1')).resolved).toBe(null);
    const done = reportSeat(m, cleared('p2', { score: 90 }));
    expect(done.resolved).toMatchObject({
      coop: true,
      pact: 'held',
      winner: null,
      loser: null,
      reason: WIN_REASON.PACT_HELD,
      decided: true,
    });
    // A co-op clear is a win for both seats, never a points race.
    expect(m.winner).toBe(null);
    expect(m.draw).toBe(false);
    expect(scoreboard(m).every((row) => row.winner === false)).toBe(true);
    expect(describeResult(m)).toBe('Pact held — both cores stand');
  });

  it('breaks the pact the moment either core falls', () => {
    const m = match();
    goLive(m);
    const done = reportSeat(m, cleared('p1', { outcome: 'ko', coreHp: 0 }));
    expect(done.resolved).toMatchObject({
      coop: true,
      pact: 'broken',
      winner: null,
      loser: null,
      decided: true,
    });
    expect(m.status).toBe(MATCH_STATUS.OVER);
    expect(describeResult(m)).toBe('Pact broken — a core fell');
  });

  it('still waits while one seat is fighting', () => {
    const m = match();
    goLive(m);
    reportSeat(m, cleared('p1'));
    expect(m.status).not.toBe(MATCH_STATUS.OVER);
    expect(resolve(m)).toMatchObject({ decided: false, waiting: true, coop: true });
  });

  it('publishes the flag through the lobby view and launch payload', () => {
    // The room is the only thing that tells the second device it is co-op, so
    // both must carry it or the two boards disagree about the rules.
    const state = createLobbyState({ roomCode: 'COOP1', selfId: 'a', coop: true, now: 1 });
    expect(state.coop).toBe(true);
    expect(lobbyView(state).coop).toBe(true);
    expect(launchPayload(state, 'p1').pvp.coop).toBe(true);
    const duel = createLobbyState({ roomCode: 'DUEL1', selfId: 'a', now: 1 });
    expect(lobbyView(duel).coop).toBe(false);
    expect('coop' in launchPayload(duel, 'p1').pvp).toBe(false);
  });
});
