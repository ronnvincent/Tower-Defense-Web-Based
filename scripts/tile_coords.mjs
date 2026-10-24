// 23 columns per row, 1-indexed tile numbering: tileNum = row * 23 + col + 1
// row = Math.floor((tileNum - 1) / 23)
// col = (tileNum - 1) % 23

function getTile(row, col) {
  const num = row * 23 + col + 1;
  return `towerDefense_tile${String(num).padStart(3, '0')}.png`;
}

console.log('Row 3 (Trees, Rocks, Bushes):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(3, c));

console.log('\nRow 4 (Straight road pieces, plain grass/dirt/sand/water):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(4, c));

console.log('\nRow 5 (Tower bases):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(5, c));

console.log('\nRow 6 (Turrets):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(6, c));

console.log('\nRow 7 (Upgrade barrels):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(7, c));

console.log('\nRow 8 (Enemies & Units):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(8, c));

console.log('\nRow 9 (Projectiles & Muzzle flashes):');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(9, c));
