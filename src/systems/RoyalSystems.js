/**
 * RoyalSystems — the field effects the royal roster needs, in one clock.
 *
 * Three of the ten royal lines do not shoot. Their value is a *field*:
 *
 *   Engineer Workshop   a fire-rate / range aura, and from L3 a repair crew
 *   Warding Obelisk     an armour / resistance debuff on everything in range
 *   Spike Trap          a proximity trigger with a real cooldown
 *
 * Each of those has to touch the simulation every tick, and each of them is the
 * kind of thing that quietly costs a frame if it is written per-entity. So they
 * live here, behind three timers, and the scene calls one `update(deltaMs)`:
 *
 *   wards     every 600 ms   (a debuff that lapses ~1.2 s after leaving range)
 *   repairs   every 500 ms   (one structure at a time — see `REPAIR_UNDER_FIRE`)
 *   traps     every 100 ms   (cheap proximity scan, cooldown per trap)
 *
 * Rules the request fixes, and where they are enforced:
 *
 *   - **No stacking support.** Buffs/wards take the strongest single source
 *     (`Math.max`) instead of summing, so three obelisks do not delete armour.
 *   - **No resurrection.** Repairs skip `isDestroyed` structures outright.
 *   - **Damage can outpace repair.** A crew under fire works at half rate, and
 *     repairs only ever touch the single worst-hit building.
 *   - **No air damage from the trap.** The trigger filters on `isFlying`.
 *   - **A trap never re-triggers inside one activation**: the activation is a
 *     single damage pulse, then the cooldown starts.
 */

/** A crew working under fire repairs at this fraction of its rated output. */
export const REPAIR_UNDER_FIRE = 0.5;

/** How close a living enemy has to be for a structure to count as "under fire". */
export const REPAIR_FIRE_RANGE = 76;

/** Ward refresh period (ms). Must be < the ward duration so the field is stable. */
export const WARD_TICK_MS = 600;

/** Ward lifetime after a creep leaves the obelisk's radius. */
export const WARD_DURATION_MS = 1400;

const REPAIR_TICK_MS = 500;
const TRAP_TICK_MS = 100;

export class RoyalSystems {
  /** @param {import('../scenes/GameScene.js').GameScene} scene */
  constructor(scene) {
    this.scene = scene;
    this.wardTimer = 0;
    this.repairTimer = 0;
    this.trapTimer = 0;
    /** Diagnostics for the inspector / tests, not gameplay. */
    this.stats = { wardsApplied: 0, repairsApplied: 0, trapsTriggered: 0, trapDamage: 0 };
  }

  /**
   * Defences that own one of the three fields.
   *
   * Rebuilt on each field tick (2–10 Hz, never per frame): the roster is at most
   * a few dozen towers, and a cache would have to be invalidated on build, sell,
   * upgrade and destruction — four places to get wrong for no measurable gain.
   */
  obelisks() {
    return (this.scene.activeTowers || []).filter(
      (t) => !t.isDestroyed && !t.isBarricade && !t.isDisabled && t.stats?.debuff
    );
  }

  workshops() {
    return (this.scene.activeTowers || []).filter(
      (t) => !t.isDestroyed && !t.isBarricade && !t.isDisabled && t.stats?.repair
    );
  }

  traps() {
    return (this.scene.activeTowers || []).filter(
      (t) => !t.isDestroyed && t.def?.trap
    );
  }

  update(deltaMs) {
    const dt = Math.max(0, Number(deltaMs) || 0);
    if (!dt) return;
    this.wardTimer += dt;
    this.repairTimer += dt;
    this.trapTimer += dt;

    if (this.trapTimer >= TRAP_TICK_MS) {
      this.tickTraps(this.trapTimer);
      this.trapTimer = 0;
    }
    if (this.wardTimer >= WARD_TICK_MS) {
      this.tickWards();
      this.wardTimer = 0;
    }
    if (this.repairTimer >= REPAIR_TICK_MS) {
      this.tickRepairs(this.repairTimer);
      this.repairTimer = 0;
      // The crew is "working" only while it has something to patch: two ticks
      // of grace so the flag does not flicker between 500 ms beats.
      const now = this.scene.time?.now ?? 0;
      for (const tower of this.scene.activeTowers || []) {
        if (tower.wasRepairing && now - (tower.lastRepairAt || 0) > 1100) {
          tower.wasRepairing = false;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ wards */

  /**
   * Refresh the ward on every living creep inside an obelisk's radius.
   *
   * The debuff itself is stored on the enemy (`applyWard`), so it lapses on its
   * own timer — a boss that walks out of range keeps the debuff for ~1.4 s and
   * then recovers, instead of carrying it forever because a field says so.
   */
  tickWards() {
    const obelisks = this.obelisks();
    if (!obelisks.length) return 0;
    const enemies = this.scene.activeEnemies || [];
    let applied = 0;
    for (const obelisk of obelisks) {
      const field = obelisk.stats.debuff;
      if (!field?.radius) continue;
      for (const enemy of enemies) {
        if (enemy.isDead || enemy.reachedBase) continue;
        const d = Math.hypot(enemy.x - obelisk.x, enemy.y - obelisk.y);
        if (d > field.radius) continue;
        // Ground and air both: a rune field is magic, not a road effect.
        if (enemy.applyWard?.({
          armorBreak: field.armorBreak || 0,
          resistanceBreak: field.resistanceBreak || 0,
          durationMs: WARD_DURATION_MS,
        })) {
          applied += 1;
        }
      }
    }
    this.stats.wardsApplied += applied;
    return applied;
  }

  /* ---------------------------------------------------------------- repairs */

  /**
   * Heal the single most-damaged structure inside a workshop's repair radius.
   *
   * One target per tick is deliberate: it caps the crew's throughput to
   * `perSecond` total rather than per building, which is what stops three
   * workshops from making a whole perimeter immortal. Repairs never touch a
   * destroyed structure — the rubble has to be cleared by the player, not
   * rebuilt for free.
   */
  tickRepairs(deltaMs) {
    const workshops = this.workshops();
    if (!workshops.length) return 0;
    let healed = 0;
    for (const workshop of workshops) {
      const field = workshop.stats.repair;
      if (!field?.perSecond) continue;
      const radius = field.radius || 200;
      let best = null;
      let bestRatio = 1;
      for (const tower of this.scene.activeTowers || []) {
        if (tower === workshop || tower.isDestroyed || tower.destroyed) continue;
        if (!Number.isFinite(tower.health) || !Number.isFinite(tower.maxHealth)) continue;
        if (tower.health >= tower.maxHealth) continue;
        if (Math.hypot(tower.x - workshop.x, tower.y - workshop.y) > radius) continue;
        const ratio = tower.health / tower.maxHealth;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          best = tower;
        }
      }
      if (!best) continue;

      const underFire = (this.scene.activeEnemies || []).some(
        (e) =>
          !e.isDead &&
          !e.reachedBase &&
          Math.hypot(e.x - best.x, e.y - best.y) <= REPAIR_FIRE_RANGE
      );
      const rate = field.perSecond * (underFire ? REPAIR_UNDER_FIRE : 1);
      const amount = (rate * deltaMs) / 1000;
      if (amount <= 0) continue;
      // Fractional HP is fine internally; the bar rounds. Never overheal.
      const before = best.health;
      best.health = Math.min(best.maxHealth, best.health + amount);
      healed += best.health - before;
      best.updateHealthBar?.();
      // A repair is visible work: swing the crew's hammer and run a short beam
      // from the workshop to the building it is patching. Both are driven by
      // the heal that actually landed, never by a timer of their own.
      workshop.wasRepairing = true;
      workshop.lastRepairAt = this.scene.time?.now ?? 0;
      this.playWorkAnimation(workshop);
      this.playRepairBeam(workshop, best);
    }
    if (healed > 0) this.stats.repairsApplied += healed;
    return healed;
  }

  /* ------------------------------------------------------------------ traps */

  /**
   * Fire a trap when a *ground* creep steps into its plate.
   *
   * One activation = one damage pulse (so the same creep cannot be hit twice by
   * the same snap), then the cooldown runs. The trap keeps working forever —
   * see docs/royal-defences.md §4 for why a reusable trap is the right call for
   * a base-defence economy (a one-shot plate is gold that evaporates on wave 1).
   */
  tickTraps(deltaMs) {
    const traps = this.traps();
    if (!traps.length) return 0;
    const enemies = this.scene.activeEnemies || [];
    let triggered = 0;
    for (const trap of traps) {
      trap.trapCooldown = Math.max(0, (trap.trapCooldown || 0) - deltaMs);
      if (trap.trapCooldown > 0) continue;
      const radius = trap.stats?.trapRadius || 48;
      const damage = trap.stats?.damage || 0;
      if (damage <= 0) continue;
      let hits = 0;
      for (const enemy of enemies) {
        if (enemy.isDead || enemy.reachedBase) continue;
        // Spikes are set in the road: they cannot reach the sky.
        if (enemy.flying || enemy.def?.flying || enemy.isFlying) continue;
        if (Math.hypot(enemy.x - trap.x, enemy.y - trap.y) > radius) continue;
        const res = enemy.applyDamage(damage, 'physical');
        if (res?.finalDamage > 0) {
          hits += 1;
          this.stats.trapDamage += res.finalDamage;
          trap.scene?.vfx?.damageText?.(enemy.x, enemy.y - 10, res.finalDamage);
        }
      }
      if (!hits) continue;
      triggered += 1;
      trap.trapCooldown = trap.stats?.trapCooldown || 6000;
      this.playTrapSnap(trap);
    }
    this.stats.trapsTriggered += triggered;
    return triggered;
  }

  /** The visible half of a trigger: one clip, one burst, no lingering sprite. */
  playTrapSnap(trap) {
    const key = trap.visual?.weaponKey;
    if (key && trap.scene?.anims.exists(`${key}-fire`)) {
      trap.topSprite?.play?.(`${key}-fire`);
    }
    // The trigger wears the branch's own hit: a caltrop field is a different
    // machine from the impaler, with its own `fx-line-spikeTrap-b-impact`.
    this.scene.vfx?.impact?.(trap.x, trap.y, 'physical', {
      scale: 0.9,
      line: trap.artLine || trap.typeKey,
      shake: false,
    });
    this.scene.vfx?.groundBlast?.(trap.x, trap.y, 0.55);
  }

  /** Swing the crew's hammer. Called from the heal that actually landed. */
  playWorkAnimation(workshop) {
    const key = workshop?.visual?.weaponKey;
    if (!key || !workshop.scene?.anims.exists(`${key}-fire`)) return;
    workshop.topSprite?.play?.(`${key}-fire`);
  }

  /**
   * The repair beam: a copper line from the workshop's hammer to the structure
   * it mended, gone in a fifth of a second.
   *
   * Bounded on purpose — a workshop lands at most one heal per 500 ms tick, and
   * live beams are capped in case several workshops fire on the same beat. No
   * emitter, no per-frame redraw: one graphics object per visible repair.
   */
  playRepairBeam(workshop, target) {
    const scene = this.scene;
    if (!scene?.add?.graphics || !target) return null;
    this._beams = this._beams || 0;
    if (this._beams >= 8) return null;
    try {
      // Additive: a warm arc of light, not a brown stick between two buildings.
      const g = scene.add.graphics().setDepth(41);
      g.setBlendMode?.('ADD');
      const x0 = workshop.x;
      const y0 = workshop.y - 38;
      const x1 = target.x;
      const y1 = target.y - 24;
      const mx = (x0 + x1) / 2;
      const my = Math.min(y0, y1) - 16;
      const steps = 14;
      const pts = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
          u * u * x0 + 2 * u * t * mx + t * t * x1,
          u * u * y0 + 2 * u * t * my + t * t * y1,
        ]);
      }
      const stroke = (width, colour, alpha) => {
        g.lineStyle(width, colour, alpha);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i][0], pts[i][1]);
        g.strokePath();
      };
      stroke(8, 0xff9d3c, 0.18);
      stroke(3.6, 0xffd98a, 0.55);
      stroke(1.5, 0xfff8e2, 0.95);
      // Two bright knots travelling along the arc: the crew's spark.
      g.fillStyle(0xfff3cf, 0.9);
      g.fillCircle(pts[5][0], pts[5][1], 2.2);
      g.fillCircle(pts[10][0], pts[10][1], 1.7);
      // The mended point glows for the same heartbeat.
      g.fillStyle(0xffe6a8, 0.55);
      g.fillCircle(x1, y1, 7);
      g.fillStyle(0xfff8e2, 0.9);
      g.fillCircle(x1, y1, 2.6);
      this._beams += 1;
      if (!scene.tweens?.add) {
        this._beams = Math.max(0, this._beams - 1);
        g.destroy();
        return null;
      }
      scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: 240,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this._beams = Math.max(0, this._beams - 1);
          g.destroy();
        },
      });
      return g;
    } catch (error) {
      scene.reportRuntimeError?.(error);
      return null;
    }
  }
}
