// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Leaderboard, normalizeRecord } from '../src/systems/Leaderboard.js';
import { LeaderboardUI } from '../src/ui/LeaderboardUI.js';
import {
  ALL_CATEGORY,
  CATEGORY_IDS,
  LEADERBOARD_CATEGORIES,
  categoryChips,
  categoryFromMode,
  categoryInfo,
  categoryLabel,
  matchesCategory,
  normalizeCategory,
  resolveCategory,
} from '../src/data/leaderboardCategories.js';
import { ALL_LEVELS } from '../src/data/levelData.js';
import { MODES } from '../src/data/modeData.js';
import { PUZZLES, puzzleLevel } from '../src/data/puzzles.js';
import { DEFAULT_ARENA_ID, PVP_ARENAS, getPvpLevel } from '../src/data/pvpArenas.js';

/**
 * Per-mode leaderboards.
 *
 * The device table used to rank every run in one list, so an Endless run that
 * reached wave 60 owned the Campaign board forever — not because the run was
 * better, but because the two runs are not comparable. These tests pin the fix:
 * every mode of play has its own board, a run is filed on the board that
 * matches how it was actually played, and the ranking inside a board only ever
 * compares runs from that board.
 */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

const KEY = 'test-mode-boards';

const run = (over = {}) => ({
  name: 'P',
  score: 100,
  waves: 1,
  timeMs: 1000,
  result: 'defeat',
  mode: 'campaign',
  ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the board roster', () => {
  it('gives every mode of play a board', () => {
    const ids = new Set(CATEGORY_IDS);
    // The War Room roster is the authority on what a "mode" is.
    const expected = {
      rogue: 'rogue',
      titan: 'titan',
      blueprint: 'puzzle',
      coop: 'coop',
    };
    for (const mode of MODES) {
      const board = expected[mode.id] || mode.id;
      expect(ids.has(board), `${mode.id} has no board`).toBe(true);
    }
    // Plus the three boards that are levels rather than roster modes.
    for (const id of ['campaign', 'endless', 'duel']) expect(ids.has(id)).toBe(true);
  });

  it('keeps the overview out of the stored ids', () => {
    expect(CATEGORY_IDS).not.toContain(ALL_CATEGORY.id);
    expect(normalizeCategory(ALL_CATEGORY.id)).toBe('unknown');
  });

  it('describes every board with a label and an empty-state line', () => {
    for (const board of LEADERBOARD_CATEGORIES) {
      expect(board.label.length).toBeGreaterThan(2);
      expect(board.blurb.length).toBeGreaterThan(20);
      expect(categoryInfo(board.id).id).toBe(board.id);
    }
    expect(categoryChips()[0].id).toBe(ALL_CATEGORY.id);
    expect(categoryChips()).toHaveLength(LEADERBOARD_CATEGORIES.length + 1);
  });
});

describe('filing a finished run', () => {
  it('puts each shipped level on its own board', () => {
    const boards = {};
    for (const level of ALL_LEVELS) boards[level.id] = resolveCategory({ level });
    expect(boards).toEqual({
      'level-1': 'campaign',
      'level-2': 'campaign',
      'level-3': 'campaign',
      'level-4': 'campaign',
      'level-5': 'campaign',
      endless: 'endless',
      'titan-rush': 'titan',
      'rogue-siege': 'rogue',
    });
  });

  it('files a puzzle, a duel and a co-op room', () => {
    expect(resolveCategory({ level: puzzleLevel(PUZZLES[0]) })).toBe('puzzle');
    expect(resolveCategory({ level: getPvpLevel(DEFAULT_ARENA_ID) })).toBe('duel');
    expect(resolveCategory({ level: getPvpLevel(DEFAULT_ARENA_ID), coop: true })).toBe('coop');
    // The arena's own data says `pvp`, so the level alone is enough.
    for (const arena of Object.values(PVP_ARENAS)) {
      expect(resolveCategory({ level: getPvpLevel(arena.id) })).toBe('duel');
    }
  });

  it('trusts an explicit mode label over the level', () => {
    // `runModeLabel()` hands back the level's own spelling, hyphens and all.
    expect(resolveCategory({ mode: 'rogue-siege' })).toBe('rogue');
    expect(resolveCategory({ mode: 'titan-rush' })).toBe('titan');
    expect(resolveCategory({ mode: 'puzzle' })).toBe('puzzle');
    expect(resolveCategory({ mode: 'coop', level: { pvp: true } })).toBe('coop');
    expect(resolveCategory({ mode: 'rogue', level: { id: 'level-1' } })).toBe('rogue');
  });

  it('refuses to guess a board for a run it cannot place', () => {
    // Guessing 'campaign' would put an unknown Endless score on the campaign
    // board and own it forever.
    expect(resolveCategory({})).toBe('unknown');
    expect(resolveCategory({ level: { name: 'no id' } })).toBe('unknown');
    expect(normalizeCategory('wibble')).toBe('unknown');
    expect(categoryFromMode('all')).toBeNull();
    expect(categoryFromMode('')).toBeNull();
  });

  it('holds every spelling of a live mode on one board', () => {
    for (const spelling of ['titan', 'titanrush', 'Titan Rush', 'TITAN_RUSH']) {
      expect(categoryFromMode(spelling)).toBe('titan');
    }
    for (const spelling of ['rogue', 'roguesiege', 'Rogue Siege']) {
      expect(categoryFromMode(spelling)).toBe('rogue');
    }
  });

  it('folds the four retired modes into the unfiled bucket', () => {
    // These boards were removed with their modes. A run recorded before that is
    // still on disk, so its spelling has to land somewhere readable instead of
    // resolving to an id no board answers to.
    for (const spelling of ['anomaly', 'anomalies', 'ascension', 'timeattack', 'time-attack', 'Titan_Rush_old', 'contracts', 'contract-board']) {
      if (spelling === 'Titan_Rush_old') continue;
      expect(normalizeCategory(spelling)).toBe('unknown');
      // …and a *new* run is never filed on a retired board.
      expect(categoryFromMode(spelling)).toBeNull();
    }
  });

  it('keeps a retired mode’s recorded run, filed as unfiled', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'Old', score: 7000, waves: 30, mode: 'anomaly' }), 1);
    expect(lb.getTop(10, 'unknown').map((r) => r.name)).toEqual(['Old']);
    // It is not lost from the overview either.
    expect(lb.getTop(10).map((r) => r.name)).toEqual(['Old']);
  });
});

describe('ranking inside a board', () => {
  it('keeps an endless score off the campaign board', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'Cam', score: 900, waves: 6, result: 'victory' }), 1);
    lb.addRecord(run({ name: 'End', score: 90000, waves: 60, mode: 'endless' }), 2);
    lb.addRecord(run({ name: 'Tit', score: 500, waves: 5, mode: 'titan' }), 3);

    expect(lb.getTop(10, 'campaign').map((r) => r.name)).toEqual(['Cam']);
    expect(lb.getTop(10, 'endless').map((r) => r.name)).toEqual(['End']);
    expect(lb.getTop(10, 'titan').map((r) => r.name)).toEqual(['Tit']);
    // The overview still sees all three, biggest first.
    expect(lb.getTop(10).map((r) => r.name)).toEqual(['End', 'Cam', 'Tit']);
  });

  it('ranks a new run within its own board, not the whole device', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    for (let i = 0; i < 5; i++) {
      lb.addRecord(run({ name: `E${i}`, score: 10_000 + i, waves: 40, mode: 'endless' }), i + 1);
    }
    const { rank, record } = lb.addRecord(run({ name: 'Cam', score: 10, waves: 2 }), 99);
    expect(record.mode).toBe('campaign');
    // Eight runs are stored, but this one is first on its own board.
    expect(rank).toBe(1);
    expect(lb.getTop(10, 'campaign')).toHaveLength(1);
  });

  it('counts every board, including the empty ones', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'A' }), 1);
    lb.addRecord(run({ name: 'B', mode: 'endless' }), 2);
    const counts = lb.getCounts();
    expect(counts.all).toBe(2);
    expect(counts.campaign).toBe(1);
    expect(counts.endless).toBe(1);
    // A board with no runs is still a board, so the strip never resizes.
    for (const id of CATEGORY_IDS) expect(typeof counts[id]).toBe('number');
    expect(counts.puzzle).toBe(0);
  });

  it('files a record saved without a mode as unfiled, never as campaign', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    const { record } = lb.addRecord({ name: 'Legacy', score: 5, waves: 1, timeMs: 1, result: 'defeat' });
    expect(record.mode).toBe('unknown');
    expect(lb.getTop(10, 'campaign')).toEqual([]);
    expect(lb.getTop(10, 'unknown').map((r) => r.name)).toEqual(['Legacy']);
    expect(matchesCategory(record, 'all')).toBe(true);
    expect(matchesCategory(record, 'unknown')).toBe(true);
    expect(matchesCategory(record, 'endless')).toBe(false);
  });

  it('survives a stored record whose mode is junk', () => {
    const record = normalizeRecord({
      name: 'X',
      score: 1,
      waves: 1,
      timeMs: 1,
      timestamp: 1,
      mode: { not: 'a board' },
    });
    expect(record.mode).toBe('unknown');
  });

  it('persists the board across a reload', () => {
    const storage = fakeStorage();
    const first = new Leaderboard(storage, KEY);
    first.addRecord(run({ name: 'R', mode: 'rogue' }), 1);
    const reloaded = new Leaderboard(storage, KEY);
    expect(reloaded.getTop(10, 'rogue').map((r) => r.name)).toEqual(['R']);
    expect(reloaded.getTop(10, 'campaign')).toEqual([]);
  });
});

describe('the hall draws a board per mode', () => {
  function mount(lb = new Leaderboard(fakeStorage(), KEY)) {
    document.body.innerHTML = '<div id="modal-container"></div><div id="screen-container"></div>';
    const ui = new LeaderboardUI(document.getElementById('modal-container'), lb, {});
    ui.show();
    ui.tab = 'device';
    ui.render(null);
    return { ui, lb };
  }

  it('gives every mode its own key in the strip', () => {
    const { ui } = mount();
    const keys = [...document.querySelectorAll('[data-lb-mode]')].map((k) => k.dataset.lbMode);
    expect(keys[0]).toBe('all');
    for (const id of CATEGORY_IDS) {
      if (id === 'unknown') continue; // no legacy runs on this device
      expect(keys, `missing key for ${id}`).toContain(id);
    }
    // Eleven playable boards (UNFILED is hidden with no legacy runs) + ALL.
    expect(keys).toHaveLength(LEADERBOARD_CATEGORIES.length - 1 + 1);
    expect(ui.mode).toBe('all');
  });

  it('writes the run count on every key', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'A' }), 1);
    lb.addRecord(run({ name: 'B', mode: 'endless' }), 2);
    mount(lb);
    const count = (id) => document.querySelector(`[data-lb-mode="${id}"] .lb-mode-count`).textContent;
    expect(count('all')).toBe('2');
    expect(count('campaign')).toBe('1');
    expect(count('endless')).toBe('1');
    expect(count('rogue')).toBe('0');
    // An empty board keeps its key but is drawn quieter.
    expect(document.querySelector('[data-lb-mode="rogue"]').classList.contains('is-empty')).toBe(true);
  });

  it('filters the table to the chosen board', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'Cam', score: 900, waves: 6, result: 'victory' }), 1);
    lb.addRecord(run({ name: 'End', score: 90000, waves: 60, mode: 'endless' }), 2);
    mount(lb);

    document.querySelector('[data-lb-mode="campaign"]').click();
    const names = () => [...document.querySelectorAll('.lb-block--device .lb-name')].map((n) => n.textContent.trim());
    expect(names()).toEqual(['Cam']);
    expect(document.querySelector('[data-lb-mode="campaign"]').classList.contains('is-active')).toBe(true);
    // The endless run is not on this board at all.
    expect(names()).not.toContain('End');

    document.querySelector('[data-lb-mode="endless"]').click();
    expect(names()).toEqual(['End']);
  });

  it('names the board a row belongs to on the overview only', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'End', score: 500, waves: 9, mode: 'endless' }), 2);
    const { ui } = mount(lb);
    expect(document.querySelectorAll('.lb-run-mode')).toHaveLength(1);
    expect(document.querySelector('.lb-run-mode').textContent).toBe(categoryLabel('endless'));

    ui.mode = 'endless';
    ui._paint();
    // On the board itself the tag is redundant.
    expect(document.querySelectorAll('.lb-run-mode')).toHaveLength(0);
  });

  it('explains an empty board instead of printing an empty table', () => {
    mount();
    document.querySelector('[data-lb-mode="coop"]').click();
    const cell = document.querySelector('.lb-block--device .empty-table');
    expect(cell).not.toBeNull();
    expect(cell.textContent).toContain(categoryInfo('coop').blurb);
  });

  it('opens on the board of the run that just finished', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    document.body.innerHTML = '<div id="modal-container"></div><div id="screen-container"></div>';
    const ui = new LeaderboardUI(document.getElementById('modal-container'), lb, {});
    ui.show({ status: 'defeat', score: 4000, waves: 22, timeMs: 1000, mode: 'endless' });
    expect(ui.mode).toBe('endless');
  });

  it('opens on this device when a run is waiting to be recorded', () => {
    // The realm tab has no run summary and no RECORD key, so a hall that opened
    // there with a finished run showed the player nothing they could act on.
    const lb = new Leaderboard(fakeStorage(), KEY);
    document.body.innerHTML = '<div id="modal-container"></div><div id="screen-container"></div>';
    const ui = new LeaderboardUI(document.getElementById('modal-container'), lb, {
      cloud: {
        identity: { username: 'Aria' },
        cloudLabel: 'SUPABASE',
        isOnline: false,
        push: vi.fn(async () => ({ ok: true })),
        leaderboard: vi.fn(async () => ({ ok: true, rows: [], total: 0 })),
        myRank: vi.fn(async () => null),
      },
    });
    expect(ui.tab).toBe('realm'); // the ledger is there, so a plain open is realm
    ui.show({ status: 'defeat', mode: 'endless', score: 10, waves: 9, timeMs: 1000 });
    expect(ui.tab).toBe('device');
    expect(document.getElementById('btn-save-score')).not.toBeNull();
  });

  it('records the run on its own board and lands the player there', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    document.body.innerHTML = '<div id="modal-container"></div><div id="screen-container"></div>';
    const ui = new LeaderboardUI(document.getElementById('modal-container'), lb, {});
    ui.show({
      status: 'victory',
      mode: 'titan',
      score: 700,
      waves: 5,
      totalWaves: 5,
      timeMs: 240000,
    });
    expect(document.querySelector('.lb-result-board').textContent).toContain('TITAN RUSH');
    // The old card printed "waves / 6" on every mode; a titan run has five.
    expect(document.querySelector('.result-stats').textContent).toContain('5 / 5');

    document.getElementById('btn-save-score').click();
    expect(ui.mode).toBe('titan');
    expect(lb.getTop(10, 'titan').map((r) => r.name)).toEqual(['KEEPER']);
    expect(document.querySelector('.lb-block--device .highlight-row')).not.toBeNull();
  });

  it('does not print a wave total for an endless run', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    document.body.innerHTML = '<div id="modal-container"></div><div id="screen-container"></div>';
    const ui = new LeaderboardUI(document.getElementById('modal-container'), lb, {});
    ui.show({ status: 'defeat', mode: 'endless', score: 1, waves: 31, timeMs: 1000 });
    const stats = document.querySelector('.result-stats').textContent.replace(/\s+/g, ' ');
    expect(stats).toContain('31');
    expect(stats).not.toContain('31 / 6');
  });

  it('binds each category key exactly once', () => {
    const lb = new Leaderboard(fakeStorage(), KEY);
    lb.addRecord(run({ name: 'A' }), 1);
    const { ui } = mount(lb);
    ui._paint();
    // One repaint, then one click: a stacked listener would paint twice and
    // sort twice, which is how the old tab strip closed the hall on one click.
    ui._paint();
    const before = lb.sortsPerformed;
    document.querySelector('[data-lb-mode="campaign"]').click();
    expect(lb.sortsPerformed - before).toBe(1);
  });
});

describe('the category strip styling', () => {
  const css = readFileSync('src/style.css', 'utf8');
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} is missing from style.css`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('scrolls sideways instead of wrapping into the table', () => {
    const modes = rule('.lb-modes');
    expect(modes).toContain('overflow-x: auto');
    expect(modes).toContain('flex');
    expect(modes).not.toContain('flex-wrap: wrap');
  });

  it('marks the active board in gold and keeps empty boards legible', () => {
    expect(rule('.lb-mode.is-active')).toContain('var(--gold-primary)');
    expect(css).toContain('.lb-mode.is-empty:not(.is-active)');
  });

  it('shrinks the strip before the table on a short landscape phone', () => {
    const short = css.slice(css.indexOf('@media (max-height: 620px)'));
    expect(short).toContain('.lb-mode {');
  });
});
