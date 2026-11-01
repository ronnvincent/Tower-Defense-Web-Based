// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { AchievementsUI } from '../src/ui/AchievementsUI.js';
import { ResultScreenUI } from '../src/ui/ResultScreenUI.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { getLevel } from '../src/data/levelData.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function mount() {
  document.body.innerHTML = '<div id="screen-container"></div>';
  return document.getElementById('screen-container');
}

describe('AchievementsUI', () => {
  it('renders every achievement, grouped by category', () => {
    const container = mount();
    const progress = new ProgressStore({ storage: fakeStorage() });
    const ui = new AchievementsUI(container, progress, {});
    ui.show();

    const items = container.querySelectorAll('.ach-item');
    expect(items).toHaveLength(26);
    expect(container.querySelectorAll('.ach-group')).toHaveLength(5);
    expect(container.textContent).toContain('ACHIEVEMENTS');
    expect(container.textContent).toContain('0 / 26');
  });

  it('shows progress bars for locked entries and marks claimed ones', () => {
    const container = mount();
    const progress = new ProgressStore({ storage: fakeStorage() });
    progress.trackStats({ kills: 25 });
    progress.trackStats({ kills: 0 });
    progress.syncAchievements(); // first-blood (1 kill) is now claimed
    const ui = new AchievementsUI(container, progress, {});
    ui.show();

    const hundred = container.querySelector('[data-id="hundred-cuts"]');
    expect(hundred.classList.contains('unlocked')).toBe(false);
    expect(hundred.querySelector('.ach-progress i').style.width).toBe('25%');
    expect(container.querySelector('[data-id="first-blood"]').classList.contains('unlocked')).toBe(true);
    expect(container.textContent).toContain('claimed');
  });

  it('closes through BACK and reports it', () => {
    const container = mount();
    const onClose = vi.fn();
    const ui = new AchievementsUI(container, new ProgressStore({ storage: fakeStorage() }), { onClose });
    ui.show();
    container.querySelector('#btn-achievements-back').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });
});

describe('ResultScreenUI: meta rows', () => {
  const level = getLevel('level-1');

  it('shows the daily modifier, streak and gems on a daily clear', () => {
    const container = mount();
    const ui = new ResultScreenUI(container, {});
    ui.show({
      outcome: 'victory',
      level,
      stars: 3,
      rewards: { gold: 150, gems: 1 },
      score: 2400,
      waves: 6,
      totalWaves: 6,
      timeMs: 90_000,
      daily: { modifier: { name: 'Midas Rush' }, streak: 4, gems: 4 },
      achievements: [{ id: 'first-victory', name: 'The Bastion Holds' }],
    });
    expect(container.querySelector('.result-daily').textContent).toContain('Midas Rush');
    expect(container.querySelector('.result-daily').textContent).toContain('4-day streak');
    expect(container.querySelector('.result-daily').textContent).toContain('+4');
    // The gem is a kit sprite now, not an emoji: the card may not depend on an
    // emoji font being installed.
    expect(container.querySelector('.result-daily img[src*="icon_gem"]')).not.toBeNull();
    expect(container.querySelector('.result-achievements').textContent).toContain('The Bastion Holds');
  });

  it('omits the rows on a plain campaign win', () => {
    const container = mount();
    const ui = new ResultScreenUI(container, {});
    ui.show({
      outcome: 'victory',
      level,
      stars: 2,
      rewards: { gold: 150, gems: 0 },
      score: 1200,
      waves: 6,
      totalWaves: 6,
      timeMs: 80_000,
    });
    expect(container.querySelector('.result-daily')).toBeNull();
    expect(container.querySelector('.result-achievements')).toBeNull();
  });
});
