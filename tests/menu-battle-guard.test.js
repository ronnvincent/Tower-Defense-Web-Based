// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

let MenuScene;

beforeAll(async () => {
  // MenuScene extends Phaser.Scene; the guard under test never touches Phaser.
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
  ({ MenuScene } = await import('../src/scenes/MenuScene.js'));
});

/**
 * "It goes back to the main menu on my first battle."
 *
 * `MenuScene.create()` stands down when a battlefield is live, but it read the
 * GameScene from `window.game` — a handle `main.js` only publishes in a dev
 * build (or behind an explicit `?probe=1`). In a production bundle the lookup
 * was `undefined`, the guard concluded no battle was running, and the moment
 * `BootScene` finished it un-hid the main-menu overlay and hid the HUD on top
 * of the live field.
 *
 * These tests drive `create()` against a scene that owns its own `game`
 * reference — exactly what Phaser provides in every build — and assert the menu
 * never draws or reveals itself over a battle.
 */

/** A scene object with only what the early guard touches. */
function menuSceneFor(gameScene) {
  const stop = vi.fn();
  const scene = {
    game: { scene: { getScene: (key) => (key === 'GameScene' ? gameScene : null) } },
    scene: { stop },
    scale: { width: 1280, height: 768 },
    add: {
      graphics: () => {
        throw new Error('the menu must not draw over a battle');
      },
    },
  };
  return { scene, stop };
}

const live = (status) => ({ sys: { settings: { status } }, scene: { isActive: () => status === 5 } });

beforeEach(() => {
  document.body.innerHTML = '<div id="main-menu-overlay" class="hidden"></div><div id="hud-container" class="hidden"></div>';
  // No dev handle at all: the production case.
  delete window.game;
});

afterEach(() => {
  delete window.game;
});

describe('the menu stands down for a live battle', () => {
  it('stops itself when the field is running', () => {
    const { scene, stop } = menuSceneFor(live(5));
    MenuScene.prototype.create.call(scene);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(document.getElementById('main-menu-overlay').classList.contains('hidden')).toBe(true);
  });

  it('also stands down while the field is still loading its sheets', () => {
    // status 3 = LOADING: a battle is on the glass before `isActive()` is true,
    // which is exactly the window a boot hand-off lands in.
    const { scene, stop } = menuSceneFor({ sys: { settings: { status: 3 } }, scene: { isActive: () => false } });
    MenuScene.prototype.create.call(scene);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not need the dev-only `window.game` handle to see the battle', () => {
    expect(window.game).toBeUndefined();
    const { scene, stop } = menuSceneFor(live(5));
    MenuScene.prototype.create.call(scene);
    expect(stop).toHaveBeenCalled();
  });

  it('still draws when nothing is live (the menu is the title screen)', () => {
    const { scene, stop } = menuSceneFor(null);
    expect(() => MenuScene.prototype.create.call(scene)).toThrow('the menu must not draw over a battle');
    expect(stop).not.toHaveBeenCalled();
  });
});
