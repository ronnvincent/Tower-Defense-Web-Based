/**
 * Linear Search — scan an array from index 0 until `predicate` matches.
 *
 * Used to find the rank (position) of the record the player just saved inside
 * the merge-sorted leaderboard, so it can be highlighted. The ranked list is
 * sorted by SCORE, not by record id, so Binary Search on the id would be
 * invalid; a linear scan is the correct choice here.
 *
 * Time: O(n) worst case, O(1) best case.  Space: O(1).
 *
 * @template T
 * @param {T[]} items
 * @param {(item:T, index:number) => boolean} predicate
 * @returns {{ index:number, comparisons:number }} index = -1 when not found
 */
export function linearSearch(items, predicate) {
  let comparisons = 0;
  for (let i = 0; i < items.length; i++) {
    comparisons++;
    if (predicate(items[i], i)) return { index: i, comparisons };
  }
  return { index: -1, comparisons };
}
