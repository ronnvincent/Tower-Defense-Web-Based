import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HUD } from '../src/ui/HUD.js';
import { StatisticsPanel } from '../src/ui/StatisticsPanel.js';
import { LeaderboardUI } from '../src/ui/LeaderboardUI.js';
import { AudioSynth } from '../src/rendering/AudioSynth.js';

/**
 * Cross-module API contract tests.
 *
 * The wave-3 freeze was caused by GameScene calling `hud.showBossBar(enemy)`
 * while HUD only exposed `showBossBanner`. The TypeError bubbled out of
 * Phaser's step(), the next requestAnimationFrame was never scheduled, and the
 * game locked up the instant the first boss spawned.
 *
 * These tests parse the real call sites in src/ and assert every method they
 * use actually exists on the class that receives them, so a rename can never
 * silently brick the game again.
 */

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk('src')
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, code: readFileSync(file, 'utf8') }));

/** Collect `receiver.method(` / `receiver?.method?.(` names from every source file. */
function collectCalls(receiverPattern) {
  const regex = new RegExp(`(?:${receiverPattern})\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\??\\(`, 'g');
  const found = new Map();
  for (const { file, code } of sources) {
    for (const match of code.matchAll(regex)) {
      const name = match[1];
      if (!found.has(name)) found.set(name, file);
    }
  }
  return found;
}

const methodsOf = (Class) =>
  new Set(Object.getOwnPropertyNames(Class.prototype).filter((name) => name !== 'constructor'));

function expectAllExist(calls, Class, label) {
  const methods = methodsOf(Class);
  const missing = [...calls.entries()].filter(([name]) => !methods.has(name));
  expect(
    missing.map(([name, file]) => `${label}.${name} (called from ${file})`),
    `Missing ${label} methods`
  ).toEqual([]);
}

describe('UI contract: GameScene -> HUD', () => {
  const calls = collectCalls('(?:this\\.)?hud|window\\.gameHUD');

  it('finds the call sites at all (guards against a broken regex)', () => {
    expect(calls.size).toBeGreaterThan(5);
    expect(calls.has('showToast')).toBe(true);
  });

  it('every HUD method called anywhere in src/ exists', () => {
    expectAllExist(calls, HUD, 'HUD');
  });

  it('exposes the boss-banner API GameScene calls on boss spawn', () => {
    expect(typeof HUD.prototype.showBossBar).toBe('function');
    expect(typeof HUD.prototype.updateBossBar).toBe('function');
    expect(typeof HUD.prototype.hideBossBar).toBe('function');
    expect(typeof HUD.prototype.showBossBanner).toBe('function');
  });
});

describe('UI contract: codex + leaderboard', () => {
  it('every StatisticsPanel method called in src/ exists', () => {
    expectAllExist(collectCalls('(?:window\\.)?gameCodex'), StatisticsPanel, 'StatisticsPanel');
  });

  it('every LeaderboardUI method called in src/ exists', () => {
    expectAllExist(collectCalls('(?:window\\.)?gameLeaderboardUI'), LeaderboardUI, 'LeaderboardUI');
  });
});

describe('UI contract: audio', () => {
  it('every audio effect called in src/ exists on AudioSynth', () => {
    expectAllExist(collectCalls('audio'), AudioSynth, 'AudioSynth');
  });
});
