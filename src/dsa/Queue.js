/**
 * Queue — a FIFO (First In, First Out) queue implemented as a CIRCULAR BUFFER.
 *
 * Why not use Array.prototype.shift()?
 *   shift() removes index 0 and then moves every remaining element one slot to
 *   the left, which costs O(n) per dequeue. Over a wave of n enemies that can add
 *   up to O(n^2) work.
 *
 * Strategy used here:
 *   - A fixed-size backing array `buffer` of length `capacity`.
 *   - `head`  = index of the front element (next to dequeue).
 *   - `count` = number of stored elements.
 *   - The rear slot is computed as (head + count) % capacity, so indices "wrap
 *     around" the end of the array instead of shifting elements.
 *   - When the buffer is full, it is resized to double the capacity and the
 *     elements are copied in FIFO order (an occasional O(n) copy, which makes
 *     enqueue O(1) *amortized*).
 *
 * Complexity:
 *   enqueue  O(1) amortized (O(n) only on the rare resize)
 *   dequeue  O(1)
 *   peek     O(1)
 *   isEmpty  O(1)
 *   size     O(1)
 *
 * Used by: WaveManager (enemies waiting to spawn) and BFS (the search frontier).
 */
export class Queue {
  /**
   * @param {number} [initialCapacity=16] starting size of the circular buffer
   */
  constructor(initialCapacity = 16) {
    const capacity = Math.max(2, Math.floor(initialCapacity));
    this.buffer = new Array(capacity);
    this.capacity = capacity;
    this.head = 0;
    this.count = 0;

    // Lifetime statistics (used by the in-game statistics panel).
    this.stats = { enqueued: 0, dequeued: 0, resizes: 0 };
  }

  /** Add an item to the back of the queue. */
  enqueue(item) {
    if (this.count === this.capacity) {
      this.#grow();
    }
    const tail = (this.head + this.count) % this.capacity;
    this.buffer[tail] = item;
    this.count++;
    this.stats.enqueued++;
  }

  /**
   * Remove and return the item at the front of the queue.
   * @returns {*} the front item, or `undefined` if the queue is empty
   */
  dequeue() {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // release the reference (avoid stale objects)
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    this.stats.dequeued++;
    return item;
  }

  /**
   * Return (without removing) the item at the front of the queue.
   * @returns {*} the front item, or `undefined` if the queue is empty
   */
  peek() {
    return this.count === 0 ? undefined : this.buffer[this.head];
  }

  /** @returns {boolean} true when the queue holds no items */
  isEmpty() {
    return this.count === 0;
  }

  /** @returns {number} number of items currently stored */
  size() {
    return this.count;
  }

  /** Remove every item (O(capacity) because references are released). */
  clear() {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  /** Copy of the contents in FIFO order — for debugging and tests only. O(n). */
  toArray() {
    const result = [];
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity]);
    }
    return result;
  }

  /** Double the capacity, copying elements so the front ends up at index 0. */
  #grow() {
    const newCapacity = this.capacity * 2;
    const newBuffer = new Array(newCapacity);
    for (let i = 0; i < this.count; i++) {
      newBuffer[i] = this.buffer[(this.head + i) % this.capacity];
    }
    this.buffer = newBuffer;
    this.capacity = newCapacity;
    this.head = 0;
    this.stats.resizes++;
  }
}
