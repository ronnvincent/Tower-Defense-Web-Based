import { audio } from '../rendering/AudioSynth.js';
import { PROJECTILE_TEXTURES, IMPACT_TEXTURES } from '../data/towerVisuals.js';
import { ELEMENT_BY_DAMAGE } from '../systems/Vfx.js';

let projIdCounter = 1;

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

    // Target may have died or moved
    const destX = this.target?.isDead ? this.targetX : (this.target?.x ?? this.targetX);
    const destY = this.target?.isDead ? this.targetY : (this.target?.y ?? this.targetY);

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

      if (this.target && !this.target.isDead) {
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
    let hitCount = 0;
    let lastTarget = primaryTarget;

    for (const enemy of this.activeEnemies) {
      if (enemy === primaryTarget || enemy.isDead || enemy.reachedBase) continue;
      const d = Math.hypot(enemy.x - lastTarget.x, enemy.y - lastTarget.y);
      if (d <= chainRange) {
        // Draw lightning line between targets
        const line = this.scene.add.graphics();
        line.setDepth(45);
        line.lineStyle(2, 0xffea78, 0.9);
        line.lineBetween(lastTarget.x, lastTarget.y, enemy.x, enemy.y);
        this.scene.tweens.add({
          targets: line,
          alpha: 0,
          duration: 150,
          onComplete: () => line.destroy(),
        });

        const chainDmg = Math.round(this.stats.damage * 0.75);
        const res = enemy.applyDamage(chainDmg, 'lightning');
        if (res.finalDamage > 0) {
          this.showDamageText(enemy.x, enemy.y - 10, res.finalDamage, 0xffea78);
        }

        lastTarget = enemy;
        hitCount++;
        if (hitCount >= maxChains) break;
      }
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
