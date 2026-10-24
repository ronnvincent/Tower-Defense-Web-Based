/**
 * Pure geometry for the battlefield camera.
 *
 * Phaser's `Camera` applies zoom around the *centre* of its viewport, so the
 * world rectangle currently on screen is:
 *
 *     worldView.x = scrollX + (width - width / zoom) / 2
 *     worldView.width = width / zoom
 *
 * …and a screen pixel maps to world space as:
 *
 *     world = worldView.x + screenX / zoom
 *
 * Those two lines are the whole contract between the game and the camera. They
 * are deliberately kept here as free functions (no Phaser import) so the
 * pointer → world mapping, the zoom-at-cursor anchor and the pan clamp can all
 * be unit tested in Node — see tests/camera-math.test.js.
 */

/**
 * Absolute zoom range for the battlefield.
 *
 * `min` is a hard floor, not the framing: the real minimum is per-map and comes
 * from {@link zoomLimitsFor}. A campaign map is exactly one canvas wide, so it
 * frames at 1× and can never zoom out (nothing outside the map would show); a
 * 26×16 duel arena is larger than the canvas, so it frames at 0.75× and the
 * player can pull back to watch the rival lane — which is the whole point of
 * the mirrored arena. On a small phone even 0.45× may not fit the whole arena,
 * which is what the arena mini-map is for.
 */
export const ZOOM_LIMITS = Object.freeze({ min: 0.45, max: 3 });

/**
 * The zoom at which `bounds` exactly covers the canvas — never above 1× (the
 * campaign framing) and never below the hard floor.
 * @param {{width:number,height:number}} bounds  map size in world px
 * @param {{width:number,height:number}} viewport  canvas size in screen px
 */
export function fitZoom(bounds, viewport) {
  if (!bounds?.width || !bounds?.height) return 1;
  const width = viewport?.width || bounds.width;
  const height = viewport?.height || bounds.height;
  return clamp(Math.min(width / bounds.width, height / bounds.height), ZOOM_LIMITS.min, 1);
}

/** Per-battlefield zoom range: `min` is the fit zoom, `max` the hard ceiling. */
export function zoomLimitsFor(bounds, viewport) {
  return { min: fitZoom(bounds, viewport), max: ZOOM_LIMITS.max };
}

/** How far (in screen px) a pointer must travel before a press becomes a pan. */
export const DRAG_THRESHOLD = 6;

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** @returns {{x:number,y:number,width:number,height:number}} world-space viewport */
export function worldView(view) {
  const width = view.width / view.zoom;
  const height = view.height / view.zoom;
  return {
    x: view.scrollX + (view.width - width) / 2,
    y: view.scrollY + (view.height - height) / 2,
    width,
    height,
  };
}

/**
 * Convert a pointer position (game/canvas pixels, origin top-left) into world
 * coordinates. This is the function that used to be missing: the old code did
 * `Math.floor(pointer.x / TILE_SIZE)`, which is only correct at zoom 1 with no
 * camera scroll.
 */
export function screenToWorld(screenX, screenY, view) {
  const rect = worldView(view);
  return {
    x: rect.x + screenX / view.zoom,
    y: rect.y + screenY / view.zoom,
  };
}

/** Inverse of {@link screenToWorld}. Used to anchor HUD panels to a tower. */
export function worldToScreen(worldX, worldY, view) {
  const rect = worldView(view);
  return {
    x: (worldX - rect.x) * view.zoom,
    y: (worldY - rect.y) * view.zoom,
  };
}

/**
 * Scroll offset that keeps `world` under the screen point `screen` at `zoom`.
 * The workhorse behind wheel zoom, pinch zoom and "focus this tower".
 */
export function scrollForAnchor(world, screen, viewport, zoom) {
  return {
    x: world.x - viewport.width / 2 - (screen.x - viewport.width / 2) / zoom,
    y: world.y - viewport.height / 2 - (screen.y - viewport.height / 2) / zoom,
  };
}

/**
 * Clamp a scroll offset so the camera never shows anything outside `bounds`.
 * Mirrors Phaser's own Camera#clampX / #clampY maths exactly, so the rig and
 * the engine never disagree about where the edge of the map is.
 */
export function clampScroll(scroll, viewport, zoom, bounds) {
  if (!bounds) return { x: scroll.x, y: scroll.y };
  const displayWidth = viewport.width / zoom;
  const displayHeight = viewport.height / zoom;

  const minX = bounds.x + (displayWidth - viewport.width) / 2;
  const maxX = Math.max(minX, minX + bounds.width - displayWidth);
  const minY = bounds.y + (displayHeight - viewport.height) / 2;
  const maxY = Math.max(minY, minY + bounds.height - displayHeight);

  return { x: clamp(scroll.x, minX, maxX), y: clamp(scroll.y, minY, maxY) };
}

/**
 * Zoom to `targetZoom` while pinning the world point under `screen`.
 * @returns {{zoom:number, scrollX:number, scrollY:number}}
 */
export function zoomAround(view, bounds, targetZoom, screen, limits = ZOOM_LIMITS) {
  const zoom = clamp(targetZoom, limits.min, limits.max);
  const anchor = screenToWorld(screen.x, screen.y, view);
  const scroll = clampScroll(scrollForAnchor(anchor, screen, view, zoom), view, zoom, bounds);
  return { zoom, scrollX: scroll.x, scrollY: scroll.y };
}

/**
 * Pan the camera by a screen-space delta (drag).
 * @returns {{scrollX:number, scrollY:number}}
 */
export function panBy(view, bounds, deltaX, deltaY) {
  const scroll = clampScroll(
    { x: view.scrollX - deltaX / view.zoom, y: view.scrollY - deltaY / view.zoom },
    view,
    view.zoom,
    bounds
  );
  return { scrollX: scroll.x, scrollY: scroll.y };
}

/**
 * Resolve a two-finger pinch.
 *
 * `start` captures the gesture when the second finger landed, `current` the
 * fingers right now. Both are `{ distance, mid: {x, y} }`.
 * The world point that sat under the *starting* midpoint is pinned under the
 * *current* midpoint, which gives natural simultaneous pinch + two-finger pan.
 */
export function pinchTransform(start, current, startView, bounds, limits = ZOOM_LIMITS) {
  const startZoom = startView.zoom;
  const ratio = start.distance > 0 ? current.distance / start.distance : 1;
  const zoom = clamp(startZoom * ratio, limits.min, limits.max);
  const anchor = screenToWorld(start.mid.x, start.mid.y, startView);
  const scroll = clampScroll(
    scrollForAnchor(anchor, current.mid, startView, zoom),
    startView,
    zoom,
    bounds
  );
  return { zoom, scrollX: scroll.x, scrollY: scroll.y };
}

/** Frame-rate independent exponential approach (used for smooth wheel zoom). */
export function smoothTowards(current, target, deltaMs, halfLifeMs = 70) {
  if (halfLifeMs <= 0) return target;
  const t = 1 - Math.pow(2, -Math.max(0, deltaMs) / halfLifeMs);
  return current + (target - current) * t;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Zoom percent label for the HUD (e.g. 1.5 -> "150%"). */
export function zoomPercent(zoom) {
  return `${Math.round(zoom * 100)}%`;
}
