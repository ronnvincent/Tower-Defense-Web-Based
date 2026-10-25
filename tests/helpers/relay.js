/**
 * tests/helpers/relay.js — a real duel relay, as a child process.
 *
 * Shared by the socket tests so they exercise the same binary a deploy runs,
 * not a stubbed version of it. `PVP_PENDING_MS` is shortened so a "no room"
 * refusal does not cost fifteen seconds per test.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const RELAY_ENTRY = resolve(process.cwd(), 'server/pvp-relay.mjs');

/** A port nobody else is holding. */
export function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

export async function waitFor(predicate, timeout = 4000, message = () => 'condition never became true') {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeout) throw new Error(message());
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}

export async function startRelay(port, env = {}) {
  const child = spawn(process.execPath, [RELAY_ENTRY], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PVP_PENDING_MS: '150', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });
  await waitFor(() => log.includes('listening on'), 5000, () => `relay did not start:\n${log}`);
  return {
    child,
    get log() {
      return log;
    },
    stop() {
      return new Promise((resolveStop) => {
        if (child.exitCode !== null) return resolveStop();
        child.once('exit', () => resolveStop());
        child.kill('SIGKILL');
      });
    },
  };
}

export const relayUrl = (port) => `ws://127.0.0.1:${port}/pvp`;
