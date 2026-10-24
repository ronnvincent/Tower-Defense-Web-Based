import { describe, it, expect } from 'vitest';
import { mergeSort } from '../src/dsa/MergeSort.js';
import { linearSearch } from '../src/dsa/LinearSearch.js';
import { Leaderboard, compareRecords, normalizeRecord, sanitizeName } from '../src/systems/Leaderboard.js';
import { createMemoryStorage } from '../src/utils/storage.js';

const KEY = 'test-leaderboard';
const asc = (a, b) => a - b;

describe('mergeSort', () => {
  it('handles an empty array', () => {
    const { sorted, stats } = mergeSort([], asc);
    expect(sorted).toEqual([]);
    expect(stats.comparisons).toBe(0);
    expect(stats.merges).toBe(0);
  });

  it('handles a single element', () => {
    expect(mergeSort([7], asc).sorted).toEqual([7]);
  });

  it('sorts numbers and does not mutate the input', () => {
    const input = [5, 3, 9, 1, 5, 0, -2, 8];
    const copy = [...input];
    const { sorted } = mergeSort(input, asc);
    expect(sorted).toEqual([-2, 0, 1, 3, 5, 5, 8, 9]);
    expect(input).toEqual(copy);
  });

  it('matches a reference result on random data', () => {
    for (let trial = 0; trial < 20; trial++) {
      const data = Array.from({ length: 50 + trial }, () => Math.floor(Math.random() * 100));
      const { sorted } = mergeSort(data, asc);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1]).toBeLessThanOrEqual(sorted[i]);
      expect(sorted.length).toBe(data.length);
    }
  });

  it('is stable for equal keys', () => {
    const items = [
      { k: 1, tag: 'a' },
      { k: 0, tag: 'b' },
      { k: 1, tag: 'c' },
      { k: 0, tag: 'd' },
    ];
    const { sorted } = mergeSort(items, (x, y) => x.k - y.k);
    expect(sorted.map((x) => x.tag)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('performs n-1 merges and at most n·log2(n) comparisons', () => {
    const n = 64;
    const data = Array.from({ length: n }, (_, i) => n - i);
    const { stats } = mergeSort(data, asc);
    expect(stats.elements).toBe(n);
    expect(stats.merges).toBe(n - 1);
    expect(stats.comparisons).toBeLessThanOrEqual(n * Math.log2(n));
    expect(stats.writes).toBe(n * Math.log2(n)); // every level writes all n elements
    expect(stats.maxDepth).toBe(Math.log2(n));
  });
});

describe('linearSearch', () => {
  it('finds an element and counts comparisons', () => {
    expect(linearSearch([4, 8, 15], (x) => x === 15)).toEqual({ index: 2, comparisons: 3 });
  });
  it('returns -1 when not found and when the array is empty', () => {
    expect(linearSearch([1, 2], (x) => x === 3).index).toBe(-1);
    expect(linearSearch([], () => true)).toEqual({ index: -1, comparisons: 0 });
  });
});

describe('Leaderboard ranking', () => {
  const rec = (o) => ({ id: o.id, name: 'P', waves: 3, timeMs: 1000, timestamp: 1, result: 'defeat', ...o });

  it('orders by score desc, then waves desc, then time asc, then timestamp asc', () => {
    const records = [
      rec({ id: 'a', score: 500 }),
      rec({ id: 'b', score: 900 }),
      rec({ id: 'c', score: 500, waves: 4 }),
      rec({ id: 'd', score: 500, timeMs: 500 }),
      rec({ id: 'e', score: 500, timeMs: 500, timestamp: 0 }),
    ];
    const { sorted } = mergeSort(records, compareRecords);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'e', 'd', 'a']);
  });

  it('keeps every record when scores are duplicated', () => {
    const records = Array.from({ length: 6 }, (_, i) => rec({ id: `r${i}`, score: 100, timestamp: 10 - i }));
    const { sorted } = mergeSort(records, compareRecords);
    expect(sorted).toHaveLength(6);
    expect(sorted.map((r) => r.id)).toEqual(['r5', 'r4', 'r3', 'r2', 'r1', 'r0']);
  });
});

describe('Leaderboard persistence', () => {
  it('starts empty when nothing is stored', () => {
    const lb = new Leaderboard(createMemoryStorage(), KEY);
    expect(lb.loadStatus).toBe('empty');
    expect(lb.getTop()).toEqual([]);
  });

  it('survives corrupt JSON and keeps a backup', () => {
    const storage = createMemoryStorage({ [KEY]: '{not json' });
    const lb = new Leaderboard(storage, KEY);
    expect(lb.loadStatus).toBe('corrupt');
    expect(lb.getTop()).toEqual([]);
    expect(storage.getItem(`${KEY}:corrupt-backup`)).toContain('not json');
  });

  it('treats a non-array value as corrupt', () => {
    const lb = new Leaderboard(createMemoryStorage({ [KEY]: '{"score":5}' }), KEY);
    expect(lb.loadStatus).toBe('corrupt');
  });

  it('drops malformed records but keeps valid ones', () => {
    const data = [
      { id: 'ok', name: 'Ana', score: 300, waves: 2, timeMs: 5000, timestamp: 1, result: 'defeat' },
      { id: 'bad1', name: '', score: 10, waves: 1, timeMs: 1, timestamp: 1 },
      { id: 'bad2', name: 'X', score: 'lots', waves: 1, timeMs: 1, timestamp: 1 },
      null,
      'string',
      { id: 'ok', name: 'Dup', score: 1, waves: 1, timeMs: 1, timestamp: 1 }, // duplicate id
    ];
    const lb = new Leaderboard(createMemoryStorage({ [KEY]: JSON.stringify(data) }), KEY);
    expect(lb.loadStatus).toBe('recovered');
    expect(lb.droppedRecords).toBe(5);
    expect(lb.getTop().map((r) => r.name)).toEqual(['Ana']);
  });

  it('adds records, ranks them with merge sort and returns the rank', () => {
    const storage = createMemoryStorage();
    const lb = new Leaderboard(storage, KEY);
    lb.addRecord({ name: 'Low', score: 100, waves: 1, timeMs: 1000, result: 'defeat' }, 1000);
    lb.addRecord({ name: 'High', score: 900, waves: 6, timeMs: 1000, result: 'victory' }, 2000);
    const { rank, saved } = lb.addRecord({ name: 'Mid', score: 500, waves: 3, timeMs: 1000, result: 'defeat' }, 3000);
    expect(saved).toBe(true);
    expect(rank).toBe(2);
    expect(lb.getTop().map((r) => r.name)).toEqual(['High', 'Mid', 'Low']);
    expect(lb.lastSortStats.comparisons).toBeGreaterThan(0);
    expect(lb.lastSearch.comparisons).toBe(2);

    // Reload from storage: order and data persist
    const reloaded = new Leaderboard(storage, KEY);
    expect(reloaded.getTop().map((r) => r.name)).toEqual(['High', 'Mid', 'Low']);
  });

  it('limits the display to the top 10', () => {
    const lb = new Leaderboard(createMemoryStorage(), KEY);
    for (let i = 0; i < 15; i++) lb.addRecord({ name: `P${i}`, score: i * 10, waves: 1, timeMs: 1, result: 'defeat' }, i);
    const top = lb.getTop();
    expect(top).toHaveLength(10);
    expect(top[0].name).toBe('P14');
  });

  it('rejects records with an empty name', () => {
    const lb = new Leaderboard(createMemoryStorage(), KEY);
    expect(lb.addRecord({ name: '   ', score: 1, waves: 1, timeMs: 1, result: 'defeat' }).saved).toBe(false);
  });
});

describe('record validation helpers', () => {
  it('sanitizeName trims, strips control characters and limits length', () => {
    expect(sanitizeName('  Ana\u0007  ')).toBe('Ana');
    expect(sanitizeName('A'.repeat(40))).toHaveLength(16);
    expect(sanitizeName(42)).toBe('');
  });
  it('normalizeRecord rejects negative scores and arrays', () => {
    expect(normalizeRecord({ name: 'A', score: -1, waves: 1, timeMs: 1, timestamp: 1 })).toBeNull();
    expect(normalizeRecord([1, 2])).toBeNull();
  });
});
