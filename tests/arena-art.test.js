// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  ARENA_LANDMARKS,
  createArenaAnims,
  hasArenaArt,
  missingArenaArt,
  queueArenaArt,
} from '../src/systems/ArenaArt.js';
import { ARENA_ART, PORTAL_ANIM } from '../src/data/arenaArt.js';

/**
 * Arena landmarks — "the portal and the base are not drawn".
 *
 * The four files used to be boot-only: `BootScene.preload` queued them and
 * nothing ever asked again, so one failed request (or a battle that started
 * while the request was still in flight) left the gate, the vortex and the keep
 * blank for the life of the page. These tests pin the three pieces of the fix:
 * the battlefield can queue the art itself, the vortex clip can be registered
 * by either scene, and a sprite built before its texture is repaired in place
 * instead of waiting for a reload.
 */

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

/** A TextureManager with exactly the keys a test says are resident. */
function texturesWith(keys = []) {
  const set = new Set(keys);
  return {
    exists: (key) => set.has(key),
    add: (key) => set.add(key),
  };
}

function loader() {
  const queued = [];
  return {
    list: {},
    queued,
    image: (key, path) => { queued.push({ kind: 'image', key, path }); },
    spritesheet: (key, path, frameConfig) => { queued.push({ kind: 'spritesheet', key, path, ...frameConfig }); },
  };
}

describe('the arena art manifest', () => {
  it('names the three landmarks a battlefield cannot read as itself without', () => {
    expect(ARENA_LANDMARKS.map((art) => art.key)).toEqual([
      'bastion-fortress',
      'portal-arch',
      'portal-vortex',
    ]);
  });

  it('counts the art as resident only when every landmark is there', () => {
    expect(hasArenaArt(texturesWith())).toBe(false);
    expect(hasArenaArt(texturesWith(['bastion-fortress', 'portal-arch']))).toBe(false);
    expect(hasArenaArt(texturesWith(['bastion-fortress', 'portal-arch', 'portal-vortex']))).toBe(true);
  });

  it('skips what is resident *and* what another scene is already fetching', () => {
    const scene = {
      textures: texturesWith(['bastion-fortress']),
      game: { scene: { scenes: [{ load: { list: { 'portal-vortex': {}} } }] } },
    };
    // The boot pack is still streaming the vortex: queueing it here would make
    // Phaser log "Texture key already in use" when both copies land.
    expect(missingArenaArt(scene).map((art) => art.key)).toEqual(['portal-arch']);
  });

  it('queues images for the gates and a sheet for the vortex', () => {
    const scene = { textures: texturesWith(), game: { scene: { scenes: [] } } };
    scene.load = loader();
    expect(queueArenaArt(scene)).toEqual(['bastion-fortress', 'portal-arch', 'portal-vortex']);
    expect(scene.load.queued).toEqual([
      { kind: 'image', key: ARENA_ART.bastion.key, path: ARENA_ART.bastion.path },
      { kind: 'image', key: ARENA_ART.portalArch.key, path: ARENA_ART.portalArch.path },
      {
        kind: 'spritesheet',
        key: ARENA_ART.portalVortex.key,
        path: ARENA_ART.portalVortex.path,
        frameWidth: 144,
        frameHeight: 144,
      },
    ]);
  });
});

describe('the vortex clip', () => {
  it('is not registered for a sheet that is not there', () => {
    const scene = { textures: texturesWith(), anims: { exists: () => false, create: vi.fn() } };
    expect(createArenaAnims(scene)).toBe(false);
    expect(scene.anims.create).not.toHaveBeenCalled();
  });

  it('is registered once, by whichever scene gets there first', () => {
    const created = [];
    const scene = {
      textures: texturesWith(['portal-vortex']),
      anims: {
        exists: (key) => created.some((anim) => anim.key === key),
        create: (config) => created.push(config),
        generateFrameNumbers: (key, range) => ({ key, range }),
      },
    };
    expect(createArenaAnims(scene)).toBe(true);
    expect(createArenaAnims(scene)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ key: PORTAL_ANIM, frameRate: 30, repeat: -1 });
    expect(created[0].frames.key).toBe('portal-vortex');
    expect(created[0].frames.range).toEqual({ start: 0, end: ARENA_ART.portalVortex.frames - 1 });
  });
});

describe('landmarks built ahead of their art', () => {
  const makeScene = (keys = []) => ({
    textures: texturesWith(keys),
    anims: null,
    time: { now: 1000 },
    arenaArtPending: [],
    arenaArtCheckedAt: 0,
    trackArenaSprite: GameScene.prototype.trackArenaSprite,
    repairArenaArt: GameScene.prototype.repairArenaArt,
  });

  const sprite = () => ({ scene: {}, texture: { key: '__MISSING' }, setTexture: vi.fn(function set(k) { this.texture = { key: k }; }), play: vi.fn() });

  it('does not track a sprite whose texture is already there', () => {
    const scene = makeScene(['portal-arch']);
    const arch = sprite();
    scene.trackArenaSprite(arch, 'portal-arch');
    expect(scene.arenaArtPending).toEqual([]);
  });

  it('swaps the real texture in when it finally lands', () => {
    const scene = makeScene();
    const keep = sprite();
    scene.trackArenaSprite(keep, 'bastion-fortress');
    expect(scene.arenaArtPending).toHaveLength(1);

    // Not arrived yet: the entry stays queued, the sprite is untouched.
    scene.repairArenaArt();
    expect(scene.arenaArtPending).toHaveLength(1);
    expect(keep.setTexture).not.toHaveBeenCalled();

    scene.textures.add('bastion-fortress');
    scene.time.now = 2000;
    scene.repairArenaArt();
    expect(keep.setTexture).toHaveBeenCalledWith('bastion-fortress');
    expect(scene.arenaArtPending).toEqual([]);
  });

  it('runs the sprite-specific repair (scale, blend and clip for the vortex)', () => {
    const scene = makeScene();
    const vortex = sprite();
    const apply = vi.fn((sprite_) => sprite_.setTexture('portal-vortex'));
    scene.trackArenaSprite(vortex, 'portal-vortex', apply);
    scene.textures.add('portal-vortex');
    scene.repairArenaArt();
    expect(apply).toHaveBeenCalledWith(vortex);
    expect(vortex.texture.key).toBe('portal-vortex');
  });

  it('polls at most every 400 ms and drops sprites a restart tore down', () => {
    const scene = makeScene();
    const keep = sprite();
    const dead = sprite();
    dead.scene = null;
    scene.trackArenaSprite(keep, 'bastion-fortress');
    scene.trackArenaSprite(dead, 'portal-arch');
    scene.repairArenaArt();
    expect(scene.arenaArtCheckedAt).toBe(1000);

    // A second call inside the window is free.
    scene.time.now = 1100;
    scene.repairArenaArt();
    expect(scene.arenaArtCheckedAt).toBe(1000);

    scene.textures.add('bastion-fortress');
    scene.time.now = 1500;
    scene.repairArenaArt();
    expect(keep.setTexture).toHaveBeenCalled();
    // The keep healed and the dead sprite was dropped, not swapped.
    expect(dead.setTexture).not.toHaveBeenCalled();
    expect(scene.arenaArtPending).toEqual([]);
  });
});
