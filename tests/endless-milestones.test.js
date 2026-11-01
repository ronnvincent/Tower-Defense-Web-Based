// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  ENDLESS_MILESTONES,
  MILESTONE_WAVES,
  isRecordWave,
  milestoneAt,
  milestoneGems,
  milestoneGold,
  milestoneLabel,
  milestonesBetween,
  nextMilestone,
  wavesToNextMilestone,
} from '../src/systems/EndlessMilestones.js';
import { HUD } from '../src/ui/HUD.js';

/**
 * Endless checkpoints and the record marker.
 *
 * Endless has no finish line, so the milestone table *is* its pacing: if the
 * spacing or the payout curve drifts, the mode quietly becomes a grind. The
 * record marker is the other half — it is the only place the game says "you are
 * past your own best".
 */

describe('EndlessMilestones: table', () => {
  it('pays every 5 waves to 50, then every 10 to 100', () => {
    expect(MILESTONE_WAVES.slice(0, 10)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(MILESTONE_WAVES.slice(10)).toEqual([60, 70, 80, 90, 100]);
    expect(MILESTONE_WAVES.every((w, i) => i === 0 || w > MILESTONE_WAVES[i - 1])).toBe(true);
  });

  it('grows gold with depth but sub-linearly, and caps gems', () => {
    expect(milestoneGold(10)).toBeGreaterThan(milestoneGold(5));
    // Linear in the wave number (30 + 6w), i.e. no runaway multiplier at depth.
    expect(milestoneGold(100)).toBe(30 + 6 * 100);
    expect(milestoneGold(100) / milestoneGold(10)).toBeLessThan(10);
    expect(milestoneGems(5)).toBe(1);
    expect(milestoneGems(25)).toBe(2);
    expect(milestoneGems(100)).toBe(5);
    for (const m of ENDLESS_MILESTONES) {
      expect(m.gold).toBeGreaterThan(0);
      expect(m.gems).toBeGreaterThan(0);
      expect(m.gems).toBeLessThanOrEqual(5);
    }
  });

  it('finds the checkpoint on a wave, and nothing between', () => {
    expect(milestoneAt(10)).toMatchObject({ wave: 10 });
    expect(milestoneAt(11)).toBeNull();
    expect(milestoneAt('25')).toMatchObject({ wave: 25 });
    expect(milestoneAt(undefined)).toBeNull();
  });

  it('reports only the checkpoints actually crossed', () => {
    expect(milestonesBetween(0, 5).map((m) => m.wave)).toEqual([5]);
    expect(milestonesBetween(5, 5)).toEqual([]);
    expect(milestonesBetween(4, 11).map((m) => m.wave)).toEqual([5, 10]);
    expect(milestonesBetween(50, 60).map((m) => m.wave)).toEqual([60]);
    expect(milestonesBetween(60, 5)).toEqual([]);
  });

  it('points at the next checkpoint', () => {
    expect(nextMilestone(0)?.wave).toBe(5);
    expect(nextMilestone(7)?.wave).toBe(10);
    expect(nextMilestone(99)?.wave).toBe(100);
    expect(nextMilestone(100)).toBeNull();
    expect(wavesToNextMilestone(7)).toBe(3);
    expect(wavesToNextMilestone(100)).toBeNull();
  });

  it('formats a toast line', () => {
    expect(milestoneLabel(milestoneAt(10))).toBe('WAVE 10 · +90g +1💎');
    expect(milestoneLabel(null)).toBe('');
  });

  it('knows when the run passes the personal best', () => {
    expect(isRecordWave(9, 8)).toBe(true);
    expect(isRecordWave(8, 8)).toBe(false);
    expect(isRecordWave(3, 0)).toBe(true);
    expect(isRecordWave(0, 12)).toBe(false);
  });
});

describe('HUD: endless best-wave marker', () => {
  function mountHud() {
    document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
    return new HUD(document.getElementById('hud-container'), {});
  }

  const base = {
    baseHealth: 20,
    maxBaseHealth: 20,
    coins: 100,
    score: 0,
    waveNumber: 6,
    totalWaves: 6,
    enemiesRemaining: 3,
    canStartWave: false,
    isSpawning: false,
    isPaused: false,
  };

  const mark = () => document.getElementById('val-endless-best');

  it('stays hidden outside endless and before any record exists', () => {
    const hud = mountHud();
    hud.update({ ...base, endless: false, bestWave: 12 });
    expect(mark().classList.contains('hidden')).toBe(true);
    hud.update({ ...base, endless: true, bestWave: 0 });
    expect(mark().classList.contains('hidden')).toBe(true);
  });

  it('shows the stored best, then flips to NEW BEST once passed', () => {
    const hud = mountHud();
    hud.update({ ...base, endless: true, waveNumber: 7, bestWave: 12 });
    expect(mark().classList.contains('hidden')).toBe(false);
    expect(mark().textContent).toBe('BEST 12');
    expect(mark().classList.contains('record')).toBe(false);

    hud.update({ ...base, endless: true, waveNumber: 13, bestWave: 12 });
    expect(mark().textContent).toBe('NEW BEST · 13');
    expect(mark().classList.contains('record')).toBe(true);
  });
});
