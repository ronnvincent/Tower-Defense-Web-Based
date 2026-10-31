/**
 * Pet.js — a bought companion that fights beside the Vanguard.
 *
 * The companion is deliberately simple to read: it walks behind the hero, it
 * plays its own idle / walk / attack clips, and every few seconds it uses the
 * one ability its definition carries. It cannot be targeted and it never blocks
 * the lane, so adding one can never change the path a wave walks.
 *
 * Abilities are applied to the enemies the game already has — `applyDamage`,
 * `applySlow`, `applyDot` — instead of inventing parallel status timers, so a
 * burn from a torch goblin expires with the same rules as a flame line.
 */

import { PET_FOLLOW, PET_MAX_LEVEL, petAbility } from '../data/petData.js';
import { unitMetrics } from '../data/unitArt.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closest living ground enemy to `point` inside `range`, or null. */
function nearestTarget(point, enemies, range) {
  let best = null;
  let bestDist = range;
  for (const enemy of enemies || []) {
    if (!enemy || enemy.isDead || enemy.reachedBase || enemy.health <= 0) continue;
    if (enemy.flying || enemy.def?.flying) continue;
    const dist = distance(point, enemy);
    if (dist <= bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

/** The creep with the most neighbours inside `radius` — the bomb's best target. */
function densestTarget(point, enemies, range, radius) {
  const inRange = (enemies || []).filter(
    (enemy) =>
      enemy &&
      !enemy.isDead &&
      !enemy.reachedBase &&
      enemy.health > 0 &&
      !enemy.flying &&
      !enemy.def?.flying &&
      distance(point, enemy) <= range
  );
  let best = null;
  let bestScore = 0;
  for (const enemy of inRange) {
    let score = 0;
    for (const other of inRange) if (distance(enemy, other) <= radius) score += 1;
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

export class Pet {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../data/petData.js').PetDefinition} definition
   * @param {{ x:number, y:number, bounds?:object }} options
   */
  constructor(scene, definition, options = {}) {
    this.scene = scene;
    this.def = definition;
    // The companion fights with the numbers its level actually buys; the shop
    // prints its cards from the same function.
    const level = Math.max(1, Math.min(PET_MAX_LEVEL, Math.round(Number(options.level) || 1)));
    this.level = level;
    this.stats = petAbility(definition, level);
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.bounds = options.bounds || null;
    this.cooldownMs = 0;
    this.facing = 1;
    this.attackAnimMs = 0;
    this.state = 'idle';
    this.lastCast = null;
    this.casts = 0;

    this.container = scene.add.container(this.x, this.y);
    this.container.setDepth(23);
    this.metrics = unitMetrics(this.def.texture, this.def.height);
    this.shadow = scene.add.ellipse(0, 0, this.metrics.width * 0.7, 9, 0x000000, 0.3);
    this.sprite = this.makeSprite();
    this.container.add([this.shadow, this.sprite]);
    this.playAnim('idle', true);
  }

  makeSprite() {
    const factory = this.scene?.add;
    const make = factory?.sprite || factory?.image;
    const sprite = make.call(factory, 0, 0, this.def.texture, 0);
    if (sprite.setOrigin) sprite.setOrigin(this.metrics.originX, this.metrics.originY);
    if (sprite.setScale) sprite.setScale(this.metrics.scale);
    return sprite;
  }

  get ability() {
    return this.stats;
  }

  get ready() {
    return this.cooldownMs <= 0;
  }

  playAnim(clip, force = false) {
    const sprite = this.sprite;
    if (!sprite?.anims) return;
    const key = `${this.def.texture}-${clip}`;
    if (!this.scene?.anims?.exists?.(key)) return;
    if (!force && sprite.anims.currentAnim?.key === key) return;
    sprite.play(key, true);
  }

  /** Walk to the spot the hero's shoulder leaves for it. */
  follow(hero, dt) {
    if (!hero) return false;
    const targetX = hero.x - Math.sign(hero.facing || 1) * PET_FOLLOW.offsetX;
    const targetY = hero.y + PET_FOLLOW.offsetY;
    const dist = distance(this, { x: targetX, y: targetY });
    if (dist > PET_FOLLOW.snapDistance) {
      this.x = targetX;
      this.y = targetY;
      this.container.setPosition(this.x, this.y);
      return false;
    }
    if (dist < 2) return false;
    // Frame-rate independent catch-up: the fraction is per 60 Hz step.
    const step = 1 - Math.pow(1 - PET_FOLLOW.catchUp, Math.max(0.001, dt) / 16.667);
    this.x += (targetX - this.x) * step;
    this.y += (targetY - this.y) * step;
    if (Math.abs(targetX - this.x) > 1) this.facing = targetX < this.x ? -1 : 1;
    this.container.setPosition(this.x, this.y);
    this.container.setDepth(23 + this.y * 0.001);
    return true;
  }

  /**
   * One simulation step.
   *
   * @returns {{ cast:object|null }} `cast` is `{ id, hits, targets }` when the
   *   ability fired this frame, so the scene can play one impact and one sound.
   */
  update(deltaMs, enemies, hero) {
    const dt = Math.max(0, deltaMs);
    if (this.cooldownMs > 0) this.cooldownMs = Math.max(0, this.cooldownMs - dt);
    if (this.attackAnimMs > 0) this.attackAnimMs = Math.max(0, this.attackAnimMs - dt);

    const moving = this.follow(hero, dt);
    let cast = null;
    if (hero && !hero.isDown && this.ready) {
      cast = this.cast(enemies, hero);
    }

    this.state = this.attackAnimMs > 0 ? 'attack' : moving ? 'walk' : 'idle';
    this.playAnim(this.state);
    if (this.sprite?.setFlipX) this.sprite.setFlipX(this.facing < 0);
    return { cast };
  }

  /** Fire the ability if it is off cooldown and there is something to do. */
  cast(enemies, hero) {
    if (!this.ready) return null;
    const ability = this.stats;
    if (ability.id === 'mend') return this.mend(hero);
    if (ability.id === 'bomb') return this.bomb(enemies);
    const target = nearestTarget(this, enemies, ability.range);
    if (!target) return null;
    if (ability.id === 'shot') return this.shot(target);
    if (ability.id === 'burn') return this.burn(target);
    return this.taunt(target);
  }

  /** Single-target arrow. */
  shot(target) {
    target.applyDamage(this.ability.damage, this.ability.type);
    this.finishCast();
    return { id: 'shot', hits: 1, targets: [target] };
  }

  /** Melee hit plus a stagger. */
  taunt(target) {
    target.applyDamage(this.ability.damage, this.ability.type);
    target.applySlow?.(this.ability.slow, this.ability.slowMs);
    this.finishCast();
    return { id: 'taunt', hits: 1, targets: [target] };
  }

  /** Set the target alight: damage over time on the enemy's own DOT channel. */
  burn(target) {
    if (target.applyDot) {
      target.applyDot({
        damage: this.ability.damage,
        tickMs: this.ability.tickMs,
        durationMs: this.ability.durationMs,
        kind: 'fire',
      });
    } else {
      target.applyDamage(this.ability.damage, this.ability.type);
    }
    this.finishCast();
    return { id: 'burn', hits: 1, targets: [target] };
  }

  /** Area blast around the densest knot inside range. */
  bomb(enemies) {
    const ability = this.ability;
    const target = densestTarget(this, enemies, ability.range, ability.radius);
    if (!target) return null;
    const seen = new Set();
    const hit = [];
    for (const enemy of enemies || []) {
      if (!enemy || enemy.isDead || enemy.reachedBase || enemy.health <= 0) continue;
      if (enemy.flying || enemy.def?.flying) continue;
      if (seen.has(enemy.id)) continue;
      if (distance(target, enemy) > ability.radius) continue;
      seen.add(enemy.id);
      enemy.applyDamage(ability.damage, ability.type);
      hit.push(enemy);
    }
    this.finishCast();
    return { id: 'bomb', hits: hit.length, targets: hit, at: { x: target.x, y: target.y } };
  }

  /** Mend the Vanguard — only when there is something to mend. */
  mend(hero) {
    const ability = this.ability;
    const missing = hero.maxHealth ? 1 - hero.health / hero.maxHealth : 0;
    if (missing < ability.minMissingRatio) return null;
    const heal = Math.min(hero.maxHealth - hero.health, hero.maxHealth * ability.healRatio);
    if (heal <= 0) return null;
    hero.health = Math.min(hero.maxHealth, hero.health + heal);
    hero.drawHealthBar?.();
    this.finishCast();
    return { id: 'mend', hits: 1, heal, targets: [] };
  }

  finishCast() {
    this.cooldownMs = this.ability.cooldownMs;
    this.attackAnimMs = 420;
    this.casts += 1;
  }

  destroy() {
    this.container?.destroy(true);
    this.container = null;
    this.sprite = null;
  }
}
