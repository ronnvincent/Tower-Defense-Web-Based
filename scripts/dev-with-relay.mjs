#!/usr/bin/env node
/**
 * dev-with-relay.mjs — `npm run pvp:dev`.
 *
 * Two-device duels need the relay listening next to the server that serves the
 * page (Vite proxies `/pvp` to it). Two terminals is a papercut, so this runs
 * both: the relay, then Vite with whatever extra args were passed
 * (`npm run pvp:dev -- --port 4300`). Either process exiting brings the other
 * down, so no orphaned relay keeps a stale port.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const viteBin = 'node_modules/vite/bin/vite.js';

const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 120);
}

// `ws` is a devDependency: if node_modules is missing, say so instead of
// letting the relay crash with a stack trace.
if (!existsSync(viteBin)) {
  console.error('[dev] Run `npm install` first — node_modules/vite is missing.');
  process.exit(1);
}

const relay = spawn(process.execPath, ['server/pvp-relay.mjs'], { stdio: 'inherit', env: process.env });
children.push(relay);

const vite = spawn(process.execPath, [viteBin, ...args], { stdio: 'inherit', env: process.env });
children.push(vite);

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.log(`[dev] ${signal ? 'signalled' : 'exited'} (${signal || code}) — shutting the other down`);
    stop(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
