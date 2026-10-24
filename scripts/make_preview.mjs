import fs from 'fs';
import path from 'path';

const base = path.resolve('public/assets/cozy-ui');
function listImgs(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) res = res.concat(listImgs(full));
    else if (f.name.endsWith('.png')) res.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return res;
}

const imgs = listImgs(base);
console.log('Total Cozy UI PNGs:', imgs.length);

let html = `<!DOCTYPE html><html><body style="background:#1a1d24;color:#fff;font-family:sans-serif;display:flex;flex-wrap:wrap;gap:16px;padding:24px;">`;
for (const img of imgs) {
  html += `
    <div style="background:#262b36;border:1px solid #3c4456;border-radius:8px;padding:12px;text-align:center;width:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <img src="/assets/cozy-ui/${img}" style="max-width:140px;max-height:90px;object-fit:contain;" />
      <div style="font-size:11px;color:#a0aec0;margin-top:8px;word-break:break-all;">${img}</div>
    </div>
  `;
}
html += `</body></html>`;
fs.writeFileSync(path.resolve('public/cozy_preview.html'), html);
console.log('Generated public/cozy_preview.html successfully!');
