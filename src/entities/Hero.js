/**
 * Hero.js — the Bastion Vanguard.
 *
 * It is deliberately *not* a tower: it walks, it swings at whatever ground creep
 * is within arm's reach, and it can be put down. Since the ranks landed
 * (`data/heroData.js`) it is also a unit that flies itself: autopilot picks the
 * nearest threat inside its post's aggro ring, walks into reach, swings, and
 * falls back to its post when the lane is clear. Manual orders still work — a
 * move order just suspends autopilot for a few seconds.
 *
 * Design decisions made here, because the brief leaves them open:
 *   - The hero does not block the lane. Creeps never stop for it, so adding a
 *     hero can never break the "path is fixed" rule that keeps waves readable.
 *   - Standing in a crowd costs health (`contactDps` per adjacent creep). That
 *     is what gives the downed state a cause and the move order a point.
 *   - A downed hero returns at full health when the next wave starts; there is
 *     no per-second regeneration, so parking it in the lane is expensive.
 *   - Skills cast themselves when their `auto` trigger is satisfied. Every cast
 *     is reported in `update()`'s `casts` array so the scene can play the ring,
 *     the sound and the toast without the entity knowing about any of them.
 */

import {
  DEFAULT_HERO,
  HERO_AUTO,
  HERO_SKILLS,
  HERO_TIERS,
  heroRank,
  nextHeroRank,
  skillStats,
} from '../data/heroData.js';
import { UNIT_SHEETS, unitMetrics } from '../data/unitArt.js';

/** The strip the HUD portrait and the rank-1 sprite read. */
export const HERO_TEXTURE = 'hero-vanguard';
export const HERO_SHEET = `/${UNIT_SHEETS[HERO_TEXTURE].path}`;
export const HERO_FRAME = Object.freeze({ width: 192, height: 192, count: 3 * 6 });

/**
 * The rank-1 stat line, kept as its own frozen object because the balance pass,
 * the briefing and the tests all quote it by name.
 *
 * @type {Readonly<object>}
 */
export const HERO = Object.freeze({
  maxHealth: HERO_TIERS[0].maxHealth,
  speed: HERO_TIERS[0].speed,
  range: HERO_TIERS[0].range,
  damage: HERO_TIERS[0].damage,
  intervalMs: HERO_TIERS[0].intervalMs,
  strike: HERO_TIERS[0].strike,
  contactDps: HERO_TIERS[0].contactDps,
  contactRange: HERO_TIERS[0].contactRange,
});

/** Ground units take melee damage; fliers pass overhead untouched. */
export function isGroundEnemy(enemy) {
  return Boolean(enemy) && !enemy.flying && !enemy.def?.flying;
}

export function isAliveEnemy(enemy) {
  return Boolean(enemy) && !enemy.isDead && !enemy.reachedBase && enemy.health > 0;
}

/** Closest living ground enemy inside `range` of `point`, or null. */
export function nearestGroundTarget(point, enemies, range = HERO.range) {
  let best = null;
  let bestDist = range;
  for (const enemy of enemies || []) {
    if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
    const dist = Math.hypot(enemy.x - point.x, enemy.y - point.y);
    if (dist <= bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

/** How many living ground creeps stand inside `radius` of `point`. */
export function countGroundEnemies(point, enemies, radius) {
  let count = 0;
  for (const enemy of enemies || []) {
    if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
    if (Math.hypot(enemy.x - point.x, enemy.y - point.y) <= radius) count += 1;
  }
  return count;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Hero {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   x:number, y:number, tier?:number,
   *   bounds?:{x0:number,y0:number,x1:number,y1:number},
   *   post?:{x:number,y:number}, auto?:boolean, autoSkills?:boolean,
   *   aggro?:number, leash?:number, texture?:string,
   * }} options
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.classId = options.classId || options.heroClass || DEFAULT_HERO;
    this.tier = Math.max(1, Math.min(HERO_TIERS.length, Math.round(options.tier || 1)));
    this.config = heroRank(this.classId, this.tier);
    this.classId = this.config.classId;
    this.maxHealth = this.config.maxHealth;
    this.health = this.maxHealth;
    this.speed = this.config.speed;
    this.range = this.config.range;
    this.destination = null;
    this.attackTimer = 0;
    this.strikeCooldownMs = 0;
    this.attackPulse = 0;
    this.walkMs = 0;
    this.facing = 1;
    this.bounds = options.bounds || null;
    this.textureKey = this.config.texture;

    // Autopilot. Off unless the scene asks for it, so a unit test can drive the
    // hero by hand and a manual player can keep the old feel.
    this.auto = Boolean(options.auto);
    this.autoSkills = options.autoSkills ?? this.auto;
    this.post = { x: options.post?.x ?? this.x, y: options.post?.y ?? this.y };
    this.aggro = Number.isFinite(options.aggro) ? options.aggro : HERO_AUTO.aggro;
    this.leash = Number.isFinite(options.leash) ? options.leash : HERO_AUTO.leash;
    this.target = null;
    this.thinkMs = 0;
    this.manualHoldMs = 0;

    /** Ready times for every skill the rank knows. */
    this.skillCooldowns = Object.fromEntries(this.config.skills.map((id) => [id, 0]));
    /** Damage-reduction window from Bulwark. */
    this.guardMs = 0;
    /** While > 0 the attack clip wins over walk/idle. */
    this.attackAnimMs = 0;
    this.state = 'idle';

    this.container = scene.add.container(this.x, this.y);
    this.container.setDepth(24);

    // The sheet is padded, so the drawing scale and the origin come from the
    // measured body box: the feet land on (x, y) and the aura/shadow sit there
    // too, whatever height the rank is drawn at.
    this.metrics = unitMetrics(this.textureKey, this.config.height);
    // Ground aura: the rank is readable from the board, not only from the HUD.
    this.aura = scene.add.ellipse(0, 2, 62, 18, this.config.aura, 0.18);
    this.shadow = scene.add.ellipse(0, 3, this.metrics.width * 0.72, 15, 0x000000, 0.34);
    this.sprite = this.makeSprite();
    this.container.add([this.aura, this.shadow, this.sprite]);

    this.healthBar = scene.add.graphics();
    this.container.add(this.healthBar);
    this.drawHealthBar();
    this.playAnim('idle', true);
  }

  /** A Phaser sprite when the scene has one; an image in a jsdom stub. */
  makeSprite() {
    const factory = this.scene?.add;
    const make = factory?.sprite || factory?.image;
    const sprite = make.call(factory, 0, 0, this.textureKey, 0);
    if (sprite.setOrigin) sprite.setOrigin(this.metrics.originX, this.metrics.originY);
    if (sprite.setScale) sprite.setScale(this.metrics.scale);
    return sprite;
  }

  get isDown() {
    return this.health <= 0;
  }

  get strikeReady() {
    return !this.isDown && this.strikeCooldownMs <= 0;
  }

  /** The rank label the HUD prints. */
  get tierName() {
    return this.config.name;
  }

  /** Skills this rank has unlocked, in HUD order. */
  get skills() {
    return this.config.skills;
  }

  /** Seconds left on a skill, 0 when ready. */
  skillCooldown(id) {
    if (id === 'strike') return this.strikeCooldownMs;
    return this.skillCooldowns[id] || 0;
  }

  skillCooldownMax(id) {
    if (id === 'strike') return this.config.strike.cooldownMs;
    return skillStats(id, this.tier)?.cooldownMs || 0;
  }

  /** True when this hero's class is the ranged one. */
  get isRanged() {
    return this.config.attack === 'ranged';
  }

  /** Play a clip if the sheet carries one; harmless when the scene has no anims. */
  playAnim(clip, force = false) {
    const sprite = this.sprite;
    if (!sprite?.anims || this.isDown) return;
    const key = `${this.textureKey}-${clip}`;
    if (!this.scene?.anims?.exists?.(key)) return;
    if (!force && sprite.anims.currentAnim?.key === key) return;
    sprite.play(key, true);
  }

  /**
   * Order a walk. The hero crosses terrain directly — it is a commander, not a
   * lane crawler. A manual order also tells autopilot to stand down for a while.
   */
  moveTo(x, y) {
    if (this.isDown) return false;
    this.order(x, y);
    this.manualHoldMs = HERO_AUTO.manualHoldMs;
    return true;
  }

  /** Internal order: clamped to the board and to the leash around the post. */
  order(x, y) {
    const bounds = this.bounds;
    let tx = bounds ? clamp(x, bounds.x0, bounds.x1) : x;
    let ty = bounds ? clamp(y, bounds.y0, bounds.y1) : y;
    // Autopilot never leaves its leash; a manual order is trusted as-is.
    if (this.auto && this.manualHoldMs <= 0) {
      const dx = tx - this.post.x;
      const dy = ty - this.post.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.leash) {
        tx = this.post.x + (dx / dist) * this.leash;
        ty = this.post.y + (dy / dist) * this.leash;
      }
    }
    this.destination = { x: tx, y: ty };
  }

  /** Switch autopilot on or off without losing the current order. */
  setAuto(enabled) {
    this.auto = Boolean(enabled);
    this.manualHoldMs = 0;
    if (!this.auto) {
      this.target = null;
      this.destination = null;
    }
  }

  /** Move the hero's post (the place it defends and returns to). */
  setPost(x, y) {
    this.post = { x, y };
  }

  /**
   * One simulation step.
   * @returns {{ moved:boolean, attacked:object|null, casts:string[] }}
   */
  update(deltaMs, enemies) {
    if (this.isDown) return { moved: false, attacked: null, casts: [] };
    const dt = Math.max(0, deltaMs);
    if (this.strikeCooldownMs > 0) this.strikeCooldownMs = Math.max(0, this.strikeCooldownMs - dt);
    for (const id of Object.keys(this.skillCooldowns)) {
      if (this.skillCooldowns[id] > 0) this.skillCooldowns[id] = Math.max(0, this.skillCooldowns[id] - dt);
    }
    if (this.guardMs > 0) this.guardMs = Math.max(0, this.guardMs - dt);
    if (this.attackPulse > 0) this.attackPulse = Math.max(0, this.attackPulse - dt);
    if (this.attackAnimMs > 0) this.attackAnimMs = Math.max(0, this.attackAnimMs - dt);
    if (this.manualHoldMs > 0) this.manualHoldMs = Math.max(0, this.manualHoldMs - dt);

    if (this.auto) {
      this.thinkMs -= dt;
      if (this.thinkMs <= 0) {
        this.thinkMs = HERO_AUTO.retargetMs;
        this.think(enemies);
      }
    }

    const moved = this.step(dt);

    // Contact damage: the horde does not stop, but it does not ignore you either.
    let contacted = 0;
    for (const enemy of enemies || []) {
      if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
      const reach = this.config.contactRange;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= reach) contacted += 1;
    }
    if (contacted > 0) {
      this.takeDamage((this.config.contactDps * contacted * dt) / 1000, { silent: true });
    }

    const attacked = this.swing(dt, enemies);
    this.lastCast = null;
    const casts = this.autoSkills ? this.autoCast(enemies) : [];
    this.animate(moved);
    // `castInfo` is what the last cast actually touched, so the scene can draw a
    // streak per arrow instead of one generic ring at the hero's feet.
    return { moved, attacked, casts, castInfo: this.lastCast };
  }

  /** Walk toward the current order. Returns true while actually moving. */
  step(dt) {
    let moved = false;
    if (this.destination) {
      const dx = this.destination.x - this.x;
      const dy = this.destination.y - this.y;
      const dist = Math.hypot(dx, dy);
      const stride = (this.speed * dt) / 1000;
      if (dist <= stride || dist < 1) {
        this.x = this.destination.x;
        this.y = this.destination.y;
        this.destination = null;
      } else {
        this.x += (dx / dist) * stride;
        this.y += (dy / dist) * stride;
        moved = true;
        if (Math.abs(dx) > 1) this.facing = dx < 0 ? -1 : 1;
      }
      this.container.setPosition(this.x, this.y);
      this.container.setDepth(24 + this.y * 0.001);
    }
    return moved;
  }

  /** Autopilot decision: find work near the post, otherwise go home. */
  think(enemies) {
    this.target = nearestGroundTarget(this.post, enemies, this.aggro);
    if (!this.target) {
      if (distance(this, this.post) > 8) this.order(this.post.x, this.post.y);
      else this.destination = null;
      return;
    }
    // A manual order that is still walking stays in charge of the legs; the
    // autopilot only resumes once it has arrived.
    if (this.manualHoldMs > 0) return;
    const reach = this.range * 0.92;
    const dist = distance(this, this.target);
    if (dist <= reach) {
      this.destination = null;
      return;
    }
    const standoff = Math.max(6, this.range * HERO_AUTO.standoff);
    const ux = (this.x - this.target.x) / (dist || 1);
    const uy = (this.y - this.target.y) / (dist || 1);
    this.order(this.target.x + ux * standoff, this.target.y + uy * standoff);
  }

  /** Auto-attack on its own cadence. */
  swing(dt, enemies) {
    let attacked = null;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      const target = nearestGroundTarget(this, enemies, this.range);
      if (target) {
        target.applyDamage(this.config.damage, this.config.strike.type);
        this.attackTimer = this.config.intervalMs;
        this.attackPulse = 180;
        // The Ranger's sheet has eight frames of draw-and-release; melee sheets
        // settle back to idle in six. Both read at their own length.
        this.attackAnimMs = this.isRanged ? 420 : 320;
        if (this.isRanged) this.facing = target.x < this.x ? -1 : 1;
        attacked = target;
      } else {
        this.attackTimer = 0; // ready again the instant something walks in
      }
    }
    return attacked;
  }

  /**
   * Cast any skill whose trigger is satisfied. Returns the ids that fired.
   *
   * One loop over the rank's own skill list — the class decides which skills it
   * has, the table decides what they do, and the rank decides how hard.
   */
  autoCast(enemies) {
    const casts = [];
    for (const id of this.config.skills) {
      const skill = HERO_SKILLS[id];
      if (!skill) continue;
      if (this.skillCooldown(id) > 0) continue;
      if (skill.auto?.healthRatio) {
        if (this.health / this.maxHealth > skill.auto.healthRatio) continue;
        const result = this.castSkill(id, enemies);
        if (result?.fired) casts.push(id);
        continue;
      }
      const minTargets = skill.auto?.minTargets ?? 1;
      const radius = skillStats(id, this.tier)?.radius || 0;
      if (countGroundEnemies(this, enemies, radius) < minTargets) continue;
      const result = this.castSkill(id, enemies);
      if (result?.fired) casts.push(id);
    }
    return casts;
  }

  /**
   * Cast one skill by id.
   *
   * Every skill is one of five shapes (see `kind` in heroData): a burst around
   * the hero, a volley at range, a slow, a burn, or a self-buff. They all share
   * the same once-per-target rule and the same "no damage while down" guard, so
   * a new class is a data entry rather than a new code path.
   *
   * @returns {{ fired:boolean, hits?:number, healed?:number, targets?:object[], kind?:string }}
   */
  castSkill(id, enemies) {
    if (this.isDown) return { fired: false };
    const skill = skillStats(id, this.tier);
    if (!skill) return { fired: false };
    if (this.skillCooldown(id) > 0) return { fired: false };

    if (skill.kind === 'self') {
      const healed = Math.min(this.maxHealth - this.health, this.maxHealth * skill.healRatio);
      if (healed <= 0 && this.guardMs > 0) return { fired: false };
      this.health = Math.min(this.maxHealth, this.health + healed);
      this.guardMs = skill.durationMs;
      this.skillCooldowns[id] = skill.cooldownMs;
      this.attackAnimMs = 320;
      this.drawHealthBar();
      return { fired: true, healed, kind: 'self', targets: [] };
    }

    const inRing = [];
    const seen = new Set();
    for (const enemy of enemies || []) {
      if (!isGroundEnemy(enemy) || !isAliveEnemy(enemy)) continue;
      if (seen.has(enemy.id)) continue;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > skill.radius) continue;
      seen.add(enemy.id);
      inRing.push(enemy);
    }
    if (!inRing.length) return { fired: false, hits: 0 };

    const hit = skill.kind === 'volley' ? this.rankByDistance(inRing).slice(0, skill.targets || 4) : inRing;
    let hits = 0;
    for (const enemy of hit) {
      if (skill.damage) enemy.applyDamage(skill.damage, skill.type);
      if (skill.slow) enemy.applySlow?.(skill.slow, skill.slowMs);
      if (skill.dot && enemy.applyDot) enemy.applyDot({ ...skill.dot, kind: 'fire' });
      hits += 1;
    }
    this.skillCooldowns[id] = skill.cooldownMs;
    if (id === 'strike') this.strikeCooldownMs = this.config.strike.cooldownMs;
    this.attackPulse = 240;
    this.attackAnimMs = id === 'volley' ? 520 : 380;
    // The scene draws the effect from this, not from the skill id alone.
    this.lastCast = { id, kind: skill.kind, radius: skill.radius, targets: hit, at: { x: this.x, y: this.y } };
    return { fired: true, hits, kind: skill.kind, targets: hit };
  }

  /** Closest-first ordering, so a volley spends its arrows where it matters. */
  rankByDistance(list) {
    return [...list].sort(
      (a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y)
    );
  }

  /** Idle / walk / attack clip for this frame. */
  animate(moved) {
    if (this.isDown) return;
    if (moved) this.walkMs += 16;
    this.state = this.attackAnimMs > 0 ? 'attack' : moved ? 'walk' : 'idle';
    this.playAnim(this.state);
    if (this.sprite?.setFlipX) this.sprite.setFlipX(this.facing < 0);
  }

  /**
   * Shieldbreaker Strike — the Vanguard's signature burst.
   *
   * Every ground creep within the ring takes the hit exactly once: the id set
   * is per cast, and both liveness and distance are re-checked at cast time
   * rather than trusting a list captured before the tap.
   *
   * @returns {{ hits:number, ready:boolean }}
   */
  strike(enemies) {
    if (this.isDown) return { hits: 0, ready: false };
    if (this.strikeCooldownMs > 0) return { hits: 0, ready: false };
    const result = this.castSkill('strike', enemies);
    return { hits: result.fired ? result.hits : 0, ready: true };
  }

  /**
   * War Cry: a shout that staggers everything around the hero.
   *
   * Implemented on the enemies' own slow channel (the same one the frost lines
   * use) so it stacks and expires with the rest of the crowd-control rules
   * instead of inventing a second timer.
   *
   * @returns {{ hits:number, ready:boolean }}
   */
  warcry(enemies) {
    if (this.isDown || this.skillCooldown('warcry') > 0) return { hits: 0, ready: false };
    const result = this.castSkill('warcry', enemies);
    return { hits: result.fired ? result.hits : 0, ready: true };
  }

  /** Bulwark: a self-heal plus a window of damage reduction. */
  bulwark() {
    if (this.isDown || this.skillCooldown('bulwark') > 0) return { healed: 0, ready: false };
    const result = this.castSkill('bulwark');
    return { healed: result.healed || 0, ready: result.fired };
  }

  /** @param {number} amount */
  takeDamage(amount, { silent = false } = {}) {
    if (this.isDown || !Number.isFinite(amount) || amount <= 0) return;
    const mitigated = this.guardMs > 0 ? amount * (1 - HERO_SKILLS.bulwark.guard) : amount;
    this.health = Math.max(0, this.health - mitigated);
    if (!silent) this.drawHealthBar();
    if (this.health <= 0) this.down();
  }

  down() {
    this.health = 0;
    this.destination = null;
    this.target = null;
    this.state = 'down';
    if (this.guardMs) this.guardMs = 0;
    this.sprite?.anims?.stop?.();
    this.sprite.setAlpha(0.45);
    this.sprite.setTint?.(0x8899aa);
    // No death row in the pack, so the body topples instead: the sprite is
    // rotated around its feet, which reads as "fell over" in one beat. The
    // rotation is applied immediately rather than tweened — the scene clock is
    // not reliable enough to animate a state change the player must see.
    if (this.sprite?.setAngle) this.sprite.setAngle(this.facing >= 0 ? 78 : -78);
    if (this.aura?.setAlpha) this.aura.setAlpha(0.05);
    this.drawHealthBar();
  }

  /** Back on its feet at the next wave. */
  revive() {
    this.health = this.maxHealth;
    this.strikeCooldownMs = 0;
    this.skillCooldowns = Object.fromEntries(this.config.skills.map((id) => [id, 0]));
    this.guardMs = 0;
    this.attackAnimMs = 0;
    this.attackTimer = 0;
    this.sprite.setAlpha(1);
    this.sprite.clearTint?.();
    if (this.sprite.setAngle) this.sprite.setAngle(0);
    if (this.aura?.setAlpha) this.aura.setAlpha(0.18);
    this.state = 'idle';
    this.playAnim('idle', true);
    this.drawHealthBar();
  }

  /**
   * Promote to the next rank.
   *
   * Health is carried across as a *ratio* so a promotion in the middle of a
   * fight cannot be used as a free heal, and the sprite swaps to the new sheet
   * in place.
   *
   * @returns {{ tier:number, name:string, texture:string }|null} null at the top rank
   */
  promote() {
    const next = nextHeroRank(this.classId, this.tier);
    if (!next || this.isDown) return null;
    const ratio = this.maxHealth ? this.health / this.maxHealth : 1;
    this.tier += 1;
    this.config = next;
    this.skillCooldowns = {
      ...Object.fromEntries(next.skills.map((id) => [id, 0])),
      ...this.skillCooldowns,
    };
    this.maxHealth = next.maxHealth;
    this.health = Math.max(1, Math.round(next.maxHealth * ratio));
    this.speed = next.speed;
    this.range = next.range;
    this.textureKey = next.texture;
    this.metrics = unitMetrics(this.textureKey, next.height);
    if (this.sprite?.setTexture) this.sprite.setTexture(next.texture, 0);
    if (this.sprite?.setOrigin) this.sprite.setOrigin(this.metrics.originX, this.metrics.originY);
    if (this.sprite?.setScale) this.sprite.setScale(this.metrics.scale);
    if (this.shadow?.setSize) this.shadow.setSize(this.metrics.width * 0.72, 15);
    if (this.aura?.setFillStyle) this.aura.setFillStyle(next.aura, 0.18);
    this.attackTimer = 0;
    this.playAnim('idle', true);
    this.drawHealthBar();
    return { tier: this.tier, name: next.name, texture: next.texture };
  }

  drawHealthBar() {
    const bar = this.healthBar;
    if (!bar) return;
    bar.clear();
    const width = 46;
    const height = 5;
    const ratio = this.maxHealth ? this.health / this.maxHealth : 0;
    // A full-health bar is noise on top of the bastion art (the HUD panel
    // already shows 500 / 500), so the world bar only appears once the
    // Vanguard has actually taken a hit. A downed Vanguard draws no bar at all:
    // an empty dark rectangle floating over the corpse reads as a bug, and the
    // HUD panel already says DOWN.
    if (ratio >= 1 || this.isDown) return;
    const y = -(this.metrics?.height || 80) - 12;
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
    this.aura = null;
  }
}
