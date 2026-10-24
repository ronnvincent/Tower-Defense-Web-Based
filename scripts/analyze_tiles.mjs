import fs from 'fs';
import path from 'path';

// Let's check files in Default size and medieval RTS
const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');
const files = fs.readdirSync(tdDir).filter(f => f.endsWith('.png'));

// Create an HTML gallery so we can see every sprite and its ID
let html = `<!DOCTYPE html><html><head><style>
body { background: #222; color: #fff; font-family: sans-serif; }
.grid { display: flex; flex-wrap: wrap; gap: 8px; }
.card { display: flex; flex-direction: column; align-items: center; border: 1px solid #444; padding: 4px; background: #333; width: 80px; }
.card img { width: 64px; height: 64px; image-rendering: pixelated; }
.card span { font-size: 10px; margin-top: 4px; color: #aaa; }
</style></head><body><h1>Kenney Tower Defense Tiles</h1><div class="grid">`;

files.forEach(f => {
  const rel = `../src/assets/kenney_tower-defense-top-down/PNG/Default%20size/${f}`;
  const num = f.replace('towerDefense_tile', '').replace('.png', '');
  html += `<div class="card"><img src="${rel}"><span>${num}</span></div>`;
});

html += `</div></body></html>`;

fs.writeFileSync('scripts/preview_td.html', html);
console.log('Generated scripts/preview_td.html for', files.length, 'tiles.');
