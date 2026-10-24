import fs from 'fs';
import path from 'path';

// Let's inspect the tiles in Preview.png layout:
// In Preview.png:
// Rows 1-6 are terrain tiles!
// Cols 1-10 are 3x3 tilesets for different terrains:
// Top is dirt/road on grass, middle is grass on sand, etc.
// Let's write a script to sample some tiles and copy them to a test gallery.
const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');

// Let's find:
// Clean Grass:
// In Kenney TD, tile 024 is clean green grass.
// Let's check 024, 050, 093, 130, 180, 181, 203, 204, 205, 206, 245, 246, 247, 248, 249, 250
const candidates = [
  '024', '048', '049', '050',
  '093', '094', '095',
  '130', '131', '132', '133', '134', '135', '136', '137',
  '180', '181', '182', '183', '203', '204', '205', '206',
  '245', '246', '247', '248', '249', '250',
  '295', '296', '297', '298', '299'
];

for (const c of candidates) {
  const f = `towerDefense_tile${c}.png`;
  const p = path.join(tdDir, f);
  if (fs.existsSync(p)) {
    console.log(f, 'exists');
  }
}
