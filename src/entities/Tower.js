import { TILE_SIZE, SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { TOWER_TYPES, BARRICADE } from '../data/towerData.js';
import { Projectile } from './Projectile.js';
import { audio } from '../rendering/AudioSynth.js';

let towerIdCounter = 1;

export const TARGETING_MODE = {
  FIRST: 'first',
  LAST: 'last',
  STRONGEST: 'strongest',
  NEAREST: 'nearest',
};

export class Tower {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} typeKey 'archer' | 'cannon' | 'frost' | 'barricade'
   * @param {number} row
   * @param {number} col
   * @param {object} context { economy, gameState, activeEnemies, activeProjectiles }
   */
  constructor(scene, typeKey, row, col, context) {
    this.id = towerIdCounter++;
    this.scene = scene;
    this.typeKey = typeKey;
    this.row = row;
    this.col = col;
    this.context = context;

    this.isBarricade = typeKey === 'barricade';
    this.def = this.isBarricade ? BARRICADE : TOWER_TYPES[typeKey];

    this.level = 1;
    this.specialization = null; // 'rapid' | 'sniper' | 'siege' | 'artillery' | 'blizzard' | 'lightning'
    this.targetingMode = TARGETING_MODE.FIRST;
    this.totalInvested = this.def.cost;
    this.cooldownTimer = 0;
    this.thornsCooldown = 0;
    this.currentTarget = null;
    this.turretAngle = 0;

    // Pixel coordinates (center of tile)
    this.x = col * TILE_SIZE + TILE_SIZE / 2;
    this.y = row * TILE_SIZE + TILE_SIZE / 2;

    // Phaser visual container
    this.container = scene.add.container(this.x, this.y);
    this.container.setDepth(15);

    if (this.isBarricade) {
      this.sprite = scene.add.image(0, 0, 'barricade');
      this.container.add(this.sprite);
    } else {
      // Octagonal Base
      this.baseSprite = scene.add.image(0, 0, `tower-base-${this.typeKey}`);
      this.container.add(this.baseSprite);

      // Rotating Turret Top
      this.topSprite = scene.add.image(0, 0, `tower-top-${this.typeKey}`);
      if (this.typeKey === 'frost') {
        this.topSprite.setTint(0x7fe9ff);
      }
      this.container.add(this.topSprite);

      // Level star/pip indicators
      this.levelText = scene.add.text(14, 14, '★', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        color: '#f5c451',
        stroke: '#000000',
        strokeThickness: 3,
      });
      this.levelText.setOrigin(0.5);
      this.container.add(this.levelText);
      this.updateLevelIndicator();
    }

    // Range display graphic (hidden by default)
    this.rangeCircle = scene.add.graphics();
    this.rangeCircle.setDepth(12);
    this.rangeCircle.setVisible(false);
    this.drawRangeCircle();
  }

  get stats() {
    if (this.isBarricade) {
      return this.def.levels[this.level - 1];
    }
    if (this.specialization) {
      return this.def.specializations[this.specialization];
    }
    return this.def.levels[this.level - 1];
  }

  /**
   * Returns list of available upgrade options.
   * At level 1: returns [ Level 2 option ]
   * At level 2: returns [ Spec A option, Spec B option ]
   * At level 3 / specialized: returns [] (Max level)
   */
  get nextUpgrades() {
    if (this.isBarricade) {
      if (this.level < this.def.levels.length) {
        return [{ key: 'lvl2', ...this.def.levels[this.level] }];
      }
      return [];
    }
    if (this.level === 1) {
      return [{ key: 'lvl2', ...this.def.levels[1] }];
    }
    if (this.level === 2 && !this.specialization) {
      const specs = this.def.specializations;
      return Object.values(specs).map((s) => ({ key: s.specKey, ...s }));
    }
    return [];
  }

  get upgradeCost() {
    const opts = this.nextUpgrades;
    return opts.length > 0 ? opts[0].upgradeCost : null;
  }

  get sellRefund() {
    return Math.floor(this.totalInvested * SELL_REFUND_RATIO);
  }

  setTargetingMode(mode) {
    if (Object.values(TARGETING_MODE).includes(mode)) {
      this.targetingMode = mode;
      this.currentTarget = null;
      audio.playClick();
    }
  }

  cycleTargetingMode() {
    const modes = [TARGETING_MODE.FIRST, TARGETING_MODE.STRONGEST, TARGETING_MODE.NEAREST, TARGETING_MODE.LAST];
    const currIdx = modes.indexOf(this.targetingMode);
    const nextIdx = (currIdx + 1) % modes.length;
    this.setTargetingMode(modes[nextIdx]);
    return this.targetingMode;
  }

  updateLevelIndicator() {
    if (!this.levelText || this.isBarricade) return;
    if (this.specialization) {
      this.levelText.setText('★3');
      this.levelText.setColor('#4ee1ff');
    } else {
      this.levelText.setText('★'.repeat(this.level));
      this.levelText.setColor('#f5c451');
    }
  }

  drawRangeCircle(color = 0x5cf2a6) {
    this.rangeCircle.clear();
    if (this.isBarricade || !this.stats) return;

    this.rangeCircle.lineStyle(2, color, 0.85);
    this.rangeCircle.fillStyle(color, 0.08);
    this.rangeCircle.strokeCircle(this.x, this.y, this.stats.range);
    this.rangeCircle.fillCircle(this.x, this.y, this.stats.range);
  }

  setSelected(selected) {
    this.rangeCircle.setVisible(selected);
    if (selected) this.drawRangeCircle(0x4ee1ff);
  }

  canUpgrade(choiceKey = null) {
    const opts = this.nextUpgrades;
    if (opts.length === 0) return false;
    let targetOpt = opts[0];
    if (choiceKey) {
      targetOpt = opts.find((o) => o.key === choiceKey) || targetOpt;
    }
    return this.context.economy.canAfford(targetOpt.upgradeCost);
  }

  upgrade(choiceKey = null) {
    const opts = this.nextUpgrades;
    if (opts.length === 0) return false;

    let targetOpt = opts[0];
    if (choiceKey) {
      targetOpt = opts.find((o) => o.key === choiceKey) || targetOpt;
    }

    const cost = targetOpt.upgradeCost;
    if (!this.context.economy.spend(cost)) return false;

    this.totalInvested += cost;
    this.context.gameState.counters.towerUpgrades++;
    audio.playPlace();

    if (this.isBarricade) {
      this.level = 2;
      if (this.sprite && this.scene.textures.exists('barricade-lvl2')) {
        this.sprite.setTexture('barricade-lvl2');
      }
      return true;
    }

    if (this.level === 1) {
      this.level = 2;
      if (this.topSprite) {
        const lvl2Key = `tower-top-${this.typeKey}-lvl2`;
        if (this.scene.textures.exists(lvl2Key)) {
          this.topSprite.setTexture(lvl2Key);
        }
      }
    } else if (this.level === 2) {
      this.level = 3;
      this.specialization = targetOpt.specKey || choiceKey;
      if (this.topSprite && targetOpt.spriteKey && this.scene.textures.exists(targetOpt.spriteKey)) {
        this.topSprite.setTexture(targetOpt.spriteKey);
      }
    }

    if (this.typeKey === 'frost') {
      if (this.specialization === 'lightning') {
        this.topSprite?.setTint(0xffea78); // Electric yellow/gold
      } else {
        this.topSprite?.setTint(0x7fe9ff); // Cyan blizzard
      }
    }

    this.updateLevelIndicator();
    this.drawRangeCircle(0x4ee1ff);

    // Upgrade flash animation
    if (this.topSprite) {
      this.scene.tweens.add({
        targets: this.topSprite,
        scale: 1.35,
        duration: 140,
        yoyo: true,
      });
    }
    return true;
  }

  update(deltaMs) {
    // Barricade Level 2 contact thorns mechanic
    if (this.isBarricade) {
      if (this.level >= 2 && this.stats?.thornsDamage > 0) {
        this.thornsCooldown -= deltaMs;
        if (this.thornsCooldown <= 0) {
          this.checkBarricadeThorns();
          this.thornsCooldown = 1000; // Check every 1s
        }
      }
      return;
    }

    // Cooldown progression
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= deltaMs;
    }

    // Frost spire bobbing animation
    if (this.typeKey === 'frost' && this.topSprite) {
      this.topSprite.y = Math.sin(this.scene.time.now * 0.004) * 3;
    }

    // Acquire or update target based on selected targeting mode
    this.acquireTarget();

    if (this.currentTarget) {
      const dx = this.currentTarget.x - this.x;
      const dy = this.currentTarget.y - this.y;

      // Turret faces the target (except frost spire which floats)
      if (this.typeKey !== 'frost' && this.topSprite) {
        this.turretAngle = Math.atan2(dy, dx);
        this.topSprite.rotation = this.turretAngle;
      }

      // Attack if off cooldown
      if (this.cooldownTimer <= 0) {
        this.fire(this.currentTarget);
        this.cooldownTimer = this.stats.cooldown;
      }
    }
  }

  checkBarricadeThorns() {
    const enemies = this.context.activeEnemies;
    const thorns = this.stats.thornsDamage;
    for (const e of enemies) {
      if (e.isDead || e.reachedBase) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= 36) {
        e.applyDamage(thorns, 'physical');
      }
    }
  }

  acquireTarget() {
    const range = this.stats.range;
    const enemies = this.context.activeEnemies;

    // Filter enemies currently within range
    const inRange = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.isDead || e.reachedBase) continue;
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      if (dist <= range) {
        inRange.push({ enemy: e, dist });
      }
    }

    if (inRange.length === 0) {
      this.currentTarget = null;
      return;
    }

    // Select target based on targetingMode
    switch (this.targetingMode) {
      case TARGETING_MODE.FIRST:
        // Highest distanceTraveled (closest to Realm Core)
        inRange.sort((a, b) => b.enemy.distanceTraveled - a.enemy.distanceTraveled);
        break;

      case TARGETING_MODE.LAST:
        // Lowest distanceTraveled (closest to Abyssal Portal)
        inRange.sort((a, b) => a.enemy.distanceTraveled - b.enemy.distanceTraveled);
        break;

      case TARGETING_MODE.STRONGEST:
        // Highest current health
        inRange.sort((a, b) => b.enemy.health - a.enemy.health);
        break;

      case TARGETING_MODE.NEAREST:
        // Lowest Euclidean distance to tower
        inRange.sort((a, b) => a.dist - b.dist);
        break;

      default:
        inRange.sort((a, b) => b.enemy.distanceTraveled - a.enemy.distanceTraveled);
    }

    this.currentTarget = inRange[0].enemy;
  }

  fire(target) {
    if (!target || target.isDead) return;

    audio.playShoot(this.typeKey);
    this.context.gameState.counters.projectilesFired++;

    // Recoil tween
    if (this.topSprite && this.typeKey !== 'frost') {
      const recoilDist = this.typeKey === 'cannon' ? -5 : -3;
      const rx = Math.cos(this.turretAngle) * recoilDist;
      const ry = Math.sin(this.turretAngle) * recoilDist;
      this.scene.tweens.add({
        targets: this.topSprite,
        x: rx,
        y: ry,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    // Determine projectile sprite & parameters
    const s = this.stats;
    const projType = s.projectile || this.def.projectile;
    const projSpeed = s.projectileSpeed || this.def.projectileSpeed;

    const proj = new Projectile(
      this.scene,
      projType,
      this.x,
      this.y,
      target,
      {
        damage: s.damage,
        speed: projSpeed,
        damageType: s.damageType || 'physical',
        armorPenetration: s.armorPenetration || 0,
        armorBreak: s.armorBreak || 0,
        armorBreakMs: s.armorBreakMs || 0,
        splash: s.splash || 0,
        slow: s.slow || 0,
        slowMs: s.slowMs || 0,
        chainTargets: s.chainTargets || 0,
        chainRange: s.chainRange || 0,
        stunMs: s.stunMs || 0,
      },
      this.context.activeEnemies
    );
    this.context.activeProjectiles.push(proj);
  }

  destroy() {
    if (this.rangeCircle) {
      this.rangeCircle.destroy();
      this.rangeCircle = null;
    }
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
