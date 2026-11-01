/**
 * ArenaArt.js — the battlefield's landmarks, loaded by whoever needs them first.
 *
 * The portal gate, its vortex and the bastion keep used to be boot-only art:
 * `BootScene.preload` queued the four files and nothing ever asked again. That
 * made one bad first load permanent — a request that failed (or had simply not
 * finished when a battle started) left `bastion-fortress` / `portal-arch` /
 * `portal-vortex` absent for the life of the page, `GameScene` drew its
 * procedural swirl and no keep at all, and only a full reload could bring the
 * landmarks back. Reported as "the portal and the base are not drawn".
 *
 * So the art is treated like the fx pack is (see systems/BattleArt.js): the
 * battlefield is allowed to queue it itself, and `createArenaAnims` can be
 * called from either scene. The battle also keeps a list of the sprites it had
 * to build without their texture and swaps them the moment the file lands —
 * a transient network failure costs a second of a placeholder, not the
 * battlefield's identity.
 *
 * `river-flow` is deliberately not part of the repair list: it is a scrolling
 * background layer, created only when the texture is already resident, and a
 * missing one costs a still river rather than a missing landmark.
 */

import { ARENA_ART, PORTAL_ANIM } from '../data/arenaArt.js';

/** The three files a battlefield cannot read as itself without. */
export const ARENA_LANDMARKS = Object.freeze([ARENA_ART.bastion, ARENA_ART.portalArch, ARENA_ART.portalVortex]);

/** True when the landmark art is resident (the river is optional). */
export function hasArenaArt(textures) {
  return ARENA_LANDMARKS.every((art) => Boolean(textures?.exists?.(art.key)));
}

/**
 * Keys that are neither on the TextureManager nor in flight in *any* scene's
 * loader. The boot pack can still be streaming when a battle starts, and
 * queueing a key that is already being fetched makes Phaser log "Texture key
 * already in use" and keep whichever copy finishes first.
 */
export function missingArenaArt(scene) {
  const textures = scene?.textures;
  const scenes = scene?.game?.scene?.scenes || [];
  const inFlight = (key) => scenes.some((other) => Boolean(other?.load?.list?.[key]));
  return ARENA_LANDMARKS.filter((art) => !textures?.exists?.(art.key) && !inFlight(art.key));
}

/** Queue whatever is missing on this scene's loader. Returns the queued keys. */
export function queueArenaArt(scene) {
  const load = scene?.load;
  if (!load) return [];
  const missing = missingArenaArt(scene);
  for (const art of missing) {
    if (art.frames > 1) {
      load.spritesheet(art.key, art.path, { frameWidth: art.frameWidth, frameHeight: art.frameHeight });
    } else {
      load.image(art.key, art.path);
    }
  }
  return missing.map((art) => art.key);
}

/**
 * Register the vortex clip for whatever actually arrived. Idempotent: the boot
 * scene, a scene restart and a late-arriving sheet can all call it.
 */
export function createArenaAnims(scene) {
  if (!scene?.anims || !scene?.textures) return false;
  if (!scene.textures.exists(ARENA_ART.portalVortex.key)) return false;
  if (scene.anims.exists(PORTAL_ANIM)) return true;
  const { frames } = ARENA_ART.portalVortex;
  scene.anims.create({
    key: PORTAL_ANIM,
    frames: scene.anims.generateFrameNumbers(ARENA_ART.portalVortex.key, { start: 0, end: frames - 1 }),
    frameRate: 30,
    repeat: -1,
  });
  return true;
}
