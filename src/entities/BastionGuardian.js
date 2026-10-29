/**
 * BastionGuardian — the keep's own gun.
 *
 * Request 67: "dapat umaatake rin, dapat mas maganda yung ability nya compare sa
 * mga current defenses natin". The bastion used to be a pure hit-point pool with
 * a painted fortress on top; a creep that walked to the gate chewed on it while
 * every tower on the map watched. This entity gives the building a gun, a branch
 * at level three and a signature ability, and swaps the whole castle art on
 * every upgrade.
 *
 * WHAT IT IS NOT
 * --------------
 * It is deliberately *not* a `Tower` and never joins `activeTowers`:
 *
 *   • it cannot be sold, moved or built, so the build/placement paths must not
 *     see it;
 *   • it must not receive a Banner Keep's aura (the scene applies buffs by
 *     walking `activeTowers`), or one banner next to the gate would multiply the
 *     strongest weapon in the game;
 *   • its palette of numbers lives in `config/baseUpgrades.js`, so retuning the
 *     bastion never touches tower balance.
 *
 * It *does* implement the small contract the HUD and the upgrade badge already
 * speak — `level`, `specialization`, `stats`, `nextUpgrades`, `canUpgrade`,
 * `upgrade`, `artHeight` — so the inspector, the floating badge and the
 * `spec-*` cards work on it with no second implementation.
 */

import { TILE_SIZE } from '../config/gameConfig.js';
import { Projectile } from './Projectile.js';
import { aimAngle, canFire, muzzlePoint, stepAngle } from '../systems/TurretAim.js';
import { defenceTargets, isFlying } from '../systems/TargetCategories.js';
import { audio } from '../rendering/AudioSynth.js';
import {
  BASTION_MAX_LEVEL,
  bastionForm,
  bastionAbility,
  bastionStats,
  bastionTitle,
  bastionUpgrades,
  bastionWeaponKey,
  bastionWeaponScale,
} from '../config/baseUpgrades.js';

/** How far from the gate a creep has to be for Retribution to reach it. */
const RETRIBUTION_TICK_MS = 500;

/** Texture used before the first real weapon lands (boot pack still streaming). */
const BASTION_WEAPONS_FALLBACK = 'bastion-ward-crystal';

/**
 * The bastion's definition record.
 *
 * Only the fields the HUD reads: the name, and the categories. The role chip
 * derives GROUND + AIR from the targeting flags, so the keep is marked with the
 * same green/red pair every other both-category defence wears.
 */
const BASTION_DEF = Object.freeze({
  key: 'bastion',
  name: 'The Bastion',
  targetsGround: true,
  targetsAir: true,
  supportOnly: false,
  trap: false,
});

export class BastionGuardian {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} options
   * @param {number} options.x        bastion tile centre, world px
   * @param {number} options.y        bastion tile centre, world px
   * @param {number} options.footY    ground line the castle stands on
   * @param {object} options.body     the keep sprite the scene already draws
   * @param {object} options.context  { economy, gameState, activeEnemies, activeProjectiles }
   * @param {number} [options.scale]  sprite scale (0.44, the board's arena scale)
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.isBastion = true;
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.footY = options.footY ?? this.y;
    this.body = options.body || null;
    this.context = options.context || {};
    this.scale = options.scale ?? 0.44;

    this.level = 1;
    this.specialization = null;
    this.totalInvested = 0;
    this.cooldownTimer = 400;
    this.sigTimer = 1800;
    this.retributionClock = 0;
    this.weaponAngle = 0;
    this.currentTarget = null;
    this.upgradeLock = false;
    this.isDestroyed = false;
    this.selected = false;

    this.weapon = scene?.add?.image?.(this.x, this.y, BASTION_WEAPONS_FALLBACK) || null;
    if (this.weapon) {
      this.weapon.setOrigin(0.5, 1);
      this.weapon.setDepth(14);
    }

    this.rangeCircle = scene?.add?.graphics?.() || null;
    if (this.rangeCircle) {
      this.rangeCircle.setDepth(11);
      this.rangeCircle.setVisible(false);
    }

    this.applyForm();
  }

  /* ------------------------------------------------------------- contract */

  /**
   * The stat block the inspector draws.
   *
   * `title` and `ability` ride along because the panel reads both off the stats
   * it is handed (`describeAbility`), and the bastion is the only building whose
   * tier names itself rather than living in `towerData`.
   */
  get stats() {
    return { ...bastionStats(this), title: this.title, ability: this.ability };
  }

  get title() {
    return bastionTitle(this);
  }

  /** A definition-shaped record, so the shared HUD paths can read it. */
  get def() {
    return BASTION_DEF;
  }

  /**
   * The keep's hit points, read straight off the game state.
   *
   * The bastion does not own its pool — the leak flow, the health bar and the
   * defeat screen all read `gameState.baseHealth` — so the inspector reports the
   * same number rather than a second one that could drift.
   */
  get health() {
    return Math.max(0, this.context.gameState?.baseHealth ?? 0);
  }

  get maxHealth() {
    return Math.max(1, this.context.gameState?.maxBaseHealth ?? 1);
  }

  get sellRefund() {
    return 0;
  }

  get ability() {
    return bastionAbility(this);
  }

  get form() {
    // Level 3 is where the castle forks, so the sheet is looked up with the
    // branch, not just the tier: storm and sunforge are two different buildings.
    return bastionForm(this.level, this.specialization);
  }

  get nextUpgrades() {
    return bastionUpgrades(this);
  }

  get attackRange() {
    return this.stats.range || 0;
  }

  get attackCooldown() {
    return this.stats.cooldown || 1000;
  }

  /** Height of the drawn castle above its foot line — where the badge goes. */
  get artHeight() {
    if (!this.form) return TILE_SIZE * 3;
    const height = this.body?.displayHeight || this.form.sheet[1] * this.scale;
    return height * (1 - this.form.foot / this.form.sheet[1]);
  }

  /** World y of the castle's highest battlement (the badge and bar anchor). */
  get artTop() {
    return this.footY - this.artHeight;
  }

  /** The categories the bastion shoots at (it covers the whole sky). */
  get targets() {
    return defenceTargets(this.stats);
  }

  canUpgrade(choiceKey = null) {
    const options = this.nextUpgrades;
    if (!options.length) return false;
    const option = choiceKey ? options.find((entry) => entry.key === choiceKey) : options[0];
    if (!option) return false;
    return Boolean(this.context.economy?.canAfford?.(option.upgradeCost));
  }

  /**
   * Buy the next tier (or the chosen branch at level 2).
   *
   * Returns false — and charges nothing — when the tier is maxed, the choice is
   * unknown or the treasury cannot pay, exactly like `Tower.upgrade`.
   */
  upgrade(choiceKey = null) {
    if (this.upgradeLock) return false;
    const options = this.nextUpgrades;
    if (!options.length) return false;
    const option = choiceKey ? options.find((entry) => entry.key === choiceKey) : options[0];
    if (!option) return false;
    const cost = option.upgradeCost;
    if (!Number.isFinite(cost)) return false;
    if (!this.context.economy?.spend?.(cost)) return false;

    this.upgradeLock = true;
    this.scene?.time?.delayedCall?.(280, () => {
      this.upgradeLock = false;
    });

    this.totalInvested += cost;
    this.level = option.level || Math.min(BASTION_MAX_LEVEL, this.level + 1);
    if (option.specKey) this.specialization = option.specKey;
    // A new ability recharges from the moment it is bought, so the player sees
    // the thing they just paid for instead of waiting out the old clock.
    this.sigTimer = Math.min(this.sigTimer, 900);
    this.cooldownTimer = Math.min(this.cooldownTimer, 200);
    this.applyForm({ animate: true });
    return true;
  }

  /* ------------------------------------------------------------------ art */

  /**
   * Wear the current tier's castle and gun.
   *
   * The body sprite is the scene's (it owns the health bar, the leak effects and
   * the assault ring), so this only swaps what the tier changes: the texture,
   * the origin that keeps the castle's foot on the ground line, and the weapon's
   * texture / seat / size.
   */
  applyForm({ animate = false } = {}) {
    const form = this.form;
    const weaponArt = bastionWeaponKey(this);
    const body = this.body;
    if (body) {
      const ready = !this.scene?.textures || this.scene.textures.exists?.(form.key);
      if (ready) {
        body.setTexture?.(form.key);
        body.setOrigin?.(0.5, 1 - form.foot / form.sheet[1]);
        body.setScale?.(this.scale);
      } else {
        // The boot pack can still be streaming when a battle starts. Try again
        // shortly instead of leaving the keep on the old tier's art forever.
        this.scene?.time?.delayedCall?.(400, () => {
          if (!this.isDestroyed) this.applyForm({ animate: false });
        });
      }
    }

    if (this.weapon) {
      if (!this.scene?.textures || this.scene.textures.exists?.(weaponArt.key)) {
        this.weapon.setTexture?.(weaponArt.key);
      }
      this.weaponScale = this.scale * bastionWeaponScale(this.level);
      this.weapon.setScale?.(this.weaponScale);
      this.weapon.setPosition?.(...this.socketPosition());
      this.weapon.setDepth?.(14);
    }

    if (animate) {
      this.scene?.vfx?.tierUp?.(this.x, this.footY - 40, {
        tier: Math.min(3, this.level),
        branch: this.specialization,
        height: this.artHeight,
      });
      this.scene?.vfx?.levelUp?.(this.x, this.footY - 10);
      // A warm shimmer over the new tier, not an explosion: the castle changed,
      // it did not blow up. (The first version used the generic glow at full
      // additive strength, which read as a white starburst swallowing the keep.)
      const flash = this.scene?.add?.image?.(...this.socketPosition(), 'fx-glow');
      if (flash?.setBlendMode) {
        flash.setBlendMode('ADD');
        flash.setAlpha?.(0.26);
        flash.setScale?.(0.75);
        flash.setTint?.(0xffd79a);
        flash.setDepth?.(14);
        this.scene?.tweens?.add?.({
          targets: flash,
          alpha: 0,
          scale: 1.35,
          duration: 620,
          ease: 'Quad.easeOut',
          onComplete: () => flash.destroy?.(),
        });
      }
    }
  }

  /** World position of the gun's pivot (the socket the art generator measured). */
  socketPosition() {
    const form = this.form;
    return [
      this.x + form.socket.x * this.scale,
      this.footY - form.socket.y * this.scale,
    ];
  }

  /* ---------------------------------------------------------------- combat */

  /**
   * Nearest creep inside reach.
   *
   * A bastion is not a sniper: it defends the gate, so the creep closest to the
   * keep is always the right target — everything else is already past the point
   * where it matters.
   */
  acquireTarget() {
    const enemies = this.context.activeEnemies || [];
    const range = this.attackRange;
    const [px, py] = this.socketPosition();
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.isDead || enemy.reachedBase) continue;
      if (isFlying(enemy) ? !this.targets.air : !this.targets.ground) continue;
      const dist = Math.hypot(enemy.x - px, enemy.y - py);
      if (dist > range || dist >= bestDist) continue;
      best = enemy;
      bestDist = dist;
    }
    return best;
  }

  update(deltaMs) {
    if (this.isDestroyed) return;
    const delta = Math.max(0, Number(deltaMs) || 0);
    if (this.cooldownTimer > 0) this.cooldownTimer = Math.max(0, this.cooldownTimer - delta);

    this.updateRetribution(delta);
    this.updateSignature(delta);

    const target = this.acquireTarget();
    this.currentTarget = target;

    if (!target) {
      // Barrel drifts back to rest so an idle bastion looks asleep, not frozen
      // mid-turn.
      if (this.weapon) this.weaponAngle = stepAngle(this.weaponAngle, 0, delta, 4);
      if (this.weapon) this.weapon.rotation = this.weaponAngle;
      return;
    }

    const [px, py] = this.socketPosition();
    const desired = aimAngle(px, py, target.x, target.y);
    this.weaponAngle = stepAngle(this.weaponAngle, desired, delta);
    if (this.weapon) this.weapon.rotation = this.weaponAngle;

    if (this.cooldownTimer <= 0 && canFire(true, this.weaponAngle, desired)) {
      this.fire(target);
      this.cooldownTimer = this.attackCooldown;
    }
  }

  /**
   * Retribution (level 2+): creeps that stop to chew the gate take damage for
   * standing in the ward. Cheap — one tick every 500 ms, and only creeps already
   * assaulting the keep are considered, which is a tiny list.
   */
  updateRetribution(delta) {
    const ward = this.stats.retribution;
    if (!ward) return;
    this.retributionClock += delta;
    if (this.retributionClock < RETRIBUTION_TICK_MS) return;
    const ticks = Math.floor(this.retributionClock / RETRIBUTION_TICK_MS);
    this.retributionClock -= ticks * RETRIBUTION_TICK_MS;
    const enemies = this.context.activeEnemies || [];
    const amount = (ward.damagePerSecond * RETRIBUTION_TICK_MS) / 1000;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.isDead || enemy.reachedBase) continue;
      if (!enemy.assaulting) continue;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > ward.radius) continue;
      enemy.applyDamage?.(amount, 'magic');
    }
  }

  /** Storm's Thunderclap / Sunforge's Solar Flare. */
  updateSignature(delta) {
    const stats = this.stats;
    const nova = stats.nova;
    const flare = stats.flare;
    const cooldownMs = nova?.cooldownMs || flare?.cooldownMs;
    if (!cooldownMs) return;
    this.sigTimer -= delta;
    if (this.sigTimer > 0) return;
    this.sigTimer = cooldownMs;
    if (nova) this.castThunderclap(nova);
    else this.castSolarFlare(flare);
  }

  /** Damage + slow every creep standing in the gate yard. */
  castThunderclap(nova) {
    const enemies = this.context.activeEnemies || [];
    const cx = this.x;
    const cy = this.footY - TILE_SIZE * 0.6;
    let hits = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.isDead || enemy.reachedBase) continue;
      if (Math.hypot(enemy.x - cx, enemy.y - cy) > nova.radius) continue;
      enemy.applyDamage?.(nova.damage, 'lightning');
      if (nova.slow && nova.slowMs) enemy.applySlow?.(nova.slow, nova.slowMs);
      hits += 1;
    }
    if (hits === 0) return;
    this.scene?.vfx?.impact?.(cx, cy, 'lightning', {
      scale: Math.max(0.8, nova.radius / 120),
      splash: nova.radius,
      shake: false,
    });
    this.scene?.vfx?.shockwave?.(cx, cy, Math.max(0.7, nova.radius / 160));
    audio.playShoot?.('tesla', { pan: audio.panFor?.(cx, this.scene?.cameras?.main) });
  }

  /**
   * A heavy shell dropped on the densest knot of creeps inside reach.
   *
   * The cluster is found by counting neighbours within one splash radius — a
   * six-creep clump beats a single boss, which is what makes the ability feel
   * like it was aimed rather than rolled.
   */
  castSolarFlare(flare) {
    const enemies = this.context.activeEnemies || [];
    const range = this.attackRange;
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const anchor = enemies[i];
      if (!anchor || anchor.isDead || anchor.reachedBase) continue;
      if (Math.hypot(anchor.x - this.x, anchor.y - this.y) > range) continue;
      let score = 0;
      for (let j = 0; j < enemies.length; j += 1) {
        const other = enemies[j];
        if (!other || other.isDead || other.reachedBase) continue;
        if (Math.hypot(other.x - anchor.x, other.y - anchor.y) <= flare.splash) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
    if (!best) return;
    const dot = { kind: 'burn', damage: 9, tickMs: 500, durationMs: 2600 };
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.isDead || enemy.reachedBase) continue;
      if (Math.hypot(enemy.x - best.x, enemy.y - best.y) > flare.splash) continue;
      enemy.applyDamage?.(flare.damage, 'explosive');
      enemy.applyDot?.(dot);
    }
    this.scene?.vfx?.impact?.(best.x, best.y, 'explosive', {
      scale: Math.min(1.8, 0.9 + flare.splash / 180),
      splash: flare.splash,
      shake: false,
    });
    this.scene?.vfx?.groundBlast?.(best.x, best.y, Math.max(0.7, flare.splash / 90));
  }

  /** Fire one shot from the gun's mouth. */
  fire(target) {
    if (!target || target.isDead) return;
    const stats = this.stats;
    const [px, py] = this.socketPosition();
    const muzzle = bastionWeaponKey(this).muzzle;
    const tip = muzzlePoint(px, py, this.weaponAngle, {
      x: muzzle.x * this.weaponScale,
      y: muzzle.y * this.weaponScale,
    });

    // `TOWER_SAMPLES` is keyed by defence line, and the keep is not one: the
    // storm bolt reuses the Tesla coil's crack and the bombard the royal
    // artillery's report, which is what these two devices actually sound like.
    audio.playShoot?.(this.specialization === 'sunforge' ? 'royalArtillery' : 'tesla', {
      pan: audio.panFor?.(this.x, this.scene?.cameras?.main),
    });
    const counters = this.context.gameState?.counters;
    if (counters) counters.projectilesFired = (counters.projectilesFired || 0) + 1;

    this.scene?.vfx?.muzzle?.(tip.x, tip.y, this.weaponAngle, stats.damageType || 'magic', null, {
      scale: 0.6 + (this.level - 1) * 0.08,
    });

    if (this.weapon && this.scene?.tweens) {
      // Recoil along the barrel, the same trick the towers use.
      const barrel = this.weaponAngle - Math.PI / 2;
      this.scene.tweens.add({
        targets: this.weapon,
        x: px + Math.cos(barrel) * -4,
        y: py + Math.sin(barrel) * -4,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => this.weapon?.setPosition?.(px, py),
      });
    }

    const shot = {
      line: null,
      targetsGround: true,
      targetsAir: true,
      damage: stats.damage,
      speed: stats.projectileSpeed || 640,
      damageType: stats.damageType || 'magic',
      armorPenetration: stats.armorPenetration || 0,
      armorBreak: stats.armorBreak || 0,
      armorBreakMs: stats.armorBreakMs || 0,
      splash: stats.splash || 0,
      slow: stats.slow || 0,
      slowMs: stats.slowMs || 0,
      chainTargets: stats.chainTargets || 0,
      chainRange: stats.chainRange || 0,
      chainFalloff: stats.chainFalloff ?? 0.8,
      groundTarget: Boolean(stats.splash),
      bossBonus: 0,
      stunMs: 0,
      nova: 0,
      dot: stats.dot ? { ...stats.dot } : null,
      impactKey: null,
    };

    const projectile = new Projectile(
      this.scene,
      stats.projectile || 'lightning',
      tip.x,
      tip.y,
      target,
      shot,
      this.context.activeEnemies || [],
      null
    );
    this.context.activeProjectiles?.push?.(projectile);
  }

  /* ------------------------------------------------------------ selection */

  setSelected(selected) {
    this.selected = Boolean(selected);
    if (!this.rangeCircle) return;
    this.rangeCircle.setVisible(this.selected);
    if (!this.selected) return;
    this.rangeCircle.clear?.();
    const [px, py] = this.socketPosition();
    const range = this.attackRange;
    this.rangeCircle.lineStyle?.(2, 0xf5c451, 0.85);
    this.rangeCircle.fillStyle?.(0xf5c451, 0.06);
    this.rangeCircle.strokeCircle?.(px, py, range);
    this.rangeCircle.fillCircle?.(px, py, range);
  }

  destroy() {
    this.isDestroyed = true;
    this.weapon?.destroy?.();
    this.weapon = null;
    this.rangeCircle?.destroy?.();
    this.rangeCircle = null;
    this.body = null;
  }
}
