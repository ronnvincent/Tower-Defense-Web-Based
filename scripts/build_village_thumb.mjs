#!/usr/bin/env node
/**
 * build_village_thumb.mjs — the world-map thumbnail for Havenbrook.
 *
 * The other battlefield thumbnails are painted by the Python art builders from
 * an ASCII block copied out of the map data. Havenbrook's board is *generated*
 * from `HAVENBROOK_LANES`, so copying it would be a second source of truth that
 * drifts the first time a street moves. This script reads the board from the
 * game's own module and paints it with the village palette instead.
 *
 * Colours are the mean of the generated tiles, so the thumbnail can never claim
 * a greener village than the one the player lands in.
 *
 *   node scripts/build_village_thumb.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { HAVENBROOK_LAYOUT } from '../src/data/mapData.js';

const CELL = 6;
const OUT = 'public/assets/ui/map_village.png';

/** Mean colour of a generated tile, ignoring fully transparent pixels. */
const PALETTE = {
  grass: [0x45, 0x7d, 0x3e],
  road: [0x9a, 0x8d, 0x74],
  water: [0x25, 0x66, 0x68],
  rock: [0x6b, 0x5f, 0x4c],
  foliage: [0x5c, 0x99, 0x4c],
  spawn: [0xc9, 0x8a, 0x4a],
  base: [0xf5, 0xc4, 0x51],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tag, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(tag, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, crc]);
}

function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const rows = HAVENBROOK_LAYOUT.length;
const cols = HAVENBROOK_LAYOUT[0].length;
const width = cols * CELL;
const height = rows * CELL;
const pixels = Buffer.alloc(width * height * 4);

const colourFor = (ch, r, c) => {
  if (ch === 'S') return PALETTE.spawn;
  if (ch === 'B') return PALETTE.base;
  if (ch === '#') return PALETTE.road;
  if (ch === '~') return PALETTE.water;
  if (ch === 'x') return PALETTE.rock;
  // A sprinkle of the landmark tree so the meadow is not a flat field.
  return (r * 7 + c * 13) % 11 === 0 ? PALETTE.foliage : PALETTE.grass;
};

for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    const base = colourFor(HAVENBROOK_LAYOUT[r][c], r, c);
    const shade = (r + c) % 2 ? 1 : 0.94;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const i = ((r * CELL + y) * width + (c * CELL + x)) * 4;
        pixels[i] = Math.min(255, Math.round(base[0] * shade));
        pixels[i + 1] = Math.min(255, Math.round(base[1] * shade));
        pixels[i + 2] = Math.min(255, Math.round(base[2] * shade));
        pixels[i + 3] = 255;
      }
    }
  }
}

writeFileSync(OUT, encodePng(width, height, pixels));
console.log(`map_village.png ${width}x${height} from the live havenbrook board`);
