/**
 * Merge Sort — student-written, stable, top-down (recursive) implementation.
 *
 * Idea (divide and conquer):
 *   1. DIVIDE   the array into a left half and a right half.
 *   2. CONQUER  sort each half recursively (an array of 0 or 1 items is sorted).
 *   3. COMBINE  merge the two sorted halves by repeatedly taking the smaller
 *               front element (according to `compare`).
 *
 * Why O(n log n)?
 *   Halving the array repeatedly produces about log2(n) levels of recursion.
 *   At every level, the merge steps together touch each of the n elements once,
 *   so each level costs O(n). n work × log2(n) levels = O(n log n).
 *   This holds for the best, average and worst case (input order doesn't matter).
 *
 * Space: O(n) auxiliary arrays for merging + O(log n) recursion stack.
 *
 * Stability: when compare(a, b) === 0 the LEFT element is taken first, so
 * records that tie keep their original relative order.
 *
 * Statistics collected during the actual run:
 *   elements      – n, number of input elements
 *   comparisons   – number of times `compare` was called
 *   merges        – number of merge operations performed
 *   writes        – number of elements written into merged output arrays
 *   maxDepth      – deepest recursion level reached (root = 0)
 *
 * Built-in Array.prototype.sort() is intentionally NOT used.
 *
 * @template T
 * @param {T[]} items                       input array (not modified)
 * @param {(a:T, b:T) => number} compare    negative if a should come first
 * @returns {{ sorted: T[], stats: {elements:number, comparisons:number, merges:number, writes:number, maxDepth:number} }}
 */
export function mergeSort(items, compare) {
  const stats = { elements: items.length, comparisons: 0, merges: 0, writes: 0, maxDepth: 0 };

  // Copy so the caller's array is never mutated.
  const copy = new Array(items.length);
  for (let i = 0; i < items.length; i++) copy[i] = items[i];

  const sorted = sortRange(copy, compare, stats, 0);
  return { sorted, stats };
}

function sortRange(arr, compare, stats, depth) {
  if (depth > stats.maxDepth) stats.maxDepth = depth;
  if (arr.length <= 1) return arr; // base case: already sorted

  const mid = Math.floor(arr.length / 2);
  const leftPart = new Array(mid);
  const rightPart = new Array(arr.length - mid);
  for (let i = 0; i < mid; i++) leftPart[i] = arr[i];
  for (let i = mid; i < arr.length; i++) rightPart[i - mid] = arr[i];

  const left = sortRange(leftPart, compare, stats, depth + 1);
  const right = sortRange(rightPart, compare, stats, depth + 1);
  return merge(left, right, compare, stats);
}

function merge(left, right, compare, stats) {
  stats.merges++;
  const result = new Array(left.length + right.length);
  let i = 0;
  let j = 0;
  let k = 0;

  while (i < left.length && j < right.length) {
    stats.comparisons++;
    if (compare(left[i], right[j]) <= 0) {
      result[k++] = left[i++]; // "<=" keeps the sort stable
    } else {
      result[k++] = right[j++];
    }
    stats.writes++;
  }
  // Copy whatever remains (only one of these loops does any work).
  while (i < left.length) {
    result[k++] = left[i++];
    stats.writes++;
  }
  while (j < right.length) {
    result[k++] = right[j++];
    stats.writes++;
  }
  return result;
}
