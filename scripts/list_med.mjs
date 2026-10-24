import fs from 'fs';
import path from 'path';

const medDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size');
['Environment', 'Structure', 'Tile', 'Unit'].forEach(folder => {
  const p = path.join(medDir, folder);
  const files = fs.readdirSync(p).filter(f => f.endsWith('.png'));
  console.log(`\n--- ${folder} (${files.length} files) ---`);
  files.forEach(f => {
    const stat = fs.statSync(path.join(p, f));
    console.log(`${f} (${stat.size} bytes)`);
  });
});
