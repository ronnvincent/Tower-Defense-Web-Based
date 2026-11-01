import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';

const root = path.resolve('.');
const publicDir = path.join(root, 'public', 'assets');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(path.join(publicDir, 'tiles'));
ensureDir(path.join(publicDir, 'towers'));
ensureDir(path.join(publicDir, 'enemies'));
ensureDir(path.join(publicDir, 'projectiles'));
ensureDir(path.join(publicDir, 'effects'));
ensureDir(path.join(publicDir, 'ui'));
ensureDir(path.join(publicDir, 'audio'));

function copy(src, dest) {
  const fullSrc = path.join(root, src);
  const fullDest = path.join(publicDir, dest);
  if (fs.existsSync(fullSrc)) {
    fs.copyFileSync(fullSrc, fullDest);
    console.log(`Copied: ${src} -> ${dest}`);
  } else {
    console.warn(`WARNING: File not found: ${fullSrc}`);
  }
}

// 1. TILES
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile024.png', 'tiles/grass.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile093.png', 'tiles/road.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile135.png', 'tiles/rock.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile130.png', 'tiles/foliage.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile181.png', 'tiles/base_platform.png');

// 2. TOWERS
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile180.png', 'towers/base_archer.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile181.png', 'towers/base_cannon.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile180.png', 'towers/base_frost.png');

copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile249.png', 'towers/tower_archer_lvl1.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile250.png', 'towers/tower_archer_lvl2.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile291.png', 'towers/tower_archer_spec_a.png'); // Rapid Ranger
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile292.png', 'towers/tower_archer_spec_b.png'); // Sniper Tower

copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile203.png', 'towers/tower_cannon_lvl1.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile204.png', 'towers/tower_cannon_lvl2.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile205.png', 'towers/tower_cannon_spec_a.png'); // Siege Cannon
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile206.png', 'towers/tower_cannon_spec_b.png'); // Heavy Artillery

copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile206.png', 'towers/tower_frost_lvl1.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile250.png', 'towers/tower_frost_lvl2.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile205.png', 'towers/tower_frost_spec_a.png'); // Blizzard Spire
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile296.png', 'towers/tower_frost_spec_b.png'); // Lightning Conductor

copy('src/assets/kenney_medieval-rts/PNG/Default size/Environment/medievalEnvironment_16.png', 'towers/barricade.png');
copy('src/assets/kenney_medieval-rts/PNG/Default size/Environment/medievalEnvironment_15.png', 'towers/barricade_lvl2.png');

// 3. ENEMIES & BOSSES
copy('src/assets/slime_monster_24x24/slime_monster_spritesheet.png', 'enemies/slime_spritesheet.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile245.png', 'enemies/enemy_grunt.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile247.png', 'enemies/enemy_runner.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile246.png', 'enemies/enemy_brute.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile248.png', 'enemies/enemy_swarm.png');
copy('src/assets/kenney_medieval-rts/PNG/Default size/Unit/medievalUnit_02.png', 'enemies/enemy_healer.png');
copy('src/assets/kenney_medieval-rts/PNG/Default size/Unit/medievalUnit_09.png', 'enemies/enemy_shield.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile270.png', 'enemies/boss_colossus.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile268.png', 'enemies/boss_warlord.png');

// 4. PROJECTILES
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile297.png', 'projectiles/proj_arrow.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile274.png', 'projectiles/proj_cannonball.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile251.png', 'projectiles/proj_frost.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile295.png', 'projectiles/proj_rapid.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile297.png', 'projectiles/proj_sniper.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile272.png', 'projectiles/coin.png');

// 5. EFFECTS
copy('src/assets/kenney_particle-pack/PNG (Transparent)/spark_01.png', 'effects/spark.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/spark_04.png', 'effects/lightning_beam.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/smoke_01.png', 'effects/smoke.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/flame_01.png', 'effects/flame.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/magic_02.png', 'effects/magic.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/magic_03.png', 'effects/heal_spark.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/circle_05.png', 'effects/shield_barrier.png');
copy('src/assets/kenney_particle-pack/PNG (Transparent)/muzzle_01.png', 'effects/muzzle.png');

// 6. UI ICONS
// The Kenney coin is a 16x16 coin in a 64x64 canvas — 94% transparent. Copied
// as-is, every caller that sizes the canvas paints the coin at a quarter of the
// size it asked for, which is why the hub's purse read "a dot, a gem, a star".
// The normalize step below re-pads it in place (same pixels, tighter canvas).
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile272.png', 'ui/icon_coin.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/trophy.png', 'ui/icon_trophy.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/pause.png', 'ui/icon_pause.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/fastForward.png', 'ui/icon_speed.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/audioOn.png', 'ui/icon_audio_on.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/audioOff.png', 'ui/icon_audio_off.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/gear.png', 'ui/icon_gear.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/leaderboardsComplex.png', 'ui/icon_codex.png');
copy('src/assets/kenney_game-icons/PNG/White/2x/information.png', 'ui/icon_info.png');

// Build Card Icons (replacing radial gradients!)
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile249.png', 'ui/card_archer.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile203.png', 'ui/card_cannon.png');
copy('src/assets/kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile206.png', 'ui/card_frost.png');
copy('src/assets/kenney_medieval-rts/PNG/Default size/Environment/medievalEnvironment_16.png', 'ui/card_barricade.png');

// 7. AUDIO
copy('src/assets/kenney_ui-pack/Sounds/click-a.ogg', 'audio/click.ogg');
copy('src/assets/kenney_ui-pack/Sounds/switch-a.ogg', 'audio/toggle.ogg');
copy('src/assets/kenney_impact-sounds/Audio/impactWood_medium_000.ogg', 'audio/impact_wood.ogg');
copy('src/assets/kenney_impact-sounds/Audio/impactMetal_heavy_000.ogg', 'audio/impact_metal.ogg');
copy('src/assets/kenney_impact-sounds/Audio/impactGlass_heavy_000.ogg', 'audio/impact_glass.ogg');
copy('src/assets/kenney_impact-sounds/Audio/impactBell_heavy_000.ogg', 'audio/coin.ogg');
copy('src/assets/kenney_impact-sounds/Audio/impactMining_000.ogg', 'audio/place.ogg');

// 8. COZY UI PACK (DEMO_Cozy_UI_Pack_doboui)
const cozySrc = path.join(root, 'src', 'assets', 'DEMO_Cozy_UI_Pack_doboui', 'DEMO_Cozy_UI_Pack_doboui');
const cozyDest = path.join(publicDir, 'cozy-ui');

function copyDirRecursive(s, d) {
  if (!fs.existsSync(s)) return;
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  for (const item of fs.readdirSync(s, { withFileTypes: true })) {
    if (item.name.endsWith('.ini')) continue;
    const srcPath = path.join(s, item.name);
    const destPath = path.join(d, item.name);
    if (item.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
copyDirRecursive(cozySrc, cozyDest);
console.log('Copied Cozy UI Pack -> public/assets/cozy-ui');

// Re-pad the coin so its art fills the canvas. Stdlib Python, no dependencies;
// if python3 is not on this machine the copy above still works, it just leaves
// the coin small, so the failure is a warning rather than a hard stop.
try {
  execFileSync(
    'python3',
    ['scripts/normalize_icon_padding.py', 'public/assets/ui/icon_coin.png'],
    { stdio: 'inherit' }
  );
} catch (error) {
  console.warn(
    'Warning: could not re-pad ui/icon_coin.png — run ' +
      '`python3 scripts/normalize_icon_padding.py public/assets/ui/icon_coin.png` by hand.'
  );
}

console.log('Finished setting up public assets.');
