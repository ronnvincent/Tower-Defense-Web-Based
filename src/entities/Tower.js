import { TILE_SIZE, SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { TOWER_TYPES, BARRICADE } from '../data/towerData.js';
import {
  TOWER_VISUALS,
  BARRICADE_VISUALS,
  NON_ROTATING_TYPES,
  MUZZLE_OFFSET,
} from '../data/towerVisuals.js';
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

    this.visual = this.getVisual();

    if (this.isBarricade) {
      const tier = BARRICADE_VISUALS[1];
      // Palisade art is bottom-anchored on the tile's ground line, nudged down
      // by the art's own skirt so the stakes stand *on* the road.
      this.sprite = scene.add
        .image(0, TILE_SIZE / 2 + tier.offsetY * 0.25, tier.key)
        .setOrigin(0.5, 1);
      this.container.add(this.sprite);
    } else {
      // Static structure (steps, keep, plinth) anchored to the tile's ground line.
      this.baseSprite = scene.add
        .image(0, TILE_SIZE / 2, this.visual.baseKey)
        .setOrigin(0.5, 1);
      this.container.add(this.baseSprite);

      // Weapon sprite: rotated around its mechanical pivot, not its centre.
      // Must be a Sprite (not an Image) so the weapon's attack clip can play.
      this.topSprite = scene.add.sprite(0, this.visual.weaponY, this.visual.weaponKey, 0);
      this.topSprite.setOrigin(this.visual.originX, this.visual.originY);
      this.container.add(this.topSprite);

      // Idle pose (frame 0) — the attack clip takes over while firing.
      if (scene.anims.exists(`${this.visual.weaponKey}-rest`)) {
        this.topSprite.play(`${this.visual.weaponKey}-rest`);
      }

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

  /**
   * Pixel height of the structure art, measured from the tile's ground line.
   * The upgrade badge floats above this so it never covers the weapon.
   */
  get artHeight() {
    const art = this.isBarricade ? this.sprite : this.baseSprite;
    return art && art.height ? art.height : TILE_SIZE;
  }

  /** Which upgrade slot the tower currently shows ('lvl1' | 'lvl2' | 'spec-a' | 'spec-b'). */
  get visualSlot() {
    if (this.specialization) {
      return this.specialization === 'rapid' || this.specialization === 'siege' || this.specialization === 'blizzard'
        ? 'spec-a'
        : 'spec-b';
    }
    return this.level === 2 ? 'lvl2' : 'lvl1';
  }

  /** Art data for the current slot, with the sprite origin expressed as 0..1. */
  getVisual() {
    if (this.isBarricade) {
      return BARRICADE_VISUALS[this.level] || BARRICADE_VISUALS[1];
    }
    const v = TOWER_VISUALS[this.typeKey][this.visualSlot];
    return {
      ...v,
      originX: v.px / v.fw,
      originY: v.py / v.fh,
      weaponY: TILE_SIZE / 2 - v.mount,
    };
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

  /** Re-point both sprites at the art for the current level/specialisation. */
  applyVisual() {
    this.visual = this.getVisual();
    if (this.baseSprite) {
      this.baseSprite.setTexture(this.visual.baseKey);
    }
    if (this.topSprite) {
      this.topSprite.setTexture(this.visual.weaponKey, 0);
      this.topSprite.setOrigin(this.visual.originX, this.visual.originY);
      this.topSprite.setPosition(0, this.visual.weaponY);
      this.topSprite.setRotation(0);
      if (this.scene.anims.exists(`${this.visual.weaponKey}-rest`)) {
        this.topSprite.play(`${this.visual.weaponKey}-rest`);
      }
    }
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
      const tier = BARRICADE_VISUALS[2];
      if (this.sprite && this.scene.textures.exists(tier.key)) {
        this.sprite.setTexture(tier.key);
        this.sprite.y = TILE_SIZE / 2 + tier.offsetY * 0.25;
      }
      return true;
    }

    if (this.level === 1) {
      this.level = 2;
    } else if (this.level === 2) {
      this.level = 3;
      this.specialization = targetOpt.specKey || choiceKey;
    }

    // Both halves of the tower change with the upgrade: the pack's level art is
    // a taller structure AND a bigger weapon, so swapping only the top would
    // leave the two halves mismatched.
    this.applyVisual();

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

      // Turret faces the target (frost crystals float instead of tracking)
      if (!NON_ROTATING_TYPES.has(this.typeKey) && this.topSprite) {
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

    // Play the pack's attack animation (it ends back on the resting pose).
    if (this.topSprite && this.scene.anims.exists(`${this.visual.weaponKey}-fire`)) {
      this.topSprite.play(`${this.visual.weaponKey}-fire`);
      this.topSprite.once('animationcomplete', () => {
        this.topSprite?.play(`${this.visual.weaponKey}-rest`);
      });
    }

    // Recoil tween
    if (this.topSprite && !NON_ROTATING_TYPES.has(this.typeKey)) {
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

    // Shots leave the actual weapon, not the tile centre.
    const muzzle = MUZZLE_OFFSET[this.visual.file] || { x: 0, y: -24 };
    const angle = this.turretAngle;
    // Muzzle offsets are measured from the weapon's pivot; rotating weapons
    // carry the offset around with them, static crystals just add it.
    const aim = NON_ROTATING_TYPES.has(this.typeKey) ? -Math.PI / 2 : angle;
    const originX = this.x + Math.cos(aim) * muzzle.x - Math.sin(aim) * muzzle.y;
    const originY = this.y + this.visual.weaponY + Math.sin(aim) * muzzle.x + Math.cos(aim) * muzzle.y;

    const proj = new Projectile(
      this.scene,
      projType,
      originX,
      originY,
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
        impactKey: this.visual.slotImpact || null,
      },
      this.context.activeEnemies,
      // Upgrade tiers can carry their own projectile and impact art.
      this.visual.slotTexture || null
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
