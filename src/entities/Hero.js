/**
 * Hero.js — the Bastion Vanguard, the one unit the player steers directly.
 *
 * It is deliberately *not* a tower: it walks where it is told, it swings at
 * whatever ground creep is within arm's reach, and it can be put down. The
 * numbers live in one frozen config so the briefing, the HUD and the tests read
 * the same table (the specification fixes all four).
 *
 * Design decisions made here, because the brief leaves them open:
 *   - The hero does not block the lane. Creeps never stop for it, so adding a
 *     hero can never break the "path is fixed" rule that keeps waves readable.
 *   - Standing in a crowd costs health (`contactDps` per adjacent creep). That
 *     is what gives the downed state a cause and the move order a point.
 *   - A downed hero returns at full health when the next wave starts; there is
 *     no per-second regeneration, so parking it in the lane is expensive.
 */

/** The strip is 4 frames of 96x112, drawn by scripts/build_hero.py. */
export const HERO_TEXTURE = 'hero-vanguard';
export const HERO_SHEET = '/assets/hero/vanguard.png';
export const HERO_FRAME = Object.freeze({ width: 96, height: 112, count: 4 });

/** @type {Readonly<object>} */
export const HERO = Object.freeze({
  maxHealth: 500,
  speed: 110, // px per second
  range: 30, // px, melee reach for the auto-attack
  damage: 30,
  intervalMs: 1000,
  /**
   * Shieldbreaker Strike: a ground-only shockwave. `oncePerCast` is expressed by
   * construction (each enemy is visited at most once per cast) but the id set is
   * kept explicit so a future multi-hit variant cannot double-dip.
   */
  strike: Object.freeze({
    damage: 100,
    radius: 75,
    cooldownMs: 12000,
    type: 'physical',
  }),
  contactDps: 18,
  contactRange: 34,
});

/** Ground units take melee damage; fliers pass overhead untouched. */
export function isGroundEnemy(enemy) {
  return Boolean(enemy) && !enemy.flying && !enemy.def?.flying;
}

export function isAliveEnemy(enemy) {
  return Boolean(enemy) && !enemy.isDead && !enemy.reachedBase && enemy.health > 0;
}

/** Closest living ground enemy inside `range`, or null. Pure, so it is tested. */
export function nearestGroundTarget(hero, enemies, range = HERO.range) {
  let best = null;
  let bestDist = range;
  for (const enemy of enemies || []) {
    if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
    const dist = Math.hypot(enemy.x - hero.x, enemy.y - hero.y);
    if (dist <= bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class Hero {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x:number, y:number, bounds?:{x0:number,y0:number,x1:number,y1:number}, texture?:string }} options
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.maxHealth = HERO.maxHealth;
    this.health = HERO.maxHealth;
    this.speed = HERO.speed;
    this.destination = null;
    this.attackTimer = 0;
    this.strikeCooldownMs = 0;
    this.attackPulse = 0;
    this.walkMs = 0;
    this.facing = 1;
    this.bounds = options.bounds || null;
    this.textureKey = options.texture || HERO_TEXTURE;

    this.container = scene.add.container(this.x, this.y);
    this.container.setDepth(24);

    // Soft ground shadow, then the sprite. The strip is 96x112 per frame.
    this.shadow = scene.add.ellipse(0, 44, 54, 16, 0x000000, 0.32);
    this.sprite = scene.add.image(0, 0, this.textureKey, 0);
    if (this.sprite.setOrigin) this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(0.86);
    this.container.add([this.shadow, this.sprite]);

    this.healthBar = scene.add.graphics();
    this.container.add(this.healthBar);
    this.drawHealthBar();
  }

  get isDown() {
    return this.health <= 0;
  }

  get strikeReady() {
    return !this.isDown && this.strikeCooldownMs <= 0;
  }

  /** Order a walk. The hero crosses terrain directly — it is a commander, not a lane crawler. */
  moveTo(x, y) {
    if (this.isDown) return false;
    const bounds = this.bounds;
    this.destination = {
      x: bounds ? clamp(x, bounds.x0, bounds.x1) : x,
      y: bounds ? clamp(y, bounds.y0, bounds.y1) : y,
    };
    return true;
  }

  /**
   * One simulation step.
   * @returns {{ moved:boolean, attacked:object|null }}
   */
  update(deltaMs, enemies) {
    if (this.isDown) return { moved: false, attacked: null };
    const dt = Math.max(0, deltaMs);
    if (this.strikeCooldownMs > 0) {
      this.strikeCooldownMs = Math.max(0, this.strikeCooldownMs - dt);
    }
    if (this.attackPulse > 0) this.attackPulse = Math.max(0, this.attackPulse - dt);

    let moved = false;
    if (this.destination) {
      const dx = this.destination.x - this.x;
      const dy = this.destination.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * dt) / 1000;
      if (dist <= step || dist < 1) {
        this.x = this.destination.x;
        this.y = this.destination.y;
        this.destination = null;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        moved = true;
        if (Math.abs(dx) > 1) this.facing = dx < 0 ? -1 : 1;
      }
      this.container.setPosition(this.x, this.y);
      this.container.setDepth(24 + this.y * 0.001);
    }

    // Walk cycle: frame 0 when standing, 1-3 while walking.
    const frame = moved ? 1 + (Math.floor(this.walkMs / 120) % 3) : 0;
    if (moved) this.walkMs += dt;
    if (this.sprite.frame?.name !== String(frame)) this.sprite.setFrame(frame);
    this.sprite.setFlipX(this.facing < 0);

    // Contact damage: the horde does not stop, but it does not ignore you either.
    let contacted = 0;
    for (const enemy of enemies || []) {
      if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= HERO.contactRange) contacted += 1;
    }
    if (contacted > 0) this.takeDamage((HERO.contactDps * contacted * dt) / 1000, { silent: true });

    // Auto-attack on its own cadence.
    let attacked = null;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      const target = nearestGroundTarget(this, enemies, HERO.range);
      if (target) {
        target.applyDamage(HERO.damage, HERO.strike.type);
        this.attackTimer = HERO.intervalMs;
        this.attackPulse = 180;
        attacked = target;
      } else {
        this.attackTimer = 0; // ready again the instant something walks in
      }
    }
    return { moved, attacked };
  }

  /**
   * Shieldbreaker Strike.
   *
   * Every ground creep within `radius` takes the hit exactly once: the id set is
   * per cast, and both the liveness and the distance are re-checked here rather
   * than trusting a list captured before the tap.
   *
   * @returns {{ hits:number, ready:boolean }}
   */
  strike(enemies) {
    if (this.isDown || this.strikeCooldownMs > 0) return { hits: 0, ready: false };
    const seen = new Set();
    let hits = 0;
    for (const enemy of enemies || []) {
      if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
      if (seen.has(enemy.id)) continue;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > HERO.strike.radius) continue;
      seen.add(enemy.id);
      enemy.applyDamage(HERO.strike.damage, HERO.strike.type);
      hits += 1;
    }
    this.strikeCooldownMs = HERO.strike.cooldownMs;
    this.attackPulse = 240;
    return { hits, ready: true };
  }

  /** @param {number} amount */
  takeDamage(amount, { silent = false } = {}) {
    if (this.isDown || !Number.isFinite(amount) || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (!silent) this.drawHealthBar();
    if (this.health <= 0) this.down();
  }

  down() {
    this.health = 0;
    this.destination = null;
    this.sprite.setAlpha(0.4);
    this.sprite.setTint(0x8899aa);
    this.drawHealthBar();
  }

  /** Back on its feet at the next wave. */
  revive() {
    this.health = this.maxHealth;
    this.strikeCooldownMs = Math.min(this.strikeCooldownMs, 0);
    this.sprite.setAlpha(1);
    this.sprite.clearTint?.();
    this.drawHealthBar();
  }

  drawHealthBar() {
    const bar = this.healthBar;
    if (!bar) return;
    bar.clear();
    const width = 46;
    const height = 5;
    const ratio = this.maxHealth ? this.health / this.maxHealth : 0;
    const y = -46;
    bar.fillStyle(0x0b0d12, 0.85).fillRect(-width / 2 - 1, y - 1, width + 2, height + 2);
    bar.fillStyle(0x3a2a2a, 1).fillRect(-width / 2, y, width, height);
    const colour = ratio > 0.55 ? 0x7fd48c : ratio > 0.25 ? 0xf5c451 : 0xd4453f;
    if (ratio > 0) bar.fillStyle(colour, 1).fillRect(-width / 2, y, Math.round(width * ratio), height);
  }

  destroy() {
    this.container?.destroy(true);
    this.container = null;
    this.sprite = null;
    this.healthBar = null;
  }
}
