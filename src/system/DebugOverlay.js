/**
 * DebugOverlay.js — the FPS / frame-time / long-task readout behind `?debug=1`.
 *
 * Why it exists: every performance claim in this project has to be provable on
 * the device that feels slow, and a phone cannot open a DevTools timeline while
 * a wave is running. This panel is four lines of text updated four times a
 * second, which is cheap enough to leave on during a playtest and specific
 * enough to tell the three failure modes apart:
 *
 *   fps          is the *loop* keeping up, or is the page busy elsewhere?
 *   frame        how long one step takes, in ms (16.7 = the 60 Hz budget)
 *   scene        which screen is actually running — a parked loop reads 0 fps
 *   long tasks   how many frames the browser itself called too long, and how
 *                much time they took in total
 *
 * The entity row is filled from whatever the active scene exposes (enemies,
 * projectiles, tweens, display-list children); it is a reading, never a target.
 */

import { perfProbe } from './perfProbe.js';

const UPDATE_MS = 250;

export class DebugOverlay {
  /**
   * @param {import('phaser').Game|{loop:object, scene:object}} game
   * @param {{ updateMs?: number }} [options]
   */
  constructor(game, { updateMs = UPDATE_MS } = {}) {
    this.game = game;
    this.updateMs = updateMs;
    this.timer = 0;
    this.el = null;
    this.lines = { fps: '', frame: '', scene: '', entities: '', tasks: '', spans: '' };
    this.peak = { frame: 0, fps: Infinity };
    perfProbe.setEnabled(true);
  }

  mount(parent = document.body) {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.id = 'perf-overlay';
    // Inline, so the overlay can never be the reason a stylesheet changes.
    el.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      'z-index:9999',
      'padding:6px 8px',
      'border-radius:6px',
      'background:rgba(6,9,14,0.82)',
      'border:1px solid rgba(245,196,81,0.35)',
      'color:#e9eef5',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    el.setAttribute('aria-hidden', 'true');
    const lines = ['fps', 'frame', 'scene', 'entities', 'tasks', 'spans'];
    for (const key of lines) {
      const row = document.createElement('div');
      el.appendChild(row);
      this.lines[key] = row;
    }
    parent?.appendChild?.(el);
    this.el = el;
    this.update();
    this.timer = setInterval(() => this.update(), this.updateMs);
    return el;
  }

  /** The scene that is actually stepping, if any. */
  activeScene() {
    const scenes = this.game?.scene?.scenes;
    if (!Array.isArray(scenes)) return null;
    for (const scene of scenes) {
      const status = scene?.sys?.settings?.status;
      // 5 = RUNNING in Phaser's SceneStatus enum. Interpolated because the
      // constant moved between 3.x point releases; the number did not.
      if (status === 5 && scene?.sys?.isActive?.()) return scene;
    }
    return null;
  }

  update() {
    if (!this.el) return;
    const loop = this.game?.loop;
    const fps = Math.max(0, Math.round(loop?.actualFps ?? 0));
    const frame = Math.round((loop?.delta ?? 0) * 10) / 10;
    const scene = this.activeScene();
    const writing = scene?.sys?.settings?.isBooted;

    this.peak.frame = Math.max(this.peak.frame, frame);
    this.peak.fps = Math.min(this.peak.fps, fps || Infinity);

    this.set('fps', `fps  ${fps}   min ${Number.isFinite(this.peak.fps) ? this.peak.fps : 0}`);
    this.set('frame', `ms   ${frame.toFixed(1)}   peak ${this.peak.frame.toFixed(1)}`);
    this.set(
      'scene',
      `scene ${loop?.running === false ? 'PARKED' : writing ? scene?.scene?.key || '?' : 'none'}`
    );

    const enemies = scene?.activeEnemies?.length ?? 0;
    const shots = scene?.activeProjectiles?.length ?? 0;
    const defences = scene?.placementSystem?.occupancy?.size ?? 0;
    const tweens = scene?.tweens?.getTweens?.().length ?? 0;
    this.set('entities', `e ${enemies}  p ${shots}  d ${defences}  t ${tweens}`);

    this.set(
      'tasks',
      `longtasks ${perfProbe.longTasks}  ${Math.round(perfProbe.longTaskMs)}ms`
    );

    const rows = perfProbe
      .snapshot()
      .filter((span) => span.count > 0 && span.max > 0)
      .sort((a, b) => b.max - a.max)
      .slice(0, 3);
    this.set(
      'spans',
      rows.map((span) => `${span.name} ${span.last.toFixed(1)}/${span.max.toFixed(1)}ms`).join('  ') ||
        'spans —'
    );

    // Let the peaks decay so one hitch does not sit on the panel forever.
    if (this.peak.frame > 0) this.peak.frame *= 0.98;
  }

  set(key, text) {
    const node = this.lines[key];
    if (!node || node.textContent === text) return; // no write, no style work
    node.textContent = text;
  }

  destroy() {
    clearInterval(this.timer);
    this.timer = 0;
    this.el?.remove?.();
    this.el = null;
    perfProbe.setEnabled(false);
  }
}

/** True when the page was opened with `?debug=1`. */
export function debugRequested(search = globalThis.location?.search || '') {
  try {
    return new URLSearchParams(search).get('debug') === '1';
  } catch {
    return false;
  }
}
