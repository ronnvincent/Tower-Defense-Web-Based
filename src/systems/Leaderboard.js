import { mergeSort } from '../dsa/MergeSort.js';
import { linearSearch } from '../dsa/LinearSearch.js';
import { getDefaultStorage, readJSON, writeJSON, removeKey } from '../utils/storage.js';
import { LEADERBOARD_DISPLAY_LIMIT, LEADERBOARD_STORE_LIMIT, STORAGE_KEYS } from '../config/gameConfig.js';
import {
  LEADERBOARD_CATEGORIES,
  categoryInfo,
  matchesCategory,
  normalizeCategory,
} from '../data/leaderboardCategories.js';

/**
 * Leaderboard — LOCAL high-score table stored in this browser's localStorage.
 * (It is not an online leaderboard; sharing scores between devices would need
 * a backend server, which this project intentionally does not use.)
 *
 * Record shape:
 *   { id, name, score, waves, timeMs, timestamp, result, mode }
 *
 * `mode` is the board the run belongs on: 'campaign', 'endless', 'titan',
 * 'timeattack', 'rogue', 'anomaly', 'ascension', 'contracts', 'duel', 'coop',
 * 'puzzle', or 'unknown' for runs recorded before the hall kept a mode. Every
 * board is ranked on its own; `getTop()` without a board still returns the
 * combined list, which is what the world-map champions plaque asks for.
 *
 * Ranking rule (implemented by compareRecords and applied by OUR Merge Sort):
 *   1. higher score first
 *   2. more waves completed first
 *   3. shorter completion time first
 *   4. earlier timestamp first (whoever set the score first keeps the rank)
 *   5. id (string order) — guarantees a total, deterministic order
 */
export const MAX_NAME_LENGTH = 16;
const VALID_RESULTS = new Set(['victory', 'defeat']);

export function compareRecords(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.waves !== b.waves) return b.waves - a.waves;
  if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Trim, remove control characters and limit length. Returns '' if nothing is left. */
export function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  let clean = '';
  for (const ch of name.trim()) {
    const code = ch.codePointAt(0);
    if (code < 32 || code === 127) continue; // control characters
    clean += ch;
    if (clean.length >= MAX_NAME_LENGTH) break;
  }
  return clean.trim();
}

/**
 * Validate and normalise one stored record.
 * @returns {object|null} a clean record, or null if it cannot be repaired
 */
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = sanitizeName(raw.name);
  const score = Number(raw.score);
  const waves = Number(raw.waves);
  const timeMs = Number(raw.timeMs);
  const timestamp = Number(raw.timestamp);
  if (!name) return null;
  if (!Number.isFinite(score) || score < 0) return null;
  if (!Number.isInteger(waves) || waves < 0 || waves > 999) return null;
  if (!Number.isFinite(timeMs) || timeMs < 0) return null;
  if (!Number.isFinite(timestamp) || timestamp < 0) return null;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id.slice(0, 64) : `legacy-${timestamp}-${name}`;
  const result = VALID_RESULTS.has(raw.result) ? raw.result : 'defeat';
  // A stored run from before the boards has no mode; it is unfiled, not a
  // campaign run. Guessing would put an old Endless score on the campaign
  // board and own it forever.
  const mode = normalizeCategory(raw.mode);
  return { id, name, score: Math.floor(score), waves, timeMs: Math.round(timeMs), timestamp, result, mode };
}

export class Leaderboard {
  constructor(storage = getDefaultStorage(), key = STORAGE_KEYS.leaderboard) {
    this.storage = storage;
    this.key = key;
    this.records = [];
    this.loadStatus = 'empty';
    this.droppedRecords = 0;
    this.lastSortStats = null;
    this.lastSearch = null;
    this.sortsPerformed = 0;
    this.totalComparisons = 0;
    this.load();
  }

  /** Load records, discarding anything malformed instead of crashing. */
  load() {
    const { status, value, raw } = readJSON(this.storage, this.key);
    this.records = [];
    this.droppedRecords = 0;

    if (status === 'missing' || status === 'unavailable') {
      this.loadStatus = status === 'missing' ? 'empty' : 'unavailable';
      return;
    }
    if (status === 'corrupt' || !Array.isArray(value)) {
      // Keep a backup of the unreadable data, then start fresh.
      writeJSON(this.storage, `${this.key}:corrupt-backup`, raw ?? value);
      removeKey(this.storage, this.key);
      this.loadStatus = 'corrupt';
      return;
    }
    const seenIds = new Set();
    for (const item of value) {
      const record = normalizeRecord(item);
      if (!record || seenIds.has(record.id)) {
        this.droppedRecords++;
        continue;
      }
      seenIds.add(record.id);
      this.records.push(record);
    }
    this.loadStatus = this.droppedRecords > 0 ? 'recovered' : this.records.length ? 'ok' : 'empty';
  }

  /**
   * All records ranked with our Merge Sort, optionally restricted to one board.
   *
   * The filter runs *before* the sort, so a board's comparisons, merges and
   * displayed rank all describe that board alone — an Endless run can never
   * out-rank a Campaign run on the campaign table again.
   *
   * Statistics of this sort are kept in `lastSortStats`.
   *
   * @param {string} [category] a board id, or 'all' for the combined list
   */
  getRanked(category = 'all') {
    const pool = category && category !== 'all'
      ? this.records.filter((record) => matchesCategory(record, category))
      : this.records;
    const { sorted, stats } = mergeSort(pool, compareRecords);
    this.lastSortStats = stats;
    this.sortsPerformed++;
    this.totalComparisons += stats.comparisons;
    return sorted;
  }

  /**
   * Top N records for display (N = 10 by default) on one board.
   * @param {number} [limit]
   * @param {string} [category] a board id, or 'all'
   */
  getTop(limit = LEADERBOARD_DISPLAY_LIMIT, category = 'all') {
    const ranked = this.getRanked(category);
    const top = [];
    for (let i = 0; i < ranked.length && i < limit; i++) top.push(ranked[i]);
    return top;
  }

  /**
   * Add a finished game. The list is re-ranked with Merge Sort and only the
   * best LEADERBOARD_STORE_LIMIT records are kept in storage.
   * @returns {{record:object|null, rank:number, saved:boolean}} rank is 1-based (0 = not ranked)
   */
  addRecord({ name, score, waves, timeMs, result, mode }, now = Date.now()) {
    const record = normalizeRecord({
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      score,
      waves,
      timeMs,
      timestamp: now,
      result,
      mode,
    });
    if (!record) return { record: null, rank: 0, saved: false };

    this.records.push(record);
    const ranked = this.getRanked();
    const kept = [];
    for (let i = 0; i < ranked.length && i < LEADERBOARD_STORE_LIMIT; i++) kept.push(ranked[i]);
    this.records = kept;
    const saved = writeJSON(this.storage, this.key, kept);
    this.loadStatus = 'ok';

    // The rank a player cares about is the one on their own board: "#2 in
    // Endless", not "#37 on everything this browser has ever played".
    const rank = this.findRank(record.id, kept.filter((r) => matchesCategory(r, record.mode)));
    this.lastRankCategory = record.mode;
    return { record, rank, saved };
  }

  /**
   * How many runs sit on each board, for the hall's category chips.
   * Every board is present, including the empty ones, so the strip never
   * changes width as runs are added.
   * @returns {Record<string, number>} board id -> count (plus `all`)
   */
  getCounts() {
    const counts = { all: this.records.length };
    for (const category of LEADERBOARD_CATEGORIES) counts[category.id] = 0;
    for (const record of this.records) {
      const id = normalizeCategory(record.mode);
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }

  /** The runs on one board, newest first — used by the hall's empty state. */
  getCategoryInfo(category) {
    return categoryInfo(category);
  }

  /**
   * Find the 1-based rank of a record id inside a ranked list using Linear
   * Search (the list is ordered by score, not by id, so binary search on the id
   * would be invalid). Returns 0 if not found.
   */
  findRank(id, ranked = this.getRanked()) {
    const { index, comparisons } = linearSearch(ranked, (r) => r.id === id);
    this.lastSearch = { comparisons, found: index !== -1, n: ranked.length };
    return index + 1;
  }

  clear() {
    this.records = [];
    removeKey(this.storage, this.key);
    this.loadStatus = 'empty';
  }
}
