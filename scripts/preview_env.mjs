import fs from 'fs';
import path from 'path';

// Let's check which environment files in Medieval RTS are barricades/palisades, trees, rocks
const envDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size/Environment');
const files = fs.readdirSync(envDir).filter(f => f.endsWith('.png'));

// Let's generate an HTML preview
let html = `<!DOCTYPE html><html><body style="background:#222;color:#fff;">`;
files.forEach(f => {
  html += `<div style="display:inline-block;margin:6px;text-align:center;"><img src="../src/assets/kenney_medieval-rts/PNG/Default size/Environment/${f}" style="background:#444;"><br><small>${f}</small></div>`;
});
html += `</body></html>`;
fs.writeFileSync('scripts/preview_env.html', html);
console.log('Written preview_env.html');
