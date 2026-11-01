/**
 * BattleArt.js — the effect art a battle needs, loaded when a battle needs it.
 *
 * The fx pack (55 files, 1.3 MB) is pure combat art: impacts, muzzle strips,
 * shockwaves and the particle singles the emitters draw with. Nothing on the
 * menu, the world map or any Realm panel touches it, so paying for it at boot
 * delayed the first screen for art the player could not see yet. BootScene now
 * loads only the two UI-kit glows the HUD uses; GameScene queues the rest the
 * first time a battlefield opens and creates the clips once the textures land.
 *
 * The two keys the UI kit already owns (`fx-ring`, `fx-glow`) are deliberately
 * skipped: BootScene loads richer art under those names, and a second file with
 * the same key would only be dropped by the loader.
 */

import { FX_PARTICLES, FX_SHEETS } from '../data/fxManifest.js';
import { IMPACT_SHEETS } from '../data/spireManifest.js';

/** Keys BootScene owns; the pack entries for these would be shadowed. */
export const FX_KEY_OVERRIDES = new Set(['fx-ring', 'fx-glow']);

/** True once the pack is resident, so a second battle does not re-request it. */
export function hasBattleFxArt(textures) {
  return Boolean(textures?.exists?.('fx-spark') && textures?.exists?.('fx-shockwave'));
}

/**
 * Queue the impact + fx pack. Missing files are tolerated: `Vfx` guards every
 * play on `textures.exists()`, so a 404 costs one effect, not the battle.
 *
 * `textures` is optional but load-bearing: a battle can start while the boot
 * pack is still streaming, and queueing a key that is already in the manager
 * makes Phaser log "Texture key already in use" and keep the first copy. Skip
 * anything that is already there.
 */
export function queueBattleFxArt(load, textures = null) {
  // Skip a key that is already in the manager *or* still queued in a loader
  // (the boot pack can still be in flight when a battle starts).
  const have = (key) => Boolean(load?.list?.[key]) || Boolean(textures?.exists?.(key));
  for (const [key, sheet] of Object.entries(IMPACT_SHEETS)) {
    if (have(key)) continue;
    load.spritesheet(key, `assets/effects/${sheet.file}`, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }
  for (const [key, sheet] of Object.entries(FX_SHEETS)) {
    if (FX_KEY_OVERRIDES.has(key) || have(key)) continue;
    if (sheet.frames > 1) {
      load.spritesheet(key, `assets/fx/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    } else {
      load.image(key, `assets/fx/${sheet.file}`);
    }
  }
  for (const [key, file] of Object.entries(FX_PARTICLES)) {
    if (FX_KEY_OVERRIDES.has(key) || have(key)) continue;
    load.image(key, `assets/fx/${file}`);
  }
}

/**
 * Register `<key>-play` / `<key>-burst` clips for whatever actually arrived.
 * Idempotent: a scene restart or a second battle must not throw on an existing
 * animation key.
 */
export function createBattleFxAnims(scene) {
  if (!scene?.anims || !scene?.textures) return;
  for (const [key, sheet] of Object.entries(FX_SHEETS)) {
    if (sheet.frames <= 1) continue;
    if (!scene.textures.exists(key)) continue;
    if (scene.anims.exists(`${key}-play`)) continue;
    scene.anims.create({
      key: `${key}-play`,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
      frameRate: sheet.frameRate || 26,
      repeat: 0,
    });
  }
  for (const [key, sheet] of Object.entries(IMPACT_SHEETS)) {
    if (!scene.textures.exists(key)) continue;
    if (scene.anims.exists(`${key}-burst`)) continue;
    scene.anims.create({
      key: `${key}-burst`,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
      frameRate: 18,
      repeat: 0,
    });
  }
}
