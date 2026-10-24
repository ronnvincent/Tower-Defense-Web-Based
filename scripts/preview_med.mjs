import fs from 'fs';
import path from 'path';

const medDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size');
let html = `<!DOCTYPE html><html><head><style>
body { background: #222; color: #fff; font-family: sans-serif; }
.section { margin-bottom: 24px; }
.grid { display: flex; flex-wrap: wrap; gap: 8px; }
.card { display: flex; flex-direction: column; align-items: center; border: 1px solid #444; padding: 4px; background: #333; width: 80px; }
.card img { max-width: 64px; max-height: 64px; }
.card span { font-size: 10px; margin-top: 4px; color: #aaa; text-align: center; }
</style></head><body><h1>Kenney Medieval RTS Assets</h1>`;

['Tile', 'Structure', 'Environment', 'Unit'].forEach(cat => {
  const p = path.join(medDir, cat);
  if (!fs.existsSync(p)) return;
  const files = fs.readdirSync(p).filter(f => f.endsWith('.png'));
  html += `<div class="section"><h2>${cat} (${files.length})</h2><div class="grid">`;
  files.forEach(f => {
    const rel = `../src/assets/kenney_medieval-rts/PNG/Default%20size/${cat}/${f}`;
    html += `<div class="card"><img src="${rel}"><span>${f}</span></div>`;
  });
  html += `</div></div>`;
});

html += `</body></html>`;
fs.writeFileSync('scripts/preview_medieval.html', html);
console.log('Generated scripts/preview_medieval.html');
