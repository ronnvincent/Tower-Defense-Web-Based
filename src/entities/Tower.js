import { TILE_SIZE, SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { TOWER_TYPES, BARRICADE } from '../data/towerData.js';
import { MAX_LEVEL, ascensionTier, nextAscension } from '../data/towerAscension.js';
import {
  TOWER_VISUALS,
  BARRICADE_VISUALS,
  NON_ROTATING_TYPES,
  MUZZLE_OFFSET,
} from '../data/towerVisuals.js';
import { DECOR_ART } from '../data/towerDecor.js';
import { projectileArtFor } from '../data/projectileArt.js';
import { Projectile } from './Projectile.js';
import { aimAngle, canFire, muzzlePoint, stepAngle } from '../systems/TurretAim.js';
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

    // Decoration layers: `decorBack` sits behind the masonry so the parapet and
    // pennants grow out of the silhouette, `decorFront` sits over it for the
    // braziers and the orbiting crystals. Both are rebuilt on every upgrade.
    this.buildDecorations();

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
      const branch = spec?.branch === 'spec-b' ? 'spec-b' : 'spec-a';
      // Level 4/5 keep the branch silhouette but switch to the ascended
      // atlas: same geometry, hotter palette, additional power ring.
      if (this.level >= 5) return `${branch}3`;
      if (this.level >= 4) return `${branch}2`;
      return branch;
    }
    return this.level === 2 ? 'lvl2' : 'lvl1';
  }

  /** Art data for the current slot, with the sprite origin expressed as 0..1. */
  /**
   * Art key for this tower's shot.
   *
   * Lines share a projectile *type* (both the Archer and the Banner Keep fire
   * 'arrow'), so the type table alone made them identical in flight. Each line
   * now ships its own art, and levels 4–5 ship another, so an upgrade is
   * visible in the projectile as well as on the tower.
   */
  get projectileArt() {
    if (this.isBarricade) return null;
    const lineArt = projectileArtFor(this.typeKey, this.level);
    if (lineArt && this.scene?.textures?.exists?.(lineArt)) return lineArt;
    return this.visual?.slotTexture || null;
  }

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
      const spec = this.def.specializations[this.specialization];
      const tier = ascensionTier(this.typeKey, this.specialization, this.level);
      return tier ? { ...spec, ...tier } : spec;
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

  /**
   * Milliseconds between shots.
   *
   * Three multipliers stack: the tower's own tier, the Banner Keep aura, and
   * the global Overcharge window. Overcharge is read from the shared powerup
   * state so a single button can speed up every defence on the map.
   */
  get attackCooldown() {
    const globalScale = this.context?.powerups?.cooldownScale ?? 1;
    return Math.max(80, (this.stats?.cooldown || 0) * this.buffCooldown * globalScale);
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
    if (this.specialization && this.level >= 3 && this.level < MAX_LEVEL) {
      const next = nextAscension(this.typeKey, this.specialization, this.level);
      return next ? [next] : [];
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

  /**
   * Create the two decoration layers.
   *
   * Tiers are cumulative, so a maxed tower is a *bigger building*, not the same
   * building in a hotter palette:
   *
   *   2  merlon crown + two pennants
   *   3  gold reinforcement band, taller pennants
   *   4  twin braziers with a flickering flame
   *   5  two shards orbiting above the keep
   */
  buildDecorations() {
    if (this.isBarricade || !this.scene?.add) return;
    this.decorBack = this.scene.add.container(0, 0);
    this.decorFront = this.scene.add.container(0, 0);
    this.container.addAt(this.decorBack, 0);
    this.container.add(this.decorFront);
    this.decorParts = [];
    this.decorFlameTimer = null;
    this.refreshDecorations();
  }

  /** True when a decoration texture actually shipped with the build. */
  hasDecor(key) {
    return Boolean(key && this.scene?.textures?.exists?.(key));
  }

  /** Tear down every decoration sprite and the flame timer. */
  clearDecorations() {
    if (this.decorFlameTimer) {
      this.decorFlameTimer.remove?.(false);
      this.decorFlameTimer = null;
    }
    for (const part of this.decorParts || []) {
      part?.destroy?.();
    }
    this.decorParts = [];
  }

  /**
   * Rebuild the decoration stack for the current level.
   *
   * Called on every upgrade; `animate` springs the fresh parts into view so the
   * new tier *arrives* instead of popping into place.
   */
  refreshDecorations(animate = false) {
    if (!this.decorBack || !this.decorFront) return;
    this.clearDecorations();

    const level = this.level;
    if (level < 2) return;

    const ground = TILE_SIZE / 2;
    const topY = ground - this.artHeight;
    const line = DECOR_ART[`pennant-${this.typeKey}`] ? this.typeKey : 'archer';
    const parts = this.decorParts;

    // --- tier 2: merlon crown + pennants ---------------------------------
    // The crown widens with every tier, so the tower's *top* grows too instead
    // of only its colour; the pennants ride outwards with it.
    const crownScale = 1 + (level - 2) * 0.06;
    const flagX = 24 + (level - 2) * 3;

    if (this.hasDecor('deco-parapet')) {
      const crown = this.scene.add
        .image(0, topY + 4, 'deco-parapet')
        .setOrigin(0.5, 1)
        .setScale(crownScale);
      this.decorBack.add(crown);
      parts.push(crown);
    }

    const pennantKey = `pennant-${line}`;
    if (this.hasDecor(pennantKey)) {
      const size = level >= 3 ? 1.2 : 1;
      for (const side of [-1, 1]) {
        const flag = this.scene.add
          .image(side * flagX, topY + 2, pennantKey)
          .setOrigin(0.5, 1)
          .setScale(size);
        this.decorBack.add(flag);
        parts.push(flag);
        this.scene.tweens?.add?.({
          targets: flag,
          angle: side * 6,
          duration: 1500 + side * 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // --- tier 3: fortified footing + a hung battle standard --------------
    if (level >= 3 && this.hasDecor('deco-plinth')) {
      const plinth = this.scene.add
        .image(0, ground + 4, 'deco-plinth')
        .setOrigin(0.5, 1)
        .setAlpha(0.95);
      this.decorBack.add(plinth);
      parts.push(plinth);
    }

    const clothKey = `cloth-${line}`;
    if (level >= 3 && this.hasDecor(clothKey)) {
      // Hung from just under the crown, over the masonry — a wide band across
      // the middle read as a fence and hid the keep's own crest.
      const standard = this.scene.add
        .image(0, topY + 8, clothKey)
        .setOrigin(0.5, 0);
      this.decorFront.add(standard);
      parts.push(standard);
    }

    // --- tier 4: braziers -------------------------------------------------
    if (level >= 4 && this.hasDecor('deco-brazier')) {
      const flames = [];
      for (const side of [-1, 1]) {
        const bowl = this.scene.add
          .image(side * 23, ground + 1, 'deco-brazier')
          .setOrigin(0.5, 1);
        this.decorFront.add(bowl);
        parts.push(bowl);

        const flameKey = side < 0 ? 'deco-flame-1' : 'deco-flame-2';
        const flame = this.scene.add
          .image(side * 23, ground - 9, flameKey)
          .setOrigin(0.5, 1)
          .setBlendMode?.('ADD')
          .setAlpha(0.85);
        this.decorFront.add(flame);
        parts.push(flame);
        flames.push(flame);
        this.scene.tweens?.add?.({
          targets: flame,
          scaleY: 1.18,
          scaleX: 0.92,
          alpha: 0.62,
          duration: 220 + (side + 2) * 40,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Cycle the flame textures so the fire reads as moving, not as a glow.
      let frame = 0;
      const frameKeys = ['deco-flame-0', 'deco-flame-1', 'deco-flame-2'];
      this.decorFlameTimer = this.scene.time?.addEvent?.({
        delay: 120,
        loop: true,
        callback: () => {
          frame = (frame + 1) % frameKeys.length;
          flames.forEach((flame, index) => {
            flame.setTexture?.(frameKeys[(frame + index) % frameKeys.length]);
          });
        },
      });
    }

    // --- tier 5: orbiting shards ------------------------------------------
    if (level >= MAX_LEVEL) {
      const crystalKey = `crystal-${line}`;
      if (this.hasDecor(crystalKey)) {
        for (const side of [-1, 1]) {
          const shard = this.scene.add
            .image(side * 13, topY - 44, crystalKey)
            .setOrigin(0.5, 1)
            .setAlpha(0.9);
          this.decorFront.add(shard);
          parts.push(shard);
          this.scene.tweens?.add?.({
            targets: shard,
            y: topY - 52,
            angle: side * 12,
            duration: 1600 + side * 90,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
    }

    if (animate) this.popDecorations();
  }

  /** Spring the freshly added parts into view. */
  popDecorations() {
    for (const part of this.decorParts || []) {
      const finalScale = part.scale ?? 1;
      this.scene.tweens?.add?.({
        targets: part,
        alpha: 1,
        scale: finalScale,
        duration: 260,
        ease: 'Back.easeOut',
        from: { alpha: 0, scale: 0.2 },
      });
    }
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
    if (this.level >= 5) {
      this.levelText.setText('★5');
      this.levelText.setColor('#ffb347');
    } else if (this.level === 4) {
      this.levelText.setText('★4');
      this.levelText.setColor('#ffd98a');
    } else if (this.specialization) {
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
    } else {
      // Levels 3 → 4 → 5 stay inside the branch that was chosen at level 3.
      this.level = Math.min(MAX_LEVEL, this.level + 1);
    }

    // Both halves of the tower change with the upgrade: the pack's level art is
    // a taller structure AND a bigger weapon, so swapping only the top would
    // leave the two halves mismatched.
    this.applyVisual();
    this.refreshDecorations(true);

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
    this.scene.vfx?.levelUp?.(this.x, this.y - 10);
    if (this.level >= MAX_LEVEL) this.createAscensionAura();
    return true;
  }

  /**
   * Max-tier aura: a slow gold pulse under the keep plus a ring on the tile.
   *
   * Level 5 has to be recognisable across the map — a player counting their
   * gold should be able to see which towers are finished without clicking them.
   */
  createAscensionAura() {
    if (this.ascensionGlow || !this.scene?.add?.image) return;
    this.ascensionGlow = this.scene.vfx?.aura?.(this) || null;
    if (this.scene.textures?.exists?.('fx-aura-ring') && this.container) {
      const ring = this.scene.add.image(0, TILE_SIZE / 2 - 6, 'fx-aura-ring');
      ring.setScale(0.62).setAlpha(0.5).setBlendMode('ADD').setTint(0xffd79a);
      this.container.addAt(ring, 0);
      this.scene.tweens.add({
        targets: ring,
        angle: 360,
        duration: 9000,
        repeat: -1,
      });
    }
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

      // Attack once the barrel is aligned and off cooldown. Static weapons are
      // always aligned (see canFire).
      const rotating = !NON_ROTATING_TYPES.has(this.typeKey);
      if (this.cooldownTimer <= 0 && canFire(rotating, this.turretAngle, desired)) {
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

    // Element-coloured flash at the barrel tip — the single cheapest change
    // that makes a tower feel like it is *firing* rather than emitting.
    this.scene.vfx?.muzzle?.(originX, originY, aim, s.damageType || 'physical', this.typeKey);

    const shots = Math.max(1, s.ability?.shots || 1);
    const stats = {
      // The firing line, so the impact can pick that defence's own effect.
      line: this.typeKey,
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
      nova: s.nova || 0,
      // Burn / poison stack carried by the shot (flame and venom lines).
      dot: s.dot ? { ...s.dot } : null,
      // Extra damage fraction against bosses (arbalest, harpoon).
      bossBonus: s.bossBonus || 0,
      impactKey: this.visual.slotImpact || null,
    };

    const launch = (shotIndex) => {
      const victim = shotIndex === 0 || !this.currentTarget || this.currentTarget.isDead ? target : this.currentTarget;
      if (!victim || victim.isDead) return;
      const proj = new Projectile(
        this.scene,
        projType,
        originX,
        originY,
        victim,
        stats,
        this.context.activeEnemies,
        // Upgrade tiers can carry their own projectile and impact art.
        this.projectileArt
      );
      this.context.activeProjectiles.push(proj);
    };

    launch(0);

    // Level-4/5 signature: extra bolts leave the same barrel a beat apart, each
    // re-acquiring so the volley spreads across the lane instead of stacking on
    // a corpse. `shots` is data, so a new tower gets the ability for free.
    for (let i = 1; i < shots; i += 1) {
      const delay = Math.round(this.attackCooldown * 0.12 * i);
      this.scene.time?.delayedCall?.(delay, () => launch(i));
    }
  }

  destroy() {
    this.clearDecorations();
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
