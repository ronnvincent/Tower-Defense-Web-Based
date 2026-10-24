// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevelSelectUI } from '../src/ui/LevelSelectUI.js';
import { ResultScreenUI } from '../src/ui/ResultScreenUI.js';
import { ProgressStore } from '../src/systems/Progression.js';
import { getLevel, ENDLESS_LEVEL } from '../src/data/levelData.js';

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

describe('LevelSelectUI', () => {
  let store;
  let select;
  let onSelectLevel;
  let onClose;

  beforeEach(() => {
    store = new ProgressStore({ storage: fakeStorage() });
    onSelectLevel = vi.fn();
    onClose = vi.fn();
    select = new LevelSelectUI(container(), store, { onSelectLevel, onClose });
    select.show();
  });

  it('renders one node per campaign level plus Endless Siege', () => {
    const nodes = [...document.querySelectorAll('.level-node')];
    expect(nodes.map((n) => n.dataset.level)).toEqual(['level-1', 'level-2', 'level-3', 'endless']);
    expect(document.querySelector('.overlay-title').textContent).toBe('CHOOSE YOUR BATTLE');
  });

  it('locks every node that has not been unlocked and shows the padlock', () => {
    expect(document.querySelector('[data-level="level-1"]').disabled).toBe(false);
    for (const id of ['level-2', 'level-3', 'endless']) {
      const node = document.querySelector(`[data-level="${id}"]`);
      expect(node.disabled).toBe(true);
      expect(node.getAttribute('aria-disabled')).toBe('true');
      expect(node.querySelector('.node-lock')).not.toBeNull();
    }
  });

  it('uses the generated minimap for each theme', () => {
    expect(document.querySelector('[data-level="level-1"] .node-art').style.backgroundImage).toContain(
      'map_grassland.png'
    );
    expect(document.querySelector('[data-level="level-2"] .node-art').style.backgroundImage).toContain(
      'map_desert.png'
    );
    expect(document.querySelector('[data-level="level-3"] .node-art').style.backgroundImage).toContain(
      'map_ice.png'
    );
    expect(document.querySelector('[data-level="endless"] .node-art').style.backgroundImage).toContain(
      'map_volcanic.png'
    );
  });

  it('selecting an open node reports its id, a locked node reports nothing', () => {
    document.querySelector('[data-level="level-1"]').click();
    expect(onSelectLevel).toHaveBeenCalledWith('level-1');

    document.querySelector('[data-level="level-2"]').click();
    expect(onSelectLevel).toHaveBeenCalledTimes(1);
  });

  it('shows earned stars and unlocks the next node after a victory', () => {
    store.recordVictory(getLevel('level-1'), { baseHealth: 25, maxBaseHealth: 25, score: 900 });
    select.render();

    const first = document.querySelector('[data-level="level-1"]');
    expect(first.querySelectorAll('.star.earned')).toHaveLength(3);
    expect(first.querySelector('.node-lock')).toBeNull();
    expect(document.querySelector('[data-level="level-2"]').disabled).toBe(false);
    expect(document.querySelector('[data-level="endless"]').disabled).toBe(false);
  });

  it('back button closes the overlay and reports it', () => {
    document.getElementById('btn-level-back').click();
    expect(onClose).toHaveBeenCalled();
    expect(select.visible).toBe(false);
    expect(document.getElementById('level-select')).toBeNull();
  });
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
  it('mounts on its own layer between the HUD and the modal dialogs', async () => {
    const { readFileSync } = await import('node:fs');
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
