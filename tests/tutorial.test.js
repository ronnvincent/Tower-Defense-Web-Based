import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TUTORIAL_BEATS,
  TUTORIAL_CAST,
  TUTORIAL_HOLD_QUIPS,
  TUTORIAL_ID,
  TUTORIAL_LINE_MS,
  SPEAKER_ACCENTS,
  VILLAGE_EXIT,
  VILLAGE_PROPS,
  VILLAGE_STAGE,
  fillName,
  needsTutorial,
  speakerFor,
  stepIndexForEvent,
} from '../src/data/tutorialScript.js';
import { createTutorialDirector, lineDwell } from '../src/systems/TutorialDirector.js';
import { TUTORIAL_LEVEL, ALL_LEVELS, getLevel } from '../src/data/levelData.js';
import { VILLAGE_PROP_ART, villageTextureKey } from '../src/systems/VillageDressing.js';

const file = (...parts) => join(...parts);

/** Width / height straight out of the PNG IHDR chunk (bytes 16..24). */
function pngSize(path) {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('the opening: who is in it', () => {
  it('fields five villagers, and none of them is a duplicate', () => {
    expect(TUTORIAL_CAST).toHaveLength(5);
    const ids = TUTORIAL_CAST.map((member) => member.id);
    expect(new Set(ids).size).toBe(ids.length);
    const roles = TUTORIAL_CAST.map((member) => member.role.toLowerCase());
    // The brief asks for distinct human characters — at minimum a child and
    // an elder — rather than five recolours of one soldier.
    expect(roles).toContain('child');
    expect(roles).toContain('elder');
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('gives every villager a sheet and a portrait that are really on disk', () => {
    for (const member of TUTORIAL_CAST) {
      const sheet = file('public', 'assets', 'units', `${member.sheet}.png`);
      const portrait = file('public', member.portrait.replace(/^\//, ''));
      expect(existsSync(sheet), `${member.sheet} missing`).toBe(true);
      expect(existsSync(portrait), `${member.portrait} missing`).toBe(true);
      // The portraits are drawn as medallions in the card; anything smaller
      // than 96 px is too soft to read at the size the CSS asks for.
      const { width, height } = pngSize(portrait);
      expect(width).toBeGreaterThanOrEqual(96);
      expect(width).toBe(height);
    }
  });

  it('declares the frame grid the sheets actually have', () => {
    for (const member of TUTORIAL_CAST) {
      const { width, height } = pngSize(file('public', 'assets', 'units', `${member.sheet}.png`));
      // Two rows: idle on row 0, walk on row 1. The walk clip starts at `cols`,
      // so a sheet narrower than two rows would animate into nothing.
      expect(width % member.frame, `${member.sheet} width`).toBe(0);
      expect(height % member.frame, `${member.sheet} height`).toBe(0);
      const cols = width / member.frame;
      const rows = height / member.frame;
      expect(cols).toBe(member.cols);
      expect(rows).toBeGreaterThanOrEqual(2);
      expect(member.idle).toBeLessThanOrEqual(cols);
      expect(member.walk).toBeLessThanOrEqual(cols);
      expect(member.scale).toBeGreaterThan(0);
    }
  });

  it('names the child as the smallest and keeps the elder close to life size', () => {
    const pip = speakerFor('pip');
    const doren = speakerFor('doren');
    const tallest = Math.max(...TUTORIAL_CAST.map((member) => member.scale));
    expect(pip.scale).toBeLessThan(doren.scale);
    expect(pip.scale).toBeLessThan(tallest);
  });

  it('has an accent colour for every speaker a line can name', () => {
    for (const beat of TUTORIAL_BEATS) {
      if (!beat.who) continue; // the closing beat is a direction, not a line
      expect(SPEAKER_ACCENTS[beat.who], `${beat.id} has no accent`).toMatch(/^#[0-9a-f]{6}$/i);
      if (beat.who !== 'narrator') expect(speakerFor(beat.who), beat.who).not.toBeNull();
    }
  });

  it('anchors every villager on the board and in the gutter they run to', () => {
    for (const member of TUTORIAL_CAST) {
      expect(VILLAGE_STAGE[member.id], `${member.id} has no stage spot`).toBeTruthy();
      expect(VILLAGE_EXIT[member.id], `${member.id} has no exit`).toBeTruthy();
      const spot = VILLAGE_STAGE[member.id];
      const exit = VILLAGE_EXIT[member.id];
      // Columns 0-1 and 30-31 are outside every legal tower square.
      expect(exit.col < 2 || exit.col > 29, `${member.id} exit col ${exit.col}`).toBe(true);
      // They walk out of the meadow, never toward the horde.
      expect(exit.row).toBeGreaterThanOrEqual(spot.row - 1);
    }
  });
});

describe('the opening: what is said', () => {
  it('opens with a narrator, then hands the scene to the villagers', () => {
    expect(TUTORIAL_BEATS[0].who).toBe('narrator');
    expect(TUTORIAL_BEATS[0].kind).toBe('line');
    expect(TUTORIAL_BEATS[1].who).not.toBe('narrator');
  });

  it('ends on a single `end` beat and teaches exactly three things', () => {
    const ends = TUTORIAL_BEATS.filter((beat) => beat.kind === 'end');
    expect(ends).toHaveLength(1);
    expect(TUTORIAL_BEATS[TUTORIAL_BEATS.length - 1].kind).toBe('end');
    const steps = TUTORIAL_BEATS.filter((beat) => beat.kind === 'step');
    expect(steps.map((step) => step.event)).toEqual(['place', 'upgrade', 'wave']);
    for (const step of steps) {
      expect(step.title.length, `${step.id} title`).toBeGreaterThan(3);
      expect(step.text.length, `${step.id} body`).toBeGreaterThan(10);
      expect(step.textMobile, `${step.id} needs a phone line`).toBeTruthy();
    }
  });

  it('puts the planting line before the build step, and the upgrade after it', () => {
    const order = TUTORIAL_BEATS.map((beat) => beat.id);
    expect(order.indexOf('doren-2')).toBeLessThan(order.indexOf('step-place'));
    expect(order.indexOf('step-place')).toBeLessThan(order.indexOf('step-upgrade'));
    expect(order.indexOf('step-upgrade')).toBeLessThan(order.indexOf('step-wave'));
  });

  it('tells the player who they are, by the name they chose', () => {
    const greeting = TUTORIAL_BEATS.find((beat) => beat.text.includes('{name}'));
    expect(greeting).toBeTruthy();
    expect(fillName(greeting.text, 'Ronan')).toContain('Ronan');
    expect(fillName(greeting.text, 'Ronan')).not.toContain('{name}');
    // A blank name falls back to the word the village would use anyway.
    expect(fillName(greeting.text, '   ')).toContain('keeper');
    expect(fillName('{name} {name}', 'A')).toBe('A A');
  });

  it('holds every line long enough to actually read it', () => {
    for (const beat of TUTORIAL_BEATS) {
      if (beat.kind !== 'line') continue;
      const dwell = lineDwell(beat.text);
      // A comfortable reading pace is ~17 characters a second. A line that is
      // still being read when it advances is a line nobody finished.
      expect(dwell, `${beat.id} is ${beat.text.length} chars`).toBeGreaterThanOrEqual(beat.text.length * 55);
      // …and the scene cannot stall on a long one.
      expect(dwell).toBeLessThanOrEqual(7000);
    }
    expect(lineDwell('short')).toBe(TUTORIAL_LINE_MS);
  });

  it('saves the crowd’s lines for after the order to fight, as toasts', () => {
    expect(TUTORIAL_HOLD_QUIPS.length).toBeGreaterThanOrEqual(2);
    for (const quip of TUTORIAL_HOLD_QUIPS) {
      expect(speakerFor(quip.who), quip.who).not.toBeNull();
      expect(quip.text.length).toBeLessThan(90);
      // Nothing in the quips may be a dialogue beat: a card over the board
      // during the first wave is how a tutorial kills a new player.
      expect(TUTORIAL_BEATS.some((beat) => beat.text === quip.text)).toBe(false);
    }
  });

  it('maps each taught event to its beat index', () => {
    expect(stepIndexForEvent('place')).toBe(TUTORIAL_BEATS.findIndex((b) => b.id === 'step-place'));
    expect(stepIndexForEvent('nonsense')).toBe(-1);
  });
});

describe('the director: a script that cannot be skipped', () => {
  const drive = (overrides = {}) => {
    const beats = overrides.beats || TUTORIAL_BEATS;
    const seen = [];
    const director = createTutorialDirector({
      beats,
      lineMs: 1000,
      name: 'Ronan',
      onBeat: (beat) => seen.push(beat.id),
      onFinish: overrides.onFinish,
    });
    return { director, seen };
  };

  it('walks the lines on its own clock and stops at a step', () => {
    const { director, seen } = drive();
    director.start();
    expect(director.beat.id).toBe('open');
    // Six lines: open, mara-1, doren-1, pip-1, bram-1, mara-2, doren-2 — then
    // the first step, where the clock stops mattering.
    for (let i = 0; i < 40; i += 1) director.tick(1000);
    expect(director.beat.id).toBe('step-place');
    expect(director.waiting).toBe(true);
    const before = seen.length;
    for (let i = 0; i < 40; i += 1) director.tick(5000);
    expect(director.beat.id).toBe('step-place');
    expect(seen.length).toBe(before);
  });

  it('refuses to advance a step on a tap', () => {
    const { director } = drive();
    director.start();
    for (let i = 0; i < 40; i += 1) director.tick(1000);
    expect(director.waiting).toBe(true);
    for (let i = 0; i < 5; i += 1) director.tap();
    expect(director.beat.id).toBe('step-place');
  });

  it('only leaves a step when the real action is reported', () => {
    const { director } = drive();
    director.start();
    for (let i = 0; i < 40; i += 1) director.tick(1000);
    director.report('upgrade'); // not what this step asked for
    expect(director.beat.id).toBe('step-place');
    director.report('place');
    expect(director.beat.id).toBe('mara-3');
  });

  it('remembers an action performed before its step came up', () => {
    const { director } = drive();
    director.start();
    director.report('place'); // an eager builder, mid-conversation
    for (let i = 0; i < 400 && !director.waiting && !director.finished; i += 1) director.tick(1000);
    // The place step is skipped, not re-shown: the player already built.
    expect(director.beat.id).toBe('step-upgrade');
  });

  it('finishes once, and only after the last beat', () => {
    let finishes = 0;
    const { director } = drive({ onFinish: () => (finishes += 1) });
    director.start();
    for (let i = 0; i < 200 && !director.finished; i += 1) {
      director.tick(1000);
      director.report(director.beat?.event || 'unit');
    }
    // The step events in script order, driven by a player who does them.
    for (const event of ['place', 'upgrade', 'wave']) director.report(event);
    for (let i = 0; i < 200 && !director.finished; i += 1) director.tick(1000);
    expect(director.finished).toBe(true);
    expect(finishes).toBe(1);
    expect(director.beat).toBeNull();
    expect(director.text()).toBe('');
  });

  it('never rewinds: a repeated report cannot move the script backwards', () => {
    const { director } = drive();
    director.start();
    for (let i = 0; i < 40; i += 1) director.tick(1000);
    director.report('place');
    const after = director.index;
    director.report('place');
    expect(director.index).toBe(after);
  });

  it('has no way to skip', () => {
    const { director } = drive();
    expect(director.skip).toBeUndefined();
    expect(director.stop).toBeUndefined();
    expect(director.dismiss).toBeUndefined();
  });
});

describe('when the opening is played', () => {
  it('is a real level in the tutorial slot', () => {
    expect(TUTORIAL_LEVEL.id).toBe(TUTORIAL_ID);
    expect(TUTORIAL_LEVEL.tutorial).toBe(true);
    expect(getLevel('tutorial')).toBe(TUTORIAL_LEVEL);
    // It is a story beat, not a campaign node: it must never show up on the map
    // or in the unlock chain.
    expect(ALL_LEVELS.map((level) => level.id)).not.toContain('tutorial');
  });

  it('is short enough to be a two-minute opening', () => {
    const lines = TUTORIAL_BEATS.filter((beat) => beat.kind === 'line').length;
    const reading = (lines * TUTORIAL_LINE_MS) / 1000;
    // The spoken part alone cannot eat the whole budget: the three guided steps
    // and one fight have to fit inside the same couple of minutes.
    expect(reading).toBeLessThanOrEqual(70);
  });

  it('runs a gentle first fight and nothing else', () => {
    expect(TUTORIAL_LEVEL.waves).toHaveLength(2);
    expect(TUTORIAL_LEVEL.baseHealth).toBeGreaterThanOrEqual(20);
    expect(TUTORIAL_LEVEL.startingCoins).toBeGreaterThanOrEqual(300);
    expect(TUTORIAL_LEVEL.enemyHealthScale).toBeLessThan(1);
    expect(TUTORIAL_LEVEL.reward).toEqual({ gold: 0, gems: 0 });
    // No powerups and no blessings: the opening teaches three buttons, not ten.
    expect(TUTORIAL_LEVEL.rules.powerups).toBe(false);
    expect(TUTORIAL_LEVEL.rules.blessings).toBe(false);
  });

  it('shows new players the opening and leaves every existing save alone', () => {
    expect(needsTutorial(null)).toBe(false);
    expect(needsTutorial({})).toBe(false);
    expect(needsTutorial({ stars: {}, tutorialDone: false })).toBe(true);
    expect(needsTutorial({ stars: {}, tutorialDone: true })).toBe(false);
    // A save that predates the feature has stars but no flag: playing for a
    // year must not dump somebody back into a tutorial.
    expect(needsTutorial({ stars: { 'level-1': 3 } })).toBe(false);
    expect(needsTutorial({ stars: { 'level-1': 1 }, tutorialDone: true })).toBe(false);
  });
});

describe('the opening: set dressing', () => {
  it('has art for every prop it places, and places every prop it has art for', () => {
    const used = new Set(VILLAGE_PROPS.map((prop) => prop.key));
    const art = new Set(Object.keys(VILLAGE_PROP_ART));
    for (const key of used) expect(art.has(key), `${key} has no art`).toBe(true);
    for (const key of art) expect(used.has(key), `${key} is never placed`).toBe(true);
  });

  it('points at PNGs that exist', () => {
    for (const [key, path] of Object.entries(VILLAGE_PROP_ART)) {
      expect(existsSync(file('public', path)), `${key} -> ${path}`).toBe(true);
      expect(villageTextureKey(key)).toBe(`village-${key}`);
    }
  });

  it('keeps the meadow clear and everything on the ground', () => {
    for (const prop of VILLAGE_PROPS) {
      expect(prop.col, `${prop.key} col`).toBeGreaterThan(0);
      expect(prop.col, `${prop.key} col`).toBeLessThan(32);
      expect(prop.row, `${prop.key} row`).toBeGreaterThan(0);
      expect(prop.row, `${prop.key} row`).toBeLessThanOrEqual(12);
      if (prop.scale !== undefined) expect(prop.scale).toBeGreaterThan(0.4);
    }
    // The build field is rows 5..10 across the meadow: nothing may stand in it.
    const inField = VILLAGE_PROPS.filter((prop) => prop.row > 5.2 && prop.row < 10.5 && prop.col > 2 && prop.col < 30);
    expect(inField.map((prop) => prop.key)).toEqual([]);
  });
});
