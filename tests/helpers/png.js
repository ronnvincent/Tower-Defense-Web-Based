import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/**
 * Read an 8-bit RGBA PNG and return its binary alpha silhouette.
 *
 * Tests need more than a file's dimensions to prove an art change is real: a
 * recolour keeps the exact silhouette, so two "different" sprites would have
 * identical masks. Decoding the alpha channel is the cheapest way to assert
 * that a new tier (or a new line) actually changed shape, which is the rule the
 * project keeps coming back to.
 *
 * Only colour type 6 (RGBA) at bit depth 8, non-interlaced — what Pillow writes
 * for every sprite in `public/assets` — is accepted; anything else throws rather
 * than silently returning a wrong mask.
 */
export function readPngAlpha(path, { threshold = 24 } = {}) {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${path}: not a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`${path}: expected RGBA8, non-interlaced (got depth ${bitDepth}, type ${colorType}, interlace ${interlace})`);
  }

  const chunks = [];
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));

  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? line[x - bpp] : 0;
      const above = previous[x];
      const upLeft = x >= bpp ? previous[x - bpp] : 0;
      let value;
      switch (filter) {
        case 0:
          value = source[x];
          break;
        case 1:
          value = source[x] + left;
          break;
        case 2:
          value = source[x] + above;
          break;
        case 3:
          value = source[x] + ((left + above) >> 1);
          break;
        case 4: {
          const estimate = left + above - upLeft;
          const da = Math.abs(estimate - left);
          const db = Math.abs(estimate - above);
          const dc = Math.abs(estimate - upLeft);
          value = source[x] + (da <= db && da <= dc ? left : db <= dc ? above : upLeft);
          break;
        }
        default:
          throw new Error(`${path}: unknown row filter ${filter}`);
      }
      line[x] = value & 0xff;
    }
    line.copy(pixels, y * stride);
    previous = line;
  }

  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < width * height; index += 1) {
    alpha[index] = pixels[index * 4 + 3] > threshold ? 1 : 0;
  }
  return { width, height, alpha };
}

/**
 * Fraction of pixels whose opacity differs between two sprites.
 *
 * Sprites of different sizes are compared on their top-left grid, clipped to
 * the smaller canvas, which is enough to prove the silhouettes differ.
 */
export function silhouetteDifference(a, b) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  let differing = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (a.alpha[y * a.width + x] !== b.alpha[y * b.width + x]) differing += 1;
    }
  }
  const union = Math.max(a.width * a.height, b.width * b.height);
  return differing / union;
}

/**
 * Fraction of ink that differs between two sprites, anchored the way the game
 * anchors them: bottom-centre on the tile's ground line.
 *
 * `silhouetteDifference` compares from the top-left corner, which is fine for
 * same-size sprites but wrong for towers of different widths (the transparent
 * margin would eat the whole difference). Towers hang from a shared ground line,
 * so that is where the comparison starts. `band` limits the rows measured to
 * the top fraction of the taller canvas — the crown is where a line's identity
 * lives, while the straight stone shaft below it is deliberately shared.
 */
export function silhouetteDifferenceAnchored(a, b, { band = 1 } = {}) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const ax = Math.floor((width - a.width) / 2);
  const bx = Math.floor((width - b.width) / 2);
  const ay = height - a.height;
  const by = height - b.height;
  const rows = Math.max(1, Math.round(height * band));
  let differing = 0;
  let ink = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const av = y >= ay ? a.alpha[(y - ay) * a.width + (x - ax)] : 0;
      const bv = y >= by ? b.alpha[(y - by) * b.width + (x - bx)] : 0;
      if (!av && !bv) continue;
      ink += 1;
      if (av !== bv) differing += 1;
    }
  }
  return ink === 0 ? 0 : differing / ink;
}
