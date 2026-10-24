import fs from 'fs';
import path from 'path';

function getPngDimensions(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const sheetPath = path.resolve('src/assets/kenney_tower-defense-top-down/Tilesheet/towerDefense_tilesheet.png');
const buf = fs.readFileSync(sheetPath);
const { width, height } = getPngDimensions(buf);
console.log('Tilesheet size:', width, 'x', height);
console.log('Tiles count:', (width / 64), 'cols x', (height / 64), 'rows =', (width / 64) * (height / 64));
