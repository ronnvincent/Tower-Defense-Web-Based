/**
 * Array helpers for the active-object collections (enemies, towers, projectiles).
 *
 * compactInPlace — remove every element that fails `keep`, in ONE pass.
 *   Uses a read index and a write index: kept elements are copied forward,
 *   then the array is truncated. Order is preserved.
 *   Time O(n) for the whole pass, no matter how many elements are removed.
 *   (Calling splice() once per removal would cost O(n) EACH → O(n·k).)
 *
 * swapRemove — remove one known element when order does not matter.
 *   Finds it with a linear scan (O(n)), then moves the last element into its
 *   slot and pops (O(1)) instead of shifting everything after it.
 */
export function compactInPlace(array, keep, onRemove) {
  let write = 0;
  for (let read = 0; read < array.length; read++) {
    const item = array[read];
    if (keep(item)) {
      array[write++] = item;
    } else if (onRemove) {
      onRemove(item);
    }
  }
  const removed = array.length - write;
  array.length = write; // drop stale references at the tail
  return removed;
}

export function swapRemove(array, item) {
  const index = array.indexOf(item);
  if (index === -1) return false;
  const last = array.length - 1;
  if (index !== last) array[index] = array[last];
  array.pop();
  return true;
}
