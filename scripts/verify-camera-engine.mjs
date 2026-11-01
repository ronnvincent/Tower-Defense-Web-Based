/**
 * Cross-checks src/camera/cameraMath.js against the *real* Phaser camera.
 *
 * The pure maths is what pointer→tile conversion and the zoom anchor rely on,
 * so it is not enough for it to be "reasonable" — it has to agree with the
 * engine that actually renders the battlefield. This script instantiates a
 * headless Phaser 3 Camera (jsdom stubs only, no WebGL) and compares:
 *
 *   1. worldView          — the on-screen world rectangle
 *   2. screenToWorld      — Camera#getWorldPoint (the pointer → world contract)
 *   3. clampScroll        — Camera#preRender's scroll clamping
 *   4. zoomAround         — the world point under the cursor must stay put
 *
 * Run with: npm run verify:camera
 */
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { worldView, screenToWorld, clampScroll, scrollForAnchor, zoomAround } from '../src/camera/cameraMath.js';

const require = createRequire(import.meta.url);

// --- minimal browser environment so Phaser's device detection can boot ------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
for (const key of ['Element', 'HTMLElement', 'HTMLCanvasElement', 'Image', 'XMLHttpRequest', 'screen', 'location', 'MouseEvent', 'TouchEvent', 'KeyboardEvent', 'CustomEvent', 'Event', 'getComputedStyle', 'Audio']) {
  if (dom.window[key] !== undefined) define(key, dom.window[key]);
}
define('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
define('cancelAnimationFrame', (id) => clearTimeout(id));

const fakeContext = () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
const contextProxy = new Proxy({}, {
  get: (_t, prop) => (prop === 'canvas' ? {} : () => fakeContext()),
  set: () => true,
});
const createElement = dom.window.document.createElement.bind(dom.window.document);
dom.window.document.createElement = (tag) => {
  const el = createElement(tag);
  if (String(tag).toLowerCase() === 'canvas') {
    el.getContext = () => contextProxy;
    el.toDataURL = () => '';
  }
  return el;
};

const Camera = require('phaser/src/cameras/2d/Camera.js');

// --- the comparison ---------------------------------------------------------
const WIDTH = 1280;
const HEIGHT = 768;
const BOUNDS = { x: 0, y: 0, width: WIDTH, height: HEIGHT };

/** A Phaser camera that has already run preRender (scroll clamping applied). */
const cameraAt = (zoom, scrollX, scrollY) => {
  const camera = new Camera(0, 0, WIDTH, HEIGHT);
  camera.setBounds(BOUNDS.x, BOUNDS.y, BOUNDS.width, BOUNDS.height);
  camera.setZoom(zoom);
  camera.scrollX = scrollX;
  camera.scrollY = scrollY;
  camera.preRender();
  return camera;
};

let seed = 0x2f6b1d;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const worst = { view: 0, pointer: 0, clamp: 0, anchor: 0 };
let interiorSamples = 0;
let clampedSamples = 0;

for (let i = 0; i < 2000; i += 1) {
  const zoom = 1 + random() * 2;
  const camera = cameraAt(zoom, (random() - 0.5) * 1400, (random() - 0.5) * 900);
  const view = { width: WIDTH, height: HEIGHT, zoom, scrollX: camera.scrollX, scrollY: camera.scrollY };

  // 1. world rectangle
  const rect = worldView(view);
  worst.view = Math.max(
    worst.view,
    Math.abs(camera.worldView.x - rect.x),
    Math.abs(camera.worldView.y - rect.y),
    Math.abs(camera.worldView.width - rect.width),
    Math.abs(camera.worldView.height - rect.height)
  );

  // 2. pointer → world
  const screen = { x: random() * WIDTH, y: random() * HEIGHT };
  const enginePoint = camera.getWorldPoint(screen.x, screen.y);
  const purePoint = screenToWorld(screen.x, screen.y, view);
  worst.pointer = Math.max(worst.pointer, Math.abs(enginePoint.x - purePoint.x), Math.abs(enginePoint.y - purePoint.y));

  // 3. scroll clamping (feed an out-of-range scroll and compare the result)
  const requested = { x: (random() - 0.5) * 4000, y: (random() - 0.5) * 4000 };
  const engineClamped = cameraAt(zoom, requested.x, requested.y);
  const pureClamped = clampScroll(requested, view, zoom, BOUNDS);
  worst.clamp = Math.max(worst.clamp, Math.abs(engineClamped.scrollX - pureClamped.x), Math.abs(engineClamped.scrollY - pureClamped.y));

  // 4. zoom-at-cursor, only where the camera is free to move (at the map edge
  //    the anchor physically cannot be preserved — the rig clamps instead)
  const nextZoom = Math.min(3, Math.max(1, zoom * (0.5 + random())));
  const wanted = scrollForAnchor(purePoint, screen, view, nextZoom);
  const inside = clampScroll(wanted, view, nextZoom, BOUNDS);
  const free = Math.abs(inside.x - wanted.x) < 1e-6 && Math.abs(inside.y - wanted.y) < 1e-6;
  if (!free) {
    clampedSamples += 1;
    continue;
  }
  interiorSamples += 1;
  const after = cameraAt(nextZoom, wanted.x, wanted.y).getWorldPoint(screen.x, screen.y);
  worst.anchor = Math.max(worst.anchor, Math.abs(after.x - enginePoint.x), Math.abs(after.y - enginePoint.y));

  // keep zoomAround honest too — it must agree with scrollForAnchor + clamp
  const viaHelper = zoomAround(view, BOUNDS, nextZoom, screen);
  // (screenToWorld is the only source of truth for the anchor in both paths)
  if (Math.abs(viaHelper.scrollX - inside.x) > 1e-6 || Math.abs(viaHelper.scrollY - inside.y) > 1e-6) {
    throw new Error(`zoomAround disagrees with scrollForAnchor at zoom ${zoom} → ${nextZoom}`);
  }
}

const pct = (value) => `${(value / 2000) * 100}%`;
const lines = [
  ['worldView vs Camera#worldView', worst.view, 'px (Phaser rounds the rectangle to whole pixels)'],
  ['screenToWorld vs Camera#getWorldPoint', worst.pointer, 'px'],
  ['clampScroll vs Camera#preRender clamp', worst.clamp, 'px'],
  [`zoomAround anchor drift (${interiorSamples} free samples, ${clampedSamples} clamped at map edge = ${pct(clampedSamples)})`, worst.anchor, 'px'],
];

console.log('\nCamera maths vs Phaser 3 engine — 2000 random zoom/scroll samples\n');
for (const [label, value, unit] of lines) {
  console.log(`  ${label.padEnd(78, '.')} ${value.toFixed(6)} ${unit}`);
}

const TOLERANCE = 1; // one pixel — Phaser rounds worldView to integers
const failures = [
  ['worldView', worst.view],
  ['screenToWorld', worst.pointer],
  ['clampScroll', worst.clamp],
  ['zoomAround anchor', worst.anchor],
].filter(([, value]) => value > TOLERANCE);

if (failures.length > 0) {
  console.error(`\n✗ camera maths drifted from the engine: ${failures.map(([name, v]) => `${name} ${v.toFixed(3)}px`).join(', ')}`);
  process.exit(1);
}

console.log('\n✓ camera maths matches Phaser to sub-pixel precision (1 px tolerance)\n');
