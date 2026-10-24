import { TILE_SIZE } from '../config/gameConfig.js';
import { parseCellKey } from '../dsa/Graph.js';
import { ENEMY_TYPES, waveHealthMultiplier } from '../data/enemyData.js';
import { calculateDamage, DAMAGE_TYPE } from '../systems/CombatCalculator.js';
import { audio } from '../rendering/AudioSynth.js';

let enemyIdCounter = 1;

export class Enemy {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} typeKey key in ENEMY_TYPES
   * @param {number} waveNumber 1-based wave number
   * @param {string[]} path array of "row,col" cell keys
   * @param {object} callbacks
   * @param {(enemy:Enemy) => void} callbacks.onReachedBase
   * @param {(enemy:Enemy) => void} callbacks.onDefeated
   * @param {(enemy:Enemy, phase:object) => void} [callbacks.onBossPhaseChange]
   * @param {(enemy:Enemy) => void} [callbacks.onBossSpawn]
   * @param {(enemy:Enemy) => void} [callbacks.onBossDefeated]
   * @param {(type:string, count:number) => void} [callbacks.onSummonMinions]
   */
  constructor(scene, typeKey, waveNumber, path, callbacks) {
    this.id = enemyIdCounter++;
    this.scene = scene;
    this.typeKey = typeKey;
    this.def = ENEMY_TYPES[typeKey] || ENEMY_TYPES.grunt;
    this.callbacks = callbacks || {};

    // Health calculation with wave scaling
    const mult = waveHealthMultiplier(waveNumber);
    this.maxHealth = Math.round(this.def.health * mult);
    this.health = this.maxHealth;
    this.baseSpeed = this.def.speed;
    this.speed = this.baseSpeed;
    this.armor = this.def.armor || 0;
    this.maxShield = Math.round((this.def.shield || 0) * mult);
    this.shield = this.maxShield;
    this.reward = this.def.reward;
    this.score = this.def.score;
    this.baseDamage = this.def.baseDamage;
    this.radius = this.def.radius;
    this.isBoss = !!this.def.isBoss;

    // Boss Mechanics
    this.bossPhases = this.def.bossPhases || [];
    this.currentPhaseIndex = 0;
    this.immuneToSlow = false;

    // Path following
    this.path = [...path];
    this.pathIndex = 0;
    this.distanceTraveled = 0;

    // Status effects
    this.slowTimer = 0;
    this.slowFactor = 0;
    this.armorBreak = 0;
    this.armorBreakTimer = 0;
    this.abilityTimer = 0;

    // States
    this.isDead = false;
    this.reachedBase = false;
    this.wobbleTimer = Math.random() * 10;

    // Spawn coordinate from first path node
    const startCoord = this.getCellCenter(this.path[0]);
    this.x = startCoord.x;
    this.y = startCoord.y;

    // Phaser visual container
    this.container = scene.add.container(this.x, this.y);

    // Drop shadow
    this.shadow = scene.add.image(0, 4, 'shadow').setDisplaySize(this.radius * 2.2, this.radius * 1.1);
    this.container.add(this.shadow);

    // Main sprite
    this.baseScale = (this.radius * 2.3) / 64;
    const spriteKey = this.def.spriteKey || `enemy-${this.typeKey}`;
    this.sprite = scene.add.image(0, 0, spriteKey).setScale(this.baseScale);

    if (this.def.useSlimeAnim && scene.anims.exists('slime-bounce')) {
      this.sprite.play('slime-bounce');
    }
    this.container.add(this.sprite);

    // Kinetic Shield Visual Barrier (if shielded)
    if (this.shield > 0) {
      this.createShieldBarrier();
    }

    // Health bar container
    const barWidth = Math.max(30, this.radius * 1.8);
    this.barWidth = barWidth;
    this.hpBarBg = scene.add.rectangle(0, -this.radius - 8, barWidth + 2, 5, 0x11131a);
    this.hpBarFill = scene.add.rectangle(-barWidth / 2, -this.radius - 8, barWidth, 3, 0x5cf2a6);
    this.hpBarFill.setOrigin(0, 0.5);
    this.container.add(this.hpBarBg);
    this.container.add(this.hpBarFill);

    // Shield Bar (cyan, layered above health bar if maxShield > 0)
    if (this.maxShield > 0) {
      this.shieldBarBg = scene.add.rectangle(0, -this.radius - 13, barWidth + 2, 4, 0x091424);
      this.shieldBarFill = scene.add.rectangle(-barWidth / 2, -this.radius - 13, barWidth, 2, 0x4ee1ff);
      this.shieldBarFill.setOrigin(0, 0.5);
      this.container.add(this.shieldBarBg);
      this.container.add(this.shieldBarFill);
    }

    this.container.setDepth(20 + this.y * 0.001);

    // Notify scene of boss entrance
    if (this.isBoss && this.callbacks.onBossSpawn) {
      this.callbacks.onBossSpawn(this);
    }
  }

  createShieldBarrier() {
    if (this.shieldBarrier || !this.scene?.add) return;
    const size = this.radius * 2.8;
    this.shieldBarrier = this.scene.add.image(0, 0, 'shield-barrier')
      .setDisplaySize(size, size)
      .setAlpha(0.65)
      .setTint(0x4ee1ff);
    this.container.add(this.shieldBarrier);

    // Subtle pulsing animation on barrier
    this.scene.tweens.add({
      targets: this.shieldBarrier,
      scaleX: this.shieldBarrier.scaleX * 1.08,
      scaleY: this.shieldBarrier.scaleY * 1.08,
      alpha: 0.85,
      yoyo: true,
      duration: 750,
      repeat: -1,
    });
  }

  getCellCenter(key) {
    if (!key) return { x: this.x, y: this.y };
    const { row, col } = parseCellKey(key);
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  getCurrentCellKey() {
    const col = Math.floor(this.x / TILE_SIZE);
    const row = Math.floor(this.y / TILE_SIZE);
    return `${row},${col}`;
  }

  getNextCellKey() {
    return this.path[this.pathIndex] || this.getCurrentCellKey();
  }

  reroute(newPath) {
    if (!newPath || newPath.length === 0) return;
    this.path = newPath;
    this.pathIndex = 0;
  }

  /**
   * Applies damage via centralized CombatCalculator.
   * @param {number} rawDamage
   * @param {string} [damageType] key in DAMAGE_TYPE
   * @param {object} [options] { armorPenetration, armorBreak, armorBreakMs }
   * @returns {{ isDefeated: boolean, finalDamage: number, shieldAbsorbed: number, damageDealtToHealth: number }}
   */
  applyDamage(rawDamage, damageType = DAMAGE_TYPE.PHYSICAL, options = {}) {
    if (this.isDead || this.reachedBase) {
      return { isDefeated: false, finalDamage: 0, shieldAbsorbed: 0, damageDealtToHealth: 0 };
    }

    // Calculate combat resolution through centralized math
    const res = calculateDamage({
      rawDamage,
      damageType,
      armor: this.armor,
      armorPenetration: options.armorPenetration || 0,
      armorBreak: this.armorBreak,
      activeShield: this.shield,
    });

    // 1. Absorb into shield barrier
    if (res.shieldAbsorbed > 0) {
      this.shield = res.remainingShield;
      if (this.shield <= 0 && this.shieldBarrier) {
        // Shield break pop animation
        this.scene.tweens.add({
          targets: this.shieldBarrier,
          alpha: 0,
          scale: this.shieldBarrier.scaleX * 1.4,
          duration: 180,
          onComplete: () => {
            if (this.shieldBarrier) {
              this.shieldBarrier.destroy();
              this.shieldBarrier = null;
            }
          },
        });
        audio.playClick();
      }
    }

    // 2. Apply residual damage to health
    if (res.damageDealtToHealth > 0) {
      this.health = Math.max(0, this.health - res.damageDealtToHealth);
    }

    // 3. Apply armor break debuff if projectile has it
    if (options.armorBreak && options.armorBreak > 0) {
      this.armorBreak = Math.max(this.armorBreak, options.armorBreak);
      this.armorBreakTimer = Math.max(this.armorBreakTimer, options.armorBreakMs || 4000);
    }

    // Hit flash
    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.sprite?.active) {
        if (this.slowTimer > 0) this.sprite.setTint(0x7fe9ff);
        else if (this.armorBreakTimer > 0) this.sprite.setTint(0xffa07a);
        else this.sprite.clearTint();
      }
    });

    this.updateHealthBar();

    // Check boss phase transition thresholds
    if (this.isBoss && this.health > 0) {
      this.checkBossPhaseThresholds();
    }

    if (this.health <= 0) {
      this.die();
      return { isDefeated: true, ...res };
    }

    return { isDefeated: false, ...res };
  }

  checkBossPhaseThresholds() {
    const healthPct = this.health / this.maxHealth;
    const nextPhaseIndex = this.currentPhaseIndex + 1;
    if (nextPhaseIndex < this.bossPhases.length) {
      const nextPhase = this.bossPhases[nextPhaseIndex];
      if (healthPct <= nextPhase.thresholdPct) {
        this.enterBossPhase(nextPhaseIndex);
      }
    }
  }

  enterBossPhase(phaseIndex) {
    this.currentPhaseIndex = phaseIndex;
    const phase = this.bossPhases[phaseIndex];

    // Speed multiplier change
    if (phase.speedMultiplier) {
      this.baseSpeed = this.def.speed * phase.speedMultiplier;
      this.speed = this.baseSpeed * (1 - this.slowFactor);
    }

    // Armor override (e.g. stone armor stripped)
    if (phase.armor !== undefined) {
      this.armor = phase.armor;
    }

    // Grant bonus shield
    if (phase.grantShield) {
      this.shield = phase.grantShield;
      this.maxShield = Math.max(this.maxShield, phase.grantShield);
      this.createShieldBarrier();
    }

    // Slow immunity
    if (phase.immuneToSlow) {
      this.immuneToSlow = true;
      this.slowFactor = 0;
      this.slowTimer = 0;
      this.speed = this.baseSpeed;
    }

    // Visual phase surge explosion effect
    if (this.scene.particleEmitter) {
      this.scene.particleEmitter.explode(20, this.x, this.y);
    }
    audio.playWaveStart();

    // Notify scene/HUD for boss banner update and toast announcement
    if (this.callbacks.onBossPhaseChange) {
      this.callbacks.onBossPhaseChange(this, phase);
    }
  }

  applySlow(fraction, durationMs) {
    if (this.isDead || this.reachedBase || this.immuneToSlow) return;
    this.slowFactor = Math.max(this.slowFactor, fraction);
    this.slowTimer = Math.max(this.slowTimer, durationMs);
    this.sprite.setTint(0x7fe9ff);
  }

  heal(amount) {
    if (this.isDead || this.reachedBase || this.health >= this.maxHealth) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.updateHealthBar();

    // Green heal spark effect
    if (this.scene?.particleEmitter) {
      this.scene.particleEmitter.explode(4, this.x, this.y);
    }
  }

  updateHealthBar() {
    const pct = Math.max(0, this.health / this.maxHealth);
    this.hpBarFill.width = this.barWidth * pct;

    if (pct < 0.3) {
      this.hpBarFill.fillColor = 0xff5470;
    } else if (pct < 0.6) {
      this.hpBarFill.fillColor = 0xf5c451;
    } else {
      this.hpBarFill.fillColor = 0x5cf2a6;
    }

    // Update shield bar if present
    if (this.shieldBarFill && this.maxShield > 0) {
      const shieldPct = Math.max(0, this.shield / this.maxShield);
      this.shieldBarFill.width = this.barWidth * shieldPct;
      this.shieldBarBg.setVisible(this.shield > 0);
      this.shieldBarFill.setVisible(this.shield > 0);
    }
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    // Death particle burst
    if (this.scene.particleEmitter) {
      this.scene.particleEmitter.explode(this.isBoss ? 25 : 10, this.x, this.y);
    }

    if (this.isBoss && this.callbacks.onBossDefeated) {
      this.callbacks.onBossDefeated(this);
    }

    this.callbacks.onDefeated(this);
    this.destroy();
  }

  reachBase() {
    if (this.reachedBase || this.isDead) return;
    this.reachedBase = true;
    this.callbacks.onReachedBase(this);
    this.destroy();
  }

  update(deltaMs) {
    if (this.isDead || this.reachedBase) return;

    // 1. Handle slow status decay
    if (this.slowTimer > 0) {
      this.slowTimer -= deltaMs;
      this.speed = this.baseSpeed * (1 - this.slowFactor);
      if (this.slowTimer <= 0) {
        this.slowFactor = 0;
        this.speed = this.baseSpeed;
        this.sprite.clearTint();
      }
    }

    // 2. Handle armor-break debuff decay
    if (this.armorBreakTimer > 0) {
      this.armorBreakTimer -= deltaMs;
      if (this.armorBreakTimer <= 0) {
        this.armorBreak = 0;
        this.sprite.clearTint();
      }
    }

    // 3. Archetype Abilities (e.g. Plague Shaman Healer)
    if (this.def.ability?.type === 'heal') {
      this.abilityTimer += deltaMs;
      if (this.abilityTimer >= (this.def.ability.intervalMs || 2500)) {
        this.abilityTimer = 0;
        this.pulseHealingAura();
      }
    }

    // 4. Boss Summon Ability (e.g. Abyssal Warlord Rift Commander)
    const currentPhase = this.bossPhases[this.currentPhaseIndex];
    if (currentPhase?.ability?.type === 'summon') {
      this.abilityTimer += deltaMs;
      if (this.abilityTimer >= (currentPhase.ability.intervalMs || 6000)) {
        this.abilityTimer = 0;
        if (this.callbacks.onSummonMinions) {
          this.callbacks.onSummonMinions(currentPhase.ability.enemyKey, currentPhase.ability.count);
        }
      }
    }

    // 5. Waypoint Movement
    if (this.pathIndex >= this.path.length) {
      this.reachBase();
      return;
    }

    const target = this.getCellCenter(this.path[this.pathIndex]);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * deltaMs) / 1000;

    if (dist <= step || dist < 2) {
      this.x = target.x;
      this.y = target.y;
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.reachBase();
        return;
      }
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.distanceTraveled += step;

      // Rotate toward direction of travel
      const targetAngle = Math.atan2(dy, dx);
      this.sprite.rotation = targetAngle;
    }

    // Walking wobble animation
    this.wobbleTimer += deltaMs * 0.012;
    const scaleY = this.baseScale * (1 + Math.sin(this.wobbleTimer) * 0.08);
    this.sprite.setScale(this.baseScale, scaleY);

    this.container.setPosition(this.x, this.y);
    this.container.setDepth(20 + this.y * 0.001);
  }

  pulseHealingAura() {
    if (!this.scene?.activeEnemies) return;
    const healRadius = this.def.ability.radius || 95;
    const healAmt = this.def.ability.amount || 40;

    // Visual ring expand
    const ring = this.scene.add.circle(this.x, this.y, 10, 0x5cf2a6, 0.45);
    ring.setDepth(25);
    this.scene.tweens.add({
      targets: ring,
      radius: healRadius,
      alpha: 0,
      duration: 350,
      onComplete: () => ring.destroy(),
    });

    for (const enemy of this.scene.activeEnemies) {
      if (enemy.isDead || enemy.reachedBase) continue;
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d <= healRadius) {
        enemy.heal(healAmt);
      }
    }
  }

  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
