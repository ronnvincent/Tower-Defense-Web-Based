// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

/**
 * Boss banner contract.
 *
 * GameScene's `onBossSpawn` callback calls `hud.showBossBar(enemy)`. When that
 * method did not exist, the TypeError escaped Phaser's step(), the next
 * requestAnimationFrame was never scheduled and the game froze the instant the
 * wave-3 Stone Colossus spawned. These tests pin the real DOM behaviour.
 */

const boss = (overrides = {}) => ({
  def: { name: 'Stone Colossus' },
  health: 1600,
  maxHealth: 1600,
  shield: 0,
  maxShield: 0,
  bossPhases: [{ phase: 1, name: 'Hardened Carapace' }],
  ...overrides,
});

const $ = (id) => document.getElementById(id);

let hud;

beforeEach(() => {
  document.body.innerHTML = '<div id="hud-root"></div>';
  hud = new HUD($('hud-root'));
});

describe('HUD boss banner', () => {
  it('showBossBar reveals the banner GameScene expects to exist', () => {
    expect(() => hud.showBossBar(boss())).not.toThrow();

    const banner = $('boss-banner');
    expect(banner.classList.contains('hidden')).toBe(false);
    expect($('boss-name').textContent).toBe('STONE COLOSSUS');
    expect($('boss-phase-badge').textContent).toBe('PHASE 1');
    expect($('boss-ability-text').textContent).toBe('Hardened Carapace');
    expect($('boss-hp-text').textContent).toBe('1600 / 1600 HP');
    expect($('boss-hp-bar').style.width).toBe('100%');
  });

  it('updateBossBar tracks health and shield damage', () => {
    hud.showBossBar(boss({ shield: 400, maxShield: 400 }));
    hud.updateBossBar(boss({ health: 800, shield: 200, maxShield: 400 }));

    expect($('boss-hp-bar').style.width).toBe('50%');
    expect($('boss-shield-bar').style.width).toBe('50%');
    expect($('boss-hp-text').textContent).toBe('800 / 1600 HP · shield 200');

    hud.updateBossBar(boss({ health: 400, shield: 0, maxShield: 400 }));
    expect($('boss-shield-bar').style.display).toBe('none');
    expect($('boss-hp-text').textContent).toBe('400 / 1600 HP');
  });

  it('hideBossBar hides the banner and pauses per-frame updates', () => {
    hud.showBossBar(boss());
    hud.hideBossBar();
    expect($('boss-banner').classList.contains('hidden')).toBe(true);

    hud.updateBossBar(boss({ health: 10 }));
    expect($('boss-hp-text').textContent).toBe('1600 / 1600 HP');

    expect(() => hud.hideBossBar()).not.toThrow();
  });

  it('survives an incomplete boss object (never throws mid-spawn)', () => {
    expect(() => hud.showBossBar({})).not.toThrow();
    expect($('boss-name').textContent).toBe('BOSS');
    expect($('boss-banner').classList.contains('hidden')).toBe(false);
    expect($('boss-hp-bar').style.width).toBe('0%');

    expect(() => hud.updateBossBar({})).not.toThrow();
    expect(() => hud.updateBossBar(undefined)).not.toThrow();
  });

  it('keeps the legacy showBossBanner name working', () => {
    hud.showBossBanner(boss());
    expect($('boss-banner').classList.contains('hidden')).toBe(false);
  });
});
