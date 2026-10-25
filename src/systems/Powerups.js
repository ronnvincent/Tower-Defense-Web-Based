/**
 * Powerups — the three buttons that let a losing lane answer back.
 *
 * The tower panel already handles *building*; this is the part the player does
 * with their hands during a wave. Each powerup is a timed trick with real
 * counter-play: the meteor is a targeted nuke, overcharge trades a long
 * cooldown for a burst of fire rate, and fortify buys the wall time to rebuild.
 *
 * The state machine is pure (no Phaser, no DOM) so the cooldown rules are unit
 * tested; `HUD` renders it and `GameScene` executes the effects.
 */

/** Static definition of every powerup, in HUD order. */
export const POWERUPS = [
  {
    key: 'meteor',
    name: 'Meteor Strike',
    icon: '/assets/ui-kit/glyph_meteor.png',
    hotkey: 'Q',
    cooldownMs: 26000,
    targeting: true,
    accent: '#ff9a3c',
    description: 'Call a meteor onto a tile: 520 explosive damage in a 120px crater.',
  },
  {
    key: 'overcharge',
    name: 'Overcharge',
    icon: '/assets/ui-kit/glyph_overcharge.png',
    hotkey: 'E',
    cooldownMs: 34000,
    targeting: false,
    accent: '#8fe8ff',
    description: 'Every tower fires 70% faster for 7s.',
  },
  {
    key: 'fortify',
    name: 'Fortify',
    icon: '/assets/ui-kit/glyph_fortify.png',
    hotkey: 'R',
    cooldownMs: 42000,
    targeting: false,
    accent: '#7bf2a6',
    description: 'Repairs every palisade and restores 40 core integrity.',
  },
];

/** Cooldown shaved off each powerup when a wave is cleared. */
export const WAVE_CLEAR_REFUND_MS = 8000;

/** Overcharge window and fire-rate multiplier (cooldown × this). */
export const OVERCHARGE = Object.freeze({ durationMs: 7000, cooldownScale: 0.59 });

/** Meteor blast shape. */
export const METEOR = Object.freeze({ radius: 120, damage: 520 });

export class PowerupState {
  /**
   * @param {number} [now] scene clock in ms
   */
  constructor(now = 0) {
    this.now = now;
    /** @type {Record<string, number>} key -> timestamp the powerup is ready again */
    this.readyAt = {};
    for (const powerup of POWERUPS) this.readyAt[powerup.key] = 0;
    this.overchargeUntil = 0;
  }

  /** Advance the clock and expire the overcharge window. */
  tick(now) {
    if (Number.isFinite(now)) this.now = Math.max(this.now, now);
    if (this.overchargeUntil && this.now >= this.overchargeUntil) this.overchargeUntil = 0;
    return this;
  }

  /** Is this powerup usable right now? */
  ready(key) {
    const powerup = POWERUPS.find((entry) => entry.key === key);
    if (!powerup) return false;
    return this.now >= (this.readyAt[key] ?? 0);
  }

  /** 0 (just used) → 1 (ready). Drives the HUD sweep. */
  progress(key) {
    const powerup = POWERUPS.find((entry) => entry.key === key);
    if (!powerup) return 0;
    const remaining = Math.max(0, (this.readyAt[key] ?? 0) - this.now);
    return 1 - Math.min(1, remaining / powerup.cooldownMs);
  }

  /** Milliseconds still on cooldown (0 when ready). */
  remaining(key) {
    return Math.max(0, (this.readyAt[key] ?? 0) - this.now);
  }

  /**
   * Spend a powerup. Returns false (and changes nothing) while it is on
   * cooldown, so the caller can play the "denied" sound instead of firing.
   */
  use(key) {
    const powerup = POWERUPS.find((entry) => entry.key === key);
    if (!powerup || !this.ready(key)) return false;
    this.readyAt[key] = this.now + powerup.cooldownMs;
    if (key === 'overcharge') this.overchargeUntil = this.now + OVERCHARGE.durationMs;
    return true;
  }

  /** Cooldown multiplier for towers (1 = normal, 0.59 while overcharged). */
  get cooldownScale() {
    return this.now < this.overchargeUntil ? OVERCHARGE.cooldownScale : 1;
  }

  /** True while the overcharge window is open. */
  get overcharged() {
    return this.now < this.overchargeUntil;
  }

  /** A cleared wave pays some of every cooldown back. */
  onWaveClear() {
    for (const powerup of POWERUPS) {
      const readyAt = this.readyAt[powerup.key] ?? 0;
      if (readyAt > this.now) this.readyAt[powerup.key] = Math.max(this.now, readyAt - WAVE_CLEAR_REFUND_MS);
    }
    return this;
  }

  /** Snapshot for the HUD (cheap, serialisable, easy to test). */
  snapshot() {
    return POWERUPS.map((powerup) => ({
      key: powerup.key,
      name: powerup.name,
      icon: powerup.icon,
      hotkey: powerup.hotkey,
      accent: powerup.accent,
      targeting: powerup.targeting,
      description: powerup.description,
      ready: this.ready(powerup.key),
      progress: this.progress(powerup.key),
      remainingMs: this.remaining(powerup.key),
    }));
  }
}
