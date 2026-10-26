// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { BASTION_STATE, BASTION_THRESHOLDS, bastionState, isBastionCritical, leakIntensity } from '../src/systems/Bastion.js';

/**
 * Bastion integrity.
 *
 * The bar, the crystal's reaction and the browser checks all read the same two
 * thresholds. These tests pin the edges — 60 % is still "warning", 30 % is
 * already "critical", zero is fallen — because an off-by-one here is the
 * difference between a tense last stand and a bar that never turns red.
 */

describe('bastion state', () => {
  it('follows the two documented thresholds', () => {
    expect(BASTION_THRESHOLDS).toEqual({ warning: 0.6, critical: 0.3 });
    expect(bastionState(20, 20)).toBe(BASTION_STATE.STABLE);
    expect(bastionState(13, 20)).toBe(BASTION_STATE.STABLE); // 65 %
    expect(bastionState(12, 20)).toBe(BASTION_STATE.WARNING); // exactly 60 %
    expect(bastionState(7, 20)).toBe(BASTION_STATE.WARNING); // 35 %
    expect(bastionState(6, 20)).toBe(BASTION_STATE.CRITICAL); // exactly 30 %
    expect(bastionState(1, 20)).toBe(BASTION_STATE.CRITICAL);
    expect(bastionState(0, 20)).toBe(BASTION_STATE.FALLEN);
  });

  it('treats a broken configuration as fallen instead of dividing by zero', () => {
    expect(bastionState(5, 0)).toBe(BASTION_STATE.FALLEN);
    expect(bastionState(NaN, NaN)).toBe(BASTION_STATE.FALLEN);
  });

  it('marks only a standing critical bastion for the pulse', () => {
    expect(isBastionCritical(BASTION_STATE.CRITICAL)).toBe(true);
    expect(isBastionCritical(BASTION_STATE.FALLEN)).toBe(false);
    expect(isBastionCritical(BASTION_STATE.WARNING)).toBe(false);
  });
});

describe('leak intensity', () => {
  it('scales with the share of the bar a single leak removes', () => {
    expect(leakIntensity(1, 20)).toBeCloseTo(0.05);
    expect(leakIntensity(6, 20)).toBeCloseTo(0.3);
    expect(leakIntensity(12, 20)).toBeCloseTo(0.6);
  });

  it('clamps, so one enormous hit cannot throw the camera', () => {
    expect(leakIntensity(999, 20)).toBe(1);
    expect(leakIntensity(-5, 20)).toBe(0);
    expect(leakIntensity(4, 0)).toBe(1);
  });
});

describe('the scene reactions are safe to call in any order', () => {
  let GameScene;

  beforeAll(async () => {
    vi.stubGlobal(
      'Phaser',
      new Proxy(
        { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
        {
          get(target, key) {
            if (key in target) return target[key];
            return { Scene: target.Scene }[key];
          },
        }
      )
    );
    ({ GameScene } = await import('../src/scenes/GameScene.js'));
  });

  it('does nothing (and throws nothing) without a crystal', () => {
    const bare = { gameState: { baseHealth: 20, maxBaseHealth: 20, isOver: () => false } };
    expect(() => GameScene.prototype.flashBastion.call(bare, 4)).not.toThrow();
    expect(() => GameScene.prototype.shatterBastion.call(bare)).not.toThrow();
    expect(() => GameScene.prototype.flareBastion.call(bare)).not.toThrow();
    expect(() => GameScene.prototype.syncBastionPulse.call(bare)).not.toThrow();
    expect(bare.bastionState).toBe(BASTION_STATE.STABLE);
  });

  it('starts exactly one pulse for a critical bastion and clears it when healed', () => {
    const started = [];
    const crystal = { active: true, setTint() {}, setAlpha() {} };
    const scene = {
      baseCrystal: crystal,
      bastionHome: { tint: 0xffffff },
      bastionPulse: null,
      gameState: { baseHealth: 4, maxBaseHealth: 20, isOver: () => false },
      tweens: {
        add: (config) => {
          const handle = { config, stopped: false, stop() { this.stopped = true; }, remove() {} };
          started.push(handle);
          return handle;
        },
      },
    };
    GameScene.prototype.syncBastionPulse.call(scene);
    expect(scene.bastionState).toBe(BASTION_STATE.CRITICAL);
    expect(started).toHaveLength(1);

    // A second call must not stack a second loop.
    GameScene.prototype.syncBastionPulse.call(scene);
    expect(started).toHaveLength(1);

    // Healed: the loop is stopped and dropped.
    scene.gameState.baseHealth = 18;
    GameScene.prototype.syncBastionPulse.call(scene);
    expect(scene.bastionPulse).toBeNull();
    expect(started[0].stopped).toBe(true);
  });
});
