import fs from 'fs';
import path from 'path';

// Let's check what Kenney TD pack preview or tilesheet looks like or examine the sprites
const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');
// Let's find images that have smaller sizes or different dimensions, or let's categorize them
// Usually:
// 001 - ~100: terrain tiles (roads, grass, dirt, water, rocks)
// ~180 - ~250: towers, weapons, turrets, missiles
// ~245 - ~275: enemies (soldiers, tanks, planes)
// ~290 - 299: projectiles and effects

console.log('Sample file list:');
for (let i = 1; i <= 299; i += 10) {
  const name = `towerDefense_tile${String(i).padStart(3, '0')}.png`;
  const p = path.join(tdDir, name);
  if (fs.existsSync(p)) {
    console.log(name, fs.statSync(p).size);
  }
}
