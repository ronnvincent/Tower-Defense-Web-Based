import { TILE_SIZE } from '../config/gameConfig.js';
import { parseCellKey } from '../dsa/Graph.js';
import { ENEMY_TYPES, waveHealthMultiplier } from '../data/enemyData.js';
import { ENEMY_SHEETS } from '../data/spireManifest.js';
import { skinFor, waveAccent } from '../systems/EnemySkins.js';
import { calculateDamage, DAMAGE_TYPE } from '../systems/CombatCalculator.js';
import {
  siegeStep,
  siegeDamage,
  siegeInterval,
  assaultDamage,
  assaultInterval,
  assaultRing,
  ASSAULT_RANGE,
} from '../systems/BarricadeCombat.js';
import { audio } from '../rendering/AudioSynth.js';

/** World px a creep walks between footstep samples (~1.1 tiles). */
const FOOTSTEP_STRIDE = 54;

let enemyIdCounter = 1;

/**
 * Facing — the horde wears the pose that matches its heading.
 *
 * A Spire strip is **three clips x three directions**, not three palettes:
 *
 *     rows 0-2   idle : south (towards the camera) / north (away) / profile
 *     rows 3-5   walk : the same three
 *     rows 6-8   death: the same three
 *
 * So the art already contains a forward-facing, an away-facing and a
 * side-on drawing of every creature, and the correct way to turn a creep is to
 * *switch rows*, never to rotate the sprite. Rotating top-down art by 90°
 * shears the body's "away from the camera" axis onto the screen's x axis, which
 * is exactly why the horde looked like it was walking on its side.
 *
 * `faceTravel()` therefore:
 *   • picks a direction row from the step vector (south / north / profile),
 *   • mirrors the profile row for westbound movement,
 *   • leaves `rotation` at 0, so the head always points straight down the lane,
 *   • swaps the clip only when the direction actually changes.
 *
 * Imported Flare creatures are single-direction three-quarter art
 * (`directional: false`); they keep the old mirror-only contract, which is the
 * best a one-pose sheet can do.
 */
/** Row index per art direction. */
const DIRECTION_ROW = Object.freeze({ south: 0, north: 1, profile: 2 });
/** Below this many px of travel the last pose is kept (waypoint jitter). */
const FACING_DEADZONE = 0.2;

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
   * @param {(cellKey:string) => object|null} [callbacks.getStructureAt] the defence the horde must break on a cell
   * @param {(structure:object, damage:number, enemy:Enemy) => void} [callbacks.onStructureHit] siege swing landed
   * @param {(boss:Enemy, radius:number, multiplier:number, durationMs:number) => void} [callbacks.onSpeedAura] boss haste pulse
   * @param {(boss:Enemy, radius:number, durationMs:number) => void} [callbacks.onDisableTowers] boss freeze pulse
   * @param {{ healthScale?: number }} [options] level difficulty multiplier
   */
  constructor(scene, typeKey, waveNumber, path, callbacks, options = {}) {
    this.id = enemyIdCounter++;
    this.scene = scene;
    this.typeKey = typeKey;
    this.def = ENEMY_TYPES[typeKey] || ENEMY_TYPES.grunt;
    this.callbacks = callbacks || {};

    // Health calculation: per-wave ramp × the level's own difficulty scale.
    const mult = waveHealthMultiplier(waveNumber) * (options.healthScale || 1);
    this.maxHealth = Math.round(this.def.health * mult);
    this.health = this.maxHealth;
    // Endless keeps accelerating long after the campaign curve has topped out,
    // so the mode can hand the scene its own speed multiplier per wave.
    this.speedScale = options.speedScale || 1;
    this.baseSpeed = this.def.speed * this.speedScale;
    this.speed = this.baseSpeed;
    // Boss haste pulses (Sandstorm Aura) stack on top of slow effects.
    this.speedBuff = 1;
    this.speedBuffTimer = 0;
    this.armor = this.def.armor || 0;
    this.maxShield = Math.round((this.def.shield || 0) * mult);
    this.shield = this.maxShield;
    // Endless pays a depth-scaled bounty: a wave-40 grunt has 20x the health of
    // a wave-1 grunt, and 7 gold would not buy one upgrade.
    this.reward = Math.round(this.def.reward * (options.rewardScale || 1));
    this.score = this.def.score;
    this.baseDamage = this.def.baseDamage;
    this.radius = this.def.radius;
    this.isBoss = !!this.def.isBoss;
    // Airborne units ignore the barricades entirely and are invisible to
    // ground-only defences (Tower.acquireTarget filters on this).
    this.flying = Boolean(this.def.flying);

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
    // Warding Obelisk field: strips a fraction of the creep's *typed*
    // resistances while it stands inside. Same shape as armour break (take the
    // strongest source, refresh its timer) so two obelisks do not stack.
    this.resistanceBreak = 0;
    this.resistanceBreakTimer = 0;
    this.abilityTimer = 0;
    // Damage-over-time stacks (burn from the flame lines, poison from the venom
    // lines). Kept as a small list so two lines can work on the same creep.
    this.dots = [];
    this.stunTimer = 0;
    // Behaviour traits — see ENEMY_TRAITS in enemyData.js.
    this.traits = this.def.traits || null;
    this.traitState = { baseArmor: this.armor, hits: 0 };

    // Siege state — set while a palisade blocks the next waypoint
    this.isSieging = false;
    this.siegeTarget = null;
    this.siegeTimer = 0;
    // Bastion assault state (see updateBaseAssault).
    this.assaulting = false;
    this.assaultTimer = 0;

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

    // Main sprite — the Spire enemy strip, scaled by the *drawn* width of the
    // art (not the sheet's frame width) so wide and narrow enemies read at the
    // same size. Hitboxes are unchanged.
    // A type may borrow another creature's sheet (the Flying Wraith flies on
    // the wyvern art). Everything visual keys off `artKey`; every rule keys
    // off `this.typeKey`.
    this.artKey = this.def.art || this.typeKey;
    const sheetDef = ENEMY_SHEETS[this.artKey];
    const artSize = sheetDef ? Math.sqrt(sheetDef.artWidth * sheetDef.artHeight) : 64;
    this.baseScale = (this.radius * 2.3) / artSize;
    // Orientation contract — see faceTravel().
    //   `facing`        what row 0 does ('south' = towards the camera)
    //   `directional`   whether rows 0/1/2 are south / north / profile poses
    //   `profileFacing` which way the profile row is drawn ('east' | 'west')
    this.facing = sheetDef?.facing || 'south';
    this.directional = sheetDef?.directional !== false;
    this.profileFacing = sheetDef?.profileFacing || 'east';

    // Biome + tier sheet (see systems/EnemySkins.js). A missing variant texture
    // can never leave an enemy invisible: it falls back to the base sheet, and
    // from there to the bare (south-facing) clips.
    const skin = skinFor(this.artKey, waveNumber, options.theme);
    const hasTexture = Boolean(scene?.textures?.exists?.(skin.texture));
    const texture = hasTexture ? skin.texture : `enemy-${this.artKey}`;
    this.skin = { texture, tier: skin.tier };
    // Which direction row this creep is wearing. Bosses and imported art may
    // not ship all three, so each lookup is validated against the loaded clips.
    this.direction = 'south';
    this.animPrefix = this.resolveAnimPrefix(texture, 'south');
    // Escalating broods read at a glance: elite creeps are a touch bigger, and
    // champions are bigger still plus lit from behind by a brood-coloured glow.
    this.tier = skin.tier;
    this.waveNumber = waveNumber;
    this.baseScale *= skin.scale;

    // Frame 0 is the first idle pose; the animation below moves it into this
    // breed's south row immediately.
    this.sprite = scene.add.sprite(0, 0, texture, 0).setScale(this.baseScale);
    this.playAnim('move');
    this.container.add(this.sprite);

    // Airborne creeps ride above the road: the body is lifted, the shadow
    // shrinks and dims, and a slow bob keeps it visibly unmoored. The container
    // (and therefore the hitbox, the path and the health bars) stays on the
    // ground tile, so nothing about combat maths changes.
    if (this.flying) {
      this.hoverOffset = -22;
      this.sprite.y = this.hoverOffset;
      if (this.shadow) this.shadow.setDisplaySize(this.radius * 1.5, this.radius * 0.7).setAlpha(0.35);
      if (scene?.tweens?.add) {
        this.hoverTween = scene.tweens.add({
          targets: this.sprite,
          y: this.hoverOffset + 4,
          duration: 900 + Math.random() * 260,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    if (skin.glow > 0) this.createBroodGlow(skin.glow);

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
    if (this.maxShield > 0) this.createShieldBar();

    this.container.setDepth(20 + this.y * 0.001);

    // Notify scene of boss entrance
    if (this.isBoss && this.callbacks.onBossSpawn) {
      this.callbacks.onBossSpawn(this);
    }
  }

  /**
   * Animation prefix for a direction row, falling back gracefully.
   *
   * Prefers `<texture>-d<row>`, then the bare `<texture>` south clips. A sheet
   * that only ships one direction therefore still animates instead of freezing.
   */
  resolveAnimPrefix(texture, direction) {
    const row = DIRECTION_ROW[direction] ?? 0;
    const exists = (key) => Boolean(this.scene?.anims?.exists?.(key));
    for (const prefix of [`${texture}-d${row}`, texture]) {
      if (exists(`${prefix}-move`) || exists(`${prefix}-idle`)) return prefix;
    }
    return `${texture}-d${row}`;
  }

  /**
   * Play one of the pack's clips for this enemy ('idle' | 'move' | 'death').
   * The strips ship idle/move/death, so the walk cycle is real animation rather
   * than a tween.
   */
  playAnim(clip) {
    const key = `${this.animPrefix}-${clip}`;
    if (this.scene.anims.exists(key)) {
      this.sprite.play(key, true);
      this.currentAnim = clip;
      return;
    }
    // The requested direction row may not ship (single-pose art): fall back to
    // the south row rather than leaving the previous pose looping.
    if (this.direction !== 'south') {
      const fallback = this.resolveAnimPrefix(this.skin?.texture || `enemy-${this.typeKey}`, 'south');
      if (fallback !== this.animPrefix && this.scene.anims.exists(`${fallback}-${clip}`)) {
        this.animPrefix = fallback;
        this.sprite.play(`${fallback}-${clip}`, true);
        this.currentAnim = clip;
      }
    }
  }

  /**
   * The cyan shield strip above the health bar.
   *
   * Split out of the constructor because a support caster can hand a barrier to
   * a creep that shipped without one: that creep has no strip to update, and a
   * shield you cannot see reads as a damage bug.
   */
  createShieldBar() {
    const scene = this.scene;
    if (!scene?.add || this.shieldBarFill) return;
    const barWidth = this.barWidth || Math.max(30, this.radius * 1.8);
    this.barWidth = barWidth;
    this.shieldBarBg = scene.add.rectangle(0, -this.radius - 13, barWidth + 2, 4, 0x091424);
    this.shieldBarFill = scene.add.rectangle(-barWidth / 2, -this.radius - 13, barWidth, 2, 0x4ee1ff);
    this.shieldBarFill.setOrigin(0, 0.5);
    this.container.add(this.shieldBarBg);
    this.container.add(this.shieldBarFill);
  }

  /** Barrier + strip, created on demand for a granted shield. */
  ensureShieldVisual() {
    if (!this.scene?.add) return;
    this.createShieldBarrier();
    this.createShieldBar();
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

  /**
   * Defence the horde has to break through next: a wall across the waypoint, a
   * keep thrown in the road, or a structure hugging the cell being stepped into.
   */
  getStructureAhead() {
    const key = this.path?.[this.pathIndex];
    if (!key || !this.callbacks.getStructureAt) return null;
    const structure = this.callbacks.getStructureAt(key);
    if (!structure || structure.isDestroyed || structure.health <= 0) return null;
    return structure;
  }

  /**
   * A standing defence inside this attacker's reach, whether or not it sits on
   * the next waypoint.
   *
   * The scene owns the geometry (which radius applies, where the bastion is),
   * so the rule itself stays in one place — see `BarricadeCombat.huntRadiusFor`.
   * A flyer never hunts: it is not on the road the defence stands beside.
   */
  getDefenceInReach() {
    if (this.flying || !this.callbacks.getDefenceInReach) return null;
    const structure = this.callbacks.getDefenceInReach(this);
    if (!structure || structure.isDestroyed || structure.health <= 0) return null;
    return structure;
  }

  /**
   * Palisade interaction. Returns true when the enemy spent this frame laying
   * siege to a wall (so the caller skips normal waypoint movement).
   *
   * The attacker walks to a spot one stop-distance outside the wall, never
   * inside its tile, then swings every `siegeInterval` ms. This is what makes
   * barricades un-dodgeable: the BFS route does not change, the wall simply has
   * to be broken down.
   *
   * Contact is decided by the *radial* distance to the wall, not by reaching an
   * exact point: the queue offset pushes each attacker sideways, so aiming for
   * a precise pixel left offset lanes hovering 0.1 px outside their target and
   * attacking nothing at all.
   */
  updateSiege(deltaMs, target = null) {
    // A wall on the road cannot stop a unit that is not on the road.
    if (this.flying) {
      this.isSieging = false;
      this.siegeTarget = null;
      this.siegeTimer = 0;
      return false;
    }
    const wall = target || this.getStructureAhead();
    if (!wall) {
      this.isSieging = false;
      this.siegeTarget = null;
      this.siegeTimer = 0;
      return false;
    }

    this.isSieging = true;
    this.siegeTarget = wall;

    const step = siegeStep(
      { x: this.x, y: this.y },
      { x: wall.x, y: wall.y },
      { id: this.id, speed: this.speed, deltaMs }
    );
    this.x = step.x;
    this.y = step.y;

    // Face the wall while hammering it. Same rule as the march: the sheet's
    // own orientation decides the offset, so the creep swings its head toward
    // the palisade instead of hammering it with its back.
    this.faceTravel(wall.x - this.x, wall.y - this.y);

    if (step.attack) {
      // In contact: swing on the archetype's siege cadence.
      this.siegeTimer += deltaMs;
      const interval = siegeInterval(this.def);
      if (this.siegeTimer >= interval) {
        this.siegeTimer -= interval;
        this.callbacks.onStructureHit?.(wall, siegeDamage(this.def), this);
      }
    }

    // Heavy, fast breathing wobble reads as "hitting something".
    this.wobbleTimer += deltaMs * (this.isSieging ? 0.03 : 0.012);
    const scaleY = this.baseScale * (1 + Math.sin(this.wobbleTimer) * 0.12);
    this.sprite.setScale(this.baseScale, scaleY);

    this.container.setPosition(this.x, this.y);
    this.container.setDepth(20 + this.y * 0.001);
    return true;
  }

  /**
   * Grant a barrier from an enemy support caster.
   *
   * Rule (from the spec): a shield is only replaced when the new one is
   * **stronger**. Re-applying a 20-point ward to a creep already carrying a
   * 120-point shield must not weaken it, and two adepts standing together must
   * not stack into 40. Returns the points actually added, so the caster can
   * decide whether anything happened.
   *
   * @param {number} amount
   * @returns {number} shield points added (0 when nothing changed)
   */
  grantShield(amount) {
    const points = Math.max(0, Math.round(Number(amount) || 0));
    if (points <= 0 || this.isDead || this.reachedBase) return 0;
    if (points <= this.shield) return 0;
    const gained = points - this.shield;
    this.shield = points;
    this.maxShield = Math.max(this.maxShield || 0, points);
    this.ensureShieldVisual();
    this.updateHealthBar?.();
    return gained;
  }

  /**
   * Applies damage via centralized CombatCalculator.
   * @param {number} rawDamage
   * @param {string} [damageType] key in DAMAGE_TYPE
   * @param {object} [options] { armorPenetration, armorBreak, armorBreakMs, distance, splashRadius }
   * @returns {{ isDefeated: boolean, finalDamage: number, shieldAbsorbed: number, damageDealtToHealth: number }}
   */
  applyDamage(rawDamage, damageType = DAMAGE_TYPE.PHYSICAL, options = {}) {
    if (this.isDead || this.reachedBase) {
      return { isDefeated: false, finalDamage: 0, shieldAbsorbed: 0, damageDealtToHealth: 0 };
    }

    // Phalanx: creeps packed together brace, mitigating part of the hit. Splash
    // still lands on all of them, so the counter stays area damage.
    let incoming = rawDamage;
    if (this.traits?.phalanx && !options.ignoreTraits) {
      const allies = this.countCloseAllies(this.traits.phalanx.radius || 64);
      if (allies >= (this.traits.phalanx.allies ?? 2)) {
        incoming *= 1 - (this.traits.phalanx.reduction || 0.2);
      }
    }

    // Calculate combat resolution through centralized math
    const res = calculateDamage({
      rawDamage: incoming,
      damageType,
      armor: this.armor,
      armorPenetration: options.armorPenetration || 0,
      armorBreak: this.armorBreak,
      activeShield: this.shield,
      // A warded creep resists less. The debuff lowers every typed resistance
      // by the same fraction (floored at 0), which is a real change to the
      // damage formula — not a badge in the inspector.
      resistances: this.effectiveResistances(),
      distance: options.distance || 0,
      splashRadius: options.splashRadius || 0,
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

    // Adaptive plate: every hit hardens the target, so focus-fire alone stops
    // being the answer and armour-break tools get their moment.
    if (this.traits?.adaptive && res.damageDealtToHealth > 0) {
      this.traitState.hits += 1;
      const { perHit = 2, max = 24 } = this.traits.adaptive;
      if (this.armor < this.traitState.baseArmor + max) {
        this.armor = Math.min(this.traitState.baseArmor + max, this.armor + perHit);
      }
    }

    this.updateHealthBar();

    // Request 44: a boss that is being chewed through answers with its own
    // heavier hit. Only while it lives, and only when damage actually landed.
    if (this.isBoss && res.damageDealtToHealth > 0 && this.health > 0) {
      audio.playBossHit?.();
    }

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
      // Keep the run's speed ramp: a phase must make the boss faster, not
      // quietly reset it to the campaign stat line.
      this.baseSpeed = this.def.speed * this.speedScale * phase.speedMultiplier;
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

  /**
   * Speed bonus from being wounded (the `enrage` trait), 1 when healthy.
   * A getter so every place that recomputes `speed` sees the same value.
   */
  get enrageMultiplier() {
    if (!this.traits?.enrage) return 1;
    const missing = 1 - this.health / this.maxHealth;
    return 1 + (this.traits.enrage.maxSpeedBonus || 0.35) * Math.max(0, missing);
  }

  /** How many living creeps of this type are within `radius` of me. */
  countCloseAllies(radius) {
    const list = this.scene?.activeEnemies || [];
    let count = 0;
    for (const other of list) {
      if (other === this || other.isDead || other.reachedBase) continue;
      if (Math.hypot(other.x - this.x, other.y - this.y) <= radius) count += 1;
    }
    return count;
  }

  /**
   * Stack a damage-over-time effect.
   *
   * Re-applying the same kind refreshes the strongest active stack rather than
   * piling up a dozen timers, so a level-5 flamer is "hotter", never "buggier".
   */
  applyDot(dot) {
    if (!dot || this.isDead || this.reachedBase) return;
    const kind = dot.kind || 'fire';
    const existing = this.dots.find((entry) => entry.kind === kind);
    if (existing) {
      existing.damage = Math.max(existing.damage, dot.damage);
      existing.tickMs = dot.tickMs;
      existing.remainingMs = Math.max(existing.remainingMs, dot.durationMs);
      return;
    }
    this.dots.push({
      kind,
      damage: dot.damage,
      tickMs: dot.tickMs,
      acc: 0,
      remainingMs: dot.durationMs,
    });
    if (this.dots.length > 4) this.dots.shift();
  }

  /**
   * Freeze movement for a moment (harpoon hits, boss slam).
   *
   * Bosses carry `stunResist`, so the harpoon line controls the road without
   * turning a titan into a statue.
   */
  applyStun(durationMs) {
    if (this.isDead || this.reachedBase || this.immuneToStun) return;
    const resist = Math.min(0.9, this.def.stunResist || 0);
    const effective = durationMs * (1 - resist);
    if (effective <= 0) return;
    this.stunTimer = Math.max(this.stunTimer, effective);
  }

  /** Tick every DoT stack. Damage ignores armour entirely. */
  updateDots(deltaMs) {
    if (this.dots.length === 0) return;
    const survivors = [];
    for (const dot of this.dots) {
      dot.remainingMs -= deltaMs;
      dot.acc += deltaMs;
      while (dot.acc >= dot.tickMs) {
        dot.acc -= dot.tickMs;
        if (this.isDead || this.reachedBase) break;
        // 'true' damage skips armour but still feeds shields, the health bar
        // and the death path, so a burn kill pays out like any other kill.
        this.applyDamage(dot.damage, 'true', { ignoreTraits: true });
      }
      if (dot.remainingMs > 0 && !this.isDead) survivors.push(dot);
    }
    this.dots = survivors;
    if (this.dots.length > 0 && this.sprite?.active) {
      const kind = this.dots[0].kind;
      this.sprite.setTint(kind === 'poison' ? 0xa8e878 : 0xffa04a);
    }
  }

  /**
   * Typed resistances after the Warding Obelisk's field.
   *
   * `def.resistances` is the creature's own stat block; the ward subtracts a
   * flat fraction from each entry while it is active. Immunities are modelled
   * as a 1.0 resistance and clamp at 0 like any other — the field can soften a
   * resistance but it can never turn one into a weakness.
   */
  effectiveResistances() {
    const base = this.def.resistances;
    if (!base) return null;
    if (!(this.resistanceBreak > 0)) return base;
    const out = {};
    for (const [type, value] of Object.entries(base)) {
      out[type] = Math.max(0, Math.min(0.95, value - this.resistanceBreak));
    }
    return out;
  }

  /**
   * Apply the obelisk's ward. Armour break and resistance break are both
   * "strongest source wins, timer refreshes" so overlapping obelisks cannot
   * multiply into a permanent zero-armour debuff.
   * @returns {boolean} true when this call changed anything
   */
  applyWard({ armorBreak = 0, resistanceBreak = 0, durationMs = 1200 } = {}) {
    if (this.isDead || this.reachedBase) return false;
    const nextArmor = Math.max(this.armorBreak, armorBreak);
    const nextResist = Math.max(this.resistanceBreak, resistanceBreak);
    const changed = nextArmor !== this.armorBreak || nextResist !== this.resistanceBreak;
    this.armorBreak = nextArmor;
    this.resistanceBreak = nextResist;
    this.armorBreakTimer = Math.max(this.armorBreakTimer, durationMs);
    this.resistanceBreakTimer = Math.max(this.resistanceBreakTimer, durationMs);
    if (nextResist > 0 && this.sprite?.active) this.sprite.setTint(0xc9a6ff);
    return changed;
  }

  applySlow(fraction, durationMs) {
    if (this.isDead || this.reachedBase || this.immuneToSlow) return;
    this.slowFactor = Math.max(this.slowFactor, fraction);
    this.slowTimer = Math.max(this.slowTimer, durationMs);
    this.sprite.setTint(0x7fe9ff);
  }

  /**
   * Boss haste pulse. Kept as a method (not a direct `speed` write) so the
   * slow/aura interaction stays in one place and is covered by tests.
   */
  applySpeedBoost(multiplier = 1.35, durationMs = 3000) {
    if (this.isDead || this.reachedBase) return;
    const mult = Math.max(1, multiplier);
    this.speedBuff = Math.max(this.speedBuff, mult);
    this.speedBuffTimer = Math.max(this.speedBuffTimer, durationMs);
    this.speed = this.baseSpeed * (1 - this.slowFactor) * this.speedBuff * this.enrageMultiplier;
    this.sprite?.setTint?.(0xffb45c);
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

    // Play the pack's death animation, then remove the sprite. The enemy stops
    // existing for gameplay immediately (isDead is already set) so rewards and
    // targeting are untouched.
    const deathKey = `${this.animPrefix}-death`;
    if (this.scene.anims.exists(deathKey)) {
      this.sprite.clearTint();
      this.sprite.play(deathKey, true);
      this.shieldBarBg?.setVisible(false);
      this.shieldBarFill?.setVisible(false);
      this.healthBarBg?.setVisible(false);
      this.healthBarFill?.setVisible(false);
      this.sprite.once('animationcomplete', () => this.destroy());
      this.container.setDepth(19);
      this.callbacks.onDefeated(this);
      return;
    }

    this.callbacks.onDefeated(this);
    this.destroy();
  }

  /**
   * Bastion assault. Returns true while this frame was spent attacking the
   * gate (the caller then skips waypoint movement).
   *
   * The attacker aims for a point on a ring around the bastion rather than the
   * bastion's own tile: twenty creeps converging on one pixel read as a bug,
   * and the ring is what makes the gate look surrounded.
   */
  updateBaseAssault(deltaMs) {
    if (this.isDead || this.reachedBase) return false;
    const base = this.callbacks.getBasePoint?.();
    if (!base) return false;

    // The ring slot is picked once, from the bearing the creep arrived on, so
    // it stands down on the side it walked in from and never crosses the keep.
    if (!this.assaultPoint) {
      const bearing = Math.atan2(this.y - base.y, this.x - base.x);
      const ring = assaultRing(this.id, ASSAULT_RANGE, bearing);
      this.assaultPoint = {
        x: base.x + Math.cos(ring.angle) * ring.radius,
        y: base.y + Math.sin(ring.angle) * ring.radius,
      };
    }
    const target = this.assaultPoint;

    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    const toBase = Math.hypot(base.x - this.x, base.y - this.y);
    // Only start the siege once the creep is at the wall — a creep still
    // crossing the courtyard keeps walking, so the towers keep getting shots.
    if (!this.assaulting && toBase > ASSAULT_RANGE + 18) return false;

    this.assaulting = true;
    this.isSieging = false;
    this.siegeTarget = null;
    this.siegeTimer = 0;

    const step = (this.speed * deltaMs) / 1000;
    if (dist > step) {
      this.x += ((target.x - this.x) / dist) * step;
      this.y += ((target.y - this.y) / dist) * step;
    } else {
      this.x = target.x;
      this.y = target.y;
      this.assaultTimer += deltaMs;
      const interval = assaultInterval(this.def);
      if (this.assaultTimer >= interval) {
        this.assaultTimer -= interval;
        this.callbacks.onHitBase?.(this, assaultDamage(this.def));
      }
    }

    // Face the gate and heave. Same wobble language as a palisade siege, so
    // "attacking a thing" reads identically everywhere in the game.
    this.faceTravel(base.x - this.x, base.y - this.y);
    this.wobbleTimer += deltaMs * 0.03;
    const scaleY = this.baseScale * (1 + Math.sin(this.wobbleTimer) * 0.12);
    this.sprite.setScale(this.baseScale, scaleY);
    this.container.setPosition(this.x, this.y);
    this.container.setDepth(20 + this.y * 0.001);
    return true;
  }

  /**
   * Swap in a new route (used when the player builds a keep across this
   * creep's remaining lane). The first cell is where the creep is standing, so
   * the march continues from `pathIndex = 1` — no teleport, no lost distance.
   */
  setPath(cells) {
    if (!Array.isArray(cells) || cells.length < 2) return false;
    this.path = cells.slice();
    this.pathIndex = 1;
    return true;
  }

  reachBase() {
    if (this.reachedBase || this.isDead) return;
    this.reachedBase = true;
    this.callbacks.onReachedBase(this);
    this.destroy();
  }

  update(deltaMs) {
    if (this.isDead || this.reachedBase) return;

    // 0. Burning and poison tick before anything else: a creep can die of its
    // wounds before it takes another step.
    this.updateDots(deltaMs);
    if (this.isDead || this.reachedBase) return;

    if (this.stunTimer > 0) {
      this.stunTimer -= deltaMs;
      this.speed = 0;
      if (this.stunTimer > 0) return;
      // Walk it back to exactly zero: a leftover negative would keep reporting
      // "stunned" to anything that only checks `!== 0`.
      this.stunTimer = 0;
    }

    // 1. Handle status decay: slow (frost) and haste (boss aura) multiply.
    if (this.slowTimer > 0) {
      this.slowTimer -= deltaMs;
      if (this.slowTimer <= 0) {
        this.slowFactor = 0;
        this.sprite.clearTint();
      }
    }
    if (this.speedBuffTimer > 0) {
      this.speedBuffTimer -= deltaMs;
      if (this.speedBuffTimer <= 0) {
        this.speedBuff = 1;
        if (this.slowTimer <= 0 && this.armorBreakTimer <= 0) this.sprite.clearTint();
      }
    }
    // Enrage: a cornered creep sprints. The ramp is a trait, so only the
    // archetypes built for it speed up as they bleed.
    this.speed = this.baseSpeed * (1 - this.slowFactor) * this.speedBuff * this.enrageMultiplier;

    // 2. Handle armor-break debuff decay
    if (this.armorBreakTimer > 0) {
      this.armorBreakTimer -= deltaMs;
      if (this.armorBreakTimer <= 0) {
        this.armorBreak = 0;
        this.sprite.clearTint();
      }
    }

    // 2b. The obelisk's ward is a *field*: it is refreshed every second while
    // the creep stands inside, and lapses about a second after it leaves.
    if (this.resistanceBreakTimer > 0) {
      this.resistanceBreakTimer -= deltaMs;
      if (this.resistanceBreakTimer <= 0) {
        this.resistanceBreak = 0;
        this.resistanceBreakTimer = 0;
        if (this.slowTimer <= 0 && this.armorBreakTimer <= 0) this.sprite.clearTint();
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

    // 4. Boss abilities — summon adds bodies, the other two debuff the player's
    // side of the board. Every ability shares one timer: two pulses of the same
    // phase never fire in the same frame.
    const currentPhase = this.bossPhases[this.currentPhaseIndex];
    const ability = currentPhase?.ability;
    if (ability) {
      this.abilityTimer += deltaMs;
      if (this.abilityTimer >= (ability.intervalMs || 6000)) {
        this.abilityTimer = 0;
        if (ability.type === 'summon') {
          // `this` goes along so the brood leaves through the boss's own gate.
          this.callbacks.onSummonMinions?.(ability.enemyKey, ability.count, this);
        } else if (ability.type === 'speedAura') {
          this.callbacks.onSpeedAura?.(
            this,
            ability.radius ?? 180,
            ability.multiplier ?? 1.35,
            ability.durationMs ?? 3000
          );
        } else if (ability.type === 'disableTowers') {
          this.callbacks.onDisableTowers?.(this, ability.radius ?? 170, ability.durationMs ?? 2500);
        }
      }
    }

    // 5. Defences come first. Whatever the horde can reach — the wall across
    //    its next waypoint, or any standing defence inside its hunt radius —
    //    is broken before anything else happens. The bastion is never touched
    //    while a guard stands (see BarricadeCombat.huntRadiusFor and
    //    GameScene.getDefenceInReach).
    const guard = this.getStructureAhead() || this.getDefenceInReach();
    if (guard && this.updateSiege(deltaMs, guard)) return;

    // 5b. The bastion is the target, not a doorway: an attacker that reaches it
    //     stops at the wall and lays siege instead of walking through.
    if (this.updateBaseAssault(deltaMs)) return;

    // 6. Waypoint Movement
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

      // Turn the body into the heading it is actually travelling (see
      // faceTravel): the sheet's `facing` metadata supplies the offset, so a
      // westward creep shows its head to the west, not its tail.
      this.faceTravel(dx, dy);
    }

    // Request 44: a footstep per stride of ground covered, never per frame.
    // `step` is the distance actually walked this tick, so a slowed creep goes
    // quiet in step with its pace instead of ticking at a fixed rate.
    this.footstepClock = (this.footstepClock || 0) + step;
    if (this.footstepClock >= FOOTSTEP_STRIDE) {
      this.footstepClock = 0;
      this.playFootstep();
    }

    // Walking wobble animation
    this.wobbleTimer += deltaMs * 0.012;
    const scaleY = this.baseScale * (1 + Math.sin(this.wobbleTimer) * 0.08);
    this.sprite.setScale(this.baseScale, scaleY);

    this.container.setPosition(this.x, this.y);
    this.container.setDepth(20 + this.y * 0.001);
  }

  /**
   * Turn the body into its heading **by choosing the matching art row**.
   *
   * @param {number} dx world-space x of the step (or of the wall being hit)
   * @param {number} [dy] world-space y of the step
   *
   * The strips ship a forward-facing, an away-facing and a side-on drawing of
   * every creature (see the facing note at the top of this file), so the head
   * can point straight down the lane without any rotation. The sprite is never
   * rotated here: rotating top-down art by 90° is what made the horde look like
   * it was lying on its side.
   *
   * The profile row is mirrored for westbound movement, which is the only
   * transform needed: the side art is drawn facing east.
   */
  faceTravel(dx, dy = 0) {
    if (!this.sprite) return;

    // Keep the last pose while the creep is effectively stationary; a jittering
    // waypoint must not spin the pose on the spot.
    if (Math.abs(dx) < FACING_DEADZONE && Math.abs(dy) < FACING_DEADZONE) return;

    // Single-pose imported art can only mirror. Flare's creatures are drawn
    // three-quarter facing the camera, so westbound movement is the mirrored
    // pose and everything else is the stock one.
    if (!this.directional) {
      this.sprite.rotation = 0;
      this.sprite.setFlipX(dx < -FACING_DEADZONE);
      return;
    }

    // Which axis dominates the step decides the pose. Lanes are axis-aligned on
    // the grid, so this is a clean four-way choice even on a diagonal approach.
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const direction = horizontal ? 'profile' : dy > 0 ? 'south' : 'north';
    // Some creatures' side art is drawn looking east and some looking west (the
    // artist drew each by hand), so mirroring is decided against the art's own
    // facing rather than assuming east. Getting this wrong points half the
    // horde backwards while still "facing the right way" on the vertical lanes.
    const drawn = this.profileFacing === 'west';
    const flip = horizontal && ((dx < 0) !== drawn);

    this.sprite.rotation = 0;
    this.sprite.setFlipX(flip);

    if (direction !== this.direction) {
      this.direction = direction;
      this.animPrefix = this.resolveAnimPrefix(this.skin?.texture || `enemy-${this.typeKey}`, direction);
      // Re-issue whatever clip is currently playing so a walking creep keeps
      // walking (and a dying one keeps dying) in the new pose.
      this.playAnim(this.currentAnim || 'move');
    }
  }

  /**
   * Soft brood glow behind an elite/champion creep.
   *
   * The sprite art already carries a coloured contour at these tiers; the glow
   * is what makes a champion *feel* different while it walks, and it is drawn
   * under the sprite so it never muddies the silhouette.
   */
  createBroodGlow(strength) {
    const scene = this.scene;
    if (!scene?.add?.ellipse) return;
    const accent = waveAccent(this.waveNumber ?? 1);
    const radius = this.radius * 1.9;

    // Champions claim the ground: a static ring under the brood glow marks the
    // wave tier even while the creep is off-screen mid-battle, and it survives
    // the sprite being tinted by status effects.
    if (this.tier >= 2 && scene.add.graphics) {
      const ring = scene.add.graphics();
      ring.lineStyle(2, accent, 0.55);
      ring.strokeEllipse(0, 4, radius * 2.5, radius * 1.45);
      ring.lineStyle(1, accent, 0.28);
      ring.strokeEllipse(0, 4, radius * 2.1, radius * 1.2);
      this.container.addAt(ring, 0);
      this.broodRing = ring;
    }

    const glow = scene.add
      .ellipse(0, 2, radius * 2, radius * 1.2, accent, strength);
    this.container.addAt(glow, 0);
    // Champions pulse; elites breathe slowly. Both are cheap tweens on scale.
    if (scene.tweens?.add) {
      scene.tweens.add({
        targets: glow,
        scaleX: { from: 0.92, to: 1.08 },
        scaleY: { from: 0.92, to: 1.08 },
        alpha: { from: strength, to: Math.min(0.6, strength * 1.6) },
        duration: this.tier >= 2 ? 760 : 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.broodGlow = glow;
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
  /**
   * One footstep for this creep, attenuated by how far it is from the camera.
   *
   * Airborne creeps have no dedicated wing recording; the same stride sample is
   * played faster and quieter so a flyer reads as a flutter rather than boots.
   */
  playFootstep() {
    if (this.isDead || this.reachedBase) return;
    const cam = this.scene?.cameras?.main;
    let gain = 1;
    if (cam) {
      const cx = cam.scrollX + cam.width / 2;
      const cy = cam.scrollY + cam.height / 2;
      const far = Math.hypot(this.x - cx, this.y - cy);
      gain = Math.max(0.22, Math.min(1, 1 - far / 780));
    }
    if (this.flying) audio.playEnemyStep?.({ gain: gain * 0.6, rate: 1.9 });
    else audio.playEnemyStep?.({ gain });
  }

}
