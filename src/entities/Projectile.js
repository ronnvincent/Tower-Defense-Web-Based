import { audio } from '../rendering/AudioSynth.js';

let projIdCounter = 1;

export class Projectile {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} type 'arrow' | 'cannonball' | 'frost' | 'rapid' | 'sniper' | 'lightning'
   * @param {number} x
   * @param {number} y
   * @param {import('./Enemy.js').Enemy} target
   * @param {object} stats { damage, speed, damageType, armorPenetration, armorBreak, armorBreakMs, splash, slow, slowMs, chainTargets, chainRange }
   * @param {import('./Enemy.js').Enemy[]} activeEnemies reference to active enemy list
   */
  constructor(scene, type, x, y, target, stats, activeEnemies) {
    this.id = projIdCounter++;
    this.scene = scene;
    this.type = type;
    this.x = x;
    this.y = y;
    this.target = target;
    this.stats = stats;
    this.activeEnemies = activeEnemies;
    this.speed = stats.speed || 480;
    this.isDead = false;

    // Sprite
    const spriteKey = `proj-${type}`;
    const textureKey = scene.textures.exists(spriteKey) ? spriteKey : 'proj-arrow';
    this.sprite = scene.add.image(x, y, textureKey);
    this.sprite.setDepth(40);

    // Initial orientation
    const dx = target.x - x;
    const dy = target.y - y;
    this.sprite.rotation = Math.atan2(dy, dx);

    // Arc tracking for cannonball
    this.startX = x;
    this.startY = y;
    this.targetX = target.x;
    this.targetY = target.y;
    this.totalDist = Math.hypot(dx, dy);
    this.traveledDist = 0;
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
      this.sprite.rotation = Math.atan2(dy, dx);
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

    if (this.type === 'cannonball' && this.stats.splash > 0) {
      // Area of effect detonation
      audio.playExplosion();

      const blast = this.scene.add.circle(impactX, impactY, this.stats.splash, 0xff7a59, 0.35);
      blast.setDepth(35);
      this.scene.tweens.add({
        targets: blast,
        alpha: 0,
        scale: 1.25,
        duration: 220,
        onComplete: () => blast.destroy(),
      });

      if (this.scene.particleEmitter) {
        this.scene.particleEmitter.explode(16, impactX, impactY);
      }

      // Distribute splash damage with distance falloff
      for (const enemy of this.activeEnemies) {
        if (enemy.isDead || enemy.reachedBase) continue;
        const d = Math.hypot(enemy.x - impactX, enemy.y - impactY);
        if (d <= this.stats.splash) {
          const res = enemy.applyDamage(this.stats.damage, this.stats.damageType || 'explosive', {
            armorBreak: this.stats.armorBreak || 0,
            armorBreakMs: this.stats.armorBreakMs || 0,
          });
          if (res.finalDamage > 0) {
            this.showDamageText(enemy.x, enemy.y - 10, res.finalDamage, 0xff7a59);
          }
        }
      }
    } else {
      // Single target impact
      audio.playEnemyHit();

      if (this.target && !this.target.isDead) {
        const res = this.target.applyDamage(this.stats.damage, this.stats.damageType || 'physical', {
          armorPenetration: this.stats.armorPenetration || 0,
          armorBreak: this.stats.armorBreak || 0,
          armorBreakMs: this.stats.armorBreakMs || 0,
        });

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
      }

      if (this.scene.particleEmitter) {
        this.scene.particleEmitter.explode(5, impactX, impactY);
      }
    }

    this.destroy();
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

  showDamageText(x, y, amount, color = 0xffffff) {
    const text = this.scene.add.text(x + (Math.random() * 12 - 6), y, `-${amount}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
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
