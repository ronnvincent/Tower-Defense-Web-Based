import { describe, it, expect } from 'vitest';
import { Queue } from '../src/dsa/Queue.js';

describe('Queue (circular buffer)', () => {
  it('starts empty: isEmpty, size 0, dequeue/peek return undefined', () => {
    const q = new Queue();
    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
    expect(q.dequeue()).toBeUndefined();
    expect(q.peek()).toBeUndefined();
  });

  it('follows FIFO order', () => {
    const q = new Queue();
    ['a', 'b', 'c'].forEach((x) => q.enqueue(x));
    expect(q.peek()).toBe('a');
    expect(q.dequeue()).toBe('a');
    expect(q.dequeue()).toBe('b');
    expect(q.size()).toBe(1);
    expect(q.dequeue()).toBe('c');
    expect(q.isEmpty()).toBe(true);
  });

  it('peek does not remove the front item', () => {
    const q = new Queue();
    q.enqueue(1);
    q.peek();
    q.peek();
    expect(q.size()).toBe(1);
  });

  it('wraps around the end of the buffer without shifting', () => {
    const q = new Queue(4);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.dequeue(); // head moves to index 1
    q.dequeue(); // head moves to index 2
    q.enqueue(4);
    q.enqueue(5); // stored at index 0 (wrapped)
    q.enqueue(6); // stored at index 1 (wrapped)
    expect(q.capacity).toBe(4); // no resize needed
    expect(q.toArray()).toEqual([3, 4, 5, 6]);
    expect([q.dequeue(), q.dequeue(), q.dequeue(), q.dequeue()]).toEqual([3, 4, 5, 6]);
  });

  it('grows when full and keeps FIFO order across the resize', () => {
    const q = new Queue(2);
    for (let i = 0; i < 100; i++) q.enqueue(i);
    expect(q.size()).toBe(100);
    expect(q.capacity).toBeGreaterThanOrEqual(100);
    for (let i = 0; i < 100; i++) expect(q.dequeue()).toBe(i);
    expect(q.stats.resizes).toBeGreaterThan(0);
  });

  it('grows correctly when the content is wrapped', () => {
    const q = new Queue(4);
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    q.dequeue();
    q.enqueue('d');
    q.enqueue('e'); // wrapped and full
    q.enqueue('f'); // triggers resize
    expect(q.toArray()).toEqual(['b', 'c', 'd', 'e', 'f']);
  });

  it('counts lifetime enqueue/dequeue operations', () => {
    const q = new Queue();
    q.enqueue(1);
    q.enqueue(2);
    q.dequeue();
    q.dequeue();
    q.dequeue(); // empty dequeue is not counted
    expect(q.stats.enqueued).toBe(2);
    expect(q.stats.dequeued).toBe(2);
  });

  it('clear() empties the queue', () => {
    const q = new Queue();
    q.enqueue(1);
    q.clear();
    expect(q.isEmpty()).toBe(true);
    expect(q.dequeue()).toBeUndefined();
  });
});
