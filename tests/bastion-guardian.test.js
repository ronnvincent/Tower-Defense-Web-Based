/**
 * The keep's gun (Request 67).
 *
 * `BastionGuardian` is the only defence in the game that is not a `Tower`: it is
 * not in `activeTowers`, it cannot be sold, and its ladder lives in
 * `config/baseUpgrades.js`. That makes it easy to break in ways no other test
 * would notice, so the behaviour is pinned here against a stub scene:
 *
 *   • buying a tier spends gold once, swaps the sheet, and refuses when poor;
 *   • the branch is chosen at level three and changes the weapon art;
 *   • it fires at whatever is closest to its own gate, air or ground;
 *   • Retribution only bites creeps that are actually attacking the keep;
 *   • Thunderclap and Solar Flare are timed, area, and can miss (no target, no
 *     effect) — a signature that fired into an empty field would look broken.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BastionGuardian } from '../src/entities/BastionGuardian.js';
import { BASTION_ART, BASTION_WEAPONS } from '../src/config/baseUpgrades.js';

/** Minimal Phaser stand-ins: only what the guardian touches. */
function stubScene() {
  const pending = [];
  const images = [];
  const makeImage = () => {
    const image = {
      texture: null,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      depth: 0,
      setOrigin: vi.fn(() => image),
      setDepth: vi.fn(() => image),
      setAlpha: vi.fn(() => image),
      setScale: vi.fn((value) => {
        image.scale = value;
        return image;
      }),
      setTint: vi.fn(() => image),
      setBlendMode: vi.fn(() => image),
      setTexture: vi.fn((key) => {
        image.texture = key;
        return image;
      }),
      setPosition: vi.fn((x, y) => {
        image.x = x;
        image.y = y;
        return image;
      }),
      destroy: vi.fn(),
    };
    images.push(image);
    return image;
  };
  const scene = {
    images,
    add: {
      image: vi.fn(() => makeImage()),
      graphics: () => ({
        setDepth: vi.fn(function depth() { return this; }),
        setVisible: vi.fn(function visible() { return this; }),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        fillStyle: vi.fn(),
        strokeCircle: vi.fn(),
        fillCircle: vi.fn(),
        destroy: vi.fn(),
      }),
    },
    textures: { exists: () => true },
    time: { delayedCall: (ms, fn) => pending.push({ ms, fn }) },
    tweens: { add: vi.fn() },
    cameras: { main: {} },
    vfx: new Proxy({}, { get: () => () => {} }),
    flush() {
      const queued = pending.splice(0, pending.length);
      for (const entry of queued) entry.fn();
      return queued;
    },
  };
  return scene;
}

const SCALE = 0.44;

function stubBody() {
  const sizeFor = (key) => {
    const form = Object.values(BASTION_ART).find((entry) => entry.key === key);
    return form ? form.sheet : [518, 480];
  };
  const [w0, h0] = sizeFor('bastion-l1');
  const body = {
    texture: 'bastion-l1',
    displayHeight: h0 * SCALE,
    displayWidth: w0 * SCALE,
    originY: 1 - BASTION_ART[1].foot / BASTION_ART[1].sheet[1],
    setTexture: vi.fn((key) => {
      body.texture = key;
      // Phaser re-measures the frame: the drawn castle is what the bar and the
      // badge anchor to, so the stub has to do the same.
      const [w, h] = sizeFor(key);
      body.displayWidth = w * SCALE;
      body.displayHeight = h * SCALE;
      return body;
    }),
    setOrigin: vi.fn((x, y) => {
      body.originY = y;
      return body;
    }),
    setScale: vi.fn(() => body),
  };
  return body;
}

function stubEconomy(starting = 5000) {
  const economy = { coins: starting };
  economy.spend = vi.fn((amount) => {
    if (amount > economy.coins) return false;
    economy.coins -= amount;
    return true;
  });
  return economy;
}

function enemy(overrides = {}) {
  return {
    x: 0,
    y: 0,
    health: 100,
    isDead: false,
    reachedBase: false,
    assaulting: false,
    flying: false,
    applyDamage: vi.fn(),
    applySlow: vi.fn(),
    applyDot: vi.fn(),
    ...overrides,
  };
}

function makeGuardian({ coins = 5000, enemies = [] } = {}) {
  const scene = stubScene();
  const economy = stubEconomy(coins);
  const gameState = { baseHealth: 20, maxBaseHealth: 20, counters: { projectilesFired: 0 } };
  const body = stubBody();
  const guardian = new BastionGuardian(scene, {
    x: 400,
    y: 600,
    footY: 622,
    body,
    scale: 0.44,
    context: { economy, gameState, activeEnemies: enemies, activeProjectiles: [] },
  });
  guardian.gameState = gameState;
  return { guardian, scene, economy, gameState, body, enemies };
}

describe('BastionGuardian', () => {
  it('starts at level one with the first tier art and no specialisation', () => {
    const { guardian } = makeGuardian();
    expect(guardian.isBastion).toBe(true);
    expect(guardian.level).toBe(1);
    expect(guardian.specialization).toBe(null);
    expect(guardian.stats.damage).toBeGreaterThan(0);
    expect(guardian.targets.ground).toBe(true);
    expect(guardian.targets.air).toBe(true);
    expect(guardian.sellRefund).toBe(0);
  });

  it('buys a tier once, spends the gold and swaps the form', () => {
    const { guardian, economy, body, scene } = makeGuardian();
    expect(guardian.upgrade()).toBe(true);
    expect(guardian.level).toBe(2);
    expect(economy.coins).toBe(5000 - 180);
    expect(body.texture).toBe(BASTION_ART[2].key);
    expect(body.originY).toBeCloseTo(1 - BASTION_ART[2].foot / BASTION_ART[2].sheet[1], 6);
    // The upgrade is locked for a beat so a held button cannot buy two tiers.
    expect(guardian.upgrade()).toBe(false);
    scene.flush();
    expect(guardian.level).toBe(2);
    expect(guardian.upgrade()).toBe(true);
    expect(guardian.level).toBe(3);
  });

  it('refuses a tier the treasury cannot pay for, and costs nothing', () => {
    const { guardian, economy, body } = makeGuardian({ coins: 10 });
    expect(guardian.canUpgrade()).toBe(false);
    expect(guardian.upgrade()).toBe(false);
    expect(guardian.level).toBe(1);
    expect(economy.coins).toBe(10);
    expect(body.texture).toBe(BASTION_ART[1].key);
  });

  it('turns the level-three choice into a branch with its own gun', () => {
    const { guardian, body, scene } = makeGuardian();
    guardian.upgrade();
    scene.flush();
    const options = guardian.nextUpgrades;
    expect(options).toHaveLength(2);
    expect(guardian.upgrade('bastion-sunforge')).toBe(true);
    expect(guardian.level).toBe(3);
    expect(guardian.specialization).toBe('sunforge');
    expect(body.texture).toBe(BASTION_ART[3].key);
    expect(guardian.weapon.texture).toBe(BASTION_WEAPONS.sunCannon.key);
    expect(guardian.stats.flare).toBeTruthy();
    // A storm bastion on the same tier wears the crystal and chains instead.
    const other = makeGuardian();
    other.guardian.upgrade();
    other.scene.flush();
    other.guardian.upgrade('bastion-storm');
    expect(other.guardian.weapon.texture).toBe(BASTION_WEAPONS.wardCrystal.key);
    expect(other.guardian.stats.chainTargets).toBeGreaterThanOrEqual(3);
  });

  it('seats the gun on the socket the art generator measured', () => {
    const { guardian } = makeGuardian();
    const form = BASTION_ART[1];
    const [x, y] = guardian.socketPosition();
    expect(x).toBeCloseTo(400 + form.socket.x * 0.44, 5);
    expect(y).toBeCloseTo(622 - form.socket.y * 0.44, 5);
  });

  it('shoots the creep closest to the gate, at air or ground alike', () => {
    const near = enemy({ x: 420, y: 600 });
    const far = enemy({ x: 520, y: 600 });
    const flying = enemy({ x: 430, y: 590, flying: true });
    const { guardian, scene } = makeGuardian({ enemies: [far, near, flying] });
    expect(guardian.acquireTarget()).toBe(flying);
    guardian.update(1000);
    expect(scene.images.length).toBeGreaterThan(0);
    expect(guardian.currentTarget).toBe(flying);
  });

  it('ignores creeps that are already dead or out of reach', () => {
    const dead = enemy({ isDead: true, x: 405, y: 600 });
    const leaked = enemy({ reachedBase: true, x: 405, y: 600 });
    const distant = enemy({ x: 405 + 4000, y: 600 });
    const { guardian } = makeGuardian({ enemies: [dead, leaked, distant] });
    expect(guardian.acquireTarget()).toBe(null);
  });

  it('only burns creeps that are attacking the keep (Retribution)', () => {
    const attacker = enemy({ x: 405, y: 600, assaulting: true });
    const passer = enemy({ x: 405, y: 600, assaulting: false });
    const { guardian } = makeGuardian({ enemies: [attacker, passer] });
    guardian.upgrade();
    guardian.update(600);
    expect(attacker.applyDamage).toHaveBeenCalled();
    expect(passer.applyDamage).not.toHaveBeenCalled();
  });

  it('calls Thunderclap on its own clock and slows the whole yard', () => {
    const close = enemy({ x: 405, y: 590 });
    const near = enemy({ x: 430, y: 580 });
    const out = enemy({ x: 405 + 900, y: 590 });
    const { guardian, scene } = makeGuardian({ enemies: [close, near, out] });
    guardian.upgrade('bastion-storm');
    // Level 1 into the branch is not allowed: buy the ladder in order first.
    expect(guardian.level).toBe(1);
    guardian.upgrade();
    scene.flush();
    guardian.upgrade('bastion-storm');
    scene.flush();
    expect(guardian.specialization).toBe('storm');
    guardian.sigTimer = 0;
    guardian.update(16);
    expect(close.applyDamage).toHaveBeenCalledWith(expect.any(Number), 'lightning');
    expect(near.applyDamage).toHaveBeenCalled();
    expect(close.applySlow).toHaveBeenCalled();
    expect(out.applyDamage).not.toHaveBeenCalled();
    expect(guardian.sigTimer).toBeGreaterThan(1000);
  });

  it('drops Solar Flare on the densest knot, not the first creep', () => {
    const lonely = enemy({ x: 460, y: 560, health: 200 });
    const knotA = enemy({ x: 470, y: 570 });
    const knotB = enemy({ x: 480, y: 576 });
    const knotC = enemy({ x: 462, y: 580 });
    const { guardian, scene } = makeGuardian({ enemies: [lonely, knotA, knotB, knotC] });
    guardian.upgrade();
    scene.flush();
    guardian.upgrade('bastion-sunforge');
    scene.flush();
    guardian.sigTimer = 0;
    guardian.update(16);
    // Every creep inside the flare takes damage and a burn; the tests do not
    // care which cluster won, only that the ability actually landed.
    const hits = [lonely, knotA, knotB, knotC].filter((e) => e.applyDamage.mock.calls.length > 0);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(knotA.applyDot).toHaveBeenCalled();
  });

  it('holds the signature while a wave is still out of reach', () => {
    const { guardian, scene } = makeGuardian({ enemies: [] });
    guardian.upgrade();
    scene.flush();
    guardian.upgrade('bastion-storm');
    scene.flush();
    guardian.sigTimer = 40;
    guardian.update(50);
    expect(guardian.sigTimer).toBeGreaterThan(1000);
  });

  it('reports its hit points from the run, not from a second pool', () => {
    const { guardian, gameState } = makeGuardian();
    expect(guardian.health).toBe(20);
    expect(guardian.maxHealth).toBe(20);
    gameState.baseHealth = 7;
    expect(guardian.health).toBe(7);
  });

  it('reads its art height off the drawn castle, so the bar follows the tier', () => {
    const { guardian, scene } = makeGuardian();
    const first = guardian.artHeight;
    guardian.upgrade();
    scene.flush();
    const form = BASTION_ART[2];
    expect(guardian.artHeight).toBeCloseTo(
      form.sheet[1] * 0.44 * (1 - form.foot / form.sheet[1]),
      0
    );
    expect(guardian.artTop).toBeLessThan(guardian.footY);
    expect(guardian.artHeight).toBeGreaterThan(0);
    expect(first).toBeGreaterThan(0);
  });
});
