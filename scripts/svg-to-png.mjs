/**
 * Rasterise a flat vector asset for the game.
 *
 * The OpenGameArt building packs ship as bare SVGs with `width="128"` and no
 * viewBox, so scaling the page does nothing. This measures the real drawing box
 * with `getBBox()`, sets it as the viewBox, sizes the element to the requested
 * width and screenshots it with a transparent background — a clean, lossless
 * rasterisation of a vector source (no resampling artefacts, no blur).
 *
 * Usage:
 *   node scripts/svg-to-png.mjs <in.svg> <out.png> <width> [padFraction]
 *
 * Requires the sandbox Chromium used by the screenshot harness; pass
 * `CHROME_PATH` (default `/tmp/chrome/chromium`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteerPath = process.env.PUPPETEER_CORE || '/tmp/browser/node_modules/puppeteer-core';
const puppeteer = require(puppeteerPath);

const [inPath, outPath, widthArg, padArg] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node scripts/svg-to-png.mjs <in.svg> <out.png> <width> [pad]');
  process.exit(2);
}
const raw = fs.readFileSync(inPath, 'utf8');
const width = Number(widthArg) || 512;
const pad = Number(padArg) || 0.02;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/tmp/chrome/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${raw}</body></html>`,
    { waitUntil: 'load' }
  );
  const box = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    if (!svg) return null;
    const b = svg.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  if (!box || !box.w || !box.h) throw new Error(`${inPath}: nothing to draw`);

  const padX = box.w * pad;
  const padY = box.h * pad;
  const vb = `${box.x - padX} ${box.y - padY} ${box.w + padX * 2} ${box.h + padY * 2}`;
  const outW = Math.round(width);
  const outH = Math.round((width * (box.h + padY * 2)) / (box.w + padX * 2));

  await page.evaluate(
    ({ vb, outW, outH }) => {
      const svg = document.querySelector('svg');
      svg.setAttribute('viewBox', vb);
      svg.setAttribute('width', String(outW));
      svg.setAttribute('height', String(outH));
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    },
    { vb, outW, outH }
  );
  await page.setViewport({ width: outW, height: outH, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 250));
  const el = await page.$('svg');
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  await el.screenshot({ path: outPath, omitBackground: true });
  fs.writeSync(1, `wrote ${outPath} ${outW}x${outH}\n`);
} finally {
  await browser.close();
}
