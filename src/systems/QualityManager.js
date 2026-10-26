/**
 * QualityManager — one profile switch for the whole game.
 *
 * The frame budget of a 360 px phone and a desktop are two different games, but
 * the presentation was identical: full-screen CSS blur behind the menu, drifting
 * clouds and mist over the realm, every particle in an explosion, and a second
 * ambience bed under the first. None of that is gameplay, and all of it is
 * expensive.
 *
 * Three profiles and one `auto` setting:
 *
 *   high        full atmosphere, full particle counts, both ambience beds
 *   balanced    fewer particles, one ambience bed, cheaper CSS filters
 *   performance no ambience beds, quarter particles, no blurred backdrop,
 *               no parallax — but the same art, towers, enemies and rules
 *
 * `auto` picks from device memory, pointer type and viewport, then demotes once
 * (never back) if a battle cannot hold the frame budget. The choice is a saved
 * preference, not a session flag.
 */

import { STORAGE_KEYS } from '../config/gameConfig.js';
import { getDefaultStorage, readJSON, writeJSON } from '../utils/storage.js';

export const QUALITY_CHOICES = ['auto', 'high', 'balanced', 'performance'];
export const QUALITY_LEVELS = ['high', 'balanced', 'performance'];

export const QUALITY_PROFILE = Object.freeze({
  high: { particles: 1, ambience: 2, parallax: 1, cssFilters: true },
  balanced: { particles: 0.55, ambience: 1, parallax: 0.6, cssFilters: true },
  performance: { particles: 0.25, ambience: 0, parallax: 0, cssFilters: false },
});

/**
 * Conservative default. Deliberately *not* user-agent sniffing: a cheap phone
 * and a cheap laptop want the same thing, and both report themselves honestly
 * through memory, pointer type and viewport.
 */
export function detectQuality(env = {}) {
  const width = Number.isFinite(env.width) ? env.width : globalThis.innerWidth ?? 1280;
  const height = Number.isFinite(env.height) ? env.height : globalThis.innerHeight ?? 800;
  const memory = Number.isFinite(env.memory) ? env.memory : globalThis.navigator?.deviceMemory;
  const coarse = env.coarse ?? globalThis.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const pixels = Math.max(1, width) * Math.max(1, height);

  // 2 GB phones: the profile this exists for.
  if (Number.isFinite(memory) && memory <= 2) return 'performance';
  // 3-4 GB phones, tablets, and any touch device in the 800 px class.
  if (Number.isFinite(memory) && memory <= 4) return 'balanced';
  if (coarse && pixels <= 1100 * 800) return 'balanced';
  if (pixels <= 400 * 700) return 'performance';
  return 'high';
}

export class QualityManager {
  /**
   * @param {{ storage?: Storage, env?: object, onChange?: (state: object) => void }} [options]
   */
  constructor({ storage = getDefaultStorage(), env = {}, onChange = null } = {}) {
    this.storage = storage;
    this.onChange = onChange;
    this.detected = detectQuality(env);
    // `readJSON` wraps the record (`{ value }`); tolerate a bare record too.
    const record = readJSON(storage, STORAGE_KEYS.graphics);
    const saved = record?.value?.quality ?? record?.quality;
    this.setting = QUALITY_CHOICES.includes(saved) ? saved : 'auto';
    this.level = this.setting === 'auto' ? this.detected : this.setting;
    this.demoted = false;
    this.#apply();
  }

  get profile() {
    return QUALITY_PROFILE[this.level] || QUALITY_PROFILE.high;
  }

  get state() {
    return {
      setting: this.setting,
      level: this.level,
      detected: this.detected,
      auto: this.setting === 'auto',
      demoted: this.demoted,
      profile: { ...this.profile },
    };
  }

  /** Persist an explicit choice (or `auto`). */
  set(choice) {
    if (!QUALITY_CHOICES.includes(choice)) return this.state;
    this.setting = choice;
    this.level = choice === 'auto' ? this.detected : choice;
    this.demoted = false;
    writeJSON(this.storage, STORAGE_KEYS.graphics, { quality: this.setting });
    this.#apply();
    this.onChange?.(this.state);
    return this.state;
  }

  /**
   * Auto only, one step at a time and one-way: a battle that cannot hold ~45 fps
   * gives up atmosphere rather than frames. It can step down again on the next
   * measurement, but it never climbs back on its own — a profile that flickers
   * between levels is worse than a lower one.
   */
  degrade() {
    if (this.setting !== 'auto') return false;
    const index = QUALITY_LEVELS.indexOf(this.level);
    if (index < 0 || index >= QUALITY_LEVELS.length - 1) return false;
    this.level = QUALITY_LEVELS[index + 1];
    this.demoted = true;
    this.#apply();
    this.onChange?.(this.state);
    return true;
  }

  /** Shared particle scale for Vfx; 1 when there is no manager (tests, node). */
  get particleScale() {
    return this.profile.particles;
  }

  #apply() {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    root.dataset.quality = this.level;
    root.dataset.qualitySetting = this.setting;
  }
}

/** The singleton the game uses; absent in node, so Vfx falls back to 1. */
export function qualityParticleScale() {
  const manager = globalThis.window?.gameQuality;
  return manager?.particleScale ?? 1;
}
