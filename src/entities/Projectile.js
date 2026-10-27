import { audio } from '../rendering/AudioSynth.js';
import { PROJECTILE_TEXTURES, IMPACT_TEXTURES } from '../data/towerVisuals.js';
import { ELEMENT_BY_DAMAGE } from '../systems/Vfx.js';
import { projectileCanHit } from '../systems/TargetCategories.js';

let projIdCounter = 1;

/**
 * Trail budget.
 *
 * Every royal shot drips a fading streak behind it. A streak lives 240 ms, so a
 * salvo of slow shells would otherwise put a hundred sprites on screen at once.
 * The budget is shared by all shots in the scene and is a hard ceiling: when it
 * is full, the newest streak is skipped rather than the oldest being killed
 * (killing mid-fade looks like a dropped frame).
 */
export const TRAIL_BUDGET = 64;

/** Minimum gap between two streaks from the same shot (ms). */
export const TRAIL_INTERVAL_MS = 40;

/** How long one streak lives before it is gone (ms). */
export const TRAIL_LIFE_MS = 240;

export class Projectile {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} type 'arrow' | 'cannonball' | 'frost' | 'rapid' | 'sniper' | 'lightning' | 'hammer' | 'rune'
   * @param {number} x
   * @param {number} y
   * @param {import('./Enemy.js').Enemy} target
   * @param {object} stats { damage, speed, damageType, armorPenetration, armorBreak, armorBreakMs, splash, slow, slowMs, chainTargets, chainRange }
   * @param {import('./Enemy.js').Enemy[]} activeEnemies reference to active enemy list
   * @param {string|null} [textureOverride] art key for upgraded tiers (e.g. 'proj-frost-3')
   */
  constructor(scene, type, x, y, target, stats, activeEnemies, textureOverride = null) {
    this.id = projIdCounter++;
    this.scene = scene;
    this.type = type;
    this.x = x;
    this.y = y;
    this.target = target;
    this.stats = stats;
    this.impactKey = stats.impactKey || null;
    this.activeEnemies = activeEnemies;
    this.speed = stats.speed || 480;
    this.isDead = false;

    // Sprite
    const spriteKey = textureOverride || PROJECTILE_TEXTURES[type] || 'proj-arrow';
    const textureKey = scene.textures.exists(spriteKey) ? spriteKey : 'proj-arrow';
    this.textureKey = textureKey;
    this.sprite = scene.add.image(x, y, textureKey);
    this.sprite.setDepth(40);

    // Per-line trail (Request 43 §5). Only the royal lines ship one; the older
    // shots keep their plain sprite, so nothing changes for them.
    this.trailKey = this.resolveTrailKey(scene, stats.line);
    this.trailTimer = 0;

    // Missiles are drawn pointing UP in the Spire art, so bias the heading by a
    // quarter turn to make the nose lead the flight path.
    const dx = target.x - x;
    const dy = target.y - y;
    this.artOffset = this.isPointingUp() ? Math.PI / 2 : 0;
    this.sprite.rotation = Math.atan2(dy, dx) + this.artOffset;

    // Arc tracking for cannonball
    this.startX = x;
    this.startY = y;
    this.targetX = target.x;
    this.targetY = target.y;
    this.totalDist = Math.hypot(dx, dy);
    this.traveledDist = 0;
  }

  /** `fx-line-<line>-trail`, if this line ships one. */
  resolveTrailKey(scene, line) {
    if (!line) return null;
    const key = `fx-line-${line}-trail`;
    return scene.textures?.exists?.(key) ? key : null;
  }

  /**
   * Drip a short streak behind the shot.
   *
   * The streak is its own tweened image, not a particle emitter: the count is
   * bounded by `TRAIL_BUDGET` and each sprite destroys itself, so a long battle
   * cannot accumulate objects (Request 43 §10).
   */
  spawnTrail() {
    if (!this.trailKey || typeof this.scene.add?.image !== 'function') return null;
    const live = Number(this.scene.__trailSprites) || 0;
    if (live >= TRAIL_BUDGET) return null;
    const streak = this.scene.add
      .image(this.x, this.y, this.trailKey)
      .setDepth(39)
      .setAlpha(0.55)
      .setScale(0.9)
      .setRotation(this.sprite.rotation);
    streak.setBlendMode?.('ADD');
    this.scene.__trailSprites = live + 1;
    const release = () => {
      this.scene.__trailSprites = Math.max(0, (Number(this.scene.__trailSprites) || 1) - 1);
      streak.destroy?.();
    };
    const tween = this.scene.tweens?.add?.({
      targets: streak,
      alpha: 0,
      scale: 0.38,
      duration: TRAIL_LIFE_MS,
      ease: 'Quad.easeOut',
      onComplete: release,
    });
    // A scene without tweens (headless harness) would otherwise leak the streak.
    if (!tween) release();
    return streak;
  }

  /** Advance the trail clock; called from `update()` while the shot is flying. */
  updateTrail(deltaMs) {
    if (!this.trailKey) return;
    this.trailTimer += deltaMs;
    if (this.trailTimer < TRAIL_INTERVAL_MS) return;
    this.trailTimer = 0;
    this.spawnTrail();
  }

  /** True when the artwork is a vertical bolt/arrow (taller than it is wide). */
  isPointingUp() {
    const frame = this.scene.textures.get ? this.scene.textures.get(this.textureKey) : null;
    const src = frame?.getSourceImage?.();
    return !!src && src.height > src.width;
  }

  /**
   * The elemental impact.
   *
   * Two libraries are in play: the Spire pack's small impact strips (still used
   * as a fallback so a texture hiccup is cosmetic) and the Kenney effect set,
   * which is what actually sells the hit — a separate burst per damage type,
   * sparks, and a smoke puff behind them.
   */
  spawnImpact(x, y, type, options = {}) {
    const element = ELEMENT_BY_DAMAGE[this.stats.damageType] || 'physical';
    const vfx = this.scene.vfx;
    if (vfx?.impact) {
      vfx.impact(x, y, element, {
        scale: options.scale ?? 1,
        splash: options.splash ?? 0,
        line: this.stats.line || null,
        shake: true,
      });
      return;
    }
    const key = this.impactKey || IMPACT_TEXTURES[type];
    if (!key || !this.scene.anims.exists(`${key}-burst`)) return;
    const puff = this.scene.add.sprite(x, y, key, 0).setDepth(42);
    puff.play(`${key}-burst`);
    puff.once('animationcomplete', () => puff.destroy());
  }

  update(deltaMs) {
    if (this.isDead) return;

    // Where this shot is going.
    //
    //   groundTarget (mortar)  the point was fixed at launch — the shell lands
    //                          where the crew aimed it, and the blast is centred
    //                          on those real coordinates, not on a body that may
    //                          have walked away;
    //   dead target            keep the last known point (no silent re-target);
    //   otherwise              track the locked target (artillery keeps the
    //                          creep it fired at and never switches mid-flight).
    const locked = this.stats.groundTarget;
    const destX = locked ? this.targetX : this.target?.isDead ? this.targetX : (this.target?.x ?? this.targetX);
    const destY = locked ? this.targetY : this.target?.isDead ? this.targetY : (this.target?.y ?? this.targetY);

    const dx = destX - this.x;
    const dy = destY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * deltaMs) / 1000;

    if (this.type !== 'cannonball') {
      this.sprite.rotation = Math.atan2(dy, dx) + this.artOffset;
    } else {
      this.sprite.rotation += deltaMs * 0.01;
    }

    if (dist <= step || dist < 8) {
      this.impact(destX, destY);
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.sprite.setPosition(this.x, this.y);
      this.updateTrail(deltaMs);

      // Cannonball parabolic arc
      if (this.type === 'cannonball') {
        this.traveledDist += step;
        const progress = Math.min(1, this.traveledDist / Math.max(1, this.totalDist));
        const arc = Math.sin(progress * Math.PI) * 0.45;
        this.sprite.setScale(1 + arc);
      }
    }
  }

  impact(impactX, impactY) {
    if (this.isDead) return;
    this.isDead = true;

    // Any projectile carrying a splash radius detonates — the Hammerforge
    // shells travel under their own type, and gating on 'cannonball' would
    // silently drop their area damage.
    if (this.stats.splash > 0) {
      // Area of effect detonation
      audio.playExplosion();

      // The blast used to be a flat orange circle. It is now the effect
      // library's ground burst plus a scorch ring, sized to the real splash
      // radius so the area of effect is legible at a glance.
      this.scene.vfx?.groundBlast?.(impactX, impactY, Math.max(0.7, this.stats.splash / 70));
      this.spawnImpact(impactX, impactY, this.type, {
        scale: Math.min(1.5, Math.max(0.8, this.stats.splash / 90)),
        splash: this.stats.splash,
      });

      if (this.scene.particleEmitter) {
        this.scene.particleEmitter.explode(16, impactX, impactY);
      }

      // Distribute splash damage with real distance falloff. Passing the
      // distance through is what makes `calculateSplashDamage` (100 % at the
      // centre → 40 % at the rim) actually run; it used to be dead code and
      // every enemy in the blast took full damage.
      for (const enemy of this.activeEnemies) {
        if (enemy.isDead || enemy.reachedBase) continue;
        // The blast keeps the firing line's targeting rules. A ground-only
        // shell that catches a wraith in its radius used to damage it, which
        // made "this tower cannot hit air" a lie the moment two creeps stood
        // close together. A shell that is *meant* to sweep the sky says so with
        // `splashIgnoresTargeting` in its data.
        if (!this.stats.splashIgnoresTargeting && !projectileCanHit(this.stats, enemy)) continue;
        const d = Math.hypot(enemy.x - impactX, enemy.y - impactY);
        if (d <= this.stats.splash) {
          const res = this.hitEnemy(enemy, this.stats.damage, {
            distance: d,
            splashRadius: this.stats.splash,
          });
          if (res.finalDamage > 0) {
            this.showDamageText(enemy.x, enemy.y - 10, res.finalDamage, 0xff7a59);
          }
        }
      }

      // A burning shell leaves a pool on the ground: everything that walks into
      // it catches the same burn, so the Napalm branches reward placement.
      if (this.stats.dot && this.stats.splash >= 60) {
        this.layFirePool(impactX, impactY, this.stats.splash);
      }
    } else {
      // Single target impact
      audio.playEnemyHit();

      if (this.target && !this.target.isDead && projectileCanHit(this.stats, this.target)) {
        // A splash shell already damaged this target in the loop above; do not
        // hit it a second time, only top up the status effects.
        const alreadyHit = (this.stats.splash || 0) > 0;
        const res = alreadyHit
          ? { finalDamage: 0 }
          : this.hitEnemy(this.target, this.stats.damage);

        // Color coding by damage type
        let textColor = 0xf5c451; // Gold for physical
        if (this.stats.damageType === 'piercing') textColor = 0xff5470; // Crimson for sniper crit/pen
        else if (this.stats.damageType === 'magic') textColor = 0x7fe9ff; // Cyan for frost/magic
        else if (this.stats.damageType === 'lightning') textColor = 0xffea78; // Yellow for lightning

        if (res.finalDamage > 0) {
          this.showDamageText(this.target.x, this.target.y - 10, res.finalDamage, textColor);
        }

        if (this.stats.slow && this.stats.slowMs) {
          this.target.applySlow(this.stats.slow, this.stats.slowMs);
        }

        // Chain Lightning Specialization Mechanic
        if (this.stats.chainTargets > 0) {
          this.executeChainLightning(this.target);
        }

        // Level-5 frost: the bolt detonates as a nova, freezing everything in
        // the ring instead of only the creep it hit.
        if (this.stats.nova > 0) {
          this.frostNova(this.target.x, this.target.y);
        }
      }

      this.spawnImpact(impactX, impactY, this.type, {
        scale: this.stats.damage >= 160 ? 1.2 : 1,
      });

      if (this.scene.particleEmitter) {
        this.scene.particleEmitter.explode(5, impactX, impactY);
      }
    }

    this.destroy();
  }

  /**
   * Damage one enemy with this shot's full payload.
   *
   * Keeps the three "extra" effects in one place so splash, single-target and
   * chain hits all behave the same:
   *   bossBonus  extra fraction against `isBoss` targets
   *   dot        burn / poison stack
   *   stunMs     harpoon-style movement freeze
   */
  hitEnemy(enemy, damage, options = {}) {
    const bossBonus = this.stats.bossBonus || 0;
    const scaled = bossBonus && enemy.isBoss ? Math.round(damage * (1 + bossBonus)) : damage;
    const d = options.distance;
    const res = enemy.applyDamage(scaled, this.stats.damageType || 'physical', {
      armorPenetration: options.armorPenetration ?? this.stats.armorPenetration ?? 0,
      armorBreak: options.armorBreak ?? this.stats.armorBreak ?? 0,
      armorBreakMs: options.armorBreakMs ?? this.stats.armorBreakMs ?? 0,
      distance: d,
      splashRadius: options.splashRadius ?? 0,
    });
    if (this.stats.dot) enemy.applyDot?.(this.stats.dot);
    if (this.stats.stunMs) enemy.applyStun?.(this.stats.stunMs);
    return res;
  }

  /** Burning ground left by the napalm branches. Purely visual + a slow tick. */
  layFirePool(x, y, radius) {
    if (!this.scene.add?.image || !this.scene.textures?.exists?.('fx-line-flamer-impact')) {
      return;
    }
    const pool = this.scene.add
      .image(x, y + 6, 'fx-line-flamer-impact', 0)
      .setAlpha(0.5)
      .setDepth(18);
    pool.setScale?.((radius / 64) * 0.9);
    this.scene.tweens?.add?.({
      targets: pool,
      alpha: 0.18,
      duration: Math.max(600, this.stats.dot.durationMs || 1200),
      onComplete: () => pool.destroy(),
    });
  }

  /**
   * Ice nova: damage every creep inside the radius and chill it.
   *
   * The visual is the effect library's shard burst; the gameplay effect is the
   * same slow the tower already applies, so a nova tower is a stronger Blizzard
   * rather than a new mechanic to learn.
   */
  frostNova(x, y) {
    const radius = this.stats.nova;
    this.scene.vfx?.nova?.(x, y, Math.min(1.8, radius / 90));
    this.scene.cameras?.main?.shake?.(70, 0.0022);
    for (const enemy of this.activeEnemies) {
      if (enemy.isDead || enemy.reachedBase) continue;
      // A nova is still a shot from *this* tower: a frost bolt that cannot
      // reach the sky must not freeze a wyvern standing in the ring.
      if (!projectileCanHit(this.stats, enemy)) continue;
      const d = Math.hypot(enemy.x - x, enemy.y - y);
      if (d > radius) continue;
      if (this.stats.slow && this.stats.slowMs) {
        enemy.applySlow(this.stats.slow, this.stats.slowMs);
      }
      const res = enemy.applyDamage(Math.round(this.stats.damage * 0.4), 'frost', {
        distance: d,
        splashRadius: radius,
      });
      if (res.finalDamage > 0) {
        this.showDamageText(enemy.x, enemy.y - 10, res.finalDamage, 0x9fe6ff);
      }
    }
  }

  executeChainLightning(primaryTarget) {
    const chainRange = this.stats.chainRange || 90;
    const maxChains = this.stats.chainTargets || 2;
    // Every creep this arc has already touched. The old loop walked the enemy
    // array once, so it could not repeat a target — but it also could not pick
    // the *nearest* one, and it ignored the firing line's categories entirely:
    // a ground-locked keep's lightning climbed into the sky.
    const visited = new Set([primaryTarget]);
    let lastTarget = primaryTarget;
    let hitCount = 0;

    while (hitCount < maxChains) {
      let next = null;
      let nextDist = Infinity;
      for (const enemy of this.activeEnemies) {
        if (visited.has(enemy) || enemy.isDead || enemy.reachedBase) continue;
        if (!projectileCanHit(this.stats, enemy)) continue;
        const d = Math.hypot(enemy.x - lastTarget.x, enemy.y - lastTarget.y);
        if (d <= chainRange && d < nextDist) {
          next = enemy;
          nextDist = d;
        }
      }
      if (!next) break;

      // Draw lightning line between targets
      const line = this.scene.add.graphics();
      line.setDepth(45);
      const chainColour = this.stats.damageType === 'magic' ? 0xa980e2 : 0xffea78;
      line.lineStyle(2, chainColour, 0.9);
      line.lineBetween(lastTarget.x, lastTarget.y, next.x, next.y);
      this.scene.tweens.add({
        targets: line,
        alpha: 0,
        duration: 150,
        onComplete: () => line.destroy(),
      });

      // Each hop carries `chainFalloff` of the previous one (Tesla data), so a
      // five-target arc cannot quietly out-damage the single-target guns. The
      // `visited` set above is what stops one chain hitting the same creep
      // twice, and `projectileCanHit` keeps the firing line's categories.
      const falloff = this.stats.chainFalloff ?? 0.75;
      const chainDmg = Math.round(this.stats.damage * Math.pow(falloff, hitCount + 1));
      const res = next.applyDamage(chainDmg, this.stats.damageType || 'lightning');
      if (res.finalDamage > 0) {
        this.showDamageText(next.x, next.y - 10, res.finalDamage, 0xffea78);
      }

      visited.add(next);
      lastTarget = next;
      hitCount += 1;
    }
  }

  /**
   * `0xRRGGBB` to a CSS colour.
   *
   * This used to call `Phaser.Display.Color.IntegerToColor`, which means the
   * class only worked while a global `Phaser` happened to exist. Entities
   * should not depend on a renderer global — it also made the damage funnel
   * untestable outside a browser — so the conversion is done here.
   */
  static cssColor(color) {
    return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
  }

  showDamageText(x, y, amount, color = 0xffffff) {
    const text = this.scene.add.text(x + (Math.random() * 12 - 6), y, `-${amount}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: Projectile.cssColor(color),
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setDepth(50);
    this.scene.tweens.add({
      targets: text,
      y: y - 24,
      alpha: 0,
      duration: 550,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
