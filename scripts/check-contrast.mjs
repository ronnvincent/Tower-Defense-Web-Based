#!/usr/bin/env node
/**
 * WCAG 2.1 contrast audit for the HUD palette.
 *
 * The backgrounds below are the *measured average colours* of the Cozy UI Pack
 * sprites that actually sit behind the text (sampled from the PNGs in
 * public/assets/cozy-ui). That is why this script caught real bugs the old
 * palette shipped with, e.g. `--text-muted` (#b0a08a) on parchment 1.56:1 and
 * gold `#f5c451` on the wooden modal header 1.43:1.
 *
 * Usage: npm run check:contrast
 * Exits 1 if any pair drops below its target ratio.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'style.css'), 'utf8');

/** Parse `--token: #rrggbb;` declarations out of :root. */
function readTokens(source) {
  const tokens = {};
  const re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  let match;
  while ((match = re.exec(source))) tokens[match[1]] = match[2].toLowerCase();
  return tokens;
}

const tokens = readTokens(css);

/** Backgrounds sampled from the actual sprite fills (see header). */
const SURFACES = {
  wood: '#dd9a79',
  parchment: '#faf2e6',
  slate: '#d9d2d3',
  slot: '#a14e3f',
  crimson: '#f65d63',
  bgDeep: tokens['bg-deep'],
  bgGlass: '#0d141a', // codex drawer gradient midpoint
  cream: '#fffeeb', // CardRegular / ItemSlotSelected
};

const toLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, surface, minimum ratio, where it is used] */
const PAIRS = [
  ['ink-strong', 'wood', 4.5, 'HUD stat values, modal headings, menu title'],
  ['ink', 'wood', 4.5, 'modal body copy, button labels'],
  ['ink-muted', 'wood', 4.5, 'secondary labels on wood'],
  ['ink-gold', 'wood', 4.5, 'gold accents on wood (costs, menu subtitle)'],
  ['ink-strong', 'parchment', 4.5, 'toast text, result summary'],
  ['ink', 'parchment', 4.5, 'toast text'],
  ['ink-muted', 'parchment', 4.5, 'result labels'],
  ['ink-gold', 'parchment', 4.5, 'result gold values'],
  ['ink-cyan', 'parchment', 4.5, 'info accent on the note card'],
  ['ink-red', 'parchment', 4.5, 'defeat accent on the note card'],
  ['ink-green', 'parchment', 4.5, 'victory accent on the note card'],
  ['ink-strong', 'slate', 4.5, 'leaderboard rows'],
  ['ink', 'slate', 4.5, 'leaderboard rows'],
  ['ink-muted', 'slate', 4.5, 'empty table / meta'],
  ['ink-gold', 'slate', 4.5, 'telemetry section titles'],
  ['ink-cyan', 'slate', 4.5, 'DSALGO notice'],
  ['ink-strong', 'crimson', 4.5, 'boss banner name and sell button'],
  ['ink', 'crimson', 4.5, 'boss ability line'],
  ['slot-muted', 'slot', 4.5, 'stat chip labels (BASE / GOLD / DAMAGE)'],
  ['slot-text', 'slot', 4.5, 'stat chip values'],
  ['ink-strong', 'cream', 4.5, 'dock card names, wave badge'],
  ['ink-gold', 'cream', 4.5, 'dock card prices'],
  ['text-main', 'bgDeep', 4.5, 'HUD text on the dark backdrop'],
  ['text-muted', 'bgDeep', 4.5, 'secondary HUD text'],
  ['text-dim', 'bgDeep', 4.5, 'tertiary HUD text'],
  ['text-main', 'bgGlass', 4.5, 'codex drawer body'],
  ['text-muted', 'bgGlass', 4.5, 'codex drawer descriptions'],
  ['text-dim', 'bgGlass', 4.5, 'codex drawer footnote'],
  ['gold-primary', 'bgGlass', 4.5, 'codex headings'],
  ['cyan-primary', 'bgGlass', 4.5, 'live telemetry values'],
];

let failures = 0;
const rows = [];

for (const [fgName, bgName, min, where] of PAIRS) {
  const fg = tokens[fgName];
  const bg = SURFACES[bgName];
  if (!fg) {
    failures += 1;
    rows.push(`  ✗ MISSING TOKEN --${fgName}`);
    continue;
  }
  if (!bg) {
    failures += 1;
    rows.push(`  ✗ MISSING SURFACE ${bgName}`);
    continue;
  }
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failures += 1;
  rows.push(
    `  ${ok ? '✓' : '✗'} ${String(ratio.toFixed(2)).padStart(5)}:1  ` +
      `${`${fgName} on ${bgName}`.padEnd(34)} ${where}`
  );
}

console.log('\nWCAG 2.1 contrast audit — HUD + panels\n');
console.log(rows.join('\n'));
console.log(
  `\n${PAIRS.length - failures}/${PAIRS.length} pairs pass ` +
    '(normal text requires 4.5:1)\n'
);

if (failures > 0) {
  console.error(`${failures} contrast pair(s) below target.`);
  process.exit(1);
}
