import { TILE_SIZE, SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { TOWER_TYPES, BARRICADE } from '../data/towerData.js';
import { MAX_LEVEL, ascensionTier, nextAscension } from '../data/towerAscension.js';
import { canTarget, defenceTargets, isFlying } from '../systems/TargetCategories.js';
import { TARGETING_MODE, sortTargets } from './TowerTargeting.js';
import {
  TOWER_VISUALS,
  BARRICADE_VISUALS,
  NON_ROTATING_TYPES,
  MUZZLE_OFFSET,
} from '../data/towerVisuals.js';
import { DECOR_ART, DECOR_CROWN } from '../data/towerDecor.js';
import { ENGINEER_LINES } from '../data/engineerDefenses.js';
import { projectileArtFor } from '../data/projectileArt.js';
import { royalProjectileArt } from '../data/royalProjectiles.js';
import { Projectile } from './Projectile.js';
import { aimAngle, canFire, muzzlePoint, stepAngle } from '../systems/TurretAim.js';
import { audio } from '../rendering/AudioSynth.js';

let towerIdCounter = 1;

/**
 * The targeting vocabulary now lives in `./TowerTargeting.js` (the shop data
 * needs to name the same modes, and importing this entity for a string would
 * be a module cycle). Re-exported here so every existing caller — HUD, tests,
 * the probe harness — keeps importing it from the tower.
 */
export { TARGETING_MODE };

/**
 * The point the bastion assault is aimed at, if this defence can see it.
 *
 * The scene owns the keep, so it passes the same closure the creeps get
 * (`Enemy.callbacks.getBasePoint`): one source of truth for "where the gate
 * is", and a headless harness simply omits it.
 *
 * @param {object} tower
 * @returns {{x: number, y: number}|null}
 */
function bastionPointFor(tower) {
  const point = tower.context?.getBasePoint?.() || tower.scene?.getBasePoint?.() || null;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

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
    // Royal lines ship their own default priority and a live category filter.
    // The definition's `targetsGround`/`targetsAir` stays the ceiling: the
    // filter can narrow what a gun looks at, never widen it.
    this.targetingMode = this.def.targeting?.defaultMode || TARGETING_MODE.FIRST;
    this.targetCategory = this.def.targeting?.defaultCategory || 'both';
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
      // Wall art fills its tile edge to edge, so two segments laid side by side
      // read as one continuous rampart instead of two separate props.
      this.sprite = scene.add.image(0, 4, tier.key);
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

      // A battle can start while the boot pack is still streaming (the menu is
      // interactive before the last tower sheets land). A sprite built against
      // a texture that is not there yet would show Phaser's `__MISSING` box for
      // the rest of the match, so bind the real sheet the moment it arrives.
      this.bindLateTexture(this.baseSprite, this.visual.baseKey);
      this.bindLateTexture(this.topSprite, this.visual.weaponKey);

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

    // Every defence is a structure now, not only the wall: a keep has hit
    // points, a health bar and a destroyed state, because the horde attacks
    // whatever stands in its reach (Request 42 §3).
    this.isStructure = true;
    this.isDestroyed = false;
    this.upgradeLock = false;
    this.maxHealth = this.computeMaxHealth();
    this.health = this.maxHealth;
    this.healthBar = scene.add.graphics();
    this.container.add(this.healthBar);
    this.damageOverlay = scene.add.graphics();
    this.container.add(this.damageOverlay);
    this.updateHealthBar();

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
    const scale = this.isBarricade ? art?.scaleY ?? 1 : 1;
    return art && art.height ? art.height * scale : TILE_SIZE;
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
    // Every line — the twelve older keeps and the ten royal ones — branches at
    // level 3. A royal line still has its own art per slot (`lvl1`, `lvl2`,
    // then `spec-a`/`spec-a2`/`spec-a3` or the `spec-b` ladder), it just is not
    // a straight five-step track any more.
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
  /**
   * The effect line this tower fires under.
   *
   * A royal branch is a different machine, so it has its own impact, muzzle and
   * trail (`fx-line-royalArtillery-b-*`). Everything else keeps the line id it
   * has always had.
   */
  get artLine() {
    if (this.def.royal && this.def.specializations?.[this.specialization]?.branch === 'spec-b') {
      return `${this.typeKey}-b`;
    }
    return this.typeKey;
  }

  get projectileArt() {
    if (this.isBarricade) return null;
    const branch = this.specialization && this.def.specializations?.[this.specialization]?.branch;
    const royalArt = this.def.royal
      ? royalProjectileArt(this.typeKey, this.level, branch || 'spec-a')
      : null;
    const lineArt = royalArt || projectileArtFor(this.typeKey, this.level);
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
      const spec = this.def.specializations?.[this.specialization];
      if (!spec) return this.def.levels[this.def.levels.length - 1];
      const tier = ascensionTier(this.typeKey, this.specialization, this.level);
      return tier ? { ...spec, ...tier } : spec;
    }
    // A tower built before the roster branched can carry a level with no
    // specialisation. Falling back to the last shared tier is the honest answer:
    // it is the strongest block that tower ever legitimately had, and it cannot
    // return `undefined` into the damage path.
    return this.def.levels[Math.min(this.level, this.def.levels.length) - 1];
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
   * Structure HP for a defence.
   *
   * A wall's pool is authored per tier (500 → 6000). A keep's pool is derived
   * from what it cost to raise — an expensive battery is a bigger, sturdier
   * building — and grows 25 % per upgrade, so a maxed keep is worth defending.
   */
  computeMaxHealth() {
    if (this.isBarricade) return this.def.levels[this.level - 1].health;
    const base = 380 + (this.def.cost || 60) * 2;
    return Math.round(base * (1 + 0.25 * (this.level - 1)));
  }

  /**
   * Structure damage. Returns the points actually removed.
   *
   * The scene owns the "it fell down" flow — see GameScene.destroyStructure.
   */
  takeDamage(amount) {
    if (this.isDestroyed) return 0;
    const dealt = Math.max(0, Math.round(amount));
    if (dealt <= 0) return 0;
    this.health = Math.max(0, this.health - dealt);
    this.flashHit();
    this.updateHealthBar();
    if (this.health <= 0) this.isDestroyed = true;
    return dealt;
  }

  /** Red bar / green bar above the structure; only shown once damaged. */
  updateHealthBar() {
    if (!this.healthBar) return;
    this.healthBar.clear();
    this.drawDamageOverlay();
    if (this.isDestroyed) return;
    if (this.health >= this.maxHealth) return;

    const pct = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
    const width = this.isBarricade ? 46 : 38;
    const height = 5;
    const top = -TILE_SIZE / 2 - 8;
    const color = pct > 0.5 ? 0x5cf2a6 : pct > 0.25 ? 0xf5c451 : 0xff5470;

    this.healthBar.fillStyle(0x11131a, 0.9);
    this.healthBar.fillRect(-width / 2 - 1, top - 1, width + 2, height + 2);
    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(-width / 2, top, width * pct, height);
  }

  /**
   * Visible damage on the structure itself.
   *
   * The wall tiers ship one texture each, so the state is drawn on top: hairline
   * cracks at 75 %, a broken chunk at 50 %, and a scarred, leaning silhouette at
   * 25 %. It is driven by real HP — a wall at full health has no overlay at all.
   */
  drawDamageOverlay() {
    const g = this.damageOverlay;
    if (!g) return;
    g.clear();
    if (this.isDestroyed) return;
    const pct = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    if (pct >= 0.995) {
      if (this.sprite) this.sprite.setAngle(0);
      return;
    }
    const stage = pct > 0.5 ? 1 : pct > 0.25 ? 2 : 3;
    g.lineStyle(2, 0x14100c, 0.85);
    // Deterministic cracks: the same wall always cracks the same way.
    const cracks = [
      [[-16, -20], [-8, -8], [-12, 2], [-4, 12]],
      [[10, -22], [6, -12], [14, -4]],
      [[-2, -18], [4, -6], [0, 6], [8, 14]],
    ].slice(0, stage);
    for (const crack of cracks) {
      g.beginPath();
      g.moveTo(crack[0][0], crack[0][1]);
      for (let i = 1; i < crack.length; i += 1) g.lineTo(crack[i][0], crack[i][1]);
      g.strokePath();
    }
    if (stage >= 2) {
      // A chunk knocked out of the top edge.
      g.fillStyle(0x0b0d12, 0.55);
      g.fillTriangle(-20, -30, -6, -30, -14, -18);
      g.fillTriangle(12, -30, 24, -30, 18, -20);
    }
    if (stage === 3 && this.sprite) {
      this.sprite.setAngle(this.isBarricade ? -2.5 : 0);
    } else if (this.sprite) {
      this.sprite.setAngle(0);
    }
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
      // Five authored tiers: level N offers the entry at index N (levels are
      // 1-based), and level 5 offers nothing — the UI disables the button.
      if (this.level < this.def.levels.length) {
        return [{ key: `tier-${this.level + 1}`, ...this.def.levels[this.level] }];
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
    // Engineer lines are gun emplacements, not castles: they wear an iron rail
    // with a barrel cradle instead of stone battlements. The map lives in the
    // generated decor manifest so a new family only has to add art, not code.
    const crownKey = ENGINEER_LINES.includes(this.typeKey) ? DECOR_CROWN.engineer : DECOR_CROWN.core;
    const parts = this.decorParts;

    // --- tier 2: merlon crown + pennants ---------------------------------
    // The crown widens with every tier, so the tower's *top* grows too instead
    // of only its colour; the pennants ride outwards with it.
    const crownScale = 1 + (level - 2) * 0.06;
    const flagX = 24 + (level - 2) * 3;

    if (this.hasDecor(crownKey)) {
      const crown = this.scene.add
        .image(0, topY + 4, crownKey)
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

  /**
   * May this defence look at that creep *right now*?
   *
   * Three gates, in order: the data's own categories (`canTarget`), the live
   * panel filter, and — for a support building — the fact that it has no gun.
   * Everything that damages an enemy routes through this or through the
   * projectile's copied flags, which is what keeps "ground only" true for
   * direct hits, splash and chains alike.
   */
  canEngage(enemy) {
    if (this.def.supportOnly) return false;
    if (!canTarget(this.def, enemy)) return false;
    if (this.targetCategory === 'ground' && isFlying(enemy)) return false;
    if (this.targetCategory === 'air' && !isFlying(enemy)) return false;
    return true;
  }

  /**
   * Swap a sprite onto its real sheet if the boot pack had not delivered it yet.
   * Phaser emits `addtexture-<key>` on the TextureManager, which is the only
   * reliable signal that the image finished decoding.
   */
  bindLateTexture(sprite, key) {
    if (!sprite || !key) return;
    // Headless harnesses (and any future scene without a texture manager) have
    // nothing to bind to.
    if (typeof this.scene?.textures?.exists !== 'function') return;
    if (this.scene.textures.exists(key)) return;
    if (typeof this.scene.textures.once !== 'function') return;
    const onAdd = (texture) => {
      if (!sprite.scene) return;
      sprite.setTexture(texture.key, 0);
      if (sprite === this.topSprite) {
        sprite.setOrigin(this.visual.originX, this.visual.originY);
        const rest = `${this.visual.weaponKey}-rest`;
        if (this.scene.anims.exists(rest)) sprite.play(rest);
      }
    };
    this.scene.textures.once(`addtexture-${key}`, onAdd);
    this.scene.events.once('shutdown', () => {
      this.scene?.textures?.off?.(`addtexture-${key}`, onAdd);
    });
  }

  /** The categories this *instance* may hit, after the panel filter. */
  get engagedTargets() {
    const ceiling = defenceTargets(this.def);
    return {
      ground: ceiling.ground && this.targetCategory !== 'air',
      air: ceiling.air && this.targetCategory !== 'ground',
    };
  }

  /** Switch the live category filter (BOTH / GROUND / AIR). */
  setTargetCategory(category) {
    const allowed = this.def.targeting?.categories || ['both'];
    if (!allowed.includes(category)) return false;
    if (category === this.targetCategory) return true;
    this.targetCategory = category;
    this.currentTarget = null;
    audio.playClick();
    return true;
  }

  /**
   * Minimum reach: a siege gun cannot depress enough to shoot something standing
   * on its own emplacement.
   *
   * Read straight from the data rather than through `stats`, because headless
   * tests drive `acquireTarget` on a bare `Tower.prototype` object whose `def`
   * has no `levels` — a getter that assumes a constructed tower would throw in
   * exactly the code path those tests cover.
   */
  get minRange() {
    const levels = this.def?.levels;
    const levelStats = levels?.[(this.level || 1) - 1];
    const spec = this.specialization ? this.def?.specializations?.[this.specialization] : null;
    return levelStats?.minRange ?? spec?.minRange ?? this.def?.minRange ?? 0;
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
    // One upgrade per press. A double-click lands on a stale panel otherwise and
    // would charge twice for one visible change.
    if (this.upgradeLock) return false;

    let targetOpt = opts[0];
    if (choiceKey) {
      targetOpt = opts.find((o) => o.key === choiceKey) || targetOpt;
    }

    const cost = targetOpt.upgradeCost;
    if (!Number.isFinite(cost) || !this.context.economy.spend(cost)) return false;

    this.upgradeLock = true;
    this.scene?.time?.delayedCall?.(260, () => {
      this.upgradeLock = false;
    });

    this.totalInvested += cost;
    this.context.gameState.counters.towerUpgrades++;
    audio.playPlace();

    if (this.isBarricade) {
      // Keep the damage ratio: reinforcing a battered wall raises its ceiling
      // without hand-waving the holes away. A wall at 50 % stays at 50 %.
      const previousMax = this.maxHealth;
      const previousRatio = previousMax > 0 ? this.health / previousMax : 1;
      this.level += 1;
      const tier = BARRICADE_VISUALS[this.level];
      if (this.sprite && tier && this.scene.textures.exists(tier.key)) {
        this.sprite.setTexture(tier.key);
      }
      this.maxHealth = this.stats.health;
      this.health = Math.max(1, Math.round(this.maxHealth * previousRatio));
      this.updateHealthBar();
      this.scene?.vfx?.levelUp?.(this.x, this.y - 10);
      this.refreshDecorations(true);
      return true;
    }

    if (this.def.royal) {
      // Same damage-preservation rule as a wall: reinforcing a damaged royal
      // building raises its ceiling without healing the holes.
      const previousMax = this.maxHealth;
      const previousRatio = previousMax > 0 ? this.health / previousMax : 1;
      this.maxHealth = this.computeMaxHealth();
      this.health = Math.max(1, Math.round(this.maxHealth * previousRatio));
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

  /**
   * Whether this defence can shoot at airborne enemies. The rule lives in the
   * tower's own data (`targetsAir`), so a new line inherits "can hit air" by
   * default and has to opt out with a reason.
   */
  get canTargetAir() {
    return defenceTargets(this.def).air;
  }

  /** True while the tower may damage ground creeps (soldiers, walls, all guns). */
  get canTargetGround() {
    return defenceTargets(this.def).ground;
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
    // Support buildings never acquire or fire: their value is a field effect
    // (aura, repairs) applied by the scene. Returning here keeps a workshop from
    // spinning its hammer arm at a creep it cannot hurt.
    if (this.def.supportOnly || this.def.trap) {
      if (this.disabledTimer > 0) this.disabledTimer = Math.max(0, this.disabledTimer - deltaMs);
      return;
    }

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

    // Cooldown progression. Clamped at zero: subtracting a whole frame from a
    // timer that was already nearly spent used to leave a permanent negative
    // value behind (every probe that watched a tower idle reported `cd-30`),
    // and a stale negative is indistinguishable from a broken clock to
    // anything that reads the timer — the inspector, the tests, a replay.
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - deltaMs);
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
      // Spikes are set in the road: they cannot reach something flying over it.
      if (e.isDead || e.reachedBase || isFlying(e)) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= 58) {
        e.applyDamage(thorns, 'physical');
      }
    }
  }

  acquireTarget() {
    const range = this.attackRange;
    const minRange = this.minRange;
    const enemies = this.context.activeEnemies;

    // The last line of the battle is the gate. A creep that has broken through
    // does not walk into the keep — it parks on a ring around it, inside the
    // no-build moat, on whichever side it arrived from (see
    // `Enemy.updateBaseAssault` / `assaultRing`). A defence can only ever be
    // raised a tile or more from the keep, so on the far side of that ring the
    // attacker stands outside every range in the game: the line goes silent
    // with the towers intact while the core bleeds out. That is the one case
    // where range is measured to the gate instead of to the creep — a defence
    // that covers the bastion answers the creeps hitting the bastion.
    const bastion = bastionPointFor(this);
    const coversBastion = bastion
      ? Math.hypot(bastion.x - this.x, bastion.y - this.y) <= range
      : false;

    // Filter enemies currently within the weapon's arc. Airborne creeps are
    // invisible to a ground-locked gun, and a siege piece cannot depress far
    // enough to shoot something standing on its own emplacement — both rules
    // live in `canEngage` so they cannot drift apart.
    const inRange = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!this.canEngage(e)) continue;
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      const assaultingTheGate = coversBastion && e.assaulting === true;
      if (dist > range && !assaultingTheGate) continue;
      if (minRange > 0 && dist < minRange) continue;
      inRange.push({ enemy: e, dist });
    }

    if (inRange.length === 0) {
      this.currentTarget = null;
      return;
    }

    // A marked enemy outranks the targeting mode. The mark is the player
    // telling this tower "that one" — a temporary instruction, not a stat, so
    // if the marked creep is not a legal target it is simply ignored.
    const marked = this.context.focusTarget ?? this.scene?.focusTarget;
    if (marked && !marked.isDead && !marked.reachedBase && (marked.health ?? 1) > 0) {
      for (let i = 0; i < inRange.length; i++) {
        if (inRange[i].enemy === marked) {
          this.currentTarget = marked;
          return;
        }
      }
    }

    // Priority modes live in entities/TowerTargeting.js — one implementation
    // for the classic four modes and the royal panel's six.
    sortTargets(inRange, this.targetingMode);
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
    this.scene.vfx?.muzzle?.(originX, originY, aim, s.damageType || 'physical', this.artLine);

    const shots = Math.max(1, s.ability?.shots || 1);
    // The shot carries the *instance's* categories, not just the line's: a
    // siege gun the player switched to AIR must land air-only splash.
    const fired = this.engagedTargets;
    const stats = {
      // The firing line, so the impact can pick that defence's own effect.
      line: this.artLine,
      // The shot carries what its tower may hit: the blast and the chain have
      // to keep the rule after the tower is no longer looking at the target.
      targetsGround: fired.ground,
      targetsAir: fired.air,
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
      // Per-hop damage carried by a chain (Tesla). Without this the entity used
      // a hard-coded 0.75 for every line.
      chainFalloff: s.chainFalloff ?? 0.75,
      // A mortar shell is aimed at the *ground*, not at a body: the impact
      // point is fixed at launch, which is what makes its area damage honest.
      groundTarget: Boolean(this.def.groundOnly && s.splash),
      bossBonus: (s.bossBonus || 0) + (this.def.bossBonus || 0),
      stunMs: s.stunMs || 0,
      nova: s.nova || 0,
      // Burn / poison stack carried by the shot (flame and venom lines).
      dot: s.dot ? { ...s.dot } : null,
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
