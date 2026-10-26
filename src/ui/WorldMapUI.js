/**
 * WorldMapUI.js — the explorable hub.
 *
 * The inner screens used to be a list of stage cards. This is the replacement:
 * one painted continent, a real camera (drag / wheel / pinch / keys), and
 * buildings you can pick out of the map. Everything on it is a live destination
 * — a banner opens the briefing for a real `levelData` stage, the War Room opens
 * the eight modes, the Monument opens the real medals, and so on.
 *
 * Why DOM and not a Phaser scene
 * -------------------------------------------------------------------------
 * Every inner screen in this project is already a DOM overlay over the canvas
 * (`#screen-container`, `#modal-container`, `.overlay-screen`). The map has to
 * sit *behind* those panels and hand off to them, so building it in Phaser
 * would mean a second UI stack, a second focus/ARIA story and a canvas-sized
 * set of hit tests. It is a CSS-transform camera over one 1536×1024 painted
 * plate with `<button>` landmarks: pointer events, keyboard and reduced-motion
 * all come for free, and the art never stretches because the plate is scaled
 * uniformly.
 *
 * Camera model
 * -------------------------------------------------------------------------
 *   `x`,`y`  the plate's top-left corner in screen pixels
 *   `scale`  plate px → screen px (uniform, so nothing is stretched)
 *
 * `minScale` covers the viewport (the plate can never show a bare edge), and
 * `maxScale` stops just past the landmarks' native resolution. Camera memory is
 * stored *plate-relative* (`cx`,`cy`,`zoom`) so a resize between visits — or a
 * fullscreen toggle — restores exactly the same corner of the world.
 */

import {
  PLATE,
  LANDMARKS,
  REGIONS,
  getLandmark,
  landmarkForLevel,
  regionForLevel,
  stageState,
  currentObjective,
  campaignSummary,
} from '../data/worldMap.js';
import { getLevel } from '../data/levelData.js';
import { MODES } from '../data/modeData.js';
import { missionBriefingMarkup, stateLabel } from './MissionBriefingUI.js';
import {
  forgeMarkup,
  championsMarkup,
  monumentMarkup,
  objectiveMarkup,
  recentMedalsMarkup,
} from './WorldPanels.js';
import { starSummary } from '../systems/Progression.js';
import { dailyRun } from '../systems/DailyChallenge.js';
import { audio } from '../rendering/AudioSynth.js';
import { SOUND_ON, soundIcon } from './soundIcon.js';

/** How far past `minScale` the camera may go (clamped again in `measure`). */
const MAX_ZOOM_FACTOR = 3.2;
/** Above this zoom the small building labels are readable, so they fade in. */
const LABEL_ZOOM = 1.22;
/** Focus zoom for a landmark, as a multiple of the cover scale. */
const FOCUS_ZOOM = 1.45;
const TWEEN_MS = 520;
const INTRO_MS = 900;

const CLICK_SLOP = 6; // px of pointer travel that turns a tap into a pan

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class WorldMapUI {
  /**
   * @param {HTMLElement} container  an empty root that nobody else writes to
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{
   *   daily?: import('../systems/DailyChallenge.js').DailyStore|null,
   *   onDeploy?: (levelId:string) => void,
   *   onDaily?: () => void,
   *   onDuel?: () => void,
   *   onWarRoom?: () => void,
   *   onMode?: (modeId:string) => void,
   *   onLibrary?: (target:'codex'|'how') => void,
   *   onNavigate?: (target:string) => void,
   *   onMenu?: () => void,
   *   onCredits?: () => void,
   *   onSound?: () => boolean|void,
   *   onFullscreen?: () => void,
   * }} [callbacks]
   */
  constructor(container, progress, callbacks = {}) {
    this.container = container;
    this.progress = progress;
    this.callbacks = callbacks;
    this.daily = callbacks.daily || null;

    this.visible = false;
    this.hasShown = false;
    this.panelOpen = false;
    this.activeId = null;

    this.view = { w: 1, h: 1 };
    this.minScale = 1;
    this.maxScale = 1;
    this.camera = { x: 0, y: 0, scale: 1 };
    this.memory = null; // camera before the open panel moved it
    this.saved = null; // camera memory between visits

    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    /** Clicks before this timestamp ended a pan and must not open anything. */
    this.clickGuardUntil = 0;
    this.tweenFrame = 0;
    this.tweenGoal = null;
    this.introTimer = 0;
    this.toastTimer = 0;
    this.knownUnlocked = null;

    this.build();
  }

  /* =======================================================================
     Construction
     ===================================================================== */

  build() {
    const el = document.createElement('div');
    el.id = 'world-map';
    el.className = 'wm-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-label', 'World map');

    const landmarks = LANDMARKS.map((landmark, index) => this.landmarkMarkup(landmark, index)).join(
      ''
    );
    const regions = REGIONS.map(
      (region) => `
        <span class="wm-region" style="left:${region.glow.x}%;top:${region.glow.y}%;
              width:${region.glow.rx * 2}%;height:${region.glow.ry * 2}%;
              --wm-tint:${region.accent};--wm-fog:${region.fog}" aria-hidden="true"></span>
        <span class="wm-region-label" style="left:${region.label.x}%;top:${region.label.y}%;
              --wm-tint:${region.accent}">${region.name}</span>`
    ).join('');

    el.innerHTML = `
      <div class="wm-stage" data-wm-stage tabindex="0" role="application"
           aria-label="World map. Drag to pan, scroll or pinch to zoom, arrow keys to move.">
        <div class="wm-camera" data-wm-camera>
          <div class="wm-plate" style="width:${PLATE.width}px;height:${PLATE.height}px">
            <img class="wm-terrain" src="${PLATE.src}" alt="" draggable="false" decoding="async" />

            <div class="wm-air" aria-hidden="true">
              <span class="wm-clouds wm-clouds--a"></span>
              <span class="wm-clouds wm-clouds--b"></span>
              <span class="wm-mist wm-mist--north"></span>
              <span class="wm-mist wm-mist--ravine"></span>
              <span class="wm-water"></span>
              <span class="wm-embers"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span class="wm-birds"><i></i><i></i><i></i></span>
            </div>

            ${regions}
            ${landmarks}
          </div>
        </div>
        <span class="wm-vignette" aria-hidden="true"></span>
      </div>

      <header class="wm-top">
        <div class="wm-brand">
          <p class="wm-brand-kicker">THE REALM</p>
          <h1 class="wm-brand-title">BASTION</h1>
        </div>
        <div class="wm-wallets">
          <span class="wm-wallet"><img src="/assets/ui/icon_coin.png" alt="Gold" /><b id="wm-gold">0</b></span>
          <span class="wm-wallet"><img src="/assets/ui/icon_gem.png" alt="Gems" /><b id="wm-gems">0</b></span>
          <span class="wm-wallet"><img src="/assets/ui/star_gold.png" alt="Stars" /><b id="wm-stars">0</b></span>
        </div>
        <div class="wm-tools">
          <button id="wm-sound" class="wm-icon" type="button" aria-label="Toggle sound" aria-pressed="false">
            <img id="wm-sound-img" src="${SOUND_ON}" alt="" />
          </button>
          <button id="wm-fullscreen" class="wm-icon" type="button" aria-label="Toggle fullscreen" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
          <button id="wm-menu" class="wm-btn wm-btn--ghost" type="button">MAIN MENU</button>
        </div>
      </header>

      <div class="wm-rail" role="group" aria-label="Map camera">
        <button id="wm-zoom-in" class="wm-rail-btn" type="button" aria-label="Zoom in">+</button>
        <span class="wm-zoom-readout" id="wm-zoom-readout" aria-hidden="true">1.0x</span>
        <button id="wm-zoom-out" class="wm-rail-btn" type="button" aria-label="Zoom out">-</button>
        <button id="wm-recenter" class="wm-rail-btn wm-rail-btn--home" type="button" aria-label="Recentre the map">
          <span class="wm-home-mark" aria-hidden="true"></span>
        </button>
      </div>

      <aside class="wm-panel hidden" data-wm-panel aria-labelledby="wm-panel-title" tabindex="-1"></aside>

      <div class="wm-tip hidden" role="tooltip"></div>

      <div class="wm-foot">
        <button id="wm-credits" class="wm-link" type="button">CREDITS · PROJECT INFO</button>
        <p class="wm-hint" id="wm-hint">DRAG TO EXPLORE · SCROLL OR PINCH TO ZOOM · ESC TO LEAVE</p>
      </div>

      <div class="wm-toast hidden" role="status" aria-live="polite"></div>
    `;

    this.el = el;
    this.container.appendChild(el);

    this.stage = el.querySelector('[data-wm-stage]');
    this.cameraEl = el.querySelector('[data-wm-camera]');
    this.panel = el.querySelector('[data-wm-panel]');
    this.tip = el.querySelector('.wm-tip');
    this.toast = el.querySelector('.wm-toast');
    this.zoomReadout = el.querySelector('#wm-zoom-readout');

    this.bind();
  }

  landmarkMarkup(landmark, index) {
    const label = landmark.kind === 'banner' ? 'Banner' : '';
    return `
      <button class="wm-landmark wm-landmark--${landmark.kind}" type="button"
              data-wm-id="${landmark.id}"
              style="left:${landmark.x}%;top:${landmark.y}%;width:${landmark.width}px;--wm-delay:${
                (index % 5) * 0.6
              }s"
              aria-label="${landmark.name}${label ? ` (${label})` : ''}">
        <span class="wm-landmark-halo" aria-hidden="true"></span>
        <img class="wm-landmark-art" src="${landmark.art}" alt="" draggable="false" decoding="async" />
        <span class="wm-landmark-label">
          <span class="wm-landmark-tag">${landmark.tag}</span>
          <span class="wm-landmark-state" data-wm-state hidden></span>
        </span>
        <span class="wm-landmark-beacon" aria-hidden="true"></span>
      </button>`;
  }

  /* =======================================================================
     Wiring
     ===================================================================== */

  bind() {
    const el = this.el;

    // Landmarks. A click that ended a pan is swallowed: dragging across the
    // map must never launch a battle.
    for (const node of el.querySelectorAll('[data-wm-id]')) {
      node.addEventListener('click', () => {
        if (this.suppressClick) return;
        audio.playClick();
        this.openPanel(node.dataset.wmId);
      });
      node.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        this.showTip(node.dataset.wmId, event);
      });
      node.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        this.moveTip(event);
      });
      node.addEventListener('pointerleave', () => this.hideTip());
      node.addEventListener('focus', () => this.showTip(node.dataset.wmId, null));
      node.addEventListener('blur', () => this.hideTip());
    }

    // Camera controls.
    el.querySelector('#wm-zoom-in')?.addEventListener('click', () => {
      audio.playClick();
      this.zoomTowardsViewCentre(1.35);
    });
    el.querySelector('#wm-zoom-out')?.addEventListener('click', () => {
      audio.playClick();
      this.zoomTowardsViewCentre(1 / 1.35);
    });
    el.querySelector('#wm-recenter')?.addEventListener('click', () => {
      audio.playClick();
      this.tweenTo(this.homeCamera());
    });

    // Top bar.
    el.querySelector('#wm-menu')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onMenu?.();
    });
    el.querySelector('#wm-sound')?.addEventListener('click', () => {
      const muted = this.callbacks.onSound?.();
      this.setSoundState(muted);
    });
    el.querySelector('#wm-fullscreen')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onFullscreen?.();
    });
    el.querySelector('#wm-credits')?.addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onCredits?.();
    });

    // Panel backdrop: clicking empty ground beside an open panel closes it.
    // Landmarks stop here (their own handler opens the next panel); a click
    // that ended a pan never closes anything, because it was a movement.
    this.stage.addEventListener('click', (event) => {
      if (!this.panelOpen || this.suppressClick) return;
      if (event.target.closest('.wm-landmark')) return;
      if (event.target.closest('.wm-panel')) return;
      this.closePanel();
    });

    // Pointer camera: drag to pan, two fingers to pinch.
    this.stage.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('pointermove', (event) => this.onPointerMove(event), { passive: true });
    window.addEventListener('pointerup', (event) => this.onPointerUp(event));
    window.addEventListener('pointercancel', (event) => this.onPointerUp(event));

    this.stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.cancelTween();
        const step = event.deltaMode === 1 ? 0.045 : 0.0016;
        this.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * step));
      },
      { passive: false }
    );

    // Keyboard: arrows pan, +/- zoom, 0 recentres, Escape steps out.
    this.stage.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keydown', (event) => {
      if (!this.visible || event.key !== 'Escape') return;
      // The document listener only handles the map itself; panels and the
      // dialogue screens above it own their own Escape handling.
      if (this.panelOpen) {
        event.stopPropagation();
        this.closePanel();
        return;
      }
      this.callbacks.onMenu?.();
    });

    let resizeFrame = 0;
    this.onResize = () => {
      if (!this.visible || resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        this.measure();
        this.camera = this.clampCamera(this.camera);
        this.applyCamera();
      });
    };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onResize);
  }

  onKeyDown(event) {
    const step = event.shiftKey ? 220 : 90;
    const moves = {
      ArrowLeft: { dx: step, dy: 0 },
      ArrowRight: { dx: -step, dy: 0 },
      ArrowUp: { dx: 0, dy: step },
      ArrowDown: { dx: 0, dy: -step },
    };
    if (moves[event.key]) {
      event.preventDefault();
      this.cancelTween();
      const { dx, dy } = moves[event.key];
      this.setCamera({ x: this.camera.x + dx, y: this.camera.y + dy });
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomTowardsViewCentre(1.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.zoomTowardsViewCentre(1 / 1.25);
    } else if (event.key === '0') {
      event.preventDefault();
      this.tweenTo(this.homeCamera());
    }
  }

  /* =======================================================================
     Camera
     ===================================================================== */

  measure() {
    const rect = this.stage.getBoundingClientRect();
    this.view = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    const cover = Math.max(this.view.w / PLATE.width, this.view.h / PLATE.height);
    this.minScale = cover;
    // Never past the art's native pixels by much: the castle sprite is 360 px
    // wide and is drawn at 200 plate px, so ~1.8 is its 1:1 size.
    this.maxScale = Math.max(cover * 1.6, Math.min(cover * MAX_ZOOM_FACTOR, 2.2));
  }

  clampCamera({ x, y, scale }) {
    const s = clamp(scale, this.minScale, this.maxScale);
    const minX = this.view.w - PLATE.width * s;
    const minY = this.view.h - PLATE.height * s;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)), scale: s };
  }

  setCamera(next) {
    this.camera = this.clampCamera({ ...this.camera, ...next });
    this.applyCamera();
    return this.camera;
  }

  applyCamera() {
    const { x, y, scale } = this.camera;
    this.cameraEl.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;

    // Labels are map pins, not scenery: they counter-scale so a stage name is
    // the same size on a phone at min zoom as on a desktop at max zoom.
    this.el.style.setProperty('--wm-label-scale', (1 / scale).toFixed(4));
    // Clouds drift *slower* than the ground — a cheap depth cue.
    this.el.style.setProperty('--wm-cloud-x', `${((-x / scale) * 0.12).toFixed(1)}px`);
    this.el.style.setProperty('--wm-cloud-y', `${((-y / scale) * 0.12).toFixed(1)}px`);

    const zoom = scale / (this.minScale || 1);
    this.el.classList.toggle('is-far', zoom < LABEL_ZOOM);
    this.el.classList.toggle('can-zoom-in', scale < this.maxScale - 0.005);
    this.el.classList.toggle('can-zoom-out', scale > this.minScale + 0.005);
    if (this.zoomReadout) this.zoomReadout.textContent = `${zoom.toFixed(1)}x`;
  }

  /** Default view: the Bastion, centred, at the cover scale. */
  homeCamera() {
    return this.footprintCamera(48, 44, this.minScale);
  }

  /** Camera that centres a plate-space point (percent) at a given scale. */
  footprintCamera(xPercent, yPercent, scale, anchor = null) {
    const s = clamp(scale, this.minScale, this.maxScale);
    const ax = anchor?.x ?? this.view.w / 2;
    const ay = anchor?.y ?? this.view.h / 2;
    return this.clampCamera({
      x: ax - (xPercent / 100) * PLATE.width * s,
      y: ay - (yPercent / 100) * PLATE.height * s,
      scale: s,
    });
  }

  zoomAt(clientX, clientY, factor) {
    const rect = this.stage.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const scale = clamp(this.camera.scale * factor, this.minScale, this.maxScale);
    const ratio = scale / this.camera.scale;
    this.setCamera({
      x: px - (px - this.camera.x) * ratio,
      y: py - (py - this.camera.y) * ratio,
      scale,
    });
  }

  zoomTowardsViewCentre(factor) {
    // Repeated taps must compound. A tween that is still running has already
    // claimed the camera, so the next step is measured from *its* target —
    // otherwise mashing "+" would only ever move one step at a time.
    const base = this.tweenGoal || this.camera;
    const scale = clamp(base.scale * factor, this.minScale, this.maxScale);
    const ratio = scale / base.scale;
    this.tweenTo(
      this.clampCamera({
        x: this.view.w / 2 - (this.view.w / 2 - base.x) * ratio,
        y: this.view.h / 2 - (this.view.h / 2 - base.y) * ratio,
        scale,
      }),
      260
    );
  }

  toMemory() {
    const { x, y, scale } = this.camera;
    return {
      cx: (this.view.w / 2 - x) / scale,
      cy: (this.view.h / 2 - y) / scale,
      zoom: scale / (this.minScale || 1),
    };
  }

  fromMemory(memory) {
    if (!memory) return this.homeCamera();
    const scale = clamp((this.minScale || 1) * memory.zoom, this.minScale, this.maxScale);
    return this.clampCamera({
      x: this.view.w / 2 - memory.cx * scale,
      y: this.view.h / 2 - memory.cy * scale,
      scale,
    });
  }

  cancelTween() {
    if (this.tweenFrame) cancelAnimationFrame(this.tweenFrame);
    this.tweenFrame = 0;
    this.tweenGoal = null;
  }

  /**
   * Ease the camera to a target. `duration` 0 (or reduced motion) jumps, which
   * is what a player who asked for less motion expects.
   */
  tweenTo(target, duration = TWEEN_MS) {
    this.cancelTween();
    const to = this.clampCamera(target);
    const ms = reducedMotion() ? 0 : duration;
    if (!ms) {
      this.camera = to;
      this.tweenGoal = null;
      this.applyCamera();
      return;
    }
    const from = { ...this.camera };
    this.tweenGoal = to;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / ms);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.camera = {
        x: from.x + (to.x - from.x) * ease,
        y: from.y + (to.y - from.y) * ease,
        scale: from.scale + (to.scale - from.scale) * ease,
      };
      this.applyCamera();
      if (t < 1) this.tweenFrame = requestAnimationFrame(step);
      else {
        this.tweenFrame = 0;
        this.tweenGoal = null;
        this.camera = to;
        this.applyCamera();
      }
    };
    this.tweenFrame = requestAnimationFrame(step);
  }

  /* =======================================================================
     Pointer camera
     ===================================================================== */

  /**
   * True just after a drag ended.
   *
   * A time window, not a one-shot flag: a mouse click always follows a
   * pointerdown (which clears it), but a keyboard activation does not, and a
   * flag would leave Enter dead until the next mouse press.
   */
  get suppressClick() {
    return performance.now() < (this.clickGuardUntil || 0);
  }

  onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.cancelTween();
    this.clickGuardUntil = 0;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.drag = {
        x: event.clientX,
        y: event.clientY,
        camX: this.camera.x,
        camY: this.camera.y,
        moved: false,
      };
      this.stage.classList.add('is-dragging');
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        scale: this.camera.scale,
        camX: this.camera.x,
        camY: this.camera.y,
      };
      this.drag = null;
    }
  }

  onPointerMove(event) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const rect = this.stage.getBoundingClientRect();
      const scale = clamp(
        this.pinch.scale * (dist / this.pinch.dist),
        this.minScale,
        this.maxScale
      );
      const ratio = scale / this.pinch.scale;
      // The point of the plate under the fingers stays under the fingers, and
      // the whole map follows the midpoint, so a pinch-pan feels native.
      this.setCamera({
        x: mx - rect.left - (this.pinch.mx - rect.left - this.pinch.camX) * ratio,
        y: my - rect.top - (this.pinch.my - rect.top - this.pinch.camY) * ratio,
        scale,
      });
      return;
    }

    if (!this.drag) return;
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
      this.drag.moved = true;
      this.hideTip();
    }
    this.setCamera({ x: this.drag.camX + dx, y: this.drag.camY + dy });
  }

  onPointerUp(event) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);

    if (this.pointers.size < 2) this.pinch = null;

    if (this.pointers.size === 1) {
      // One finger lifted mid-pinch: restart the drag from where the other one
      // is, so the map does not jump.
      const [rest] = [...this.pointers.values()];
      this.drag = {
        x: rest.x,
        y: rest.y,
        camX: this.camera.x,
        camY: this.camera.y,
        moved: true,
      };
      return;
    }

    if (this.pointers.size === 0) {
      if (this.drag?.moved) this.clickGuardUntil = performance.now() + 400;
      this.drag = null;
      this.stage.classList.remove('is-dragging');
    }
  }

  /* =======================================================================
     Tooltip
     ===================================================================== */

  showTip(id, event) {
    const landmark = getLandmark(id);
    if (!landmark || !this.tip) return;
    const state = landmark.levelId ? stageState(this.progress, landmark.levelId) : null;
    this.tip.innerHTML = `
      <span class="wm-tip-name">${landmark.name}</span>
      <span class="wm-tip-meta">${
        state ? stateLabel(state) : landmark.tag
      }${landmark.levelId ? ' · briefing' : ' · open'}</span>`;
    this.tip.classList.remove('hidden');
    if (event) this.moveTip(event);
    else {
      const btn = this.el.querySelector(`[data-wm-id="${id}"]`);
      const rect = btn?.getBoundingClientRect();
      const host = this.stage.getBoundingClientRect();
      if (rect) this.placeTip(rect.left + rect.width / 2 - host.left, rect.top - host.top);
    }
  }

  moveTip(event) {
    const host = this.stage.getBoundingClientRect();
    this.placeTip(event.clientX - host.left, event.clientY - host.top);
  }

  placeTip(x, y) {
    if (!this.tip) return;
    const width = this.tip.offsetWidth || 160;
    const left = clamp(x, width / 2 + 8, this.view.w - width / 2 - 8);
    const top = Math.max(12, y - 18);
    this.tip.style.transform = `translate(${left}px, ${top}px) translate(-50%, -100%)`;
  }

  hideTip() {
    this.tip?.classList.add('hidden');
  }

  /* =======================================================================
     Panels
     ===================================================================== */

  panelMarkup(landmark) {
    switch (landmark.panel) {
      case 'briefing':
        return missionBriefingMarkup(getLevel(landmark.levelId), this.progress, {
          state: stageState(this.progress, landmark.levelId),
          region: regionForLevel(landmark.levelId),
        });
      case 'overview':
        return this.overviewMarkup();
      case 'warroom':
        return this.warRoomMarkup();
      case 'library':
        return this.libraryMarkup();
      case 'shrine':
        return this.shrineMarkup();
      case 'arena':
        return this.arenaMarkup();
      case 'forge':
        return forgeMarkup({ progress: this.progress, landmark });
      case 'champions':
        return championsMarkup({
          progress: this.progress,
          records: this.callbacks.records?.() || [],
          landmark,
        });
      case 'monument':
        return monumentMarkup({ progress: this.progress, landmark });
      default:
        return this.destinationMarkup(landmark);
    }
  }

  cardHead(eyebrow, title, chip) {
    return `
      <header class="wm-card-head">
        <p class="wm-eyebrow">${eyebrow}</p>
        <h2 class="wm-card-title" id="wm-panel-title">${title}</h2>
        ${chip ? `<span class="wm-state wm-state--next">${chip}</span>` : ''}
      </header>`;
  }

  overviewMarkup() {
    const summary = campaignSummary(this.progress);
    const objective = currentObjective(this.progress);
    const recent = this.progress?.profile?.achievements || [];
    return `
      ${this.cardHead('THE KEEP · REALM OVERVIEW', 'Bastion Castle', 'THE BASTION')}
      <p class="wm-card-blurb">The last keep holds the realm's ledger: every star banked, every
        medal struck, and the next road worth marching.</p>
      ${objectiveMarkup(objective, this.progress, summary)}
      <dl class="wm-facts">
        <div class="wm-fact"><dt>STARS</dt><dd>${summary.stars} / ${summary.maxStars}</dd></div>
        <div class="wm-fact"><dt>CAMPAIGN</dt><dd>${summary.cleared} / ${summary.total} cleared</dd></div>
        <div class="wm-fact"><dt>GOLD</dt><dd>${summary.gold.toLocaleString('en-US')}</dd></div>
        <div class="wm-fact"><dt>GEMS</dt><dd>${summary.gems}</dd></div>
        <div class="wm-fact"><dt>MEDALS</dt><dd>${summary.medals} / ${summary.maxMedals}</dd></div>
      </dl>
      ${
        recent.length
          ? `<p class="wm-subhead">LATEST MEDALS</p>${recentMedalsMarkup(this.progress)}`
          : ''
      }
      <footer class="wm-card-actions">
        <button id="wm-warroom" class="wm-btn" type="button">WAR ROOM</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  warRoomMarkup() {
    return `
      ${this.cardHead('THE BASTION · EIGHT WAYS IN', 'War Room', '8 MODES')}
      <p class="wm-card-blurb">The campaign is one war. These are the others — pick a door.</p>
      <ul class="wm-mode-list">
        ${MODES.map(
          (mode) => `
          <li>
            <button class="wm-mode" type="button" data-wm-mode="${mode.id}">
              <img src="${mode.art}" alt="" />
              <span class="wm-mode-body">
                <b>${mode.name}</b>
                <i>${mode.tag}</i>
              </span>
            </button>
          </li>`
        ).join('')}
      </ul>
      <footer class="wm-card-actions">
        <button id="wm-open-warroom" class="wm-btn wm-btn--primary" type="button">OPEN WAR ROOM</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  libraryMarkup() {
    return `
      ${this.cardHead('THE BASTION · RECORDS', 'Royal Library', 'ARCHIVE')}
      <p class="wm-card-blurb">Scribes keep two books: the codex of everything the engine is doing
        under the battle, and the field manual for a keeper who has just arrived.</p>
      <dl class="wm-facts">
        <div class="wm-fact"><dt>CODEX</dt><dd>Pathfinding, sorts, telemetry</dd></div>
        <div class="wm-fact"><dt>MANUAL</dt><dd>Controls, towers, waves</dd></div>
      </dl>
      <footer class="wm-card-actions">
        <button id="wm-open-codex" class="wm-btn wm-btn--primary" type="button">OPEN THE CODEX</button>
        <button id="wm-open-how" class="wm-btn" type="button">HOW TO PLAY</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  /** Today's real daily: the same `dailyRun` the menu button uses. */
  dailyInfo() {
    const unlockedIds = this.progress?.profile?.unlocked || ['level-1'];
    const run = dailyRun({ unlockedIds });
    const streak = this.daily?.currentStreak(run.key) || 0;
    const won = this.daily?.isWon(run.key) || false;
    return { run, streak, won, level: getLevel(run.levelId) };
  }

  shrineMarkup() {
    const { run, streak, won, level } = this.dailyInfo();
    return `
      ${this.cardHead("THE BASTION · TODAY'S RULE", 'Shrine of the Day', won ? 'CLEARED' : 'OPEN')}
      <p class="wm-card-blurb">${run.modifier.blurb}</p>
      <dl class="wm-facts">
        <div class="wm-fact"><dt>RULE</dt><dd class="wm-fact-accent">${run.modifier.name.toUpperCase()}</dd></div>
        <div class="wm-fact"><dt>STAGE</dt><dd>${level?.name || 'Verdant Marches'}</dd></div>
        <div class="wm-fact"><dt>STREAK</dt><dd>${streak} day${streak === 1 ? '' : 's'}</dd></div>
        <div class="wm-fact"><dt>PAYOUT</dt><dd>${
          won ? 'Already banked today' : 'Gems on the first clear'
        }</dd></div>
      </dl>
      <footer class="wm-card-actions">
        <button id="wm-daily" class="wm-btn wm-btn--primary" type="button">${
          won ? 'RUN IT AGAIN' : 'BEGIN THE CHALLENGE'
        }</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  arenaMarkup() {
    return `
      ${this.cardHead('THE BASTION · MIRROR FIELD', 'Mirror Arena', 'DUEL')}
      <p class="wm-card-blurb">Two keepers, identical boards, one relay. No blessings, no powerups,
        no relics — only the waves, and the first core to fall.</p>
      <dl class="wm-facts">
        <div class="wm-fact"><dt>FORMAT</dt><dd>1v1 · mirrored</dd></div>
        <div class="wm-fact"><dt>VERDICT</dt><dd>First knockout, else higher score</dd></div>
        <div class="wm-fact"><dt>ROOM</dt><dd>Two devices, one code</dd></div>
      </dl>
      <footer class="wm-card-actions">
        <button id="wm-duel" class="wm-btn wm-btn--primary" type="button">ENTER THE ARENA</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  destinationMarkup(landmark) {
    return `
      ${this.cardHead('THE BASTION', landmark.name, landmark.tag)}
      <p class="wm-card-blurb">${landmark.blurb || ''}</p>
      <footer class="wm-card-actions">
        <button id="wm-enter" class="wm-btn wm-btn--primary" type="button">ENTER</button>
        <button id="wm-panel-close" class="wm-btn" type="button">CLOSE</button>
      </footer>`;
  }

  openPanel(id, { focus = true } = {}) {
    const landmark = getLandmark(id);
    if (!landmark) return;
    if (!this.panelOpen) this.memory = this.toMemory();

    this.activeId = id;
    this.panelOpen = true;
    this.panel.innerHTML = this.panelMarkup(landmark);
    this.panel.dataset.wmPanel = landmark.panel;
    this.panel.classList.remove('hidden');
    this.el.classList.add('has-panel');
    for (const node of this.el.querySelectorAll('.wm-landmark.is-active')) {
      node.classList.remove('is-active');
    }
    this.el.querySelector(`[data-wm-id="${id}"]`)?.classList.add('is-active');
    this.hideTip();
    this.bindPanel(landmark);
    this.panel.focus?.({ preventScroll: true });
    if (focus) this.focusLandmark(landmark);
  }

  focusLandmark(landmark) {
    const scale = Math.min(
      this.maxScale,
      Math.max(this.minScale * FOCUS_ZOOM, this.camera.scale)
    );
    const centreY = landmark.y - Math.min(7, (landmark.width / PLATE.height) * 100 * 0.8);
    this.tweenTo(
      this.footprintCamera(landmark.x, centreY, scale, this.panelAnchor())
    );
  }

  /** Where a focused landmark should land so the open panel never hides it. */
  panelAnchor() {
    const rect = this.panel.getBoundingClientRect();
    const host = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const isSheet = rect.top - host.top > host.height * 0.34;
    if (isSheet) {
      return { x: host.width / 2, y: Math.max(96, (rect.top - host.top) * 0.52) };
    }
    return { x: Math.max(140, (rect.left - host.left) * 0.5), y: host.height / 2 };
  }

  closePanel({ restore = true } = {}) {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.activeId = null;
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
    this.el.classList.remove('has-panel');
    for (const node of this.el.querySelectorAll('.wm-landmark.is-active')) {
      node.classList.remove('is-active');
    }
    if (restore && this.memory) {
      this.tweenTo(this.fromMemory(this.memory));
    }
    this.memory = null;
    if (this.visible) this.stage.focus?.({ preventScroll: true });
  }

  bindPanel(landmark) {
    const on = (selector, handler) => {
      this.panel.querySelector(selector)?.addEventListener('click', handler);
    };
    on('#wm-panel-close', () => {
      audio.playClick();
      this.closePanel();
    });
    on('#wm-deploy', () => {
      audio.playClick();
      this.callbacks.onDeploy?.(landmark.levelId);
    });
    on('#wm-enter', () => {
      audio.playClick();
      this.callbacks.onNavigate?.(landmark.target);
    });
    on('#wm-goal', () => {
      audio.playClick();
      const objective = currentObjective(this.progress);
      const banner = objective && landmarkForLevel(objective.id);
      if (banner) this.openPanel(banner.id);
    });
    on('#wm-warroom', () => {
      audio.playClick();
      this.openPanel('warroom');
    });
    on('#wm-open-warroom', () => {
      audio.playClick();
      this.callbacks.onWarRoom?.();
    });
    on('#wm-open-codex', () => {
      audio.playClick();
      this.callbacks.onLibrary?.('codex');
    });
    on('#wm-open-how', () => {
      audio.playClick();
      this.callbacks.onLibrary?.('how');
    });
    on('#wm-daily', () => {
      audio.playClick();
      this.callbacks.onDaily?.();
    });
    on('#wm-duel', () => {
      audio.playClick();
      this.callbacks.onDuel?.();
    });
    for (const node of this.panel.querySelectorAll('[data-wm-mode]')) {
      node.addEventListener('click', () => {
        audio.playClick();
        this.callbacks.onMode?.(node.dataset.wmMode);
      });
    }
  }

  /* =======================================================================
     State
     ===================================================================== */

  /** Paint every live number. Cheap enough to call on every reveal. */
  refresh({ arrival = null } = {}) {
    const progress = this.progress;
    const set = (id, value) => {
      const node = this.el?.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set('wm-gold', String(progress?.gold ?? 0));
    set('wm-gems', String(progress?.gems ?? 0));
    set('wm-stars', progress ? starSummary(progress) : '0 / 0');

    const unlockedNow = new Set(progress?.profile?.unlocked || []);
    const fresh = this.knownUnlocked
      ? [...unlockedNow].filter((id) => !this.knownUnlocked.has(id))
      : [];
    this.knownUnlocked = unlockedNow;

    this.syncMarkers();

    for (const node of this.el.querySelectorAll('.wm-landmark.is-new')) {
      node.classList.remove('is-new');
    }
    for (const levelId of fresh) {
      const banner = landmarkForLevel(levelId);
      if (banner) this.el.querySelector(`[data-wm-id="${banner.id}"]`)?.classList.add('is-new');
    }

    if (this.panelOpen && this.activeId) {
      // The ledger must not lie after a purchase or a victory.
      this.panel.innerHTML = this.panelMarkup(getLandmark(this.activeId));
      this.bindPanel(getLandmark(this.activeId));
    }

    if (arrival) this.announceArrival(arrival, fresh);
    else if (fresh.length) this.announceUnlocks(fresh);
    this.el.querySelector('#wm-sound')?.setAttribute('aria-pressed', String(Boolean(audio.muted)));

    return { fresh };
  }

  syncMarkers() {
    for (const node of this.el.querySelectorAll('[data-wm-id]')) {
      const landmark = getLandmark(node.dataset.wmId);
      if (!landmark) continue;
      const chip = node.querySelector('[data-wm-state]');
      const state = landmark.levelId ? stageState(this.progress, landmark.levelId) : null;

      node.classList.toggle('is-locked', state === 'locked');
      node.classList.toggle('is-cleared', state === 'cleared');
      node.classList.toggle('is-objective', state === 'next');
      node.dataset.state = state || 'open';
      // A locked banner still opens: the briefing is where the player learns
      // what to clear first. The DEPLOY button inside is what is disabled.
      if (chip) {
        if (state) {
          chip.hidden = false;
          chip.textContent = stateLabel(state);
          chip.className = `wm-landmark-state wm-state--${state}`;
        } else {
          chip.hidden = true;
        }
      }
    }
  }

  /**
   * One line for the run that just ended: the stars it banked, the rewards it
   * paid and — if the clear opened one — the road it unlocked.
   */
  announceArrival(arrival, fresh = []) {
    const bits = [];
    if (arrival.outcome === 'victory') {
      if (arrival.stars) bits.push(`${arrival.stars}★`);
      if (arrival.rewards?.gold) bits.push(`+${arrival.rewards.gold} gold`);
      if (arrival.rewards?.gems) bits.push(`+${arrival.rewards.gems} gems`);
    } else if (arrival.outcome === 'defeat') {
      bits.push('no stars banked');
    }
    const opened = fresh.map((id) => getLevel(id)?.name).filter(Boolean);
    const tail = opened.length ? `NEW ROAD · ${opened.join(', ').toUpperCase()}` : null;
    const head = `${arrival.levelName ? arrival.levelName.toUpperCase() : 'THE REALM'} · ${
      bits.join(' · ') || 'walked away'
    }`;
    this.showToast(tail ? `${head} — ${tail}` : head, 5600);
  }

  announceUnlocks(ids) {
    const names = ids
      .map((id) => getLevel(id)?.name || 'A new road')
      .map((name) => name.toUpperCase());
    this.showToast(`NEW ROAD OPEN · ${names.join(' · ')}`, 5200);
    const banner = landmarkForLevel(ids[0]);
    if (banner) this.revealLandmark(banner);
  }

  /** Gently pull the camera to a landmark that just changed state. */
  revealLandmark(landmark) {
    const target = this.footprintCamera(
      landmark.x,
      landmark.y - 4,
      Math.min(this.maxScale, Math.max(this.camera.scale, this.minScale * 1.3))
    );
    this.tweenTo(target, 900);
  }

  showToast(message, ms = 4000) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');
    this.toast.classList.add('is-in');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.remove('is-in');
      this.toast.classList.add('hidden');
    }, ms);
  }

  setSoundState(muted) {
    const img = this.el?.querySelector('#wm-sound-img');
    const btn = this.el?.querySelector('#wm-sound');
    if (img) img.src = soundIcon(muted);
    btn?.setAttribute('aria-pressed', String(Boolean(muted)));
  }

  /* =======================================================================
     Lifecycle
     ===================================================================== */

  /**
   * @param {{ arrival?: object|null }} [options] `arrival` is what the battle
   *   just did — the map reports the real stars and rewards it banked.
   */
  show({ arrival = null } = {}) {
    const firstEver = !this.hasShown;
    this.el.classList.remove('hidden');
    this.visible = true;
    this.hasShown = true;

    this.measure();
    this.refresh({ arrival });

    if (firstEver) {
      const home = this.homeCamera();
      this.camera = this.clampCamera({ ...home, scale: home.scale * 1.08 });
      this.applyCamera();
      this.el.classList.add('is-intro');
      clearTimeout(this.introTimer);
      this.introTimer = setTimeout(() => this.el.classList.remove('is-intro'), INTRO_MS + 200);
      this.tweenTo(home, INTRO_MS);
    } else {
      this.camera = this.clampCamera(this.saved ? this.fromMemory(this.saved) : this.homeCamera());
      this.applyCamera();
    }
    this.saved = null;
    this.stage.focus?.({ preventScroll: true });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.cancelTween();
    clearTimeout(this.introTimer);
    clearTimeout(this.toastTimer);
    this.saved = this.toMemory();
    this.closePanel({ restore: false });
    this.hideTip();
    this.toast?.classList.add('hidden');
    this.el.classList.add('hidden');
    this.el.classList.remove('is-intro');
  }

  get isVisible() {
    return this.visible;
  }
}
