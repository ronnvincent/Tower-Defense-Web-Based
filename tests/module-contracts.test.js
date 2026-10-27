import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { EconomyManager } from '../src/systems/EconomyManager.js';
import { GameStateManager } from '../src/systems/GameStateManager.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import { Tower } from '../src/entities/Tower.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';

/**
 * Module contract tests (sibling of `ui-contracts.test.js`).
 *
 * Refactors in this project repeatedly delete or rename a method that another
 * module still calls (`pathfinding.tryBlockCell`, `hud.showBossBar`), and the
 * failure only shows up at runtime inside Phaser's step(). These tests grep the
 * real call sites and assert the receiving class still implements them.
 */

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Drop comments (and only comments) before grepping call sites.
 *
 * The receiver patterns below are deliberately loose — `wall`, `tower`,
 * `barricade` — so a plain-English comment such as "the horde dodges the
 * wall. if it can" reads as a `wall.if(...)` call and fails the contract with
 * a method that never existed. Quoted strings are preserved, so real calls
 * inside template literals still count.
 */
function stripComments(code) {
  let out = '';
  let mode = null; // null | "'" | '"' | '`' | 'line' | 'block'
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (mode === 'line') {
      if (ch === '\n') {
        mode = null;
        out += ch;
      }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        mode = null;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode) {
      out += ch;
      if (ch === '\\') {
        out += code[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === mode) mode = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      mode = 'line';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = 'block';
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') mode = ch;
    out += ch;
    i += 1;
  }
  return out;
}

const sources = walk('src')
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }));

function collectCalls(receiverPattern) {
  const regex = new RegExp(`(?:${receiverPattern})\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\??\\(`, 'g');
  const found = new Map();
  for (const { file, code } of sources) {
    for (const match of code.matchAll(regex)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
  }
  return found;
}

const methodsOf = (Class) =>
  new Set(Object.getOwnPropertyNames(Class.prototype).filter((name) => name !== 'constructor'));
const fieldsOrMethodsOf = (Class) =>
  new Set([
    ...methodsOf(Class),
    ...Object.getOwnPropertyNames(Class.prototype).filter((n) => n.startsWith('get ') || n.startsWith('set ')),
  ].map((n) => n.replace(/^(get|set) /, '')));

function expectAllExist(calls, Class, label) {
  const methods = fieldsOrMethodsOf(Class);
  const missing = [...calls.entries()].filter(([name]) => !methods.has(name));
  expect(
    missing.map(([name, file]) => `${label}.${name} (called from ${file})`),
    `Missing ${label} members`
  ).toEqual([]);
}

describe('Module contracts: GameScene -> systems', () => {
  it('every PathfindingSystem member GameScene uses exists', () => {
    expectAllExist(collectCalls('this\\.pathfinding'), PathfindingSystem, 'PathfindingSystem');
  });

  it('every PlacementSystem member GameScene/HUD use exists', () => {
    expectAllExist(collectCalls('this\\.placement'), PlacementSystem, 'PlacementSystem');
  });

  it('every EconomyManager member exists', () => {
    expectAllExist(collectCalls('this\\.economy'), EconomyManager, 'EconomyManager');
  });

  it('every GameStateManager member exists', () => {
    expectAllExist(collectCalls('this\\.gameState'), GameStateManager, 'GameStateManager');
  });

  it('every WaveManager member exists', () => {
    expectAllExist(collectCalls('this\\.waveManager'), WaveManager, 'WaveManager');
  });

  it('does not call the removed BFS barricade API any more', () => {
    const pf = collectCalls('this\\.pathfinding');
    expect(pf.has('tryBlockCell')).toBe(false);
    expect(pf.has('unblockCell')).toBe(false);
    expect(pf.has('computeMainPath')).toBe(true);
  });
});

describe('Module contracts: entities', () => {
  it('GameScene only calls Tower members that exist', () => {
    expectAllExist(collectCalls('(?:(?:this\\.)?tower|barricade|wall)'), Tower, 'Tower');
  });

  it('exposes the palisade hit-point API used by the siege flow', () => {
    for (const name of ['takeDamage', 'updateHealthBar', 'flashHit', 'setBuffs']) {
      expect(typeof Tower.prototype[name], name).toBe('function');
    }
  });

  it('exposes the palisade siege API used by GameScene callbacks', () => {
    for (const name of ['getStructureAhead', 'updateSiege', 'getNextCellKey', 'getCurrentCellKey']) {
      expect(typeof Enemy.prototype[name], name).toBe('function');
    }
  });

  it('keeps Projectile splash gated on the splash radius, not the art type', () => {
    const code = readFileSync('src/entities/Projectile.js', 'utf8');
    expect(code).toContain('if (this.stats.splash > 0) {');
    expect(code).not.toContain("this.type === 'cannonball' && this.stats.splash > 0");
    // The falloff distance must actually be forwarded to the damage formula.
    expect(code).toContain('splashRadius: this.stats.splash');
    expect(typeof Projectile.prototype.impact).toBe('function');
  });
});
