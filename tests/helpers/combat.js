/**
 * Headless battle harness.
 *
 * Data tests can prove a tower *has* a burn or a stun; they cannot prove the
 * tower ever lands one. This harness runs the real `Tower.update` →
 * `Projectile.update` → `Enemy.update` loop against a stubbed Phaser scene, so a
 * broken firing path (wrong muzzle, missing projectile texture, a stat that
 * never reaches the shot) shows up as "the creep walked through untouched"
 * instead of as a bug found by a player.
 *
 * The stub answers every display-object call with itself, which is exactly the
 * surface Tower, Projectile and Enemy touch: positions, scales, tints, depth,
 * text and tweens. Nothing here is a mock of the game logic — the entities are
 * the real classes.
 */

/** Chainable display object: any unknown method returns the node itself. */
export function stubNode(extra = {}) {
  const target = {
    x: 0,
    y: 0,
    alpha: 1,
    visible: true,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    // Facing is the thing these tests measure, so mirroring has to be real
    // state rather than a no-op chainable.
    setFlipX(value) {
      this.flipX = Boolean(value);
      return this;
    },
    setRotation(value) {
      this.rotation = value;
      return this;
    },
    destroy() {},
  };
  let proxy;
  proxy = new Proxy(Object.assign(target, extra), {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'then') return undefined;
      const fn = () => proxy;
      obj[key] = fn;
      return fn;
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
  return proxy;
}

export function makeCombatScene() {
  const scene = {
    add: {
      container: () => stubNode(),
      image: () => stubNode(),
      sprite: () => stubNode(),
      text: () => stubNode(),
      graphics: () => stubNode(),
      rectangle: () => stubNode(),
      circle: () => stubNode(),
      particles: () => stubNode(),
      existing: () => null,
    },
    anims: { exists: () => false, create: () => {} },
    tweens: { add: () => ({ remove() {} }) },
    time: {
      now: 0,
      delayedCall: () => ({ remove() {} }),
      addEvent: () => ({ remove() {} }),
    },
    textures: { exists: () => true, get: () => null },
    cameras: { main: { shake: () => {} } },
    activeEnemies: [],
    activeTowers: [],
    particleEmitter: null,
    vfx: null,
  };
  return scene;
}

export function makeCombatContext(scene) {
  const economy = {
    coins: 9999,
    score: 0,
    // Mirrors EconomyManager.spend: a purchase that cannot be afforded fails
    // and charges nothing. The old stub always returned true, which let a
    // "refuses an upgrade it cannot afford" test pass while the real rule was
    // broken.
    spend(amount) {
      if (!this.canAfford(amount)) return false;
      this.coins -= amount;
      return true;
    },
    canAfford(amount) {
      return this.coins >= amount;
    },
    earn(amount) {
      this.coins += amount;
    },
    addScore(amount) {
      this.score += amount;
    },
  };
  return {
    economy,
    gameState: { counters: {} },
    activeEnemies: scene.activeEnemies,
    activeProjectiles: [],
  };
}

/** A vertical lane (row, col) the creep marches along, north to south. */
export function lanePath(row, length) {
  return Array.from({ length }, (_, col) => `${row},${col}`);
}

/** A path that never moves: every waypoint is the same cell. */
export const parkingPath = () => new Array(2000).fill('5,0');

/**
 * Run one tower against one creep for a bounded number of simulated seconds.
 *
 * @returns {{
 *   tower: object, enemy: object, scene: object, context: object,
 *   shots: number, firstShotDistance: number|null,
 *   maxStunMs: number, sawDot: boolean, sawPoison: boolean,
 *   defeated: number, elapsedMs: number,
 * }}
 */
export function runBattle({
  Tower,
  Enemy,
  line,
  level = 1,
  specialization = null,
  enemyType = 'grunt',
  wave = 1,
  seconds = 40,
  stepMs = 16,
  towerCell = { row: 3, col: 10 },
  path = lanePath(4, 30),
  stopOnDeath = true,
}) {
  const scene = makeCombatScene();
  const context = makeCombatContext(scene);

  const tower = new Tower(scene, line, towerCell.row, towerCell.col, context);
  if (level !== 1 || specialization) {
    tower.level = level;
    if (specialization) tower.specialization = specialization;
    tower.applyVisual?.();
    tower.refreshDecorations?.();
  }
  tower.cooldownTimer = 0;

  let defeated = 0;
  const enemy = new Enemy(scene, enemyType, wave, path, {
    onReachedBase: () => {},
    onDefeated: () => {
      defeated += 1;
    },
  });
  scene.activeEnemies.push(enemy);

  let shots = 0;
  let firstShotDistance = null;
  let maxStunMs = 0;
  let sawDot = false;
  let sawPoison = false;
  let elapsedMs = 0;

  const seen = new Set();
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += stepMs) {
    elapsedMs = elapsed;
    tower.update(stepMs);

    for (const projectile of context.activeProjectiles) {
      if (!seen.has(projectile.id)) {
        seen.add(projectile.id);
        // Where on the lane the tower first opened fire: the honest measure of
        // its engagement range, unaffected by how long the creep survives.
        if (firstShotDistance === null) firstShotDistance = enemy.distanceTraveled;
      }
      projectile.update(stepMs);
    }
    context.activeProjectiles = context.activeProjectiles.filter((projectile) => !projectile.isDead);
    shots = seen.size;

    if (!enemy.isDead) enemy.update(stepMs);
    if (enemy.stunTimer > maxStunMs) maxStunMs = enemy.stunTimer;
    if (enemy.dots.length > 0) {
      sawDot = true;
      if (enemy.dots.some((dot) => dot.kind === 'poison')) sawPoison = true;
    }

    if (stopOnDeath && (enemy.isDead || enemy.reachedBase)) break;
  }

  return {
    tower,
    enemy,
    scene,
    context,
    shots,
    firstShotDistance,
    maxStunMs,
    sawDot,
    sawPoison,
    defeated,
    elapsedMs,
  };
}
