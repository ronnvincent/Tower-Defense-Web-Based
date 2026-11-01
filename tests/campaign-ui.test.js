// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ResultScreenUI } from '../src/ui/ResultScreenUI.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { getLevel, LEVELS, ENDLESS_LEVEL } from '../src/data/levelData.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const container = () => document.getElementById('modal-container');

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-container"></div>';
});

describe('ResultScreenUI', () => {
  const victory = () => ({
    outcome: 'victory',
    level: getLevel('level-1'),
    stars: 2,
    rewards: { gold: 150, gems: 4 },
    unlocked: 'level-2',
    score: 780,
    waves: 6,
    totalWaves: 6,
    timeMs: 125000,
  });

  it('renders the star rating, rewards and the unlock line on a win', () => {
    const ui = new ResultScreenUI(container());
    ui.show(victory());

    const stars = [...document.querySelectorAll('.result-star')];
    expect(stars).toHaveLength(3);
    expect(stars.filter((s) => s.classList.contains('earned'))).toHaveLength(2);
    expect(stars[1].getAttribute('src')).toContain('star_gold.png');
    expect(stars[2].getAttribute('src')).toContain('star_empty.png');
    expect(document.querySelector('.result-ribbon').textContent).toBe('VICTORY');
    expect(document.querySelector('.result-rewards').textContent).toContain('+150');
    expect(document.querySelector('.result-unlock').textContent).toContain('SUNSCORCH MESA');
    expect(document.querySelector('.result-stats').textContent).toContain('6 / 6');
  });

  it('offers Next Level only when there is a next level, and replays the current one', () => {
    const onNext = vi.fn();
    const onReplay = vi.fn();
    const ui = new ResultScreenUI(container(), { onNext, onReplay });
    ui.show(victory());

    document.getElementById('result-next').click();
    document.getElementById('result-replay').click();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(document.getElementById('result-replay').textContent).toBe('REPLAY');
  });

  it('a defeat shows the retry path and no star rating', () => {
    const ui = new ResultScreenUI(container());
    ui.show({
      outcome: 'defeat',
      level: getLevel('level-2'),
      score: 120,
      waves: 3,
      totalWaves: 7,
      timeMs: 42000,
    });

    expect(document.querySelector('.result-ribbon').textContent).toBe('DEFEAT');
    expect(document.getElementById('result-next')).toBeNull();
    expect(document.getElementById('result-replay').textContent).toBe('RETRY');
    expect(document.querySelector('.defeat-mark')).not.toBeNull();
    expect(document.querySelectorAll('.result-star')).toHaveLength(0);
  });

  it('an endless run reports the wave reached and the record', () => {
    const ui = new ResultScreenUI(container());
    ui.show({
      outcome: 'defeat',
      level: ENDLESS_LEVEL,
      score: 4300,
      waves: 7,
      wave: 7,
      bestWave: 9,
      newRecord: false,
      timeMs: 600000,
    });

    expect(document.querySelector('.result-stats').textContent).toContain('WAVE REACHED');
    expect(document.querySelector('.result-stats').textContent).toContain('9');
    expect(document.getElementById('result-next')).toBeNull();
    expect(document.querySelector('.result-unlock').textContent).toContain('horde keeps coming');
  });

  it('hides cleanly and forgets the last result', () => {
    const ui = new ResultScreenUI(container());
    ui.show(victory());
    ui.hide();
    expect(document.getElementById('result-screen')).toBeNull();
    expect(ui.result).toBeNull();
  });
});

describe('campaign screen layer', () => {
  it('mounts on its own layer between the HUD and the modal dialogs', () => {
    const html = readFileSync('index.html', 'utf8');
    const css = readFileSync('src/style.css', 'utf8');

    const screens = html.indexOf('id="screen-container"');
    const modals = html.indexOf('id="modal-container"');
    expect(screens).toBeGreaterThan(-1);
    expect(screens).toBeLessThan(modals); // layered before the modal container

    const zIndex = (selector) => {
      const block = new RegExp(`${selector} \\{[^}]*\\}`).exec(css);
      return Number(/z-index:\s*(\d+)/.exec(block[0])[1]);
    };
    expect(zIndex('#screen-container')).toBeGreaterThan(zIndex('#hud-container'));
    expect(zIndex('#screen-container')).toBeLessThan(zIndex('#modal-container'));
  });

  it('keeps a tall overlay reachable on a short landscape phone', () => {
    // A centred flex item taller than its scroll container clips the top in
    // every browser; `margin: auto` is what makes it start at the top instead.
    const css = readFileSync('src/style.css', 'utf8');
    const block = (selector) => new RegExp(`${selector} \\{[^}]*\\}`).exec(css)[0];
    const screen = block('\\.overlay-screen');
    const shell = block('\\.overlay-shell');

    expect(screen).toMatch(/inset:\s*0/);
    expect(screen).toMatch(/overflow:\s*auto/);
    expect(screen).toMatch(/pointer-events:\s*auto/); // the battlefield below stays dead
    expect(shell).toMatch(/margin:\s*auto/);
    expect(shell).toMatch(/max-height:\s*100%/);
  });

  it('survives another UI replacing the modal container', () => {
    document.body.innerHTML =
      '<div id="screen-container"></div><div id="modal-container"></div>';
    const result = new ResultScreenUI(document.getElementById('screen-container'));
    result.show({
      outcome: 'victory',
      level: getLevel('level-1'),
      stars: 3,
      rewards: { gold: 150, gems: 5 },
      score: 900,
      waves: 6,
      totalWaves: 6,
      timeMs: 90000,
    });

    document.getElementById('modal-container').innerHTML = '<div id="leaderboard-modal"></div>';
    expect(document.getElementById('result-screen')).not.toBeNull();
    expect(document.getElementById('result-next')).not.toBeNull();
  });
});

describe('result screen announcements', () => {
  function showResult(payload) {
    document.body.innerHTML = '<div id="screen-container"></div>';
    const ui = new ResultScreenUI(document.getElementById('screen-container'));
    ui.show({
      score: 1000,
      waves: 6,
      totalWaves: 6,
      timeMs: 120000,
      stars: 2,
      rewards: { gold: 150, gems: 4 },
      ...payload,
    });
    return ui;
  }

  it('announces level 2 and Endless Siege when one clear opens both', () => {
    const ui = showResult({
      outcome: 'victory',
      level: getLevel('level-1'),
      unlockedAll: ['level-2', 'endless'],
    });
    const lines = [...document.querySelectorAll('#result-screen .result-unlock')].map((el) => el.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('SUNSCORCH MESA');
    expect(lines[1]).toContain('ENDLESS SIEGE');
    const next = document.querySelector('#result-next');
    expect(next).not.toBeNull();
    next.click();
    ui.hide();
    expect(document.getElementById('result-screen')).toBeNull();
  });

  it('falls back to the single unlocked id and never prints "A new battle" for it', () => {
    showResult({ outcome: 'victory', level: getLevel('level-1'), unlocked: 'level-2' });
    const line = document.querySelector('#result-screen .result-unlock');
    expect(line.textContent).toContain('SUNSCORCH MESA');
  });

  it('shouts about a new best rating only when a replay actually improves it', () => {
    showResult({ outcome: 'victory', level: getLevel('level-1'), stars: 3, previousStars: 2 });
    expect(document.querySelector('#result-screen .result-record').textContent).toContain('2★ → 3★');

    showResult({ outcome: 'victory', level: getLevel('level-1'), stars: 3, previousStars: 3 });
    expect(document.querySelector('#result-screen .result-record')).toBeNull();

    // A first clear is obvious from the stars; no "0★ → 3★" noise.
    showResult({ outcome: 'victory', level: getLevel('level-1'), stars: 3, previousStars: 0 });
    expect(document.querySelector('#result-screen .result-record')).toBeNull();
  });

  it('celebrates a finished campaign on the last level and drops the NEXT button', () => {
    showResult({ outcome: 'victory', level: getLevel(LEVELS[LEVELS.length - 1].id) });
    expect(document.querySelector('#result-next')).toBeNull();
    expect(document.querySelector('#result-screen .result-unlock').textContent).toContain('CAMPAIGN COMPLETE');
  });
});
