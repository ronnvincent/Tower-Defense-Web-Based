import {
  DRAG_THRESHOLD,
  zoomLimitsFor,
  clamp,
  clampScroll,
  distance,
  midpoint,
  panBy,
  pinchTransform,
  screenToWorld,
  scrollForAnchor,
  smoothTowards,
  worldToScreen,
  zoomAround,
} from './cameraMath.js';

/** Wheel sensitivity: e^-deltaY * this. Tuned so one notch ≈ 12% zoom. */
const WHEEL_SENSITIVITY = 0.0016;
/** Per-wheel-event zoom clamp, so fast trackpad flicks cannot jump 1× → 3×. */
const WHEEL_STEP_LIMIT = 0.18;

/**
 * CameraRig — drag-to-pan, wheel/pinch-to-zoom and pointer → world mapping for
 * the battlefield camera.
 *
 * Design notes
 * ------------
 * • Every gesture ends in the same place: `camera.setZoom()` +
 *   `camera.scrollX/Y`, with scroll clamped to the map bounds by cameraMath.
 * • A press only becomes a pan after DRAG_THRESHOLD px, so tapping a tile to
 *   build/inspect is never swallowed by a 1 px hand tremor.
 * • `consumeTap()` lets the scene ask "was that a tap on the map?" *after* the
 *   rig has seen the pointerup (listeners are installed before the scene's).
 *   It also rejects pointerups whose press started on the HTML HUD.
 * • Zoom is smoothed toward `targetZoom`; pinch stays 1:1 for directness.
 */
export class CameraRig {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [options]
   * @param {{x:number,y:number,width:number,height:number}} [options.bounds]
   * @param {(state: object) => void} [options.onZoomChange]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.bounds = options.bounds || {
      x: 0,
      y: 0,
      width: scene.scale.width,
      height: scene.scale.height,
    };
    this.onZoomChange = options.onZoomChange || null;
    // The rig owns the *effective* zoom range for this battlefield: a map that
    // is exactly one canvas wide frames at 1× and cannot zoom out, a larger
    // arena frames further back so both halves stay reachable.
    this.limits = options.limits || zoomLimitsFor(this.bounds, {
      width: scene.scale.width,
      height: scene.scale.height,
    });

    this.pointers = new Map(); // pointer.id -> last known {x, y}
    this.mode = 'idle'; // idle | pending | drag | pinch
    this.suppressTap = false;
    this.lastTap = false;

    this.startPointer = null;
    this.startScroll = null;
    this.pinchStart = null;
    this.pinchView = null;

    this.targetZoom = this.camera.zoom;
    this.zoomScreenPoint = { x: this.camera.width / 2, y: this.camera.height / 2 };
    this.lastNotifiedZoom = -1;

    this._out = { x: 0, y: 0 };
    this._handlers = [];
    this.installed = false;
  }

  /* ------------------------------------------------------------------ setup */

  install() {
    if (this.installed) return this;
    this.installed = true;

    const input = this.scene.input;
    // At least two touch pointers are needed for a pinch (Phaser ships with 1
    // mouse + 1 touch by default).
    if (input.addPointer) input.addPointer(2);
    if (input.mouse && input.mouse.disableContextMenu) input.mouse.disableContextMenu();

    this.camera.setBounds(
      this.bounds.x,
      this.bounds.y,
      this.bounds.width,
      this.bounds.height
    );
    this.camera.setZoom(this.limits.min);
    const start = clampScroll(
      { x: this.bounds.x, y: this.bounds.y },
      this.view,
      this.limits.min,
      this.bounds
    );
    this.camera.setScroll(start.x, start.y);

    this.bind(input, 'pointerdown', (pointer) => this.onPointerDown(pointer));
    this.bind(input, 'pointermove', (pointer) => this.onPointerMove(pointer));
    this.bind(input, 'pointerup', (pointer) => this.onPointerUp(pointer));
    this.bind(input, 'pointerupoutside', (pointer) => this.onPointerUp(pointer));
    this.bind(input, 'wheel', (pointer, over, dx, dy) => this.onWheel(pointer, dy));
    this.bind(this.scene.events, 'shutdown', () => this.destroy());
    this.bind(this.scene.events, 'destroy', () => this.destroy());

    this.bindKeyboard();
    this.notify(true);
    return this;
  }

  bind(emitter, event, handler) {
    emitter.on(event, handler);
    this._handlers.push({ emitter, event, handler });
  }

  bindKeyboard() {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    this.bind(keyboard, 'keydown', (event) => {
      const key = event.key;
      if (key === '+' || key === '=') this.zoomBy(1.25);
      else if (key === '-' || key === '_') this.zoomBy(1 / 1.25);
      else if (key === '0') this.reset();
      else if (key === 'ArrowLeft') this.nudge(-80, 0);
      else if (key === 'ArrowRight') this.nudge(80, 0);
      else if (key === 'ArrowUp') this.nudge(0, -80);
      else if (key === 'ArrowDown') this.nudge(0, 80);
    });
  }

  destroy() {
    if (!this.installed) return;
    for (const { emitter, event, handler } of this._handlers) emitter.off(event, handler);
    this._handlers.length = 0;
    this.installed = false;
    this.pointers.clear();
  }

  /* -------------------------------------------------------------- utilities */

  get view() {
    return {
      width: this.camera.width,
      height: this.camera.height,
      zoom: this.camera.zoom,
      scrollX: this.camera.scrollX,
      scrollY: this.camera.scrollY,
    };
  }

  get isDragging() {
    return this.mode === 'drag' || this.mode === 'pinch';
  }

  get atFit() {
    return this.camera.zoom <= this.limits.min + 0.001;
  }

  /** Pointer (canvas px) → world px. Replaces the old `pointer.x / TILE_SIZE`. */
  screenToWorld(screenX, screenY) {
    const point = screenToWorld(screenX, screenY, this.view);
    this._out.x = point.x;
    this._out.y = point.y;
    return this._out;
  }

  /** World px → canvas px (relative to the canvas, not the page). */
  worldToScreen(worldX, worldY) {
    return worldToScreen(worldX, worldY, this.view);
  }

  /**
   * True when the gesture that just ended was a *tap on the canvas* — a press
   * that started on the map and neither panned nor pinched. Resets on read, so
   * a press that started on a HUD button can never build a tower.
   */
  consumeTap() {
    const tap = this.lastTap && !this.suppressTap;
    this.lastTap = false;
    this.suppressTap = false;
    return tap;
  }

  applyZoomScroll(zoom, scroll) {
    this.camera.setZoom(zoom);
    this.camera.scrollX = scroll.x;
    this.camera.scrollY = scroll.y;
    this.targetZoom = this.camera.zoom;
    this.notify();
  }

  /** Snapshot of everything the HUD needs to draw the zoom controls. */
  zoomState() {
    return {
      zoom: this.camera.zoom,
      min: this.limits.min,
      max: this.limits.max,
      atFit: this.atFit,
      canZoomIn: this.camera.zoom < this.limits.max - 0.001,
      canZoomOut: this.camera.zoom > this.limits.min + 0.001,
    };
  }

  notify(force = false) {
    const rounded = Math.round(this.camera.zoom * 1000) / 1000;
    if (!force && Math.abs(rounded - this.lastNotifiedZoom) < 0.002) return;
    this.lastNotifiedZoom = rounded;
    this.onZoomChange?.(this.zoomState());
  }

  /* ----------------------------------------------------------------- zoom */

  /** Zoom in/out by `factor`, anchored at `screen` (defaults to view centre). */
  zoomBy(factor, screen = null) {
    const anchor = screen || {
      x: this.camera.width / 2,
      y: this.camera.height / 2,
    };
    const next = clamp(this.targetZoom * factor, this.limits.min, this.limits.max);
    this.zoomTo(next, anchor);
  }

  zoomTo(nextZoom, screen = null) {
    const anchor = screen || { x: this.camera.width / 2, y: this.camera.height / 2 };
    const zoom = clamp(nextZoom, this.limits.min, this.limits.max);
    this.zoomScreenPoint = { x: anchor.x, y: anchor.y };
    this.targetZoom = zoom;
    if (Math.abs(zoom - this.camera.zoom) < 0.001) {
      this.applyZoomScroll(zoom, { x: this.camera.scrollX, y: this.camera.scrollY });
    }
  }

  /** Jump (no smoothing) to a zoom level — used by pinch. */
  setZoomImmediate(zoom, screen = null) {
    const anchor = screen || { x: this.camera.width / 2, y: this.camera.height / 2 };
    const result = zoomAround(this.view, this.bounds, zoom, anchor, this.limits);
    this.applyZoomScroll(result.zoom, { x: result.scrollX, y: result.scrollY });
  }

  /** Snap back to the full-map view. */
  reset() {
    this.targetZoom = this.limits.min;
    this.camera.setZoom(this.limits.min);
    const scroll = clampScroll({ x: this.bounds.x, y: this.bounds.y }, this.view, this.limits.min, this.bounds);
    this.camera.scrollX = scroll.x;
    this.camera.scrollY = scroll.y;
    this.notify(true);
  }

  /** Centre the camera on a world point (optionally zooming in to `zoom`). */
  focus(worldX, worldY, zoom = this.camera.zoom) {
    const targetZoom = clamp(zoom, this.limits.min, this.limits.max);
    const scroll = clampScroll(
      scrollForAnchor({ x: worldX, y: worldY }, { x: this.camera.width / 2, y: this.camera.height / 2 }, this.view, targetZoom),
      this.view,
      targetZoom,
      this.bounds
    );
    this.targetZoom = targetZoom;
    this.applyZoomScroll(targetZoom, scroll);
  }

  nudge(dx, dy) {
    const result = panBy(this.view, this.bounds, dx, dy);
    this.camera.scrollX = result.scrollX;
    this.camera.scrollY = result.scrollY;
  }

  /* --------------------------------------------------------------- gestures */

  onPointerDown(pointer) {
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    this.suppressTap = false;
    this.lastTap = false;

    if (this.activeTouchPointers().length >= 2) {
      this.beginPinch();
      return;
    }

    // A press on the canvas is a pan candidate. Any button may start a pan,
    // which keeps trackpad / middle-click users happy.
    this.mode = 'pending';
    this.startPointer = { x: pointer.x, y: pointer.y, id: pointer.id };
    this.startScroll = { x: this.camera.scrollX, y: this.camera.scrollY };
  }

  onPointerMove(pointer) {
    if (!this.pointers.has(pointer.id) && !pointer.isDown) return;
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });

    if (this.mode === 'pinch') {
      this.updatePinch();
      return;
    }
    if (this.mode !== 'pending' && this.mode !== 'drag') return;
    if (!this.startPointer || pointer.id !== this.startPointer.id) return;

    const dx = pointer.x - this.startPointer.x;
    const dy = pointer.y - this.startPointer.y;

    if (this.mode === 'pending' && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      this.mode = 'drag';
      this.scene.game.canvas.classList.add('grabbing');
    }

    if (this.mode === 'drag') {
      this.camera.scrollX = this.startScroll.x - dx / this.camera.zoom;
      this.camera.scrollY = this.startScroll.y - dy / this.camera.zoom;
      const clamped = clampScroll(
        { x: this.camera.scrollX, y: this.camera.scrollY },
        this.view,
        this.camera.zoom,
        this.bounds
      );
      this.camera.scrollX = clamped.x;
      this.camera.scrollY = clamped.y;
    }
  }

  onPointerUp(pointer) {
    const wasGesture = this.mode === 'drag' || this.mode === 'pinch';
    const wasTap = pointer.button === 0 || pointer.button === undefined;
    this.lastTap = this.mode === 'pending' && wasTap;
    this.pointers.delete(pointer.id);

    if (this.mode === 'pinch') {
      // Stay suppressed until every finger is up, then wait for a fresh press.
      this.suppressTap = true;
      if (this.activeTouchPointers().length < 2) {
        this.mode = 'idle';
        this.pinchStart = null;
      }
      return;
    }

    if (wasGesture) {
      this.suppressTap = true;
      this.scene.game.canvas.classList.remove('grabbing');
    }
    this.mode = 'idle';
    this.startPointer = null;
    this.startScroll = null;
  }

  activeTouchPointers() {
    return this.scene.input.manager.pointers.filter(
      (p) => p.isDown && (p.wasTouch || p.pointerType === 'touch')
    );
  }

  beginPinch() {
    const [a, b] = this.activeTouchPointers();
    if (!a || !b) return;
    this.mode = 'pinch';
    this.pinchView = this.view;
    this.pinchStart = {
      distance: Math.max(1, distance(a, b)),
      mid: midpoint(a, b),
    };
    this.scene.game.canvas.classList.add('grabbing');
  }

  updatePinch() {
    const [a, b] = this.activeTouchPointers();
    if (!a || !b || !this.pinchStart) return;
    const current = { distance: Math.max(1, distance(a, b)), mid: midpoint(a, b) };
    const result = pinchTransform(this.pinchStart, current, this.pinchView, this.bounds, this.limits);
    this.camera.setZoom(result.zoom);
    this.camera.scrollX = result.scrollX;
    this.camera.scrollY = result.scrollY;
    this.targetZoom = result.zoom;
    this.notify();
  }

  onWheel(pointer, deltaY) {
    if (!deltaY) return;
    // A wheel tick zooms around the cursor, exactly like a map UI.
    const factor = Math.exp(-deltaY * WHEEL_SENSITIVITY);
    const bounded = clamp(factor, 1 - WHEEL_STEP_LIMIT, 1 + WHEEL_STEP_LIMIT);
    this.zoomBy(bounded, { x: pointer.x, y: pointer.y });
  }

  /* ----------------------------------------------------------------- frame */

  update(deltaMs) {
    if (Math.abs(this.camera.zoom - this.targetZoom) > 0.0015) {
      const zoom = smoothTowards(this.camera.zoom, this.targetZoom, deltaMs, 70);
      const result = zoomAround(
        this.view,
        this.bounds,
        zoom,
        this.zoomScreenPoint,
        this.limits
      );
      this.camera.setZoom(result.zoom);
      this.camera.scrollX = result.scrollX;
      this.camera.scrollY = result.scrollY;
      this.notify();
    } else if (this.camera.zoom !== this.targetZoom) {
      this.camera.setZoom(this.targetZoom);
      this.notify();
    }
  }
}
