import fs from 'fs';
import path from 'path';

const aDir = path.resolve('src/assets/kenney_impact-sounds/Audio');
const files = fs.readdirSync(aDir);
console.log('Audio file types:', [...new Set(files.map(f => path.extname(f)))]);

const prefixes = {};
files.forEach(f => {
  const p = f.split('_')[0];
  prefixes[p] = (prefixes[p] || 0) + 1;
});
console.log('Audio sound prefixes:', prefixes);
