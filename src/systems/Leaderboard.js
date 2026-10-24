import { mergeSort } from '../dsa/MergeSort.js';
import { linearSearch } from '../dsa/LinearSearch.js';
import { getDefaultStorage, readJSON, writeJSON, removeKey } from '../utils/storage.js';
import { LEADERBOARD_DISPLAY_LIMIT, LEADERBOARD_STORE_LIMIT, STORAGE_KEYS } from '../config/gameConfig.js';

/**
 * Leaderboard — LOCAL high-score table stored in this browser's localStorage.
 * (It is not an online leaderboard; sharing scores between devices would need
 * a backend server, which this project intentionally does not use.)
 *
 * Record shape:
 *   { id, name, score, waves, timeMs, timestamp, result }
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
  return { id, name, score: Math.floor(score), waves, timeMs: Math.round(timeMs), timestamp, result };
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
   * All records ranked with our Merge Sort. Statistics of this sort are kept
   * in `lastSortStats` for the statistics panel.
   */
  getRanked() {
    const { sorted, stats } = mergeSort(this.records, compareRecords);
    this.lastSortStats = stats;
    this.sortsPerformed++;
    this.totalComparisons += stats.comparisons;
    return sorted;
  }

  /** Top N records for display (N = 10 by default). */
  getTop(limit = LEADERBOARD_DISPLAY_LIMIT) {
    const ranked = this.getRanked();
    const top = [];
    for (let i = 0; i < ranked.length && i < limit; i++) top.push(ranked[i]);
    return top;
  }

  /**
   * Add a finished game. The list is re-ranked with Merge Sort and only the
   * best LEADERBOARD_STORE_LIMIT records are kept in storage.
   * @returns {{record:object|null, rank:number, saved:boolean}} rank is 1-based (0 = not ranked)
   */
  addRecord({ name, score, waves, timeMs, result }, now = Date.now()) {
    const record = normalizeRecord({
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      score,
      waves,
      timeMs,
      timestamp: now,
      result,
    });
    if (!record) return { record: null, rank: 0, saved: false };

    this.records.push(record);
    const ranked = this.getRanked();
    const kept = [];
    for (let i = 0; i < ranked.length && i < LEADERBOARD_STORE_LIMIT; i++) kept.push(ranked[i]);
    this.records = kept;
    const saved = writeJSON(this.storage, this.key, kept);
    this.loadStatus = 'ok';

    const rank = this.findRank(record.id, kept);
    return { record, rank, saved };
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
