import fs from 'fs';
import path from 'path';

// Let's inspect some specific tiles:
// We can check which tiles are pure green (grass), sand/dirt (road), water, etc.
// In PNG, we can read raw image data or inspect sample files.
const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');

// Let's check files around 001 - 040 (roads and grass):
console.log('Sample file sizes:');
for (let i = 1; i <= 50; i++) {
  const f = `towerDefense_tile${String(i).padStart(3, '0')}.png`;
  const stat = fs.statSync(path.join(tdDir, f));
  // Print each tile
}

// In Kenney TD:
// Tile 024 is the clean green grass tile!
// Tile 093 is road straight horizontal / vertical?
// Let's check which tiles are towers:
// Tile 180 - 230
// Tile 245 - 270 (enemies)
// Tile 295 - 299 (projectiles)
console.log('Done checking sample.');
