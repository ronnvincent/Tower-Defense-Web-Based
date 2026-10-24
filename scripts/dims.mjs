import fs from 'fs';
import path from 'path';

function getPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at byte 12: width at 16, height at 20 (big-endian 32-bit int)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');
const files = fs.readdirSync(tdDir).filter(f => f.endsWith('.png'));

const bySize = {};
files.forEach(f => {
  const buf = fs.readFileSync(path.join(tdDir, f));
  const dim = getPngDimensions(buf);
  if (dim) {
    const k = `${dim.width}x${dim.height}`;
    bySize[k] = (bySize[k] || []);
    bySize[k].push(f);
  }
});

for (const [dim, list] of Object.entries(bySize)) {
  console.log(`${dim}: ${list.length} files. (e.g. ${list.slice(0, 5).join(', ')} ... ${list.slice(-3).join(', ')})`);
}
