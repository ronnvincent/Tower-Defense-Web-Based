/**
 * perfProbe.js — the instrumentation the debug overlay reads.
 *
 * A phone is the only device this matters on, and the phone is also the one
 * place where "it feels laggy" cannot be argued with a profiler attached. This
 * module is the smallest thing that makes the hot paths measurable *in situ*:
 * a duration accumulator per named span, plus a counter, with zero allocation
 * and zero clock reads when it is switched off.
 *
 * Off by default. `?debug=1` (see `DebugOverlay.js`) turns it on, and then every
 * `begin()` also emits a real `performance.mark` / `performance.measure` pair, so
 * the spans appear as named rows in the DevTools Performance panel instead of
 * being inferred from `[unattributed]`.
 *
 * What it deliberately is not: a profiler. It records the *last* and the *worst*
 * duration of a span and how many times it ran, which is enough to answer "is
 * `paintCamera` cheap now?" without a 20 MB trace file.
 */

/** @typedef {{ name: string, count: number, last: number, max: number, total: number }} Span */

class PerfProbe {
  constructor() {
    this.enabled = false;
    /** @type {Map<string, Span>} */
    this.spans = new Map();
    this.longTasks = 0;
    this.longTaskMs = 0;
    this._observer = null;
  }

  /**
   * Turn collection on or off.
   *
   * Long tasks are the one thing that cannot be inferred from a span: they are
   * the browser's own verdict on a frame, and they are what a phone feels.
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (typeof PerformanceObserver === 'undefined') return;
    if (this.enabled && !this._observer) {
      try {
        this._observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTasks += 1;
            this.longTaskMs += entry.duration;
          }
        });
        this._observer.observe({ type: 'longtask', buffered: false });
      } catch {
        // Safari and older Chrome have no `longtask`: the rest still works.
        this._observer = null;
      }
    } else if (!this.enabled && this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  /** Monotonic start stamp, or 0 when collection is off. */
  begin(name) {
    if (!this.enabled) return 0;
    const t = performance.now();
    if (typeof performance.mark === 'function') performance.mark(`${name}:start`);
    return t;
  }

  /**
   * Close a span. `started` is whatever `begin()` returned; 0 means "off".
   *
   * One `Map.get` and a handful of arithmetic on a live span, no allocation —
   * this is called from `pointermove` and from the battle's `update`.
   */
  end(name, started) {
    if (!started || !this.enabled) return 0;
    const ms = performance.now() - started;
    if (typeof performance.measure === 'function') {
      try {
        performance.measure(name, `${name}:start`);
      } catch {
        /* a mark that was cleared by a navigation in between */
      }
    }
    let span = this.spans.get(name);
    if (!span) {
      span = { name, count: 0, last: 0, max: 0, total: 0 };
      this.spans.set(name, span);
    }
    span.count += 1;
    span.last = ms;
    span.total += ms;
    if (ms > span.max) span.max = ms;
    return ms;
  }

  /** Add one to a named counter (calls, allocations avoided, anything). */
  count(name) {
    if (!this.enabled) return;
    let span = this.spans.get(name);
    if (!span) {
      span = { name, count: 0, last: 0, max: 0, total: 0 };
      this.spans.set(name, span);
    }
    span.count += 1;
  }

  /** Everything recorded so far, as plain rows for the overlay. */
  snapshot() {
    return [...this.spans.values()];
  }

  reset() {
    this.spans.clear();
    this.longTasks = 0;
    this.longTaskMs = 0;
  }
}

export const perfProbe = new PerfProbe();
