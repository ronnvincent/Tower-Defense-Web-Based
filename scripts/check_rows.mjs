function getTile(row, col) {
  const num = row * 23 + col + 1;
  return `towerDefense_tile${String(num).padStart(3, '0')}.png`;
}

console.log('Row 10:');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(10, c));

console.log('Row 11:');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(11, c));

console.log('Row 12:');
for (let c = 10; c <= 18; c++) console.log(`col ${c}:`, getTile(12, c));
