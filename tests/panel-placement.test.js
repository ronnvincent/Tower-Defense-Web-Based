import { describe, it, expect } from 'vitest';
import { PANEL_GAP, PANEL_MARGIN, clampPanel, placeInspector } from '../src/ui/panelPlacement.js';

const desktop = { width: 1280, height: 768 };
const panel = { width: 300, height: 360 };

describe('tower inspector placement', () => {
  it('opens to the right of a tower on the left half of the map', () => {
    const spot = placeInspector({ x: 200, y: 300 }, panel, desktop);
    expect(spot.side).toBe('right');
    expect(spot.left).toBe(200 + PANEL_GAP);
    expect(spot.top).toBe(300 - panel.height / 2);
  });

  it('flips to the left when the tower is near the right edge', () => {
    const spot = placeInspector({ x: 1000, y: 400 }, panel, desktop);
    expect(spot.side).toBe('left');
    expect(spot.left).toBe(1000 - PANEL_GAP - panel.width);
  });

  it('clamps vertically so the panel never leaves the battlefield', () => {
    const top = placeInspector({ x: 200, y: 12 }, panel, desktop);
    expect(top.top).toBe(PANEL_MARGIN);

    const bottom = placeInspector({ x: 200, y: 760 }, panel, desktop);
    expect(bottom.top).toBe(desktop.height - panel.height - PANEL_MARGIN);
  });

  it('goes below the tower when neither side has room', () => {
    const spot = placeInspector({ x: 400, y: 200 }, { width: 640, height: 260 }, { width: 900, height: 700 });
    expect(spot.side).toBe('below');
    expect(spot.top).toBe(200 + PANEL_GAP);
  });

  it('always stays inside the viewport, even on a tiny screen', () => {
    const small = { width: 240, height: 200 };
    const spot = placeInspector({ x: 200, y: 150 }, small, { width: 400, height: 300 });
    expect(spot.left).toBeGreaterThanOrEqual(PANEL_MARGIN);
    expect(spot.left).toBeLessThanOrEqual(400 - small.width - PANEL_MARGIN);
    expect(spot.top).toBeGreaterThanOrEqual(PANEL_MARGIN);
    expect(spot.top).toBeLessThanOrEqual(300 - small.height - PANEL_MARGIN);
    expect(['right', 'left', 'below', 'above']).toContain(spot.side);
  });
});

describe('clampPanel', () => {
  it('pulls a dragged panel back into the viewport', () => {
    expect(clampPanel({ left: -80, top: -40 }, panel, desktop)).toEqual({
      left: PANEL_MARGIN,
      top: PANEL_MARGIN,
    });
    expect(clampPanel({ left: 5000, top: 5000 }, panel, desktop)).toEqual({
      left: desktop.width - panel.width - PANEL_MARGIN,
      top: desktop.height - panel.height - PANEL_MARGIN,
    });
  });

  it('leaves an in-bounds panel untouched', () => {
    expect(clampPanel({ left: 120, top: 90 }, panel, desktop)).toEqual({ left: 120, top: 90 });
  });
});
