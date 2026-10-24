import fs from 'fs';
import path from 'path';

// Let's find:
// 1. Water tile
// 2. Barricade in Medieval RTS
// 3. Enemies in TD and Medieval RTS and Slime

const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');
const medDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size');

// Let's check medieval environment files for palisade / barricade
console.log('Medieval Environment files:');
fs.readdirSync(path.join(medDir, 'Environment')).forEach(f => {
  console.log(f);
});

// Let's check medieval units
console.log('Medieval Units:');
fs.readdirSync(path.join(medDir, 'Unit')).forEach(f => {
  console.log(f);
});
