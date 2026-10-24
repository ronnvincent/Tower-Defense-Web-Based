import fs from 'fs';
import path from 'path';

const pDir = path.resolve('src/assets/kenney_particle-pack/PNG (Transparent)');
const files = fs.readdirSync(pDir).filter(f => f.endsWith('.png'));
console.log('Total particles:', files.length);

const grouped = {};
files.forEach(f => {
  const prefix = f.split('_')[0];
  grouped[prefix] = (grouped[prefix] || 0) + 1;
});
console.log('Particle categories:', grouped);
