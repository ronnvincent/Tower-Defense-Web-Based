/**
 * build-offline-manifest.mjs — the list the offline vault warms itself from.
 *
 * The service worker (`public/sw.js`) caches whatever the game happens to ask
 * for, which covers everything a player has already seen. It cannot know about
 * the assets of a level they have not opened yet — that is exactly the hole
 * that makes "works offline" a half-truth. This script closes it: after a
 * production build it walks `dist/` and writes the complete file list next to
 * the build, so the page can hand the worker the full set on request.
 *
 * The manifest is deliberately dumb JSON — no hashes of its own, no version
 * negotiation — because the files it names are already content-addressed by
 * Vite. A rebuild produces a new list, and the worker fetches anything in it
 * that is not in its cache yet.
 *
 * Run by `npm run build`; safe to run twice.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const OUT = join(DIST, 'offline-manifest.json');

/** Never cached: the worker itself, debug pages, and source maps. */
const SKIP = new Set(['sw.js', 'cozy_preview.html']);
const SKIP_EXT = ['.map'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(DIST, full).split(sep).join(posix.sep);
    if (SKIP.has(rel)) continue;
    if (SKIP_EXT.some((ext) => rel.endsWith(ext))) continue;
    out.push({ url: `/${rel}`, size: statSync(full).size });
  }
  return out;
}

const files = walk(DIST).sort((a, b) => a.url.localeCompare(b.url));

if (!files.length) {
  console.error('offline-manifest: dist/ is empty — did the build run?');
  process.exit(1);
}

const bytes = files.reduce((total, file) => total + file.size, 0);
const manifest = {
  files: files.map((file) => file.url),
  count: files.length,
  bytes,
};

writeFileSync(OUT, `${JSON.stringify(manifest)}\n`);

/** Group the list so the log says something a human can act on. */
const groups = new Map();
for (const file of files) {
  const parts = file.url.split('/').filter(Boolean);
  const key = parts[0] === 'assets' ? `assets/${parts[1] ?? ''}` : parts[0];
  const entry = groups.get(key) || { count: 0, bytes: 0 };
  entry.count += 1;
  entry.bytes += file.size;
  groups.set(key, entry);
}
const mb = (value) => `${(value / 1048576).toFixed(1)} MB`;
console.log(`offline-manifest: ${manifest.count} files, ${mb(manifest.bytes)}`);
for (const [key, entry] of [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6)) {
  console.log(`  ${key.padEnd(20)} ${String(entry.count).padStart(5)} files  ${mb(entry.bytes)}`);
}
