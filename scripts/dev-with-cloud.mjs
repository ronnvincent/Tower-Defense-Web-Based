#!/usr/bin/env node
/**
 * dev-with-cloud.mjs — `npm run dev:cloud`.
 *
 * The page talks to `/supabase-dev`, which Vite proxies to the local ledger
 * stand-in. Two terminals is a papercut, so this runs both: the stand-in, then
 * Vite with whatever extra args were passed (`npm run dev:cloud -- --port 4300`).
 * Either process exiting brings the other down, so no orphaned server keeps a
 * stale port.
 *
 * This is for local work only. A deployed build reads VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY and talks to the real Supabase project instead.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const viteBin = 'node_modules/vite/bin/vite.js';

if (!existsSync(viteBin)) {
  console.error('[dev:cloud] Run `npm install` first — node_modules/vite is missing.');
  process.exit(1);
}

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

const ledger = spawn(process.execPath, ['server/cloud-dev.mjs'], { stdio: 'inherit', env: process.env });
children.push(ledger);

const vite = spawn(process.execPath, [viteBin, ...args], { stdio: 'inherit', env: process.env });
children.push(vite);

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.log(`[dev:cloud] ${signal ? 'signalled' : 'exited'} (${signal || code}) — shutting the other down`);
    stop(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
