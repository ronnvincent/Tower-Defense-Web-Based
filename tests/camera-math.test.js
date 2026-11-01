import { describe, it, expect } from 'vitest';
import {
  ZOOM_LIMITS,
  clamp,
  clampScroll,
  midpoint,
  panBy,
  pinchTransform,
  screenToWorld,
  smoothTowards,
  worldToScreen,
  worldView,
  zoomAround,
  zoomPercent,
} from '../src/camera/cameraMath.js';

const WORLD = { x: 0, y: 0, width: 1280, height: 768 };

const view = (overrides = {}) => ({
  width: 1280,
  height: 768,
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  ...overrides,
});

describe('camera view model', () => {
  it('at 1× the whole map is visible and screen space equals world space', () => {
    const v = view();
    expect(worldView(v)).toEqual({ x: 0, y: 0, width: 1280, height: 768 });
    expect(screenToWorld(0, 0, v)).toEqual({ x: 0, y: 0 });
    expect(screenToWorld(640, 384, v)).toEqual({ x: 640, y: 384 });
    expect(screenToWorld(1280, 768, v)).toEqual({ x: 1280, y: 768 });
  });

  /*
   * Regression guard: these numbers were produced by a real Phaser 3.90
   * Camera (setBounds + setZoom + preRender + getWorldPoint) in a Node probe,
   * so this model can never silently drift away from what the engine renders.
   */
  it('matches Phaser Camera#getWorldPoint at 2× (verified against the engine)', () => {
    const v = view({ zoom: 2 });
    expect(worldView(v)).toEqual({ x: 320, y: 192, width: 640, height: 384 });
    expect(screenToWorld(0, 0, v)).toEqual({ x: 320, y: 192 });
    expect(screenToWorld(640, 384, v)).toEqual({ x: 640, y: 384 });

    const scrolled = view({ zoom: 2, scrollX: 320 });
    expect(screenToWorld(0, 0, scrolled)).toEqual({ x: 640, y: 192 });
    expect(screenToWorld(1280, 768, scrolled)).toEqual({ x: 1280, y: 576 });
  });

  it('round-trips world → screen → world at fractional zoom', () => {
    for (const zoom of [1, 1.25, 1.5, 2, 2.75, 3]) {
      for (const scrollX of [-200, 0, 150]) {
        const v = view({ zoom, scrollX, scrollY: scrollX / 2 });
        for (const [sx, sy] of [
          [0, 0],
          [321, 654],
          [1279, 767],
        ]) {
          const world = screenToWorld(sx, sy, v);
          const back = worldToScreen(world.x, world.y, v);
          expect(back.x).toBeCloseTo(sx, 6);
          expect(back.y).toBeCloseTo(sy, 6);
        }
      }
    }
  });
});

describe('pointer → world mapping (the bug this replaced)', () => {
  it('no longer uses raw canvas pixels for tile maths', () => {
    // Old code: Math.floor(pointer.x / 64). At 2× zoom that pointed at the
    // wrong half of the map. The new mapping must follow the camera.
    const v = view({ zoom: 2, scrollX: 320, scrollY: 0 });
    const zoomedOut = screenToWorld(1200, 384, v);
    expect(Math.floor(zoomedOut.x / 64)).toBe(19); // the base column
    expect(Math.floor(1200 / 64)).toBe(18); // what the old code would have said
  });
});

describe('zoom around the cursor', () => {
  it('keeps the world point under the cursor pinned while zooming in', () => {
    const before = view();
    const cursor = { x: 900, y: 500 };
    const anchor = screenToWorld(cursor.x, cursor.y, before);

    const result = zoomAround(before, WORLD, 2.5, cursor);
    expect(result.zoom).toBe(2.5);

    const after = view({ zoom: result.zoom, scrollX: result.scrollX, scrollY: result.scrollY });
    const still = screenToWorld(cursor.x, cursor.y, after);
    expect(still.x).toBeCloseTo(anchor.x, 4);
    expect(still.y).toBeCloseTo(anchor.y, 4);
  });

  it('clamps zoom to the configured limits', () => {
    const v = view();
    expect(zoomAround(v, WORLD, 99, { x: 640, y: 384 }).zoom).toBe(ZOOM_LIMITS.max);
    expect(zoomAround(v, WORLD, 0.1, { x: 640, y: 384 }).zoom).toBe(ZOOM_LIMITS.min);
  });

  it('never scrolls past the map edges', () => {
    const result = zoomAround(view(), WORLD, 2, { x: 1279, y: 767 });
    const v = view({ zoom: result.zoom });
    expect(result.scrollX).toBeLessThanOrEqual(320);
    expect(result.scrollX).toBeGreaterThanOrEqual(-320);
    expect(result.scrollY).toBeLessThanOrEqual(192);
    expect(result.scrollY).toBeGreaterThanOrEqual(-192);
    expect(clampScroll({ x: 9999, y: -9999 }, v, 2, WORLD)).toEqual({ x: 320, y: -192 });
  });
});

describe('panning', () => {
  it('cannot pan when the whole map already fits', () => {
    expect(panBy(view(), WORLD, 120, 90)).toEqual({ scrollX: 0, scrollY: 0 });
  });

  it('moves the camera opposite to the drag, scaled by zoom', () => {
    const v = view({ zoom: 2 });
    // dragging 100 px right at 2× should move the view 50 world px left
    expect(panBy(v, WORLD, 100, 0).scrollX).toBe(-50);
    expect(panBy(v, WORLD, 0, 100).scrollY).toBe(-50);
  });
});

describe('pinch', () => {
  it('scales with finger spread and keeps the midpoint anchored', () => {
    const startView = view({ zoom: 1.5, scrollX: 100, scrollY: 40 });
    const start = { distance: 100, mid: { x: 640, y: 384 } };
    const current = { distance: 200, mid: { x: 640, y: 384 } };
    const result = pinchTransform(start, current, startView, WORLD);
    expect(result.zoom).toBeCloseTo(3, 6);
  });

  it('pans while pinching (two-finger drag)', () => {
    const startView = view({ zoom: 2 });
    const anchor = screenToWorld(640, 384, startView);
    const start = { distance: 120, mid: { x: 640, y: 384 } };
    const current = { distance: 120, mid: { x: 500, y: 300 } };
    const result = pinchTransform(start, current, startView, WORLD);
    const after = view({ zoom: result.zoom, scrollX: result.scrollX, scrollY: result.scrollY });
    const moved = screenToWorld(500, 300, after);
    expect(moved.x).toBeCloseTo(anchor.x, 4);
    expect(moved.y).toBeCloseTo(anchor.y, 4);
  });

  it('treats a zero starting distance as "no zoom change"', () => {
    const startView = view({ zoom: 2 });
    const result = pinchTransform(
      { distance: 0, mid: { x: 640, y: 384 } },
      { distance: 0, mid: { x: 640, y: 384 } },
      startView,
      WORLD
    );
    expect(result.zoom).toBe(2);
  });
});

describe('helpers', () => {
  it('smoothTowards approaches without overshooting', () => {
    let value = 1;
    for (let i = 0; i < 120; i++) value = smoothTowards(value, 3, 16);
    expect(value).toBeGreaterThan(2.999);
    expect(value).toBeLessThanOrEqual(3);
    expect(smoothTowards(1, 3, 0)).toBe(1);
  });

  it('computes distance and midpoint', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(Math.hypot(3, 4)).toBe(5);
  });

  it('clamps and formats zoom', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 1, 3)).toBe(1);
    expect(zoomPercent(1.5)).toBe('150%');
  });
});
