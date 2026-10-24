import { TILE_SIZE, SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { TOWER_TYPES, BARRICADE } from '../data/towerData.js';
import {
  TOWER_VISUALS,
  BARRICADE_VISUALS,
  NON_ROTATING_TYPES,
  MUZZLE_OFFSET,
} from '../data/towerVisuals.js';
import { Projectile } from './Projectile.js';
import { aimAngle, isAligned, muzzlePoint, stepAngle } from '../systems/TurretAim.js';
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
    // Boss freeze effects (Frost Warden's Glacial Pulse) switch a tower off.
    this.disabledTimer = 0;
    this.currentTarget = null;
    this.turretAngle = 0;

    // Support buffs contributed by Banner Keeps in range (set by the scene).
    this.buffDamage = 1;
    this.buffRange = 1;
    this.buffCooldown = 1;

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

      // Palisades are attackable: track their structure HP and draw a bar.
      this.maxHealth = this.def.levels[this.level - 1].health;
      this.health = this.maxHealth;
      this.isDestroyed = false;
      this.healthBar = scene.add.graphics();
      this.container.add(this.healthBar);
      this.updateHealthBar();
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

  /**
   * Which upgrade slot the tower currently shows
   * ('lvl1' | 'lvl2' | 'spec-a' | 'spec-b').
   *
   * Driven by the data's `branch` field: hard-coding the starter towers' spec
   * keys here meant every *new* tower's specialisations silently fell back to
   * the 'spec-b' art.
   */
  get visualSlot() {
    if (this.specialization) {
      const spec = this.def.specializations?.[this.specialization];
      return spec?.branch === 'spec-b' ? 'spec-b' : 'spec-a';
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

  /** Attack range including Banner Keep buffs. */
  get attackRange() {
    return (this.stats?.range || 0) * this.buffRange;
  }

  /** Damage per hit including Banner Keep buffs. */
  get attackDamage() {
    return Math.round((this.stats?.damage || 0) * this.buffDamage);
  }

  /** Milliseconds between shots (Banner Keeps can shave the cooldown). */
  get attackCooldown() {
    return Math.max(80, (this.stats?.cooldown || 0) * this.buffCooldown);
  }

  /** Support field of this tower (Banner Keep only). */
  get aura() {
    return this.stats?.aura || null;
  }

  /** Apply the best support aura found in range (1 = unbuffed). */
  setBuffs({ damage = 1, range = 1, cooldown = 1 } = {}) {
    const changed = damage !== this.buffDamage || range !== this.buffRange || cooldown !== this.buffCooldown;
    this.buffDamage = damage;
    this.buffRange = range;
    this.buffCooldown = cooldown;
    if (changed && this.rangeCircle?.visible) this.drawRangeCircle(0x4ee1ff);
  }

  /**
   * Structure damage (palisades only). Returns the points actually removed.
   * The scene owns the "wall fell down" flow — see GameScene.damageBarricade.
   */
  takeDamage(amount) {
    if (!this.isBarricade || this.isDestroyed) return 0;
    const dealt = Math.max(0, Math.round(amount));
    if (dealt <= 0) return 0;
    this.health = Math.max(0, this.health - dealt);
    this.flashHit();
    this.updateHealthBar();
    if (this.health <= 0) this.isDestroyed = true;
    return dealt;
  }

  /** Red bar / green bar above the stakes; only shown once damaged. */
  updateHealthBar() {
    if (!this.healthBar) return;
    this.healthBar.clear();
    if (this.health >= this.maxHealth) return;

    const pct = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
    const width = 42;
    const height = 5;
    const top = TILE_SIZE / 2 - this.artHeight - 10;
    const color = pct > 0.5 ? 0x5cf2a6 : pct > 0.25 ? 0xf5c451 : 0xff5470;

    this.healthBar.fillStyle(0x11131a, 0.9);
    this.healthBar.fillRect(-width / 2 - 1, top - 1, width + 2, height + 2);
    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(-width / 2, top, width * pct, height);
  }

  /** Brief red flash so hits on the wall read at a glance. */
  flashHit() {
    if (!this.sprite) return;
    if (this.scene.tweens) {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0.55, duration: 60, yoyo: true });
    }
    this.sprite.setTintFill?.(0xffb0a0);
    this.scene.time?.delayedCall(70, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });
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

    const range = this.attackRange;
    this.rangeCircle.lineStyle(2, color, 0.85);
    this.rangeCircle.fillStyle(color, 0.08);
    this.rangeCircle.strokeCircle(this.x, this.y, range);
    this.rangeCircle.fillCircle(this.x, this.y, range);

    // Support towers also advertise the radius their aura reaches.
    const aura = this.aura;
    if (aura?.radius) {
      this.rangeCircle.lineStyle(2, 0xf5c451, 0.7);
      this.rangeCircle.strokeCircle(this.x, this.y, aura.radius);
    }
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
      // Rebuilding the wall also repairs it — the upgrade is a fresh
      // reinforcement, not a patch over the holes.
      this.maxHealth = this.stats.health;
      this.health = this.maxHealth;
      this.updateHealthBar();
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

  /** True while a boss freeze pulse is suppressing this defence. */
  get isDisabled() {
    return this.disabledTimer > 0;
  }

  /**
   * Switch the tower off for `durationMs`. Palisades are structures, not
   * machinery, so they are immune — the freeze is aimed at your damage.
   * @returns {boolean} true when the tower was actually disabled
   */
  disable(durationMs = 2500) {
    if (this.isBarricade || this.isDestroyed) return false;
    this.disabledTimer = Math.max(this.disabledTimer, durationMs);
    this.topSprite?.setTint?.(0x7fd4ff);
    this.container?.setAlpha?.(0.72);
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

    // Boss freeze: no acquisition, no firing, no aura while suppressed.
    if (this.disabledTimer > 0) {
      this.disabledTimer -= deltaMs;
      if (this.disabledTimer <= 0) {
        this.disabledTimer = 0;
        this.topSprite?.clearTint?.();
        this.container?.setAlpha?.(1);
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
      // Servo aiming: the barrel turns toward the target at a fixed rate instead
      // of snapping, and only fires once it is on the line. The weapon art points
      // up, so `aimAngle` already folds in the +90° art offset (see TurretAim).
      const desired = aimAngle(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
      if (!NON_ROTATING_TYPES.has(this.typeKey) && this.topSprite) {
        this.turretAngle = stepAngle(this.turretAngle, desired, deltaMs);
        this.topSprite.rotation = this.turretAngle;
      } else {
        // Static crystals and banners keep a fixed pose but still use the aim
        // angle for their launch point, so no shot fires backwards.
        this.turretAngle = 0;
      }

      // Attack once the barrel is aligned and off cooldown.
      if (this.cooldownTimer <= 0 && isAligned(this.turretAngle, desired)) {
        this.fire(this.currentTarget);
        this.cooldownTimer = this.attackCooldown;
      }
    }
  }

  checkBarricadeThorns() {
    const enemies = this.context.activeEnemies;
    const thorns = this.stats.thornsDamage;
    for (const e of enemies) {
      if (e.isDead || e.reachedBase) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= 58) {
        e.applyDamage(thorns, 'physical');
      }
    }
  }

  acquireTarget() {
    const range = this.attackRange;
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

    // Recoil tween: kick straight back along the barrel. The art points up, so
    // the barrel direction is the sprite rotation minus the 90° art offset.
    if (this.topSprite && !NON_ROTATING_TYPES.has(this.typeKey)) {
      const recoilDist = this.typeKey === 'cannon' ? -5 : -3;
      const barrel = this.turretAngle - Math.PI / 2;
      const rx = Math.cos(barrel) * recoilDist;
      const ry = Math.sin(barrel) * recoilDist;
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

    // Shots leave the drawn barrel tip, carried around by the weapon's rotation.
    // Static props (frost crystal, banner) use their unrotated art frame.
    const muzzle = MUZZLE_OFFSET[this.visual.file] || { x: 0, y: -24 };
    const aim = NON_ROTATING_TYPES.has(this.typeKey) ? 0 : this.turretAngle;
    const muzzlePos = muzzlePoint(this.x, this.y + this.visual.weaponY, aim, muzzle);
    const originX = muzzlePos.x;
    const originY = muzzlePos.y;

    const proj = new Projectile(
      this.scene,
      projType,
      originX,
      originY,
      target,
      {
        damage: this.attackDamage,
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
    this.isDestroyed = true;
    this.healthBar = null;
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
