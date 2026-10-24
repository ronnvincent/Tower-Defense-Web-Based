#!/usr/bin/env node
/**
 * WCAG 2.1 contrast audit for the HUD, menus and plates.
 *
 * The backgrounds below are the *measured average colours* of the ui-kit
 * sprites that actually sit behind the text, printed by
 * `python3 scripts/build_ui_kit.py`. That is why this script catches real bugs
 * a palette guess misses: the old wood pack shipped `--text-muted` at 1.56:1 on
 * parchment and gold `#f5c451` at 1.43:1 on the modal plate.
 *
 * Re-run the generator whenever a sprite changes and paste the new averages
 * into SURFACES — otherwise the audit keeps "passing" against art that is no
 * longer on screen.
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

/** Measured fills of public/assets/ui-kit/*.png (see the header). */
const SURFACES = {
  panel: '#1d2025', // frame_panel.png — menu card, modal, overlay shells
  panelSoft: '#13171f', // frame_panel_soft.png — tables, telemetry
  note: '#13171f', // frame_note.png — toasts, result summary
  bar: '#151a24', // frame_bar.png — HUD top bar, tower dock
  iron: '#283040', // btn_iron.png — default button
  gold: '#ddab46', // btn_gold.png — primary button (the one light plate)
  crimson: '#5f1622', // btn_crimson.png — sell / danger
  card: '#151a24', // card_iron.png — dock build cards
  cardCrimson: '#280b12', // card_crimson.png — boss banner
  slot: '#0f1219', // slot.png — stat chips, icon sockets
  slotSel: '#0f1219', // slot_sel.png — wave badge, selected card
  bgDeep: tokens['bg-deep'],
  bgGlass: '#0d141a', // codex drawer gradient midpoint
  gateCard: '#0f0c09', // darker end of the display-gate gradient
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
  // Main plate — menu, modals, overlay shells
  ['ink-strong', 'panel', 4.5, 'menu title, modal + overlay headings'],
  ['ink', 'panel', 4.5, 'modal body copy, menu tiles'],
  ['ink-muted', 'panel', 4.5, 'secondary labels, menu footnote'],
  ['ink-gold', 'panel', 4.5, 'prices, kickers, section headings'],
  ['ink-red', 'panel', 4.5, 'defeat / danger copy'],
  ['ink-green', 'panel', 4.5, 'victory copy'],
  ['ink-cyan', 'panel', 4.5, 'info accent'],

  // Soft plate — tables, leaderboard, telemetry
  ['ink-strong', 'panelSoft', 4.5, 'leaderboard rows'],
  ['ink', 'panelSoft', 4.5, 'table body'],
  ['ink-muted', 'panelSoft', 4.5, 'empty table / meta'],
  ['ink-gold', 'panelSoft', 4.5, 'telemetry section titles'],
  ['ink-cyan', 'panelSoft', 4.5, 'DSALGO notice'],

  // Note plate — toast, result summary
  ['ink-strong', 'note', 4.5, 'toast text, result summary'],
  ['ink-muted', 'note', 4.5, 'result labels'],
  ['ink-gold', 'note', 4.5, 'result gold values'],

  // Chrome bars — HUD top bar + tower dock
  ['ink-gold', 'bar', 4.5, 'dock title'],
  ['ink', 'bar', 4.5, 'dock card labels'],
  ['ink-muted', 'bar', 4.5, 'dock meta'],
  ['slot-muted', 'bar', 4.5, 'HUD stat labels'],

  // Buttons
  ['ink', 'iron', 4.5, 'default button label'],
  ['ink-strong', 'iron', 4.5, 'button label, close button'],
  ['ink-muted', 'iron', 4.5, 'disabled / secondary button label'],
  ['ink-on-gold', 'gold', 4.5, 'PLAY and every primary action'],
  ['ink-strong', 'crimson', 4.5, 'sell / danger / early-call buttons'],
  ['ink', 'crimson', 4.5, 'risk copy on the crimson plate'],

  // Cards + sockets
  ['ink', 'card', 4.5, 'dock build-card labels, menu tiles'],
  ['ink-gold', 'card', 4.5, 'build-card prices'],
  ['ink-muted', 'card', 4.5, 'build-card meta'],
  ['ink-strong', 'cardCrimson', 4.5, 'boss banner name'],
  ['ink-muted', 'cardCrimson', 4.5, 'boss ability line'],
  ['slot-text', 'slot', 4.5, 'stat chip values, menu summary'],
  ['slot-muted', 'slot', 4.5, 'stat chip labels'],
  ['ink-gold', 'slot', 4.5, 'summary numbers'],
  ['ink-strong', 'slotSel', 4.5, 'wave badge numbers'],
  ['ink-muted', 'slotSel', 4.5, 'wave badge labels'],

  // Dark glass — HUD backdrop, codex drawer
  ['text-main', 'bgDeep', 4.5, 'HUD text on the dark backdrop'],
  ['text-muted', 'bgDeep', 4.5, 'secondary HUD text'],
  ['text-dim', 'bgDeep', 4.5, 'tertiary HUD text'],
  ['text-main', 'bgGlass', 4.5, 'codex drawer body'],
  ['text-muted', 'bgGlass', 4.5, 'codex drawer descriptions'],
  ['text-dim', 'bgGlass', 4.5, 'codex drawer footnote'],
  ['gold-primary', 'bgGlass', 4.5, 'codex headings'],
  ['cyan-primary', 'bgGlass', 4.5, 'live telemetry values'],
  ['gold-primary', 'gateCard', 4.5, 'ROTATE YOUR DEVICE / ENTER FULLSCREEN titles'],
  ['text-main', 'gateCard', 4.5, 'gate body copy emphasis'],
  ['text-muted', 'gateCard', 4.5, 'gate body copy'],
  ['text-dim', 'gateCard', 4.5, 'gate footnote + "play without fullscreen" link'],
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
