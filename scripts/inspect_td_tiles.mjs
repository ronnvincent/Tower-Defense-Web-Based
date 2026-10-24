import fs from 'fs';

let html = '<html><body style="background:#222;color:#fff;display:flex;flex-wrap:wrap;gap:10px;">';
for (let i = 200; i <= 299; i++) {
  const name = 'towerDefense_tile' + String(i).padStart(3, '0') + '.png';
  html += `<div style="text-align:center;border:1px solid #444;padding:4px;"><img src="../src/assets/kenney_tower-defense-top-down/PNG/Default%20size/${name}" width="64" height="64"/><br>${i}</div>`;
}
html += '</body></html>';
fs.writeFileSync('scripts/preview_tiles_200_299.html', html);
console.log('Written scripts/preview_tiles_200_299.html');
