import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('src/assets/kenney_tower-defense-top-down/Vector/towerDefense_vector.svg');
const content = fs.readFileSync(svgPath, 'utf8');
const ids = content.match(/id="([^"]+)"/g) || [];
console.log('Total IDs found in SVG:', ids.length);
console.log('Sample IDs:', ids.slice(0, 30));
