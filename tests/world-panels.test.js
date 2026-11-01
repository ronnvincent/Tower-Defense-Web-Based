// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  championsMarkup,
  forgeMarkup,
  monumentMarkup,
  objectiveMarkup,
  recentMedalsMarkup,
} from '../src/ui/WorldPanels.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { RELICS } from '../src/data/relics.js';
import { getLandmark } from '../src/data/worldMap.js';
import { getLevel, LEVELS } from '../src/data/levelData.js';
import { ProgressStore } from '../src/systems/Progression.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const store = () => new ProgressStore({ storage: fakeStorage() });

/** No emoji in a realm panel — the buildings are art, not pictographs. */
const EMOJI = /[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}]/u;

describe('WorldPanels — the forge', () => {
  it('prints the real relic levels and the next price', () => {
    const progress = store();
    progress.profile.relics = { 'war-chest': 1 };
    progress.profile.gems = 20;
    const html = forgeMarkup({ progress, landmark: getLandmark('forge') });

    expect(html).toContain('War Chest');
    // level 1 of 3, next level costs 5 gems (data/relics.js)
    expect(html).toContain('+50 starting gold');
    expect(html).toContain('+100 starting gold');
    expect(html).toContain('wm-relic is-ready');
    expect(html).toContain('id="wm-enter"');
    expect(html).toContain('ENTER THE WORKSHOP');
  });

  it('counts owned relics out of the real total', () => {
    const progress = store();
    progress.profile.relics = { 'war-chest': 1, 'reinforced-core': 1 };
    const html = forgeMarkup({ progress, landmark: getLandmark('forge') });
    expect(html).toContain(`2 <span class="wm-of">/ ${RELICS.length}</span>`);
  });

  it('says so in words when there is nothing left to buy', () => {
    const progress = store();
    progress.profile.relics = Object.fromEntries(RELICS.map((relic) => [relic.id, relic.maxLevel]));
    const html = forgeMarkup({ progress, landmark: getLandmark('forge') });
    expect(html).toContain('nothing left to strike');
    expect(html).not.toContain('wm-relic is-ready');
  });
});

describe('WorldPanels — champions hall', () => {
  it('lists the top three runs that really finished', () => {
    const html = championsMarkup({
      landmark: getLandmark('champions'),
      records: [
        { name: 'ADA', score: 12345, waves: 12 },
        { name: 'BRYN', score: 900, waves: 7 },
        { name: 'CYRIL', score: 10, waves: 2 },
      ],
    });
    expect(html).toContain('ADA');
    expect(html).toContain('12,345');
    expect(html).toContain('BRYN');
    expect(html.match(/wm-board-row/g)).toHaveLength(3);
    expect(html).toContain('OPEN THE BOARD');
  });

  it('never invents a record for an empty board', () => {
    const html = championsMarkup({ landmark: getLandmark('champions'), records: [] });
    expect(html).toContain('No run has finished');
    expect(html).not.toContain('wm-board-row');
  });
});

describe('WorldPanels — monument', () => {
  it('separates earned medals from locked ones', () => {
    const progress = store();
    progress.profile.achievements = [ACHIEVEMENTS[0].id];
    const html = monumentMarkup({ progress, landmark: getLandmark('monument') });
    expect(html).toContain(ACHIEVEMENTS[0].name);
    expect(html).toContain(ACHIEVEMENTS[0].desc);
    expect(html).toContain(`1 <span class="wm-of">/ ${ACHIEVEMENTS.length}</span>`);
    expect(html).toContain('OPEN THE MEDALS');
  });

  it('never grants a medal', () => {
    const progress = store();
    const before = [...(progress.profile.achievements || [])];
    monumentMarkup({ progress, landmark: getLandmark('monument') });
    expect(progress.profile.achievements).toEqual(before);
  });

  it('hides the recent list when nothing is earned', () => {
    const html = monumentMarkup({ progress: store(), landmark: getLandmark('monument') });
    expect(html).toContain('Nothing carved yet');
    expect(recentMedalsMarkup(store())).toBe('');
  });
});

describe('WorldPanels — the objective', () => {
  it('names the real stage and its real starting gold', () => {
    const progress = store();
    const level = getLevel('level-1');
    const html = objectiveMarkup(level, progress);
    expect(html).toContain(level.name);
    expect(html).toContain(`${level.waves.length} waves`);
    expect(html).toContain(`${level.startingCoins} starting`);
    expect(html).toContain('MARCH ON IT');
  });

  it('has no dead button once the campaign is complete', () => {
    const html = objectiveMarkup(null, store(), { cleared: 4, total: 4 });
    expect(html).toContain('CAMPAIGN COMPLETE');
    expect(html).not.toContain('id="wm-goal"');
  });

  it('never calls an unfinished campaign complete', () => {
    // A save can be missing an unlock (reset star, imported profile). The panel
    // reads the same ledger as the fact rows, so it says "sealed", not "done".
    const html = objectiveMarkup(null, store(), { cleared: 3, total: 4 });
    expect(html).not.toContain('CAMPAIGN COMPLETE');
    expect(html).toContain('NO OPEN ROAD');
    expect(html).toContain('3 of 4');
    expect(html).not.toContain('id="wm-goal"');
  });

  it('sends the player at Endless once the campaign is done', () => {
    const level = getLevel('endless');
    expect(objectiveMarkup(level, store())).toContain('BEGIN THE SIEGE');
  });
});

describe('WorldPanels — house style', () => {
  it('uses no emoji anywhere', () => {
    const progress = store();
    progress.profile.relics = { 'war-chest': 1 };
    progress.profile.achievements = [ACHIEVEMENTS[0].id];
    const html = [
      forgeMarkup({ progress, landmark: getLandmark('forge') }),
      championsMarkup({ landmark: getLandmark('champions'), records: [{ name: 'A', score: 1, waves: 1 }] }),
      monumentMarkup({ progress, landmark: getLandmark('monument') }),
      objectiveMarkup(LEVELS[0], progress),
      recentMedalsMarkup(progress),
    ].join('');
    expect(html).not.toMatch(EMOJI);
  });
});
